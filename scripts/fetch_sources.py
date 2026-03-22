#!/usr/bin/env python3
"""Fetch agent engineering content from free public sources.

Sources:
  - Engineering blogs (Anthropic, OpenAI, LangChain, etc.) via RSS/Atom feeds
  - Hacker News via Algolia API (free, no auth)
  - GitHub releases via API (free for public repos, no auth needed)

Outputs structured JSON to stdout for Claude to evaluate.
No API keys required.
"""

import json
import os
import re
import sys
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
CONFIG_PATH = SCRIPT_DIR / "sources.json"
SEEN_PATH = SCRIPT_DIR / ".seen_source_ids.json"

# How far back to look (days)
LOOKBACK_DAYS = int(os.environ.get("LOOKBACK_DAYS", "7"))


def load_config():
    with open(CONFIG_PATH) as f:
        return json.load(f)


def load_seen_ids():
    if SEEN_PATH.exists():
        with open(SEEN_PATH) as f:
            return set(json.load(f))
    return set()


def save_seen_ids(seen):
    with open(SEEN_PATH, "w") as f:
        json.dump(sorted(seen), f)


def http_get(url, headers=None):
    req = urllib.request.Request(url)
    req.add_header("User-Agent", "agent-learnings-digest/1.0")
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.read()
    except Exception as e:
        print(f"Fetch error for {url}: {e}", file=sys.stderr)
        return None


def parse_rss_atom(xml_bytes, source_name):
    """Parse RSS or Atom feed, return list of entries."""
    if not xml_bytes:
        return []

    entries = []
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as e:
        print(f"XML parse error for {source_name}: {e}", file=sys.stderr)
        return []

    ns = {"atom": "http://www.w3.org/2005/Atom"}

    # Try Atom format
    for entry in root.findall(".//atom:entry", ns):
        title = entry.findtext("atom:title", "", ns).strip()
        link_el = entry.find("atom:link[@rel='alternate']", ns)
        if link_el is None:
            link_el = entry.find("atom:link", ns)
        link = link_el.get("href", "") if link_el is not None else ""
        published = entry.findtext("atom:published", "", ns) or entry.findtext(
            "atom:updated", "", ns
        )
        summary = entry.findtext("atom:summary", "", ns).strip()

        entries.append(
            {
                "id": f"blog:{link}",
                "source": source_name,
                "type": "blog",
                "title": title,
                "url": link,
                "published": published,
                "summary": summary[:500] if summary else "",
            }
        )

    # Try RSS format
    for item in root.findall(".//item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        published = (item.findtext("pubDate") or "").strip()
        description = (item.findtext("description") or "").strip()

        entries.append(
            {
                "id": f"blog:{link}",
                "source": source_name,
                "type": "blog",
                "title": title,
                "url": link,
                "published": published,
                "summary": description[:500] if description else "",
            }
        )

    return entries


class LinkExtractor(HTMLParser):
    """Extract links with text from HTML, for scraping blogs without RSS."""

    def __init__(self):
        super().__init__()
        self.links = []
        self._current_href = None
        self._current_text = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            href = dict(attrs).get("href", "")
            self._current_href = href
            self._current_text = []

    def handle_data(self, data):
        if self._current_href is not None:
            self._current_text.append(data.strip())

    def handle_endtag(self, tag):
        if tag == "a" and self._current_href:
            text = " ".join(self._current_text).strip()
            if text:
                self.links.append((self._current_href, text))
            self._current_href = None
            self._current_text = []


def scrape_blog_links(html_url, source_name):
    """Scrape blog listing page for post links (fallback when no RSS)."""
    print(f"Scraping HTML: {source_name}...", file=sys.stderr)
    raw = http_get(html_url)
    if not raw:
        return []

    html = raw.decode("utf-8", errors="replace")
    parser = LinkExtractor()
    parser.feed(html)

    entries = []
    seen_urls = set()
    for href, text in parser.links:
        # Resolve relative URLs
        if href.startswith("/"):
            from urllib.parse import urlparse
            parsed = urlparse(html_url)
            href = f"{parsed.scheme}://{parsed.netloc}{href}"

        # Filter for blog post links (heuristic: path has /engineering/ or
        # /research/ or /blog/ segments, and the link text is long enough
        # to be a title)
        if len(text) < 15:
            continue
        if href in seen_urls:
            continue

        # Match common blog post URL patterns
        post_patterns = [
            r"/engineering/[^/]+$",
            r"/research/[^/]+$",
            r"/blog/[^/]+$",
            r"/index/[^/]+/?$",
        ]
        if not any(re.search(p, href) for p in post_patterns):
            continue

        seen_urls.add(href)
        entries.append(
            {
                "id": f"blog:{href}",
                "source": source_name,
                "type": "blog",
                "title": text,
                "url": href,
                "published": "",  # can't get date from scraping
                "summary": "",
            }
        )

    return entries


def fetch_blog_entries(blogs, cutoff):
    """Fetch entries from RSS/Atom feeds, falling back to HTML scraping."""
    entries = []
    for blog in blogs:
        feed_url = blog.get("feed_url")
        if feed_url:
            print(f"Fetching feed: {blog['name']}...", file=sys.stderr)
            xml = http_get(feed_url)
            entries.extend(parse_rss_atom(xml, blog["name"]))
        elif blog.get("html_url"):
            entries.extend(scrape_blog_links(blog["html_url"], blog["name"]))
    return entries


def fetch_hacker_news(config, cutoff):
    """Search Hacker News via Algolia API (free, no auth)."""
    entries = []
    hn = config.get("hacker_news", {})
    base_url = hn.get("search_url", "https://hn.algolia.com/api/v1/search_by_date")
    min_points = hn.get("min_points", 20)
    cutoff_ts = int(cutoff.timestamp())

    for query in hn.get("queries", []):
        params = {
            "query": query,
            "tags": "story",
            "numericFilters": f"points>{min_points},created_at_i>{cutoff_ts}",
            "hitsPerPage": 30,
        }
        url = f"{base_url}?{urllib.parse.urlencode(params)}"
        print(f"Searching HN: {query}...", file=sys.stderr)
        raw = http_get(url)
        if not raw:
            continue

        data = json.loads(raw)
        for hit in data.get("hits", []):
            story_url = hit.get("url") or f"https://news.ycombinator.com/item?id={hit['objectID']}"
            entries.append(
                {
                    "id": f"hn:{hit['objectID']}",
                    "source": "Hacker News",
                    "type": "discussion",
                    "title": hit.get("title", ""),
                    "url": story_url,
                    "hn_url": f"https://news.ycombinator.com/item?id={hit['objectID']}",
                    "published": hit.get("created_at", ""),
                    "points": hit.get("points", 0),
                    "comments": hit.get("num_comments", 0),
                    "summary": "",
                }
            )

    return entries


def fetch_github_releases(repos, cutoff):
    """Fetch recent releases from GitHub repos (free, no auth for public repos)."""
    entries = []
    for repo_config in repos:
        repo = repo_config["repo"]
        print(f"Checking releases: {repo}...", file=sys.stderr)
        url = f"https://api.github.com/repos/{repo}/releases?per_page=5"
        raw = http_get(url, {"Accept": "application/vnd.github.v3+json"})
        if not raw:
            continue

        releases = json.loads(raw)
        for rel in releases:
            entries.append(
                {
                    "id": f"gh:{repo}:{rel.get('tag_name', '')}",
                    "source": f"GitHub: {repo}",
                    "type": "release",
                    "title": f"{repo} {rel.get('tag_name', '')} — {rel.get('name', '')}",
                    "url": rel.get("html_url", ""),
                    "published": rel.get("published_at", ""),
                    "summary": (rel.get("body") or "")[:1000],
                }
            )

    return entries


def is_recent(entry, cutoff):
    """Check if entry is newer than cutoff. Lenient parsing."""
    published = entry.get("published", "")
    if not published:
        return True  # include if we can't tell

    try:
        # Try ISO format
        dt = datetime.fromisoformat(published.replace("Z", "+00:00"))
        return dt > cutoff
    except ValueError:
        pass

    try:
        # Try RFC 2822 (RSS pubDate)
        from email.utils import parsedate_to_datetime
        dt = parsedate_to_datetime(published)
        return dt > cutoff
    except (ValueError, TypeError):
        pass

    return True  # include if unparseable


def is_relevant(entry):
    """Basic relevance filter on title/summary."""
    text = (entry.get("title", "") + " " + entry.get("summary", "")).lower()
    keywords = [
        "agent", "agentic", "harness", "coding assistant", "claude code",
        "codex", "tool use", "function calling", "prompt caching",
        "context window", "multi-agent", "orchestrat", "skill",
        "long-running", "autonomous", "benchmark", "eval",
    ]
    return any(kw in text for kw in keywords)


def main():
    config = load_config()
    seen_ids = load_seen_ids()
    cutoff = datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)

    all_entries = []

    # 1. Blog feeds
    all_entries.extend(fetch_blog_entries(config.get("blogs", []), cutoff))

    # 2. Hacker News
    all_entries.extend(fetch_hacker_news(config, cutoff))

    # 3. GitHub releases
    all_entries.extend(fetch_github_releases(config.get("github_repos", []), cutoff))

    # 4. Dedup (multiple HN queries can match the same story)
    deduped = {}
    for e in all_entries:
        if e["id"] not in deduped:
            deduped[e["id"]] = e
    all_entries = list(deduped.values())

    # 5. Filter by recency and seen status
    entries = [e for e in all_entries if e["id"] not in seen_ids]
    entries = [e for e in entries if is_recent(e, cutoff)]

    # Sort: blogs first (highest signal), then HN by points
    entries.sort(
        key=lambda e: (
            0 if e["type"] == "blog" else 1 if e["type"] == "release" else 2,
            -(e.get("points", 0)),
        )
    )

    # 5. Update seen IDs
    new_seen = seen_ids | {e["id"] for e in entries}
    save_seen_ids(new_seen)

    # 6. Cap per type to ensure mix in output
    blogs = [e for e in entries if e["type"] == "blog"][:20]
    releases = [e for e in entries if e["type"] == "release"][:10]
    discussions = [e for e in entries if e["type"] == "discussion"][:20]
    capped = blogs + releases + discussions

    # 7. Output
    output = {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "lookback_days": LOOKBACK_DAYS,
        "total_entries": len(capped),
        "by_type": {
            "blog": len(blogs),
            "release": len(releases),
            "discussion": len(discussions),
        },
        "entries": capped,
    }

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()

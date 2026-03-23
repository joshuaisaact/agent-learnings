#!/usr/bin/env tsx
/**
 * Fetch agent engineering content from free public sources.
 *
 * Sources:
 *   - Engineering blogs via RSS/Atom feeds
 *   - Hacker News via Algolia API (free, no auth)
 *   - GitHub releases via API (free for public repos, no auth)
 *
 * Outputs structured JSON to stdout for Claude to evaluate.
 * No API keys required.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(SCRIPT_DIR, "sources.json");
const SEEN_PATH = join(SCRIPT_DIR, ".seen_source_ids.json");

const LOOKBACK_DAYS = Number(process.env["LOOKBACK_DAYS"] ?? "7");

// --- Types ---

interface BlogConfig {
  name: string;
  feed_url: string | null;
  html_url?: string;
}

interface HackerNewsConfig {
  search_url?: string;
  queries: string[];
  min_points: number;
}

interface RepoConfig {
  repo: string;
  watch: string;
}

interface SourcesConfig {
  blogs: BlogConfig[];
  hacker_news: HackerNewsConfig;
  github_repos: RepoConfig[];
}

interface Entry {
  id: string;
  source: string;
  type: "blog" | "release" | "discussion";
  title: string;
  url: string;
  published: string;
  summary: string;
  hn_url?: string;
  points?: number;
  comments?: number;
}

// --- Config & state ---

function loadConfig(): SourcesConfig {
  return JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as SourcesConfig;
}

function loadSeenIds(): Set<string> {
  if (!existsSync(SEEN_PATH)) return new Set();
  const data = JSON.parse(readFileSync(SEEN_PATH, "utf-8")) as string[];
  return new Set(data);
}

function saveSeenIds(seen: Set<string>): void {
  writeFileSync(SEEN_PATH, JSON.stringify([...seen].sort()));
}

// --- HTTP ---

async function httpGet(url: string, headers?: Record<string, string>): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "agent-learnings-digest/1.0",
        ...headers,
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) {
      console.error(`Fetch error for ${url}: ${resp.status} ${resp.statusText}`);
      return null;
    }
    return await resp.text();
  } catch (err) {
    console.error(`Fetch error for ${url}: ${err}`);
    return null;
  }
}

// --- XML parsing (minimal, no dependencies) ---

/**
 * Extract tag content from XML using regex. Not a full parser,
 * but sufficient for RSS/Atom feeds which have predictable structure.
 */
function extractTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match?.[1]?.trim() ?? "";
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']*)["']`, "i"));
  return match?.[1] ?? "";
}

function parseRssAtom(xml: string | null, sourceName: string): Entry[] {
  if (!xml) return [];
  const entries: Entry[] = [];

  // Atom entries
  const atomEntries = xml.matchAll(/<entry[\s>]([\s\S]*?)<\/entry>/gi);
  for (const [, content] of atomEntries) {
    if (!content) continue;
    const title = extractTag(content, "title");
    const link =
      extractAttr(content, "link[^>]*rel=[\"']alternate[\"']", "href") ||
      extractAttr(content, "link", "href");
    const published = extractTag(content, "published") || extractTag(content, "updated");
    const summary = extractTag(content, "summary");

    entries.push({
      id: `blog:${link}`,
      source: sourceName,
      type: "blog",
      title,
      url: link,
      published,
      summary: summary.slice(0, 500),
    });
  }

  // RSS items
  const rssItems = xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi);
  for (const [, content] of rssItems) {
    if (!content) continue;
    const title = extractTag(content, "title");
    const link = extractTag(content, "link");
    const published = extractTag(content, "pubDate");
    const description = extractTag(content, "description");

    entries.push({
      id: `blog:${link}`,
      source: sourceName,
      type: "blog",
      title,
      url: link,
      published,
      summary: description.slice(0, 500),
    });
  }

  return entries;
}

// --- HTML scraping ---

function extractLinks(html: string): Array<{ href: string; text: string }> {
  const links: Array<{ href: string; text: string }> = [];
  const matches = html.matchAll(/<a\s[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi);
  for (const [, href, rawText] of matches) {
    if (!href || !rawText) continue;
    const text = rawText.replace(/<[^>]*>/g, "").trim();
    if (text) links.push({ href, text });
  }
  return links;
}

const POST_PATTERNS = [
  /\/engineering\/[^/]+$/,
  /\/research\/[^/]+$/,
  /\/blog\/[^/]+$/,
  /\/index\/[^/]+\/?$/,
];

async function scrapeBlogLinks(htmlUrl: string, sourceName: string): Promise<Entry[]> {
  console.error(`Scraping HTML: ${sourceName}...`);
  const html = await httpGet(htmlUrl);
  if (!html) return [];

  const entries: Entry[] = [];
  const seenUrls = new Set<string>();
  const { protocol, host } = new URL(htmlUrl);

  for (const { href: rawHref, text } of extractLinks(html)) {
    let href = rawHref;
    if (href.startsWith("/")) {
      href = `${protocol}//${host}${href}`;
    }

    if (text.length < 15) continue;
    if (seenUrls.has(href)) continue;
    if (!POST_PATTERNS.some((p) => p.test(href))) continue;

    seenUrls.add(href);
    entries.push({
      id: `blog:${href}`,
      source: sourceName,
      type: "blog",
      title: text,
      url: href,
      published: "",
      summary: "",
    });
  }

  return entries;
}

// --- Source fetchers ---

async function fetchBlogEntries(blogs: BlogConfig[]): Promise<Entry[]> {
  const results = await Promise.allSettled(
    blogs.map(async (blog) => {
      if (blog.feed_url) {
        console.error(`Fetching feed: ${blog.name}...`);
        const xml = await httpGet(blog.feed_url);
        return parseRssAtom(xml, blog.name);
      }
      if (blog.html_url) {
        return scrapeBlogLinks(blog.html_url, blog.name);
      }
      return [];
    }),
  );

  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

interface HNHit {
  objectID: string;
  title?: string;
  url?: string;
  created_at?: string;
  points?: number;
  num_comments?: number;
}

async function fetchHackerNews(config: HackerNewsConfig, cutoff: Date): Promise<Entry[]> {
  const baseUrl = config.search_url ?? "https://hn.algolia.com/api/v1/search_by_date";
  const cutoffTs = Math.floor(cutoff.getTime() / 1000);

  const results = await Promise.allSettled(
    config.queries.map(async (query) => {
      const params = new URLSearchParams({
        query,
        tags: "story",
        numericFilters: `points>${config.min_points},created_at_i>${cutoffTs}`,
        hitsPerPage: "30",
      });

      console.error(`Searching HN: ${query}...`);
      const raw = await httpGet(`${baseUrl}?${params}`);
      if (!raw) return [];

      const data = JSON.parse(raw) as { hits?: HNHit[] };
      return (data.hits ?? []).map((hit): Entry => {
        const storyUrl = hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`;
        return {
          id: `hn:${hit.objectID}`,
          source: "Hacker News",
          type: "discussion",
          title: hit.title ?? "",
          url: storyUrl,
          hn_url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
          published: hit.created_at ?? "",
          points: hit.points ?? 0,
          comments: hit.num_comments ?? 0,
          summary: "",
        };
      });
    }),
  );

  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

interface GitHubRelease {
  tag_name?: string;
  name?: string;
  html_url?: string;
  published_at?: string;
  body?: string;
}

async function fetchGitHubReleases(repos: RepoConfig[]): Promise<Entry[]> {
  const results = await Promise.allSettled(
    repos.map(async ({ repo }) => {
      console.error(`Checking releases: ${repo}...`);
      const raw = await httpGet(`https://api.github.com/repos/${repo}/releases?per_page=5`, {
        Accept: "application/vnd.github.v3+json",
      });
      if (!raw) return [];

      const releases = JSON.parse(raw) as GitHubRelease[];
      return releases.map((rel): Entry => ({
        id: `gh:${repo}:${rel.tag_name ?? ""}`,
        source: `GitHub: ${repo}`,
        type: "release",
        title: `${repo} ${rel.tag_name ?? ""} — ${rel.name ?? ""}`,
        url: rel.html_url ?? "",
        published: rel.published_at ?? "",
        summary: (rel.body ?? "").slice(0, 1000),
      }));
    }),
  );

  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

// --- Filters ---

function isRecent(entry: Entry, cutoff: Date): boolean {
  const { published } = entry;
  if (!published) return true;

  try {
    const dt = new Date(published);
    if (isNaN(dt.getTime())) return true;
    return dt > cutoff;
  } catch {
    return true;
  }
}

// --- Main ---

async function main(): Promise<void> {
  const config = loadConfig();
  const seenIds = loadSeenIds();
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  // Fetch all sources in parallel
  const [blogEntries, hnEntries, ghEntries] = await Promise.all([
    fetchBlogEntries(config.blogs),
    fetchHackerNews(config.hacker_news, cutoff),
    fetchGitHubReleases(config.github_repos),
  ]);

  const allEntries = [...blogEntries, ...hnEntries, ...ghEntries];

  // Dedup (multiple HN queries can match the same story)
  const deduped = new Map<string, Entry>();
  for (const entry of allEntries) {
    if (!deduped.has(entry.id)) {
      deduped.set(entry.id, entry);
    }
  }

  // Filter by recency and seen status
  let entries = [...deduped.values()]
    .filter((e) => !seenIds.has(e.id))
    .filter((e) => isRecent(e, cutoff));

  // Sort: blogs first (highest signal), then releases, then HN by points
  entries.sort((a, b) => {
    const typeOrder = { blog: 0, release: 1, discussion: 2 } as const;
    const typeDiff = typeOrder[a.type] - typeOrder[b.type];
    if (typeDiff !== 0) return typeDiff;
    return (b.points ?? 0) - (a.points ?? 0);
  });

  // Update seen IDs
  const newSeen = new Set([...seenIds, ...entries.map((e) => e.id)]);
  saveSeenIds(newSeen);

  // Cap per source (max 5 each)
  const sourceCounts = new Map<string, number>();
  const sourceCapped = entries.filter((e) => {
    const count = sourceCounts.get(e.source) ?? 0;
    if (count >= 5) return false;
    sourceCounts.set(e.source, count + 1);
    return true;
  });

  const blogs = sourceCapped.filter((e) => e.type === "blog").slice(0, 25);
  const releases = sourceCapped.filter((e) => e.type === "release").slice(0, 10);
  const discussions = sourceCapped.filter((e) => e.type === "discussion").slice(0, 25);
  const capped = [...blogs, ...releases, ...discussions];

  const output = {
    fetched_at: new Date().toISOString(),
    lookback_days: LOOKBACK_DAYS,
    total_entries: capped.length,
    by_type: {
      blog: blogs.length,
      release: releases.length,
      discussion: discussions.length,
    },
    entries: capped,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

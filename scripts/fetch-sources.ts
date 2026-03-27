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

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

interface YouTubeConfig {
  queries: string[];
}

interface BlueskyConfig {
  queries: string[];
}

interface RepoConfig {
  repo: string;
  watch: string;
}

interface SourcesConfig {
  blogs: BlogConfig[];
  hacker_news: HackerNewsConfig;
  youtube: YouTubeConfig;
  bluesky: BlueskyConfig;
  github_repos: RepoConfig[];
}

interface HNComment {
  author: string;
  text: string;
  points: number;
}

interface Entry {
  id: string;
  source: string;
  type: "blog" | "release" | "discussion" | "video" | "post";
  title: string;
  url: string;
  published: string;
  summary: string;
  score: number;
  hn_url?: string;
  points?: number;
  comments?: number;
  top_comments?: HNComment[];
  relevance?: number;
  // YouTube-specific
  channel?: string;
  views?: number;
  likes?: number;
  duration?: number;
  // Bluesky-specific
  author?: string;
  reposts?: number;
  replies?: number;
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

// --- HTTP with retry ---

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

async function httpGet(url: string, headers?: Record<string, string>): Promise<string | null> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent": "agent-learnings-digest/1.0",
          ...headers,
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (resp.status === 429 || resp.status >= 500) {
        console.error(`Retry ${attempt + 1}/${MAX_RETRIES} for ${url}: ${resp.status}`);
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
          continue;
        }
      }
      if (!resp.ok) {
        console.error(`Fetch error for ${url}: ${resp.status} ${resp.statusText}`);
        return null;
      }
      return await resp.text();
    } catch (err) {
      if (attempt < MAX_RETRIES - 1) {
        console.error(`Retry ${attempt + 1}/${MAX_RETRIES} for ${url}: ${err}`);
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }
      console.error(`Fetch error for ${url}: ${err}`);
      return null;
    }
  }
  return null;
}

// --- Relevance scoring (adapted from last30days-skill) ---

const STOPWORDS = new Set([
  "the", "a", "an", "to", "for", "how", "is", "in", "of", "on",
  "and", "with", "from", "by", "at", "this", "that", "it", "my",
  "your", "i", "me", "we", "you", "what", "are", "do", "can",
  "its", "be", "or", "not", "no", "so", "if", "but", "about",
  "all", "just", "get", "has", "have", "was", "will", "show", "hn",
]);

function tokenize(text: string): Set<string> {
  const words = text.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/);
  return new Set(words.filter((w) => w.length > 1 && !STOPWORDS.has(w)));
}

function tokenOverlapRelevance(query: string, text: string): number {
  const qTokens = tokenize(query);
  const tTokens = tokenize(text);
  if (qTokens.size === 0) return 0.5;

  let overlap = 0;
  for (const t of qTokens) {
    if (tTokens.has(t)) overlap++;
  }
  if (overlap === 0) return 0;

  const coverage = overlap / qTokens.size;
  const precision = overlap / Math.min(tTokens.size, qTokens.size + 4 || 1);

  // Check exact phrase match
  const normQ = query.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  const normT = text.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  const phraseBonus = normQ.length > 0 && normT.includes(normQ) ? 0.12 : 0;

  return Math.min(1, 0.6 * coverage + 0.4 * precision + phraseBonus);
}

// --- Fuzzy dedup (trigram Jaccard, adapted from last30days-skill) ---

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function getCharTrigrams(text: string): Set<string> {
  const norm = normalizeText(text);
  if (norm.length < 3) return new Set([norm]);
  const trigrams = new Set<string>();
  for (let i = 0; i <= norm.length - 3; i++) {
    trigrams.add(norm.slice(i, i + 3));
  }
  return trigrams;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function tokenJaccard(textA: string, textB: string): number {
  const tokensA = tokenize(textA);
  const tokensB = tokenize(textB);
  return jaccardSimilarity(tokensA, tokensB);
}

/** Hybrid similarity: max of char-trigram Jaccard and token Jaccard. */
function titleSimilarity(a: string, b: string): number {
  const trigramSim = jaccardSimilarity(getCharTrigrams(a), getCharTrigrams(b));
  const tokenSim = tokenJaccard(a, b);
  return Math.max(trigramSim, tokenSim);
}

/**
 * Fuzzy dedup across entries. Keeps the higher-scored entry when titles
 * are similar above threshold. Cross-source dedup uses a lower threshold
 * than within-source dedup.
 */
function fuzzyDedup(entries: Entry[], threshold = 0.5): Entry[] {
  if (entries.length <= 1) return entries;

  const toRemove = new Set<number>();
  for (let i = 0; i < entries.length; i++) {
    if (toRemove.has(i)) continue;
    for (let j = i + 1; j < entries.length; j++) {
      if (toRemove.has(j)) continue;
      const sim = titleSimilarity(entries[i]!.title, entries[j]!.title);
      if (sim >= threshold) {
        // Keep whichever has the higher score
        if (entries[i]!.score >= entries[j]!.score) {
          toRemove.add(j);
        } else {
          toRemove.add(i);
          break;
        }
      }
    }
  }

  return entries.filter((_, idx) => !toRemove.has(idx));
}

// --- Composite scoring ---

const SCORE_WEIGHTS: Record<Entry["type"], { relevance: number; recency: number; engagement: number }> = {
  blog: { relevance: 0, recency: 0.6, engagement: 0.4 },
  discussion: { relevance: 0.35, recency: 0.25, engagement: 0.4 },
  release: { relevance: 0, recency: 0.7, engagement: 0.3 },
  video: { relevance: 0.3, recency: 0.25, engagement: 0.45 },
  post: { relevance: 0.35, recency: 0.3, engagement: 0.35 },
};

function recencyScore(published: string, cutoff: Date): number {
  if (!published) return 50;
  const dt = new Date(published);
  if (isNaN(dt.getTime())) return 50;
  const now = Date.now();
  const ageMs = now - dt.getTime();
  const windowMs = now - cutoff.getTime();
  if (windowMs <= 0) return 50;
  // Linear decay: 100 at publish time, 0 at cutoff boundary
  return Math.max(0, Math.min(100, 100 * (1 - ageMs / windowMs)));
}

function engagementScore(entry: Entry): number {
  if (entry.type === "video") {
    const views = entry.views ?? 0;
    const likes = entry.likes ?? 0;
    if (views === 0 && likes === 0) return 0;
    // YouTube: views dominate, likes secondary
    return Math.min(100, (0.55 * Math.log1p(views) + 0.45 * Math.log1p(likes)) * 8);
  }
  if (entry.type === "post") {
    const likes = entry.likes ?? 0;
    const reposts = entry.reposts ?? 0;
    const replies = entry.replies ?? 0;
    if (likes === 0 && reposts === 0) return 0;
    return Math.min(100, (0.45 * Math.log1p(likes) + 0.35 * Math.log1p(reposts) + 0.2 * Math.log1p(replies)) * 20);
  }
  const points = entry.points ?? 0;
  const comments = entry.comments ?? 0;
  if (points === 0 && comments === 0) return 0;
  // log1p normalization (same approach as last30days-skill)
  return Math.min(100, (0.55 * Math.log1p(points) + 0.45 * Math.log1p(comments)) * 16);
}

function computeScore(entry: Entry, cutoff: Date): number {
  const w = SCORE_WEIGHTS[entry.type];
  const rel = (entry.relevance ?? 0) * 100;
  const rec = recencyScore(entry.published, cutoff);
  const eng = engagementScore(entry);
  return Math.max(0, Math.min(100, Math.round(w.relevance * rel + w.recency * rec + w.engagement * eng)));
}

// --- HN comment enrichment (adapted from last30days-skill) ---

function stripHtml(text: string): string {
  return text.replace(/<p>/gi, "\n").replace(/<[^>]+>/g, "").trim();
}

async function fetchHNComments(objectId: string, maxComments = 3): Promise<HNComment[]> {
  const raw = await httpGet(`https://hn.algolia.com/api/v1/items/${objectId}`);
  if (!raw) return [];

  const data = JSON.parse(raw) as { children?: Array<{ text?: string; author?: string; points?: number }> };
  const children = data.children ?? [];
  const real = children
    .filter((c) => c.text && c.author)
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0));

  return real.slice(0, maxComments).map((c) => ({
    author: c.author ?? "",
    text: stripHtml(c.text ?? "").slice(0, 300),
    points: c.points ?? 0,
  }));
}

async function enrichTopStories(entries: Entry[], limit = 5): Promise<void> {
  const hnEntries = entries
    .filter((e) => e.type === "discussion" && e.id.startsWith("hn:"))
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
    .slice(0, limit);

  const results = await Promise.allSettled(
    hnEntries.map(async (entry) => {
      const objectId = entry.id.replace("hn:", "");
      entry.top_comments = await fetchHNComments(objectId);
    }),
  );
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
      score: 0,
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
      score: 0,
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
      score: 0,
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
      return (data.hits ?? []).map((hit, i): Entry => {
        const storyUrl = hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`;
        // Blend Algolia rank with token-overlap relevance
        const rankScore = Math.max(0.3, 1 - i * 0.02);
        const contentScore = tokenOverlapRelevance(query, hit.title ?? "");
        const relevance = Math.min(1, 0.5 * rankScore + 0.5 * contentScore);

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
          relevance,
          score: 0,
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
        score: 0,
      }));
    }),
  );

  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

// --- YouTube (yt-dlp, no API key) ---

function isYtdlpInstalled(): boolean {
  try {
    execFileSync("yt-dlp", ["--version"], { stdio: "ignore", timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

async function fetchYouTube(config: YouTubeConfig, cutoff: Date): Promise<Entry[]> {
  if (!isYtdlpInstalled()) {
    console.error("Skipping YouTube: yt-dlp not installed (install with: pip install yt-dlp)");
    return [];
  }

  const cutoffStr = cutoff.toISOString().slice(0, 10).replace(/-/g, "");
  const results = await Promise.allSettled(
    config.queries.map(async (query) => {
      console.error(`Searching YouTube: ${query}...`);
      let stdout: string;
      try {
        stdout = execFileSync("yt-dlp", [
          "--ignore-config",
          "--no-cookies-from-browser",
          `ytsearch10:${query}`,
          "--dump-json",
          "--no-warnings",
          "--no-download",
        ], { timeout: 60_000, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
      } catch {
        console.error(`YouTube search failed for: ${query}`);
        return [];
      }

      const entries: Entry[] = [];
      for (const line of stdout.trim().split("\n")) {
        if (!line.trim()) continue;
        let video: Record<string, unknown>;
        try {
          video = JSON.parse(line);
        } catch {
          continue;
        }

        const videoId = (video.id as string) ?? "";
        const title = (video.title as string) ?? "";
        const uploadDate = (video.upload_date as string) ?? "";
        const views = (video.view_count as number) ?? 0;
        const likes = (video.like_count as number) ?? 0;
        const commentCount = (video.comment_count as number) ?? 0;
        const channel = (video.channel as string) ?? (video.uploader as string) ?? "";
        const duration = (video.duration as number) ?? 0;

        // Convert YYYYMMDD to ISO
        let published = "";
        if (uploadDate.length === 8) {
          published = `${uploadDate.slice(0, 4)}-${uploadDate.slice(4, 6)}-${uploadDate.slice(6, 8)}`;
        }

        const relevance = tokenOverlapRelevance(query, title);

        entries.push({
          id: `yt:${videoId}`,
          source: "YouTube",
          type: "video",
          title,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          published,
          summary: "",
          score: 0,
          relevance,
          channel,
          views,
          likes,
          comments: commentCount,
          duration,
        });
      }

      return entries;
    }),
  );

  // Soft date filter: prefer recent, but keep all if too few recent
  const all = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const recent = all.filter((e) => e.published >= cutoff.toISOString().slice(0, 10));
  if (recent.length >= 3) return recent;
  return all;
}

// --- Bluesky (AT Protocol, needs app password) ---

function loadEnv(): Record<string, string> {
  const envPath = join(SCRIPT_DIR, "..", ".env");
  if (!existsSync(envPath)) return {};
  const vars: Record<string, string> = {};
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return vars;
}

async function createBlueskySession(handle: string, appPassword: string): Promise<string | null> {
  try {
    const resp = await fetch("https://bsky.social/xrpc/com.atproto.server.createSession", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: handle, password: appPassword }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) {
      console.error(`Bluesky auth failed: ${resp.status} ${resp.statusText}`);
      return null;
    }
    const data = (await resp.json()) as { accessJwt?: string };
    return data.accessJwt ?? null;
  } catch (err) {
    console.error(`Bluesky auth error: ${err}`);
    return null;
  }
}

interface BlueskyPost {
  uri?: string;
  record?: { text?: string; createdAt?: string };
  author?: { handle?: string; displayName?: string };
  indexedAt?: string;
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
  quoteCount?: number;
}

async function fetchBluesky(config: BlueskyConfig, cutoff: Date): Promise<Entry[]> {
  // Check env vars — graceful skip if not configured
  const env = { ...loadEnv(), ...process.env };
  const handle = env["BSKY_HANDLE"] ?? "";
  const appPassword = env["BSKY_APP_PASSWORD"] ?? "";

  if (!handle || !appPassword) {
    console.error("Skipping Bluesky: BSKY_HANDLE / BSKY_APP_PASSWORD not set (see .env.example)");
    return [];
  }

  const token = await createBlueskySession(handle, appPassword);
  if (!token) return [];

  console.error("Bluesky authenticated, searching...");

  const results = await Promise.allSettled(
    config.queries.map(async (query) => {
      console.error(`Searching Bluesky: ${query}...`);
      const params = new URLSearchParams({
        q: query,
        limit: "25",
        sort: "top",
      });

      const raw = await httpGet(
        `https://bsky.social/xrpc/app.bsky.feed.searchPosts?${params}`,
        { Authorization: `Bearer ${token}` },
      );
      if (!raw) return [];

      const data = JSON.parse(raw) as { posts?: BlueskyPost[] };
      return (data.posts ?? []).map((post, i): Entry => {
        const text = post.record?.text ?? "";
        const authorHandle = post.author?.handle ?? "";
        const displayName = post.author?.displayName ?? authorHandle;
        const likes = post.likeCount ?? 0;
        const reposts = post.repostCount ?? 0;
        const replies = post.replyCount ?? 0;

        // Build URL from URI: at://did:plc:xxx/app.bsky.feed.post/rkey
        const uri = post.uri ?? "";
        const rkey = uri.split("/").pop() ?? "";
        const url = authorHandle && rkey
          ? `https://bsky.app/profile/${authorHandle}/post/${rkey}`
          : "";

        // Parse date
        const dateRaw = post.indexedAt ?? post.record?.createdAt ?? "";
        let published = "";
        if (dateRaw) {
          try {
            published = new Date(dateRaw).toISOString();
          } catch { /* leave empty */ }
        }

        // Relevance: blend rank position with content match
        const rankScore = Math.max(0.3, 1 - i * 0.025);
        const contentScore = tokenOverlapRelevance(query, text);
        const relevance = Math.min(1, 0.4 * rankScore + 0.6 * contentScore);

        return {
          id: `bsky:${rkey}`,
          source: "Bluesky",
          type: "post",
          title: text.slice(0, 200),
          url,
          published,
          summary: "",
          score: 0,
          relevance,
          author: displayName,
          likes,
          reposts,
          replies,
        };
      });
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
  const [blogEntries, hnEntries, ytEntries, bskyEntries, ghEntries] = await Promise.all([
    fetchBlogEntries(config.blogs),
    fetchHackerNews(config.hacker_news, cutoff),
    fetchYouTube(config.youtube, cutoff),
    fetchBluesky(config.bluesky, cutoff),
    fetchGitHubReleases(config.github_repos),
  ]);

  const allEntries = [...blogEntries, ...hnEntries, ...ytEntries, ...bskyEntries, ...ghEntries];

  // ID-based dedup (multiple HN queries can match the same story)
  const idDeduped = new Map<string, Entry>();
  for (const entry of allEntries) {
    const existing = idDeduped.get(entry.id);
    if (!existing || (entry.relevance ?? 0) > (existing.relevance ?? 0)) {
      idDeduped.set(entry.id, entry);
    }
  }

  // Filter by recency and seen status
  let entries = [...idDeduped.values()]
    .filter((e) => !seenIds.has(e.id))
    .filter((e) => isRecent(e, cutoff));

  // Compute composite scores
  for (const entry of entries) {
    entry.score = computeScore(entry, cutoff);
  }

  // Enrich top HN stories with comments
  console.error("Enriching top HN stories with comments...");
  await enrichTopStories(entries);

  // Fuzzy title dedup across all sources (catches same article on blog + HN)
  entries.sort((a, b) => b.score - a.score);
  entries = fuzzyDedup(entries, 0.5);

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
  const videos = sourceCapped.filter((e) => e.type === "video").slice(0, 15);
  const posts = sourceCapped.filter((e) => e.type === "post").slice(0, 15);
  const capped = [...blogs, ...releases, ...discussions, ...videos, ...posts];

  // Final sort by score
  capped.sort((a, b) => b.score - a.score);

  const output = {
    fetched_at: new Date().toISOString(),
    lookback_days: LOOKBACK_DAYS,
    total_entries: capped.length,
    by_type: {
      blog: blogs.length,
      release: releases.length,
      discussion: discussions.length,
      video: videos.length,
      post: posts.length,
    },
    entries: capped,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

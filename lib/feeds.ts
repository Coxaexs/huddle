/**
 * Feeds: a channel follows an RSS or Atom feed (a blog, a YouTube channel, a
 * subreddit, a Bluesky or Mastodon account, a GitHub repo's releases) and new
 * entries show up there as cards, posted under the feed's name.
 *
 * People paste whatever link they have; `feedUrlFor` knows the feed address of
 * the big sites and anything else is fetched and its <link rel="alternate">
 * followed. The hub's alarm polls each feed every POLL_MS through the same
 * guarded fetcher as link previews, so a feed can never reach the home network.
 *
 * Cost: one small fetch per feed per quarter hour, at most MAX_POLLS_PER_RUN at
 * a time, and at most MAX_NEW_PER_POLL posts per check so a feed that dumps
 * fifty entries at once cannot flood a channel.
 */
import { publicMessage } from "../app/api/messages/route";
import { postableChannelKindsSql } from "./channel-kinds";
import type { StoredMessage } from "./storage";
import { decodeEntities, imageProxyKey, isSafePublicUrl, safeFetch, signImageUrl } from "./unfurl";

export const MAX_FEEDS_PER_SERVER = 10;
export const POLL_MS = 15 * 60_000;
/** A failing feed backs off to this, and keeps trying. */
const MAX_BACKOFF_MS = 6 * 60 * 60_000;
const MAX_POLLS_PER_RUN = 8;
const MAX_NEW_PER_POLL = 3;
/** Entry ids remembered per feed; feeds list 15–50, so this covers reshuffles. */
const SEEN_CAP = 200;
const MAX_FEED_BYTES = 1_500_000;
const FEED_ACCEPT =
  "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, text/html;q=0.5, */*;q=0.3";
/** YouTube answers EU servers with a consent page unless this is set. */
const YOUTUBE_CONSENT = { cookie: "SOCS=CAI; CONSENT=YES+" };

export type FeedKind = "rss" | "youtube" | "reddit" | "bluesky" | "mastodon" | "github";

/** How each kind is dressed: the poster's emoji and the card's colour bar. */
export const FEED_STYLE: Record<FeedKind, { avatar: string; color: number; label: string }> = {
  rss: { avatar: "📰", color: 0xf59e0b, label: "Feed" },
  youtube: { avatar: "▶️", color: 0xff0033, label: "YouTube" },
  reddit: { avatar: "👽", color: 0xff4500, label: "Reddit" },
  bluesky: { avatar: "🦋", color: 0x0085ff, label: "Bluesky" },
  mastodon: { avatar: "🐘", color: 0x6364ff, label: "Mastodon" },
  github: { avatar: "🐙", color: 0x8b949e, label: "GitHub" },
};

export interface FeedItem {
  id: string;
  title: string;
  link: string;
  summary: string;
  image: string | null;
  author: string;
  publishedAt: string | null;
}

export interface ParsedFeed {
  title: string;
  siteUrl: string | null;
  items: FeedItem[];
}

export interface FeedRow {
  id: string;
  server_id: string;
  channel_id: string;
  url: string;
  source_url: string;
  kind: FeedKind;
  title: string;
  seen: string;
  created_by: string | null;
  created_at: string;
  next_check_at: number;
  last_ok_at: string | null;
  last_post_at: string | null;
  last_error: string | null;
  failures: number;
  posts: number;
}

export interface PublicFeed {
  id: string;
  channelId: string;
  url: string;
  sourceUrl: string;
  kind: FeedKind;
  title: string;
  createdAt: string;
  lastOkAt: string | null;
  lastPostAt: string | null;
  lastError: string | null;
  posts: number;
}

export function publicFeed(row: FeedRow): PublicFeed {
  return {
    id: row.id,
    channelId: row.channel_id,
    url: row.url,
    sourceUrl: row.source_url,
    kind: row.kind,
    title: row.title,
    createdAt: row.created_at,
    lastOkAt: row.last_ok_at,
    lastPostAt: row.last_post_at,
    lastError: row.last_error,
    posts: row.posts,
  };
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function stripCdata(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

/** Text of the first <tag>…</tag> (namespaced names allowed), or "". */
function tagText(xml: string, tag: string): string {
  const escaped = tag.replace(/[:.]/g, (c) => `\\${c}`);
  const match = xml.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}\\s*>`, "i"));
  return match ? stripCdata(match[1]).trim() : "";
}

function attrsOf(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const attr of tag.matchAll(/([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attrs[attr[1].toLowerCase()] = decodeEntities(attr[2] ?? attr[3] ?? "");
  }
  return attrs;
}

/** Every self-closing or opening <tag …> of one name, as attribute maps. */
function tagsWithAttrs(xml: string, tag: string): Array<Record<string, string>> {
  const escaped = tag.replace(/[:.]/g, (c) => `\\${c}`);
  return [...xml.matchAll(new RegExp(`<${escaped}\\b[^>]*>`, "gi"))].map((m) => attrsOf(m[0]));
}

/** HTML (as feeds embed it) to one plain line. */
export function plainText(html: string, max: number): string {
  const text = decodeEntities(
    decodeEntities(stripCdata(html))
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function absolute(raw: string, base: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(decodeEntities(raw.trim()), base);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function isoDate(raw: string): string | null {
  if (!raw) return null;
  const time = Date.parse(raw.trim());
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function firstImage(block: string, base: string): string | null {
  for (const tag of ["media:thumbnail", "media:content", "itunes:image", "enclosure"]) {
    for (const attrs of tagsWithAttrs(block, tag)) {
      const src = attrs.url || attrs.href;
      const type = attrs.type || attrs.medium || "";
      if (tag === "enclosure" && !/^image/i.test(type)) continue;
      if (tag === "media:content" && type && !/image/i.test(type)) continue;
      const url = absolute(src || "", base);
      if (url) return url;
    }
  }
  // An <img> inside the (escaped) HTML body.
  const html = decodeEntities(stripCdata(block));
  const img = html.match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i);
  return img ? absolute(img[1], base) : null;
}

/** Reads RSS 2.0, RSS 1.0 (RDF) and Atom. Null when it is not a feed. */
export function parseFeed(xml: string, feedUrl: string): ParsedFeed | null {
  const head = xml.slice(0, 4000);
  const atom = /<feed[\s>]/i.test(head);
  const rss = /<(rss|rdf:RDF)[\s>]/i.test(head) || /<channel[\s>]/i.test(head);
  if (!atom && !rss) return null;

  const blockTag = atom ? "entry" : "item";
  const blocks = [...xml.matchAll(new RegExp(`<${blockTag}[\\s>][\\s\\S]*?</${blockTag}\\s*>`, "gi"))].map((m) => m[0]);
  const firstBlock = xml.search(new RegExp(`<${blockTag}[\\s>]`, "i"));
  const preamble = firstBlock >= 0 ? xml.slice(0, firstBlock) : xml;

  let siteUrl: string | null = null;
  if (atom) {
    const alt = tagsWithAttrs(preamble, "link").find((l) => !l.rel || l.rel === "alternate");
    siteUrl = absolute(alt?.href || "", feedUrl);
  } else {
    siteUrl = absolute(plainText(tagText(preamble, "link"), 2000), feedUrl);
  }

  const items: FeedItem[] = [];
  for (const block of blocks.slice(0, 60)) {
    let link = "";
    if (atom) {
      const links = tagsWithAttrs(block, "link");
      const alt = links.find((l) => !l.rel || l.rel === "alternate") || links[0];
      link = absolute(alt?.href || "", feedUrl) || "";
    } else {
      link = absolute(plainText(tagText(block, "link"), 2000), feedUrl) || "";
      if (!link) {
        const guid = plainText(tagText(block, "guid"), 2000);
        if (/^https?:\/\//.test(guid)) link = guid;
      }
    }
    const title = plainText(tagText(block, "title"), 256);
    const body =
      tagText(block, "media:description") ||
      tagText(block, "summary") ||
      tagText(block, "description") ||
      tagText(block, "content") ||
      tagText(block, "content:encoded");
    const author =
      plainText(tagText(tagText(block, "author"), "name") || tagText(block, "dc:creator") || tagText(block, "author"), 100);
    const id =
      plainText(tagText(block, "yt:videoId") || tagText(block, "guid") || tagText(block, "id"), 500) ||
      link ||
      `${title}|${tagText(block, "pubDate")}`;
    if (!id || (!link && !title)) continue;
    items.push({
      id,
      title,
      link,
      summary: plainText(body, 600),
      image: firstImage(block, feedUrl),
      author,
      publishedAt: isoDate(
        tagText(block, "published") || tagText(block, "pubDate") || tagText(block, "updated") || tagText(block, "dc:date"),
      ),
    });
  }
  return { title: plainText(tagText(preamble, "title"), 100), siteUrl, items };
}

/** <link rel="alternate" type="application/rss+xml|atom+xml"> on an HTML page. */
export function discoverFeedLink(html: string, pageUrl: string): string | null {
  for (const attrs of tagsWithAttrs(html, "link")) {
    if (!/\balternate\b/i.test(attrs.rel || "")) continue;
    if (!/application\/(rss|atom)\+xml/i.test(attrs.type || "")) continue;
    const url = absolute(attrs.href || "", pageUrl);
    if (url) return url;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Finding the feed behind a pasted link
// ---------------------------------------------------------------------------

function kindOfHost(host: string): FeedKind {
  if (/(^|\.)youtube\.com$|^youtu\.be$/.test(host)) return "youtube";
  if (/(^|\.)reddit\.com$/.test(host)) return "reddit";
  if (host === "bsky.app") return "bluesky";
  if (host === "github.com") return "github";
  return "rss";
}

/**
 * The feed address for links whose feed lives at a known place, without a
 * fetch. Null means "fetch it and look".
 */
export function feedUrlFor(raw: string): { url: string; kind: FeedKind } | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.|old\.|new\.)/, "");
  const path = url.pathname.replace(/\/+$/, "");

  if (host === "youtube.com") {
    if (path === "/feeds/videos.xml") return { url: url.toString(), kind: "youtube" };
    const channel = path.match(/^\/channel\/(UC[\w-]{20,})/);
    if (channel) return { url: `https://www.youtube.com/feeds/videos.xml?channel_id=${channel[1]}`, kind: "youtube" };
    const list = url.searchParams.get("list");
    if (path === "/playlist" && list && /^[\w-]{10,}$/.test(list)) {
      return { url: `https://www.youtube.com/feeds/videos.xml?playlist_id=${list}`, kind: "youtube" };
    }
    return null;
  }
  if (host === "reddit.com") {
    const sub = path.match(/^\/(r|user|u)\/([\w-]{2,})(\/(new|top|hot|rising))?$/i);
    if (sub) {
      const kind = sub[1].toLowerCase() === "r" ? "r" : "user";
      return { url: `https://www.reddit.com/${kind}/${sub[2]}${sub[3] || ""}/.rss`, kind: "reddit" };
    }
    if (path.endsWith(".rss")) return { url: url.toString(), kind: "reddit" };
    return null;
  }
  if (host === "bsky.app") {
    const profile = path.match(/^\/profile\/([\w.:-]+)(\/rss)?$/);
    if (profile) return { url: `https://bsky.app/profile/${profile[1]}/rss`, kind: "bluesky" };
    return null;
  }
  if (host === "github.com") {
    const repo = path.match(/^\/([\w.-]+)\/([\w.-]+)(\/releases|\/tags|\/commits\/[\w./-]+)?(\.atom)?$/);
    if (repo && !["orgs", "settings", "features", "topics", "sponsors"].includes(repo[1])) {
      const what = repo[3] === "/tags" ? "tags" : repo[3]?.startsWith("/commits/") ? repo[3].slice(1) : "releases";
      return { url: `https://github.com/${repo[1]}/${repo[2]}/${what}.atom`, kind: "github" };
    }
    return null;
  }
  if (host === "medium.com") {
    const writer = path.match(/^\/(@[\w.-]+)$/);
    if (writer) return { url: `https://medium.com/feed/${writer[1]}`, kind: "rss" };
    return null;
  }
  // Mastodon and friends: https://instance/@name has its feed at @name.rss.
  const fediverse = path.match(/^\/@(\w+)(\.rss)?$/);
  if (fediverse) return { url: `${url.origin}/@${fediverse[1]}.rss`, kind: "mastodon" };
  return null;
}

/**
 * The body of a feed fetch, capped. HTML stops at </head>, where the feed
 * links live, unless `wholePage` (YouTube puts its link 800 KB in).
 */
async function readText(response: Response, wholePage = false): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const html = !wholePage && /text\/html/i.test(response.headers.get("content-type") || "");
  let text = "";
  let total = 0;
  while (total < MAX_FEED_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    total += value.byteLength;
    text += decoder.decode(value, { stream: true });
    if (html && /<\/head\s*>/i.test(text.slice(-value.byteLength - 16))) break;
  }
  void reader.cancel().catch(() => undefined);
  return text.slice(0, MAX_FEED_BYTES);
}

async function fetchText(url: string): Promise<{ text: string; url: string; type: string } | null> {
  const parsed = isSafePublicUrl(url);
  if (!parsed) return null;
  const youtube = /(^|\.)youtube\.com$/i.test(parsed.hostname);
  const response = await safeFetch(url, FEED_ACCEPT, youtube ? YOUTUBE_CONSENT : undefined).catch(() => null);
  if (!response) return null;
  return {
    text: await readText(response, youtube),
    url: response.url || url,
    type: response.headers.get("content-type") || "",
  };
}

export type FeedLookup =
  | { ok: true; url: string; kind: FeedKind; feed: ParsedFeed }
  | { ok: false; error: string };

/** One address: a feed itself, or a page whose <link rel="alternate"> is one. */
async function tryFeed(url: string, kind: FeedKind): Promise<FeedLookup | null> {
  const page = await fetchText(url);
  if (!page) return null;
  const feed = parseFeed(page.text, page.url);
  if (feed) return { ok: true, url, kind, feed };
  const link = discoverFeedLink(page.text, page.url);
  if (!link) return null;
  const shortcut = feedUrlFor(link);
  const target = shortcut?.url || link;
  const linked = await fetchText(target);
  const linkedFeed = linked ? parseFeed(linked.text, linked.url) : null;
  return linkedFeed ? { ok: true, url: target, kind: shortcut?.kind || kind, feed: linkedFeed } : null;
}

/** Turns what someone pasted into a working feed, or says why not. */
export async function findFeed(raw: string): Promise<FeedLookup> {
  const trimmed = raw.trim();
  const withScheme = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const safe = isSafePublicUrl(withScheme);
  if (!safe) return { ok: false, error: "That doesn't look like a public web address." };
  const page = safe.toString();
  const known = feedUrlFor(page);
  const candidates = [
    ...(known ? [known] : []),
    { url: page, kind: kindOfHost(safe.hostname.toLowerCase().replace(/^(www\.|m\.|old\.)/, "")) },
  ].filter((candidate, index, all) => all.findIndex((c) => c.url === candidate.url) === index);
  for (const candidate of candidates) {
    const found = await tryFeed(candidate.url, candidate.kind);
    if (found?.ok) return { ...found, feed: { ...found.feed, title: found.feed.title || safe.hostname } };
  }
  return { ok: false, error: "No feed found there. Try the site's RSS link, a YouTube channel, a subreddit or a Bluesky profile." };
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export async function listFeeds(db: D1Database, serverId: string): Promise<FeedRow[]> {
  const rows = await db
    .prepare("SELECT * FROM server_feeds WHERE server_id = ? ORDER BY created_at")
    .bind(serverId)
    .all<FeedRow>();
  return rows.results || [];
}

export async function getFeed(db: D1Database, id: string): Promise<FeedRow | null> {
  return db.prepare("SELECT * FROM server_feeds WHERE id = ?").bind(id).first<FeedRow>();
}

/** A channel of this server that feeds may post into (text, or a voice room's chat). */
export async function feedChannel(
  db: D1Database,
  serverId: string,
  channelId: string,
): Promise<{ id: string; name: string } | null> {
  return db
    .prepare(
      `SELECT id, name FROM channels WHERE id = ? AND server_id = ? AND kind IN (${postableChannelKindsSql()}) AND kind != 'dm'`,
    )
    .bind(channelId, serverId)
    .first<{ id: string; name: string }>();
}

export function cleanFeedTitle(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, 80) : "";
}

export async function createFeed(
  db: D1Database,
  input: {
    serverId: string;
    channelId: string;
    url: string;
    sourceUrl: string;
    kind: FeedKind;
    title: string;
    seen: string[];
    createdBy: string;
  },
  now = Date.now(),
): Promise<FeedRow> {
  const row: FeedRow = {
    id: crypto.randomUUID(),
    server_id: input.serverId,
    channel_id: input.channelId,
    url: input.url,
    source_url: input.sourceUrl,
    kind: input.kind,
    title: input.title,
    seen: JSON.stringify(input.seen.slice(0, SEEN_CAP)),
    created_by: input.createdBy,
    created_at: new Date(now).toISOString(),
    next_check_at: now + POLL_MS,
    last_ok_at: new Date(now).toISOString(),
    last_post_at: null,
    last_error: null,
    failures: 0,
    posts: 0,
  };
  await db
    .prepare(
      `INSERT INTO server_feeds
         (id, server_id, channel_id, url, source_url, kind, title, seen, created_by, created_at, next_check_at, last_ok_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.server_id,
      row.channel_id,
      row.url,
      row.source_url,
      row.kind,
      row.title,
      row.seen,
      row.created_by,
      row.created_at,
      row.next_check_at,
      row.last_ok_at,
    )
    .run();
  return row;
}

// ---------------------------------------------------------------------------
// Posting
// ---------------------------------------------------------------------------

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Reddit's summary is a table of "submitted by /u/x [link] [comments]". */
function tidySummary(kind: FeedKind, summary: string): string {
  if (kind === "reddit") return summary.replace(/submitted by\s+\/u\/\S+[\s\S]*$/i, "").trim();
  if (kind === "youtube") return "";
  return summary;
}

/** The stored message for one entry. YouTube posts the bare link, so the player shows. */
export async function feedItemMessage(
  db: D1Database,
  feed: Pick<FeedRow, "id" | "kind" | "title" | "url">,
  channel: { id: string; name: string },
  item: FeedItem,
  now = Date.now(),
): Promise<StoredMessage> {
  const style = FEED_STYLE[feed.kind] || FEED_STYLE.rss;
  const social = feed.kind === "bluesky" || feed.kind === "mastodon";
  let content = "";
  let embeds: Array<Record<string, unknown>> = [];
  if (feed.kind === "youtube" && item.link) {
    content = item.link;
  } else {
    const key = item.image ? await imageProxyKey(db).catch(() => null) : null;
    const image = item.image && key ? await signImageUrl(key, item.image) : null;
    const summary = tidySummary(feed.kind, item.summary);
    const embed: Record<string, unknown> = {
      title: social ? `${feed.title}` : item.title || feed.title,
      url: item.link || undefined,
      description: (social ? summary || item.title : summary) || undefined,
      color: style.color,
      timestamp: item.publishedAt || undefined,
      footer: { text: [style.label === "Feed" ? hostOf(item.link || feed.url) : style.label, !social && item.author ? item.author : ""].filter(Boolean).join(" · ") },
    };
    // Pictures in social posts and articles read best large; Reddit's are thumbnails.
    if (image) embed[feed.kind === "reddit" || feed.kind === "github" ? "thumbnail" : "image"] = { url: image };
    for (const key of Object.keys(embed)) if (embed[key] === undefined) delete embed[key];
    embeds = [embed];
  }
  return {
    id: crypto.randomUUID(),
    channel: channel.name,
    channel_id: channel.id,
    user_id: null,
    author: feed.title.slice(0, 80) || style.label,
    avatar: style.avatar,
    color: "#b8a6ff",
    content,
    attachment_key: null,
    is_bot: 1,
    created_at: new Date(now).toISOString(),
    link: null,
    action_label: null,
    audio_url: null,
    kind: null,
    payload: JSON.stringify({ embeds, components: [], feedId: feed.id }),
    reply_to: null,
    thread_id: null,
  };
}

async function insertMessage(db: D1Database, stored: StoredMessage): Promise<void> {
  await db
    .prepare(
      `INSERT INTO messages
         (id, channel, channel_id, user_id, author, avatar, color, content,
          attachment_key, is_bot, created_at, payload, reply_to, thread_id)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, NULL, 1, ?, ?, NULL, NULL)`,
    )
    .bind(stored.id, stored.channel, stored.channel_id, stored.author, stored.avatar, stored.color, stored.content, stored.created_at, stored.payload)
    .run();
}

type Publish = (channelId: string, message: unknown) => Promise<void>;

/** Posts entries (oldest first) and records them on the feed. */
export async function postFeedItems(
  db: D1Database,
  feed: FeedRow,
  items: FeedItem[],
  publish: Publish,
  now = Date.now(),
): Promise<number> {
  const channel = await feedChannel(db, feed.server_id, feed.channel_id);
  if (!channel) return 0;
  let posted = 0;
  for (const item of [...items].reverse()) {
    const stored = await feedItemMessage(db, feed, channel, item, now + posted);
    await insertMessage(db, stored);
    await publish(channel.id, publicMessage(stored)).catch(() => undefined);
    posted += 1;
  }
  if (posted) {
    await db
      .prepare("UPDATE server_feeds SET posts = posts + ?, last_post_at = ? WHERE id = ?")
      .bind(posted, new Date(now).toISOString(), feed.id)
      .run();
  }
  return posted;
}

function parseSeen(raw: string): string[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** Which of a check's entries are new: unseen, newest first, at most MAX_NEW_PER_POLL. */
export function newEntries(items: FeedItem[], seen: string[], since: string | null): FeedItem[] {
  const known = new Set(seen);
  const sinceMs = since ? Date.parse(since) : 0;
  return items
    .filter((item) => !known.has(item.id))
    // An old entry we never saw (a feed that reordered or grew its window) is not news.
    .filter((item) => !item.publishedAt || !sinceMs || Date.parse(item.publishedAt) > sinceMs - 24 * 60 * 60_000)
    .slice(0, MAX_NEW_PER_POLL);
}

/** When the next feed is due, or null when there are none. */
export async function nextFeedAlarm(db: D1Database): Promise<number | null> {
  const row = await db
    .prepare("SELECT MIN(next_check_at) AS due FROM server_feeds")
    .first<{ due: number | null }>()
    .catch(() => null);
  return row?.due ?? null;
}

/** Checks every feed that is due (a few at a time) and posts what is new. */
export async function pollDueFeeds(
  db: D1Database,
  options: { publish: Publish },
  now = Date.now(),
): Promise<void> {
  const due = await db
    .prepare("SELECT * FROM server_feeds WHERE next_check_at <= ? ORDER BY next_check_at LIMIT ?")
    .bind(now, MAX_POLLS_PER_RUN)
    .all<FeedRow>();
  const feeds: FeedRow[] = [];
  for (const feed of due.results || []) {
    // Claim it, so a second alarm firing at once cannot post twice.
    const claimed = await db
      .prepare("UPDATE server_feeds SET next_check_at = ? WHERE id = ? AND next_check_at = ?")
      .bind(now + POLL_MS, feed.id, feed.next_check_at)
      .run();
    if (claimed.meta.changes) feeds.push(feed);
  }
  await Promise.all(feeds.map((feed) => checkFeed(db, feed, options.publish, now).catch(() => undefined)));
}

async function checkFeed(db: D1Database, feed: FeedRow, publish: Publish, now: number): Promise<void> {
  // Its channel was deleted: the feed goes with it.
  if (!(await feedChannel(db, feed.server_id, feed.channel_id))) {
    await db.prepare("DELETE FROM server_feeds WHERE id = ?").bind(feed.id).run();
    return;
  }
  const page = await fetchText(feed.url);
  const parsed = page ? parseFeed(page.text, page.url) : null;
  if (!parsed) {
    const failures = feed.failures + 1;
    const wait = Math.min(MAX_BACKOFF_MS, POLL_MS * 2 ** Math.min(failures - 1, 6));
    await db
      .prepare("UPDATE server_feeds SET failures = ?, last_error = ?, next_check_at = ? WHERE id = ?")
      .bind(failures, page ? "The address stopped returning a feed." : "Couldn't reach the feed.", now + wait, feed.id)
      .run();
    return;
  }
  const seen = parseSeen(feed.seen);
  const fresh = newEntries(parsed.items, seen, feed.last_ok_at);
  const nextSeen = [...new Set([...parsed.items.map((item) => item.id), ...seen])].slice(0, SEEN_CAP);
  await db
    .prepare("UPDATE server_feeds SET seen = ?, failures = 0, last_error = NULL, last_ok_at = ? WHERE id = ?")
    .bind(JSON.stringify(nextSeen), new Date(now).toISOString(), feed.id)
    .run();
  if (fresh.length) await postFeedItems(db, feed, fresh, publish, now);
}

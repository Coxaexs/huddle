import { describe, expect, it } from "vitest";
import { discoverFeedLink, feedUrlFor, newEntries, parseFeed, plainText, type FeedItem } from "@/lib/feeds";

const YOUTUBE = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <link rel="self" href="http://www.youtube.com/feeds/videos.xml?channel_id=UCHnyfMqiRRG1u-2MsSQLbXA"/>
 <title>Veritasium</title>
 <link rel="alternate" href="https://www.youtube.com/channel/UCHnyfMqiRRG1u-2MsSQLbXA"/>
 <entry>
  <id>yt:video:abc123DEF45</id>
  <yt:videoId>abc123DEF45</yt:videoId>
  <title>Why &amp; how things fall</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=abc123DEF45"/>
  <author><name>Veritasium</name></author>
  <published>2026-10-20T14:00:00+00:00</published>
  <media:group>
   <media:thumbnail url="https://i2.ytimg.com/vi/abc123DEF45/hqdefault.jpg" width="480" height="360"/>
   <media:description>A video about gravity.</media:description>
  </media:group>
 </entry>
</feed>`;

const RSS = `<?xml version="1.0"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title><![CDATA[The Example Blog]]></title>
  <link>https://blog.example.com/</link>
  <atom:link href="https://blog.example.com/feed" rel="self" type="application/rss+xml"/>
  <item>
    <title>Second post</title>
    <link>https://blog.example.com/second</link>
    <guid isPermaLink="false">post-2</guid>
    <dc:creator>Ada</dc:creator>
    <pubDate>Mon, 26 Oct 2026 09:00:00 GMT</pubDate>
    <description>&lt;p&gt;Hello &lt;b&gt;world&lt;/b&gt;&lt;/p&gt;&lt;img src="/img/cover.png"&gt;</description>
  </item>
  <item>
    <title>First post</title>
    <link>https://blog.example.com/first</link>
    <pubDate>Sun, 25 Oct 2026 09:00:00 GMT</pubDate>
    <enclosure url="https://cdn.example.com/a.jpg" type="image/jpeg" length="1"/>
  </item>
</channel>
</rss>`;

const BLUESKY = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>@bsky.app - Bluesky</title><link>https://bsky.app/profile/bsky.app</link>
<item><link>https://bsky.app/profile/bsky.app/post/3l</link><description>New feature: lists!</description><pubDate>27 Oct 2026 10:00:00 +0000</pubDate><guid isPermaLink="false">at://did:plc:z72/app.bsky.feed.post/3l</guid></item>
</channel></rss>`;

describe("parseFeed", () => {
  it("reads a YouTube channel feed", () => {
    const feed = parseFeed(YOUTUBE, "https://www.youtube.com/feeds/videos.xml?channel_id=UCHnyfMqiRRG1u-2MsSQLbXA")!;
    expect(feed.title).toBe("Veritasium");
    expect(feed.siteUrl).toBe("https://www.youtube.com/channel/UCHnyfMqiRRG1u-2MsSQLbXA");
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]).toMatchObject({
      id: "abc123DEF45",
      title: "Why & how things fall",
      link: "https://www.youtube.com/watch?v=abc123DEF45",
      image: "https://i2.ytimg.com/vi/abc123DEF45/hqdefault.jpg",
      summary: "A video about gravity.",
      author: "Veritasium",
      publishedAt: "2026-10-20T14:00:00.000Z",
    });
  });

  it("reads RSS 2.0 with CDATA, escaped HTML and relative images", () => {
    const feed = parseFeed(RSS, "https://blog.example.com/feed")!;
    expect(feed.title).toBe("The Example Blog");
    expect(feed.items.map((item) => item.id)).toEqual(["post-2", "https://blog.example.com/first"]);
    expect(feed.items[0].summary).toBe("Hello world");
    expect(feed.items[0].image).toBe("https://blog.example.com/img/cover.png");
    expect(feed.items[0].author).toBe("Ada");
    expect(feed.items[1].image).toBe("https://cdn.example.com/a.jpg");
  });

  it("keeps title-less posts (Bluesky) by their link", () => {
    const feed = parseFeed(BLUESKY, "https://bsky.app/profile/bsky.app/rss")!;
    expect(feed.items[0]).toMatchObject({ title: "", summary: "New feature: lists!", link: "https://bsky.app/profile/bsky.app/post/3l" });
  });

  it("says no to pages that are not feeds", () => {
    expect(parseFeed("<!doctype html><html><head><title>x</title></head></html>", "https://a.com")).toBeNull();
  });
});

describe("feedUrlFor", () => {
  it("knows where the big sites keep their feeds", () => {
    expect(feedUrlFor("https://www.youtube.com/channel/UCHnyfMqiRRG1u-2MsSQLbXA")).toEqual({
      url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCHnyfMqiRRG1u-2MsSQLbXA",
      kind: "youtube",
    });
    expect(feedUrlFor("https://www.youtube.com/playlist?list=PLxyz1234567")?.url).toBe(
      "https://www.youtube.com/feeds/videos.xml?playlist_id=PLxyz1234567",
    );
    expect(feedUrlFor("https://old.reddit.com/r/boardgames/")).toEqual({ url: "https://www.reddit.com/r/boardgames/.rss", kind: "reddit" });
    expect(feedUrlFor("https://www.reddit.com/r/boardgames/top")?.url).toBe("https://www.reddit.com/r/boardgames/top/.rss");
    expect(feedUrlFor("https://bsky.app/profile/bsky.app")).toEqual({ url: "https://bsky.app/profile/bsky.app/rss", kind: "bluesky" });
    expect(feedUrlFor("https://github.com/godotengine/godot")).toEqual({ url: "https://github.com/godotengine/godot/releases.atom", kind: "github" });
    expect(feedUrlFor("https://github.com/godotengine/godot/tags")?.url).toBe("https://github.com/godotengine/godot/tags.atom");
    expect(feedUrlFor("https://mastodon.social/@Gargron")).toEqual({ url: "https://mastodon.social/@Gargron.rss", kind: "mastodon" });
    expect(feedUrlFor("https://mastodon.social/@Gargron.rss")?.url).toBe("https://mastodon.social/@Gargron.rss");
    expect(feedUrlFor("https://medium.com/@someone")?.url).toBe("https://medium.com/feed/@someone");
  });

  it("leaves the rest to a fetch", () => {
    expect(feedUrlFor("https://www.youtube.com/@veritasium")).toBeNull();
    expect(feedUrlFor("https://www.theverge.com")).toBeNull();
    expect(feedUrlFor("https://github.com/settings/profile")).toBeNull();
    expect(feedUrlFor("not a url")).toBeNull();
  });
});

describe("discoverFeedLink", () => {
  it("follows <link rel=alternate> on a page", () => {
    const html = `<head><link rel="stylesheet" href="/a.css"><link rel="alternate" type="application/rss+xml" title="RSS" href="/rss/index.xml"></head>`;
    expect(discoverFeedLink(html, "https://www.theverge.com/")).toBe("https://www.theverge.com/rss/index.xml");
    expect(discoverFeedLink("<head></head>", "https://a.com")).toBeNull();
  });
});

describe("newEntries", () => {
  const item = (id: string, publishedAt: string | null): FeedItem => ({ id, title: id, link: "", summary: "", image: null, author: "", publishedAt });

  it("posts only unseen, recent entries, at most three", () => {
    const items = [item("e", "2026-10-27T10:00:00Z"), item("d", "2026-10-27T09:00:00Z"), item("c", "2026-10-27T08:00:00Z"), item("b", "2026-10-27T07:00:00Z"), item("a", "2026-10-27T06:00:00Z")];
    expect(newEntries(items, ["a"], "2026-10-27T05:00:00Z").map((i) => i.id)).toEqual(["e", "d", "c"]);
  });

  it("skips old entries that only now appeared in the feed", () => {
    const items = [item("new", "2026-10-27T10:00:00Z"), item("ancient", "2020-01-01T00:00:00Z")];
    expect(newEntries(items, [], "2026-10-27T09:00:00Z").map((i) => i.id)).toEqual(["new"]);
  });
});

describe("plainText", () => {
  it("flattens HTML and caps the length", () => {
    expect(plainText("<p>One</p><p>Two &amp; three</p>", 100)).toBe("One\nTwo & three");
    expect(plainText("a".repeat(20), 10)).toBe(`${"a".repeat(9)}…`);
  });
});

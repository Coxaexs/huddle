import { describe, expect, it } from "vitest";
import {
  fetchDiscordExpressions,
  isAllowedDiscordAssetUrl,
  layoutFromDiscord,
  looksLikeDiscordTemplate,
  permissionsFromDiscord,
  summarize,
  templateCode,
} from "./discord-import";
import { Permission } from "./permissions";
import { TEMPLATE_GUILD } from "../test/fixtures/discord-template";


describe("templateCode", () => {
  it("reads discord.new and discord.com/template links, and bare codes", () => {
    expect(templateCode("https://discord.new/sFFx5PSzPups")).toBe("sFFx5PSzPups");
    expect(templateCode("discord.com/template/abcDEF123456")).toBe("abcDEF123456");
    expect(templateCode("https://discordapp.com/template/XyZ98765")).toBe("XyZ98765");
    expect(templateCode("abcDEF123456")).toBe("abcDEF123456");
    expect(templateCode("My Cool Server")).toBeNull();
    expect(templateCode("")).toBeNull();
  });

  it("tells a template link from a server name", () => {
    expect(looksLikeDiscordTemplate("https://discord.new/sFFx5PSzPups")).toBe(true);
    expect(looksLikeDiscordTemplate("Discord friends")).toBe(false);
  });
});

describe("permissionsFromDiscord", () => {
  it("maps Discord's bits to Hoffle's", () => {
    expect(permissionsFromDiscord("8")).toBe(Permission.ADMINISTRATOR);
    expect(permissionsFromDiscord("1024")).toBe(Permission.VIEW_CHANNEL);
    expect(permissionsFromDiscord(String(1n << 20n | 1n << 21n))).toBe(Permission.CONNECT | Permission.SPEAK);
  });

  it("gives Manage Messages channel moderation too", () => {
    const p = permissionsFromDiscord(String(1n << 13n));
    expect(p & Permission.MANAGE_MESSAGES).toBeTruthy();
    expect(p & Permission.MODERATE).toBeTruthy();
  });

  it("copes with bitfields too big for a JS number, and with junk", () => {
    expect(permissionsFromDiscord(String((1n << 50n) | 8n))).toBe(Permission.ADMINISTRATOR);
    expect(permissionsFromDiscord("not a number")).toBe(0);
    expect(permissionsFromDiscord(null)).toBe(0);
  });
});

describe("layoutFromDiscord", () => {
  const { layout, skipped } = layoutFromDiscord(TEMPLATE_GUILD.roles, TEMPLATE_GUILD.channels, "0");

  it("keeps roles (not @everyone) with permissions and colors", () => {
    expect(layout.roles?.map((r) => r.name)).toEqual(["Players", "Game Master", "Mods"]);
    expect(layout.roles?.[0].color).toBe("#6b03eb");
    expect(layout.roles?.[1].permissions).toBe(Permission.ADMINISTRATOR);
    expect(layout.roles?.[2].permissions).toBe(Permission.MANAGE_MESSAGES | Permission.MODERATE | Permission.KICK_MEMBERS);
    expect(layout.everyonePermissions).toBeGreaterThan(0);
  });

  it("orders channels the way Discord shows them: text above voice, by position", () => {
    expect(layout.channels?.map((c) => c.name)).toEqual(["rules"]);
    expect(layout.categories?.map((c) => [c.name, c.channels.map((ch) => ch.name)])).toEqual([
      ["Text", ["general", "gm-room", "Table"]],
      ["Voice", ["slow", "Stage"]],
    ]);
    expect(layout.categories?.[1].channels[1].kind).toBe("stage");
    expect(skipped).toBe(1);
  });

  it("brings slowmode, NSFW and topics along", () => {
    const slow = layout.categories?.[1].channels[0];
    expect(slow).toMatchObject({ slowmode: 30, nsfw: true, topic: "take it easy" });
  });

  it("turns Discord's overwrites into channel permissions, minus Discord-only members", () => {
    const gm = layout.categories?.[0].channels[1];
    expect(gm?.overwrites).toEqual([
      { target: "everyone", allow: 0, deny: Permission.VIEW_CHANNEL },
      { target: "role", roleRef: "3", allow: Permission.VIEW_CHANNEL, deny: 0 },
    ]);
    expect(summarize("Hero", "", layout, skipped).privateChannels).toEqual(["gm-room"]);
  });
});

describe("Discord expression asset importer", () => {
  it("enforces strict Discord CDN allowlist to prevent SSRF", () => {
    expect(isAllowedDiscordAssetUrl("https://cdn.discordapp.com/emojis/12345.png")).toBe(true);
    expect(isAllowedDiscordAssetUrl("https://media.discordapp.net/stickers/999.gif")).toBe(true);
    expect(isAllowedDiscordAssetUrl("http://cdn.discordapp.com/emojis/123.png")).toBe(false);
    expect(isAllowedDiscordAssetUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isAllowedDiscordAssetUrl("https://evil.example.com/a.png")).toBe(false);
  });

  it("maps custom emojis and raster stickers while counting skipped Lottie stickers", async () => {
    const fakeFetch = (async (url: RequestInfo | URL) => {
      if (String(url).endsWith("/emojis")) {
        return Response.json([
          { id: "111222333", name: "PartyBlob!", animated: true },
          { id: "444555666", name: "roll20", animated: false },
        ]);
      }
      return Response.json([
        { id: "777", name: "High Five", format_type: 1 },
        { id: "888", name: "Vector Sticker", format_type: 3 },
        { id: "999", name: "DanceGif", format_type: 4 },
      ]);
    }) as unknown as typeof fetch;

    const result = await fetchDiscordExpressions("123456789012345678", "bot-tok", fakeFetch);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.skippedLottie).toBe(1);
      expect(result.emojis).toHaveLength(2);
      expect(result.emojis[0]).toMatchObject({ name: "partyblob", animated: true, ext: "gif" });
      expect(result.stickers).toHaveLength(2);
      expect(result.stickers[0]).toMatchObject({ name: "high_five", ext: "png" });
      expect(result.stickers[1]).toMatchObject({ name: "dancegif", animated: true, ext: "gif" });
    }
  });
});

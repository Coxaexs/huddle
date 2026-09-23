import { describe, expect, it } from "vitest";
import { memberFromRow, publicUser, type MemberRow } from "../lib/auth";
import {
  bannerBackground,
  isSafeProfileImage,
  lastSeenLabel,
  normalizeSocialLinks,
  statusSeenBy,
} from "../lib/users";

const baseRow: MemberRow = {
  id: "u1",
  username: "sam",
  display_name: "Sam",
  avatar: "S",
  color: "#fff",
  is_admin: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  last_seen_at: "2026-01-02T00:00:00.000Z",
};

describe("statusSeenBy", () => {
  it("hides invisible from everyone but the person themselves", () => {
    expect(statusSeenBy("invisible", false)).toBe("online");
    expect(statusSeenBy("invisible", true)).toBe("invisible");
    expect(statusSeenBy("dnd", false)).toBe("dnd");
    expect(statusSeenBy(null, false)).toBe("online");
    expect(statusSeenBy("weird", false)).toBe("online");
  });
});

describe("normalizeSocialLinks", () => {
  it("keeps http(s) links and drops other schemes", () => {
    expect(
      normalizeSocialLinks([
        { platform: "github", url: "https://github.com/sam" },
        { platform: "site", url: "sam.example", label: " me " },
        { platform: "evil", url: "javascript:alert(1)" },
        { platform: "evil", url: "data:text/html,hi" },
        { platform: 5, url: "https://x.example" },
        "nonsense",
      ]),
    ).toEqual([
      { platform: "github", url: "https://github.com/sam" },
      { platform: "site", url: "https://sam.example", label: "me" },
    ]);
  });
});

describe("profile images", () => {
  it("only accepts uploads, signed proxy links and (for banners) gradients", () => {
    expect(isSafeProfileImage("/hangout/api/uploads/abc--pic%20one.png")).toBe(true);
    expect(isSafeProfileImage("/api/uploads/abc.png")).toBe(true);
    expect(
      isSafeProfileImage(
        `/hangout/api/unfurl/image?url=https%3A%2F%2Fx.example%2Fa.png&sig=${"a".repeat(32)}`,
      ),
    ).toBe(true);
    expect(isSafeProfileImage("https://tracker.example/pixel.gif")).toBe(false);
    expect(isSafeProfileImage("//tracker.example/pixel.gif")).toBe(false);
    expect(isSafeProfileImage("/hangout/api/uploads/../../x")).toBe(false);
    expect(isSafeProfileImage("linear-gradient(135deg, #0575e6, #00f260)")).toBe(false);
    expect(isSafeProfileImage("linear-gradient(135deg, #0575e6, #00f260)", true)).toBe(true);
    expect(isSafeProfileImage("linear-gradient(135deg, #000, url(https://x.example))", true)).toBe(
      false,
    );
  });

  it("renders gradient presets as gradients, not url()s", () => {
    expect(bannerBackground("linear-gradient(135deg, #0575e6, #00f260)", "red")).toBe(
      "linear-gradient(135deg, #0575e6, #00f260)",
    );
    expect(bannerBackground("/api/uploads/a.png", "red")).toBe(
      'url("/api/uploads/a.png") center/cover no-repeat',
    );
    expect(bannerBackground(null, "red")).toBe("red");
  });
});

describe("user serialization", () => {
  it("drops unsafe stored images and links for everyone", () => {
    const row: MemberRow = {
      ...baseRow,
      avatar_url: "https://tracker.example/me.png",
      banner_url: "linear-gradient(135deg, #0575e6, #00f260)",
      social_links: JSON.stringify([{ platform: "x", url: "javascript:alert(1)" }]),
      spotify_activity: JSON.stringify({
        song: "Song",
        artist: "Artist",
        albumArt: "https://tracker.example/art.png",
      }),
    };
    const own = publicUser(row);
    expect(own.avatarUrl).toBeNull();
    expect(own.bannerUrl).toBe("linear-gradient(135deg, #0575e6, #00f260)");
    expect(own.socialLinks).toEqual([]);
    expect(own.spotifyActivity).toEqual({ song: "Song", artist: "Artist" });
  });

  it("applies nicknames and masks invisible for other viewers", () => {
    const row: MemberRow = { ...baseRow, status: "invisible", nickname: "Sammy" };
    const seenByOther = memberFromRow(row, "someone-else");
    expect(seenByOther.displayName).toBe("Sammy");
    expect(seenByOther.globalName).toBe("Sam");
    expect(seenByOther.nickname).toBe("Sammy");
    expect(seenByOther.status).toBe("online");
    expect(memberFromRow(row, "u1").status).toBe("invisible");

    const plain = memberFromRow({ ...baseRow, nickname: "  " }, "x");
    expect(plain.displayName).toBe("Sam");
    expect(plain.nickname).toBeNull();
  });

  it("does not leak private preferences into the member list", () => {
    const member = memberFromRow(
      { ...baseRow, quick_reactions: '["👍"]', hidden_emojis: '["x"]' },
      "x",
    ) as unknown as Record<string, unknown>;
    expect(member.quickReactions).toBeUndefined();
    expect(member.hiddenEmojis).toBeUndefined();
  });
});

describe("lastSeenLabel", () => {
  const now = Date.parse("2026-09-22T12:00:00.000Z");
  it("describes how long ago someone was around", () => {
    expect(lastSeenLabel(null, now)).toBeNull();
    expect(lastSeenLabel("garbage", now)).toBeNull();
    expect(lastSeenLabel("2026-09-22T11:59:40.000Z", now)).toBe("Last seen just now");
    expect(lastSeenLabel("2026-09-22T11:55:00.000Z", now)).toBe("Last seen 5m ago");
    expect(lastSeenLabel("2026-09-22T09:00:00.000Z", now)).toBe("Last seen 3h ago");
    expect(lastSeenLabel("2026-09-20T12:00:00.000Z", now)).toBe("Last seen 2d ago");
  });
});

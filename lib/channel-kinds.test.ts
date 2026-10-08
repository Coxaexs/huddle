import { describe, expect, it } from "vitest";
import {
  CHANNEL_KINDS,
  CREATABLE_CHANNEL_KINDS,
  channelKindInfo,
  channelNameRules,
  isChannelKind,
  isCreatableKind,
  mayPostInKind,
  normalizeChannelName,
  textChannelKindsSql,
  voiceChannelKindsSql,
} from "@/lib/channel-kinds";

describe("channel kind registry", () => {
  it("offers every kind except the internal DM pseudo-kind for creation", () => {
    expect(CREATABLE_CHANNEL_KINDS).not.toContain("dm");
    expect(CREATABLE_CHANNEL_KINDS).toContain("announcement");
    expect(CREATABLE_CHANNEL_KINDS).toContain("forum");
    expect(CREATABLE_CHANNEL_KINDS).toContain("stage");
  });

  it("describes every kind it declares", () => {
    for (const kind of CHANNEL_KINDS) {
      const info = channelKindInfo(kind);
      expect(info.kind).toBe(kind);
    }
  });

  it("keeps text and voice capabilities mutually exclusive", () => {
    for (const kind of CHANNEL_KINDS) {
      const info = channelKindInfo(kind);
      expect(info.text && info.voice).toBe(false);
      // Every kind must be able to hold something, or it is dead weight in the UI.
      expect(info.text || info.voice).toBe(true);
    }
  });

  it("treats stage as a voice room, because an audience is what makes it one", () => {
    const stage = channelKindInfo("stage");
    expect(stage.voice).toBe(true);
    expect(stage.text).toBe(false);
    expect(stage.appearsAsVoice).toBe(true);
  });

  it("treats forum as a text board whose posts are threads", () => {
    const forum = channelKindInfo("forum");
    expect(forum.text).toBe(true);
    expect(forum.threadContainer).toBe(true);
  });

  it("places every channel in exactly one sidebar area", () => {
    for (const kind of CHANNEL_KINDS) {
      const info = channelKindInfo(kind);
      expect(info.appearsAsVoice).toBe(info.voice);
    }
  });
});

describe("isChannelKind / isCreatableKind", () => {
  it("recognizes the real kinds", () => {
    expect(isChannelKind("text")).toBe(true);
    expect(isChannelKind("dm")).toBe(true);
    expect(isChannelKind("stage")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isChannelKind("thread")).toBe(false);
    expect(isChannelKind("")).toBe(false);
    expect(isChannelKind(null)).toBe(false);
    expect(isChannelKind(7)).toBe(false);
  });

  it("separates creatable kinds from the internal one", () => {
    expect(isCreatableKind("forum")).toBe(true);
    expect(isCreatableKind("dm")).toBe(false);
  });
});

describe("channelKindInfo fallback", () => {
  it("renders an unknown kind as a plain text channel", () => {
    // A row from an older build, or one hand-edited, must still appear rather
    // than vanish from the sidebar.
    for (const unknown of ["thread", "", null, undefined, "guild-news"]) {
      const info = channelKindInfo(unknown as string | null | undefined);
      expect(info.kind).toBe("text");
      expect(info.text).toBe(true);
    }
  });
});

describe("mayPostInKind", () => {
  it("lets anyone post in a normal text channel", () => {
    expect(mayPostInKind("text", false)).toBe(true);
  });

  it("restricts announcements to moderators", () => {
    expect(mayPostInKind("announcement", false)).toBe(false);
    expect(mayPostInKind("announcement", true)).toBe(true);
  });

  it("does not restrict a forum", () => {
    // A board where only moderators can post has no reason to exist.
    expect(mayPostInKind("forum", false)).toBe(true);
  });

  it("treats an unknown kind permissively, like the text fallback it becomes", () => {
    expect(mayPostInKind("something-new", false)).toBe(true);
  });
});

describe("textChannelKindsSql", () => {
  it("lists exactly the kinds that accept messages", () => {
    const sql = textChannelKindsSql();
    expect(sql).toContain("'text'");
    expect(sql).toContain("'dm'");
    expect(sql).toContain("'announcement'");
    expect(sql).toContain("'forum'");
    // Voice rooms cannot take messages, so they must not be accepted here.
    expect(sql).not.toContain("'voice'");
    expect(sql).not.toContain("'stage'");
  });
});

describe("voiceChannelKindsSql", () => {
  it("lists voice rooms and stages, so moderation reaches both", () => {
    const sql = voiceChannelKindsSql();
    expect(sql).toContain("'voice'");
    expect(sql).toContain("'stage'");
    expect(sql).not.toContain("'text'");
    expect(sql).not.toContain("'dm'");
  });
});

describe("normalizeChannelName", () => {
  it("slugs text-like names", () => {
    expect(normalizeChannelName("text", "  General Chat  ")).toBe("general-chat");
    expect(normalizeChannelName("announcement", "Patch Notes!")).toBe("patch-notes");
    expect(normalizeChannelName("forum", "Help & Support")).toBe("help-support");
  });

  it("keeps non-latin names instead of stripping them to nothing", () => {
    // A channel named in Japanese should survive; only `#mention` breakers go.
    expect(normalizeChannelName("text", "日本語")).toBe("日本語");
    expect(normalizeChannelName("text", "Общий")).toBe("общий");
  });

  it("leaves voice-room names pretty", () => {
    expect(normalizeChannelName("voice", "Kitchen Table")).toBe("Kitchen Table");
    expect(normalizeChannelName("stage", "Friday Standup")).toBe("Friday Standup");
  });

  it("caps length per kind", () => {
    expect(normalizeChannelName("text", "x".repeat(80))).toHaveLength(25);
    expect(normalizeChannelName("voice", "y".repeat(80))).toHaveLength(40);
  });

  it("returns empty for a name with nothing usable left", () => {
    expect(normalizeChannelName("text", "!!!")).toBe("");
    expect(normalizeChannelName("text", "   ")).toBe("");
    expect(normalizeChannelName("voice", undefined)).toBe("");
  });
});

describe("channelNameRules", () => {
  it("reports the shape each kind uses", () => {
    expect(channelNameRules("text")).toEqual({ maxLength: 25, slug: true });
    expect(channelNameRules("voice")).toEqual({ maxLength: 40, slug: false });
    expect(channelNameRules("unknown")).toEqual({ maxLength: 25, slug: true });
  });
});

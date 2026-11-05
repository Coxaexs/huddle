import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));
import { followCopy, type FollowSource } from "./channel-follows";
import type { StoredMessage } from "./storage";

const source: FollowSource = {
  channelId: "news",
  channelName: "news",
  serverId: "hoffle",
  serverName: "Hoffle",
  serverAvatar: "h",
  serverColor: "#7c3aed",
  serverIconUrl: "/hangout/api/uploads/icon.png",
};

const original: StoredMessage = {
  id: "m1",
  channel: "news",
  channel_id: "news",
  user_id: "kiwi",
  author: "mewis",
  avatar: "K",
  color: "#000",
  content: "Patch notes: @everyone voice is better now",
  attachment_key: "/hangout/api/uploads/shot.png",
  attachments: '["/hangout/api/uploads/two.png"]',
  is_bot: 0,
  created_at: "2026-11-05T10:00:00Z",
  payload: JSON.stringify({ imageAlts: { "/hangout/api/uploads/shot.png": "the new voice panel" }, botId: "x" }),
};

describe("followCopy", () => {
  it("copies the post, signed with the source server and channel", () => {
    const copy = followCopy(source, original, { id: "general", name: "general" }, "2026-11-05T10:00:01Z", "c1");
    expect(copy).toMatchObject({
      id: "c1",
      channel_id: "general",
      user_id: null,
      author: "Hoffle #news",
      avatar: "h",
      content: original.content,
      attachment_key: original.attachment_key,
      attachments: original.attachments,
      is_bot: 1,
      thread_id: null,
    });
    const payload = JSON.parse(copy.payload!);
    expect(payload.followedFrom).toEqual({
      serverId: "hoffle",
      serverName: "Hoffle",
      channelId: "news",
      channelName: "news",
      messageId: "m1",
    });
    // It never pings the following server, and keeps the image description.
    expect(payload.silent).toBe(true);
    expect(payload.imageAlts).toEqual({ "/hangout/api/uploads/shot.png": "the new voice panel" });
    expect(payload.avatarUrl).toBe("/hangout/api/uploads/icon.png");
    expect(payload.botId).toBeUndefined();
  });

  it("only uses an uploaded server icon as the picture", () => {
    const copy = followCopy({ ...source, serverIconUrl: "https://evil.example/x.png" }, original, { id: "g", name: "g" });
    expect(JSON.parse(copy.payload!).avatarUrl).toBeUndefined();
  });

  it("carries a bot post's embeds", () => {
    const embeds = [{ title: "Release 1.2" }];
    const copy = followCopy(source, { ...original, payload: JSON.stringify({ embeds, components: [{}] }) }, { id: "g", name: "g" });
    expect(JSON.parse(copy.payload!)).toMatchObject({ embeds, components: [] });
  });
});

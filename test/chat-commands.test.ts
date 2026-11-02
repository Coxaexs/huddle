// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn<(url: string, init?: { body?: string }) => Promise<unknown>>(async () => ({}));
vi.mock("@/app/lib/client", () => ({ apiFetch: (url: string, init?: { body?: string }) => apiFetch(url, init) }));

import { runRollCommand } from "@/app/lib/chat/commands/roll";
import { runRecordCommand } from "@/app/lib/chat/commands/record";
import { runWatchCommand } from "@/app/lib/chat/commands/watch";
import { runMusicCommand } from "@/app/lib/chat/commands/music";
import { runLookupCommand } from "@/app/lib/chat/commands/lookup";
import type { RecordingState } from "@/lib/protocol";

const body = (call = 0) => JSON.parse(apiFetch.mock.calls[call][1]?.body || "{}");

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockResolvedValue({});
  window.localStorage.clear();
});

describe("/roll", () => {
  it("sends the command with the dice settings and both channels, then starts the dice", async () => {
    window.localStorage.setItem("huddle_dice_color", "#ff0000");
    window.localStorage.setItem("huddle_dice_material", "metal");
    const roll = { animationSeed: "seed-1" };
    apiFetch.mockResolvedValueOnce({ text: "You rolled 14.", roll });
    const postBotMessage = vi.fn(async () => {});
    const onRoll = vi.fn();
    await runRollCommand("/roll 1d20", { voiceChannelId: "voice-1", textChannelId: "general", postBotMessage, onRoll });
    expect(apiFetch.mock.calls[0][0]).toBe("/api/integrations/dnd/roll");
    expect(body()).toMatchObject({ command: "/roll 1d20", themeColor: "#ff0000", material: "metal", channelId: "voice-1", textChannelId: "general" });
    expect(body().texture).toBeUndefined();
    expect(onRoll).toHaveBeenCalledWith(roll);
    expect(postBotMessage).toHaveBeenCalledWith("You rolled 14.", expect.objectContaining({ author: "D&D Bot" }));
  });

  it("posts the server's error as the D&D bot and rolls nothing", async () => {
    apiFetch.mockResolvedValueOnce({ error: "I can't read 1q20." });
    const postBotMessage = vi.fn(async () => {});
    const onRoll = vi.fn();
    await runRollCommand("/roll 1q20", { voiceChannelId: null, textChannelId: "general", postBotMessage, onRoll });
    expect(onRoll).not.toHaveBeenCalled();
    expect(postBotMessage).toHaveBeenCalledWith("I can't read 1q20.", { author: "D&D Bot", avatar: "⚔" });
  });
});

describe("/record", () => {
  const recording = {
    id: "rec-1",
    title: "Session 4",
    status: "recording",
    consents: [{ decision: "accepted" }, { decision: "pending" }],
  } as unknown as RecordingState;
  function ctx(overrides = {}) {
    return { enabled: true, voiceChannelId: "voice-1", recordings: { "voice-1": recording }, notify: vi.fn(), openStage: vi.fn(), ...overrides };
  }

  it("says so when recording is disabled or you are not in voice", async () => {
    const off = ctx({ enabled: false });
    await runRecordCommand("start", off);
    expect(off.notify).toHaveBeenCalledWith("Session recording is disabled on this Hoffle.");
    const away = ctx({ voiceChannelId: null });
    await runRecordCommand("start", away);
    expect(away.notify).toHaveBeenCalledWith("Join the voice room you want to record first.");
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("reports status, with consent counts", async () => {
    const c = ctx();
    await runRecordCommand("status", c);
    expect(c.notify).toHaveBeenCalledWith("Session 4: recording · 1/2 consented.");
  });

  it("opens the stage for setup", async () => {
    const c = ctx();
    await runRecordCommand("setup", c);
    expect(c.openStage).toHaveBeenCalledWith("voice-1");
  });

  it("sends a marker with its name, and rejects unknown subcommands", async () => {
    await runRecordCommand("marker Boss fight", ctx());
    expect(body()).toEqual({ action: "marker", sessionId: "rec-1", name: "Boss fight", kind: "chapter" });
    const c = ctx();
    await runRecordCommand("explode", c);
    expect(c.notify).toHaveBeenCalledWith(expect.stringMatching(/^Use \/record setup/));
  });
});

describe("/watch and /reels", () => {
  const url = (call: number) => apiFetch.mock.calls[call][0];

  it("asks you to join voice first", async () => {
    const postBotMessage = vi.fn(async () => {});
    await runWatchCommand("watch", { voiceChannelId: null, channelTitle: "#general", postBotMessage, onActivity: vi.fn() });
    expect(postBotMessage).toHaveBeenCalledWith(expect.stringMatching(/Join a Hoffle voice room first/));
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("opens Watch Together as the voice room's activity, with no link to share", async () => {
    apiFetch.mockResolvedValueOnce({ activity: null }).mockResolvedValueOnce({ activity: { kind: "watch" } });
    const onActivity = vi.fn();
    const postBotMessage = vi.fn(async () => {});
    await runWatchCommand("watch", { voiceChannelId: "voice-1", channelTitle: "#general", postBotMessage, onActivity });
    expect(url(0)).toBe("/api/activities?channelId=voice-1");
    expect(url(1)).toBe("/api/activities");
    expect(body(1)).toMatchObject({ channelId: "voice-1", action: "open", kind: "watch", state: { title: "Watch Together" } });
    expect(onActivity).toHaveBeenCalledWith({ kind: "watch" }, "voice-1");
    expect(postBotMessage).toHaveBeenLastCalledWith(expect.stringMatching(/Watch Together is open/));
  });

  it("queues a link on Watch Together when the room has it open", async () => {
    apiFetch.mockResolvedValueOnce({ activity: { kind: "watch" } }).mockResolvedValueOnce({ ok: true });
    const postBotMessage = vi.fn(async () => {});
    const sendLoungeSet = vi.fn();
    await runWatchCommand("watch", { voiceChannelId: "voice-1", channelTitle: "#general", postBotMessage, onActivity: vi.fn(),
      what: "https://youtu.be/abc", sendLoungeSet });
    expect(url(1)).toBe("/api/integrations/musicwatch");
    expect(body(1)).toEqual({ channelId: "voice-1", action: "add", q: "https://youtu.be/abc" });
    expect(sendLoungeSet).not.toHaveBeenCalled();
    expect(postBotMessage).toHaveBeenCalledWith(expect.stringMatching(/Added to Watch Together/));
  });

  it("opens Reels Together and passes on your topics", async () => {
    apiFetch.mockResolvedValueOnce({ activity: null }).mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ activity: { kind: "reels" } });
    const onActivity = vi.fn();
    const postBotMessage = vi.fn(async () => {});
    await runWatchCommand("reels", { voiceChannelId: "voice-1", channelTitle: "#general", postBotMessage, onActivity, what: "cats, street food" });
    expect(body(1)).toEqual({ channelId: "voice-1", action: "seed", q: "cats, street food" });
    expect(body(2)).toMatchObject({ action: "open", kind: "reels" });
    expect(onActivity).toHaveBeenCalledWith({ kind: "reels" }, "voice-1");
  });

  it("says why when the server has no music bot", async () => {
    apiFetch.mockResolvedValueOnce({ activity: null }).mockRejectedValueOnce(new Error("The Music Bot isn't in this server yet."));
    const postBotMessage = vi.fn(async () => {});
    await runWatchCommand("reels", { voiceChannelId: "voice-1", channelTitle: "#general", postBotMessage, onActivity: vi.fn() });
    expect(postBotMessage).toHaveBeenLastCalledWith("The Music Bot isn't in this server yet.");
  });
});

describe("music commands", () => {
  function ctx(overrides = {}) {
    return {
      voiceChannelId: null as string | null,
      voiceChannels: [{ id: "lounge" }, { id: "party" }],
      players: { party: { track: { id: "t1" } } } as never,
      activeChannelId: "general",
      userName: "Alice",
      primePlayer: vi.fn(),
      notify: vi.fn(),
      ...overrides,
    };
  }

  it("needs voice for playback commands", async () => {
    const c = ctx();
    await runMusicCommand("play", "never gonna", "/play never gonna", c);
    expect(c.notify).toHaveBeenCalledWith(expect.stringMatching(/Join a voice channel first to use \/play/));
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("targets the room that is playing when you are not in one", async () => {
    await runMusicCommand("queue", "", "/queue", ctx());
    expect(body()).toMatchObject({ command: "/queue", voiceChannelId: "party", textChannelId: "general", commandBy: "Alice" });
  });

  it("primes the player for playback from your own room", async () => {
    const c = ctx({ voiceChannelId: "lounge" });
    await runMusicCommand("play", "song", "/play song", c);
    expect(c.primePlayer).toHaveBeenCalled();
    expect(body()).toMatchObject({ command: "/play song", voiceChannelId: "lounge" });
  });
});

describe("D&D lookups", () => {
  it("hints when there is nothing to look up", async () => {
    const notify = vi.fn();
    await runLookupCommand("spell", "", { postBotMessage: vi.fn(async () => {}), notify });
    expect(notify).toHaveBeenCalledWith("Try `/spell fireball`.");
  });

  it("posts the card from the lookup", async () => {
    apiFetch.mockResolvedValueOnce({ text: "Fireball", link: "https://5e.tools/x", kind: "dnd-card" });
    const postBotMessage = vi.fn(async () => {});
    await runLookupCommand("spell", "fireball", { postBotMessage, notify: vi.fn() });
    expect(body()).toEqual({ kind: "spell", query: "fireball" });
    expect(postBotMessage).toHaveBeenCalledWith("Fireball", expect.objectContaining({ actionLabel: "Open on 5e.tools", kind: "dnd-card" }));
  });
});

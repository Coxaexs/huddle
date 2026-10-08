// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn(async () => ({}));
vi.mock("@/app/lib/client", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...(args as [])) }));

const synthesize = vi.fn(async () => ({ audio: new Float32Array(10), sampleRate: 24000 }));
vi.mock("@/app/lib/tts/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/lib/tts/client")>()),
  synthesize: (...args: unknown[]) => synthesize(...(args as [])),
}));

import { runSpeechCommand, speechLanguage, type SpeechContext } from "@/app/lib/chat/speech-commands";
import { getTtsVoice } from "@/app/lib/tts/client";
import { SAY_MAX_CHARS } from "@/app/hooks/use-voice";

function context(overrides: Partial<SpeechContext> = {}) {
  const notices: string[] = [];
  const speakIntoCall = vi.fn(async () => "sent" as const);
  const ctx: SpeechContext = {
    activeChannelId: "general",
    voiceChannelId: "kitchen-table",
    serverMuted: false,
    voice: { forcedMute: false, canSpeak: () => true, speakIntoCall },
    notify: (text) => notices.push(text),
    askLanguage: vi.fn(async () => "en" as const),
    ...overrides,
  };
  return { ctx, notices, speakIntoCall };
}

beforeEach(() => {
  apiFetch.mockClear();
  synthesize.mockClear();
  window.localStorage.clear();
});

describe("speechLanguage", () => {
  it("takes a leading tr/en and strips it", async () => {
    const ask = vi.fn();
    expect(await speechLanguage("tr merhaba", false, ask)).toEqual({ lang: "tr", text: "merhaba" });
    expect(await speechLanguage("EN hello there", false, ask)).toEqual({ lang: "en", text: "hello there" });
    expect(ask).not.toHaveBeenCalled();
  });

  it("detects only when asked to, and asks otherwise", async () => {
    const ask = vi.fn(async () => "en" as const);
    expect(await speechLanguage("çok güzel", true, ask)).toEqual({ lang: "tr", text: "çok güzel" });
    expect(ask).not.toHaveBeenCalled();
    expect(await speechLanguage("çok güzel", false, ask)).toEqual({ lang: "en", text: "çok güzel" });
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("is null when the question is closed", async () => {
    expect(await speechLanguage("gg", false, async () => null)).toBeNull();
  });
});

describe("/tts", () => {
  it("posts the message with its language and the sender's voice", async () => {
    const { ctx } = context();
    await runSpeechCommand("tts", "tr selam millet", ctx);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [url, init] = apiFetch.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe("/api/messages");
    expect(JSON.parse(init.body)).toEqual({
      channelId: "general",
      content: "selam millet",
      payload: { tts: { lang: "tr", voice: getTtsVoice() } },
    });
  });

  it("asks the language rather than guessing", async () => {
    const { ctx } = context();
    await runSpeechCommand("tts", "çok güzel", ctx);
    expect(ctx.askLanguage).toHaveBeenCalledWith("çok güzel");
  });

  it("sends nothing when the language question is closed", async () => {
    const { ctx } = context({ askLanguage: async () => null });
    await runSpeechCommand("tts", "hello", ctx);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("sends nothing while server-muted", async () => {
    const { ctx, notices } = context({ serverMuted: true });
    await runSpeechCommand("tts", "en hello", ctx);
    expect(apiFetch).not.toHaveBeenCalled();
    expect(notices[0]).toMatch(/muted you/);
  });

  it("turns playback on and off", async () => {
    const { ctx, notices } = context();
    await runSpeechCommand("tts", "off", ctx);
    expect(window.localStorage.getItem("huddle_tts_playback")).toBe("off");
    await runSpeechCommand("tts", "on", ctx);
    expect(window.localStorage.getItem("huddle_tts_playback")).toBe("on");
    expect(notices).toHaveLength(2);
  });
});

describe("/say", () => {
  it("synthesizes and speaks into the call", async () => {
    const { ctx, speakIntoCall } = context();
    await runSpeechCommand("say", "en on my way", ctx);
    expect(synthesize).toHaveBeenCalledWith("on my way", "en", getTtsVoice());
    expect(speakIntoCall).toHaveBeenCalledTimes(1);
  });

  it("picks Turkish itself when the text is clearly Turkish", async () => {
    const { ctx } = context();
    await runSpeechCommand("say", "geliyorum şimdi", ctx);
    expect(ctx.askLanguage).not.toHaveBeenCalled();
    expect(synthesize).toHaveBeenCalledWith("geliyorum şimdi", "tr", getTtsVoice());
  });

  it("refuses text over the limit before spending anything on it", async () => {
    const { ctx, notices } = context();
    await runSpeechCommand("say", `en ${"a".repeat(SAY_MAX_CHARS + 1)}`, ctx);
    expect(synthesize).not.toHaveBeenCalled();
    expect(notices[0]).toMatch(String(SAY_MAX_CHARS));
  });

  it("allows exactly the limit, not counting the language prefix", async () => {
    const { ctx } = context();
    await runSpeechCommand("say", `en ${"a ".repeat(SAY_MAX_CHARS / 2).trim()}`, ctx);
    expect(synthesize).toHaveBeenCalled();
  });

  it("makes no speech while muted by a moderator, or when the queue is full", async () => {
    for (const overrides of [
      { serverMuted: true },
      { voice: { forcedMute: true, canSpeak: () => true, speakIntoCall: vi.fn() } },
      { voice: { forcedMute: false, canSpeak: () => false, speakIntoCall: vi.fn() } },
    ] as Array<Partial<SpeechContext>>) {
      const { ctx, notices } = context(overrides);
      await runSpeechCommand("say", "en hello", ctx);
      expect(synthesize).not.toHaveBeenCalled();
      expect(notices).toHaveLength(1);
    }
  });

  it("needs a voice channel", async () => {
    const { ctx, notices } = context({ voiceChannelId: null });
    await runSpeechCommand("say", "en hello", ctx);
    expect(synthesize).not.toHaveBeenCalled();
    expect(notices[0]).toMatch(/Join a voice channel/);
  });
});

describe("/ttsvoice", () => {
  it("saves tempo and pitch, clamped to their ranges", async () => {
    const { ctx } = context();
    await runSpeechCommand("ttsvoice", "tempo 0.1 pitch 0.9", ctx);
    expect(getTtsVoice()).toEqual({ tempo: 0.6, pitch: 0.9, effect: "none", speaker: "default" });
    await runSpeechCommand("ttsvoice", "reset", ctx);
    expect(getTtsVoice()).toEqual({ tempo: 1, pitch: 1, effect: "none", speaker: "default" });
  });

  it("turns the robot voice on and off, keeping tempo and pitch", async () => {
    const { ctx, notices } = context();
    await runSpeechCommand("ttsvoice", "tempo 0.9", ctx);
    await runSpeechCommand("ttsvoice", "robot", ctx);
    expect(getTtsVoice()).toEqual({ tempo: 0.9, pitch: 1, effect: "robot", speaker: "default" });
    expect(notices.at(-1)).toMatch(/robot/);
    await runSpeechCommand("ttsvoice", "effect none", ctx);
    expect(getTtsVoice()).toEqual({ tempo: 0.9, pitch: 1, effect: "none", speaker: "default" });
  });

  it("switches the English voice to male and back", async () => {
    const { ctx, notices } = context();
    await runSpeechCommand("ttsvoice", "male", ctx);
    expect(getTtsVoice().speaker).toBe("male");
    expect(notices.at(-1)).toMatch(/male English voice/);
    await runSpeechCommand("ttsvoice", "female", ctx);
    expect(getTtsVoice().speaker).toBe("default");
  });
});

describe("/ttsstop", () => {
  it("asks the server to stop both the text channel and the voice room", async () => {
    const { ctx } = context();
    await runSpeechCommand("ttsstop", "", ctx);
    const [url, init] = apiFetch.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe("/api/tts/stop");
    expect(JSON.parse(init.body)).toEqual({ channelIds: ["general", "kitchen-table"] });
  });

  it("shows the server's refusal", async () => {
    apiFetch.mockRejectedValueOnce(new Error("Only administrators can force-stop text-to-speech."));
    const { ctx, notices } = context();
    await runSpeechCommand("ttsstop", "", ctx);
    expect(notices).toEqual(["Only administrators can force-stop text-to-speech."]);
  });
});

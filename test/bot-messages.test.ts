import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/hub-client", () => ({ publishMessageEvent: vi.fn() }));

import {
  botPayload,
  mergeBotPayload,
  payloadHasComponent,
  payloadOwner,
} from "../lib/discord/bot-messages";

const buttons = [{ type: 1, components: [{ type: 2, custom_id: "hp-5", label: "-5 HP" }] }];

describe("bot message payloads", () => {
  it("records which bot owns a message's buttons", () => {
    const stored = botPayload("dnd-bot", [{ title: "Sheet" }], buttons);
    expect(payloadOwner(stored)).toBe("dnd-bot");
    expect(payloadHasComponent(stored, "hp-5")).toBe(true);
    expect(payloadHasComponent(stored, "forged")).toBe(false);
  });

  it("stores nothing for a plain text message", () => {
    expect(botPayload("dnd-bot", [], [])).toBeNull();
  });

  it("keeps buttons when an edit only replaces the embed", () => {
    const stored = botPayload("dnd-bot", [{ title: "13 HP" }], buttons);
    const edited = JSON.parse(mergeBotPayload(stored, { embeds: [{ title: "8 HP" }] }, "dnd-bot")!);
    expect(edited.embeds).toEqual([{ title: "8 HP" }]);
    expect(edited.components).toEqual(buttons);
  });

  it("strips buttons when an edit sends an empty component list", () => {
    const stored = botPayload("dnd-bot", [{ title: "Delete?" }], buttons);
    const edited = JSON.parse(mergeBotPayload(stored, { components: [] }, "dnd-bot")!);
    expect(edited.components).toEqual([]);
    expect(edited.embeds).toEqual([{ title: "Delete?" }]);
  });

  it("leaves the payload alone when an edit touches only the text", () => {
    const stored = botPayload("dnd-bot", [{ title: "x" }], buttons);
    expect(mergeBotPayload(stored, {}, "dnd-bot")).toBe(stored);
  });
});

/** /roll: the server parses the dice; this tab rolls them in 3D and posts the result. */
import { apiFetch } from "../../client";
import type { DiceRollEvent } from "@/lib/protocol";
import type { Message } from "../types";
import type { PostBotMessage } from "./types";

export interface RollContext {
  /** The voice room the 3D dice show in, if any. */
  voiceChannelId: string | null;
  /** The text channel the result is posted to. */
  textChannelId: string | null;
  postBotMessage: PostBotMessage;
  /** The server accepted the roll: start the dice animation. */
  onRoll: (roll: DiceRollEvent) => void;
}

export async function runRollCommand(raw: string, ctx: RollContext): Promise<void> {
  const { voiceChannelId, textChannelId, postBotMessage, onRoll } = ctx;
  // Two-phase flow: the roller's 3D dice animation IS the source of truth.
  // 1. Ask the server to parse the command and return the dice structure.
  // 2. Roll the real dice locally; when they settle, submit the actual
  //    values so the server can total them and broadcast to everyone.
  try {
    const activeTheme =
      (typeof document !== "undefined" &&
        document.documentElement.dataset.customThemeId) ||
      "cozy";
    let diceTheme =
      typeof window !== "undefined"
        ? window.localStorage.getItem("huddle_dice_theme") || "default"
        : "default";
    if (diceTheme === "default") {
      if (activeTheme === "vampire") diceTheme = "vampire";
      else if (activeTheme === "dark-academia") diceTheme = "dark-academia";
      else if (activeTheme === "matrix") diceTheme = "matrix";
      else if (activeTheme === "cyberpunk") diceTheme = "cyberpunk";
    }
    const diceColor =
      typeof window !== "undefined"
        ? window.localStorage.getItem("huddle_dice_color") || "#2563eb"
        : "#2563eb";
    const rawMaterial =
      typeof window !== "undefined"
        ? window.localStorage.getItem("huddle_dice_material") || "auto"
        : "auto";
    const diceMaterial = rawMaterial !== "auto" ? rawMaterial : undefined;
    const rawTexture =
      typeof window !== "undefined"
        ? window.localStorage.getItem("huddle_dice_texture") || "auto"
        : "auto";
    const diceTexture = rawTexture !== "auto" ? rawTexture : undefined;

    const data = await apiFetch<{
      text?: string;
      kind?: string;
      payload?: Message["payload"];
      roll?: DiceRollEvent;
      error?: string;
      /** The server already wrote the (verified) card into the channel. */
      posted?: boolean;
    }>("/api/integrations/dnd/roll", {
      method: "POST",
      body: JSON.stringify({
        command: raw,
        theme: diceTheme,
        themeColor: diceColor,
        material: diceMaterial,
        texture: diceTexture,
        channelId: voiceChannelId || undefined,
        textChannelId: textChannelId || undefined,
      }),
    });
    if (data.error) {
      await postBotMessage(data.error, {
        author: "D&D Bot",
        avatar: "⚔",
      });
      return;
    }
    if (data.roll) {
      onRoll(data.roll);
    }
    if (data.posted) return;
    await postBotMessage(data.text || "The roll succeeded.", {
      author: "D&D Bot",
      avatar: "⚔",
      kind: data.kind,
      payload: data.payload,
    });
  } catch (error) {
    await postBotMessage(
      error instanceof Error ? error.message : "The roll failed.",
      { author: "D&D Bot", avatar: "⚔" },
    );
  }
  return;
}

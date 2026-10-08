/** D&D lookups (/spell, /monster, /item …) answered as a card by the D&D bot. */
import { apiFetch } from "../../client";
import type { Message } from "../types";
import type { PostBotMessage } from "./types";

export interface LookupContext {
  postBotMessage: PostBotMessage;
  notify: (text: string) => void;
}

export async function runLookupCommand(name: string, value: string, ctx: LookupContext): Promise<void> {
  const { postBotMessage, notify } = ctx;
  if (!value) {
    notify(`Try \`/${name} ${name === "spell" ? "fireball" : "goblin"}\`.`);
    return;
  }
  try {
    const data = await apiFetch<{
      text: string;
      link?: string;
      kind?: string;
      payload?: Message["payload"];
    }>(
      "/api/integrations/dnd/lookup",
      { method: "POST", body: JSON.stringify({ kind: name, query: value }) },
    );
    await postBotMessage(data.text, {
      author: "D&D Bot",
      avatar: "⚔",
      link: data.link,
      actionLabel: data.link ? "Open on 5e.tools" : undefined,
      kind: data.kind,
      payload: data.payload,
    });
  } catch (error) {
    await postBotMessage(
      error instanceof Error ? error.message : "That lookup failed.",
      { author: "D&D Bot", avatar: "⚔" },
    );
  }
  return;
}

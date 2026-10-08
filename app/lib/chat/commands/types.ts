/** Shared shapes for the slash-command modules. */
import type { Message } from "../types";

/** Posts a bot reply in the current channel (the shell's postBotMessage). */
export type PostBotMessage = (text: string, options?: Partial<Message>) => Promise<void>;

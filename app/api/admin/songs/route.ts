import { INSTANCE_AUDIT } from "@/lib/admin";
import { recordAudit } from "@/lib/audit";
import { botFetch, botSession } from "@/lib/musicbot";
import { requireInstanceAdmin } from "../guard";

export const dynamic = "force-dynamic";

/** One downloaded song in the music bot's library. */
export interface BotSong {
  /** The YouTube id in the file name; null when the file name has none (those cannot be deleted from here). */
  id: string | null;
  title: string;
  artist: string | null;
  file: string;
  size: number;
  /** Stems are on disk for it. */
  stems: boolean;
  /** Its tempo / key / energy analysis is cached. */
  analysed: boolean;
  /** What the AI heard wrong in the audio (a likely corrupted download); empty when fine or not checked. */
  issues?: string[];
}

const YOUTUBE_ID = /^[0-9A-Za-z_-]{11}$/;

/** `?q=`: the bot's downloaded songs whose name contains the text, newest first. */
export async function GET(request: Request) {
  const gate = await requireInstanceAdmin(request);
  if ("response" in gate) return gate.response;
  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 100) ?? "";
  try {
    const data = await botFetch(`/api/library/songs?q=${encodeURIComponent(query)}`, await botSession());
    return Response.json({ songs: Array.isArray(data.songs) ? (data.songs as BotSong[]) : [] });
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : "Could not reach the music bot." }, { status: 502 });
  }
}

/**
 * `{ id, title? }`: delete the song's downloaded file, its stems and its analysis, so the next play downloads it
 * again, analyses it again and splits it into stems again. For songs that got corrupted.
 */
export async function POST(request: Request) {
  const gate = await requireInstanceAdmin(request);
  if ("response" in gate) return gate.response;
  const body = (await request.json().catch(() => ({}))) as { id?: unknown; title?: unknown };
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!YOUTUBE_ID.test(id)) {
    return Response.json({ error: "That song has no YouTube id, so it cannot be reset from here." }, { status: 400 });
  }
  try {
    const result = await botFetch("/api/library/delete", await botSession(), {
      method: "POST",
      body: JSON.stringify({ id }),
    });
    await recordAudit(gate.db, {
      serverId: INSTANCE_AUDIT,
      actor: gate.user,
      action: "song.delete",
      targetId: id,
      targetName: typeof body.title === "string" ? body.title.slice(0, 120) : id,
      detail: `files ${(result.files ?? []).length}${result.stems ? ", stems" : ""}${result.analysis ? ", analysis" : ""}`,
    });
    return Response.json(result);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Could not delete that song.";
    return Response.json({ error: message }, { status: /not in the library/i.test(message) ? 404 : /playing/i.test(message) ? 409 : 502 });
  }
}

import { currentUser, unauthorized } from "@/lib/auth";
import { DEFAULT_ALANIA_VOICE, isAlaniaVoice, SPEECH_HOST } from "@/lib/speech";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

const ENDPOINT = `https://${SPEECH_HOST}/v1/audio/speech`;
/** Same cap as the client's TTS_MAX_CHARS. */
const MAX_CHARS = 400;

/**
 * Turkish text-to-speech through PatientDesk's Alania-2, proxied so
 * SPEECH_API_KEY never reaches the browser. Everyone in a channel synthesizes
 * the same /tts, so answers are cached by text and voice: one billed request
 * per message rather than one per listener.
 *
 * Without SPEECH_API_KEY this answers 501 and the client keeps using its
 * in-browser Turkish model.
 */
export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return unauthorized();

  const key = bindings().SPEECH_API_KEY?.trim();
  if (!key) return Response.json({ error: "SPEECH_API_KEY is not set." }, { status: 501 });

  const body = (await request.json().catch(() => ({}))) as { text?: unknown; voice?: unknown; style?: unknown };
  const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_CHARS) : "";
  if (!text) return Response.json({ error: "Nothing to say." }, { status: 400 });
  const voice = isAlaniaVoice(body.voice) ? body.voice : DEFAULT_ALANIA_VOICE;
  const style = body.style === "slow" || body.style === "fast" ? body.style : undefined;

  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${voice}|${style ?? ""}|${text}`));
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const cacheKey = new Request(`https://tts-cache.internal/alania/${hash}`);
  const cached = await cache?.match(cacheKey).catch(() => undefined);
  if (cached) return cached;

  const upstream = await fetch(ENDPOINT, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: "alania-v2",
      voice,
      input: text,
      response_format: "wav",
      sample_rate: 24000,
      ...(style ? { style } : {}),
    }),
  }).catch(() => null);
  if (!upstream?.ok) {
    const detail = (await upstream?.json().catch(() => null)) as { error?: { message?: string } } | null;
    return Response.json(
      { error: detail?.error?.message || "Speech service is unavailable right now." },
      { status: 502 },
    );
  }

  const response = new Response(await upstream.arrayBuffer(), {
    headers: { "content-type": "audio/wav", "cache-control": "public, max-age=86400" },
  });
  await cache?.put(cacheKey, response.clone()).catch(() => undefined);
  return response;
}

import { currentUser, unauthorized } from "@/lib/auth";
import { bindings } from "@/lib/storage";
import { spellArea, type SpellInfo } from "@/lib/dnd-spells";

export const dynamic = "force-dynamic";

/**
 * Spells for the tabletop's character sheets, from the D&D companion:
 * `?q=fire` finds names, `?name=Fireball` answers what the table needs to
 * cast it (see SpellInfo).
 */
function dndBaseUrl(): URL {
  const url = new URL(bindings().DND_BASE_URL?.trim() || "http://127.0.0.1:8732");
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Unsupported D&D server URL.");
  return url;
}

const clip = (value: unknown, max: number) => String(value ?? "").slice(0, max);

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return unauthorized();
  const params = new URL(request.url).searchParams;
  const edition = params.get("edition") === "2024" ? "2024" : "2014";
  const query = (params.get("q") ?? "").trim().slice(0, 60);
  const name = (params.get("name") ?? "").trim().slice(0, 60);
  const base = dndBaseUrl();
  try {
    if (query) {
      const found = await fetch(new URL(`/api/lookups/spells/search?q=${encodeURIComponent(query)}&limit=8&edition=${edition}`, base), {
        headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6000),
      });
      const names = found.ok ? ((await found.json()) as unknown) : [];
      return Response.json({ names: Array.isArray(names) ? names.filter((n): n is string => typeof n === "string").slice(0, 8) : [] });
    }
    if (!name) return Response.json({ error: "Ask for ?q= or ?name=." }, { status: 400 });
    const res = await fetch(new URL(`/api/lookups/spells/${encodeURIComponent(name)}?edition=${edition}`, base), {
      headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return Response.json({ error: `No spell called “${name}”.` }, { status: 404 });
    const raw = (await res.json()) as {
      name?: string; level?: number | string; school?: string; range?: string; concentration?: boolean;
      description?: string; higher_levels?: string; dice?: string | null;
      card?: { facts?: Array<{ label: string; value: string }> };
    };
    const fact = (label: string) => raw.card?.facts?.find((f) => f.label.toLowerCase() === label)?.value ?? null;
    const range = clip(raw.range, 80);
    const description = clip(raw.description, 4000);
    const info: SpellInfo = {
      name: clip(raw.name || name, 60),
      level: Math.max(0, Math.min(9, Number(raw.level) || 0)),
      school: clip(raw.school, 30),
      range,
      concentration: raw.concentration === true,
      area: spellArea(range, description),
      save: fact("save") ? clip(fact("save"), 20) : null,
      damageType: fact("damage type") ? clip(fact("damage type"), 30) : null,
      dice: raw.dice ? clip(raw.dice, 20) : null,
      higher: clip(raw.higher_levels, 400),
      description: description.slice(0, 1500),
    };
    return Response.json({ spell: info });
  } catch {
    return Response.json({ error: "The D&D companion is offline or unreachable." }, { status: 502 });
  }
}

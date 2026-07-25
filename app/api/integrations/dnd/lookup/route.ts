import { currentUser, unauthorized } from "@/lib/auth";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Lookup kinds the D&D companion exposes, mapped to its API paths. */
const KINDS: Record<string, string> = {
  spell: "spells",
  monster: "monsters",
  item: "items",
  feat: "feats",
  race: "races",
  class: "classes",
};

function dndBaseUrl(): URL {
  const configured =
    bindings().DND_BASE_URL?.trim() || "https://dnd.deeppixel.online";
  const url = new URL(configured);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Unsupported D&D server URL.");
  }
  return url;
}

interface Spell {
  name: string;
  level: number;
  school: string;
  ritual?: boolean;
  concentration?: boolean;
  casting_time?: number | string;
  range?: string;
  components?: string;
  duration?: string;
  description?: string;
  source?: string;
  source_url?: string;
}

function describeSpell(spell: Spell): string {
  const level =
    spell.level === 0 ? "Cantrip" : `Level ${spell.level} ${spell.school}`;
  const tags = [
    spell.ritual ? "ritual" : "",
    spell.concentration ? "concentration" : "",
  ].filter(Boolean);
  const header = `**${spell.name}** — ${level}${tags.length ? ` (${tags.join(", ")})` : ""}`;
  const stats = [
    spell.casting_time ? `Cast ${spell.casting_time} action` : "",
    spell.range ? `Range ${spell.range}` : "",
    spell.components ? `Components ${spell.components}` : "",
    spell.duration ? `Duration ${spell.duration}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const body = (spell.description || "").split("\n")[0].slice(0, 700);
  return [header, stats, body].filter(Boolean).join("\n");
}

/** Anything that is not a spell: show the fields it happens to have. */
function describeGeneric(name: string, entry: Record<string, unknown>): string {
  const skip = new Set(["name", "source_url", "description", "text", "entries"]);
  const facts = Object.entries(entry)
    .filter(
      ([key, value]) =>
        !skip.has(key) &&
        (typeof value === "string" || typeof value === "number") &&
        String(value).length < 60,
    )
    .slice(0, 8)
    .map(([key, value]) => `${key.replace(/_/g, " ")} ${value}`)
    .join(" · ");
  const description = String(
    entry.description || entry.text || "",
  )
    .split("\n")[0]
    .slice(0, 700);
  return [`**${name}**`, facts, description].filter(Boolean).join("\n");
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as {
    kind?: string;
    query?: string;
  };
  const path = KINDS[(body.kind || "").toLowerCase()];
  const query = (body.query || "").trim().slice(0, 80);
  if (!path) {
    return Response.json({ error: "I can look up spells, monsters, items, feats, races and classes." }, { status: 400 });
  }
  if (!query) {
    return Response.json(
      { error: `Try \`/${body.kind} fireball\`.` },
      { status: 400 },
    );
  }

  const base = dndBaseUrl();
  try {
    const exact = await fetch(
      new URL(`/api/lookups/${path}/${encodeURIComponent(query)}`, base),
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) },
    );

    if (exact.ok) {
      const entry = (await exact.json()) as Record<string, unknown>;
      const text =
        path === "spells"
          ? describeSpell(entry as unknown as Spell)
          : describeGeneric(String(entry.name || query), entry);
      return Response.json({
        text,
        link: typeof entry.source_url === "string" ? entry.source_url : undefined,
      });
    }

    // No exact hit: offer what the compendium does have.
    const search = await fetch(
      new URL(
        `/api/lookups/${path}/search?q=${encodeURIComponent(query)}`,
        base,
      ),
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) },
    );
    if (search.ok) {
      const names = (await search.json()) as string[];
      if (Array.isArray(names) && names.length) {
        return Response.json({
          text: `No exact match for “${query}”. Did you mean: ${names
            .slice(0, 8)
            .join(" · ")}?`,
        });
      }
    }
    return Response.json({ text: `Nothing in the compendium matches “${query}”.` });
  } catch {
    return Response.json(
      { error: "The D&D companion is offline or unreachable." },
      { status: 502 },
    );
  }
}

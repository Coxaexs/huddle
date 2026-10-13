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
  species: "races",
  class: "classes",
  subclass: "subclasses",
};

function dndBaseUrl(): URL {
  const configured =
    bindings().DND_BASE_URL?.trim() || "http://127.0.0.1:8732";
  const url = new URL(configured);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Unsupported D&D server URL.");
  }
  return url;
}

/** Where browsers can reach the companion, for monster art. */
function dndPublicUrl(): URL | null {
  const configured =
    bindings().DND_PUBLIC_URL?.trim() || bindings().DND_BASE_URL?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    return ["http:", "https:"].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

/** The structured entry the companion builds; see fiveetools_lookup.py. */
interface LookupCard {
  kind: string;
  name: string;
  subtitle?: string;
  source?: string;
  source_label?: string;
  page?: number | null;
  source_url?: string;
  facts?: Array<{ label: string; value: string }>;
  tags?: string[];
  sections?: Array<{ title: string; body: string }>;
  abilities?: Array<{ label: string; score: number; mod: string }>;
  image_path?: string;
  other_versions?: string[];
}

const clip = (value: unknown, max: number) => String(value ?? "").slice(0, max);

/**
 * Only the fields the chat card draws, each bounded, so a huge entry cannot
 * blow up the message row it is stored in.
 */
function cardPayload(card: LookupCard, kind: string) {
  const publicUrl = dndPublicUrl();
  let image: string | undefined;
  if (card.image_path && publicUrl) {
    try {
      image = new URL(card.image_path, publicUrl).toString();
    } catch {
      image = undefined;
    }
  }
  return {
    type: kind,
    name: clip(card.name, 120),
    subtitle: clip(card.subtitle, 200),
    source: clip(card.source_label || card.source, 80),
    page: typeof card.page === "number" ? card.page : undefined,
    otherVersions: (card.other_versions || []).slice(0, 6).map((v) => clip(v, 16)),
    facts: (card.facts || []).slice(0, 16).map((fact) => ({
      label: clip(fact.label, 40),
      value: clip(fact.value, 300),
    })),
    tags: (card.tags || []).slice(0, 8).map((tag) => clip(tag, 60)),
    abilities: (card.abilities || []).slice(0, 6).map((ability) => ({
      label: clip(ability.label, 4),
      score: Number(ability.score) || 0,
      mod: clip(ability.mod, 4),
    })),
    sections: (card.sections || []).slice(0, 8).map((section) => ({
      title: clip(section.title, 60),
      body: clip(section.body, 3600),
    })),
    image,
  };
}

/** Plain-text fallback, used for notifications and search. */
function summaryText(card: LookupCard): string {
  const facts = (card.facts || [])
    .slice(0, 4)
    .map((fact) => `${fact.label} ${fact.value}`)
    .join(" · ");
  const body = (card.sections || []).find((section) => !section.title)?.body || "";
  return [`**${card.name}**${card.subtitle ? ` — ${card.subtitle}` : ""}`, facts, body.split("\n")[0].slice(0, 400)]
    .filter(Boolean)
    .join("\n");
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as {
    kind?: string;
    query?: string;
  };
  const kind = (body.kind || "").toLowerCase();
  const path = KINDS[kind];
  let query = (body.query || "").trim().slice(0, 80);
  if (!path) {
    return Response.json(
      { error: "I can look up spells, monsters, items, feats, races, classes and subclasses." },
      { status: 400 },
    );
  }

  // `/spell fireball 2024` prefers the 2024 books; 2014 is the default.
  let edition = "2014";
  const editionMatch = query.match(/\s+(2014|2024|5e|5\.5e)$/i);
  if (editionMatch) {
    edition = /2024|5\.5e/i.test(editionMatch[1]) ? "2024" : "2014";
    query = query.slice(0, editionMatch.index).trim();
  }
  if (!query) {
    return Response.json(
      { error: `Try \`/${kind} ${kind === "spell" ? "fireball" : kind === "monster" ? "goblin" : "longsword"}\`.` },
      { status: 400 },
    );
  }

  const base = dndBaseUrl();
  try {
    const exact = await fetch(
      new URL(
        `/api/lookups/${path}/${encodeURIComponent(query)}?edition=${edition}`,
        base,
      ),
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) },
    );

    if (exact.ok) {
      const entry = (await exact.json()) as { card?: LookupCard; name?: string; source_url?: string };
      if (entry.card) {
        return Response.json({
          text: summaryText(entry.card),
          link: entry.card.source_url,
          kind: "dnd",
          payload: cardPayload(entry.card, kind),
        });
      }
      // An older companion without cards: show what it has.
      return Response.json({
        text: `**${entry.name || query}**`,
        link: entry.source_url,
      });
    }

    // No match at all: offer close names as buttons that run the lookup.
    const search = await fetch(
      new URL(
        `/api/lookups/${path}/search?q=${encodeURIComponent(query)}&limit=8&edition=${edition}`,
        base,
      ),
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) },
    );
    const names = search.ok ? ((await search.json()) as unknown) : [];
    const suggestions = Array.isArray(names)
      ? names.filter((name): name is string => typeof name === "string").slice(0, 8)
      : [];
    return Response.json({
      text: suggestions.length
        ? `No ${kind} called “${query}”. Did you mean: ${suggestions.join(" · ")}?`
        : `Nothing in the compendium matches “${query}”.`,
      kind: "dnd",
      payload: {
        type: "suggest",
        name: `No ${kind} called “${clip(query, 60)}”`,
        subtitle: suggestions.length ? "Did you mean one of these?" : "Check the spelling, or try part of the name.",
        lookupKind: kind,
        suggestions,
      },
    });
  } catch {
    return Response.json(
      { error: "The D&D companion is offline or unreachable." },
      { status: 502 },
    );
  }
}

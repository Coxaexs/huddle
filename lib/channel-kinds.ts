/**
 * Channel kinds and what each one is allowed to do.
 *
 * Discord's vocabulary is worth keeping because bots and self-hosters arrive
 * with it already loaded, but only the parts that change behaviour on the
 * server live here. Everything else (icons, ordering, colours) is presentation
 * and belongs in the client.
 *
 * The `kind` column is plain TEXT with no CHECK constraint, so adding a kind
 * needs no migration. That is deliberate: a self-hosted instance should be able
 * to take a new channel kind with `git pull`, not with a manual ALTER.
 */

/** Every kind the server understands, including the internal DM pseudo-kind. */
export const CHANNEL_KINDS = [
  "text",
  "voice",
  "announcement",
  "forum",
  "stage",
  "dm",
] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];

/**
 * Kinds a member can create in a server.
 *
 * `dm` is excluded: conversation channels are created by starting a DM, never
 * by an operator picking it from a menu.
 */
export const CREATABLE_CHANNEL_KINDS = [
  "text",
  "voice",
  "announcement",
  "forum",
  "stage",
] as const satisfies readonly ChannelKind[];

export interface ChannelKindInfo {
  kind: ChannelKind;
  /** Messages can be posted here. */
  text: boolean;
  /** A voice call can be held here. `stage` is a voice room with an audience. */
  voice: boolean;
  /**
   * Only members who can manage messages may post. Announcements are the one
   * kind where a read-only feed is the whole point.
   */
  moderatorOnlyPosting: boolean;
  /** Each top-level post is expected to open a thread, as a forum board. */
  threadContainer: boolean;
  /** Listed in the voice area of the sidebar rather than the text list. */
  appearsAsVoice: boolean;
  /** Names are forced to Discord's lowercase-with-dashes shape. */
  slugName: boolean;
}

const KINDS: Record<ChannelKind, ChannelKindInfo> = {
  text: {
    kind: "text",
    text: true,
    voice: false,
    moderatorOnlyPosting: false,
    threadContainer: false,
    appearsAsVoice: false,
    slugName: true,
  },
  announcement: {
    kind: "announcement",
    text: true,
    voice: false,
    moderatorOnlyPosting: true,
    threadContainer: false,
    appearsAsVoice: false,
    slugName: true,
  },
  forum: {
    kind: "forum",
    text: true,
    voice: false,
    moderatorOnlyPosting: false,
    threadContainer: true,
    appearsAsVoice: false,
    slugName: true,
  },
  voice: {
    kind: "voice",
    text: false,
    voice: true,
    moderatorOnlyPosting: false,
    threadContainer: false,
    appearsAsVoice: true,
    slugName: false,
  },
  stage: {
    kind: "stage",
    text: false,
    voice: true,
    moderatorOnlyPosting: false,
    threadContainer: false,
    appearsAsVoice: true,
    slugName: false,
  },
  dm: {
    kind: "dm",
    text: true,
    voice: false,
    moderatorOnlyPosting: false,
    threadContainer: false,
    appearsAsVoice: false,
    slugName: false,
  },
};

/** True for any value the server should treat as a channel kind. */
export function isChannelKind(value: unknown): value is ChannelKind {
  return typeof value === "string" && (CHANNEL_KINDS as readonly string[]).includes(value);
}

/** True for the kinds an operator may create. */
export function isCreatableKind(value: unknown): value is (typeof CREATABLE_CHANNEL_KINDS)[number] {
  return (
    typeof value === "string" &&
    (CREATABLE_CHANNEL_KINDS as readonly string[]).includes(value)
  );
}

/**
 * Capabilities for a kind.
 *
 * An unknown value is treated as `text` rather than rejected: rows written by
 * an older build, or hand-edited in the database, should render as a plain
 * channel instead of disappearing from the sidebar.
 */
export function channelKindInfo(kind: string | null | undefined): ChannelKindInfo {
  return isChannelKind(kind) ? KINDS[kind] : KINDS.text;
}

/** SQL fragment listing the kinds that accept messages, for `kind IN (…)`. */
export function textChannelKindsSql(): string {
  return CHANNEL_KINDS.filter((kind) => KINDS[kind].text)
    .map((kind) => `'${kind}'`)
    .join(", ");
}

/** SQL fragment listing the kinds that hold a voice call (voice and stage), for `kind IN (…)`. */
export function voiceChannelKindsSql(): string {
  return CHANNEL_KINDS.filter((kind) => KINDS[kind].voice)
    .map((kind) => `'${kind}'`)
    .join(", ");
}

/**
 * Whether this kind's posting restriction lets `mayModerate` post.
 *
 * Takes the permission as a boolean rather than looking it up, so the rule is
 * testable on its own and the caller decides how to resolve the permission.
 */
export function mayPostInKind(kind: string | null | undefined, mayModerate: boolean): boolean {
  const info = channelKindInfo(kind);
  return !info.moderatorOnlyPosting || mayModerate;
}

export interface ChannelNameRules {
  /** Longest name the kind accepts. */
  maxLength: number;
  /** Forces lowercase-with-dashes. */
  slug: boolean;
}

export function channelNameRules(kind: string | null | undefined): ChannelNameRules {
  const info = channelKindInfo(kind);
  // Text-like names appear in `#channel` markup, so they stay short and typeable.
  return info.slugName ? { maxLength: 25, slug: true } : { maxLength: 40, slug: false };
}

/**
 * Normalizes an operator-supplied channel name for its kind.
 *
 * Returns "" when nothing usable is left, which the caller reports as a
 * validation error rather than storing a nameless channel.
 */
export function normalizeChannelName(
  kind: string | null | undefined,
  raw: string | null | undefined,
): string {
  const { slug, maxLength } = channelNameRules(kind);
  const trimmed = (raw || "").trim();
  if (!slug) return trimmed.slice(0, maxLength);
  // Unicode-aware: a name in Japanese or Cyrillic should survive, and only the
  // characters that break `#mentions` are removed.
  //
  // Disallowed *runs* collapse to a single dash rather than being deleted, so
  // "Help & Support" becomes help-support and not help---support. Leading and
  // trailing dashes go too, since `#-general-` reads as a typo.
  return trimmed
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/, "");
}

/**
 * Kinds an existing channel may switch to. A channel keeps its content, so the
 * switch stays within one family: a text channel's messages make sense as an
 * announcement feed or forum posts, but not as a voice room.
 */
export function convertibleKinds(kind: string | null | undefined): ChannelKind[] {
  const info = channelKindInfo(kind);
  if (info.kind === "dm") return [];
  const family: ChannelKind[] = info.voice ? ["voice", "stage"] : ["text", "announcement", "forum"];
  return family.filter((other) => other !== info.kind);
}

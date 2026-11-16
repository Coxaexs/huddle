"use client";

import { moduleOn, useModuleOn } from "@/app/lib/modules";
import { deferred } from "./chat/shell/deferred";

/**
 * What the chat needs to show someone's cosmetics, without the art itself.
 * The drawings (cosmetics.tsx and its two catalogues) are large, and most
 * people on screen wear none, so they are fetched the first time one is
 * actually shown, and never for someone who switched cosmetics off.
 */

/** Ring-style decorations drawn by CSS box-shadow on the avatar itself. */
export const RING_DECORATIONS = new Set(["neon", "rainbow", "cyber", "gold", "sakura", "diamond"]);

/** The upload URL behind a custom "gif:<key>" effect, or null. */
export function customEffectUrl(id?: string | null) {
  const match = id ? /^gifx?:(.+)$/.exec(id) : null;
  return match ? `/hangout/api/uploads/${encodeURIComponent(match[1])}` : null;
}

/** Class names for a row that wears a nameplate. */
export function nameplateClass(id?: string | null) {
  return id && id !== "none" && moduleOn("cosmetics") ? ` has-nameplate nameplate-${id}` : "";
}

const art = () => import("./cosmetics");
const AvatarDecorationArt = deferred(() => art().then((m) => m.AvatarDecoration));
const ProfileEffectArt = deferred(() => art().then((m) => m.ProfileEffect));
const ProfileFrameArtArt = deferred(() => art().then((m) => m.ProfileFrameArt));
const NameplateArtArt = deferred(() => art().then((m) => m.NameplateArt));

function worn(id?: string | null): id is string {
  return Boolean(id) && id !== "none";
}

/**
 * The art for an avatar decoration, laid over the avatar. Parent must be
 * position: relative. `inChat` also draws the ring-style ones itself, for
 * avatars (messages, member list) that have no frame class on a wrapper.
 */
export function AvatarDecoration({ id, inChat = false }: { id?: string | null; inChat?: boolean }) {
  const on = useModuleOn("cosmetics");
  if (!on || !worn(id)) return null;
  // Rings are plain CSS, so they need none of the art.
  if (RING_DECORATIONS.has(id)) {
    return inChat ? (
      <span className={`avatar-deco-ring avatar-frame-${id}`} aria-hidden="true">
        <span className="avatar-base" />
      </span>
    ) : null;
  }
  return <AvatarDecorationArt id={id} inChat={inChat} />;
}

/** Animated effect over a whole profile card. Parent must be position: relative. */
export function ProfileEffect({ id, density = 1 }: { id?: string | null; density?: number }) {
  const on = useModuleOn("cosmetics");
  if (!on || !worn(id)) return null;
  return <ProfileEffectArt id={id} density={density} />;
}

/** A frame's art around a card. Render it as a sibling of the card inside a .pframe-host. */
export function ProfileFrameArt({ id }: { id?: string | null }) {
  const on = useModuleOn("cosmetics");
  if (!on || !worn(id)) return null;
  return <ProfileFrameArtArt id={id} />;
}

/** Illustration on the right of a nameplate. Parent must be .has-nameplate. */
export function NameplateArt({ id }: { id?: string | null }) {
  const on = useModuleOn("cosmetics");
  if (!on || !worn(id)) return null;
  return <NameplateArtArt id={id} />;
}

"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, Check, ImagePlus, X } from "lucide-react";
import { apiFetch } from "../../lib/client";
import { Avatar } from "../avatar";
import { AvatarDecoration, NameplateArt, ProfileEffect, ProfileFrameArt, customEffectUrl, nameplateClass } from "../cosmetics";
import { AVATAR_FRAMES, NAMEPLATES, PROFILE_EFFECTS, PROFILE_FRAMES, type CosmeticItem } from "./constants";
import { ProfilePreviewCard, type Cosmetics, type PreviewProfile } from "./profile-preview-card";

export type DecorationKind = "nameplate" | "frame" | "effect" | "pframe";

const FIELD: Record<DecorationKind, keyof Cosmetics> = {
  nameplate: "nameplate",
  frame: "avatarFrame",
  effect: "profileEffect",
  pframe: "profileFrame",
};

const KINDS: Record<DecorationKind, { title: string; items: CosmeticItem[] }> = {
  nameplate: { title: "Change Nameplate", items: NAMEPLATES },
  frame: { title: "Change Avatar Decoration", items: AVATAR_FRAMES },
  pframe: { title: "Change Profile Frame", items: PROFILE_FRAMES },
  effect: { title: "Change Profile Effect", items: PROFILE_EFFECTS },
};

const CUSTOM_EFFECT: CosmeticItem = { id: "custom", name: "Your GIF", desc: "Your own animated GIF, WebP or PNG over the whole card" };

export function cosmeticName(kind: DecorationKind, id: string) {
  if (kind === "effect" && customEffectUrl(id)) return CUSTOM_EFFECT.name;
  return KINDS[kind].items.find((item) => item.id === id)?.name ?? "None";
}

/** Items on their shelves, in catalog order. */
function shelves(items: CosmeticItem[]) {
  const groups: { name: string; items: CosmeticItem[] }[] = [];
  for (const item of items) {
    if (item.id === "none") continue;
    const name = item.group || "More";
    let group = groups.find((g) => g.name === name);
    if (!group) groups.push((group = { name, items: [] }));
    group.items.push(item);
  }
  return groups;
}

export function DecorationPicker({
  kind,
  profile,
  cosmetics,
  onApply,
  onClose,
}: {
  kind: DecorationKind;
  profile: PreviewProfile;
  cosmetics: Cosmetics;
  onApply: (id: string) => void;
  onClose: () => void;
}) {
  const spec = KINDS[kind];
  const field = FIELD[kind];
  const current = cosmetics[field] || "none";
  const [draft, setDraft] = useState(current);
  const groups = useMemo(() => shelves(spec.items), [spec.items]);
  const chosen = customEffectUrl(draft) ? CUSTOM_EFFECT : spec.items.find((item) => item.id === draft) ?? spec.items[0];
  // A custom effect is an uploaded GIF; "gifx:" blends it so a black background disappears.
  const [customKey, setCustomKey] = useState(() => /^gifx?:(.+)$/.exec(current)?.[1] ?? "");
  const [screenBlend, setScreenBlend] = useState(current.startsWith("gifx:"));
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const gifInput = useRef<HTMLInputElement>(null);
  const customId = (key: string, screen: boolean) => `${screen ? "gifx" : "gif"}:${key}`;

  async function uploadGif(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const form = new FormData();
      form.append("image", file);
      const upload = await apiFetch<{ key: string }>("/api/uploads", { method: "POST", body: form });
      setCustomKey(upload.key);
      setDraft(customId(upload.key, screenBlend));
    } catch (failure) {
      setUploadError(failure instanceof Error ? failure.message : "That file did not upload.");
    } finally {
      setUploading(false);
    }
  }
  const previewCosmetics = { ...cosmetics, [field]: draft };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const tile = (item: CosmeticItem) => (
    <button
      key={item.id}
      type="button"
      className={`dp-tile dp-tile-${kind}${draft === item.id ? " chosen" : ""}`}
      onClick={() => setDraft(item.id)}
      onDoubleClick={() => {
        onApply(item.id);
        onClose();
      }}
      title={item.name}
      aria-label={item.name}
      aria-pressed={draft === item.id}
    >
      {item.id === "none" ? (
        <span className="dp-none">
          <Ban size={kind === "nameplate" ? 20 : 28} strokeWidth={1.6} />
          <span>None</span>
        </span>
      ) : (
        <DecorationSwatch kind={kind} id={item.id} profile={profile} />
      )}
      {draft === item.id && (
        <span className="dp-check" aria-hidden="true">
          <Check size={12} strokeWidth={3} />
        </span>
      )}
    </button>
  );

  return createPortal(
    <div className="dp-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`dp-modal dp-modal-${kind}`} role="dialog" aria-modal="true" aria-label={spec.title}>
        <header className="dp-head">
          <h3>{spec.title}</h3>
          <button type="button" className="dp-close" aria-label="Close" onClick={onClose}>
            <X size={22} />
          </button>
        </header>
        <div className="dp-body">
          <div className="dp-list">
            <div className={`dp-grid dp-grid-${kind}`}>
              {tile(spec.items[0])}
              {kind === "effect" && (
                <button
                  type="button"
                  className={`dp-tile dp-tile-upload${customEffectUrl(draft) ? " chosen" : ""}`}
                  onClick={() => (customKey ? setDraft(customId(customKey, screenBlend)) : gifInput.current?.click())}
                  aria-label="Use your own GIF"
                >
                  {customKey ? (
                    <span className="dp-swatch">
                      <span className="pframe-host dp-mini-host">
                        <span className="dp-swatch-card">
                          <span className="dp-mini-banner" />
                          <ProfileEffect id={customId(customKey, screenBlend)} />
                        </span>
                      </span>
                    </span>
                  ) : (
                    <span className="dp-none">
                      <ImagePlus size={26} strokeWidth={1.6} />
                      <span>{uploading ? "Uploading…" : "Your GIF"}</span>
                    </span>
                  )}
                  {customEffectUrl(draft) && (
                    <span className="dp-check" aria-hidden="true">
                      <Check size={12} strokeWidth={3} />
                    </span>
                  )}
                </button>
              )}
            </div>
            {kind === "effect" && (
              <div className="dp-custom">
                <input
                  ref={gifInput}
                  type="file"
                  accept="image/gif,image/webp,image/png,image/apng"
                  hidden
                  onChange={(event) => {
                    void uploadGif(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
                <button type="button" className="dp-link" onClick={() => gifInput.current?.click()} disabled={uploading}>
                  {customKey ? "Upload a different GIF" : "Upload a GIF, WebP or APNG"}
                </button>
                <label className="dp-toggle">
                  <input
                    type="checkbox"
                    checked={screenBlend}
                    onChange={(event) => {
                      setScreenBlend(event.target.checked);
                      if (customKey && customEffectUrl(draft)) setDraft(customId(customKey, event.target.checked));
                    }}
                  />
                  Make a black background see-through
                </label>
                {uploadError && <span className="dp-error">{uploadError}</span>}
              </div>
            )}
            {groups.map((group) => (
              <section key={group.name} className="dp-shelf">
                <h4>{group.name}</h4>
                <div className={`dp-grid dp-grid-${kind}`}>{group.items.map(tile)}</div>
              </section>
            ))}
          </div>
          <div className="dp-preview">
            <PickerPreview kind={kind} profile={profile} cosmetics={previewCosmetics} />
            <div className="dp-info">
              <strong>{chosen.name}</strong>
              <span>{chosen.id === "none" ? "Nothing equipped" : chosen.desc}</span>
            </div>
          </div>
        </div>
        <footer className="dp-foot">
          <button type="button" className="dp-btn dp-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="dp-btn dp-btn-primary"
            disabled={draft === current}
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            Apply
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

/** The right-hand preview: the place this cosmetic actually shows up. */
function PickerPreview({ kind, profile, cosmetics }: { kind: DecorationKind; profile: PreviewProfile; cosmetics: Cosmetics }) {
  if (kind === "frame") {
    return (
      <div className="dp-stage dp-stage-frame">
        <div className="dp-stage-main">
          <DecoratedAvatar profile={profile} id={cosmetics.avatarFrame} size={150} />
        </div>
        <div className="dp-stage-sizes">
          {[72, 56, 44, 32].map((size, index) => (
            <DecoratedAvatar key={size} profile={profile} id={cosmetics.avatarFrame} size={size} status={index > 1 ? "dnd" : index === 1 ? "idle" : "online"} />
          ))}
        </div>
      </div>
    );
  }
  if (kind === "nameplate") {
    return (
      <div className="dp-stage dp-stage-plate">
        {[0, 1].map((n) => <SkeletonMember key={`a${n}`} />)}
        <div className={`dp-member member${nameplateClass(cosmetics.nameplate)}`}>
          <NameplateArt id={cosmetics.nameplate} />
          <Avatar className="member-avatar" avatar={profile.avatar} avatarUrl={profile.avatarUrl} color={profile.color} size={40} />
          <strong>{profile.displayName}</strong>
        </div>
        {[0, 1].map((n) => <SkeletonMember key={`b${n}`} />)}
      </div>
    );
  }
  return <ProfilePreviewCard profile={profile} cosmetics={cosmetics} bioLines={3} />;
}

function SkeletonMember() {
  return (
    <div className="dp-member dp-member-ghost" aria-hidden="true">
      <span className="dp-skel-circle" />
      <span className="dp-skel" />
    </div>
  );
}

export function DecoratedAvatar({ profile, id, size, status }: { profile: PreviewProfile; id: string; size: number; status?: "online" | "idle" | "dnd" }) {
  return (
    <span className={`dp-deco-avatar avatar-frame-${id}`} style={{ width: size, height: size }}>
      <Avatar className="dec-avatar" avatar={profile.avatar} avatarUrl={profile.avatarUrl} color={profile.color} size={size} />
      <AvatarDecoration id={id} />
      {status && <span className={`dp-status dp-status-${status}`} />}
    </span>
  );
}

/** A small visual sample of one option, for grid tiles and the editor rail. */
export function DecorationSwatch({ kind, id, profile }: { kind: DecorationKind; id: string; profile: PreviewProfile }) {
  if (kind === "nameplate") {
    return (
      <span className={`dp-swatch dp-swatch-plate${nameplateClass(id)}`}>
        <NameplateArt id={id} />
        <Avatar className="dec-avatar" avatar={profile.avatar} avatarUrl={profile.avatarUrl} color={profile.color} size={32} />
        <span className="dp-skel" />
      </span>
    );
  }
  if (kind === "frame") {
    return (
      <span className="dp-swatch dp-swatch-frame">
        <DecoratedAvatar profile={profile} id={id} size={62} />
      </span>
    );
  }
  const frame = kind === "pframe" && id !== "none" ? ` profile-frame-${id}` : "";
  return (
    <span className="dp-swatch">
      <span className="pframe-host dp-mini-host">
        <span className={`dp-swatch-card${frame}`}>
          <span className="dp-mini-banner" style={kind === "effect" ? undefined : { background: profile.bannerBackground }} />
          <span className="dp-skel-circle" />
          <span className="dp-skel" style={{ width: "58%" }} />
          <span className="dp-skel" style={{ width: "80%" }} />
          <span className="dp-skel" style={{ width: "40%" }} />
          {kind === "effect" && <ProfileEffect id={id} density={0.7} />}
        </span>
        {kind === "pframe" && <ProfileFrameArt id={id} />}
      </span>
    </span>
  );
}

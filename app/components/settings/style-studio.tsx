"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeftRight, Check, ChevronDown, Dices, ImageIcon, Pipette, Play, Plus, RotateCcw, X } from "lucide-react";
import {
  CARD_EDGES,
  CARD_ENTRANCES,
  CARD_FINISHES,
  CARD_MOTIONS,
  CARD_PATTERNS,
  JOIN_FLOURISHES,
  NAME_EFFECTS,
  NAME_FONTS,
  STYLE_LOOKS,
  VOICE_RINGS,
  VOICE_TILES,
  hexToRgb,
  nameEffect,
  rgbToHex,
  type NameEffectId,
  type NameFontId,
  type ProfileStyle,
} from "@/lib/profile-style";
import { Avatar } from "../avatar";
import { StyledName, VoiceAura } from "../profile-style-parts";
import { cardLook, colorsFromImage, loadAllNameFonts, ringColor, voiceTileLook } from "../../lib/profile-look";
import { ProfilePreviewCard, type Cosmetics, type PreviewProfile } from "./profile-preview-card";
import { useI18n } from "../../lib/i18n-context";
import type { MessageKey } from "@/lib/i18n";

/*
 * The profile editor's style studios: Display Name, Card Theme, Voice and
 * Looks. Each works on a draft and hands it back on Apply, like the
 * decoration pickers it sits beside (and it borrows their dp-* frame).
 */

export type StudioKind = "name" | "card" | "voice" | "looks";

const TITLE_KEYS: Record<StudioKind, MessageKey> = {
  name: "settings.studio.title.name",
  card: "settings.studio.title.card",
  voice: "settings.studio.title.voice",
  looks: "settings.studio.title.looks",
};

const NAME_SWATCHES = [
  "#ffffff", "#ff7ab8", "#ff3cac", "#f43f5e", "#ff7a1a", "#fbbf24", "#fde047", "#a3e635",
  "#34d399", "#2dd4bf", "#22d3ee", "#38bdf8", "#60a5fa", "#818cf8", "#a78bfa", "#e879f9",
];

const NAME_PALETTES: string[][] = [
  ["#ff7ab8", "#7c6cff"],
  ["#fbbf24", "#f43f5e"],
  ["#22d3ee", "#a78bfa"],
  ["#34d399", "#22d3ee"],
  ["#fde047", "#fb7185", "#a78bfa"],
  ["#f0abfc", "#93c5fd"],
  ["#ff9f1c", "#ff3cac"],
  ["#e2e8f0", "#94a3b8"],
  ["#a3e635", "#14b8a6"],
  ["#ffd1e3", "#ff6fae", "#c084fc"],
];

const THEME_PAIRS: [string, string][] = [
  ["#ff7ab8", "#5b2a9e"],
  ["#7c6cff", "#1e1b4b"],
  ["#22d3ee", "#0c4a6e"],
  ["#34d399", "#064e3b"],
  ["#fbbf24", "#7c2d12"],
  ["#f43f5e", "#4c0519"],
  ["#a78bfa", "#f0abfc"],
  ["#0ea5e9", "#a5f3fc"],
  ["#fde68a", "#fb7185"],
  ["#cbd5e1", "#334155"],
  ["#27272a", "#09090b"],
  ["#ffd6ec", "#b9e2ff"],
  ["#d9f99d", "#3f6212"],
  ["#ff9f1c", "#2b0a3d"],
  ["#5fa83f", "#1c3315"],
  ["#79bd4f", "#6b4220"],
  ["#3fb8c4", "#131c33"],
  ["#8a1c1c", "#1a0505"],
  ["#4d6b22", "#0b0f06"],
  ["#5a0e0e", "#0a0303"],
  ["#f5c400", "#1a1a1a"],
];

const RING_SWATCHES = ["#23a55a", "#ffffff", "#ff7ab8", "#f43f5e", "#ff7a1a", "#fde047", "#a3ff12", "#2dd4bf", "#38bdf8", "#818cf8", "#b26bff", "#e879f9"];

const pickRandom = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

/* ------------------------------------------------------------------ */
/* Colour picker                                                       */
/* ------------------------------------------------------------------ */

function hexToHsv(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}

function hsvToHex(h: number, s: number, v: number): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return rgbToHex(f(5) * 255, f(3) * 255, f(1) * 255);
}

const HEX_INPUT = /^#?[0-9a-f]{6}$/i;

/** A swatch button that opens a hue/saturation picker with hex entry, eyedropper and swatches. */
export function ColorField({ value, onChange, label, swatches = NAME_SWATCHES, onRemove }: { value: string; onChange: (color: string) => void; label: string; swatches?: string[]; onRemove?: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);
  return (
    <div className="ps-color" ref={rootRef}>
      <button type="button" className={`ps-color-btn${open ? " open" : ""}`} onClick={() => setOpen(!open)} aria-label={`${label}: ${value}`} aria-expanded={open}>
        <span className="ps-color-chip" style={{ background: value }} />
        <span className="ps-color-text">
          <small>{label}</small>
          <span>{value.toUpperCase()}</span>
        </span>
        <ChevronDown size={14} />
      </button>
      {onRemove && (
        <button type="button" className="ps-color-remove" onClick={onRemove} aria-label={t("settings.studio.removeLabelAria", { label })}>
          <X size={12} />
        </button>
      )}
      {open && <ColorPopover value={value} onChange={onChange} swatches={swatches} />}
    </div>
  );
}

function ColorPopover({ value, onChange, swatches }: { value: string; onChange: (color: string) => void; swatches: string[] }) {
  const { t } = useI18n();
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const [text, setText] = useState(value.toUpperCase());
  const areaRef = useRef<HTMLDivElement>(null);
  // Follow outside changes (a swatch, the eyedropper) without losing the hue on greys.
  useEffect(() => {
    if (hsvToHex(...hsv) !== value.toLowerCase()) setHsv(hexToHsv(value));
    setText(value.toUpperCase());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const set = (next: [number, number, number]) => {
    setHsv(next);
    onChange(hsvToHex(...next));
  };
  const pickArea = (event: React.PointerEvent) => {
    const rect = areaRef.current!.getBoundingClientRect();
    const s = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const v = 1 - Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    set([hsv[0], s, v]);
  };
  const eyeDropper = typeof window !== "undefined" && "EyeDropper" in window;
  return (
    <div className="ps-pop" role="dialog" aria-label={t("settings.studio.pickColourAria")}>
      <div
        ref={areaRef}
        className="ps-pop-area"
        style={{ "--hue": `hsl(${hsv[0]} 100% 50%)` } as CSSProperties}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          pickArea(event);
        }}
        onPointerMove={(event) => {
          if (event.buttons) pickArea(event);
        }}
      >
        <span className="ps-pop-knob" style={{ left: `${hsv[1] * 100}%`, top: `${(1 - hsv[2]) * 100}%`, background: value }} />
      </div>
      <input
        className="ps-pop-hue"
        type="range"
        min={0}
        max={359}
        value={Math.round(hsv[0])}
        onChange={(event) => set([Number(event.target.value), hsv[1] || 0.85, hsv[2] || 0.9])}
        aria-label={t("settings.studio.hueAria")}
      />
      <div className="ps-pop-row">
        <span className="ps-pop-now" style={{ background: value }} />
        <input
          className="ps-pop-hex"
          value={text}
          maxLength={7}
          spellCheck={false}
          onChange={(event) => {
            setText(event.target.value);
            if (HEX_INPUT.test(event.target.value)) onChange(`#${event.target.value.replace("#", "").toLowerCase()}`);
          }}
          aria-label={t("settings.studio.hexColourAria")}
        />
        {eyeDropper && (
          <button
            type="button"
            className="ps-pop-icon"
            title={t("settings.studio.pickFromScreenTitle")}
            aria-label={t("settings.studio.pickFromScreenAria")}
            onClick={async () => {
              try {
                const result = await new (window as unknown as { EyeDropper: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper().open();
                if (HEX_INPUT.test(result.sRGBHex)) onChange(result.sRGBHex.toLowerCase());
              } catch {
                /* cancelled */
              }
            }}
          >
            <Pipette size={15} />
          </button>
        )}
      </div>
      <div className="ps-pop-swatches">
        {swatches.map((swatch) => (
          <button
            key={swatch}
            type="button"
            className={`ps-pop-swatch${swatch === value.toLowerCase() ? " chosen" : ""}`}
            style={{ background: swatch }}
            onClick={() => onChange(swatch)}
            aria-label={t("settings.studio.useSwatchAria", { swatch })}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function Section({ title, hint, action, children }: { title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="ps-section">
      <header className="ps-section-head">
        <div>
          <h4>{title}</h4>
          {hint && <p>{hint}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function Tile({ chosen, onClick, label, children, className = "", title }: { chosen: boolean; onClick: () => void; label: string; children: ReactNode; className?: string; title?: string }) {
  return (
    <button type="button" className={`ps-tile ps-hover${chosen ? " chosen" : ""}${className ? ` ${className}` : ""}`} onClick={onClick} aria-pressed={chosen} title={title || label}>
      <span className="ps-tile-art">{children}</span>
      <span className="ps-tile-label">{label}</span>
      {chosen && (
        <span className="ps-check" aria-hidden="true">
          <Check size={11} strokeWidth={3.2} />
        </span>
      )}
    </button>
  );
}

function Segmented<T extends string>({ options, value, onChange }: { options: readonly { id: T; name: string }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div className="ps-seg" role="radiogroup">
      {options.map((option) => (
        <button key={option.id} type="button" role="radio" aria-checked={value === option.id} className={value === option.id ? "on" : ""} onClick={() => onChange(option.id)}>
          {option.name}
        </button>
      ))}
    </div>
  );
}

/** Two colours from the avatar, when it is a picture we can read. */
function useAvatarColors(avatarUrl: string | null | undefined) {
  const [colors, setColors] = useState<[string, string] | null>(null);
  useEffect(() => {
    let live = true;
    setColors(null);
    if (avatarUrl) void colorsFromImage(avatarUrl).then((found) => live && setColors(found));
    return () => {
      live = false;
    };
  }, [avatarUrl]);
  return colors;
}

/* ------------------------------------------------------------------ */
/* Studio frame                                                        */
/* ------------------------------------------------------------------ */

export function StyleStudio({
  kind,
  profile,
  cosmetics,
  style,
  onApply,
  onClose,
}: {
  kind: StudioKind;
  profile: PreviewProfile;
  cosmetics: Cosmetics;
  style: ProfileStyle;
  onApply: (style: ProfileStyle) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<ProfileStyle>(style);
  const dirty = JSON.stringify(draft) !== JSON.stringify(style);
  useEffect(() => {
    loadAllNameFonts();
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector(".ps-pop")) {
        event.stopPropagation();
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  const patch = (next: Partial<ProfileStyle>) =>
    setDraft((prev) => {
      const merged: ProfileStyle = { ...prev, ...next };
      for (const key of Object.keys(merged) as (keyof ProfileStyle)[]) if (merged[key] === undefined) delete merged[key];
      return merged;
    });
  const preview: PreviewProfile = { ...profile, profileStyle: draft };

  let body: ReactNode;
  if (kind === "name") body = <NameStudio draft={draft} patch={patch} profile={preview} />;
  else if (kind === "card") body = <CardStudio draft={draft} patch={patch} profile={preview} cosmetics={cosmetics} />;
  else if (kind === "voice") body = <VoiceStudio draft={draft} patch={patch} profile={preview} />;
  else body = <LooksStudio draft={draft} setDraft={setDraft} profile={preview} cosmetics={cosmetics} />;

  const title = t(TITLE_KEYS[kind]);
  return createPortal(
    <div className="dp-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`dp-modal ps-modal ps-modal-${kind}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="dp-head">
          <h3>{title}</h3>
          <button type="button" className="dp-close" aria-label={t("common.close")} onClick={onClose}>
            <X size={22} />
          </button>
        </header>
        <div className="dp-body ps-body">{body}</div>
        <footer className="dp-foot">
          <button type="button" className="dp-btn dp-btn-ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="dp-btn dp-btn-primary"
            disabled={!dirty}
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            {t("settings.deco.apply")}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

type Patch = (next: Partial<ProfileStyle>) => void;

/* ------------------------------------------------------------------ */
/* Display name                                                        */
/* ------------------------------------------------------------------ */

function NameStudio({ draft, patch, profile }: { draft: ProfileStyle; patch: Patch; profile: PreviewProfile }) {
  const { t } = useI18n();
  const name = profile.displayName || profile.username;
  const effect = nameEffect(draft.effect);
  const colors = draft.nameColors?.length ? draft.nameColors : effect ? [...effect.defaults] : [];
  const [min, max] = effect?.colors ?? [0, 0];
  const avatarColors = useAvatarColors(profile.avatarUrl);
  const fontGroups = useMemo(() => ["Clean", "Playful", "Themed"].map((group) => ({ group, fonts: NAME_FONTS.filter((font) => font.group === group) })), []);
  const effectGroups = useMemo(() => ["Classic", "Glow", "Shine", "Wild"].map((group) => ({ group, effects: NAME_EFFECTS.filter((fx) => fx.group === group) })), []);

  const setEffect = (id: NameEffectId | undefined) => {
    if (!id) return patch({ effect: undefined, nameColors: undefined });
    const spec = nameEffect(id)!;
    const [lo, hi] = spec.colors;
    if (!hi) return patch({ effect: id, nameColors: undefined });
    // Keep the colours someone already picked, as far as the new effect takes them.
    const kept = (draft.nameColors || []).slice(0, hi);
    for (let i = kept.length; i < lo; i++) kept.push(spec.defaults[i] ?? kept[0]);
    patch({ effect: id, nameColors: kept.length ? kept : [...spec.defaults] });
  };
  const setColors = (next: string[]) => patch({ nameColors: next });
  const surprise = () => {
    const fx = pickRandom(NAME_EFFECTS);
    const palette = pickRandom(NAME_PALETTES);
    patch({
      font: pickRandom(NAME_FONTS.filter((font) => font.id !== "default")).id,
      effect: fx.id,
      nameColors: fx.colors[1] ? palette.slice(0, Math.max(fx.colors[0], Math.min(fx.colors[1], palette.length))) : undefined,
    });
  };

  const sample = (font: NameFontId | undefined, fx: NameEffectId | undefined) => {
    const spec = nameEffect(fx);
    const cols = spec?.colors[1] ? (draft.effect === fx ? colors : [...spec.defaults]) : undefined;
    return <StyledName name={name} style={{ font: font === "default" ? undefined : font, effect: fx, nameColors: cols }} live />;
  };

  return (
    <>
      <div className="dp-list ps-list">
        <div className="ps-toolbar">
          <button type="button" className="ps-chip" onClick={surprise}>
            <Dices size={14} /> Surprise me
          </button>
          <button type="button" className="ps-chip" onClick={() => patch({ font: undefined, effect: undefined, nameColors: undefined })}>
            <RotateCcw size={14} /> Plain name
          </button>
        </div>

        <Section title={t("settings.studio.effectTitle")} hint={t("settings.studio.effectHint")}>
          {effectGroups.map(({ group, effects }) => (
            <div key={group} className="ps-shelf">
              <h5>{group}</h5>
              <div className="ps-grid ps-grid-name">
                {group === "Classic" && (
                  <Tile chosen={!draft.effect} onClick={() => setEffect(undefined)} label={t("settings.deco.none")}>
                    <span className="ps-name-sample">{sample(draft.font, undefined)}</span>
                  </Tile>
                )}
                {effects.map((fx) => (
                  <Tile key={fx.id} chosen={draft.effect === fx.id} onClick={() => setEffect(fx.id)} label={fx.name} title={fx.desc}>
                    <span className="ps-name-sample">{sample(draft.font, fx.id)}</span>
                  </Tile>
                ))}
              </div>
            </div>
          ))}
        </Section>

        {max > 0 && (
          <Section
            title={t("settings.studio.coloursTitle")}
            hint={max > min ? t("settings.studio.coloursHint", { min, max }) : undefined}
            action={
              <div className="ps-inline-actions">
                {colors.length > 1 && (
                  <button type="button" className="ps-chip" onClick={() => setColors([...colors].reverse())} title={t("settings.studio.swapOrderTitle")}>
                    <ArrowLeftRight size={14} />
                  </button>
                )}
                {avatarColors && (
                  <button type="button" className="ps-chip" onClick={() => setColors(max > 1 ? avatarColors.slice(0, Math.max(min, 2)) : [avatarColors[0]])}>
                    <ImageIcon size={14} /> {t("settings.studio.fromAvatar")}
                  </button>
                )}
              </div>
            }
          >
            <div className="ps-colors">
              {colors.map((color, index) => (
                <ColorField
                  key={index}
                  label={max === 1 ? t("settings.studio.colourSingle") : t("settings.studio.colourIndexed", { index: index + 1 })}
                  value={color}
                  onChange={(next) => setColors(colors.map((c, i) => (i === index ? next : c)))}
                  onRemove={colors.length > min ? () => setColors(colors.filter((_, i) => i !== index)) : undefined}
                />
              ))}
              {colors.length < max && (
                <button type="button" className="ps-add-color" onClick={() => setColors([...colors, NAME_PALETTES[0][1]])}>
                  <Plus size={15} /> {t("settings.studio.addColour")}
                </button>
              )}
            </div>
            {max > 1 && (
              <div className="ps-palettes">
                {NAME_PALETTES.filter((palette) => palette.length <= max).map((palette) => (
                  <button
                    key={palette.join()}
                    type="button"
                    className="ps-palette"
                    style={{ background: `linear-gradient(90deg, ${palette.join(", ")})` }}
                    onClick={() => setColors(palette.slice(0, Math.max(min, palette.length)))}
                    aria-label={t("settings.studio.useSwatchAria", { swatch: palette.join(", ") })}
                  />
                ))}
              </div>
            )}
          </Section>
        )}

        <Section title={t("settings.studio.fontTitle")} hint={t("settings.studio.fontHint")}>
          {fontGroups.map(({ group, fonts }) => (
            <div key={group} className="ps-shelf">
              <h5>{group}</h5>
              <div className="ps-grid ps-grid-name">
                {fonts.map((font) => (
                  <Tile key={font.id} chosen={(draft.font || "default") === font.id} onClick={() => patch({ font: font.id === "default" ? undefined : font.id })} label={font.name}>
                    <span className="ps-name-sample">{sample(font.id, draft.effect)}</span>
                  </Tile>
                ))}
              </div>
            </div>
          ))}
        </Section>
      </div>

      <div className="dp-preview ps-preview">
        <div className="ps-hero ps-hover">
          <span className="ps-hero-name">
            <StyledName name={name} style={draft} live />
          </span>
        </div>
        <div className="ps-preview-chat">
          <div className="ps-msg ps-hover">
            <Avatar className="ps-msg-avatar" avatar={profile.avatar} avatarUrl={profile.avatarUrl} color={profile.color} size={40} />
            <div>
              <div className="ps-msg-meta">
                <strong>
                  <StyledName name={name} style={draft} />
                </strong>
                <time>{t("settings.studio.todayAt", { time: "21:07" })}</time>
              </div>
              <p>{t("settings.studio.sampleMsg1")}</p>
            </div>
          </div>
          <div className="ps-msg">
            <span className="ps-msg-avatar ps-ghost-avatar" />
            <div>
              <div className="ps-msg-meta">
                <strong style={{ color: "var(--lavender, #8b9cff)" }}>{t("settings.studio.sampleFriend")}</strong>
                <time>{t("settings.studio.todayAt", { time: "21:08" })}</time>
              </div>
              <p>{t("settings.studio.sampleMsg2")}</p>
            </div>
          </div>
        </div>
        <div className="ps-preview-members">
          <span className="ps-preview-label">{t("settings.studio.memberList")}</span>
          <div className="ps-member ps-hover">
            <Avatar className="ps-member-avatar" avatar={profile.avatar} avatarUrl={profile.avatarUrl} color={profile.color} size={32} />
            <strong>
              <StyledName name={name} style={draft} />
            </strong>
          </div>
          <div className="ps-member ps-member-ghost">
            <span className="ps-ghost-avatar" />
            <span className="dp-skel" />
          </div>
        </div>
        <div className="dp-info">
          <strong>{effect ? effect.name : t("settings.studio.noEffect")}</strong>
          <span>{effect ? effect.desc : t("settings.studio.noEffectDesc")}</span>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Card theme                                                          */
/* ------------------------------------------------------------------ */

function MiniCard({ style, color, className = "" }: { style: ProfileStyle; color: string; className?: string }) {
  const look = cardLook({ ...style, motion: "still", entrance: undefined }, color);
  return (
    <span className={`ps-mini-card ${look.card} ${className}`} style={look.style}>
      <span className="pst-backdrop">
        <span className="pst-lights" />
        <span className="pst-pattern" />
      </span>
      <span className="ps-mini-banner" />
      <span className="ps-mini-avatar" />
      <span className="ps-mini-line" />
      <span className="ps-mini-line short" />
    </span>
  );
}

function CardStudio({ draft, patch, profile, cosmetics }: { draft: ProfileStyle; patch: Patch; profile: PreviewProfile; cosmetics: Cosmetics }) {
  const { t } = useI18n();
  const theme = draft.theme || [profile.color && /^#[0-9a-f]{6}$/i.test(profile.color) ? profile.color : "#5865f2", "#14131c"];
  const avatarColors = useAvatarColors(profile.avatarUrl);
  const [replay, setReplay] = useState(0);
  const withTheme = (next: Partial<ProfileStyle>) => patch({ theme: draft.theme || theme, ...next });
  const surprise = () => {
    withTheme({
      theme: pickRandom(THEME_PAIRS),
      finish: pickRandom(CARD_FINISHES).id,
      pattern: Math.random() < 0.35 ? undefined : pickRandom(CARD_PATTERNS.slice(1)).id,
      edge: pickRandom(CARD_EDGES.slice(0, 4)).id,
    });
    setReplay((n) => n + 1);
  };
  const sampleStyle = { ...draft, theme };
  return (
    <>
      <div className="dp-list ps-list">
        <div className="ps-toolbar">
          <button type="button" className="ps-chip" onClick={surprise}>
            <Dices size={14} /> {t("settings.studio.surpriseMe")}
          </button>
          <button type="button" className="ps-chip" onClick={() => patch({ theme: undefined, finish: undefined, pattern: undefined, edge: undefined, motion: undefined, entrance: undefined })}>
            <RotateCcw size={14} /> {t("settings.studio.noTheme")}
          </button>
        </div>

        <Section
          title={t("settings.studio.coloursTitle")}
          hint={t("settings.studio.cardColoursHint")}
          action={
            avatarColors && (
              <button type="button" className="ps-chip" onClick={() => withTheme({ theme: avatarColors })}>
                <ImageIcon size={14} /> {t("settings.studio.fromAvatar")}
              </button>
            )
          }
        >
          <div className="ps-colors">
            <ColorField label={t("settings.studio.primary")} value={theme[0]} onChange={(next) => withTheme({ theme: [next, theme[1]] })} />
            <ColorField label={t("settings.studio.accent")} value={theme[1]} onChange={(next) => withTheme({ theme: [theme[0], next] })} />
            <button type="button" className="ps-chip ps-swap" onClick={() => withTheme({ theme: [theme[1], theme[0]] })} title={t("settings.studio.swap")}>
              <ArrowLeftRight size={14} />
            </button>
          </div>
          <div className="ps-pairs">
            {THEME_PAIRS.map((pair) => (
              <button
                key={pair.join()}
                type="button"
                className={`ps-pair${draft.theme?.join() === pair.join() ? " chosen" : ""}`}
                style={{ background: `linear-gradient(160deg, ${pair[0]} 0 50%, ${pair[1]} 50% 100%)` }}
                onClick={() => withTheme({ theme: pair })}
                aria-label={t("settings.studio.usePairAria", { a: pair[0], b: pair[1] })}
              />
            ))}
          </div>
        </Section>

        <Section title={t("settings.studio.finish")}>
          <div className="ps-grid ps-grid-card">
            {CARD_FINISHES.map((finish) => (
              <Tile key={finish.id} chosen={(draft.finish || "gradient") === finish.id && Boolean(draft.theme)} onClick={() => withTheme({ finish: finish.id })} label={finish.name} title={finish.desc}>
                <MiniCard style={{ ...sampleStyle, finish: finish.id }} color={profile.color} />
              </Tile>
            ))}
          </div>
        </Section>

        <Section title={t("settings.studio.pattern")}>
          <div className="ps-grid ps-grid-pattern">
            {CARD_PATTERNS.map((pattern) => (
              <Tile key={pattern.id} chosen={(draft.pattern || "none") === pattern.id && Boolean(draft.theme)} onClick={() => withTheme({ pattern: pattern.id === "none" ? undefined : pattern.id })} label={pattern.name}>
                <MiniCard style={{ ...sampleStyle, pattern: pattern.id === "none" ? undefined : pattern.id }} color={profile.color} className="ps-mini-pattern" />
              </Tile>
            ))}
          </div>
        </Section>

        <Section title={t("settings.studio.edge")}>
          <Segmented options={CARD_EDGES} value={draft.edge || "soft"} onChange={(edge) => withTheme({ edge })} />
        </Section>

        <Section title={t("settings.studio.motion")} hint={t("settings.studio.motionHint")}>
          <Segmented options={CARD_MOTIONS} value={draft.motion || "tilt"} onChange={(motion) => patch({ motion })} />
        </Section>

        <Section title={t("settings.studio.entrance")} hint={t("settings.studio.entranceHint")}>
          <div className="ps-chips">
            <button type="button" className={`ps-chip${!draft.entrance ? " on" : ""}`} onClick={() => patch({ entrance: undefined })}>
              {t("settings.studio.default")}
            </button>
            {CARD_ENTRANCES.map((entrance) => (
              <button
                key={entrance.id}
                type="button"
                className={`ps-chip${draft.entrance === entrance.id ? " on" : ""}`}
                onClick={() => {
                  patch({ entrance: entrance.id });
                  setReplay((n) => n + 1);
                }}
              >
                {entrance.name}
              </button>
            ))}
          </div>
        </Section>
      </div>

      <div className="dp-preview ps-preview ps-preview-card">
        <div className="ps-card-stage" key={replay}>
          <ProfilePreviewCard profile={profile} cosmetics={cosmetics} bioLines={3} interactive />
        </div>
        <button type="button" className="ps-chip ps-replay" onClick={() => setReplay((n) => n + 1)}>
          <Play size={13} /> {t("settings.studio.replayEntrance")}
        </button>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Voice                                                               */
/* ------------------------------------------------------------------ */

function useTalking(enabled: boolean) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (!enabled) {
      setOn(true);
      return;
    }
    let timer = 0;
    const tick = () => {
      setOn((prev) => !prev);
      timer = window.setTimeout(tick, 900 + Math.random() * 1400);
    };
    timer = window.setTimeout(tick, 1600);
    return () => window.clearTimeout(timer);
  }, [enabled]);
  return on;
}

function VoiceStudio({ draft, patch, profile }: { draft: ProfileStyle; patch: Patch; profile: PreviewProfile }) {
  const { t } = useI18n();
  const [join, setJoin] = useState<{ id: string; n: number } | null>(null);
  const [chatter, setChatter] = useState(false);
  const speaking = useTalking(chatter);
  const color = ringColor(draft, profile.color);
  const tile = voiceTileLook({ ...draft, ring: draft.ring || "classic" }, profile.color);
  const groups = ["Rings", "Glows", "Particles"].map((group) => ({ group, rings: VOICE_RINGS.filter((ring) => ring.group === group) }));
  const playJoin = (id: string) => setJoin({ id, n: Date.now() });
  const name = profile.displayName || profile.username;
  return (
    <>
      <div className="dp-list ps-list">
        <Section title={t("settings.studio.speaking")} hint={t("settings.studio.speakingHint")}>
          {groups.map(({ group, rings }) => (
            <div key={group} className="ps-shelf">
              <h5>{group}</h5>
              <div className="ps-grid ps-grid-voice">
                {group === "Rings" && (
                  <Tile chosen={!draft.ring} onClick={() => patch({ ring: undefined })} label={t("settings.studio.default")}>
                    <span className="ps-voice-sample ps-voice-default">
                      <Avatar className="ps-voice-avatar" avatar={profile.avatar} avatarUrl={profile.avatarUrl} color={profile.color} size={48} />
                    </span>
                  </Tile>
                )}
                {rings.map((ring) => (
                  <Tile key={ring.id} chosen={draft.ring === ring.id} onClick={() => patch({ ring: ring.id })} label={ring.name} title={ring.desc}>
                    <span className="ps-voice-sample">
                      <VoiceAura ring={ring.id} color={color} speaking>
                        <Avatar className="ps-voice-avatar" avatar={profile.avatar} avatarUrl={profile.avatarUrl} color={profile.color} size={48} />
                      </VoiceAura>
                    </span>
                  </Tile>
                ))}
              </div>
            </div>
          ))}
        </Section>

        <Section title={t("settings.studio.ringColour")} action={draft.theme ? <button type="button" className="ps-chip" onClick={() => patch({ ringColor: draft.theme![0] })}>{t("settings.studio.matchCard")}</button> : undefined}>
          <div className="ps-colors">
            <ColorField label={t("settings.studio.colourSingle")} value={color} onChange={(next) => patch({ ringColor: next })} swatches={RING_SWATCHES} />
          </div>
        </Section>

        <Section title={t("settings.studio.joinFlourish")} hint={t("settings.studio.joinFlourishHint")}>
          <div className="ps-chips">
            <button type="button" className={`ps-chip${!draft.join ? " on" : ""}`} onClick={() => patch({ join: undefined })}>
              {t("settings.deco.none")}
            </button>
            {JOIN_FLOURISHES.map((flourish) => (
              <button
                key={flourish.id}
                type="button"
                className={`ps-chip${draft.join === flourish.id ? " on" : ""}`}
                title={flourish.desc}
                onClick={() => {
                  patch({ join: flourish.id });
                  playJoin(flourish.id);
                }}
              >
                {flourish.name}
              </button>
            ))}
          </div>
        </Section>

        <Section title={t("settings.studio.tile")} hint={t("settings.studio.tileHint")}>
          <Segmented options={VOICE_TILES} value={draft.tile || "theme"} onChange={(next) => patch({ tile: next })} />
        </Section>
      </div>

      <div className="dp-preview ps-preview ps-preview-voice">
        <figure className={`stage-tile avatar-tile ps-stage-tile ${speaking ? "is-speaking" : ""} ${tile.className}`} style={tile.style}>
          <div className="avatar-tile-inner">
            <VoiceAura key={join?.n ?? 0} ring={draft.ring} color={color} speaking={speaking} join={join?.id ?? null}>
              <Avatar className="stage-avatar" avatar={profile.avatar} avatarUrl={profile.avatarUrl} color={profile.color} />
            </VoiceAura>
          </div>
          <figcaption>
            <span>
              <StyledName name={name} style={draft} live />
            </span>
          </figcaption>
        </figure>
        <div className="ps-voice-controls">
          <label className="ps-toggle">
            <input type="checkbox" checked={chatter} onChange={(event) => setChatter(event.target.checked)} />
            <span>{t("settings.studio.chatterToggle")}</span>
          </label>
          {draft.join && (
            <button type="button" className="ps-chip" onClick={() => playJoin(draft.join!)}>
              <Play size={13} /> {t("settings.studio.playJoin")}
            </button>
          )}
        </div>
        <div className="ps-voice-list">
          <span className="ps-preview-label">{t("settings.studio.inChannelList")}</span>
          <div className={`ps-voice-row ps-hover${speaking ? " is-speaking" : ""}`}>
            <VoiceAura ring={draft.ring} color={color} speaking={speaking}>
              <Avatar className="ps-voice-tiny" avatar={profile.avatar} avatarUrl={profile.avatarUrl} color={profile.color} size={24} />
            </VoiceAura>
            <StyledName name={name} style={draft} />
          </div>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Looks                                                               */
/* ------------------------------------------------------------------ */

function LooksStudio({ draft, setDraft, profile, cosmetics }: { draft: ProfileStyle; setDraft: (style: ProfileStyle) => void; profile: PreviewProfile; cosmetics: Cosmetics }) {
  const { t } = useI18n();
  const name = profile.displayName || profile.username;
  const current = STYLE_LOOKS.find((look) => JSON.stringify(look.style) === JSON.stringify(draft));
  return (
    <>
      <div className="dp-list ps-list">
        <p className="ps-intro">{t("settings.studio.looksIntro")}</p>
        <div className="ps-looks">
          {STYLE_LOOKS.map((look) => {
            const card = cardLook({ ...look.style, motion: "still", entrance: undefined });
            return (
              <button key={look.id} type="button" className={`ps-look ps-hover${current?.id === look.id ? " chosen" : ""}`} onClick={() => setDraft(look.style)}>
                <span className={`ps-look-card ${card.card}`} style={card.style}>
                  <span className="pst-backdrop">
                    <span className="pst-lights" />
                    <span className="pst-pattern" />
                  </span>
                  <span className="ps-look-name">
                    <StyledName name={name} style={look.style} />
                  </span>
                </span>
                <span className="ps-tile-label">{look.name}</span>
                {current?.id === look.id && (
                  <span className="ps-check" aria-hidden="true">
                    <Check size={11} strokeWidth={3.2} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="dp-preview ps-preview ps-preview-card">
        <div className="ps-card-stage" key={current?.id ?? "custom"}>
          <ProfilePreviewCard profile={profile} cosmetics={cosmetics} bioLines={3} interactive />
        </div>
      </div>
    </>
  );
}

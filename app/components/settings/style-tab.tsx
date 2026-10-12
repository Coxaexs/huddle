"use client";

import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { Avatar } from "../avatar";
import { nameStyleProps, voiceTileClasses } from "../../lib/profile-style";
import {
  CARD_MOTIONS,
  ENTRANCES,
  NAME_FONTS,
  NAME_FX,
  VOICE_RINGS,
  type ProfileStyle,
} from "@/lib/users";

type SetState<T> = React.Dispatch<React.SetStateAction<T>>;

const FX_LABELS: Record<(typeof NAME_FX)[number], string> = {
  shimmer: "Shimmer", glow: "Glow", wave: "Flow", rainbow: "Rainbow", glitch: "Glitch", neon: "Neon", fire: "Fire", frost: "Frost",
};
const FONT_LABELS: Record<(typeof NAME_FONTS)[number], string> = {
  serif: "Serif", elegant: "Elegant", mono: "Mono", rounded: "Bubbly", display: "Display", gothic: "Gothic", pixel: "Pixel", script: "Script", tech: "Tech",
};
const RING_LABELS: Record<(typeof VOICE_RINGS)[number], string> = {
  pulse: "Pulse", rainbow: "Rainbow", soundwave: "Soundwave", flame: "Flame", sparkle: "Sparkle", glitch: "Glitch", hearts: "Hearts", orbit: "Orbit",
};
const ENTRANCE_LABELS: Record<(typeof ENTRANCES)[number], string> = {
  pop: "Pop", sparkle: "Sparkle", shockwave: "Shockwave", glitch: "Glitch", petals: "Petals", bats: "Bats", portal: "Portal", drop: "Drop In",
};
const MOTION_LABELS: Record<(typeof CARD_MOTIONS)[number], [string, string]> = {
  tilt: ["Tilt", "Leans toward your cursor"],
  float: ["Float", "Hovers gently"],
  still: ["Still", "No motion"],
};

const NAME_PRESETS: string[][] = [
  ["#ff6ec4", "#7873f5"],
  ["#43e97b", "#38f9d7"],
  ["#fa709a", "#fee140"],
  ["#30cfd0", "#330867", "#30cfd0"],
  ["#f83600", "#f9d423"],
  ["#a18cd1", "#fbc2eb"],
  ["#ff0844", "#ffb199"],
  ["#00c6fb", "#005bea"],
  ["#e0c3fc", "#8ec5fc"],
  ["#d4fc79", "#96e6a1"],
  ["#c71d6f", "#d09693"],
  ["#ffd700", "#fff6b7", "#ffd700"],
];
const THEME_PRESETS: [string, string][] = [
  ["#7c3aed", "#ec4899"],
  ["#0ea5e9", "#22d3ee"],
  ["#16a34a", "#a3e635"],
  ["#dc2626", "#7f1d1d"],
  ["#f59e0b", "#ef4444"],
  ["#1e293b", "#64748b"],
  ["#db2777", "#fbcfe8"],
  ["#4338ca", "#0f172a"],
];

const toHex6 = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : "#5865f2");

export function StyleTab({
  style,
  setStyle,
  displayName,
  avatar,
  avatarUrl,
  color,
}: {
  style: ProfileStyle;
  setStyle: SetState<ProfileStyle>;
  displayName: string;
  avatar: string;
  avatarUrl: string | null;
  color: string;
}) {
  const [replay, setReplay] = useState(0);
  const set = (patch: Partial<ProfileStyle>) =>
    setStyle((prev) => {
      const next: ProfileStyle = { ...prev, ...patch };
      for (const key of Object.keys(next) as (keyof ProfileStyle)[]) if (next[key] === undefined) delete next[key];
      return next;
    });
  const colors = style.nameColors || [];
  const mode = colors.length === 0 ? "default" : colors.length === 1 ? "solid" : "gradient";
  const name = displayName || "you";

  const sample = (patch: Partial<ProfileStyle>) => nameStyleProps({ ...style, ...patch }, name, color);

  return (
    <div className="ps-root">
      <div className="ps-name-preview" aria-label="Name preview">
        <Avatar className="stage-avatar" avatar={avatar} avatarUrl={avatarUrl} color={color} />
        <div className="ps-msg">
          <strong {...nameStyleProps(style, name, color)}>{name}</strong>
          <span className="ps-msg-text">This is how your name looks in chat, the member list and voice.</span>
        </div>
      </div>

      <Section title="Name Color">
        <div className="pe-chips">
          {(["default", "solid", "gradient"] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`pe-chip${mode === m ? " active" : ""}`}
              onClick={() =>
                set({
                  nameColors:
                    m === "default" ? undefined : m === "solid" ? [colors[0] || toHex6(color)] : colors.length > 1 ? colors : [colors[0] || toHex6(color), "#ff6ec4"],
                })
              }
            >
              {m === "default" ? "Role color" : m === "solid" ? "Solid" : "Gradient"}
            </button>
          ))}
        </div>
        {mode !== "default" && (
          <div className="ps-colors" style={{ marginTop: 10 }}>
            {colors.map((c, i) => (
              <label key={i} className="ps-color" style={{ background: c }} title={`Color ${i + 1}`}>
                <input
                  type="color"
                  value={c}
                  onChange={(event) => set({ nameColors: colors.map((x, j) => (j === i ? event.target.value : x)) })}
                  aria-label={`Name color ${i + 1}`}
                />
              </label>
            ))}
            {mode === "gradient" && colors.length < 3 && (
              <button type="button" className="pe-chip" onClick={() => set({ nameColors: [...colors, colors[0]] })}>+ Stop</button>
            )}
            {mode === "gradient" && colors.length > 2 && (
              <button type="button" className="pe-chip" onClick={() => set({ nameColors: colors.slice(0, 2) })}>− Stop</button>
            )}
          </div>
        )}
        {mode === "gradient" && (
          <div className="ps-presets">
            {NAME_PRESETS.map((preset) => (
              <button
                key={preset.join()}
                type="button"
                className={`ps-preset${preset.join() === colors.join() ? " chosen" : ""}`}
                style={{ background: `linear-gradient(90deg, ${preset.join(", ")})` }}
                onClick={() => set({ nameColors: preset })}
                aria-label={`Gradient ${preset.join(" to ")}`}
              />
            ))}
          </div>
        )}
      </Section>

      <Section title="Name Effect" hint="Effects animate wherever your name shows. Rainbow, Neon, Fire and Frost bring their own colors.">
        <div className="ps-grid">
          <Option chosen={!style.nameFx} onClick={() => set({ nameFx: undefined })}>
            <strong {...sample({ nameFx: undefined })}>Aa</strong>
            <small>None</small>
          </Option>
          {NAME_FX.map((fx) => (
            <Option key={fx} chosen={style.nameFx === fx} onClick={() => set({ nameFx: fx })}>
              <strong {...nameStyleProps({ ...style, nameFx: fx, nameColors: style.nameColors?.length ? style.nameColors : [toHex6(color), "#ff6ec4"] }, "Aa", color)}>Aa</strong>
              <small>{FX_LABELS[fx]}</small>
            </Option>
          ))}
        </div>
      </Section>

      <Section title="Name Font">
        <div className="ps-grid">
          <Option chosen={!style.nameFont} onClick={() => set({ nameFont: undefined })}>
            <strong>{name.slice(0, 10)}</strong>
            <small>Default</small>
          </Option>
          {NAME_FONTS.map((font) => (
            <Option key={font} chosen={style.nameFont === font} onClick={() => set({ nameFont: font })}>
              <strong className={`pname-font-${font}`}>{name.slice(0, 10)}</strong>
              <small>{FONT_LABELS[font]}</small>
            </Option>
          ))}
        </div>
      </Section>

      <Section title="Card Theme" hint="Two colors that tint your whole profile card, with a gradient border.">
        <div className="ps-colors">
          <button
            type="button"
            className={`pe-chip${!style.themeColors ? " active" : ""}`}
            onClick={() => set({ themeColors: undefined })}
          >
            Off
          </button>
          {style.themeColors ? (
            style.themeColors.map((c, i) => (
              <label key={i} className="ps-color" style={{ background: c }} title={i ? "Accent" : "Primary"}>
                <input
                  type="color"
                  value={c}
                  onChange={(event) => {
                    const next: [string, string] = [...style.themeColors!] as [string, string];
                    next[i] = event.target.value;
                    set({ themeColors: next });
                  }}
                  aria-label={i ? "Accent color" : "Primary color"}
                />
              </label>
            ))
          ) : (
            <button type="button" className="pe-chip" onClick={() => set({ themeColors: [toHex6(color), "#ec4899"] })}>
              Pick colors
            </button>
          )}
        </div>
        <div className="ps-presets">
          {THEME_PRESETS.map((preset) => (
            <button
              key={preset.join()}
              type="button"
              className={`ps-preset${style.themeColors?.join() === preset.join() ? " chosen" : ""}`}
              style={{ background: `linear-gradient(135deg, ${preset[0]}, ${preset[1]})` }}
              onClick={() => set({ themeColors: preset })}
              aria-label={`Theme ${preset.join(" and ")}`}
            />
          ))}
        </div>
      </Section>

      <Section title="Card Motion" hint="Try hovering the preview.">
        <div className="ps-grid">
          {CARD_MOTIONS.map((motion) => (
            <Option key={motion} chosen={(style.cardMotion || "tilt") === motion} onClick={() => set({ cardMotion: motion === "tilt" ? undefined : motion })}>
              <strong>{MOTION_LABELS[motion][0]}</strong>
              <small>{MOTION_LABELS[motion][1]}</small>
            </Option>
          ))}
        </div>
      </Section>

      <Section title="Voice Speaking Ring" hint="Replaces the green ring around your avatar on voice tiles while you talk.">
        <div className="ps-grid">
          <Option chosen={!style.voiceRing} onClick={() => set({ voiceRing: undefined })}>
            <TileDemo className="avatar-tile is-speaking" avatar={avatar} avatarUrl={avatarUrl} color={color} />
            <small>Classic</small>
          </Option>
          {VOICE_RINGS.map((ring) => (
            <Option key={ring} chosen={style.voiceRing === ring} onClick={() => set({ voiceRing: ring })}>
              <TileDemo
                className={`is-speaking ${voiceTileClasses({ voiceRing: ring })}`}
                ringColor={style.themeColors?.[0] || style.nameColors?.[0] || color}
                avatar={avatar}
                avatarUrl={avatarUrl}
                color={color}
              />
              <small>{RING_LABELS[ring]}</small>
            </Option>
          ))}
        </div>
      </Section>

      <Section title="Voice Join Flourish" hint="Plays on your tile for everyone already in the room when you join.">
        <div className="ps-grid">
          <Option chosen={!style.entrance} onClick={() => set({ entrance: undefined })}>
            <TileDemo className="" avatar={avatar} avatarUrl={avatarUrl} color={color} />
            <small>None</small>
          </Option>
          {ENTRANCES.map((entrance) => (
            <Option
              key={entrance}
              chosen={style.entrance === entrance}
              onClick={() => {
                set({ entrance });
                setReplay((n) => n + 1);
              }}
            >
              <TileDemo
                key={`${entrance}-${style.entrance === entrance ? replay : 0}`}
                className={voiceTileClasses({ entrance })}
                ringColor={style.themeColors?.[0] || style.nameColors?.[0] || color}
                avatar={avatar}
                avatarUrl={avatarUrl}
                color={color}
              />
              <small>
                {ENTRANCE_LABELS[entrance]}
                {style.entrance === entrance && (
                  <span className="ps-replay"> · <RotateCcw size={9} /> replay</span>
                )}
              </small>
            </Option>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="pe-field">
      <div className="pe-field-head">
        <span>{title}</span>
      </div>
      {children}
      {hint && <p className="pe-field-hint">{hint}</p>}
    </div>
  );
}

function Option({ chosen, onClick, children }: { chosen: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={`ps-option${chosen ? " chosen" : ""}`} aria-pressed={chosen} onClick={onClick}>
      {children}
    </button>
  );
}

function TileDemo({
  className,
  ringColor,
  avatar,
  avatarUrl,
  color,
}: {
  className: string;
  ringColor?: string;
  avatar: string;
  avatarUrl: string | null;
  color: string;
}) {
  return (
    <span className={`ps-tile-demo ${className}`} style={{ "--vr-color": ringColor } as React.CSSProperties}>
      <span className="avatar-tile-inner">
        <Avatar className="stage-avatar" avatar={avatar} avatarUrl={avatarUrl} color={color} />
      </span>
    </span>
  );
}

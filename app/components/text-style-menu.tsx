"use client";

import { useState } from "react";
import {
  HIGHLIGHT_COLORS,
  PER_LETTER_EFFECTS,
  TEXT_COLORS,
  TEXT_EFFECTS,
  TEXT_FONTS,
  TEXT_SIZES,
} from "@/lib/text-style";

/** Two-colour presets for `[c=a]…[/c=b]` gradients. */
const GRADIENTS = [
  { name: "Sunset", from: "red", to: "yellow" },
  { name: "Ocean", from: "cyan", to: "navy" },
  { name: "Candy", from: "pink", to: "purple" },
  { name: "Lime", from: "lime", to: "teal" },
  { name: "Fire", from: "yellow", to: "red" },
  { name: "Grape", from: "purple", to: "blue" },
];

function Letters({ text }: { text: string }) {
  return (
    <>
      {Array.from(text).map((char, i) => (
        <span key={i} className="fx-letter" style={{ "--fx-i": i } as React.CSSProperties}>
          {char}
        </span>
      ))}
    </>
  );
}

/**
 * Colours, highlights, fonts, sizes and effects for the composer. Picking one
 * wraps the current selection (or drops the tags at the caret) through
 * `onWrap`; everything it writes is plain text the renderer understands, so
 * it can be typed by hand too.
 */
export function TextStyleMenu({
  onWrap,
  className = "text-style-menu",
  title,
  onClose,
}: {
  /** Wraps the composer selection in `open` … `close`. */
  onWrap: (open: string, close: string) => void;
  className?: string;
  /** Shown as an MSN-style title bar when given. */
  title?: string;
  onClose?: () => void;
}) {
  const [custom, setCustom] = useState("#3e7bfa");
  const tag = (name: string, arg?: string) =>
    onWrap(arg ? `[${name}=${arg}]` : `[${name}]`, `[/${name}]`);

  return (
    <div className={className} role="dialog" aria-label="Text formatting">
      {title && (
        <div className="msn-popover-title">
          {title}
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close">
              ×
            </button>
          )}
        </div>
      )}
      <h4>Style</h4>
      <div className="text-style-row">
        <button type="button" title="Bold (Ctrl+B)" onClick={() => onWrap("**", "**")}>
          <b>B</b>
        </button>
        <button type="button" title="Italic (Ctrl+I)" onClick={() => onWrap("*", "*")}>
          <i>I</i>
        </button>
        <button type="button" title="Underline (Ctrl+U)" onClick={() => onWrap("__", "__")}>
          <u>U</u>
        </button>
        <button type="button" title="Strikethrough" onClick={() => onWrap("~~", "~~")}>
          <s>S</s>
        </button>
        <button type="button" title="Spoiler" onClick={() => onWrap("||", "||")}>
          ▒
        </button>
        <button type="button" title="Inline code" onClick={() => onWrap("`", "`")}>
          <code>{"</>"}</code>
        </button>
        <button type="button" title="Small print (-#)" onClick={() => onWrap("-# ", "")}>
          <small>-#</small>
        </button>
        <button type="button" title="Superscript" onClick={() => tag("sup")}>
          x<sup>2</sup>
        </button>
        <button type="button" title="Subscript" onClick={() => tag("sub")}>
          x<sub>2</sub>
        </button>
      </div>

      <h4>Colour</h4>
      <div className="text-style-row">
        {Object.entries(TEXT_COLORS).map(([name, value]) => (
          <button
            key={name}
            type="button"
            className="text-style-swatch"
            style={{ background: value }}
            title={name}
            aria-label={`Colour ${name}`}
            onClick={() => tag("c", name)}
          />
        ))}
        <label className="text-style-swatch text-style-custom" title="Any colour">
          <input
            type="color"
            value={custom}
            aria-label="Pick any colour"
            onChange={(event) => setCustom(event.target.value)}
          />
        </label>
        <button type="button" title="Use the colour you picked" onClick={() => tag("c", custom)}>
          <span style={{ color: custom, fontWeight: 700 }}>{custom}</span>
        </button>
      </div>

      <h4>Gradient</h4>
      <div className="text-style-row">
        {GRADIENTS.map((g) => (
          <button
            key={g.name}
            type="button"
            onClick={() => onWrap(`[c=${g.from}]`, `[/c=${g.to}]`)}
          >
            <span
              className="fx-gradient"
              style={{
                backgroundImage: `linear-gradient(90deg, ${TEXT_COLORS[g.from]}, ${TEXT_COLORS[g.to]})`,
                fontWeight: 700,
              }}
            >
              {g.name}
            </span>
          </button>
        ))}
      </div>

      <h4>Highlight</h4>
      <div className="text-style-row">
        {Object.entries(HIGHLIGHT_COLORS).map(([name, value]) => (
          <button
            key={name}
            type="button"
            className="text-style-swatch"
            style={{ background: value }}
            title={`${name} highlighter`}
            aria-label={`Highlight ${name}`}
            onClick={() => tag("a", name)}
          />
        ))}
      </div>

      <h4>Font</h4>
      <div className="text-style-row text-style-fonts">
        {TEXT_FONTS.map((font) => (
          <button
            key={font.id}
            type="button"
            style={{ fontFamily: font.stack }}
            onClick={() => tag("f", font.id)}
          >
            {font.name}
          </button>
        ))}
      </div>

      <h4>Size</h4>
      <div className="text-style-row">
        {Object.entries(TEXT_SIZES).map(([name, size]) => (
          <button key={name} type="button" onClick={() => tag("size", name)}>
            <span style={{ fontSize: `calc(13px * ${parseFloat(size)})` }}>{name}</span>
          </button>
        ))}
      </div>

      <h4>Effects</h4>
      <div className="text-style-row">
        {TEXT_EFFECTS.filter((e) => e.id !== "sup" && e.id !== "sub").map((effect) => (
          <button key={effect.id} type="button" onClick={() => tag(effect.id)}>
            <span className={`fx fx-${effect.id}`}>
              {PER_LETTER_EFFECTS.has(effect.id) ? <Letters text={effect.name} /> : effect.name}
            </span>
          </button>
        ))}
      </div>

      <p className="text-style-hint">
        Or type them: <code>[c=red]hi[/c]</code> <code>[f=comic]hi[/f]</code>{" "}
        <code>[c=pink]hi[/c=blue]</code> <code>[wave]hi[/wave]</code> — Messenger Plus! style.
      </p>
    </div>
  );
}

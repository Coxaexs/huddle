"use client";

import { useState } from "react";
import { useI18n } from "../lib/i18n-context";
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
  const { t } = useI18n();
  const [custom, setCustom] = useState("#3e7bfa");
  const tag = (name: string, arg?: string) =>
    onWrap(arg ? `[${name}=${arg}]` : `[${name}]`, `[/${name}]`);

  return (
    <div className={className} role="dialog" aria-label={t("chat.textStyle.aria")}>
      {title && (
        <div className="msn-popover-title">
          {title}
          {onClose && (
            <button type="button" onClick={onClose} aria-label={t("common.close")}>
              ×
            </button>
          )}
        </div>
      )}
      <h4>{t("chat.textStyle.style")}</h4>
      <div className="text-style-row">
        <button type="button" title={t("chat.textStyle.bold")} onClick={() => onWrap("**", "**")}>
          <b>B</b>
        </button>
        <button type="button" title={t("chat.textStyle.italic")} onClick={() => onWrap("*", "*")}>
          <i>I</i>
        </button>
        <button type="button" title={t("chat.textStyle.underline")} onClick={() => onWrap("__", "__")}>
          <u>U</u>
        </button>
        <button type="button" title={t("chat.textStyle.strikethrough")} onClick={() => onWrap("~~", "~~")}>
          <s>S</s>
        </button>
        <button type="button" title={t("chat.textStyle.spoiler")} onClick={() => onWrap("||", "||")}>
          ▒
        </button>
        <button type="button" title={t("chat.textStyle.inlineCode")} onClick={() => onWrap("`", "`")}>
          <code>{"</>"}</code>
        </button>
        <button type="button" title={t("chat.textStyle.smallPrint")} onClick={() => onWrap("-# ", "")}>
          <small>-#</small>
        </button>
        <button type="button" title={t("chat.textStyle.superscript")} onClick={() => tag("sup")}>
          x<sup>2</sup>
        </button>
        <button type="button" title={t("chat.textStyle.subscript")} onClick={() => tag("sub")}>
          x<sub>2</sub>
        </button>
      </div>

      <h4>{t("chat.textStyle.colour")}</h4>
      <div className="text-style-row">
        {Object.entries(TEXT_COLORS).map(([name, value]) => (
          <button
            key={name}
            type="button"
            className="text-style-swatch"
            style={{ background: value }}
            title={name}
            aria-label={t("chat.textStyle.colourAria", { name })}
            onClick={() => tag("c", name)}
          />
        ))}
        <label className="text-style-swatch text-style-custom" title={t("chat.textStyle.anyColour")}>
          <input
            type="color"
            value={custom}
            aria-label={t("chat.textStyle.pickAnyColour")}
            onChange={(event) => setCustom(event.target.value)}
          />
        </label>
        <button type="button" title={t("chat.textStyle.usePickedColour")} onClick={() => tag("c", custom)}>
          <span style={{ color: custom, fontWeight: 700 }}>{custom}</span>
        </button>
      </div>

      <h4>{t("chat.textStyle.gradient")}</h4>
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

      <h4>{t("chat.textStyle.highlight")}</h4>
      <div className="text-style-row">
        {Object.entries(HIGHLIGHT_COLORS).map(([name, value]) => (
          <button
            key={name}
            type="button"
            className="text-style-swatch"
            style={{ background: value }}
            title={t("chat.textStyle.highlighterTitle", { name })}
            aria-label={t("chat.textStyle.highlightAria", { name })}
            onClick={() => tag("a", name)}
          />
        ))}
      </div>

      <h4>{t("chat.textStyle.font")}</h4>
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

      <h4>{t("chat.textStyle.size")}</h4>
      <div className="text-style-row">
        {Object.entries(TEXT_SIZES).map(([name, size]) => (
          <button key={name} type="button" onClick={() => tag("size", name)}>
            <span style={{ fontSize: `calc(13px * ${parseFloat(size)})` }}>{name}</span>
          </button>
        ))}
      </div>

      <h4>{t("chat.textStyle.effects")}</h4>
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
        {t("chat.textStyle.hintLead")} <code>[c=red]hi[/c]</code> <code>[f=comic]hi[/f]</code>{" "}
        <code>[c=pink]hi[/c=blue]</code> <code>[wave]hi[/wave]</code> {t("chat.textStyle.hintTail")}
      </p>
    </div>
  );
}

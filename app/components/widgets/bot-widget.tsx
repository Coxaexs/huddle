"use client";

import { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { apiFetch } from "@/app/lib/client";
import { useI18n } from "@/app/lib/i18n-context";
import type { BotWidget as BotWidgetData } from "@/lib/bot-widgets";
import type { WidgetSize } from "@/lib/layout-prefs";
import {
  BotEmbeds,
  type BotComponent,
  type BotComponentRow,
  type BotEmbedData,
} from "../bot-embeds";
import { useWidgetHost } from "./widget-host";
import { openWebView } from "./web-view";

const BUTTON = 2;
const LINK_STYLE = 5;

function safeImage(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url, window.location.href);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A bot's widget. Medium and large render the embed and components exactly
 * as a bot message does (BotEmbeds); small squeezes it into one line: the
 * thumbnail, the title, and the first row's buttons (emoji only when they
 * have one).
 */
export function BotWidget({ widget, size }: { widget: BotWidgetData; size: WidgetSize }) {
  const { t } = useI18n();
  const host = useWidgetHost();
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), 4000);
    return () => clearTimeout(timer);
  }, [note]);

  const press = async (customId: string, componentType: number, values?: string[]) => {
    const result = await apiFetch<{ ok: boolean; reason?: string | null }>("/api/widgets/press", {
      method: "POST",
      body: JSON.stringify({
        serverId: widget.serverId,
        botId: widget.botId,
        name: widget.name,
        channelId: widget.channelId,
        contextChannelId: host.activeChannelId,
        customId,
        componentType,
        values,
      }),
    }).catch(() => ({ ok: false, reason: "failed" }));
    if (!result.ok) setNote(result.reason === "offline" ? t("widget.offline") : t("widget.failed"));
  };

  const embeds = (widget.embeds as BotEmbedData[]).slice(0, size === "large" ? 2 : 1);
  const rows = widget.components as BotComponentRow[];
  const web = widget.webviewUrl && (
    <button
      type="button"
      className="mw-btn"
      onClick={() => openWebView({ url: widget.webviewUrl!, title: widget.title })}
      title={t("widget.openWebTitle", { name: widget.title })}
      aria-label={t("widget.openWebTitle", { name: widget.title })}
    >
      <Globe size={14} />
    </button>
  );

  if (size === "small") {
    const embed = embeds[0];
    const thumb = safeImage(embed?.thumbnail?.url || embed?.author?.icon_url);
    const line = embed?.title || widget.content.split("\n")[0] || widget.title;
    const buttons = (rows[0]?.components || [])
      .filter((component): component is BotComponent => component?.type === BUTTON)
      .slice(0, 4);
    return (
      <div className="bw bw-small" title={`${widget.title} · ${line}`}>
        {thumb ? <img className="mw-art" src={thumb} alt="" /> : <span className="mw-art mw-art-empty">{widget.botAvatar}</span>}
        <span className="mw-line">
          <strong>{line}</strong>
        </span>
        <span className="mw-controls">
          {buttons.map((button, index) => {
            const label = button.emoji?.name || button.label || "•";
            const title = button.label || button.emoji?.name || "";
            if (button.style === LINK_STYLE && button.url) {
              return (
                <a key={index} className="mw-btn" href={button.url} target="_blank" rel="noreferrer" title={title}>
                  {label}
                </a>
              );
            }
            const id = button.custom_id || "";
            return (
              <button
                key={index}
                type="button"
                className={`mw-btn ${button.style === 1 ? "mw-btn-main" : ""}`}
                disabled={button.disabled || !id || pending !== null}
                title={title}
                aria-label={title}
                onClick={async () => {
                  setPending(id);
                  try {
                    await press(id, BUTTON);
                  } finally {
                    setPending(null);
                  }
                }}
              >
                {button.emoji?.name || (button.label || "•").slice(0, 3)}
              </button>
            );
          })}
          {web}
        </span>
        {note && <span className="bw-note" role="status">{note}</span>}
      </div>
    );
  }

  return (
    <div className={`bw bw-${size}`}>
      <div className="bw-head">
        <span className="bw-avatar" aria-hidden="true">{widget.botAvatar}</span>
        <strong>{widget.title}</strong>
        <small>{widget.botName}</small>
        <span className="mw-spacer" />
        {web}
      </div>
      {widget.content && <p className="bw-content">{widget.content}</p>}
      <BotEmbeds
        // Medium is the headline: no fields, picture or footer, one row of buttons.
        embeds={size === "medium" ? embeds.map((embed) => ({ ...embed, image: undefined, fields: undefined, footer: undefined })) : embeds}
        components={size === "medium" ? rows.slice(0, 1) : rows}
        onComponent={press}
      />
      {note && <p className="mw-note" role="status">{note}</p>}
    </div>
  );
}

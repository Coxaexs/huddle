"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ellipsis } from "lucide-react";
import type { GuestbookMessage } from "@/app/api/guestbook/route";
import { Avatar } from "@/app/components/avatar";
import { DiceOverlay } from "@/app/components/dice-overlay";
import { DndCard, type DndCardProps } from "@/app/components/dnd-card";
import { MatrixRain } from "@/app/components/matrix-rain";
import { MessageBody } from "@/app/components/message-body";
import { dayDividerLabel, formatClientDateTime, formatClientTime } from "@/app/lib/chat/format";
import { checkGuestText } from "@/lib/guestbook";
import type { DiceRollEvent } from "@/lib/protocol";
import { stripTextStyle } from "@/lib/text-style";
import { applyThemeToDocument, BUILTIN_THEMES } from "@/lib/themes";
import { BOT_ACTIONS, HTML_ATTRS_MSN, HTML_ATTRS_STANDARD, SHELL_MSN, SHELL_STANDARD, VISITOR_ACTIONS } from "./templates";

/**
 * hoffle.online's live #say-hi, framed into the landing page.
 *
 * This page is the real app as far as looks go: the app shell is the app's
 * own markup (templates.ts), styled by the app's own CSS and theme engine,
 * and messages are drawn with the app's own Avatar, MessageBody and DndCard.
 * Only #say-hi works. Everything else asks the landing page to explain how to
 * get the full app.
 *
 * The landing page (landing-demo.tsx) owns the name prompt and the posting;
 * the two talk with postMessage, same origin only.
 */

export type EmbedToParent =
  | { hoffle: "say-hi"; type: "ready" }
  | { hoffle: "say-hi"; type: "compose"; text: string; diceTheme: string }
  | { hoffle: "say-hi"; type: "locked"; what: string };

export type ParentToEmbed =
  | { hoffle: "say-hi"; type: "theme"; id: string }
  | { hoffle: "say-hi"; type: "sent"; message: GuestbookMessage; roll?: DiceRollEvent; name: string }
  | { hoffle: "say-hi"; type: "error"; error: string };

const POLL_MS = 8000;

function themeOrDefault(id: string) {
  return BUILTIN_THEMES.find((theme) => theme.id === id) ?? BUILTIN_THEMES[0];
}

/** What the app's /roll picks for dice skins under each theme. */
function diceThemeFor(themeId: string): string {
  return ["vampire", "dark-academia", "matrix", "cyberpunk"].includes(themeId) ? themeId : "default";
}

/** Sets <html> up exactly as the app does for a theme. */
function applyAppTheme(themeId: string) {
  const root = document.documentElement;
  const attrs = themeId.startsWith("msn") ? HTML_ATTRS_MSN : HTML_ATTRS_STANDARD;
  for (const name of new Set([...Object.keys(HTML_ATTRS_STANDARD), ...Object.keys(HTML_ATTRS_MSN)])) {
    root.removeAttribute(name);
  }
  for (const [name, value] of Object.entries(attrs)) root.setAttribute(name, value);
  root.dataset.keyboard = "closed";
  root.style.setProperty("--app-height", `${window.innerHeight}px`);
  try {
    applyThemeToDocument(themeOrDefault(themeId));
  } catch {
    // It also saves the choice to localStorage, which can be blocked; the
    // colours are set before that, so the page still looks right.
  }
}

function MessageList({ messages, onCommand }: { messages: GuestbookMessage[]; onCommand?: (command: string) => void }) {
  return (
    <>
      {messages.map((message, index) => (
        <article
          key={message.id}
          id={`msg-${message.id}`}
          data-day={dayDividerLabel(message, messages[index - 1]) ?? undefined}
          className="message      "
        >
          <Avatar
            avatar={message.avatar}
            avatarUrl={message.avatarUrl}
            color={message.color}
            className={message.bot ? "avatar bot-avatar" : "avatar"}
          />
          <div className="message-body">
            {message.commandText && (
              <div className="command-invocation">
                <span className="reply-arrow">↩</span>
                <strong>{message.commandBy}</strong>
                <span className="command-used">used</span>
                <code>{message.commandText}</code>
              </div>
            )}
            <div className="message-meta">
              <strong className="">{stripTextStyle(message.author)}</strong>
              {message.bot && <span className="bot-tag">BOT</span>}
              <time title={formatClientDateTime(message.createdAt)}>{formatClientTime(message.createdAt)}</time>
            </div>
            {message.kind === "dnd" && message.payload ? (
              <DndCard {...(message.payload as DndCardProps)} onCommand={onCommand} />
            ) : (
              <MessageBody text={message.text} />
            )}
          </div>
          <button type="button" className="message-actions-toggle" aria-label="Message actions">
            <Ellipsis size={18} aria-hidden="true" />
          </button>
          <div className="message-actions" dangerouslySetInnerHTML={{ __html: message.bot ? BOT_ACTIONS : VISITOR_ACTIONS }} />
        </article>
      ))}
    </>
  );
}

interface Slots {
  main: HTMLElement;
  messages: HTMLElement;
  chat: HTMLElement;
  textarea: HTMLTextAreaElement | null;
  hint: HTMLElement | null;
  status: HTMLElement | null;
}

export function SayHiEmbed({ initialTheme }: { initialTheme: string }) {
  const [themeId, setThemeId] = useState(themeOrDefault(initialTheme).id);
  const msn = themeId.startsWith("msn");
  const hostRef = useRef<HTMLDivElement>(null);
  const [slots, setSlots] = useState<Slots | null>(null);
  const [messages, setMessages] = useState<GuestbookMessage[]>([]);
  const [dice, setDice] = useState<DiceRollEvent | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [guestName, setGuestName] = useState<string | null>(null);
  // Hidden until <html> carries the theme, so the unstyled shell never flashes.
  const [themed, setThemed] = useState(false);
  const stick = useRef(true);
  const themeRef = useRef(themeId);
  themeRef.current = themeId;

  const toParent = (message: EmbedToParent) => {
    if (window.parent !== window) window.parent.postMessage(message, window.location.origin);
  };

  useLayoutEffect(() => {
    applyAppTheme(themeId);
    setThemed(true);
  }, [themeId]);

  useEffect(() => {
    const onResize = () => document.documentElement.style.setProperty("--app-height", `${window.innerHeight}px`);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // The shell goes in here rather than through React, so hydration can never
  // swap it for a copy and leave the live parts below pointing at old nodes.
  // It is replaced when the layout changes (MSN or not).
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = msn ? SHELL_MSN : SHELL_STANDARD;
    // Like the app, the member list starts open only on screens wider than 760px.
    if (window.innerWidth <= 760) {
      host.querySelector("main.app-shell")?.classList.remove("has-members");
      host.querySelector(".member-panel")?.classList.add("closed");
      host.querySelector('[aria-label="Toggle member list"]')?.classList.remove("active");
    }
    setSlots({
      main: host.querySelector<HTMLElement>("main.app-shell")!,
      messages: host.querySelector<HTMLElement>(".messages")!,
      chat: host.querySelector<HTMLElement>(".chat-panel")!,
      textarea: host.querySelector<HTMLTextAreaElement>(".composer textarea"),
      hint: host.querySelector<HTMLElement>(".composer-hint"),
      status: host.querySelector<HTMLElement>(".msn-status-bar"),
    });
  }, [msn]);

  // Everyone's messages, polled while the page is visible.
  useEffect(() => {
    let stopped = false;
    const refresh = async () => {
      try {
        const response = await fetch("/api/guestbook", { cache: "no-store" });
        if (!response.ok || stopped) return;
        const data = (await response.json()) as { messages?: GuestbookMessage[] };
        if (Array.isArray(data.messages)) setMessages(data.messages);
      } catch {
        /* offline for a moment; the next poll tries again */
      }
    };
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, []);

  // The landing page talks to us: theme changes, sent messages, errors.
  useEffect(() => {
    const onMessage = (event: MessageEvent<ParentToEmbed>) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      const data = event.data;
      if (!data || data.hoffle !== "say-hi") return;
      if (data.type === "theme") setThemeId(themeOrDefault(data.id).id);
      if (data.type === "error") setNotice(data.error);
      if (data.type === "sent") {
        stick.current = true;
        setNotice(null);
        setGuestName(data.name);
        setMessages((current) => (current.some((m) => m.id === data.message.id) ? current : [...current, data.message]));
        if (data.roll) setDice(data.roll);
        const textarea = hostRef.current?.querySelector<HTMLTextAreaElement>(".composer textarea");
        if (textarea) textarea.value = "";
      }
    };
    window.addEventListener("message", onMessage);
    toParent({ hoffle: "say-hi", type: "ready" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const compose = (text: string) => {
    const checked = checkGuestText(text);
    if (!checked.ok) {
      setNotice(checked.error);
      return;
    }
    setNotice(null);
    toParent({ hoffle: "say-hi", type: "compose", text: checked.value, diceTheme: diceThemeFor(themeRef.current) });
  };

  // Clicks, typing and scrolling inside the captured shell.
  useEffect(() => {
    const host = hostRef.current;
    if (!slots || !host) return;
    const { main, textarea, messages: list } = slots;

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element;
      if (target.closest("textarea, input, .dnd-roll-again")) return;
      const el = target.closest<HTMLElement>("button, a, [role=button], .mobile-nav-backdrop, .member");
      if (!el) return;
      event.preventDefault();
      const label = el.getAttribute("aria-label") || "";
      // Other text channels and voice rooms are where the full app starts.
      if (el.matches(".channel:not(.selected), .voice-room")) {
        const name = el.querySelector("span:not(.channel-delete):not(.speaker-icon)")?.textContent?.trim() || "";
        main.classList.remove("nav-open");
        toParent({
          hoffle: "say-hi",
          type: "locked",
          what: el.classList.contains("voice-room") ? `the ${name} voice room` : `#${name}`,
        });
        return;
      }
      // The few things that work here work as in the app.
      if (label === "Toggle member list") {
        const open = main.classList.toggle("has-members");
        main.querySelector(".member-panel")?.classList.toggle("closed", !open);
        el.classList.toggle("active", open);
        return;
      }
      if (label === "Open channels") return void main.classList.add("nav-open");
      if (label === "Close menu" || el.classList.contains("mobile-nav-backdrop")) return void main.classList.remove("nav-open");
      if (label === "Show commands" && textarea) {
        textarea.value = "/roll d20";
        textarea.focus();
        return;
      }
      if (el.classList.contains("message-actions-toggle")) {
        el.closest("article")?.classList.toggle("actions-open");
        return;
      }
      // Everything else (mute, settings, GIFs, games, profiles...) quietly does nothing here.
    };
    const onSubmit = (event: Event) => event.preventDefault();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      if (textarea) compose(textarea.value);
    };
    const onInput = () => setNotice(null);
    const onScroll = () => {
      stick.current = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
    };

    host.addEventListener("click", onClick);
    host.addEventListener("submit", onSubmit);
    textarea?.addEventListener("keydown", onKeyDown);
    textarea?.addEventListener("input", onInput);
    list.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      host.removeEventListener("click", onClick);
      host.removeEventListener("submit", onSubmit);
      textarea?.removeEventListener("keydown", onKeyDown);
      textarea?.removeEventListener("input", onInput);
      list.removeEventListener("scroll", onScroll);
    };
  }, [slots]);

  // Follow new messages when the reader is at the bottom, as the app does.
  useEffect(() => {
    if (slots && stick.current) slots.messages.scrollTop = slots.messages.scrollHeight;
  }, [slots, messages]);

  // A problem with the message shows where the app shows its composer hint.
  useEffect(() => {
    const hint = slots?.hint;
    if (!hint) return;
    const original = hint.innerHTML;
    if (notice) {
      hint.textContent = notice;
      hint.style.color = "var(--coral)";
      hint.setAttribute("role", "alert");
    }
    return () => {
      hint.innerHTML = original;
      hint.style.color = "";
      hint.removeAttribute("role");
    };
  }, [slots, notice]);

  // MSN's status bar line, and the visitor's name in the footer and member list.
  useEffect(() => {
    if (slots?.status) {
      const last = messages[messages.length - 1];
      slots.status.textContent = last
        ? `Last message received at ${new Date(last.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} on ${new Date(last.createdAt).toLocaleDateString()}.`
        : "No messages received yet.";
    }
  }, [slots, messages]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !guestName || !slots) return;
    for (const el of host.querySelectorAll(".user-footer-name, .member-name-line strong")) el.textContent = guestName;
    for (const el of host.querySelectorAll(".user-footer-avatar, .member-avatar, .msn-dp.changeable .msn-dp-image")) {
      const letter = el.firstChild;
      if (letter?.nodeType === Node.TEXT_NODE) letter.textContent = guestName[0].toUpperCase();
      if (el.hasAttribute("title")) el.setAttribute("title", guestName);
    }
    const caption = host.querySelector(".msn-dp.changeable figcaption");
    if (caption) caption.textContent = guestName;
  }, [slots, guestName]);

  return (
    <>
      <MatrixRain />
      <div ref={hostRef} style={{ display: "contents", visibility: themed ? undefined : "hidden" }} />
      {slots && createPortal(<MessageList messages={messages} onCommand={compose} />, slots.messages)}
      {slots && dice && createPortal(
        <DiceOverlay roll={dice} onDone={() => setDice(null)} className="dice-overlay chat-dice-overlay" />,
        slots.chat,
      )}
    </>
  );
}

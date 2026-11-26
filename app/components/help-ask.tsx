"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

/**
 * "Ask the guide": a small chat that answers from the user manual
 * (app/api/(features)/ai/help). Used on hoffle.online/help, where it is the
 * page's search, and inside the app's Help dialog. It draws itself with the
 * colour tokens both places share (--ink, --muted, --line, --paper) and its
 * own `hask-` classes, so it needs no styles from either.
 *
 * Everything passed in is plain data: the help pages are server components.
 */

export type HelpAskLang = "tr" | "en";

interface Source {
  n: number;
  chapter: string;
  icon: string;
  section: string;
  href: string;
}

interface Turn {
  role: "user" | "model";
  text: string;
  sources?: Source[];
  /** Shown instead of an answer when the reply is search results only. */
  notice?: string;
  error?: boolean;
}

const ADULT_KEY = "hoffle-help-ai-adult";

const COPY: Record<
  HelpAskLang,
  {
    title: string;
    lead: string;
    placeholder: string;
    send: string;
    thinking: string;
    fromGuide: string;
    examples: string[];
    ageQuestion: string;
    ageYes: string;
    ageNo: string;
    fine: string;
    clear: string;
    open: string;
    close: string;
    failed: string;
  }
> = {
  en: {
    title: "Ask the guide",
    lead: "Ask in your own words. The answer comes from this guide, with links to the right section.",
    placeholder: "e.g. How do I share my screen?",
    send: "Ask",
    thinking: "Looking through the guide…",
    fromGuide: "From the guide",
    examples: [
      "How do I make my own server?",
      "How do I share my screen?",
      "How do I add the music bot?",
      "Can I bring my Discord server over?",
    ],
    ageQuestion:
      "The assistant writes its answers with Google's Gemini AI, which is for people 18 and over. Are you 18 or older? If not, you'll still get links to the right sections.",
    ageYes: "Yes, I'm 18+",
    ageNo: "No, just show sections",
    fine: "Answers are written by AI from this guide and can be wrong. Check the linked section.",
    clear: "Start over",
    open: "Ask a question",
    close: "Close",
    failed: "Couldn't reach Hoffle. Check your connection and try again.",
  },
  tr: {
    title: "Kılavuza sor",
    lead: "Kendi kelimelerinle sor. Cevap bu kılavuzdan gelir, ilgili bölümün bağlantısıyla.",
    placeholder: "Örn. Ekranımı nasıl paylaşırım?",
    send: "Sor",
    thinking: "Kılavuza bakılıyor…",
    fromGuide: "Kılavuzdan",
    examples: [
      "Kendi sunucumu nasıl kurarım?",
      "Ekranımı nasıl paylaşırım?",
      "Müzik botunu nasıl eklerim?",
      "Discord sunucumu taşıyabilir miyim?",
    ],
    ageQuestion:
      "Asistan cevaplarını Google'ın Gemini yapay zekâsıyla yazıyor; o da 18 yaş ve üstü için. 18 yaşında ya da daha büyük müsün? Değilsen de ilgili bölümlerin bağlantılarını görürsün.",
    ageYes: "Evet, 18+",
    ageNo: "Hayır, sadece bölümleri göster",
    fine: "Cevapları yapay zekâ bu kılavuzdan yazar ve yanılabilir. Bağlantıdaki bölüme de göz at.",
    clear: "Baştan başla",
    open: "Soru sor",
    close: "Kapat",
    failed: "Hoffle'a ulaşılamadı. Bağlantını kontrol edip tekrar dene.",
  },
};

const CSS = `
  .hask { --hask-accent: var(--violet, var(--lavender, #6a4ddb)); --hask-card: var(--card, var(--panel, var(--paper, #fff)));
    color: var(--ink, inherit); font-size: 15px; line-height: 1.55; text-align: left; }
  .hask-box { border: 1px solid var(--line, rgba(127,127,127,.3)); border-radius: 16px; background: var(--hask-card); padding: 18px; }
  .hask-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .hask-title { margin: 0; font-size: 18px; font-weight: 800; color: var(--ink, inherit); display: flex; align-items: center; gap: 8px; }
  .hask-lead { margin: 4px 0 0; color: var(--muted, inherit); font-size: 14px; }
  .hask-log { margin-top: 14px; display: flex; flex-direction: column; gap: 12px; max-height: var(--hask-max, 420px); overflow-y: auto; overscroll-behavior: contain; }
  .hask-q { align-self: flex-end; max-width: 85%; background: var(--hask-accent); color: #fff; border-radius: 14px 14px 4px 14px; padding: 8px 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
  .hask-a { align-self: flex-start; max-width: 100%; color: var(--ink-2, var(--ink, inherit)); overflow-wrap: anywhere; }
  .hask-a p { margin: 0; }
  .hask-a p + p, .hask-a ul, .hask-a ol { margin-top: .5em; }
  .hask-a ul { list-style: disc; padding-left: 1.3em; margin: .4em 0 0; }
  .hask-a ol { list-style: decimal; padding-left: 1.4em; margin: .4em 0 0; }
  .hask-a strong { color: var(--ink, inherit); font-weight: 800; }
  .hask-a code { background: color-mix(in srgb, var(--ink, #888) 10%, transparent); border-radius: 5px; padding: .05em .35em; font-size: .9em; }
  .hask-cite { font-size: .75em; font-weight: 800; vertical-align: super; line-height: 0; color: var(--hask-accent); text-decoration: none; padding: 0 1px; }
  .hask-notice { color: var(--muted, inherit); font-size: 14px; }
  .hask-error { color: #d14343; font-size: 14px; }
  .hask-sources { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
  .hask-sources-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--muted, inherit); }
  .hask-source { display: flex; gap: 8px; align-items: baseline; text-decoration: none; color: var(--ink, inherit); font-size: 14px; padding: 6px 10px; border-radius: 10px;
    border: 1px solid var(--line, rgba(127,127,127,.3)); background: color-mix(in srgb, var(--hask-accent) 4%, transparent); }
  .hask-source:hover { border-color: var(--hask-accent); }
  .hask-source b { color: var(--hask-accent); font-size: 12px; min-width: 1em; }
  .hask-source span { color: var(--muted, inherit); }
  .hask-form { margin-top: 14px; display: flex; gap: 8px; }
  .hask-input { flex: 1; min-width: 0; height: 44px; border-radius: 12px; border: 1px solid var(--line, rgba(127,127,127,.4)); background: var(--paper, transparent);
    color: var(--ink, inherit); padding: 0 14px; font: inherit; font-size: 16px; }
  .hask-input:focus { outline: 2px solid var(--hask-accent); outline-offset: 1px; border-color: transparent; }
  .hask-btn { height: 44px; border-radius: 12px; border: 0; background: var(--hask-accent); color: #fff; font: inherit; font-weight: 700; padding: 0 18px; cursor: pointer; }
  .hask-btn:disabled { opacity: .55; cursor: default; }
  .hask-chips { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px; }
  .hask-chip { border: 1px solid var(--line, rgba(127,127,127,.3)); background: transparent; color: var(--ink-2, var(--ink, inherit)); border-radius: 999px; padding: 5px 12px; font: inherit; font-size: 13.5px; cursor: pointer; }
  .hask-chip:hover { border-color: var(--hask-accent); color: var(--ink, inherit); }
  .hask-age { border: 1px solid var(--line, rgba(127,127,127,.3)); border-radius: 12px; padding: 12px; font-size: 14px; color: var(--ink-2, var(--ink, inherit)); }
  .hask-age-row { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px; }
  .hask-ghost { height: 36px; border-radius: 10px; border: 1px solid var(--line, rgba(127,127,127,.4)); background: transparent; color: var(--ink, inherit); font: inherit; font-size: 14px; font-weight: 600; padding: 0 12px; cursor: pointer; }
  .hask-age-row .hask-btn { height: 36px; font-size: 14px; padding: 0 14px; }
  .hask-fine { margin: 10px 0 0; font-size: 12px; color: var(--muted, inherit); }
  .hask-link { background: none; border: 0; padding: 0; font: inherit; font-size: 13px; color: var(--muted, inherit); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
  .hask-dots::after { content: "…"; animation: hask-dots 1.2s steps(4) infinite; display: inline-block; width: 0; overflow: hidden; vertical-align: bottom; }
  @keyframes hask-dots { to { width: 1.2em; } }
  .hask-fab { position: fixed; right: 18px; bottom: 18px; z-index: 50; display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
  .hask-fab-btn { height: 48px; border-radius: 999px; border: 0; background: var(--hask-accent); color: #fff; font: inherit; font-weight: 700; padding: 0 20px;
    box-shadow: 0 8px 24px -8px rgba(40,20,120,.55); cursor: pointer; display: flex; align-items: center; gap: 8px; }
  .hask-fab-panel { width: min(420px, calc(100vw - 36px)); box-shadow: 0 20px 50px -20px rgba(0,0,0,.45); --hask-max: min(50vh, 420px); }
  .hask-x { background: none; border: 0; font-size: 22px; line-height: 1; color: var(--muted, inherit); cursor: pointer; padding: 4px 6px; border-radius: 8px; }
  @media (prefers-reduced-motion: reduce) { .hask-dots::after { animation: none; width: 1.2em; } }
`;

/** **bold**, `code` and [n] citations; everything else is plain text. */
function inline(text: string, sources: Source[] | undefined, newTab: boolean, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[\d+\])/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyBase}-${i++}`;
    if (token.startsWith("**")) out.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`")) out.push(<code key={key}>{token.slice(1, -1)}</code>);
    else {
      const n = Number(token.slice(1, -1));
      const source = sources?.find((item) => item.n === n);
      out.push(
        source ? (
          <a key={key} className="hask-cite" href={source.href} title={`${source.chapter} › ${source.section}`} {...(newTab ? { target: "_blank", rel: "noopener" } : {})}>
            {n}
          </a>
        ) : null,
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Paragraphs and simple lists from the model's light Markdown, without HTML. */
function Answer({ text, sources, newTab }: { text: string; sources?: Source[]; newTab: boolean }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r/g, "").split("\n");
  let list: { ordered: boolean; items: string[] } | null = null;
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((item, i) => <li key={i}>{inline(item, sources, newTab, `l${blocks.length}-${i}`)}</li>);
    blocks.push(list.ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>);
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { ordered, items: [] };
      list.items.push((bullet || numbered)![1]);
      continue;
    }
    flushList();
    if (!line) continue;
    const plain = line.replace(/^#{1,6}\s+/, "");
    blocks.push(<p key={blocks.length}>{inline(plain, sources, newTab, `p${blocks.length}`)}</p>);
  }
  flushList();
  return <>{blocks}</>;
}

function readAdult(): boolean | null {
  try {
    const value = localStorage.getItem(ADULT_KEY);
    return value === "yes" ? true : value === "no" ? false : null;
  } catch {
    return null;
  }
}

function saveAdult(value: boolean) {
  try {
    localStorage.setItem(ADULT_KEY, value ? "yes" : "no");
  } catch {
    // Private mode: asked again next time, which is fine.
  }
}

export interface HelpAskProps {
  lang: HelpAskLang;
  /** The API path as fetched from this page: "/api/ai/help" on the site, "/hangout/api/ai/help" in the app. */
  endpoint: string;
  /** Prefix for the guide links, e.g. "https://hoffle.online" inside the app. Links then open in a new tab. */
  linkOrigin?: string;
  autoFocus?: boolean;
  /** Leave out the title row (the Help dialog has its own). */
  bare?: boolean;
}

export function HelpAsk({ lang, endpoint, linkOrigin = "", autoFocus = false, bare = false }: HelpAskProps) {
  const copy = COPY[lang];
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [adult, setAdult] = useState<boolean | null>(null);
  /** A question waiting for the 18+ answer. */
  const [pending, setPending] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const newTab = Boolean(linkOrigin);

  useEffect(() => setAdult(readAdult()), []);
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [turns, busy, pending]);

  const ask = async (question: string, isAdult: boolean) => {
    const history = turns
      .filter((turn) => !turn.error && turn.text)
      .slice(-6)
      .map((turn) => ({ role: turn.role, text: turn.text }));
    setTurns((prev) => [...prev, { role: "user", text: question }]);
    setBusy(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, lang, history, adult: isAdult }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        answer?: string | null;
        notice?: string;
        sources?: Source[];
        error?: string;
      };
      let sources = (data.sources || []).map((source) => ({ ...source, href: `${linkOrigin}${source.href}` }));
      // With an answer, list only the sections it cites; the rest were context it didn't use.
      if (data.answer) {
        const cited = new Set([...data.answer.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1])));
        sources = sources.filter((source) => cited.has(source.n));
      }
      if (!response.ok && !data.sources) {
        setTurns((prev) => [...prev, { role: "model", text: "", notice: data.error || copy.failed, error: true }]);
      } else {
        setTurns((prev) => [...prev, { role: "model", text: data.answer || "", notice: data.answer ? undefined : data.notice, sources }]);
      }
    } catch {
      setTurns((prev) => [...prev, { role: "model", text: "", notice: copy.failed, error: true }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const submit = (question: string) => {
    const text = question.trim().slice(0, 400);
    if (!text || busy) return;
    setInput("");
    if (adult === null) {
      setPending(text);
      return;
    }
    void ask(text, adult);
  };

  const answerAge = (value: boolean) => {
    saveAdult(value);
    setAdult(value);
    const question = pending;
    setPending(null);
    if (question) void ask(question, value);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit(input);
  };

  return (
    <div className="hask">
      <style>{CSS}</style>
      {!bare && (
        <div className="hask-head">
          <div>
            <h2 className="hask-title">
              <span aria-hidden>✦</span>
              {copy.title}
            </h2>
            <p className="hask-lead">{copy.lead}</p>
          </div>
        </div>
      )}
      {bare && <p className="hask-lead" style={{ marginTop: 0 }}>{copy.lead}</p>}

      {(turns.length > 0 || pending || busy) && (
        <div className="hask-log" ref={logRef} aria-live="polite">
          {turns.map((turn, i) =>
            turn.role === "user" ? (
              <div key={i} className="hask-q">{turn.text}</div>
            ) : (
              <div key={i} className="hask-a">
                {turn.text ? (
                  <Answer text={turn.text} sources={turn.sources} newTab={newTab} />
                ) : (
                  <p className={turn.error ? "hask-error" : "hask-notice"}>{turn.notice}</p>
                )}
                {turn.sources && turn.sources.length > 0 && (
                  <div className="hask-sources">
                    <span className="hask-sources-label">{copy.fromGuide}</span>
                    {turn.sources.map((source) => (
                      <a key={source.href} className="hask-source" href={source.href} {...(newTab ? { target: "_blank", rel: "noopener" } : {})}>
                        <b>{source.n}</b>
                        <span aria-hidden>{source.icon}</span>
                        <span style={{ color: "inherit" }}>
                          {source.section}
                          {source.section !== source.chapter && <span> · {source.chapter}</span>}
                        </span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ),
          )}
          {pending && (
            <>
              <div className="hask-q">{pending}</div>
              <div className="hask-age" role="group">
                {copy.ageQuestion}
                <div className="hask-age-row">
                  <button type="button" className="hask-btn" onClick={() => answerAge(true)}>{copy.ageYes}</button>
                  <button type="button" className="hask-ghost" onClick={() => answerAge(false)}>{copy.ageNo}</button>
                </div>
              </div>
            </>
          )}
          {busy && <div className="hask-a hask-notice"><span className="hask-dots">{copy.thinking.replace(/…$/, "")}</span></div>}
        </div>
      )}

      <form className="hask-form" onSubmit={onSubmit}>
        <input
          ref={inputRef}
          className="hask-input"
          type="text"
          value={input}
          maxLength={400}
          placeholder={copy.placeholder}
          aria-label={copy.title}
          enterKeyHint="send"
          autoFocus={autoFocus}
          disabled={Boolean(pending)}
          onChange={(event) => setInput(event.target.value)}
        />
        <button type="submit" className="hask-btn" disabled={busy || Boolean(pending) || !input.trim()}>
          {copy.send}
        </button>
      </form>

      {turns.length === 0 && !pending ? (
        <div className="hask-chips">
          {copy.examples.map((example) => (
            <button key={example} type="button" className="hask-chip" onClick={() => submit(example)}>
              {example}
            </button>
          ))}
        </div>
      ) : (
        <p className="hask-fine">
          {adult ? `${copy.fine} ` : ""}
          <button type="button" className="hask-link" onClick={() => setTurns([])} disabled={busy}>
            {copy.clear}
          </button>
        </p>
      )}
    </div>
  );
}

/** A button in the corner of a chapter page that opens the same box. */
export function HelpAskFloating(props: Omit<HelpAskProps, "bare" | "autoFocus">) {
  const copy = COPY[props.lang];
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="hask hask-fab">
      <style>{CSS}</style>
      {open && (
        <div className="hask-box hask-fab-panel" role="dialog" aria-label={copy.title}>
          <div className="hask-head" style={{ marginBottom: 6 }}>
            <h2 className="hask-title">
              <span aria-hidden>✦</span>
              {copy.title}
            </h2>
            <button type="button" className="hask-x" aria-label={copy.close} onClick={() => setOpen(false)}>
              ×
            </button>
          </div>
          <HelpAsk {...props} bare autoFocus />
        </div>
      )}
      {!open && (
        <button type="button" className="hask-fab-btn" onClick={() => setOpen(true)}>
          <span aria-hidden>✦</span>
          {copy.open}
        </button>
      )}
    </div>
  );
}

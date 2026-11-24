"use client";

import { useEffect, useState } from "react";
import { useI18n } from "../lib/i18n-context";
import { apiFetch } from "../lib/client";
import { opensGamesDirectly } from "../lib/game-links";
import { playSound } from "../lib/msn-sounds";
import { MOD_GAMES } from "@/lib/play-together";
import type { PlayEvent } from "@/lib/protocol";
import { stripTextStyle } from "@/lib/text-style";
import { JoinHelp, joinPlayInvite, type JoinResult } from "./play-card";

type Prompt =
  | { id: string; type: "ask"; messageId: string; game: string; from: { id: string; name: string } }
  | { id: string; type: "listen"; name: string; on: boolean }
  | { id: string; type: "accepted"; messageId: string; game: string; host: string; result?: JoinResult; error?: string }
  | { id: string; type: "declined"; game: string; host: string };

/**
 * Play together pop-ups, Discord-style:
 * - someone asks to join your game → Let in / Not now;
 * - the host lets you in → the game opens (straight away in the desktop app,
 *   with a Join button in the browser, which needs a click to open Steam).
 */
export function PlayPrompts() {
  const { t } = useI18n();
  const [prompts, setPrompts] = useState<Prompt[]>([]);

  const drop = (id: string) => setPrompts((list) => list.filter((p) => p.id !== id));
  const patch = (id: string, change: Partial<Prompt>) =>
    setPrompts((list) => list.map((p) => (p.id === id ? ({ ...p, ...change } as Prompt) : p)));

  async function join(prompt: Extract<Prompt, { type: "accepted" }>) {
    try {
      patch(prompt.id, { result: await joinPlayInvite(prompt.messageId), error: undefined });
    } catch (err) {
      patch(prompt.id, { error: err instanceof Error ? err.message : t("play.error") });
    }
  }

  useEffect(() => {
    const onPlay = (event: Event) => {
      const data = (event as CustomEvent<PlayEvent>).detail;
      if (!data) return;
      if (data.kind === "listen") {
        // Listen along: someone started or stopped following your Spotify.
        const id = crypto.randomUUID();
        setPrompts((list) => [...list, { id, type: "listen", name: data.from.name, on: data.on }]);
        window.setTimeout(() => drop(id), 6000);
        return;
      }
      if (data.kind === "ask") {
        playSound("game", "turn");
        setPrompts((list) => [
          ...list.filter((p) => !(p.type === "ask" && p.messageId === data.messageId && p.from.id === data.from.id)),
          { id: crypto.randomUUID(), type: "ask", messageId: data.messageId, game: data.game, from: data.from },
        ]);
      } else if (data.accepted) {
        playSound("game", "turn");
        const prompt = { id: crypto.randomUUID(), type: "accepted" as const, messageId: data.messageId, game: data.game, host: data.host };
        setPrompts((list) => [...list.filter((p) => !(p.type === "accepted" && p.messageId === data.messageId)), prompt]);
        // Like Discord: once you're let in, the desktop app opens the game.
        if (opensGamesDirectly()) void join(prompt);
      } else {
        const id = crypto.randomUUID();
        setPrompts((list) => [...list, { id, type: "declined", game: data.game, host: data.host }]);
        window.setTimeout(() => drop(id), 6000);
      }
    };
    window.addEventListener("hoffle:play", onPlay);
    return () => window.removeEventListener("hoffle:play", onPlay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The host's game mod reports how to get in (invite code, Steam lobby). Pass
  // it to the server when it changes, every 30 s while hosting, and once more
  // (as null) when hosting stops. The server keeps it on this host's invites only.
  useEffect(() => {
    const sent = new Map<string, { key: string; at: number; stored: boolean }>();
    const onState = (event: Event) => {
      const play = (event as CustomEvent<Record<string, { party?: unknown } | undefined>>).detail || {};
      for (const game of MOD_GAMES) {
        const party = play[game]?.party ?? null;
        const key = party ? JSON.stringify(party) : "";
        const last = sent.get(game);
        if (!party && !last?.key) continue;
        // Unchanged and stored recently: nothing to do. "Not stored" means the
        // host had no invite yet, so keep offering it until one exists.
        if (last && last.key === key && last.stored && Date.now() - last.at < 30_000) continue;
        sent.set(game, { key, at: Date.now(), stored: true });
        apiFetch("/api/play", { method: "POST", body: JSON.stringify({ action: "party", game, party }) })
          .then((value) => {
            if (party && !(value as { invites?: number }).invites) sent.set(game, { key, at: Date.now(), stored: false });
          })
          .catch(() => sent.set(game, { key, at: 0, stored: false }));
      }
    };
    window.addEventListener("hoffle:play-state", onState);
    return () => window.removeEventListener("hoffle:play-state", onState);
  }, []);

  async function answer(prompt: Extract<Prompt, { type: "ask" }>, accept: boolean) {
    drop(prompt.id);
    await apiFetch("/api/play", {
      method: "POST",
      body: JSON.stringify({ action: "answer", messageId: prompt.messageId, userId: prompt.from.id, accept }),
    }).catch(() => undefined);
  }

  if (!prompts.length) return null;
  return (
    <div className="play-prompts" aria-live="polite">
      {prompts.map((prompt) => (
        <div key={prompt.id} className={`play-prompt play-prompt-${prompt.type}`} role="dialog">
          <button type="button" className="play-prompt-close" aria-label={t("play.action.dismiss")} onClick={() => drop(prompt.id)}>
            ×
          </button>
          {prompt.type === "ask" && (
            <>
              <p>{t("play.prompt.ask", { name: stripTextStyle(prompt.from.name), game: prompt.game })}</p>
              <div className="play-actions">
                <button type="button" className="primary" onClick={() => void answer(prompt, true)}>
                  {t("play.action.letIn")}
                </button>
                <button type="button" onClick={() => void answer(prompt, false)}>
                  {t("play.action.notNow")}
                </button>
              </div>
            </>
          )}
          {prompt.type === "accepted" && (
            <>
              <p>{t("play.prompt.accepted", { host: stripTextStyle(prompt.host), game: prompt.game })}</p>
              {prompt.result ? (
                <JoinHelp result={prompt.result} onRetry={() => void join(prompt)} />
              ) : (
                <div className="play-actions">
                  <button type="button" className="primary" onClick={() => void join(prompt)}>
                    {t("play.action.join")}
                  </button>
                </div>
              )}
              {prompt.error && <p className="play-error">{prompt.error}</p>}
            </>
          )}
          {prompt.type === "listen" && (
            <p>{t(prompt.on ? "listen.prompt.on" : "listen.prompt.off", { name: stripTextStyle(prompt.name) })}</p>
          )}
          {prompt.type === "declined" && <p>{t("play.prompt.declined", { host: stripTextStyle(prompt.host), game: prompt.game })}</p>}
        </div>
      ))}
    </div>
  );
}

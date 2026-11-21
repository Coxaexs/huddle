"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "../lib/i18n-context";
import { apiFetch } from "../lib/client";
import { opensGamesDirectly } from "../lib/game-links";
import { useModuleOn } from "../lib/modules";
import { playSound } from "../lib/msn-sounds";
import { PLAY_GAMES, playGameForActivity, type PlayGameId } from "@/lib/play-together";
import type { PlayEvent } from "@/lib/protocol";
import type { ProfileActivity } from "@/lib/users";
import { stripTextStyle } from "@/lib/text-style";
import { JoinHelp, joinPlayInvite, type JoinResult } from "./play-card";

type Prompt =
  | { id: string; type: "ask"; messageId: string; game: string; from: { id: string; name: string } }
  | { id: string; type: "accepted"; messageId: string; game: string; host: string; result?: JoinResult; error?: string }
  | { id: string; type: "declined"; game: string; host: string }
  | { id: string; type: "invite"; game: PlayGameId };

const NO_ASK_KEY = "hoffle-play-no-ask";

function noAskGames(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(NO_ASK_KEY) || "[]") as string[];
  } catch {
    return [];
  }
}

function stopAsking(game: string): void {
  try {
    window.localStorage.setItem(NO_ASK_KEY, JSON.stringify([...new Set([...noAskGames(), game])]));
  } catch {
    // This session only.
  }
}

/**
 * Play together pop-ups, Discord-style:
 * - you start a game Hoffle can invite to → "Invite people here?";
 * - someone asks to join your game → Let in / Not now;
 * - the host lets you in → the game opens (straight away in the desktop app,
 *   with a Join button in the browser, which needs a click to open Steam).
 */
export function PlayPrompts({
  channelId,
  channelLabel,
}: {
  /** The conversation an invite from the "you're playing" prompt goes to. */
  channelId: string | null;
  channelLabel: string;
}) {
  const { t } = useI18n();
  const gamesOn = useModuleOn("games");
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const offered = useRef(new Set<string>());
  const channelRef = useRef(channelId);
  channelRef.current = channelId;

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

  // The desktop app spotted a game we can invite to: offer once per game per session.
  useEffect(() => {
    if (!gamesOn) return;
    const onActivity = (event: Event) => {
      const activity = (event as CustomEvent<ProfileActivity | null>).detail;
      const game = playGameForActivity(activity?.name);
      if (!game || offered.current.has(game) || noAskGames().includes(game) || !channelRef.current) return;
      offered.current.add(game);
      setPrompts((list) => [...list, { id: crypto.randomUUID(), type: "invite", game }]);
    };
    window.addEventListener("hoffle:activity-detected", onActivity);
    return () => window.removeEventListener("hoffle:activity-detected", onActivity);
  }, [gamesOn]);

  async function answer(prompt: Extract<Prompt, { type: "ask" }>, accept: boolean) {
    drop(prompt.id);
    await apiFetch("/api/play", {
      method: "POST",
      body: JSON.stringify({ action: "answer", messageId: prompt.messageId, userId: prompt.from.id, accept }),
    }).catch(() => undefined);
  }

  async function invite(prompt: Extract<Prompt, { type: "invite" }>) {
    drop(prompt.id);
    if (!channelRef.current) return;
    await apiFetch("/api/play", {
      method: "POST",
      body: JSON.stringify({ action: "start", channelId: channelRef.current, game: prompt.game }),
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
          {prompt.type === "declined" && <p>{t("play.prompt.declined", { host: stripTextStyle(prompt.host), game: prompt.game })}</p>}
          {prompt.type === "invite" && (
            <>
              <p>{t("play.prompt.invite", { game: PLAY_GAMES[prompt.game].name, where: channelLabel || t("play.prompt.here") })}</p>
              <div className="play-actions">
                <button type="button" className="primary" onClick={() => void invite(prompt)}>
                  {t("play.action.invite")}
                </button>
                <button type="button" onClick={() => drop(prompt.id)}>
                  {t("play.action.notNow")}
                </button>
                <button
                  type="button"
                  className="play-link"
                  onClick={() => {
                    stopAsking(prompt.game);
                    drop(prompt.id);
                  }}
                >
                  {t("play.action.dontAsk")}
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useI18n } from "../lib/i18n-context";
import { apiFetch } from "../lib/client";
import { STARDEW_MOD_URL, openGameLink, opensGamesDirectly, queueGameJoin } from "../lib/game-links";
import {
  PLAY_GAMES,
  requestOf,
  type JoinPlan,
  type ManualReason,
  type PlayGameId,
  type PlayInvite,
} from "@/lib/play-together";
import { stripTextStyle } from "@/lib/text-style";

type HostCheck = { oneClick: true } | { oneClick: false; reason: ManualReason };

export interface JoinResult {
  plan: JoinPlan;
  game: PlayGameId;
  host: string;
  /** mod: this computer's Hoffle mod is joining by itself; link: Steam or by hand. */
  via?: "mod" | "link";
}

function copyText(text: string): void {
  void navigator.clipboard?.writeText(text).catch(() => undefined);
}

/**
 * Asks for the join details (only works once let in) and opens the game. With
 * the Hoffle mod here, the mod joins with the host's invite code; otherwise
 * Steam's lobby link does it, and the invite code is put on the clipboard.
 */
export async function joinPlayInvite(messageId: string): Promise<JoinResult> {
  const result = (await apiFetch("/api/play", {
    method: "POST",
    body: JSON.stringify({ action: "join", messageId }),
  })) as JoinResult;
  const { plan } = result;
  if (plan.inviteCode && (await queueGameJoin(result.game, plan.inviteCode))) {
    openGameLink(plan.runUrl);
    return { ...result, via: "mod" };
  }
  openGameLink(plan.url);
  if (plan.inviteCode) copyText(plan.inviteCode);
  return { ...result, via: "link" };
}

/** The host's invite code with a Copy button, for joining by hand. */
function InviteCode({ code }: { code: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <div className="play-code">
      <code>{code}</code>
      <button
        type="button"
        onClick={() => {
          copyText(code);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? t("play.action.copied") : t("play.action.copy")}
      </button>
    </div>
  );
}

/** Opens "Sign in through Steam" for linking (Settings → Activities has the same). */
export async function startSteamLink(): Promise<void> {
  const { url } = (await apiFetch("/api/integrations/steam", { method: "POST" })) as { url: string };
  window.open(url, "_blank", "noopener");
}

/**
 * What happens after Join: either "joining the farm" or, when Hoffle can't
 * see the host's lobby, how to get in by hand. Shared by the card and the
 * "you're in" prompt.
 */
export function JoinHelp({ result, onRetry }: { result: JoinResult; onRetry?: () => void }) {
  const { t } = useI18n();
  const { plan } = result;
  const host = stripTextStyle(result.host);
  const game = PLAY_GAMES[result.game].name;
  const viaMod = result.via === "mod";
  return (
    <div className="play-help" role="status">
      {viaMod ? (
        <>
          <p>{t("play.help.mod", { host, game })}</p>
          <p className="play-help-why">{t("play.help.modInGame")}</p>
        </>
      ) : plan.how === "lobby" ? (
        <>
          <p>{t("play.help.joining", { host, game })}</p>
          <p className="play-help-why">{t("play.help.friends", { host })}</p>
          {plan.inviteCode && (
            <>
              <p className="play-help-why">{t("play.help.codeLobby", { host })}</p>
              <InviteCode code={plan.inviteCode} />
            </>
          )}
        </>
      ) : plan.how === "code" && plan.inviteCode ? (
        <>
          <p>{t("play.help.opening", { game })}</p>
          <p>{t("play.help.code")}</p>
          <InviteCode code={plan.inviteCode} />
        </>
      ) : (
        <>
          <p>{t("play.help.opening", { game })}</p>
          <p>{t(`play.help.steps.${result.game}` as "play.help.steps.stardew", { host })}</p>
          <p className="play-help-why">{t(`play.reason.${plan.reason ?? "no-lobby"}` as "play.reason.no-lobby", { host })}</p>
          <p className="play-help-why">{t("play.help.friends", { host })}</p>
        </>
      )}
      {!viaMod && plan.how !== "manual" && result.game === "stardew" && (
        <p className="play-help-why">
          <a href={STARDEW_MOD_URL} target="_blank" rel="noreferrer">
            {t("play.help.getMod")}
          </a>
        </p>
      )}
      <div className="play-actions">
        <button type="button" onClick={() => openGameLink(viaMod ? plan.runUrl : plan.url)}>
          {plan.how === "lobby" && !viaMod ? t("play.action.joinAgain") : t("play.action.openGame", { game })}
        </button>
        {plan.addFriendUrl && (
          <button type="button" onClick={() => openGameLink(plan.addFriendUrl as string)}>
            {t("play.action.addFriend", { host })}
          </button>
        )}
        {onRetry && plan.how === "manual" && (
          <button type="button" onClick={onRetry}>
            {t("play.action.checkAgain")}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * A Play together invite (lib/play-together.ts) as a chat card. Everyone
 * sees who is playing what; others ask to join, the host lets them in, and
 * Join opens the game straight into the host's session where Steam allows.
 * Changes come back to everyone as an edit of this message.
 */
export function PlayCard({
  messageId,
  play,
  userId,
}: {
  messageId: string;
  play: PlayInvite;
  userId: string;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<JoinResult | null>(null);
  const [check, setCheck] = useState<HostCheck | null>(null);
  const info = PLAY_GAMES[play.game];
  const isHost = play.host.id === userId;
  const host = stripTextStyle(play.host.name);
  const mine = requestOf(play, userId);
  const open = play.status === "open";
  const pending = play.requests.filter((r) => r.status === "asked");
  const inside = play.requests.filter((r) => r.status === "accepted");

  // The host sees whether friends can come in with one click, or what's missing.
  useEffect(() => {
    if (!isHost || !open) return;
    let cancelled = false;
    const run = () =>
      apiFetch("/api/play", { method: "POST", body: JSON.stringify({ action: "check", game: play.game }) })
        .then((value) => !cancelled && setCheck(value as HostCheck))
        .catch(() => undefined);
    void run();
    const onFocus = () => void run();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [isHost, open, play.game]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/play", { method: "POST", body: JSON.stringify({ action, messageId, ...extra }) });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("play.error"));
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setJoined(await joinPlayInvite(messageId));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("play.error"));
    } finally {
      setBusy(false);
    }
  }

  let status: string;
  if (!open) status = t("play.status.closed", { host });
  else if (isHost) status = pending.length ? t("play.status.hostWaiting", { count: pending.length }) : t("play.status.hostOpen");
  else if (mine?.status === "accepted") status = t("play.status.letIn", { host });
  else if (mine?.status === "asked") status = t("play.status.asked", { host });
  else if (mine?.status === "declined") status = t("play.status.declined", { host });
  else status = play.askFirst ? t("play.status.invited", { host, game: info.name }) : t("play.status.anyone", { host, game: info.name });

  return (
    <div className={`play-card play-${play.game} ${open ? "" : "closed"}`}>
      <header className="play-card-head">
        <span className="play-card-icon" aria-hidden="true">
          {info.emoji}
        </span>
        <span>
          <strong>{info.name}</strong>
          <small>{t("play.subtitle", { host })}</small>
        </span>
      </header>
      <p className="play-status">{status}</p>

      {inside.length > 0 && (
        <p className="play-inside">{t("play.inside", { names: inside.map((r) => stripTextStyle(r.name)).join(", ") })}</p>
      )}

      {isHost && open && pending.length > 0 && (
        <ul className="play-requests">
          {pending.map((r) => (
            <li key={r.id}>
              <span>{stripTextStyle(r.name)}</span>
              <button type="button" className="primary" disabled={busy} onClick={() => void act("answer", { userId: r.id, accept: true })}>
                {t("play.action.letIn")}
              </button>
              <button type="button" disabled={busy} onClick={() => void act("answer", { userId: r.id, accept: false })}>
                {t("play.action.notNow")}
              </button>
            </li>
          ))}
        </ul>
      )}

      {isHost && open && check && (
        <div className={`play-check ${check.oneClick ? "ok" : ""}`}>
          {check.oneClick ? (
            <p>{t("play.check.oneClick")}</p>
          ) : (
            <>
              <p>{t(`play.check.${check.reason}` as "play.check.no-lobby", { game: info.name })}</p>
              {check.reason === "host-not-linked" && (
                <div className="play-actions">
                  {play.game === "stardew" && (
                    <a className="play-button" href={STARDEW_MOD_URL} target="_blank" rel="noreferrer">
                      {t("play.action.getMod")}
                    </a>
                  )}
                  <button type="button" onClick={() => void startSteamLink().catch((err) => setError(err instanceof Error ? err.message : t("play.error")))}>
                    {t("play.action.linkSteam")}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="play-actions">
        {open && !isHost && !mine && (
          <button type="button" className="primary" disabled={busy} onClick={() => void act("ask").then(() => (!play.askFirst ? join() : undefined))}>
            {play.askFirst ? t("play.action.ask") : t("play.action.join")}
          </button>
        )}
        {open && !isHost && mine?.status === "declined" && (
          <button type="button" disabled={busy} onClick={() => void act("ask")}>
            {t("play.action.askAgain")}
          </button>
        )}
        {open && !isHost && mine?.status === "accepted" && !joined && (
          <button type="button" className="primary" disabled={busy} onClick={() => void join()}>
            {t("play.action.join")}
          </button>
        )}
        {open && isHost && (
          <button type="button" disabled={busy} onClick={() => void act("close")}>
            {t("play.action.close")}
          </button>
        )}
      </div>

      {joined && <JoinHelp result={joined} onRetry={() => void join()} />}
      {error && <p className="play-error">{error}</p>}
      {!isHost && open && !opensGamesDirectly() && !joined && mine?.status === "accepted" && (
        <p className="play-help-why">{t("play.help.browser")}</p>
      )}
    </div>
  );
}

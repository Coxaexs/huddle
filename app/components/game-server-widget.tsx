"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Gamepad2, Terminal } from "lucide-react";
import { apiFetch } from "../lib/client";
import type { GameServerStatus } from "@/lib/game-server";

interface GameServerInfo {
  configured: boolean;
  manager: boolean;
  status?: GameServerStatus;
  settings?: { hasRcon: boolean };
}

/** How often an open sidebar asks; the server answers from a ~20 s cache. */
const POLL_MS = 45_000;

/**
 * The server's Minecraft server, in the channel sidebar: "3/10 playing", who,
 * and for managers an RCON line. Renders nothing until one is set up in
 * Server Settings → Integrations.
 */
export function GameServerWidget({ serverId }: { serverId: string }) {
  const [info, setInfo] = useState<GameServerInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [command, setCommand] = useState("");
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiFetch<GameServerInfo>(`/api/game-servers?serverId=${encodeURIComponent(serverId)}`)
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [serverId]);

  useEffect(() => {
    setInfo(null);
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  async function run(event: React.FormEvent) {
    event.preventDefault();
    if (!command.trim()) return;
    setBusy(true);
    try {
      const data = await apiFetch<{ output: string }>("/api/game-servers/rcon", {
        method: "POST",
        body: JSON.stringify({ serverId, command }),
      });
      setOutput(data.output || "Done.");
      setCommand("");
      window.setTimeout(load, 1500);
    } catch (error) {
      setOutput(error instanceof Error ? error.message : "RCON failed.");
    } finally {
      setBusy(false);
    }
  }

  const status = info?.status;
  if (!info?.configured || !status) return null;
  return (
    <div className={`game-server-widget ${status.online ? "online" : "offline"}`}>
      <button type="button" className="game-server-summary" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="game-server-dot" aria-hidden="true" />
        <Gamepad2 size={14} aria-hidden="true" />
        <span className="game-server-name">Minecraft</span>
        <span className="game-server-count">
          {status.online ? `${status.playersOnline}/${status.maxPlayers} playing` : "offline"}
        </span>
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>
      {open && (
        <div className="game-server-details">
          <p className="game-server-address">
            {status.host}
            {status.port === 25565 ? "" : `:${status.port}`}
            {status.version ? ` · ${status.version}` : ""}
          </p>
          {status.motd && <p className="game-server-motd">{status.motd}</p>}
          {status.players.length > 0 && (
            <ul className="game-server-players">
              {status.players.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          )}
          {info.manager && info.settings?.hasRcon && (
            <form className="game-server-rcon" onSubmit={(event) => void run(event)}>
              <Terminal size={12} aria-hidden="true" />
              <input
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                placeholder="RCON: say hi, whitelist add …"
                aria-label="RCON command"
                disabled={busy}
              />
            </form>
          )}
          {output && <pre className="game-server-output">{output}</pre>}
        </div>
      )}
    </div>
  );
}

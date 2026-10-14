"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/client";

interface Settings {
  host: string;
  port: number;
  rconPort: number | null;
  hasRcon: boolean;
}

/**
 * Server Settings → Integrations: the Minecraft server whose players show in
 * the sidebar, and its RCON for managers.
 */
export function GameServerSettingsPanel({ serverId, onNotice }: { serverId: string; onNotice: (text: string) => void }) {
  const [loaded, setLoaded] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [rconPort, setRconPort] = useState("");
  const [rconPassword, setRconPassword] = useState("");
  const [hasRcon, setHasRcon] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ configured: boolean; settings?: Settings }>(`/api/game-servers?serverId=${encodeURIComponent(serverId)}`)
      .then((data) => {
        if (cancelled) return;
        setConfigured(data.configured);
        if (data.settings) {
          setHost(data.settings.host);
          setPort(String(data.settings.port));
          setRconPort(data.settings.rconPort ? String(data.settings.rconPort) : "");
          setHasRcon(data.settings.hasRcon);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [serverId]);

  async function save(remove = false) {
    setSaving(true);
    try {
      const data = await apiFetch<{ configured: boolean; settings?: Settings }>("/api/game-servers", {
        method: "POST",
        body: JSON.stringify(
          remove
            ? { serverId, remove: true }
            : {
                serverId,
                host,
                port: port || undefined,
                rconPort: rconPort || null,
                // Left empty, the saved password stays.
                ...(rconPassword ? { rconPassword } : {}),
              },
        ),
      });
      setConfigured(data.configured);
      setHasRcon(Boolean(data.settings?.hasRcon));
      setRconPassword("");
      if (remove) {
        setHost("");
        setPort("");
        setRconPort("");
      }
      onNotice(remove ? "Game server removed." : "Game server saved. It shows in the channel list.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Could not save the game server.");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return null;
  return (
    <section className="dnd-settings">
      <h2>Minecraft server</h2>
      <div className="dnd-settings-row stacked">
        <div>
          <p>Who is playing shows above the voice controls in the channel list. RCON lets people with Manage Server run commands from there.</p>
        </div>
        <label>
          <span>Address</span>
          <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="mc.example.com" maxLength={253} />
        </label>
        <label>
          <span>Port</span>
          <input value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))} placeholder="25565" inputMode="numeric" />
        </label>
        <label>
          <span>RCON port</span>
          <input value={rconPort} onChange={(e) => setRconPort(e.target.value.replace(/\D/g, ""))} placeholder="25575" inputMode="numeric" />
        </label>
        <label>
          <span>RCON password {hasRcon ? "(saved; type a new one to change it)" : ""}</span>
          <input type="password" value={rconPassword} onChange={(e) => setRconPassword(e.target.value)} autoComplete="new-password" />
        </label>
        <div className="dnd-settings-toggle">
          <button type="button" className="discord-btn primary-indigo" disabled={saving || !host.trim()} onClick={() => void save()}>
            Save
          </button>
          {configured && (
            <button type="button" className="discord-btn secondary" disabled={saving} onClick={() => void save(true)}>
              Remove
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

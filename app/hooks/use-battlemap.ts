"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Battlemap,
  BattlemapSceneSummary,
  HpVisibility,
  MapArea,
  MapFog,
  MapPing,
  MapStroke,
  MapToken,
} from "@/lib/battlemap";
import { apiFetch } from "../lib/client";

interface DialogOptions {
  title: string;
  message?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}

interface BattlemapSocketPayload {
  action: string;
  map?: unknown;
  token?: unknown;
  tokens?: unknown;
  tokenId?: string;
  stroke?: unknown;
  strokes?: unknown;
  fog?: unknown;
  areas?: unknown;
  ping?: unknown;
  scenes?: unknown;
  hpVisibility?: HpVisibility;
  encounter?: "combat" | "exploration";
}

interface UseBattlemapOptions {
  /** The voice channel whose stage is open (null when none). */
  stageChannelId: string | null;
  /** The current user, for dropping your own token with your avatar. */
  user: { id: string; displayName: string; color: string; avatarUrl?: string | null } | null;
  onNotice: (message: string) => void;
  showPrompt: (options: {
    title: string;
    message?: string;
    defaultValue?: string;
    confirmText?: string;
    onConfirm: (value?: string) => void;
  }) => void;
  showConfirm: (options: DialogOptions & { onConfirm: () => void; onCancel?: () => void }) => void;
  pickImage: () => Promise<File | null>;
}

/**
 * Owns the shared battlemap for the open voice stage: fetching the current map,
 * creating/opening one, dropping your own token, and applying every socket
 * update. Keeps ~60 lines of tightly-coupled state out of the chat shell.
 */
export function useBattlemap({
  stageChannelId,
  user,
  onNotice,
  showPrompt,
  showConfirm,
  pickImage,
}: UseBattlemapOptions) {
  const [battlemap, setBattlemap] = useState<Battlemap | null>(null);
  const [gm, setGm] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [scenes, setScenes] = useState<BattlemapSceneSummary[]>([]);
  const [lastPing, setLastPing] = useState<MapPing | null>(null);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);

  // The stage channel the socket handler should care about, readable without
  // re-subscribing. Kept in sync below so the handler never sees a stale value.
  const stageRef = useRef(stageChannelId);
  stageRef.current = stageChannelId;

  // Opening a voice stage pulls in whatever map is on the table there.
  useEffect(() => {
    if (!stageChannelId) {
      setBattlemap(null);
      setGm(false);
      setScenes([]);
      setLastPing(null);
      setSelectedTokenId(null);
      return;
    }
    let cancelled = false;
    apiFetch<{ map: Battlemap | null; gm: boolean; scenes?: BattlemapSceneSummary[] }>(
      `/api/battlemap?channelId=${encodeURIComponent(stageChannelId)}`,
    )
      .then((data) => {
        if (cancelled) return;
        setBattlemap(data.map);
        setGm(Boolean(data.gm));
        setScenes(Array.isArray(data.scenes) ? data.scenes : []);
        setHidden(false);
        setLastPing(null);
        setSelectedTokenId(null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [stageChannelId]);

  /** Applies an incoming battlemap socket event for the right stage. */
  const onSocket = useCallback((id: string, payload: BattlemapSocketPayload) => {
    if (id !== stageRef.current) return;
    if (payload.action === "open") {
      setBattlemap((payload.map as Battlemap) || null);
      if (Array.isArray(payload.scenes)) {
        setScenes(payload.scenes as BattlemapSceneSummary[]);
      }
      setHidden(false);
      return;
    }
    if (payload.action === "close") {
      setBattlemap(null);
      setLastPing(null);
      return;
    }
    if (payload.action === "scenes" && Array.isArray(payload.scenes)) {
      setScenes(payload.scenes as BattlemapSceneSummary[]);
      return;
    }
    if (payload.action === "ping" && payload.ping) {
      setLastPing(payload.ping as MapPing);
      return;
    }
    setBattlemap((current) => {
      if (!current) return current;
      if (payload.action === "token") {
        const moved = payload.token as MapToken;
        const exists = current.tokens.some((t) => t.id === moved.id);
        return {
          ...current,
          tokens: exists
            ? current.tokens.map((t) => (t.id === moved.id ? moved : t))
            : [...current.tokens, moved],
        };
      }
      if (payload.action === "token-removed" && payload.tokenId) {
        return {
          ...current,
          tokens: current.tokens.filter((t) => t.id !== payload.tokenId),
        };
      }
      if (payload.action === "tokens") {
        return { ...current, tokens: (payload.tokens as MapToken[]) || [] };
      }
      if (payload.action === "hp-visibility" && payload.hpVisibility) {
        return { ...current, hpVisibility: payload.hpVisibility };
      }
      if (payload.action === "areas") {
        return { ...current, areas: (payload.areas as MapArea[]) || [] };
      }
      if (payload.action === "stroke") {
        const stroke = payload.stroke as MapStroke;
        return current.strokes.some((s) => s.id === stroke.id)
          ? current
          : { ...current, strokes: [...current.strokes, stroke] };
      }
      if (payload.action === "encounter") {
        return { ...current, encounter: payload.encounter === "combat" ? "combat" : "exploration" };
      }
      if (payload.action === "fog") {
        return { ...current, fog: (payload.fog as MapFog[]) || [] };
      }
      if (payload.action === "cleared") {
        return {
          ...current,
          tokens: (payload.tokens as MapToken[]) || [],
          strokes: (payload.strokes as MapStroke[]) || [],
        };
      }
      return current;
    });
  }, []);

async function getImageDimensions(
  file: File,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

  /** GM: create a map on the server, uploading a background first if given. */
  const createBattlemap = useCallback(
    async (name: string, picked: File | null, activate = true) => {
      if (!stageChannelId) return;
      try {
        let imageKey: string | null = null;
        let rows: number | null = null;
        if (picked) {
          const dims = await getImageDimensions(picked);
          if (dims && dims.width > 0 && dims.height > 0) {
            const aspect = dims.width / dims.height;
            rows = Math.max(1, Math.round(20 / aspect));
          }
          const form = new FormData();
          form.append("file", picked);
          // Let a failed upload surface instead of silently opening a blank map.
          const upload = await apiFetch<{ key: string }>("/api/uploads", {
            method: "POST",
            body: form,
          });
          imageKey = upload.key;
        }
        const res = await apiFetch<{ map?: Battlemap; scenes?: BattlemapSceneSummary[] }>(
          "/api/battlemap",
          {
            method: "POST",
            body: JSON.stringify({
              channelId: stageChannelId,
              action: "open",
              activate,
              name: name.trim() || "Battlemap",
              imageKey,
              rows,
            }),
          },
        );
        if (Array.isArray(res.scenes)) setScenes(res.scenes);
        if (activate && res.map) {
          setBattlemap(res.map);
          setHidden(false);
        }
      } catch (error) {
        onNotice(
          error instanceof Error ? error.message : "Could not open the battlemap.",
        );
      }
    },
    [stageChannelId, onNotice],
  );

  /** GM: walk through naming and background choice, then open (or prep) the map. */
  const promptNewScene = useCallback(
    (activate: boolean) => {
      if (!stageChannelId) return;
      showPrompt({
        title: activate ? "New Battlemap" : "Prep Scene",
        message: "Enter a name for the battlemap scene:",
        defaultValue: activate ? "Battlemap" : "Scene",
        confirmText: "Next",
        onConfirm: (name) => {
          const mapName = name?.trim() || "Battlemap";
          showConfirm({
            title: "Map Background",
            message:
              "Upload a background image, or start on a blank grid. You can add tokens either way.",
            confirmText: "Upload Image",
            cancelText: "Blank Grid",
            onConfirm: async () => {
              const picked = await pickImage();
              await createBattlemap(mapName, picked, activate);
            },
            onCancel: () => {
              void createBattlemap(mapName, null, activate);
            },
          });
        },
      });
    },
    [stageChannelId, showPrompt, showConfirm, pickImage, createBattlemap],
  );

  const open = useCallback(() => promptNewScene(true), [promptNewScene]);
  const prepScene = useCallback(() => promptNewScene(false), [promptNewScene]);

  const switchScene = useCallback(
    async (mapId: string) => {
      if (!stageChannelId) return;
      try {
        const res = await apiFetch<{ map?: Battlemap; scenes?: BattlemapSceneSummary[] }>(
          "/api/battlemap",
          {
            method: "POST",
            body: JSON.stringify({ channelId: stageChannelId, action: "switch-scene", mapId }),
          },
        );
        if (Array.isArray(res.scenes)) setScenes(res.scenes);
        if (res.map) {
          setBattlemap(res.map);
          setHidden(false);
        }
      } catch (error) {
        onNotice(error instanceof Error ? error.message : "Could not switch scene.");
      }
    },
    [stageChannelId, onNotice],
  );

  const deleteScene = useCallback(
    async (mapId: string) => {
      if (!stageChannelId) return;
      try {
        const res = await apiFetch<{ scenes?: BattlemapSceneSummary[] }>("/api/battlemap", {
          method: "POST",
          body: JSON.stringify({ channelId: stageChannelId, action: "delete-scene", mapId }),
        });
        if (Array.isArray(res.scenes)) setScenes(res.scenes);
        setBattlemap((cur) => (cur?.id === mapId ? null : cur));
      } catch (error) {
        onNotice(error instanceof Error ? error.message : "Could not delete scene.");
      }
    },
    [stageChannelId, onNotice],
  );

  const setHpVisibility = useCallback(
    async (hpVisibility: HpVisibility) => {
      if (!stageChannelId) return;
      try {
        await apiFetch("/api/battlemap", {
          method: "POST",
          body: JSON.stringify({
            channelId: stageChannelId,
            action: "set-hp-visibility",
            hpVisibility,
          }),
        });
      } catch (error) {
        onNotice(error instanceof Error ? error.message : "Could not update HP visibility.");
      }
    },
    [stageChannelId, onNotice],
  );

  const applyDamage = useCallback(
    async (tokenId: string, delta: number) => {
      if (!stageChannelId) return null;
      try {
        const res = await apiFetch<{
          token: MapToken;
          concentrationCheck: { tokenId: string; label: string; damage: number; dc: number } | null;
        }>("/api/battlemap", {
          method: "POST",
          body: JSON.stringify({
            channelId: stageChannelId,
            action: "apply-damage",
            tokenId,
            delta,
          }),
        });
        if (res.token) {
          setBattlemap((cur) =>
            cur
              ? { ...cur, tokens: cur.tokens.map((t) => (t.id === res.token.id ? res.token : t)) }
              : cur,
          );
        }
        return res;
      } catch (error) {
        onNotice(error instanceof Error ? error.message : "Could not apply damage.");
        return null;
      }
    },
    [stageChannelId, onNotice],
  );

  /** Drops a token for yourself, pre-filled with tabletop character stats if provided. */
  const addMyToken = useCallback(
    async (hero?: { name?: string; hp?: number; maxHp?: number; portraitUrl?: string | null }) => {
      if (!stageChannelId || !user) return;
      await apiFetch("/api/battlemap", {
        method: "POST",
        body: JSON.stringify({
          channelId: stageChannelId,
          action: "add-token",
          token: {
            label: hero?.name || user.displayName,
            color: user.color,
            avatarUrl: hero?.portraitUrl || user.avatarUrl || null,
            ownerId: user.id,
            hp: hero?.hp ?? null,
            maxHp: hero?.maxHp ?? null,
            x: 2,
            y: 2,
          },
        }),
      }).catch((error: Error) => onNotice(error.message));
    },
    [stageChannelId, user, onNotice],
  );

  /** Local optimistic updates; the socket echo reconciles. */
  const localToken = useCallback((token: MapToken) => {
    setBattlemap((current) =>
      current
        ? {
            ...current,
            tokens: current.tokens.map((t) => (t.id === token.id ? token : t)),
          }
        : current,
    );
  }, []);

  const localStroke = useCallback((stroke: MapStroke) => {
    setBattlemap((current) =>
      current ? { ...current, strokes: [...current.strokes, stroke] } : current,
    );
  }, []);

  const toggle = useCallback(() => {
    setHidden((current) => !current);
  }, []);

  const close = useCallback(() => {
    setHidden(true);
  }, []);

  return {
    battlemap,
    gm,
    hidden,
    scenes,
    lastPing,
    selectedTokenId,
    setSelectedTokenId,
    onSocket,
    open,
    prepScene,
    switchScene,
    deleteScene,
    setHpVisibility,
    applyDamage,
    addMyToken,
    localToken,
    localStroke,
    toggle,
    close,
  };
}
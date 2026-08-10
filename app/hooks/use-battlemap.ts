"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Battlemap, MapFog, MapStroke, MapToken } from "@/lib/battlemap";
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
  stroke?: unknown;
  strokes?: unknown;
  fog?: unknown;
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

  // The stage channel the socket handler should care about, readable without
  // re-subscribing. Kept in sync below so the handler never sees a stale value.
  const stageRef = useRef(stageChannelId);
  stageRef.current = stageChannelId;

  // Opening a voice stage pulls in whatever map is on the table there.
  useEffect(() => {
    if (!stageChannelId) {
      setBattlemap(null);
      setGm(false);
      return;
    }
    let cancelled = false;
    apiFetch<{ map: Battlemap | null; gm: boolean }>(
      `/api/battlemap?channelId=${encodeURIComponent(stageChannelId)}`,
    )
      .then((data) => {
        if (cancelled) return;
        setBattlemap(data.map);
        setGm(Boolean(data.gm));
        setHidden(false);
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
      setHidden(false);
      return;
    }
    if (payload.action === "close") {
      setBattlemap(null);
      return;
    }
    setBattlemap((current) => {
      if (!current) return current;
      if (payload.action === "token") {
        const moved = payload.token as MapToken;
        return {
          ...current,
          tokens: current.tokens.map((t) => (t.id === moved.id ? moved : t)),
        };
      }
      if (payload.action === "tokens") {
        return { ...current, tokens: (payload.tokens as MapToken[]) || [] };
      }
      if (payload.action === "stroke") {
        const stroke = payload.stroke as MapStroke;
        return current.strokes.some((s) => s.id === stroke.id)
          ? current
          : { ...current, strokes: [...current.strokes, stroke] };
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

  /** GM: create a map on the server, uploading a background first if given. */
  const createBattlemap = useCallback(
    async (name: string, picked: File | null) => {
      if (!stageChannelId) return;
      try {
        let imageKey: string | null = null;
        if (picked) {
          const form = new FormData();
          form.append("file", picked);
          // Let a failed upload surface instead of silently opening a blank map.
          const upload = await apiFetch<{ key: string }>("/api/uploads", {
            method: "POST",
            body: form,
          });
          imageKey = upload.key;
        }
        await apiFetch("/api/battlemap", {
          method: "POST",
          body: JSON.stringify({
            channelId: stageChannelId,
            action: "open",
            name: name.trim() || "Battlemap",
            imageKey,
          }),
        });
      } catch (error) {
        onNotice(
          error instanceof Error ? error.message : "Could not open the battlemap.",
        );
      }
    },
    [stageChannelId, onNotice],
  );

  /** GM: walk through naming and background choice, then open the map. */
  const open = useCallback(() => {
    if (!stageChannelId) return;
    showPrompt({
      title: "New Battlemap",
      message: "Enter a name for the new battlemap:",
      defaultValue: "Battlemap",
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
            await createBattlemap(mapName, picked);
          },
          onCancel: () => {
            void createBattlemap(mapName, null);
          },
        });
      },
    });
  }, [stageChannelId, showPrompt, showConfirm, pickImage, createBattlemap]);

  /** Drops a token for yourself, using your avatar. */
  const addMyToken = useCallback(async () => {
    if (!stageChannelId || !user) return;
    await apiFetch("/api/battlemap", {
      method: "POST",
      body: JSON.stringify({
        channelId: stageChannelId,
        action: "add-token",
        token: {
          label: user.displayName,
          color: user.color,
          avatarUrl: user.avatarUrl || null,
          ownerId: user.id,
          x: 2,
          y: 2,
        },
      }),
    }).catch((error: Error) => onNotice(error.message));
  }, [stageChannelId, user, onNotice]);

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
    onSocket,
    open,
    addMyToken,
    localToken,
    localStroke,
    toggle,
    close,
  };
}
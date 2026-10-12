"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type { PublicUser } from "@/lib/users";
import type { VoiceParticipant } from "@/lib/protocol";
import {
  startCallingTone,
  stopCallingTone,
  startIncomingCallTone,
  stopIncomingCallTone,
  playCallAnswerSound,
  playCallEndSound,
} from "../lib/audio-cues";
import { apiFetch } from "../lib/client";
import { DM_HOME } from "../lib/chat/constants";
import { showNotification } from "../lib/chat/browser";
import type { DmSummary } from "../lib/chat/types";
import type { useHub } from "./use-hub";
import type { useVoice } from "./use-voice";

export interface DmCallPayload {
  channelId: string;
  fromUserId: string;
  fromDisplayName: string;
  fromAvatar: string;
  fromAvatarUrl?: string | null;
  action: "call" | "accept" | "decline" | "cancel";
  isVideo?: boolean;
}

interface DmCallDeps {
  user: PublicUser | null;
  hub: ReturnType<typeof useHub>;
  voice: ReturnType<typeof useVoice>;
  voiceParticipants: VoiceParticipant[];
  voiceRooms: Record<string, VoiceParticipant[]>;
  dms: DmSummary[];
  activeDm: DmSummary | null;
  activeChannelId: string | null;
  blockedUserIdsRef: MutableRefObject<Set<string>>;
  /** The hub's "dm-call" events are routed here (see `onDmCall` in useHub). */
  onDmCallRef: MutableRefObject<((payload: DmCallPayload) => void) | null>;
  setNotice: (message: string) => void;
  setActiveServerId: (id: string) => void;
  setActiveChannelId: (id: string | null) => void;
}

/**
 * 1:1 DM calling: placing, ringing, answering and ending a call on top of the
 * voice room, and rebuilding the call state when you come back to one.
 */
export function useDmCalls({
  user,
  hub,
  voice,
  voiceParticipants,
  voiceRooms,
  dms,
  activeDm,
  activeChannelId,
  blockedUserIdsRef,
  onDmCallRef,
  setNotice,
  setActiveServerId,
  setActiveChannelId,
}: DmCallDeps) {
  const [incomingDmCall, setIncomingDmCall] = useState<{
    channelId: string;
    fromUserId: string;
    fromDisplayName: string;
    fromAvatar: string;
    fromAvatarUrl?: string | null;
    isVideo?: boolean;
  } | null>(null);

  const [dmCall, setDmCall] = useState<{
    channelId: string;
    otherUser: { id: string; displayName: string; avatar?: string; avatarUrl?: string | null; color?: string };
    status: "calling" | "connected";
    startTime: number;
    isVideo?: boolean;
    /**
     * Whether the other person has actually appeared in the voice room. An
     * "accept" arrives before their join does, so "connected" alone must not
     * be read as "they are here" — doing so hung the call up on accept.
     */
    seenOther?: boolean;
  } | null>(null);
  /** Set while we are deliberately leaving, so the restore effect stays out. */
  const dmCallEndingRef = useRef(false);
  const dmCallRef = useRef(dmCall);
  dmCallRef.current = dmCall;
  const callingTimeoutRef = useRef<number | null>(null);
  const incomingRingTimeoutRef = useRef<number | null>(null);
  const [callDuration, setCallDuration] = useState(0);

  useEffect(() => {
    if (!dmCall || dmCall.status !== "connected") {
      setCallDuration(0);
      return;
    }
    const interval = window.setInterval(() => {
      setCallDuration(Math.max(0, Math.floor((Date.now() - dmCall.startTime) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [dmCall]);

  const endDmCall = useCallback(
    (missed = false) => {
      stopCallingTone();
      stopIncomingCallTone();
      playCallEndSound();
      if (callingTimeoutRef.current) {
        window.clearTimeout(callingTimeoutRef.current);
        callingTimeoutRef.current = null;
      }
      const currentCall = dmCallRef.current;
      if (currentCall && currentCall.status === "calling") {
        hub.send({
          t: "dm-call",
          channelId: currentCall.channelId,
          targetUserId: currentCall.otherUser.id,
          action: "cancel",
        });
      }
      if (missed && currentCall && user) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        const dateStr = now.toLocaleDateString([], { month: "short", day: "numeric" });
        // Into the call's own DM, not whichever channel happens to be open.
        void apiFetch("/api/messages", {
          method: "POST",
          body: JSON.stringify({
            channelId: currentCall.channelId,
            content: `📞 Missed call from ${user.displayName} on ${dateStr} at ${timeStr}`,
          }),
        }).catch(() => undefined);
      }
      dmCallEndingRef.current = true;
      voice.leave();
      setDmCall(null);
    },
    [activeChannelId, user, voice, hub],
  );

  const startDmCall = useCallback(
    (video = false) => {
      if (!activeDm || !activeChannelId || !user) return;
      setDmCall({
        channelId: activeChannelId,
        otherUser: activeDm.user,
        status: "calling",
        startTime: Date.now(),
        isVideo: video,
      });
      startCallingTone();
      void voice.join(activeChannelId);
      if (video) void voice.startCamera();

      hub.send({
        t: "dm-call",
        channelId: activeChannelId,
        targetUserId: activeDm.user.id,
        action: "call",
        isVideo: video,
      });

      if (callingTimeoutRef.current) window.clearTimeout(callingTimeoutRef.current);
      callingTimeoutRef.current = window.setTimeout(() => {
        endDmCall(true);
      }, 35000);
    },
    [activeDm, activeChannelId, user, voice, hub, endDmCall],
  );

  const acceptIncomingCall = useCallback(() => {
    if (!incomingDmCall || !user) return;
    const callInfo = incomingDmCall;
    stopIncomingCallTone();
    setIncomingDmCall(null);

    hub.send({
      t: "dm-call",
      channelId: callInfo.channelId,
      targetUserId: callInfo.fromUserId,
      action: "accept",
    });

    setActiveServerId(DM_HOME);
    setActiveChannelId(callInfo.channelId);
    setDmCall({
      channelId: callInfo.channelId,
      otherUser: {
        id: callInfo.fromUserId,
        displayName: callInfo.fromDisplayName,
        avatar: callInfo.fromAvatar,
        avatarUrl: callInfo.fromAvatarUrl,
      },
      status: "connected",
      startTime: Date.now(),
      isVideo: callInfo.isVideo,
    });

    playCallAnswerSound();
    void voice.join(callInfo.channelId);
    if (callInfo.isVideo) void voice.startCamera();
  }, [incomingDmCall, user, hub, voice]);

  const declineIncomingCall = useCallback(() => {
    if (!incomingDmCall) return;
    const callInfo = incomingDmCall;
    stopIncomingCallTone();
    setIncomingDmCall(null);

    hub.send({
      t: "dm-call",
      channelId: callInfo.channelId,
      targetUserId: callInfo.fromUserId,
      action: "decline",
    });
  }, [incomingDmCall, hub]);

  // Wire up incoming DM call socket handler
  useEffect(() => {
    onDmCallRef.current = (payload) => {
      if (payload.action === "call") {
        if (payload.fromUserId === user?.id) return;
        if (blockedUserIdsRef.current.has(payload.fromUserId)) return;
        startIncomingCallTone();
        // If the caller's tab dies without cancelling, stop ringing anyway.
        if (incomingRingTimeoutRef.current) window.clearTimeout(incomingRingTimeoutRef.current);
        incomingRingTimeoutRef.current = window.setTimeout(() => {
          incomingRingTimeoutRef.current = null;
          stopIncomingCallTone();
          setIncomingDmCall((current) =>
            current?.channelId === payload.channelId ? null : current,
          );
        }, 45_000);
        showNotification(
          `Incoming ${payload.isVideo ? "Video" : "Voice"} Call`,
          `${payload.fromDisplayName || "Someone"} is calling you...`,
          `call-${payload.channelId}`,
        );
        setIncomingDmCall({
          channelId: payload.channelId,
          fromUserId: payload.fromUserId,
          fromDisplayName: payload.fromDisplayName,
          fromAvatar: payload.fromAvatar,
          fromAvatarUrl: payload.fromAvatarUrl,
          isVideo: payload.isVideo,
        });
      } else if (payload.action === "accept") {
        stopCallingTone();
        playCallAnswerSound();
        if (callingTimeoutRef.current) {
          window.clearTimeout(callingTimeoutRef.current);
          callingTimeoutRef.current = null;
        }
        setDmCall((curr) =>
          curr ? { ...curr, status: "connected", startTime: Date.now() } : null,
        );
      } else if (payload.action === "decline") {
        stopCallingTone();
        playCallEndSound();
        if (callingTimeoutRef.current) {
          window.clearTimeout(callingTimeoutRef.current);
          callingTimeoutRef.current = null;
        }
        setDmCall(null);
        voice.leave();
        setNotice(`${payload.fromDisplayName} declined the call.`);
      } else if (payload.action === "cancel") {
        if (incomingRingTimeoutRef.current) window.clearTimeout(incomingRingTimeoutRef.current);
        stopIncomingCallTone();
        setIncomingDmCall(null);
      }
    };
  }, [user, voice]);

  // Clean up tones on unmount
  useEffect(() => {
    return () => {
      stopCallingTone();
      stopIncomingCallTone();
    };
  }, []);

  useEffect(() => {
    if (!voice.channelId) dmCallEndingRef.current = false;
  }, [voice.channelId]);

  // Coming back to a DM call (a reload, a rejoin, answering on another
  // device's prompt) rebuilds its state from the room, so the call panel and
  // timer are there whenever you are in the call.
  useEffect(() => {
    if (dmCall || dmCallEndingRef.current || !voice.channelId || !user) return;
    if (!voiceParticipants.some((p) => p.id === user.id)) return;
    const dm = dms.find((d) => d.channelId === voice.channelId);
    if (!dm?.user || dm.group) return;
    setDmCall({
      channelId: voice.channelId,
      otherUser: dm.user,
      status: "connected",
      startTime: Date.now(),
      seenOther: voiceParticipants.some((p) => p.id === dm.user.id),
    });
  }, [dmCall, voice.channelId, voiceParticipants, dms, user]);

  // Follows the other person in and out of the room.
  const dmCallLeftTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const clearLeftTimer = () => {
      if (dmCallLeftTimerRef.current) {
        window.clearTimeout(dmCallLeftTimerRef.current);
        dmCallLeftTimerRef.current = null;
      }
    };
    if (!dmCall) {
      clearLeftTimer();
      return;
    }
    const otherInRoom = voiceParticipants.some((p) => p.id === dmCall.otherUser.id);

    if (otherInRoom) {
      clearLeftTimer();
      if (dmCall.status === "calling") {
        stopCallingTone();
        playCallAnswerSound();
      }
      if (callingTimeoutRef.current) {
        window.clearTimeout(callingTimeoutRef.current);
        callingTimeoutRef.current = null;
      }
      if (dmCall.status === "calling" || !dmCall.seenOther) {
        setDmCall((curr) =>
          curr
            ? {
                ...curr,
                status: "connected",
                seenOther: true,
                startTime: curr.status === "calling" ? Date.now() : curr.startTime,
              }
            : null,
        );
      }
      return;
    }

    // They were here and left: stay in the call, so they can come back (or
    // you hang up yourself). Only an accept that never arrives times out.
    if (dmCall.status !== "connected" || dmCall.seenOther || dmCallLeftTimerRef.current) return;
    dmCallLeftTimerRef.current = window.setTimeout(() => {
      dmCallLeftTimerRef.current = null;
      const current = dmCallRef.current;
      if (current && current.channelId === dmCall.channelId && !current.seenOther) endDmCall(false);
    }, 25000);
  }, [voiceParticipants, dmCall, endDmCall]);

  /**
   * What the DM call panel shows for the open conversation: whoever is in its
   * voice room, plus the person being rung while a call is still dialling.
   */
  const dmCallView = useMemo(() => {
    if (!activeChannelId || !activeDm?.user || activeDm.group) return null;
    const people = voiceRooms[activeChannelId] || [];
    const placing = dmCall?.channelId === activeChannelId ? dmCall : null;
    const ringing =
      placing?.status === "calling" && !people.some((p) => p.id === placing.otherUser.id)
        ? placing.otherUser
        : null;
    if (!people.length && !placing) return null;
    // Placing (or having just accepted) the call counts as in it, even in the
    // moment before our own join lands.
    const joined = voice.channelId === activeChannelId || Boolean(placing);
    return { people, ringing, joined };
  }, [activeChannelId, activeDm, voiceRooms, dmCall, voice.channelId]);

  return {
    incomingDmCall,
    dmCall,
    setDmCall,
    callDuration,
    dmCallView,
    startDmCall,
    endDmCall,
    acceptIncomingCall,
    declineIncomingCall,
  };
}

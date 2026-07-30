"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Battlemap, MapStroke, MapToken } from "@/lib/battlemap";
import type {
  CharacterPresentation,
  CharacterReveal,
  DiceRollEvent,
  RecordingState,
  VoiceParticipant,
} from "@/lib/protocol";
import { useHub } from "@/app/hooks/use-hub";
import { useVoice } from "@/app/hooks/use-voice";
import type { DiceOverlay } from "./dice-overlay";

declare global {
  interface Window {
    huddleRecorderControl?: (
      action: string,
      state?: RecordingState,
    ) => Promise<void>;
    huddleRecorderReady?: boolean;
  }
}

interface RecorderConfig {
  state: RecordingState;
  serviceUrl: string;
}

/** Dedicated capture surface. It deliberately contains none of Huddle's UI. */
export function ProductionStudio() {
  const [config, setConfig] = useState<RecorderConfig | null>(null);
  const [fatal, setFatal] = useState("");
  const [presentations, setPresentations] = useState<CharacterPresentation[]>([]);
  const [battlemap, setBattlemap] = useState<Battlemap | null>(null);
  const [reveal, setReveal] = useState<CharacterReveal | null>(null);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const [captureStatus, setCaptureStatus] = useState<
    "inactive" | "recording" | "paused"
  >("inactive");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signalRef = useRef<(from: string, data: unknown) => void>(() => {});
  const recorderRef = useRef<MediaRecorder | null>(null);
  const stemRecordersRef = useRef(new Map<string, MediaRecorder>());
  const stemSequencesRef = useRef(new Map<string, number>());
  const stemUploadsRef = useRef(new Set<Promise<unknown>>());
  const joiningRef = useRef(false);
  const audioRef = useRef<{
    context: AudioContext;
    destination: MediaStreamAudioDestinationNode;
    sources: Map<string, MediaStreamAudioSourceNode>;
  } | null>(null);
  const pendingUploads = useRef(new Set<Promise<unknown>>());
  const sequence = useRef(0);
  const diceOverlayRef = useRef<DiceOverlay | null>(null);
  const imageCacheRef = useRef(new Map<string, HTMLImageElement>());
  const revealTimerRef = useRef<number | null>(null);
  const lastAutomaticDecisionRef = useRef("");
  const transitionRef = useRef({ key: "", startedAt: 0 });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const serviceUrl = params.get("service") || "";
    const match = window.location.pathname.match(/\/recorder\/([^/]+)/);
    const sessionId = match?.[1] || "";
    if (!serviceUrl || !sessionId) {
      setFatal("Recorder configuration is missing.");
      return;
    }
    fetch(
      `${serviceUrl.replace(/\/+$/, "")}/v1/sessions/${encodeURIComponent(sessionId)}`,
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Recorder configuration failed (${response.status}).`);
        }
        return (await response.json()) as { state: RecordingState };
      })
      .then((data) => setConfig({ state: data.state, serviceUrl }))
      .catch((error) =>
        setFatal(
          error instanceof Error ? error.message : "Recorder unavailable.",
        ),
      );
  }, []);

  useEffect(() => {
    if (!config) return;
    const base = window.location.origin;
    const query = `sessionId=${encodeURIComponent(config.state.id)}`;
    void Promise.all([
      fetch(`${base}/hangout/api/recordings/presentation?${query}`).then(
        async (response) =>
          response.ok
            ? ((await response.json()) as {
                presentations: CharacterPresentation[];
              })
            : { presentations: [] },
      ),
      fetch(`${base}/hangout/api/recordings/production?${query}`).then(
        async (response) =>
          response.ok
            ? ((await response.json()) as { battlemap: Battlemap | null })
            : { battlemap: null },
      ),
    ]).then(([characters, production]) => {
      setPresentations(characters.presentations || []);
      setBattlemap(production.battlemap || null);
    });
  }, [config?.state.id]);

  const hub = useHub(Boolean(config), {
    onSignal: (from, data) => signalRef.current(from, data),
    onBattlemap: (channelId, payload) => {
      if (channelId !== config?.state.channelId) return;
      if (payload.action === "open") {
        setBattlemap((payload.map as Battlemap) || null);
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
            tokens: current.tokens.map((token) =>
              token.id === moved.id ? moved : token,
            ),
          };
        }
        if (payload.action === "tokens") {
          return { ...current, tokens: (payload.tokens as MapToken[]) || [] };
        }
        if (payload.action === "stroke") {
          const stroke = payload.stroke as MapStroke;
          return current.strokes.some((entry) => entry.id === stroke.id)
            ? current
            : { ...current, strokes: [...current.strokes, stroke] };
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
    },
    onDiceRoll: (channelId, roll: DiceRollEvent) => {
      if (channelId !== config?.state.channelId) return;
      void import("./dice-overlay").then(({ createDiceOverlay }) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        if (!diceOverlayRef.current) {
          diceOverlayRef.current = createDiceOverlay(canvas.width, canvas.height);
        }
        diceOverlayRef.current.play(roll);
      });
    },
    onCharacterPresentation: (channelId, payload) => {
      if (
        channelId !== config?.state.channelId ||
        payload.sessionId !== config.state.id
      ) {
        return;
      }
      if (payload.action === "updated" && payload.presentation) {
        setPresentations((current) => [
          ...current.filter(
            (entry) => entry.userId !== payload.presentation!.userId,
          ),
          payload.presentation!,
        ]);
      } else if (payload.action === "reveal" && payload.reveal) {
        setReveal(payload.reveal);
        if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
        revealTimerRef.current = window.setTimeout(
          () => setReveal(null),
          payload.reveal.durationMs,
        );
      } else if (payload.action === "clear") {
        setReveal(null);
      }
    },
  });
  const voice = useVoice({
    connectionId: hub.connectionId,
    rooms: hub.voice,
    send: hub.send,
    enableClips: false,
  });
  signalRef.current = voice.handleSignal;

  useEffect(() => {
    if (!config || !hub.connectionId || voice.channelId || joiningRef.current) return;
    joiningRef.current = true;
    void voice
      .join(config.state.channelId)
      .then(() => voice.toggleMute())
      .finally(() => {
        joiningRef.current = false;
      });
  }, [config, hub.connectionId, voice]);

  const participants = useMemo(
    () =>
      config
        ? (hub.voice[config.state.channelId] || []).filter(
            (person) =>
              !person.recorder &&
              config.state.consents.some(
                (consent) =>
                  consent.userId === person.id &&
                  consent.decision === "accepted",
              ),
          )
        : [],
    [config, hub.voice],
  );
  const participantsRef = useRef(participants);
  const remoteStreamsRef = useRef(voice.remoteStreams);
  participantsRef.current = participants;
  remoteStreamsRef.current = voice.remoteStreams;

  const startStem = (connectionId: string, stream: MediaStream) => {
    if (!config?.state.separateAudio || !stream.getAudioTracks().length) return;
    const person = participantsRef.current.find(
      (entry) => entry.connectionId === connectionId,
    );
    if (!person || stemRecordersRef.current.has(person.id)) return;
    const audio = new MediaStream(stream.getAudioTracks());
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const recorder = new MediaRecorder(audio, {
      mimeType,
      audioBitsPerSecond: 160_000,
    });
    recorder.ondataavailable = (event) => {
      if (!event.data.size || !config) return;
      const sequence = stemSequencesRef.current.get(person.id) || 0;
      stemSequencesRef.current.set(person.id, sequence + 1);
      const upload = fetch(
        `${config.serviceUrl.replace(/\/+$/, "")}/v1/sessions/${encodeURIComponent(config.state.id)}/stems/${encodeURIComponent(person.id)}/chunks?sequence=${sequence}`,
        {
          method: "POST",
          headers: {
            "Content-Type": event.data.type,
            "X-Participant-Name": encodeURIComponent(person.displayName),
          },
          body: event.data,
        },
      ).finally(() => stemUploadsRef.current.delete(upload));
      stemUploadsRef.current.add(upload);
    };
    recorder.start(2_000);
    stemRecordersRef.current.set(person.id, recorder);
  };

  // Speaker direction waits for a stable speaker and keeps focus briefly after
  // silence so normal cross-talk does not cause rapid cuts.
  useEffect(() => {
    const speakingNow = participants.find((person) =>
      voice.speaking.has(person.connectionId),
    );
    if (!speakingNow) return;
    const timer = window.setTimeout(
      () => setActiveSpeakerId(speakingNow.id),
      activeSpeakerId ? 550 : 180,
    );
    return () => window.clearTimeout(timer);
  }, [activeSpeakerId, participants, voice.speaking]);

  useEffect(() => {
    if (!config?.state.automaticDirection || captureStatus !== "recording") {
      return;
    }
    const scene = battlemap ? "split" : activeSpeakerId ? "speaker" : "party";
    const decision = `${scene}:${activeSpeakerId || ""}`;
    if (decision === lastAutomaticDecisionRef.current) return;
    lastAutomaticDecisionRef.current = decision;
    const timer = window.setTimeout(() => {
      void fetch(
        `${config.serviceUrl.replace(/\/+$/, "")}/v1/sessions/${encodeURIComponent(config.state.id)}/events`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "automatic.scene",
            payload: { scene, speakerId: activeSpeakerId },
          }),
        },
      );
    }, 700);
    return () => window.clearTimeout(timer);
  }, [activeSpeakerId, battlemap, captureStatus, config]);

  useEffect(() => {
    if (!config) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame = 0;
    const render = () => {
      const context = canvas.getContext("2d");
      if (!context) return;
      drawFrame(
        context,
        config.state,
        participants,
        presentations,
        voice.speaking,
        config.state.lockedSpeakerId || activeSpeakerId,
        battlemap,
        reveal,
        imageCacheRef.current,
        canvas.width,
        canvas.height,
      );
      const effectiveScene = config.state.automaticDirection
        ? battlemap
          ? "split"
          : activeSpeakerId
            ? "speaker"
            : "party"
        : config.state.scene;
      if (transitionRef.current.key !== effectiveScene) {
        transitionRef.current = {
          key: effectiveScene,
          startedAt: performance.now(),
        };
      }
      const transitionAge = performance.now() - transitionRef.current.startedAt;
      if (transitionAge < 650) {
        context.fillStyle = `rgba(4,4,7,${0.58 * (1 - transitionAge / 650)})`;
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      if (diceOverlayRef.current?.render(performance.now())) {
        context.drawImage(diceOverlayRef.current.canvas, 0, 0);
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [
    activeSpeakerId,
    battlemap,
    config,
    participants,
    presentations,
    reveal,
    voice.speaking,
  ]);

  useEffect(
    () => () => {
      if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
      diceOverlayRef.current?.dispose();
    },
    [],
  );

  // Fold every remote audio track into one capture destination. A participant
  // joining after start is added without restarting MediaRecorder.
  useEffect(() => {
    if (!config) return;
    let mix = audioRef.current;
    if (!mix) {
      const context = new AudioContext();
      mix = {
        context,
        destination: context.createMediaStreamDestination(),
        sources: new Map(),
      };
      audioRef.current = mix;
    }
    for (const { connectionId, stream } of voice.remoteStreams) {
      if (!participants.some((person) => person.connectionId === connectionId)) {
        continue;
      }
      if (mix.sources.has(connectionId) || !stream.getAudioTracks().length) {
        continue;
      }
      try {
        const source = mix.context.createMediaStreamSource(stream);
        source.connect(mix.destination);
        mix.sources.set(connectionId, source);
      } catch {
        // The host health monitor reports silent or missing tracks.
      }
      if (recorderRef.current?.state === "recording") {
        startStem(connectionId, stream);
      }
    }
  }, [config, participants, voice.remoteStreams]);

  useEffect(() => {
    if (!config) return;
    const upload = (blob: Blob) => {
      if (!blob.size) return;
      const current = sequence.current++;
      const request = fetch(
        `${config.serviceUrl.replace(/\/+$/, "")}/v1/sessions/${encodeURIComponent(config.state.id)}/chunks?sequence=${current}`,
        {
          method: "POST",
          headers: { "Content-Type": blob.type },
          body: blob,
        },
      ).finally(() => pendingUploads.current.delete(request));
      pendingUploads.current.add(request);
    };

    window.huddleRecorderControl = async (action, nextState) => {
      if (nextState) {
        setConfig((current) =>
          current ? { ...current, state: nextState } : current,
        );
      }
      if (action === "start") {
        if (recorderRef.current) return;
        const canvas = canvasRef.current;
        const audio = audioRef.current;
        if (!canvas || !audio) throw new Error("Capture surface is not ready.");
        const stream = canvas.captureStream(config.state.frameRate);
        for (const track of audio.destination.stream.getAudioTracks()) {
          stream.addTrack(track);
        }
        const mimeType = MediaRecorder.isTypeSupported(
          "video/webm;codecs=vp9,opus",
        )
          ? "video/webm;codecs=vp9,opus"
          : "video/webm;codecs=vp8,opus";
        const recorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond:
            config.state.resolution === "1920x1080" ? 10_000_000 : 6_000_000,
          audioBitsPerSecond: 192_000,
        });
        recorder.ondataavailable = (event) => upload(event.data);
        recorder.start(2_000);
        recorderRef.current = recorder;
        setCaptureStatus("recording");
        for (const { connectionId, stream: remote } of remoteStreamsRef.current) {
          startStem(connectionId, remote);
        }
        return;
      }
      const recorder = recorderRef.current;
      if (action === "pause" && recorder?.state === "recording") {
        recorder.requestData();
        recorder.pause();
        setCaptureStatus("paused");
        for (const stem of stemRecordersRef.current.values()) {
          if (stem.state === "recording") {
            stem.requestData();
            stem.pause();
          }
        }
        return;
      }
      if (action === "resume" && recorder?.state === "paused") {
        recorder.resume();
        setCaptureStatus("recording");
        for (const stem of stemRecordersRef.current.values()) {
          if (stem.state === "paused") stem.resume();
        }
        return;
      }
      if (action === "stop" && recorder && recorder.state !== "inactive") {
        await new Promise<void>((resolve) => {
          recorder.addEventListener("stop", () => resolve(), { once: true });
          recorder.stop();
        });
        await Promise.allSettled([...pendingUploads.current]);
        for (const stem of stemRecordersRef.current.values()) {
          if (stem.state === "inactive") continue;
          await new Promise<void>((resolve) => {
            stem.addEventListener("stop", () => resolve(), { once: true });
            stem.stop();
          });
        }
        await Promise.allSettled([...stemUploadsRef.current]);
        stemRecordersRef.current.clear();
        recorderRef.current = null;
        setCaptureStatus("inactive");
      }
    };
    window.huddleRecorderReady = true;
    return () => {
      delete window.huddleRecorderControl;
      window.huddleRecorderReady = false;
    };
  }, [config]);

  if (fatal) return <main className="production-fatal">{fatal}</main>;
  return (
    <main className="production-studio" aria-label="Huddle production recorder">
      <canvas
        ref={canvasRef}
        width={config?.state.resolution === "1280x720" ? 1280 : 1920}
        height={config?.state.resolution === "1280x720" ? 720 : 1080}
      />
    </main>
  );
}

function drawFrame(
  context: CanvasRenderingContext2D,
  state: RecordingState,
  participants: VoiceParticipant[],
  presentations: CharacterPresentation[],
  speaking: Set<string>,
  focusUserId: string | null,
  battlemap: Battlemap | null,
  reveal: CharacterReveal | null,
  images: Map<string, HTMLImageElement>,
  width: number,
  height: number,
) {
  const parchment = state.theme === "parchment";
  const scene = state.automaticDirection
    ? battlemap
      ? "split"
      : focusUserId
        ? "speaker"
        : "party"
    : state.scene;
  context.fillStyle = parchment
    ? "#dac49c"
    : state.theme === "minimal"
      ? "#111218"
      : state.theme === "arcane"
        ? "#110d2c"
        : state.theme === "noir"
          ? "#08090b"
          : "#17131c";
  context.fillRect(0, 0, width, height);
  const gradient = context.createRadialGradient(
    width / 2,
    height / 2,
    80,
    width / 2,
    height / 2,
    900,
  );
  gradient.addColorStop(
    0,
    parchment
      ? "rgba(255,250,224,.34)"
      : state.theme === "arcane"
        ? "rgba(93,75,255,.3)"
        : state.theme === "noir"
          ? "rgba(255,255,255,.08)"
          : "rgba(132,76,49,.2)",
  );
  gradient.addColorStop(1, "rgba(0,0,0,.42)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.fillStyle = parchment ? "#33271d" : "#f4eadc";
  context.font = "700 42px system-ui";
  context.fillText(state.title, 72, 78);
  context.font = "500 22px system-ui";
  context.fillStyle = parchment ? "#69523b" : "#b8aebd";
  context.fillText(
    [
      state.campaign,
      state.episodeNumber != null ? `Episode ${state.episodeNumber}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    72,
    114,
  );
  if (scene === "intermission") {
    context.textAlign = "center";
    context.fillStyle = parchment ? "#33271d" : "#f4eadc";
    context.font = "800 76px system-ui";
    context.fillText("INTERMISSION", width / 2, height / 2);
    context.font = "400 28px system-ui";
    context.fillText(
      "The adventure continues shortly",
      width / 2,
      height / 2 + 58,
    );
    context.textAlign = "start";
  } else if (scene === "battlemap" && battlemap) {
    drawBattlemap(context, battlemap, images, 58, 145, width - 116, height - 205);
    drawPortraitRail(
      context,
      participants,
      presentations,
      speaking,
      images,
      72,
      height - 166,
      width - 144,
      124,
      parchment,
    );
  } else if (scene === "split" && battlemap) {
    drawBattlemap(
      context,
      battlemap,
      images,
      55,
      145,
      width * 0.65 - 75,
      height - 205,
    );
    drawParty(
      context,
      participants,
      presentations,
      speaking,
      images,
      width * 0.65,
      145,
      width * 0.35 - 55,
      height - 205,
      parchment,
      1,
    );
  } else if (scene === "speaker") {
    drawSpeakerFocus(
      context,
      participants,
      presentations,
      speaking,
      focusUserId,
      images,
      width,
      height,
      parchment,
    );
  } else {
    drawParty(
      context,
      participants,
      presentations,
      speaking,
      images,
      0,
      145,
      width,
      height - 205,
      parchment,
    );
  }
  if (reveal) drawReveal(context, reveal, images, width, height, parchment);
}

function drawParty(
  context: CanvasRenderingContext2D,
  participants: VoiceParticipant[],
  presentations: CharacterPresentation[],
  speaking: Set<string>,
  images: Map<string, HTMLImageElement>,
  left: number,
  top: number,
  width: number,
  height: number,
  parchment: boolean,
  forcedColumns?: number,
) {
  const people = participants.slice(0, 8);
  const columns =
    forcedColumns || (people.length <= 4 ? people.length || 1 : 4);
  const rows = Math.ceil(people.length / columns);
  const gap = 28;
  const tileWidth = Math.min(
    390,
    (width - 110 - gap * (columns - 1)) / columns,
  );
  const tileHeight = Math.min(
    690,
    (height - gap * (rows - 1)) / Math.max(1, rows),
  );
  const startX =
    left + (width - (columns * tileWidth + (columns - 1) * gap)) / 2;
  people.forEach((person, index) => {
    const x = startX + (index % columns) * (tileWidth + gap);
    const y = top + Math.floor(index / columns) * (tileHeight + gap);
    const active = speaking.has(person.connectionId);
    const character = presentations.find((entry) => entry.userId === person.id);
    const accent = character?.accentColor || person.color || "#e8a95d";
    context.beginPath();
    context.roundRect(x, y, tileWidth, tileHeight, 22);
    context.fillStyle = parchment
      ? "rgba(87,61,38,.13)"
      : "rgba(255,255,255,.055)";
    context.fill();
    context.lineWidth = active ? 7 : 2;
    context.strokeStyle = active
      ? accent
      : "rgba(255,255,255,.12)";
    context.stroke();
    const portraitSize = Math.min(tileWidth * 0.58, tileHeight * 0.55);
    drawPortrait(
      context,
      character?.portraitUrl || character?.artworkUrl || null,
      images,
      x + tileWidth / 2,
      y + tileHeight * 0.42,
      portraitSize,
      accent,
      person.avatar || person.displayName.slice(0, 2).toUpperCase(),
    );
    context.font = `700 ${Math.max(22, tileWidth * 0.07)}px system-ui`;
    context.fillStyle = parchment ? "#33271d" : "#f5eff7";
    context.textAlign = "center";
    context.fillText(
      character?.characterName || person.displayName,
      x + tileWidth / 2,
      y + tileHeight - 54,
    );
    if (character?.className || character?.level) {
      context.font = `500 ${Math.max(15, tileWidth * 0.042)}px system-ui`;
      context.fillStyle = parchment ? "#6d543b" : "#bcb1c2";
      context.fillText(
        [character.className, character.level ? `Level ${character.level}` : null]
          .filter(Boolean)
          .join(" · "),
        x + tileWidth / 2,
        y + tileHeight - 24,
      );
    }
    context.textAlign = "start";
  });
}

function cachedImage(
  images: Map<string, HTMLImageElement>,
  url: string | null,
): HTMLImageElement | null {
  if (!url) return null;
  let image = images.get(url);
  if (!image) {
    image = new Image();
    image.crossOrigin = "anonymous";
    image.src = url;
    images.set(url, image);
  }
  return image.complete && image.naturalWidth ? image : null;
}

function drawPortrait(
  context: CanvasRenderingContext2D,
  url: string | null,
  images: Map<string, HTMLImageElement>,
  centerX: number,
  centerY: number,
  size: number,
  accent: string,
  fallback: string,
) {
  context.save();
  context.beginPath();
  context.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
  context.clip();
  context.fillStyle = accent;
  context.fillRect(centerX - size / 2, centerY - size / 2, size, size);
  const image = cachedImage(images, url);
  if (image) {
    const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    context.drawImage(
      image,
      centerX - drawWidth / 2,
      centerY - drawHeight / 2,
      drawWidth,
      drawHeight,
    );
  } else {
    context.fillStyle = "#fff";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `800 ${Math.max(28, size * 0.24)}px system-ui`;
    context.fillText(fallback, centerX, centerY);
  }
  context.restore();
  context.textBaseline = "alphabetic";
}

function drawSpeakerFocus(
  context: CanvasRenderingContext2D,
  participants: VoiceParticipant[],
  presentations: CharacterPresentation[],
  speaking: Set<string>,
  focusUserId: string | null,
  images: Map<string, HTMLImageElement>,
  width: number,
  height: number,
  parchment: boolean,
) {
  const focused =
    participants.find((person) => person.id === focusUserId) || participants[0];
  if (!focused) return;
  const character = presentations.find((entry) => entry.userId === focused.id);
  const artwork = cachedImage(
    images,
    character?.artworkUrl || character?.portraitUrl || null,
  );
  const areaX = 100;
  const areaY = 150;
  const areaWidth = width - 200;
  const areaHeight = height - 350;
  context.save();
  context.beginPath();
  context.roundRect(areaX, areaY, areaWidth, areaHeight, 34);
  context.clip();
  context.fillStyle = parchment ? "rgba(82,55,32,.12)" : "rgba(255,255,255,.055)";
  context.fillRect(areaX, areaY, areaWidth, areaHeight);
  if (artwork) {
    const scale = Math.min(
      areaWidth / artwork.naturalWidth,
      areaHeight / artwork.naturalHeight,
    );
    const drawWidth = artwork.naturalWidth * scale;
    const drawHeight = artwork.naturalHeight * scale;
    context.drawImage(
      artwork,
      areaX + (areaWidth - drawWidth) / 2,
      areaY + areaHeight - drawHeight,
      drawWidth,
      drawHeight,
    );
  } else {
    drawPortrait(
      context,
      character?.portraitUrl || null,
      images,
      width / 2,
      areaY + areaHeight * 0.45,
      Math.min(430, areaHeight * 0.7),
      character?.accentColor || focused.color,
      focused.avatar,
    );
  }
  const shade = context.createLinearGradient(0, areaY + areaHeight * 0.55, 0, areaY + areaHeight);
  shade.addColorStop(0, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,0,0,.82)");
  context.fillStyle = shade;
  context.fillRect(areaX, areaY, areaWidth, areaHeight);
  context.restore();
  context.textAlign = "center";
  context.fillStyle = "#fff";
  context.font = "800 56px system-ui";
  context.fillText(
    character?.characterName || focused.displayName,
    width / 2,
    areaY + areaHeight - 58,
  );
  context.font = "500 24px system-ui";
  context.fillStyle = "#d8cedd";
  context.fillText(
    [character?.className, character?.level ? `Level ${character.level}` : null]
      .filter(Boolean)
      .join(" · "),
    width / 2,
    areaY + areaHeight - 23,
  );
  context.textAlign = "start";
  drawPortraitRail(
    context,
    participants,
    presentations,
    speaking,
    images,
    90,
    height - 170,
    width - 180,
    126,
    parchment,
  );
}

function drawPortraitRail(
  context: CanvasRenderingContext2D,
  participants: VoiceParticipant[],
  presentations: CharacterPresentation[],
  speaking: Set<string>,
  images: Map<string, HTMLImageElement>,
  left: number,
  top: number,
  width: number,
  height: number,
  parchment: boolean,
) {
  const people = participants.slice(0, 10);
  const slot = width / Math.max(1, people.length);
  people.forEach((person, index) => {
    const character = presentations.find((entry) => entry.userId === person.id);
    const size = Math.min(height - 22, slot - 18);
    const centerX = left + slot * index + slot / 2;
    const centerY = top + size / 2;
    drawPortrait(
      context,
      character?.portraitUrl || null,
      images,
      centerX,
      centerY,
      size,
      character?.accentColor || person.color,
      person.avatar,
    );
    if (speaking.has(person.connectionId)) {
      context.beginPath();
      context.arc(centerX, centerY, size / 2 + 5, 0, Math.PI * 2);
      context.strokeStyle = character?.accentColor || "#ffd67c";
      context.lineWidth = 6;
      context.stroke();
    }
    context.textAlign = "center";
    context.fillStyle = parchment ? "#33271d" : "#fff";
    context.font = "700 16px system-ui";
    context.fillText(
      character?.characterName || person.displayName,
      centerX,
      top + height,
    );
  });
  context.textAlign = "start";
}

function drawBattlemap(
  context: CanvasRenderingContext2D,
  map: Battlemap,
  images: Map<string, HTMLImageElement>,
  left: number,
  top: number,
  width: number,
  height: number,
) {
  const rows = Math.round(map.grid * 0.6) || map.grid;
  const aspect = map.grid / rows;
  let drawWidth = width;
  let drawHeight = drawWidth / aspect;
  if (drawHeight > height) {
    drawHeight = height;
    drawWidth = drawHeight * aspect;
  }
  const x = left + (width - drawWidth) / 2;
  const y = top + (height - drawHeight) / 2;
  context.save();
  context.beginPath();
  context.roundRect(x, y, drawWidth, drawHeight, 18);
  context.clip();
  context.fillStyle = "#24242b";
  context.fillRect(x, y, drawWidth, drawHeight);
  const background = cachedImage(images, map.imageUrl || null);
  if (background) context.drawImage(background, x, y, drawWidth, drawHeight);
  context.strokeStyle = "rgba(255,255,255,.18)";
  context.lineWidth = 1;
  for (let column = 0; column <= map.grid; column += 1) {
    const lineX = x + (column / map.grid) * drawWidth;
    context.beginPath();
    context.moveTo(lineX, y);
    context.lineTo(lineX, y + drawHeight);
    context.stroke();
  }
  for (let row = 0; row <= rows; row += 1) {
    const lineY = y + (row / rows) * drawHeight;
    context.beginPath();
    context.moveTo(x, lineY);
    context.lineTo(x + drawWidth, lineY);
    context.stroke();
  }
  for (const stroke of map.strokes) {
    context.beginPath();
    for (let index = 0; index < stroke.points.length; index += 2) {
      const pointX = x + (stroke.points[index] / map.grid) * drawWidth;
      const pointY = y + (stroke.points[index + 1] / rows) * drawHeight;
      if (index === 0) context.moveTo(pointX, pointY);
      else context.lineTo(pointX, pointY);
    }
    context.strokeStyle = stroke.color;
    context.lineWidth = Math.max(2, (stroke.width / 20) * (drawWidth / map.grid));
    context.lineCap = "round";
    context.lineJoin = "round";
    context.stroke();
  }
  for (const token of map.tokens) {
    const centerX = x + (token.x / map.grid) * drawWidth;
    const centerY = y + (token.y / rows) * drawHeight;
    const size = Math.max(28, drawWidth / map.grid);
    drawPortrait(
      context,
      token.avatarUrl || null,
      images,
      centerX,
      centerY,
      size,
      token.color,
      token.label.slice(0, 2).toUpperCase(),
    );
    context.beginPath();
    context.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
    context.strokeStyle = token.color;
    context.lineWidth = 4;
    context.stroke();
  }
  context.restore();
}

function drawReveal(
  context: CanvasRenderingContext2D,
  reveal: CharacterReveal,
  images: Map<string, HTMLImageElement>,
  width: number,
  height: number,
  parchment: boolean,
) {
  context.fillStyle = "rgba(5,5,8,.68)";
  context.fillRect(0, 0, width, height);
  const cardWidth = Math.min(980, width - 180);
  const cardHeight = Math.min(700, height - 180);
  const x = (width - cardWidth) / 2;
  const y = (height - cardHeight) / 2;
  context.beginPath();
  context.roundRect(x, y, cardWidth, cardHeight, 34);
  context.fillStyle = parchment ? "#e3d0a8" : "#211b27";
  context.fill();
  context.strokeStyle = parchment ? "#8c6a3d" : "#d7a35e";
  context.lineWidth = 5;
  context.stroke();
  const image = cachedImage(images, reveal.imageUrl);
  const imageWidth = reveal.mode === "portrait" ? cardWidth * 0.56 : cardWidth * 0.38;
  if (image) {
    const scale = Math.min(
      imageWidth / image.naturalWidth,
      (cardHeight - 80) / image.naturalHeight,
    );
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    context.drawImage(
      image,
      x + 40 + (imageWidth - drawWidth) / 2,
      y + cardHeight - 40 - drawHeight,
      drawWidth,
      drawHeight,
    );
  }
  const textX = x + imageWidth + 80;
  context.fillStyle = parchment ? "#33271d" : "#fff5e6";
  context.font = "800 48px system-ui";
  context.fillText(reveal.title, textX, y + 86);
  context.font = "700 17px system-ui";
  context.fillStyle = parchment ? "#75583b" : "#d1a868";
  context.fillText(reveal.mode.toUpperCase(), textX, y + 120);
  let lineY = y + 176;
  for (const field of reveal.fields) {
    context.fillStyle = parchment ? "#75583b" : "#bcb0c2";
    context.font = "700 17px system-ui";
    context.fillText(field.label.toUpperCase(), textX, lineY);
    context.fillStyle = parchment ? "#33271d" : "#f7f1f8";
    context.font = "500 24px system-ui";
    const lines = wrapText(context, field.value, cardWidth - imageWidth - 130);
    for (const line of lines.slice(0, 3)) {
      lineY += 30;
      context.fillText(line, textX, lineY);
    }
    lineY += 30;
    if (lineY > y + cardHeight - 45) break;
  }
}

function wrapText(
  context: CanvasRenderingContext2D,
  value: string,
  maximumWidth: number,
): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of value.split(/\s+/)) {
    const next = current ? `${current} ${word}` : word;
    if (current && context.measureText(next).width > maximumWidth) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

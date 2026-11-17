#!/bin/zsh
# Builds resources/web/livingroom.html: the web's own 3D Living Room (components/living-room.tsx and
# hooks/use-living-room.ts: the lounge, cinema, tabletop, board hall, meadow and club), bundled with
# esbuild on the home server; its styles are read at run time from the page the server serves (like
# activities.html). The app shows it in a web view that covers the window, drawing only the stage's
# box (src/shell/living_room.rs):
#   window.__set({ roomId, connectionId, participants, speaking, deafened, nowPlaying, canProject,
#                  serverId, clockOffset, theme, open })   (any of them, whenever they change)
#   window.__hub(payload)       (hub lounge, lounge-state, lounge-venue, lounge-shared, club, club-desk, club-fx)
#   window.__dice(roll)         (a dice roll in the call: thrown onto the table at the tabletop)
#   window.__setRect(x, y, w, h)
# and hears back through webkit.messageHandlers.hoffle: ready, send (an event for the hub), command
# (a slash command to run), dice-done, state (open, venue, heard). Run again when the web's room changes.
set -e
here=${0:A:h}
out=$here/../resources/web/livingroom.html
mkdir -p ${out:h}
ssh -o ClearAllForwardings=yes home 'mkdir -p ~/.cache/fx-bundle && cat > ~/.cache/fx-bundle/livingroom-entry.tsx <<"JS"
import { createElement, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { LivingRoomView } from "/home/coxaexs/huddle/app/components/living-room";
import { useLivingRoom, LOUNGE_EVENT } from "/home/coxaexs/huddle/app/hooks/use-living-room";

type State = {
  roomId: string | null;
  connectionId: string | null;
  participants: any[];
  speaking: string[];
  deafened: boolean;
  nowPlaying: any;
  canProject: boolean;
  serverId: string | null;
  clockOffset: number;
  theme: string;
  open: boolean;
};
const EMPTY: State = { roomId: null, connectionId: null, participants: [], speaking: [], deafened: false, nowPlaying: null, canProject: false, serverId: null, clockOffset: 0, theme: "cozy", open: false };
const post = (message: Record<string, unknown>) => {
  try {
    (window as any).webkit?.messageHandlers?.hoffle?.postMessage(JSON.stringify(message));
  } catch {
    /* not in the app */
  }
};
const api: Record<string, (value: any) => void> = {};

function Bridge() {
  const [state, setState] = useState<State>(EMPTY);
  const [diceRoll, setDiceRoll] = useState<any>(null);
  api.set = (patch: Partial<State>) => setState((current) => ({ ...current, ...patch }));
  api.dice = setDiceRoll;
  // The theme the room dresses for (useRoomTheme reads data-custom-theme-id).
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = "cozy";
    if (state.theme && state.theme !== "cozy") root.dataset.customThemeId = state.theme;
    else delete root.dataset.customThemeId;
  }, [state.theme]);
  const room = useLivingRoom({
    roomId: state.roomId,
    connectionId: state.connectionId,
    participants: state.participants,
    send: (event: any) => {
      post({ t: "send", event });
      return true;
    },
  });
  // The app decides when the room shows (its Living Room button), not this page.
  const setOpen = room.setOpen;
  useEffect(() => setOpen(state.open), [state.open, setOpen]);
  // Where everyone is heard from (for the app to place voices) and which venue the call is in.
  const heard = room.heard ? Object.fromEntries([...room.heard].map(([id, h]) => [id, h])) : null;
  const report = JSON.stringify({ open: room.open, venue: room.venue, heard, tv: room.tv, spatialOff: room.spatialOff });
  const last = useRef("");
  useEffect(() => {
    if (report === last.current) return;
    last.current = report;
    post({ t: "state", ...JSON.parse(report) });
  }, [report]);
  useEffect(() => post({ t: "ready" }), []);
  if (!room.open) return null;
  return createElement(LivingRoomView, {
    room,
    participants: state.participants,
    connectionId: state.connectionId,
    speaking: new Set(state.speaking),
    screens: [],
    cameras: [],
    deafened: state.deafened,
    nowPlaying: state.nowPlaying,
    serverNow: () => Date.now() + (state.clockOffset || 0),
    diceRoll,
    onDiceRollDone: () => {
      setDiceRoll(null);
      post({ t: "dice-done" });
    },
    onCommand: (command: string) => post({ t: "command", command }),
    canProject: state.canProject,
    boardGameId: null,
    onPlayBoardGame: () => post({ t: "notice", message: "Open DeepPixel from the games button to play." }),
    serverId: state.serverId,
  });
}

void fetch("/hangout/", { credentials: "include" })
  .then((response) => response.text())
  .then((html) => {
    for (const match of html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = match[1];
      document.head.appendChild(link);
    }
  })
  .catch(() => post({ t: "error", message: "stylesheet" }));
(window as any).__set = (patch: Partial<State>) => api.set?.(patch);
(window as any).__dice = (roll: any) => api.dice?.(roll);
// The hub events the web hands round as window events (hooks/use-hub.ts).
(window as any).__hub = (payload: any) => {
  const kind = String(payload?.t || "");
  if (kind.startsWith("lounge")) window.dispatchEvent(new CustomEvent(LOUNGE_EVENT, { detail: payload }));
  else if (kind.startsWith("club")) window.dispatchEvent(new CustomEvent("huddle-club", { detail: payload }));
};
// The stage box: the view covers the window (so the CSS sees its real width), and only this box
// shows anything or takes clicks. `.living-room` fills it (position: absolute; inset: 0).
(window as any).__setRect = (x: number, y: number, w: number, h: number) => {
  const root = document.getElementById("root")!;
  Object.assign(root.style, { position: "absolute", left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, borderRadius: "14px", overflow: "hidden" });
};
window.addEventListener("error", (event) => post({ t: "error", message: String(event.message) }));
window.addEventListener("unhandledrejection", (event) => post({ t: "error", message: String((event as PromiseRejectionEvent).reason) }));
createRoot(document.getElementById("root")!).render(createElement(Bridge));
JS
cd ~/huddle && NODE_PATH=$HOME/huddle/node_modules node_modules/.bin/esbuild ~/.cache/fx-bundle/livingroom-entry.tsx --bundle --format=iife --target=es2020 --jsx=automatic --minify --define:process.env.NODE_ENV=\"production\" --tsconfig=tsconfig.json --loader:.png=dataurl --loader:.svg=dataurl --loader:.jpg=dataurl --loader:.glb=dataurl --loader:.wav=dataurl --loader:.mp3=dataurl --log-level=error --outfile=$HOME/.cache/fx-bundle/livingroom.js'
js=$(ssh -o ClearAllForwardings=yes home 'cat ~/.cache/fx-bundle/livingroom.js')
{
  print -r -- '<!doctype html><html data-theme="cozy"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
  print -r -- '<style>html,body{margin:0;padding:0;width:100%;height:100%;background:transparent!important;overflow:hidden}</style>'
  print -r -- "</head><body><div id=\"root\"></div><script>$js</script></body></html>"
} > $out
echo "wrote $out ($(wc -c < $out) bytes)"

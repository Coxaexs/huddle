#!/bin/zsh
# Builds resources/web/activities.html: the web's own <RoomActivities> (components/room-activities.tsx
# and every activity in it: Watch and Reels Together, Whiteboard, Tier List, Draw & Guess, Synced
# Timer, Initiative, DeepPixel, Richup, Gesture Synth, Beatbox, Study Hall, bot apps), its styles
# read at run time from the page the server serves, bundled with esbuild on the home server. The app shows it in a web view where the
# web shows the panel (src/shell/activities.rs) and drives it through a small bridge:
#   window.__init({ channelId, channelName, userId, userName, theme, clockOffset })
#   window.__setActivity(activity | null)   (from GET /api/activities and hub "activity" events)
#   window.__setOpen(open)
#   window.__setTakeover(takeover, dark)   (a running activity fills the stage)
#   window.__setRect(x, y, w, h)          (the panel's box: the view covers the whole window)
# and hears back through webkit.messageHandlers.hoffle: ready, open, activity, error.
# Run again when the web's activities change.
set -e
here=${0:A:h}
out=$here/../resources/web/activities.html
mkdir -p ${out:h}
ssh -o ClearAllForwardings=yes home 'mkdir -p ~/.cache/fx-bundle && cat > ~/.cache/fx-bundle/activities-entry.tsx <<"JS"
import { createElement, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { RoomActivities } from "/home/coxaexs/huddle/app/components/room-activities";

type Init = { channelId: string; channelName: string; userId: string; userName: string; theme: string; clockOffset: number };
const post = (message: Record<string, unknown>) => {
  try {
    (window as any).webkit?.messageHandlers?.hoffle?.postMessage(JSON.stringify(message));
  } catch {
    /* not in the app */
  }
};
const api: Record<string, (value: any) => void> = {};

function Bridge() {
  const [init, setInit] = useState<Init | null>(null);
  const [activity, setActivity] = useState<any>(null);
  const [open, setOpen] = useState(true);
  api.init = (value: Init) => {
    document.documentElement.dataset.theme = value.theme || "cozy";
    setInit(value);
  };
  api.activity = setActivity;
  api.open = setOpen;
  useEffect(() => post({ t: "ready" }), []);
  if (!init) return null;
  return createElement(RoomActivities, {
    channelId: init.channelId,
    channelName: init.channelName,
    userId: init.userId,
    userName: init.userName,
    activity,
    onActivity: (next: any) => {
      setActivity(next);
      post({ t: "activity", activity: next });
    },
    open,
    onOpen: (next: boolean) => {
      setOpen(next);
      post({ t: "open", open: next });
    },
    serverNow: () => Date.now() + (init.clockOffset || 0),
  });
}

// The deployed web stylesheet (Tailwind-built), read from the page the server serves now, so this
// always matches the web that is live there.
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
(window as any).__init = (value: Init) => api.init?.(value);
(window as any).__setActivity = (value: any) => api.activity?.(value);
(window as any).__setOpen = (value: boolean) => api.open?.(value);
// A running activity takes the stage over (voice-stage.tsx): the classes its look hangs on.
(window as any).__setTakeover = (takeover: boolean, dark: boolean) => {
  const root = document.getElementById("root")!;
  root.className = takeover ? `voice-stage activity-takeover${dark ? " takeover-dark" : ""}` : "";
};
// Where the panel sits in the window: the view covers the whole window (so the CSS sees its real
// width), and only this box shows anything or takes clicks.
(window as any).__setRect = (x: number, y: number, w: number, h: number) => {
  const root = document.getElementById("root")!;
  Object.assign(root.style, { position: "absolute", left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
};
window.addEventListener("error", (event) => post({ t: "error", message: String(event.message) }));
createRoot(document.getElementById("root")!).render(createElement(Bridge));
JS
cd ~/huddle && NODE_PATH=$HOME/huddle/node_modules node_modules/.bin/esbuild ~/.cache/fx-bundle/activities-entry.tsx --bundle --format=iife --target=es2020 --jsx=automatic --minify --define:process.env.NODE_ENV=\"production\" --tsconfig=tsconfig.json --loader:.png=dataurl --loader:.svg=dataurl --loader:.jpg=dataurl --loader:.webp=dataurl --loader:.woff2=empty --loader:.woff=empty --loader:.ttf=empty --external:/hangout/* --log-level=error --outfile=$HOME/.cache/fx-bundle/activities.js'
js=$(ssh -o ClearAllForwardings=yes home 'cat ~/.cache/fx-bundle/activities.js')
{
  print -r -- '<!doctype html><html data-theme="cozy"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
  # The page is only the panel: it fills the view, which the app places where the web puts it.
  print -r -- '<style>html,body{margin:0;padding:0;width:100%;height:100%;background:transparent!important;overflow:hidden}#root{width:100%;height:100%;display:flex;flex-direction:column}#root>.room-activity{flex:1 1 auto;margin:0;min-height:0;max-height:none}#root.voice-stage{background:transparent;padding:0;border:0;box-shadow:none}</style>'
  print -r -- "</head><body><div id=\"root\"></div><script>$js</script></body></html>"
} > $out
echo "wrote $out ($(wc -c < $out) bytes)"

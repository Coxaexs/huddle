#!/bin/zsh
# Builds resources/web/battlemap.html: the web's own battlemap (hooks/use-battlemap.ts and
# components/battlemap.tsx) for a voice room's stage, bundled with esbuild on the home server; its
# styles are read at run time from the page the server serves (like activities.html). The app shows
# it in a web view that covers the window, drawing only the board's box (src/shell/battlemap.rs):
#   window.__init({ channelId, userId, displayName, color, avatarUrl, theme })
#   window.__setRect(x, y, w, h)        (the stage column: the board sits at its top)
#   window.__socket(channelId, payload) (hub "battlemap" events)
#   window.__toggle()                   (the stage's map button / ⋯ Battlemap)
#   window.__answer(id, value)          (what the app's prompt, confirm or picture picker said)
# and hears back through webkit.messageHandlers.hoffle: ready, state (shown, gm, height), notice,
# prompt, confirm, pick. Run again when the web's battlemap changes.
set -e
here=${0:A:h}
out=$here/../resources/web/battlemap.html
mkdir -p ${out:h}
ssh -o ClearAllForwardings=yes home 'mkdir -p ~/.cache/fx-bundle && cat > ~/.cache/fx-bundle/battlemap-entry.tsx <<"JS"
import { createElement, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useBattlemap } from "/home/coxaexs/huddle/app/hooks/use-battlemap";
import { BattlemapBoard } from "/home/coxaexs/huddle/app/components/battlemap";

type Init = { channelId: string; userId: string; displayName: string; color: string; avatarUrl: string | null; theme: string };
const post = (message: Record<string, unknown>) => {
  try {
    (window as any).webkit?.messageHandlers?.hoffle?.postMessage(JSON.stringify(message));
  } catch {
    /* not in the app */
  }
};
const api: Record<string, (...args: any[]) => void> = {};
const waiting = new Map<number, (value: any) => void>();
let seq = 0;
const ask = (message: Record<string, unknown>, then: (value: any) => void) => {
  const id = ++seq;
  waiting.set(id, then);
  post({ ...message, id });
};

function Bridge() {
  const [init, setInit] = useState<Init | null>(null);
  const box = useRef<HTMLDivElement>(null);
  api.init = (value: Init) => {
    document.documentElement.dataset.theme = value.theme || "cozy";
    setInit(value);
  };
  const map = useBattlemap({
    stageChannelId: init?.channelId ?? null,
    user: init ? { id: init.userId, displayName: init.displayName, color: init.color, avatarUrl: init.avatarUrl } : null,
    onNotice: (message: string) => post({ t: "notice", message }),
    showPrompt: (options: any) =>
      ask({ t: "prompt", title: options.title, message: options.message, defaultValue: options.defaultValue, confirmText: options.confirmText }, (value) => {
        if (value !== null && value !== undefined) options.onConfirm(value);
      }),
    showConfirm: (options: any) =>
      ask({ t: "confirm", title: options.title, message: options.message, confirmText: options.confirmText, cancelText: options.cancelText, isDanger: options.isDanger }, (ok) => {
        if (ok) void options.onConfirm();
        else options.onCancel?.();
      }),
    pickImage: () =>
      new Promise<File | null>((resolve) =>
        ask({ t: "pick" }, (file) => {
          if (!file) return resolve(null);
          const bytes = Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0));
          resolve(new File([bytes], file.name, { type: file.type }));
        }),
      ),
  });
  api.answer = (id: number, value: any) => {
    const then = waiting.get(id);
    waiting.delete(id);
    then?.(value);
  };
  api.socket = (channelId: string, payload: any) => map.onSocket(channelId, payload);
  api.toggle = () => {
    if (!map.battlemap) {
      if (map.gm) map.open();
      else post({ t: "notice", message: "No map is on the table yet." });
      return;
    }
    map.toggle();
  };
  const shown = Boolean(init && map.battlemap && !map.hidden);
  useEffect(() => post({ t: "ready" }), []);
  useEffect(() => {
    const report = () => post({ t: "state", shown, gm: map.gm, height: box.current?.getBoundingClientRect().height ?? 0 });
    report();
    if (!box.current) return;
    const watcher = new ResizeObserver(report);
    watcher.observe(box.current);
    return () => watcher.disconnect();
  }, [shown, map.gm]);
  if (!init || !map.battlemap || map.hidden) return null;
  return createElement(
    "div",
    { ref: box },
    createElement(BattlemapBoard, {
      channelId: init.channelId,
      map: map.battlemap,
      gm: map.gm,
      userId: init.userId,
      onClose: map.close,
      onAddMyToken: () => void map.addMyToken(),
      onLocalToken: map.localToken,
      onLocalStroke: map.localStroke,
    }),
  );
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
  });
(window as any).__init = (value: Init) => api.init?.(value);
(window as any).__socket = (channelId: string, payload: any) => api.socket?.(channelId, payload);
(window as any).__toggle = () => api.toggle?.();
(window as any).__answer = (id: number, value: any) => api.answer?.(id, value);
(window as any).__setRect = (x: number, y: number, w: number, h: number) => {
  const root = document.getElementById("root")!;
  Object.assign(root.style, { position: "absolute", left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
};
window.addEventListener("error", (event) => post({ t: "error", message: String(event.message) }));
createRoot(document.getElementById("root")!).render(createElement(Bridge));
JS
cd ~/huddle && NODE_PATH=$HOME/huddle/node_modules node_modules/.bin/esbuild ~/.cache/fx-bundle/battlemap-entry.tsx --bundle --format=iife --target=es2020 --jsx=automatic --minify --define:process.env.NODE_ENV=\"production\" --tsconfig=tsconfig.json --loader:.png=dataurl --loader:.svg=dataurl --log-level=error --outfile=$HOME/.cache/fx-bundle/battlemap.js'
js=$(ssh -o ClearAllForwardings=yes home 'cat ~/.cache/fx-bundle/battlemap.js')
{
  print -r -- '<!doctype html><html data-theme="cozy"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
  # The stage column is the box: the board (`.battlemap`, at most 62% of it) sits at its top.
  print -r -- '<style>html,body{margin:0;padding:0;width:100%;height:100%;background:transparent!important;overflow:hidden}#root{display:flex;flex-direction:column}#root>div{flex:none;display:flex;flex-direction:column;max-height:62%}#root>div>.battlemap{max-height:100%}#root>div>.battlemap.expanded{max-height:88vh}</style>'
  print -r -- "</head><body><div id=\"root\"></div><script>$js</script></body></html>"
} > $out
echo "wrote $out ($(wc -c < $out) bytes)"

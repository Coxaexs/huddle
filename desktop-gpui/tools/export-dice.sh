#!/bin/zsh
# Builds resources/web/dice.html: the web's own <DiceOverlay> (components/dice-overlay.tsx, the 3D
# dice of dice-box-threejs, crit effects and sounds), bundled with esbuild on the home server; its
# assets and styles come from the Hoffle server the app is signed in to. The app lays it, click-
# through, over the chat panel or the voice stage (src/shell/dice.rs):
#   window.__roll(roll)   (a hub "dice-roll", or your own /roll's reply)
# and hears back through webkit.messageHandlers.hoffle: ready, done. Run again when the web's dice
# change.
set -e
here=${0:A:h}
out=$here/../resources/web/dice.html
mkdir -p ${out:h}
ssh -o ClearAllForwardings=yes home 'mkdir -p ~/.cache/fx-bundle && cat > ~/.cache/fx-bundle/dice-entry.tsx <<"JS"
import { createElement, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { DiceOverlay } from "/home/coxaexs/huddle/app/components/dice-overlay";

const post = (message: Record<string, unknown>) => {
  try {
    (window as any).webkit?.messageHandlers?.hoffle?.postMessage(JSON.stringify(message));
  } catch {
    /* not in the app */
  }
};
let show: (roll: any) => void = () => {};

function Bridge() {
  const [roll, setRoll] = useState<any>(null);
  show = setRoll;
  useEffect(() => post({ t: "ready" }), []);
  return createElement(DiceOverlay, {
    roll,
    onDone: () => {
      setRoll(null);
      post({ t: "done" });
    },
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
  });
(window as any).__roll = (roll: any) => show(roll);
window.addEventListener("error", (event) => post({ t: "error", message: String(event.message) }));
createRoot(document.getElementById("root")!).render(createElement(Bridge));
JS
cd ~/huddle && NODE_PATH=$HOME/huddle/node_modules node_modules/.bin/esbuild ~/.cache/fx-bundle/dice-entry.tsx --bundle --format=iife --target=es2020 --jsx=automatic --minify --define:process.env.NODE_ENV=\"production\" --tsconfig=tsconfig.json --loader:.png=dataurl --loader:.svg=dataurl --loader:.jpg=dataurl --log-level=error --outfile=$HOME/.cache/fx-bundle/dice.js'
js=$(ssh -o ClearAllForwardings=yes home 'cat ~/.cache/fx-bundle/dice.js')
{
  print -r -- '<!doctype html><html data-theme="cozy"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
  print -r -- '<style>html,body{margin:0;padding:0;width:100%;height:100%;background:transparent!important;overflow:hidden}#root{position:relative;width:100%;height:100%}</style>'
  print -r -- "</head><body><div id=\"root\"></div><script>$js</script></body></html>"
} > $out
echo "wrote $out ($(wc -c < $out) bytes)"

#!/bin/zsh
# Builds resources/web/profile-effect.html: the web's own <ProfileEffect> (components/cosmetics.tsx,
# its canvas and WebGL scenes, cosmetics.css) bundled with esbuild on the home server, for the
# transparent web view the profile card lays over itself (src/webview.rs). Run again when the web's
# effects change.
set -e
here=${0:A:h}
out=$here/../resources/web/profile-effect.html
mkdir -p ${out:h}
ssh -o ClearAllForwardings=yes home 'mkdir -p ~/.cache/fx-bundle && cat > ~/.cache/fx-bundle/effect-entry.tsx <<"JS"
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { ProfileEffect } from "/home/coxaexs/huddle/app/components/cosmetics";
import "/home/coxaexs/huddle/app/cosmetics.css";
const root = createRoot(document.getElementById("fx")!);
(globalThis as any).__showEffect = (id: string) => root.render(createElement(ProfileEffect, { id }));
JS
cd ~/huddle && NODE_PATH=$HOME/huddle/node_modules node_modules/.bin/esbuild ~/.cache/fx-bundle/effect-entry.tsx --bundle --format=iife --target=es2020 --jsx=automatic --minify --define:process.env.NODE_ENV=\"production\" --tsconfig=tsconfig.json --loader:.png=dataurl --loader:.svg=dataurl --loader:.woff2=empty --loader:.woff=empty --log-level=warning --outfile=$HOME/.cache/fx-bundle/effect.js'
css=$(ssh -o ClearAllForwardings=yes home 'cat ~/.cache/fx-bundle/effect.css')
js=$(ssh -o ClearAllForwardings=yes home 'cat ~/.cache/fx-bundle/effect.js')
{
  print -r -- '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
  print -r -- '<style>html,body{margin:0;padding:0;width:100%;height:100%;background:transparent;overflow:hidden}#fx{position:absolute;inset:0;overflow:hidden;border-radius:16px}</style>'
  print -r -- "<style>$css</style></head><body><div id=\"fx\"></div><script>$js</script></body></html>"
} > $out
echo "wrote $out ($(wc -c < $out) bytes)"

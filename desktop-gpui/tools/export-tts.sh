#!/bin/zsh
# Builds resources/web/tts.html: the web's own lib/tts/client.ts (Alania-2 Turkish through the
# server, the in-browser English models in their worker), bundled with esbuild on the home server,
# for the hidden web view that reads /tts messages aloud (src/webview.rs). The worker and its models
# load from the Hoffle server the app is signed in to. Run again when the web's TTS changes.
set -e
here=${0:A:h}
out=$here/../resources/web/tts.html
mkdir -p ${out:h}
ssh -o ClearAllForwardings=yes home 'mkdir -p ~/.cache/fx-bundle && cat > ~/.cache/fx-bundle/tts-entry.ts <<"JS"
import { clampTtsVoice, speakMessage, stopTtsPlayback } from "/home/coxaexs/huddle/app/lib/tts/client";
// What happened, newest last: the app reads it back in tests.
const log: string[] = ((globalThis as any).__ttsLog = []);
(globalThis as any).__speak = (text: string, lang: string, voice: unknown) =>
  speakMessage(text, lang === "tr" ? "tr" : "en", { onStart: () => log.push("start"), onEnd: () => log.push("end") }, clampTtsVoice(voice)).catch((error) => log.push("error: " + String(error)));
(globalThis as any).__stopTts = () => stopTtsPlayback();
JS
cd ~/huddle && NODE_PATH=$HOME/huddle/node_modules node_modules/.bin/esbuild ~/.cache/fx-bundle/tts-entry.ts --bundle --format=iife --target=es2020 --minify --define:process.env.NODE_ENV=\"production\" --tsconfig=tsconfig.json --log-level=warning --outfile=$HOME/.cache/fx-bundle/tts.js'
js=$(ssh -o ClearAllForwardings=yes home 'cat ~/.cache/fx-bundle/tts.js')
print -r -- "<!doctype html><html><head><meta charset=\"utf-8\"></head><body><script>$js</script></body></html>" > $out
echo "wrote $out ($(wc -c < $out) bytes)"

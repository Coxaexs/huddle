#!/bin/zsh
# Builds resources/web/pdf.html: the web's own PDF viewer (components/pdf/viewer.tsx: pdf.js pages,
# thumbnails, search, zoom, AcroForm filling, download and "send a copy"), bundled with esbuild on the
# home server with its own stylesheet (components/pdf/pdf-viewer.css, loaded lazily on the web so it
# is not among the page's links); the rest of the styles come from the server at run time, and pdf.js
# loads its worker, character maps and fonts from the server (`/pdf.worker.mjs`, `/pdfjs/…`).
# The app shows it in a web view over the whole window (src/shell/pdf_view.rs):
#   window.__open(url, name)
# and hears back through webkit.messageHandlers.hoffle: ready, close, copy and download (name, base64
# data: a web view saves no <a download> links itself).
# Run again when the web's viewer changes.
set -e
here=${0:A:h}
out=$here/../resources/web/pdf.html
mkdir -p ${out:h}
ssh -o ClearAllForwardings=yes home 'mkdir -p ~/.cache/fx-bundle && cat > ~/.cache/fx-bundle/pdf-entry.tsx <<"JS"
import { createElement, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { PdfViewer } from "/home/coxaexs/huddle/app/components/pdf/viewer";

const post = (message: Record<string, unknown>) => {
  try {
    (window as any).webkit?.messageHandlers?.hoffle?.postMessage(JSON.stringify(message));
  } catch {
    /* not in the app */
  }
};
let open: (file: { url: string; name: string } | null) => void = () => {};

function Bridge() {
  const [file, setFile] = useState<{ url: string; name: string } | null>(null);
  open = setFile;
  useEffect(() => post({ t: "ready" }), []);
  if (!file) return null;
  return createElement(PdfViewer, {
    key: file.url,
    url: file.url,
    name: file.name,
    onClose: () => {
      setFile(null);
      post({ t: "close" });
    },
    onSendCopy: async (copy: File) => {
      const bytes = new Uint8Array(await copy.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      post({ t: "copy", name: copy.name, data: btoa(binary) });
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
      document.head.insertBefore(link, document.head.firstChild);
    }
  })
  .catch(() => post({ t: "error", message: "stylesheet" }));
(window as any).__open = (url: string, name: string) => open({ url, name });
// A web view does not save <a download> links: the file goes to the app, which asks where. Both
// the links you click (Download original) and the ones the viewer clicks itself (the filled copy).
const hand = (link: HTMLAnchorElement) => {
  const name = link.download || "document.pdf";
  void fetch(link.href, { credentials: "include" })
    .then((response) => response.arrayBuffer())
    .then((buffer) => {
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      post({ t: "download", name, data: btoa(binary) });
    })
    .catch(() => post({ t: "error", message: "download" }));
};
const click = HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
  if (!this.hasAttribute("download")) return click.call(this);
  hand(this);
};
document.addEventListener(
  "click",
  (event) => {
    const link = (event.target as Element | null)?.closest?.("a[download]") as HTMLAnchorElement | null;
    if (!link) return;
    event.preventDefault();
    hand(link);
  },
  true,
);
window.addEventListener("error", (event) => post({ t: "error", message: String(event.message) }));
window.addEventListener("unhandledrejection", (event) => post({ t: "error", message: String((event as PromiseRejectionEvent).reason) }));
createRoot(document.getElementById("root")!).render(createElement(Bridge));
JS
cd ~/huddle && NODE_PATH=$HOME/huddle/node_modules node_modules/.bin/esbuild ~/.cache/fx-bundle/pdf-entry.tsx --bundle --format=iife --target=es2022 --jsx=automatic --minify --define:process.env.NODE_ENV=\"production\" --tsconfig=tsconfig.json --loader:.png=dataurl --loader:.svg=dataurl --log-level=error --outfile=$HOME/.cache/fx-bundle/pdf.js'
js=$(ssh -o ClearAllForwardings=yes home 'cat ~/.cache/fx-bundle/pdf.js')
css=$(ssh -o ClearAllForwardings=yes home 'cat ~/.cache/fx-bundle/pdf.css 2>/dev/null')
{
  print -r -- '<!doctype html><html data-theme="cozy"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
  print -r -- "<style>html,body{margin:0;padding:0;width:100%;height:100%;background:transparent!important;overflow:hidden}$css</style>"
  print -r -- "</head><body><div id=\"root\"></div><script>$js</script></body></html>"
} > $out
echo "wrote $out ($(wc -c < $out) bytes, css $(print -rn -- $css | wc -c))"

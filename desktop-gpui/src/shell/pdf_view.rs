//! The PDF viewer (components/pdf/viewer.tsx): opening a PDF attachment reads it in the app, in the
//! web's own viewer (pages, thumbnails, search, zoom, filling in forms, download, "send a copy"),
//! running in a web view over the whole window (resources/web/pdf.html, tools/export-pdf.sh).

use base64::Engine;
use gpui::{Context, Window};
use serde_json::Value;

use super::Shell;
use crate::webview::WebOverlay;

#[derive(Default)]
pub(super) struct PdfView {
    view: Option<WebOverlay>,
    ready: bool,
    /// The file to show once the page is ready, and whether the viewer is up.
    pending: Option<(String, String)>,
    open: bool,
}

impl Shell {
    /// setPdfViewer({ url, name }).
    pub(super) fn open_pdf(&mut self, url: String, name: String, cx: &mut Context<Self>) {
        self.pdf.pending = Some((url, name));
        self.pdf.open = true;
        cx.notify();
    }

    /// Each frame: make the page when needed, give it the file, hear it close or send a copy; and
    /// keep it over the window while open.
    pub(super) fn pdf_tick(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        // HOFFLE_DEV_PDF=<url>|<name>: that PDF opened once, when the app starts (tests).
        static DEV: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
        if let Ok(spec) = std::env::var("HOFFLE_DEV_PDF")
            && !DEV.swap(true, std::sync::atomic::Ordering::Relaxed)
            && let Some((url, name)) = spec.split_once('|')
        {
            self.open_pdf(url.to_string(), name.to_string(), cx);
        }
        if !self.pdf.open {
            if let Some(view) = &self.pdf.view {
                view.set_hidden(true);
            }
            return;
        }
        if self.pdf.view.is_none() {
            let base = self.client.base().to_string();
            let session = self.client.token().map(|t| (crate::api::SESSION_COOKIE.to_string(), t));
            self.pdf.view = crate::webview::page_view(window, "pdf", &base, session);
            if self.pdf.view.is_none() {
                // No web view here: the browser, as before.
                if let Some((url, _)) = self.pdf.pending.take() {
                    cx.open_url(&url);
                }
                self.pdf.open = false;
                return;
            }
        }
        let messages = self.pdf.view.as_ref().map(|v| v.messages()).unwrap_or_default();
        for raw in messages {
            let Ok(m) = serde_json::from_str::<Value>(&raw) else { continue };
            match m["t"].as_str().unwrap_or("") {
                "ready" => self.pdf.ready = true,
                "close" => {
                    self.pdf.open = false;
                    cx.notify();
                }
                "copy" => {
                    let name = m["name"].as_str().unwrap_or("filled.pdf").to_string();
                    if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(m["data"].as_str().unwrap_or("")) {
                        self.send_pdf_copy(name, bytes, cx);
                    }
                }
                "download" => {
                    let name = m["name"].as_str().unwrap_or("document.pdf").to_string();
                    if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(m["data"].as_str().unwrap_or("")) {
                        self.save_pdf(name, bytes, cx);
                    }
                }
                "error" => crate::trace(format!("pdf page: {}", m["message"])),
                _ => {}
            }
        }
        if let Some(view) = self.pdf.view.as_mut() {
            let (ww, wh) = view.parent_size();
            view.set_frame(0., 0., ww, wh);
            view.set_region(0., 0., ww, wh);
            view.set_hidden(false);
            if self.pdf.ready
                && let Some((url, name)) = self.pdf.pending.take()
            {
                view.eval(&format!("window.__open({}, {})", Value::from(url), Value::from(name)));
            }
        }
    }

    /// The viewer's download: asks where (Downloads first), then writes it.
    fn save_pdf(&mut self, name: String, bytes: Vec<u8>, cx: &mut Context<Self>) {
        let dir = dirs::download_dir().or_else(dirs::home_dir).unwrap_or_default();
        let picked = cx.prompt_for_new_path(&dir, Some(&name));
        cx.spawn(async move |this, cx| {
            let Some(path) = picked.await.ok().and_then(|r| r.ok()).flatten() else { return };
            let ok = std::fs::write(&path, &bytes).is_ok();
            this.update(cx, |this, cx| this.set_notice(if ok { format!("Saved {}", path.display()) } else { "Could not save the file.".into() }, cx)).ok();
        })
        .detach();
    }

    /// sendFileCopy(): the filled-in copy sent to the open channel on its own (whatever is
    /// waiting in the message box stays there).
    fn send_pdf_copy(&mut self, name: String, bytes: Vec<u8>, cx: &mut Context<Self>) {
        let Some(channel) = self.channel_id.clone() else { return };
        static N: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let n = N.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let dir = std::env::temp_dir().join("hoffle-pdf").join(format!("{}-{n}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let safe: String = name.chars().map(|c| if c == '/' || c == '\\' { '_' } else { c }).collect();
        let path = dir.join(&safe);
        if std::fs::write(&path, &bytes).is_err() {
            self.set_notice("Could not send the copy.", cx);
            return;
        }
        let waiting = std::mem::take(&mut self.pending_files);
        self.accept_paths(vec![path], cx);
        self.send_with_files(channel, String::new(), None, cx);
        self.pending_files = waiting;
        cx.notify();
    }
}

//! Files in messages and in the composer: MessageAttachmentFiles (components/message-file-card.tsx,
//! lib/upload-sniff.ts) and the staged attachments row above the composer, with the upload that
//! sends them (use-shell-messaging.ts sendMessage, lib/shrink-image.ts).

use std::path::PathBuf;

use gpui::{AnyElement, Context, FontWeight, Hsla, ObjectFit, SharedString, Window, div, prelude::*, px, rgb, rgba};

use super::Shell;
use crate::model::{FileRef, Message};
use crate::theme::Theme;
use crate::ui;

/// A file waiting in the composer.
#[derive(Clone)]
pub(super) struct Pending {
    pub path: PathBuf,
    /// The name it goes up under (SPOILER_ in front when marked as a spoiler).
    pub name: String,
    pub size: u64,
    pub image: bool,
    /// Its description (ALT), and "HD": sent as it is instead of made smaller.
    pub alt: Option<String>,
    pub original: bool,
}

/// lib/big-upload-key.ts NORMAL_UPLOAD_MAX_BYTES: bigger files go up in parts, for those allowed.
const NORMAL_UPLOAD_MAX_BYTES: u64 = 40 * 1024 * 1024;

/// Where a big upload's bytes come from: the file itself, or a picture made in memory.
enum BigSource {
    Path(PathBuf),
    Bytes(std::sync::Arc<Vec<u8>>),
}

impl BigSource {
    fn read(&self, from: u64, len: usize) -> anyhow::Result<Vec<u8>> {
        match self {
            BigSource::Path(path) => {
                use std::io::{Read, Seek, SeekFrom};
                let mut f = std::fs::File::open(path)?;
                f.seek(SeekFrom::Start(from))?;
                let mut buf = vec![0; len];
                f.read_exact(&mut buf)?;
                Ok(buf)
            }
            BigSource::Bytes(bytes) => Ok(bytes[from as usize..from as usize + len].to_vec()),
        }
    }
}

/// uploadBigFile(): start, each part PUT (retried a few times unless Hoffle itself refused it),
/// complete; an abort frees the budget when it fails. Progress shows in the notice line.
async fn upload_big(this: &gpui::WeakEntity<Shell>, cx: &mut gpui::AsyncApp, client: &crate::api::Client, source: BigSource, name: String, size: u64) -> anyhow::Result<String> {
    let c = client.clone();
    let n = name.clone();
    let start = cx.background_executor().spawn(async move { c.settings_post("/api/uploads/big", serde_json::json!({ "action": "start", "name": n, "size": size })) }).await?;
    let key = start["key"].as_str().unwrap_or_default().to_string();
    let part_bytes = start["partBytes"].as_u64().unwrap_or(size.max(1));
    let parts = start["parts"].as_u64().unwrap_or(1);
    let source = std::sync::Arc::new(source);
    let mut done = Vec::new();
    let mut finished: u64 = 0;
    let result: anyhow::Result<()> = async {
        for part in 1..=parts {
            let from = (part - 1) * part_bytes;
            let len = (size - from).min(part_bytes) as usize;
            let mut attempt = 1;
            loop {
                let (c, k, s) = (client.clone(), key.clone(), source.clone());
                let sent = cx
                    .background_executor()
                    .spawn(async move {
                        let bytes = s.read(from, len).map_err(|e| (0u16, e.to_string()))?;
                        c.big_part(&k, part as usize, &bytes)
                    })
                    .await;
                match sent {
                    Ok(etag) => {
                        done.push(serde_json::json!({ "partNumber": part, "etag": etag }));
                        break;
                    }
                    Err((code, message)) => {
                        // 4xx from Hoffle itself (expired, not allowed, bad part) won't get better.
                        if attempt >= 5 || ((400..500).contains(&code) && code != 408 && code != 429) {
                            anyhow::bail!(message);
                        }
                        cx.background_executor().timer(std::time::Duration::from_millis(2000 * attempt)).await;
                        attempt += 1;
                    }
                }
            }
            finished += len as u64;
            let pct = finished * 100 / size.max(1);
            let line = format!("Uploading {name}… {pct}% — keep this tab open.");
            this.update(cx, |this, cx| this.set_notice(line, cx)).ok();
        }
        let (c, k) = (client.clone(), key.clone());
        let parts = done.clone();
        cx.background_executor().spawn(async move { c.settings_post("/api/uploads/big", serde_json::json!({ "action": "complete", "key": k, "parts": parts })) }).await?;
        Ok(())
    }
    .await;
    if let Err(e) = result {
        let (c, k) = (client.clone(), key.clone());
        cx.background_executor().spawn(async move { c.settings_post("/api/uploads/big", serde_json::json!({ "action": "abort", "key": k })) }).detach();
        return Err(e);
    }
    this.update(cx, |this, cx| {
        this.notice = None;
        cx.notify();
    })
    .ok();
    Ok(key)
}

/// lib/big-upload-key.ts IMAGE_UPLOAD_MAX_BYTES: the most a picture may be, as it is.
const IMAGE_UPLOAD_MAX_BYTES: u64 = 8 * 1024 * 1024;

/// canShrink(): a JPEG, PNG or WebP of 400 kB or more.
fn can_shrink(file: &Pending) -> bool {
    matches!(file.path.extension().map(|e| e.to_string_lossy().to_lowercase()).as_deref(), Some("png" | "jpg" | "jpeg" | "webp")) && file.size >= 400_000
}

/// getFileExtensionBadge: the extension, upper case, at most four letters.
pub fn badge(name: &str) -> String {
    let ext = name.rsplit_once('.').map(|(_, e)| e).unwrap_or("FILE").to_uppercase();
    ext.chars().take(4).collect()
}

/// getFileBadgeColor's gradient (`.message-file-icon.file-badge-*`).
fn badge_colors(name: &str) -> (u32, u32, u32) {
    let ext = name.rsplit_once('.').map(|(_, e)| e.to_lowercase()).unwrap_or_default();
    let in_ = |list: &[&str]| list.contains(&ext.as_str());
    if ext == "pdf" {
        (0xee6658, 0xb93346, 0xb9334633)
    } else if in_(&["mp4", "webm", "mov", "m4v", "ogv", "mkv"]) || in_(&["jar", "apk", "js", "ts", "jsx", "tsx", "py", "rs", "go", "java", "c", "cpp", "h", "cs", "rb", "php", "sh", "sql"]) {
        if in_(&["mp4", "webm", "mov", "m4v", "ogv", "mkv"]) { (0xa855f7, 0x7c3aed, 0x7c3aed47) } else { (0x8b5cf6, 0x7c3aed, 0x7c3aed47) }
    } else if in_(&["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus"]) {
        (0x6366f1, 0x4f46e5, 0x4f46e547)
    } else if in_(&["pptx", "ppt", "key", "odp"]) {
        (0xf97316, 0xea580c, 0xea580c47)
    } else if in_(&["docx", "doc", "rtf", "odt", "pages"]) {
        (0x3b82f6, 0x2563eb, 0x2563eb47)
    } else if in_(&["xlsx", "xls", "csv", "numbers", "ods"]) {
        (0x10b981, 0x059669, 0x05966947)
    } else if in_(&["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz"]) {
        (0xf59e0b, 0xd97706, 0xd9770647)
    } else if in_(&["txt", "md", "markdown", "log", "yaml", "yml", "json", "toml", "ini", "env"]) {
        (0x06b6d4, 0x0891b2, 0x0891b247)
    } else {
        (0x64748b, 0x475569, 0x47556947)
    }
}

/// getFileDescription.
pub fn description(name: &str) -> &'static str {
    let ext = name.rsplit_once('.').map(|(_, e)| e.to_lowercase()).unwrap_or_default();
    match ext.as_str() {
        "mp4" | "webm" | "mov" | "m4v" | "ogv" | "mkv" => "Video · click to download",
        "mp3" | "wav" | "ogg" | "m4a" | "aac" | "flac" | "opus" => "Audio · click to download",
        "pptx" | "ppt" => "Presentation · click to download",
        "docx" | "doc" => "Word document · click to download",
        "xlsx" | "xls" => "Spreadsheet · click to download",
        "zip" => "ZIP archive · click to download",
        "rar" => "RAR archive · click to download",
        "7z" => "7-Zip archive · click to download",
        "jar" => "Java archive · click to download",
        "txt" => "Text document · click to download",
        "md" | "markdown" => "Markdown note · click to download",
        "csv" => "CSV data · click to download",
        "json" => "JSON file · click to download",
        _ => "File attachment · click to download",
    }
}

/// formatFileSize.
fn file_size(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{bytes} B")
    } else if bytes < 1024 * 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.)
    } else {
        format!("{:.1} MB", bytes as f64 / (1024. * 1024.))
    }
}

/// `.message-file-icon`: 42×46, the type's gradient, the extension in heavy 11px.
pub fn file_icon(name: &str) -> AnyElement {
    let (a, b, glow) = badge_colors(name);
    let label = if name.to_lowercase().ends_with(".pdf") { "PDF".to_string() } else { badge(name) };
    div()
        .flex_none()
        .w(px(42.))
        .h(px(46.))
        .rounded(px(9.))
        .bg(gpui::linear_gradient(145., gpui::linear_color_stop(rgb(a), 0.), gpui::linear_color_stop(rgb(b), 1.)))
        .shadow(vec![gpui::BoxShadow { color: rgba(glow).into(), offset: gpui::point(px(0.), px(6.)), blur_radius: px(14.), spread_radius: px(0.) }])
        .flex()
        .items_center()
        .justify_center()
        .text_size(px(11.))
        .line_height(px(16.5))
        .font_weight(FontWeight::BLACK)
        .text_color(gpui::white())
        .child(label)
        .into_any_element()
}

impl Shell {
    /// `.message-file-card`: icon, name and description, "Download"; opens the file.
    pub(super) fn render_file_card(&self, message: &Message, n: usize, file: &FileRef, cx: &mut Context<Self>) -> AnyElement {
        let link = self.client.absolute(&file.url);
        let pdf = file.name.to_lowercase().ends_with(".pdf");
        let muted: Hsla = Theme::muted().into();
        // isSpoilerFile(): covered until clicked.
        let key = format!("file:{}:{}", message.id, file.url);
        let spoiler = {
            let (name, url) = (file.name.to_lowercase(), file.url.to_lowercase());
            name.contains("spoiler_") || name.contains("spoiler-") || url.contains("spoiler_") || url.contains("spoiler-") || url.contains("?spoiler") || url.contains("&spoiler")
        };
        let ext = file.name.rsplit_once('.').map(|(_, e)| e.to_lowercase()).unwrap_or_default();
        let video = matches!(ext.as_str(), "mp4" | "webm" | "mov" | "m4v" | "ogv" | "mkv");
        let audio = matches!(ext.as_str(), "mp3" | "wav" | "ogg" | "m4a" | "aac" | "flac" | "opus");
        let shell = |id: String| {
            div()
                .id(SharedString::from(id))
                .relative()
                .mt(px(8.))
                .w(px(430.))
                .max_w_full()
                .p(px(12.))
                .rounded(px(12.))
                .bg(Theme::panel())
                .border_1()
                .border_color(Theme::line())
                .flex()
                .items_center()
                .gap(px(12.))
        };
        if spoiler && !self.revealed.contains(&key) {
            let clean = {
                let lower = file.name.to_lowercase();
                if lower.starts_with("spoiler_") || lower.starts_with("spoiler-") { file.name[8..].to_string() } else { file.name.clone() }
            };
            return shell(format!("file-{}-{n}", message.id))
                .cursor_pointer()
                .child(div().flex_none().size(px(40.)).rounded(px(10.)).bg(gpui::hsla(38. / 360., 0.92, 0.5, 0.2)).flex().items_center().justify_center().child(ui::icon("eye-off", 14., rgb(0xfcd34d))))
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .flex()
                        .flex_col()
                        .gap(px(3.))
                        .child(div().truncate().text_size(px(16.)).line_height(px(24.)).font_weight(FontWeight::BOLD).text_color(rgb(0xfde68a)).child(if video { "Spoiler Video" } else if audio { "Spoiler Audio" } else { "Spoiler Attachment" }))
                        .child(div().truncate().text_size(px(12.8)).line_height(px(19.2)).text_color(muted).child(format!("Hidden content · click to reveal {clean}"))),
                )
                .child(div().flex_none().text_size(px(12.)).line_height(px(18.)).font_weight(FontWeight::BOLD).text_color(rgb(0xfcd34d)).child("Reveal"))
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.revealed.insert(key.clone());
                    cx.notify();
                }))
                .into_any_element();
        }
        // Big temporary files (over 40 MB): a download with a countdown (tmp<expiry s>-<uuid>--name).
        let big_expiry = file.url.split("/api/uploads/").nth(1).and_then(|k| {
            let k = url::form_urlencoded::parse(format!("k={}", k.split(['?', '#']).next().unwrap_or_default()).as_bytes()).next().map(|(_, v)| v.to_string())?;
            let digits: String = k.strip_prefix("tmp")?.chars().take_while(|c| c.is_ascii_digit()).collect();
            (9..=11).contains(&digits.len()).then(|| digits.parse::<i64>().ok()).flatten().map(|s| s * 1000)
        });
        let (small, gone) = match big_expiry {
            Some(at) => {
                let left = at - chrono::Utc::now().timestamp_millis();
                if left <= 0 {
                    ("Deleted after 12 hours".to_string(), true)
                } else {
                    let minutes = (left as f64 / 60_000.).ceil() as i64;
                    (format!("Big file · deleted in {}", if minutes < 60 { format!("{minutes} min") } else { format!("{} h", (minutes as f64 / 60.).round() as i64) }), false)
                }
            }
            None => ((if pdf { "PDF document · view and fill in Hoffle" } else { description(&file.name) }).to_string(), false),
        };
        let pdf = pdf && big_expiry.is_none();
        div()
            .id(SharedString::from(format!("file-{}-{n}", message.id)))
            .mt(px(8.))
            .w(px(430.))
            .max_w_full()
            .p(px(12.))
            .rounded(px(12.))
            .bg(Theme::panel())
            .border_1()
            .border_color(Theme::line())
            .flex()
            .items_center()
            .gap(px(12.))
            .cursor_pointer()
            .hover(|s| s.border_color(crate::theme::mix(Theme::coral(), 0.6, Theme::line())))
            // The coral wash from the top-left corner.
            .child(
                div().absolute().inset_0().rounded(px(12.)).bg(gpui::linear_gradient(
                    135.,
                    gpui::linear_color_stop(Hsla::from(Theme::coral()).opacity(0.09), 0.),
                    gpui::linear_color_stop(gpui::transparent_black(), 0.55),
                )),
            )
            .relative()
            .child(file_icon(&file.name))
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .flex_col()
                    .gap(px(3.))
                    .child(div().truncate().text_size(px(16.)).line_height(px(24.)).font_weight(FontWeight::BOLD).text_color(Theme::ink()).child(file.name.clone()))
                    .child(div().text_size(px(12.8)).line_height(px(19.2)).text_color(muted).child(small)),
            )
            .when(!gone, |d| d.child(div().flex_none().text_size(px(12.)).line_height(px(18.)).font_weight(FontWeight::BOLD).text_color(muted).child(if pdf { "Open" } else { "Download" })))
            .when(gone, |d| d.opacity(0.6))
            .when(!gone, |d| d.on_click(move |_, _, cx| cx.open_url(&link)))
            .into_any_element()
    }

    /// A message's picture (`.single-image-wrap .single-attachment`): its own size, no wider than
    /// the text column or 480 and no taller than 380, 10px corners, 8px above. The wrap around it is
    /// as wide as the column allows (clicks there open it too, and its description spans it).
    pub(super) fn render_image(&self, message: &Message, n: usize, url: &str, column: f32, window: &mut Window, cx: &mut Context<Self>) -> AnyElement {
        let link = self.client.absolute(url);
        let resource = gpui::Resource::Uri(link.clone().into());
        let wrap = column.min(480.);
        let size = ui::image_size(&resource, window, cx);
        let (width, height) = match size {
            Some((w, h)) if w > 0. && h > 0. => {
                let mut width = w.min(wrap);
                let mut height = width * h / w;
                if height > 380. {
                    height = 380.;
                    width = 380. * w / h;
                }
                (width, height)
            }
            _ => (wrap, wrap * 0.6),
        };
        if size.is_some() && self.sized.borrow_mut().insert(format!("{}-{n}", message.id)) {
            // The row was measured with a guess; measure it again now that the picture is here.
            let id = message.id.clone();
            cx.defer_in(window, move |this, _, cx| {
                this.refresh_message(&id);
                cx.notify();
            });
        }
        let all = vec![link.clone()];
        div()
            .mt(px(8.))
            .w(px(wrap))
            .h(px(height))
            .child(self.gallery_tile(&message.id, n, &link, all, 0, wrap, height, Some(width), cx))
            .into_any_element()
    }

    /// The description sent with this picture of this message (message.imageAlts, by URL).
    fn image_alt(&self, message: &str, link: &str) -> Option<String> {
        let list = self.channel_id.as_ref().and_then(|c| self.messages.get(c))?;
        let m = list.iter().rev().find(|m| m.id == message)?;
        m.image_alts.iter().find(|(url, _)| self.client.absolute(url) == link).map(|(_, alt)| alt.clone()).filter(|a| !a.is_empty())
    }

    /// isSpoilerUrl(): `spoiler_` / `spoiler-` in the name, `?spoiler`, or `#spoiler`.
    fn is_spoiler_url(src: &str) -> bool {
        let s = src.to_lowercase();
        s.contains("spoiler_") || s.contains("spoiler-") || s.contains("?spoiler") || s.contains("&spoiler") || s.contains("#spoiler")
    }

    /// One picture of a message: opens the lightbox; a spoiler stays covered until clicked.
    #[allow(clippy::too_many_arguments)]
    /// `picture`: a lone picture's own width inside a wider tile (drawn at its left, 10px corners).
    fn gallery_tile(&self, message: &str, n: usize, link: &str, all: Vec<String>, index: usize, w: f32, h: f32, picture: Option<f32>, cx: &mut Context<Self>) -> AnyElement {
        let resource = gpui::Resource::Uri(link.to_string().into());
        let key = format!("img:{message}:{link}");
        let spoiler = Self::is_spoiler_url(link);
        let shielded = spoiler && !self.revealed.contains(&key);
        let k = key.clone();
        // In a gallery each picture keeps `.message-image`'s 10px corners and its 1px edge.
        let framed = all.len() > 1;
        let mut tile = div()
            .id(SharedString::from(format!("img-{message}-{n}")))
            .relative()
            .w(px(w))
            .h(px(h))
            .when(picture.is_none(), |d| d.overflow_hidden())
            .when(framed, |d| d.rounded(px(10.)).border_1().border_color(rgb(0xe0d9d2)))
            .cursor_pointer()
            .group(SharedString::from(format!("tile-{message}-{n}")))
            .map(|d| match picture {
                Some(pw) => d.child(
                    div().w(px(pw)).h(px(h)).child(gpui::img(ui::cover(resource, pw / h.max(1.))).w(px(pw)).h(px(h)).rounded(px(10.)).object_fit(ObjectFit::Cover).with_loading(|| div().into_any_element())),
                ),
                None => d.child(gpui::img(ui::cover(resource, w / h.max(1.))).w(px(w)).h(px(h)).object_fit(ObjectFit::Cover).with_loading(|| div().into_any_element())),
            })
            .on_click(cx.listener(move |this, _, _, cx| {
                if shielded {
                    this.revealed.insert(k.clone());
                } else {
                    this.lightbox = Some((all.clone(), index));
                }
                cx.notify();
            }));
        if shielded {
            // A blur would hide it on the web; gpui draws no blurred pictures, so it is covered.
            tile = tile.child(
                div()
                    .absolute()
                    .inset_0()
                    .bg(gpui::black().opacity(0.88))
                    .flex()
                    .items_center()
                    .justify_center()
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(6.))
                            .px(px(12.))
                            .py(px(6.))
                            .rounded_full()
                            .bg(gpui::black().opacity(0.8))
                            .border_1()
                            .border_color(gpui::white().opacity(0.25))
                            .text_size(px(12.))
                            .font_weight(gpui::FontWeight::SEMIBOLD)
                            .text_color(gpui::white())
                            .child(ui::icon("eye-off", 13., gpui::white().opacity(0.8)))
                            .child("SPOILER"),
                    ),
            );
        } else if spoiler {
            let k = key.clone();
            let group = SharedString::from(format!("tile-{message}-{n}"));
            tile = tile.child(
                div()
                    .id(SharedString::from(format!("img-hide-{message}-{n}")))
                    .absolute()
                    .top(px(8.))
                    .right(px(8.))
                    .p(px(6.))
                    .rounded(px(6.))
                    .bg(gpui::black().opacity(0.7))
                    .opacity(0.)
                    .group_hover(group, |s| s.opacity(1.))
                    .child(ui::icon("eye-off", 13., gpui::white()))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        cx.stop_propagation();
                        this.revealed.remove(&k);
                        cx.notify();
                    })),
            );
        }
        // `.image-alt-badge`: the picture has a description; clicking shows it over the picture.
        if let Some(alt) = self.image_alt(message, link).filter(|_| !shielded) {
            let shown = self.shown_alt.as_deref() == Some(key.as_str());
            let k = key.clone();
            tile = tile
                .child(
                    div()
                        .id(SharedString::from(format!("img-alt-{message}-{n}")))
                        .absolute()
                        .top(px(6.))
                        .left(px(6.))
                        .px(px(5.))
                        .py(px(3.))
                        .rounded(px(4.))
                        .bg(gpui::black().opacity(0.65))
                        .font_family(".SystemUIFont")
                        .text_size(px(9.))
                        .line_height(px(9.))
                        .font_weight(FontWeight::EXTRA_BOLD)
                        .text_color(gpui::white().opacity(0.8))
                        .cursor_pointer()
                        .child("ALT")
                        .on_click(cx.listener(move |this, _, _, cx| {
                            cx.stop_propagation();
                            this.shown_alt = if this.shown_alt.as_deref() == Some(k.as_str()) { None } else { Some(k.clone()) };
                            cx.notify();
                        })),
                )
                .when(shown, |d| {
                    d.child(
                        div()
                            .id(SharedString::from(format!("img-alt-text-{message}-{n}")))
                            .absolute()
                            .top(px(28.))
                            .left(px(6.))
                            .right(px(6.))
                            .max_h(px(h * 0.6))
                            .overflow_y_scroll()
                            .px(px(10.))
                            .py(px(8.))
                            .rounded(px(8.))
                            .bg(gpui::black().opacity(0.82))
                            .text_size(px(13.))
                            .line_height(px(18.2))
                            .text_color(gpui::white())
                            .cursor_default()
                            .child(alt)
                            .on_click(|_, _, cx| cx.stop_propagation()),
                    )
                });
        }
        tile.into_any_element()
    }

    /// ImageGallery for two or more pictures: two side by side, one large beside two stacked, or a
    /// 2×2 grid with "+N" on the fourth; rows as tall as their tallest picture, within the caps.
    pub(super) fn render_gallery(&self, message: &Message, urls: &[String], column: f32, window: &mut Window, cx: &mut Context<Self>) -> AnyElement {
        let links: Vec<String> = urls.iter().map(|u| self.client.absolute(u)).collect();
        let width = column.min(520.);
        let natural = |link: &str, w: f32, window: &mut Window, cx: &mut Context<Self>| -> Option<f32> {
            ui::image_size(&gpui::Resource::Uri(link.to_string().into()), window, cx).filter(|(nw, _)| *nw > 0.).map(|(nw, nh)| w * nh / nw)
        };
        let mut loaded = true;
        let mut tallest = |list: &[(usize, f32)], window: &mut Window, cx: &mut Context<Self>| -> f32 {
            let mut best: f32 = 0.;
            for (i, w) in list {
                match natural(&links[*i], *w, window, cx) {
                    Some(h) => best = best.max(h),
                    None => loaded = false,
                }
            }
            if best == 0. { list.first().map(|l| l.1 * 0.75).unwrap_or(150.) } else { best }
        };
        let id = message.id.clone();
        let mut grid = div().mt(px(6.)).w(px(width)).rounded(px(10.)).overflow_hidden().flex().gap(px(4.));
        let inner = width;
        match links.len() {
            2 => {
                let w = (inner - 4.) / 2.;
                let h = tallest(&[(0, w), (1, w)], window, cx).min(260.);
                for i in 0..2 {
                    grid = grid.child(self.gallery_tile(&id, i, &links[i], links.clone(), i, w, h, None, cx));
                }
            }
            3 => {
                let w1 = (inner - 4.) * 1.4 / 2.4;
                let w2 = inner - 4. - w1;
                let big = tallest(&[(0, w1)], window, cx);
                let small = tallest(&[(1, w2)], window, cx) + tallest(&[(2, w2)], window, cx) + 4.;
                let h = big.max(small).min(280.);
                let half = (h - 4.) / 2.;
                grid = grid
                    .child(self.gallery_tile(&id, 0, &links[0], links.clone(), 0, w1, h, None, cx))
                    .child(div().flex().flex_col().gap(px(4.)).child(self.gallery_tile(&id, 1, &links[1], links.clone(), 1, w2, half, None, cx)).child(self.gallery_tile(&id, 2, &links[2], links.clone(), 2, w2, half, None, cx)));
            }
            _ => {
                let w = (inner - 4.) / 2.;
                let row = tallest(&[(0, w), (1, w), (2, w), (3, w)], window, cx).min((340. - 4.) / 2.);
                let more = links.len() - 4;
                let mut column_box = div().flex().flex_col().gap(px(4.));
                for r in 0..2 {
                    let mut line = div().flex().gap(px(4.));
                    for c in 0..2 {
                        let i = r * 2 + c;
                        let mut tile = div().relative().child(self.gallery_tile(&id, i, &links[i], links.clone(), i, w, row, None, cx));
                        if i == 3 && more > 0 {
                            tile = tile.child(div().absolute().inset_0().bg(gpui::black().opacity(0.65)).flex().items_center().justify_center().text_size(px(24.)).font_weight(gpui::FontWeight::BOLD).text_color(gpui::white()).child(format!("+{}", more + 1)));
                        }
                        line = line.child(tile);
                    }
                    column_box = column_box.child(line);
                }
                grid = grid.child(column_box);
            }
        }
        if loaded && self.sized.borrow_mut().insert(format!("{}-gallery", message.id)) {
            let id = message.id.clone();
            cx.defer_in(window, move |this, _, cx| {
                this.refresh_message(&id);
                cx.notify();
            });
        }
        grid.into_any_element()
    }

    /// The lightbox: the picture as big as fits, ‹ › and "n / N" for several, Open original.
    pub(super) fn render_lightbox(&self, window: &mut Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let (images, index) = self.lightbox.as_ref()?;
        let link = images.get(*index)?.clone();
        let count = images.len();
        let vw = f32::from(window.viewport_size().width);
        let vh = f32::from(window.viewport_size().height);
        // `max-width: 90vw; max-height: 85vh; object-fit: contain` at the picture's own size.
        let (nw, nh) = ui::image_size(&gpui::Resource::Uri(link.clone().into()), window, cx).unwrap_or((0., 0.));
        let scale = if nw > 0. && nh > 0. { (vw * 0.9 / nw).min(vh * 0.85 / nh).min(1.) } else { 0. };
        let (fw, fh) = (nw * scale, nh * scale);
        let round = |id: &'static str, size: f32, text: &'static str, font: f32| {
            div()
                .id(id)
                .size(px(size))
                .rounded_full()
                .bg(gpui::white().opacity(0.14))
                .hover(|s| s.bg(gpui::white().opacity(0.25)))
                .flex()
                .items_center()
                .justify_center()
                .text_size(px(font))
                .text_color(gpui::white())
                .cursor_pointer()
                .child(text)
        };
        let open = link.clone();
        let mut layer = div()
            .id("lightbox")
            .absolute()
            .inset_0()
            .bg(gpui::black().opacity(0.88))
            .p(px(50.))
            .flex()
            .items_center()
            .justify_center()
            .on_mouse_down(gpui::MouseButton::Left, cx.listener(|this, _, _, cx| {
                this.lightbox = None;
                cx.notify();
            }))
            .child(
                div()
                    .max_w(px(vw * 0.9))
                    .max_h(px(vh * 0.85))
                    .rounded(px(8.))
                    .overflow_hidden()
                    .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.6), offset: gpui::point(px(0.), px(10.)), blur_radius: px(40.), spread_radius: px(0.) }])
                    .on_mouse_down(gpui::MouseButton::Left, |_, _, cx| cx.stop_propagation())
                    .child(gpui::img(link.clone()).w(px(fw)).h(px(fh)).object_fit(ObjectFit::Contain)),
            )
            .child(div().absolute().top(px(18.)).right(px(24.)).child(round("lb-close", 44., "×", 26.).on_click(cx.listener(|this, _, _, cx| {
                this.lightbox = None;
                cx.notify();
            }))));
        if count > 1 {
            let step = |this: &mut Shell, by: isize, cx: &mut Context<Shell>| {
                if let Some((list, i)) = this.lightbox.as_mut() {
                    *i = ((*i as isize + by).rem_euclid(list.len() as isize)) as usize;
                }
                cx.notify();
            };
            layer = layer
                .child(div().absolute().left(px(24.)).top_0().bottom_0().flex().items_center().child(round("lb-prev", 52., "‹", 28.).on_mouse_down(gpui::MouseButton::Left, |_, _, cx| cx.stop_propagation()).on_click(cx.listener(move |this, _, _, cx| step(this, -1, cx)))))
                .child(div().absolute().right(px(24.)).top_0().bottom_0().flex().items_center().child(round("lb-next", 52., "›", 28.).on_mouse_down(gpui::MouseButton::Left, |_, _, cx| cx.stop_propagation()).on_click(cx.listener(move |this, _, _, cx| step(this, 1, cx)))))
                .child(div().absolute().bottom(px(24.)).left(px(32.)).px(px(12.)).py(px(4.)).rounded_full().bg(gpui::black().opacity(0.4)).border_1().border_color(gpui::white().opacity(0.15)).text_size(px(13.)).font_weight(gpui::FontWeight::SEMIBOLD).text_color(gpui::white().opacity(0.85)).child(format!("{} / {}", index + 1, count)));
        }
        layer = layer.child(
            div()
                .id("lb-open")
                .absolute()
                .bottom(px(22.))
                .right(px(32.))
                .px(px(18.))
                .py(px(8.))
                .rounded_full()
                .bg(gpui::white().opacity(0.16))
                .hover(|s| s.bg(gpui::white().opacity(0.28)))
                .text_size(px(13.))
                .font_weight(gpui::FontWeight::MEDIUM)
                .text_color(gpui::white())
                .cursor_pointer()
                .child("Open original ↗")
                .on_mouse_down(gpui::MouseButton::Left, |_, _, cx| cx.stop_propagation())
                .on_click(move |_, _, cx| cx.open_url(&open)),
        );
        Some(layer.into_any_element())
    }

    /// The "+" button: pick files to send.
    pub(super) fn pick_files(&mut self, cx: &mut Context<Self>) {
        let picked = cx.prompt_for_paths(gpui::PathPromptOptions { files: true, directories: false, multiple: true, prompt: None });
        cx.spawn(async move |this, cx| {
            let Ok(Ok(Some(paths))) = picked.await else { return };
            this.update(cx, |this, cx| this.accept_paths(paths, cx)).ok();
        })
        .detach();
    }

    /// acceptAttachment(): shared by the "+", a drop and a paste. No HTML; 40 MB each; 10 at most.
    pub(super) fn accept_paths(&mut self, paths: Vec<PathBuf>, cx: &mut Context<Self>) {
        const MAX: usize = 10;
        for path in paths {
            if path.is_dir() {
                continue;
            }
            let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            let lower = name.to_lowercase();
            if lower.ends_with(".html") || lower.ends_with(".htm") {
                self.set_notice("For security, HTML files cannot be attached.", cx);
                continue;
            }
            let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            if size > NORMAL_UPLOAD_MAX_BYTES {
                // Up to 2 GB for people an admin picked; deleted 12 hours after sending.
                let client = self.client.clone();
                cx.spawn(async move |this, cx| {
                    let status = cx.background_executor().spawn(async move { client.get_value("/api/uploads/big") }).await;
                    this.update(cx, |this, cx| match status {
                        Ok(big) if big["allowed"] == true => {
                            if size > big["maxBytes"].as_u64().unwrap_or(0) {
                                this.set_notice(format!("{name} is larger than 2 GB."), cx);
                            } else if this.pending_files.len() < MAX {
                                this.pending_files.push(Pending { path, name: name.clone(), size, image: false, alt: None, original: false });
                                this.set_notice(format!("{name} is a big file: it is deleted 12 hours after you send it."), cx);
                            }
                        }
                        _ => this.set_notice(format!("{name} is larger than 40 MB."), cx),
                    })
                    .ok();
                })
                .detach();
                continue;
            }
            let image = matches!(
                path.extension().map(|e| e.to_string_lossy().to_lowercase()).as_deref(),
                Some("png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "avif" | "heic")
            );
            if self.pending_files.len() < MAX {
                self.pending_files.push(Pending { path, name, size, image, alt: None, original: false });
            }
        }
        cx.notify();
    }

    /// Pasting a screenshot attaches it instead of doing nothing (kept in a temporary file until sent).
    pub(super) fn accept_pasted_image(&mut self, image: gpui::Image, cx: &mut Context<Self>) {
        let ext = match image.format {
            gpui::ImageFormat::Jpeg => "jpg",
            gpui::ImageFormat::Gif => "gif",
            gpui::ImageFormat::Webp => "webp",
            gpui::ImageFormat::Bmp => "bmp",
            gpui::ImageFormat::Tiff => "tiff",
            gpui::ImageFormat::Svg => "svg",
            _ => "png",
        };
        static N: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let dir = std::env::temp_dir().join("hoffle-paste");
        let _ = std::fs::create_dir_all(&dir);
        let n = N.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let path = dir.join(format!("{}-{n}", std::process::id())).join(format!("image.{ext}"));
        let _ = std::fs::create_dir_all(path.parent().unwrap_or(&dir));
        if std::fs::write(&path, &image.bytes).is_ok() {
            self.accept_paths(vec![path], cx);
        }
    }

    /// `.attachment-row`: pictures as 90×70 thumbnails, other files as a tile with their badge; each
    /// with a × to take it out again.
    pub(super) fn render_staged(&self, cx: &mut Context<Self>) -> Option<AnyElement> {
        if self.pending_files.is_empty() {
            return None;
        }
        let remove = |ix: usize, cx: &mut Context<Self>| {
            div()
                .id(SharedString::from(format!("unstage-{ix}")))
                .absolute()
                .top(px(-3.))
                .right(px(-3.))
                .size(px(22.))
                .rounded_full()
                .bg(rgb(0x34343d))
                .border_2()
                .border_color(rgb(0x16131f))
                .flex()
                .items_center()
                .justify_center()
                .text_size(px(12.))
                .line_height(px(16.))
                .text_color(gpui::white())
                .cursor_pointer()
                .child("×")
                .on_click(cx.listener(move |this, _, _, cx| {
                    if ix < this.pending_files.len() {
                        this.pending_files.remove(ix);
                        cx.notify();
                    }
                }))
        };
        let mut row = div().flex().flex_wrap().gap(px(8.)).mb(px(8.));
        for (ix, file) in self.pending_files.iter().enumerate() {
            row = row.child(if file.image {
                div()
                    .relative()
                    .w(px(90.))
                    .h(px(70.))
                    .child(
                        gpui::img(ui::cover(gpui::Resource::Path(file.path.clone().into()), 90. / 70.))
                            .size_full()
                            .rounded(px(10.))
                            .object_fit(ObjectFit::Cover),
                    )
                    // `.attachment-image-options`: ALT (describe it) and, for a picture that would be
                    // made smaller, HD (send the original).
                    .child({
                        let chip = |id: String, label: &'static str, active: bool| {
                            div()
                                .id(SharedString::from(id))
                                .px(px(5.))
                                .py(px(3.))
                                .rounded(px(4.))
                                .bg(if active { gpui::Hsla::from(Theme::lavender()) } else { gpui::Hsla::from(rgba(0x000000a6)) })
                                .font_family(".SystemUIFont")
                                .text_size(px(9.))
                                .line_height(px(9.))
                                .font_weight(FontWeight::EXTRA_BOLD)
                                .text_color(if active { gpui::Hsla::from(rgba(0x111111ff)) } else { gpui::Hsla::from(rgba(0xffffffcc)) })
                                .cursor_pointer()
                                .child(label)
                        };
                        let alt_tip = match &file.alt {
                            Some(alt) => crate::i18n::tv("composer.imageDescriptionTooltip", &[("alt", alt)]),
                            None => crate::i18n::t("composer.imageDescriptionAddTooltip"),
                        };
                        let current = file.alt.clone().unwrap_or_default();
                        let hd = can_shrink(file) && file.size <= IMAGE_UPLOAD_MAX_BYTES;
                        let original = file.original;
                        div()
                            .absolute()
                            .left(px(4.))
                            .bottom(px(4.))
                            .flex()
                            .gap(px(3.))
                            .child(chip(format!("staged-alt-{ix}"), "ALT", file.alt.is_some()).tooltip(ui::tooltip(alt_tip)).on_click(cx.listener(move |this, _, window, cx| {
                                this.open_prompt(
                                    super::channel_tools::PromptKind::ImageAlt(ix),
                                    crate::i18n::t("composer.describeImage"),
                                    crate::i18n::t("composer.describeImageA11y"),
                                    current.clone(),
                                    &crate::i18n::t("composer.imageDescriptionPlaceholder"),
                                    &crate::i18n::t("common.save"),
                                    Some(1000),
                                    window,
                                    cx,
                                );
                            })))
                            .when(hd, |d| {
                                d.child(chip(format!("staged-hd-{ix}"), "HD", original).tooltip(ui::tooltip(crate::i18n::t(if original { "composer.hdOn" } else { "composer.hdOff" }))).on_click(cx.listener(move |this, _, _, cx| {
                                    if let Some(f) = this.pending_files.get_mut(ix) {
                                        f.original = !f.original;
                                        cx.notify();
                                    }
                                })))
                            })
                    })
                    .child(remove(ix, cx))
                    .into_any_element()
            } else {
                div()
                    .relative()
                    .w(px(420.))
                    .min_h(px(66.))
                    .pl(px(10.))
                    .pr(px(42.))
                    .py(px(9.))
                    .flex()
                    .items_center()
                    .child(file_icon(&file.name))
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .flex()
                            .flex_col()
                            .gap(px(3.))
                            .child(div().truncate().text_size(px(16.)).line_height(px(24.)).font_weight(FontWeight::BOLD).text_color(Theme::ink()).child(file.name.clone()))
                            .child(div().text_size(px(12.8)).line_height(px(19.2)).text_color(Theme::muted()).child(file_size(file.size))),
                    )
                    .child(remove(ix, cx))
                    .into_any_element()
            });
        }
        Some(row.into_any_element())
    }

    /// Uploads every staged file (pictures made smaller first), then sends one message with them.
    pub(super) fn send_with_files(&mut self, channel: String, text: String, reply: Option<String>, cx: &mut Context<Self>) {
        let files: Vec<Pending> = std::mem::take(&mut self.pending_files);
        let client = self.client.clone();
        self.notice = None;
        cx.spawn(async move |this, cx| {
            let result: anyhow::Result<Message> = async {
                let mut keys = Vec::new();
                let mut alts = serde_json::Map::new();
                for file in files {
                    // Small enough (once a picture is made smaller): one upload. Else in parts.
                    let key = if file.size > NORMAL_UPLOAD_MAX_BYTES && !can_shrink(&file) {
                        upload_big(&this, cx, &client, BigSource::Path(file.path.clone()), file.name.clone(), file.size).await?
                    } else {
                        let (c, f) = (client.clone(), file.clone());
                        let prepared = cx.background_executor().spawn(async move { prepare(&f) }).await?;
                        let (name, mime, bytes) = prepared;
                        if bytes.len() as u64 > NORMAL_UPLOAD_MAX_BYTES {
                            let size = bytes.len() as u64;
                            upload_big(&this, cx, &client, BigSource::Bytes(std::sync::Arc::new(bytes)), name, size).await?
                        } else {
                            cx.background_executor().spawn(async move { c.upload(&name, &mime, &bytes) }).await?
                        }
                    };
                    // Descriptions go by upload key; the server keeps them by picture URL.
                    if let Some(alt) = &file.alt {
                        alts.insert(key.clone(), alt.clone().into());
                    }
                    keys.push(key);
                }
                let payload = (!alts.is_empty()).then(|| serde_json::json!({ "imageAlts": alts }));
                let c = client.clone();
                let message = cx.background_executor().spawn(async move { c.send_with_files(&channel, text.trim(), reply.as_deref(), &keys, payload) }).await?;
                Ok(message)
            }
            .await;
            this.update(cx, |this, cx| match result {
                Ok(message) => this.add_message(message, cx),
                Err(e) => this.set_notice(e.to_string(), cx),
            })
            .ok();
        })
        .detach();
        cx.notify();
    }
}

/// shrinkImage: a JPEG, PNG or WebP of 400 kB or more goes out at most 2560px on its long edge,
/// re-encoded (JPEG at 85, PNG as WebP), unless that comes out no smaller.
fn prepare(file: &Pending) -> anyhow::Result<(String, String, Vec<u8>)> {
    let bytes = std::fs::read(&file.path)?;
    let ext = file.path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "heic" => "image/heic",
        "pdf" => "application/pdf",
        "txt" => "text/plain",
        "mp4" => "video/mp4",
        "mp3" => "audio/mpeg",
        _ => "application/octet-stream",
    };
    if !file.original && matches!(mime, "image/png" | "image/jpeg" | "image/webp") && bytes.len() >= 400_000
        && let Ok(picture) = image::load_from_memory(&bytes)
    {
        let edge = picture.width().max(picture.height()) as f32;
        let picture = if edge > 2560. { picture.resize(((picture.width() as f32) * 2560. / edge) as u32, ((picture.height() as f32) * 2560. / edge) as u32, image::imageops::FilterType::Lanczos3) } else { picture };
        let mut out = std::io::Cursor::new(Vec::new());
        let (encoded, new_mime, new_ext) = if mime == "image/png" {
            (picture.write_to(&mut out, image::ImageFormat::WebP).is_ok(), "image/webp", "webp")
        } else {
            let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 85);
            (picture.to_rgb8().write_with_encoder(encoder).is_ok(), "image/jpeg", "jpg")
        };
        let out = out.into_inner();
        if encoded && out.len() < bytes.len() {
            let stem = file.name.rsplit_once('.').map(|(s, _)| s).unwrap_or(&file.name);
            return Ok((format!("{stem}.{new_ext}"), new_mime.into(), out));
        }
    }
    Ok((file.name.clone(), mime.into(), bytes))
}

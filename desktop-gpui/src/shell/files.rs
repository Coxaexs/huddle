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
pub(super) struct Pending {
    pub path: PathBuf,
    pub name: String,
    pub size: u64,
    pub image: bool,
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
    pub(super) fn render_file_card(&self, message: &Message, n: usize, file: &FileRef) -> AnyElement {
        let link = self.client.absolute(&file.url);
        let pdf = file.name.to_lowercase().ends_with(".pdf");
        let small = if pdf { "PDF document · view and fill in Hoffle" } else { description(&file.name) };
        let muted: Hsla = Theme::muted().into();
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
            .child(div().flex_none().text_size(px(12.)).line_height(px(18.)).font_weight(FontWeight::BOLD).text_color(muted).child(if pdf { "Open" } else { "Download" }))
            .on_click(move |_, _, cx| cx.open_url(&link))
            .into_any_element()
    }

    /// A message's picture: as wide as the text column (480 at most), as tall as its shape says
    /// (380 at most, filled), 10px corners, 8px above.
    pub(super) fn render_image(&self, message: &Message, n: usize, url: &str, column: f32, window: &mut Window, cx: &mut Context<Self>) -> AnyElement {
        let link = self.client.absolute(url);
        let resource = gpui::Resource::Uri(link.clone().into());
        let width = column.min(480.);
        let size = ui::image_size(&resource, window, cx);
        let height = match size {
            Some((w, h)) if w > 0. => (width * h / w).min(380.),
            _ => width * 0.6,
        };
        if size.is_some() && self.sized.borrow_mut().insert(format!("{}-{n}", message.id)) {
            // The row was measured with a guess; measure it again now that the picture is here.
            let id = message.id.clone();
            cx.defer_in(window, move |this, _, cx| {
                this.refresh_message(&id);
                cx.notify();
            });
        }
        let open = link.clone();
        div()
            .id(SharedString::from(format!("img-{}-{n}", message.id)))
            .mt(px(8.))
            .w(px(width))
            .h(px(height))
            .cursor_pointer()
            .child(
                gpui::img(ui::cover(resource, width / height.max(1.)))
                    .w(px(width))
                    .h(px(height))
                    .rounded(px(10.))
                    .object_fit(ObjectFit::Cover)
                    .with_loading(|| div().into_any_element()),
            )
            .on_click(move |_, _, cx| cx.open_url(&open))
            .into_any_element()
    }

    /// The "+" button: pick files to send.
    pub(super) fn pick_files(&mut self, cx: &mut Context<Self>) {
        let picked = cx.prompt_for_paths(gpui::PathPromptOptions { files: true, directories: false, multiple: true, prompt: None });
        cx.spawn(async move |this, cx| {
            let Ok(Ok(Some(paths))) = picked.await else { return };
            this.update(cx, |this, cx| {
                for path in paths {
                    let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                    let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                    let image = matches!(
                        path.extension().map(|e| e.to_string_lossy().to_lowercase()).as_deref(),
                        Some("png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "avif" | "heic")
                    );
                    this.pending_files.push(Pending { path, name, size, image });
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
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
                    .child(
                        div()
                            .absolute()
                            .left(px(4.))
                            .bottom(px(4.))
                            .px(px(5.))
                            .py(px(3.))
                            .rounded(px(4.))
                            .bg(rgba(0x000000a6))
                            .text_size(px(9.))
                            .line_height(px(9.))
                            .font_weight(FontWeight::EXTRA_BOLD)
                            .text_color(rgba(0xffffffcc))
                            .child("ALT"),
                    )
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
            let result = cx
                .background_executor()
                .spawn(async move {
                    let mut keys = Vec::new();
                    for file in &files {
                        let (name, mime, bytes) = prepare(file)?;
                        if bytes.len() > 40 * 1024 * 1024 {
                            anyhow::bail!("{name} is over 40 MB; send big files from the web app for now.");
                        }
                        keys.push(client.upload(&name, &mime, &bytes)?);
                    }
                    let message = client.send_with_files(&channel, text.trim(), reply.as_deref(), &keys)?;
                    Ok::<_, anyhow::Error>(message)
                })
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
    if matches!(mime, "image/png" | "image/jpeg" | "image/webp") && bytes.len() >= 400_000
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

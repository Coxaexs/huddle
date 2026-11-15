//! The profile editor (app/components/settings/profile-tab.tsx, profile-preview-card.tsx,
//! cosmetics.css): the rail of decoration tiles, the live preview card, the details tabs and the
//! save bar. At this window size the details sit under the preview (cosmetics.css ≤1380px).

use gpui::{AnyElement, Context, Entity, Focusable, FontWeight, Hsla, SharedString, Window, div, prelude::*, px, rgb, rgba};
use serde_json::{Value, json};

use super::Shell;
use crate::input::{InputEvent, Look, TextInput};
use crate::textarea::{AreaEvent, TextArea};
use crate::theme::{Theme, mix};
use crate::ui;

const SWATCHES: [&str; 16] = [
    "#5865F2", "#57F287", "#FEE75C", "#EB459E", "#ED4245", "#9d8cf5", "#38bdf8", "#06b6d4", "#10b981", "#f97316", "#ec4899", "#a855f7", "#6366f1", "#e11d48", "#14b8a6", "#e2e8f0",
];
const PRONOUN_CHIPS: [&str; 6] = ["he/him", "she/her", "they/them", "any/all", "she/they", "he/they"];
const STATUS_EMOJIS: [&str; 16] = ["💬", "🎮", "🎧", "💻", "☕", "✨", "🌙", "🔥", "🚀", "🐱", "🎨", "🎵", "💤", "🍕", "🌸", "⚡"];

pub(super) struct ProfileEditor {
    name: Entity<TextInput>,
    pronouns: Entity<TextInput>,
    tagline: Entity<TextInput>,
    status: Entity<TextInput>,
    letters: Entity<TextInput>,
    hex: Entity<TextInput>,
    bio: Entity<TextArea>,
    color: String,
    avatar_url: Option<String>,
    /// Some(key) after an upload, Some(None) after removing it; None: unchanged.
    avatar_key: Option<Option<String>>,
    banner_url: Option<String>,
    banner_key: Option<Option<String>>,
    pub(super) details: &'static str,
    /// Pride badge ids, in the order picked (the first one sits beside the username).
    pride: Vec<String>,
    panel: Option<&'static str>,
    saving: bool,
    warned: bool,
    status_text: Option<String>,
    error: Option<String>,
    pub(super) scroll: gpui::ScrollHandle,
    /// The editor itself holds focus while no field does, as the web opens with nothing focused.
    focus: gpui::FocusHandle,
    _subs: Vec<gpui::Subscription>,
}

impl ProfileEditor {
    pub(super) fn dev_pride(&mut self, ids: Vec<String>) {
        self.pride = ids;
    }
}

fn custom_status_text(v: &Option<Value>) -> String {
    match v {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Object(o)) => o.get("text").and_then(Value::as_str).unwrap_or("").to_string(),
        _ => String::new(),
    }
}

/// `.pride-flag-swatch`: 18x12, the stripes blended top to bottom, a faint dark edge.
pub(crate) fn pride_swatch(colors: &[&str], scale: f32) -> AnyElement {
    let css = format!("linear-gradient(180deg, {})", colors.join(", "));
    div()
        .relative()
        .flex_none()
        .w(px(18.))
        .h(px(12.))
        .children(crate::cssbg::picture(&css, 18., 12., 4., scale).map(|b| gpui::img(gpui::ImageSource::Render(b)).absolute().top_0().left_0().w(px(18.)).h(px(12.))))
        .child(div().absolute().inset_0().rounded(px(4.)).border_1().border_color(gpui::hsla(0., 0., 0., 0.12)))
        .into_any_element()
}

/// `.pride-badges.compact .pride-badge`: a 22px pill with the flag and its short label.
pub(crate) fn pride_badge(id: &str, color: Hsla, scale: f32) -> Option<AnyElement> {
    let (_, label, short, colors) = crate::model::PRIDE_BADGES.iter().find(|b| b.0 == id)?;
    let _ = label;
    let panel: Hsla = Theme::panel().into();
    let line: Hsla = Theme::line().into();
    Some(
        div()
            .flex_none()
            .h(px(22.))
            .pl(px(4.))
            .pr(px(7.))
            .rounded_full()
            .border_1()
            .border_color(mix(line, 0.72, gpui::white()))
            .bg(panel.opacity(0.88))
            .flex()
            .items_center()
            .gap(px(5.))
            .text_size(px(10.))
            .line_height(px(15.))
            .font_weight(FontWeight::EXTRA_BOLD)
            .text_color(color)
            .child(pride_swatch(colors, scale))
            .child(*short)
            .into_any_element(),
    )
}

/// `color-mix(in srgb, color pct%, base)` as a hex colour, for the gradients cssbg draws.
fn hex_mix(color: &str, pct: f32, base: u32) -> String {
    let c: gpui::Rgba = parse(color).into();
    let b: gpui::Rgba = rgb(base);
    let m = |x: f32, y: f32| ((x * pct + y * (1. - pct)) * 255.).round() as u8;
    format!("#{:02x}{:02x}{:02x}", m(c.r, b.r), m(c.g, b.g), m(c.b, b.b))
}

/// The colour with an alpha, as rgba().
fn alpha(color: &str, a: f32) -> String {
    let c: gpui::Rgba = parse(color).into();
    format!("rgba({}, {}, {}, {a})", (c.r * 255.).round(), (c.g * 255.).round(), (c.b * 255.).round())
}

/// bannerBackground: the picture, else the colour fading to near black.
fn banner_css(color: &str) -> String {
    format!("linear-gradient(135deg, {color}, {})", hex_mix(color, 0.3, 0x111214))
}

fn parse(color: &str) -> Hsla {
    crate::theme::css_color(color).unwrap_or(rgb(0x5865f2).into())
}

impl Shell {
    pub(super) fn open_profile_editor(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let me = self.me.clone();
        let look = |size: f32| Look { size, line_height: 20., height: 20., color: Theme::ink().into(), placeholder: Theme::muted().into() };
        let field = |placeholder: &str, value: String, cx: &mut Context<Self>| {
            cx.new(|cx| {
                let mut i = TextInput::new(placeholder.to_string(), cx).look(look(14.5));
                i.set_text(value, cx);
                i
            })
        };
        let name = field(&me.username, me.display_name.clone(), cx);
        let pronouns = field("Add your pronouns", me.pronouns.clone(), cx);
        let tagline = field("Pixel artist, coffee addict…", me.tagline.clone(), cx);
        let status = field("What's on your mind?", custom_status_text(&me.custom_status), cx);
        let letters = cx.new(|cx| {
            let mut i = TextInput::new("", cx).look(look(14.5)).centered();
            i.set_text(me.avatar.clone(), cx);
            i
        });
        let hex = field("#5865F2", me.color.clone(), cx);
        let bio = cx.new(|cx| {
            let mut a = TextArea::new("Tell everyone a bit about yourself…", cx).text(14.5, 21.).min_height(126.).max_lines(10).enter_newline().placeholder_color(Theme::muted());
            a.set_value(me.bio.clone(), cx);
            a
        });
        let mut subs = Vec::new();
        for (input, limit) in [(&name, 40usize), (&pronouns, 30), (&tagline, 80), (&status, 100), (&letters, 2), (&hex, 9)] {
            let is_hex = std::ptr::eq(input, &hex);
            subs.push(cx.subscribe_in(input, window, move |this, input, event, window, cx| match event {
                InputEvent::Escape => this.request_close_profile(window, cx),
                _ => {
                    let text = input.read(cx).text();
                    if text.chars().count() > limit {
                        let cut: String = text.chars().take(limit).collect();
                        input.update(cx, |i, cx| i.set_text(cut, cx));
                    }
                    if is_hex && let Some(e) = this.profile_editor.as_mut() {
                        e.color = input.read(cx).text();
                    }
                    cx.notify();
                }
            }));
        }
        subs.push(cx.subscribe_in(&bio, window, |_, area, event, _, cx| {
            if matches!(event, AreaEvent::Changed) {
                let text = area.read(cx).value();
                if text.chars().count() > 500 {
                    let cut: String = text.chars().take(500).collect();
                    area.update(cx, |a, cx| a.set_value(cut, cx));
                }
                cx.notify();
            }
        }));
        // The web opens with nothing focused: the editor holds focus, so keys still reach Escape.
        let focus = cx.focus_handle();
        window.focus(&focus);
        self.profile_editor = Some(ProfileEditor {
            name,
            pronouns,
            tagline,
            status,
            letters,
            hex,
            bio,
            color: me.color.clone(),
            avatar_url: me.avatar_url.clone(),
            avatar_key: None,
            banner_url: me.banner_url.clone(),
            banner_key: None,
            details: "identity",
            pride: me.pride_badges.clone(),
            panel: None,
            saving: false,
            warned: false,
            status_text: None,
            error: None,
            scroll: gpui::ScrollHandle::new(),
            focus,
            _subs: subs,
        });
        cx.notify();
    }

    fn profile_dirty(&self, e: &ProfileEditor, cx: &Context<Self>) -> bool {
        let me = &self.me;
        e.name.read(cx).text() != me.display_name
            || e.letters.read(cx).text() != me.avatar
            || e.color != me.color
            || e.pronouns.read(cx).text() != me.pronouns
            || e.tagline.read(cx).text() != me.tagline
            || e.status.read(cx).text() != custom_status_text(&me.custom_status)
            || e.bio.read(cx).value() != me.bio
            || e.avatar_url != me.avatar_url
            || e.banner_url != me.banner_url
            || e.pride != me.pride_badges
    }

    /// requestClose: unsaved changes warn first; a second close discards them.
    pub(super) fn request_close_profile(&mut self, _window: &mut Window, cx: &mut Context<Self>) {
        let Some(e) = self.profile_editor.as_ref() else { return };
        if e.panel.is_some() {
            if let Some(e) = self.profile_editor.as_mut() {
                e.panel = None;
            }
            return cx.notify();
        }
        if self.profile_dirty(e, cx) && !e.warned {
            if let Some(e) = self.profile_editor.as_mut() {
                e.warned = true;
            }
            return cx.notify();
        }
        self.profile_editor = None;
        cx.notify();
    }

    fn reset_profile(&mut self, cx: &mut Context<Self>) {
        let me = self.me.clone();
        let Some(e) = self.profile_editor.as_mut() else { return };
        e.name.update(cx, |i, cx| i.set_text(me.display_name.clone(), cx));
        e.letters.update(cx, |i, cx| i.set_text(me.avatar.clone(), cx));
        e.pronouns.update(cx, |i, cx| i.set_text(me.pronouns.clone(), cx));
        e.tagline.update(cx, |i, cx| i.set_text(me.tagline.clone(), cx));
        e.status.update(cx, |i, cx| i.set_text(custom_status_text(&me.custom_status), cx));
        e.hex.update(cx, |i, cx| i.set_text(me.color.clone(), cx));
        e.bio.update(cx, |a, cx| a.set_value(me.bio.clone(), cx));
        e.color = me.color.clone();
        e.avatar_url = me.avatar_url.clone();
        e.avatar_key = None;
        e.banner_url = me.banner_url.clone();
        e.banner_key = None;
        e.pride = me.pride_badges.clone();
        e.warned = false;
        e.error = None;
        cx.notify();
    }

    /// saveProfile: PATCH /api/settings/profile with what this editor changes (the rest is kept).
    fn save_profile(&mut self, cx: &mut Context<Self>) {
        let Some(e) = self.profile_editor.as_mut() else { return };
        e.saving = true;
        e.error = None;
        let status = e.status.read(cx).text();
        let mut body = json!({
            "displayName": e.name.read(cx).text(),
            "avatar": e.letters.read(cx).text(),
            "color": e.color,
            "pronouns": e.pronouns.read(cx).text(),
            "tagline": e.tagline.read(cx).text(),
            "customStatus": if status.trim().is_empty() { Value::Null } else { json!(status.trim()) },
            "bio": e.bio.read(cx).value(),
            "prideBadges": e.pride,
        });
        match &e.avatar_key {
            Some(key) => body["avatarKey"] = json!(key),
            None => body["avatarUrl"] = json!(e.avatar_url),
        }
        match &e.banner_key {
            Some(key) => body["bannerKey"] = json!(key),
            None => body["bannerUrl"] = json!(e.banner_url),
        }
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.settings_patch("/api/settings/profile", body) }).await;
            this.update(cx, |this, cx| {
                match result {
                    Ok(v) => {
                        if let Some(user) = v.get("user").and_then(|u| serde_json::from_value::<crate::model::User>(u.clone()).ok()) {
                            this.me = user;
                        }
                        if let Some(e) = this.profile_editor.as_mut() {
                            e.saving = false;
                            e.warned = false;
                            e.avatar_key = None;
                            e.banner_key = None;
                            e.avatar_url = this.me.avatar_url.clone();
                            e.banner_url = this.me.banner_url.clone();
                            e.status_text = Some("Profile saved!".into());
                        }
                    }
                    Err(err) => {
                        if let Some(e) = this.profile_editor.as_mut() {
                            e.saving = false;
                            e.error = Some(if err.to_string().is_empty() { "Could not save.".into() } else { err.to_string() });
                        }
                    }
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    /// choosePicture / chooseBanner: an image uploaded now, kept when the profile is saved.
    fn upload_profile_image(&mut self, banner: bool, cx: &mut Context<Self>) {
        let picked = cx.prompt_for_paths(gpui::PathPromptOptions { files: true, directories: false, multiple: false, prompt: None });
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let Ok(Ok(Some(paths))) = picked.await else { return };
            let Some(path) = paths.into_iter().next() else { return };
            let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "image".into());
            let mime = match path.extension().map(|e| e.to_string_lossy().to_lowercase()).as_deref() {
                Some("png") => "image/png",
                Some("gif") => "image/gif",
                Some("webp") => "image/webp",
                _ => "image/jpeg",
            };
            let result = cx
                .background_executor()
                .spawn(async move {
                    let bytes = std::fs::read(&path)?;
                    client.upload_field("image", &name, mime, &bytes)
                })
                .await;
            this.update(cx, |this, cx| {
                let Some(e) = this.profile_editor.as_mut() else { return };
                match result {
                    Ok(key) => {
                        let url = format!("/hangout/api/uploads/{}", url::form_urlencoded::byte_serialize(key.as_bytes()).collect::<String>());
                        if banner {
                            e.banner_key = Some(Some(key));
                            e.banner_url = Some(url);
                        } else {
                            e.avatar_key = Some(Some(key));
                            e.avatar_url = Some(url);
                        }
                        e.status_text = Some(if banner { "Banner ready — save the profile to keep it.".into() } else { "Picture ready — save the profile to keep it.".into() });
                    }
                    Err(err) => e.error = Some(if err.to_string().is_empty() { "That image did not upload.".into() } else { err.to_string() }),
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    pub(super) fn render_profile_editor(&self, window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let e = self.profile_editor.as_ref()?;
        let size = window.viewport_size();
        let (vw, vh) = (f32::from(size.width), f32::from(size.height));
        let scale = window.scale_factor();
        let color = parse(&e.color);
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let line: Hsla = Theme::line().into();
        let paper: Hsla = Theme::paper().into();
        let banner = banner_css(&e.color);
        let dirty = self.profile_dirty(e, cx);
        let name_text = { let n = e.name.read(cx).text(); if n.is_empty() { self.me.username.clone() } else { n } };
        let letters = { let l = e.letters.read(cx).text(); if l.is_empty() { self.me.avatar.clone() } else { l } };

        // The rail (330px, its own scroll): heading, Browse looks, then the decoration tiles.
        let tile = |id: &'static str| {
            div()
                .id(id)
                .group(id)
                .relative()
                .overflow_hidden()
                .rounded(px(14.))
                .border_1()
                .border_color(ink.opacity(0.09))
                .bg(ink.opacity(0.05))
                .cursor_pointer()
                .hover(|s| s.bg(gpui::white().opacity(0.08)))
        };
        let hover_label = |group: &'static str, icon: &'static str, label: &'static str, right: bool| {
            div()
                .absolute()
                .bottom(px(8.))
                .when(right, |d| d.right(px(10.)))
                .when(!right, |d| d.left(px(8.)))
                .flex()
                .items_center()
                .gap(px(5.))
                .px(px(9.))
                .py(px(4.))
                .rounded_full()
                .bg(gpui::hsla(0., 0., 0., 0.66))
                .text_size(px(11.5))
                .font_weight(FontWeight::BOLD)
                .text_color(gpui::white())
                .opacity(0.)
                .group_hover(group, |s| s.opacity(1.))
                .child(ui::icon(icon, 14., gpui::white()))
                .child(label)
        };
        let plus = || {
            div()
                .absolute()
                .top_0()
                .bottom_0()
                .left_0()
                .right_0()
                .flex()
                .items_center()
                .justify_center()
                .child(
                    div()
                        .size(px(36.))
                        .rounded_full()
                        .bg(rgba(0x0f0e16c6))
                        .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.35), offset: gpui::point(px(0.), px(4.)), blur_radius: px(12.), spread_radius: px(0.) }])
                        .flex()
                        .items_center()
                        .justify_center()
                        .child(ui::icon("plus", 18., gpui::white())),
                )
        };
        let not_here = |what: &'static str| move |this: &mut Self, _: &gpui::ClickEvent, _: &mut Window, cx: &mut Context<Self>| {
            if let Some(e) = this.profile_editor.as_mut() {
                e.status_text = Some(format!("{what} is not in this app yet; change it on the web."));
                cx.notify();
            }
        };
        let group = |title: &'static str| div().mt(px(26.)).flex().flex_col().child(div().mb(px(10.)).text_size(px(14.5)).line_height(px(21.75)).font_weight(FontWeight::BOLD).text_color(ink).child(title));
        let half = (281. - 12.) / 2.;
        let rail = div()
            .id("pe-rail")
            .absolute()
            .left_0()
            .top_0()
            .bottom_0()
            .w(px(330.))
            .overflow_y_scroll()
            .pt(px(26.))
            .px(px(24.))
            .pb(px(120.))
            .bg(Hsla::from(Theme::panel()).opacity(0.88))
            .border_r_1()
            .border_color(line)
            .flex()
            .flex_col()
            .child(div().text_size(px(21.)).line_height(px(31.5)).font_weight(FontWeight::EXTRA_BOLD).text_color(ink).child("Main Profile"))
            .child(div().mt(px(4.)).text_size(px(12.5)).line_height(px(18.75)).text_color(muted).child("Changes show up on the right as you make them."))
            .child(
                div().mt(px(14.)).flex().child(
                    div()
                        .id("pe-looks")
                        .relative()
                        .w(px(132.))
                        .h(px(34.))
                        .px(px(14.))
                        .rounded_full()
                        .overflow_hidden()
                        .shadow(vec![gpui::BoxShadow { color: Hsla::from(rgb(0xa78bfa)).opacity(0.35), offset: gpui::point(px(0.), px(6.)), blur_radius: px(18.), spread_radius: px(0.) }])
                        .flex()
                        .items_center()
                        .gap(px(6.))
                        .cursor_pointer()
                        .group("pe-looks")
                        // background-size 200%: half the gradient shows, and hover slides to the other half.
                        // (gpui clips to rectangles, so each half is its own rounded picture)
                        .children(crate::cssbg::picture("linear-gradient(100deg, rgb(255, 122, 184), rgb(167, 139, 250))", 132., 34., 17., scale).map(|bg| gpui::img(gpui::ImageSource::Render(bg)).absolute().top_0().left_0().w(px(132.)).h(px(34.))))
                        .children(crate::cssbg::picture("linear-gradient(100deg, rgb(167, 139, 250), rgb(56, 189, 248))", 132., 34., 17., scale).map(|bg| gpui::img(gpui::ImageSource::Render(bg)).absolute().top_0().left_0().w(px(132.)).h(px(34.)).opacity(0.).group_hover("pe-looks", |s| s.opacity(1.))))
                        .child(div().absolute().inset_0().rounded_full().border_1().border_color(gpui::white().opacity(0.2)))
                        .child(div().relative().child(ui::icon("sparkles", 14., gpui::white())))
                        .child(div().relative().text_size(px(13.)).line_height(px(19.5)).font_weight(FontWeight::BOLD).text_color(gpui::white()).child("Browse looks"))
                        .on_click(cx.listener(not_here("Browsing looks"))),
                ),
            )
            .child(group("Display Name Style").child(
                tile("pe-style")
                    .h(px(84.))
                    .px(px(18.))
                    .flex()
                    .flex_col()
                    .justify_center()
                    .gap(px(4.))
                    .children(crate::cssbg::picture(&format!("radial-gradient(120% 140% at 0% 0%, {}, transparent 60%)", alpha(&e.color, 0.22)), 279., 82., 13., scale).map(|bg| gpui::img(gpui::ImageSource::Render(bg)).absolute().top_0().left_0().w(px(279.)).h(px(82.))))
                    .child(div().relative().truncate().text_size(px(22.)).line_height(px(27.5)).font_weight(FontWeight::EXTRA_BOLD).text_color(ink).child(name_text.clone()))
                    .child(div().relative().text_size(px(12.)).line_height(px(18.)).text_color(muted).child("Font, effect and colours"))
                    .child(hover_label("pe-style", "pencil", "Add", true))
                    .on_click(cx.listener(not_here("Styling your name"))),
            ))
            .child(group("Nameplate").child(
                tile("pe-nameplate")
                    .h(px(76.))
                    .px(px(16.))
                    .flex()
                    .items_center()
                    .gap(px(10.))
                    .child(div().size(px(26.)).rounded_full().bg(ink.opacity(0.12)))
                    .child(div().w(px(148.)).h(px(10.)).rounded_full().bg(ink.opacity(0.12)))
                    .child(plus())
                    .child(hover_label("pe-nameplate", "pencil", "Add", false))
                    .on_click(cx.listener(not_here("Nameplates"))),
            ))
            .child(group("Avatar & Decoration").child(
                div()
                    .flex()
                    .gap(px(12.))
                    .child(
                        tile("pe-avatar")
                            .size(px(half))
                            .flex()
                            .items_center()
                            .justify_center()
                            .child(ui::avatar_with(self.picture(&e.avatar_url), &letters, &e.color, &name_text, 84., 32., FontWeight::BOLD, gpui::white().into()))
                            .child(hover_label("pe-avatar", "upload", "Upload", false))
                            .on_click(cx.listener(|this, _, _, cx| this.upload_profile_image(false, cx))),
                    )
                    .child(
                        tile("pe-decoration")
                            .size(px(half))
                            .flex()
                            .items_center()
                            .justify_center()
                            .child(div().opacity(0.35).child(ui::avatar_with(self.picture(&e.avatar_url), &letters, &e.color, &name_text, 64., 24., FontWeight::BOLD, gpui::white().into())))
                            .child(plus())
                            .child(hover_label("pe-decoration", "pencil", "Add", false))
                            .on_click(cx.listener(not_here("Avatar decorations"))),
                    ),
            ))
            .child(group("Theme & Banner").child(
                div()
                    .flex()
                    .gap(px(12.))
                    .child(
                        tile("pe-color")
                            .size(px(half))
                            .when(e.panel == Some("color"), |d| d.border_color(color.opacity(0.7)))
                            .children(crate::cssbg::picture(&format!("linear-gradient(160deg, {}, {})", e.color, hex_mix(&e.color, 0.3, 0x050508)), half - 26., half - 26., 12., scale).map(|bg| gpui::img(gpui::ImageSource::Render(bg)).absolute().top(px(12.)).left(px(12.)).size(px(half - 26.))))
                            .child(hover_label("pe-color", "palette", "Color", false))
                            .on_click(cx.listener(|this, _, _, cx| {
                                if let Some(e) = this.profile_editor.as_mut() {
                                    e.panel = if e.panel == Some("color") { None } else { Some("color") };
                                    cx.notify();
                                }
                            })),
                    )
                    .child(
                        tile("pe-banner")
                            .size(px(half))
                            .when(e.panel == Some("banner"), |d| d.border_color(color.opacity(0.7)))
                            .child(match self.picture(&e.banner_url) {
                                Some(url) => gpui::img(url).absolute().top(px(12.)).left(px(12.)).size(px(half - 26.)).rounded(px(12.)).object_fit(gpui::ObjectFit::Cover).into_any_element(),
                                None => crate::cssbg::picture(&banner, half - 26., half - 26., 12., scale)
                                    .map(|bg| gpui::img(gpui::ImageSource::Render(bg)).absolute().top(px(12.)).left(px(12.)).size(px(half - 26.)).into_any_element())
                                    .unwrap_or_else(|| div().into_any_element()),
                            })
                            .child(hover_label("pe-banner", "image-plus", "Banner", false))
                            .on_click(cx.listener(|this, _, _, cx| {
                                if let Some(e) = this.profile_editor.as_mut() {
                                    e.panel = if e.panel == Some("banner") { None } else { Some("banner") };
                                    cx.notify();
                                }
                            })),
                    ),
            ))
            .when(e.panel.is_some(), |d| d.child(self.render_profile_panel(e, cx)))
            .child(group("Card Theme").child(
                tile("pe-card")
                    .h(px(84.))
                    .px(px(16.))
                    .flex()
                    .flex_col()
                    .justify_center()
                    .child(div().text_size(px(13.5)).font_weight(FontWeight::BOLD).text_color(ink).child("No theme"))
                    .child(div().text_size(px(12.)).text_color(muted).child("Two colours across your whole card"))
                    .child(hover_label("pe-card", "palette", "Add", true))
                    .on_click(cx.listener(not_here("Card themes"))),
            ))
            .child(group("Profile Effect & Frame").child(
                div()
                    .flex()
                    .gap(px(12.))
                    .child(tile("pe-effect").size(px(half)).child(plus()).child(hover_label("pe-effect", "pencil", "Add", false)).on_click(cx.listener(not_here("Profile effects"))))
                    .child(tile("pe-frame").size(px(half)).child(plus()).child(hover_label("pe-frame", "pencil", "Add", false)).on_click(cx.listener(not_here("Profile frames")))),
            ))
            .child(group("Voice").child(
                tile("pe-voice")
                    .h(px(84.))
                    .px(px(16.))
                    .flex()
                    .items_center()
                    .gap(px(12.))
                    .child(ui::avatar_with(self.picture(&e.avatar_url), &letters, &e.color, &name_text, 44., 18., FontWeight::BOLD, gpui::white().into()))
                    .child(div().flex().flex_col().child(div().text_size(px(13.5)).font_weight(FontWeight::BOLD).text_color(ink).child("Default ring")).child(div().text_size(px(12.)).text_color(muted).child("Speaking ring and join flourish")))
                    .child(hover_label("pe-voice", "pencil", "Change", true))
                    .on_click(cx.listener(not_here("Voice styles"))),
            ));

        // The right side: the live preview, then the details under it, one scroll.
        let right_w = vw - 330.;
        let card_w = 620f32.min(right_w - 128.);
        let details_w = 660f32.min(right_w);
        let main = div()
            .id("pe-main")
            .absolute()
            .left(px(330.))
            .top_0()
            .bottom_0()
            .right_0()
            .overflow_y_scroll()
            .track_scroll(&e.scroll)
            .flex()
            .flex_col()
            .items_center()
            .child(div().pt(px(140.)).pb(px(28.)).child(self.render_profile_preview(e, card_w, &name_text, &letters, scale, cx)))
            .child(div().w(px(details_w)).px(px(32.)).pb(px(140.)).child(self.render_profile_details(e, details_w - 64., scale, cx)));

        let sy = f32::from(e.scroll.offset().y);
        let mut root = div()
            .id("profile-editor")
            .track_focus(&e.focus)
            .absolute()
            .inset_0()
            .bg(paper)
            .overflow_hidden()
            .on_mouse_down(gpui::MouseButton::Left, |_, _, cx| cx.stop_propagation())
            // `.pe-backdrop`: the banner blurred behind everything at half strength (a gradient
            // blurred looks like itself), under the page's paper fading in from 55% to 85%.
            // Both sit in the web's scroller, so they scroll away with the content: the backdrop
            // spans 80px past the first window (its 70px blur fading into the paper below), the
            // shade exactly one window.
            .children(crate::cssbg::picture(&banner, vw + 160., vh + 230., 0., scale).map(|bg| gpui::img(gpui::ImageSource::Render(bg)).absolute().top(px(sy - 80.)).left(px(-80.)).w(px(vw + 160.)).h(px(vh + 230.)).opacity(0.5)))
            .child(div().absolute().left_0().top(px(sy + vh + 10.)).w(px(vw)).h(px(140.)).bg(gpui::linear_gradient(180., gpui::linear_color_stop(paper.opacity(0.), 0.), gpui::linear_color_stop(paper, 1.))))
            .child(div().absolute().left_0().top(px(sy)).w(px(vw)).h(px(vh)).bg(gpui::linear_gradient(180., gpui::linear_color_stop(paper.opacity(0.55), 0.), gpui::linear_color_stop(paper.opacity(0.85), 1.))))
            .child(main)
            .child(rail)
            .child(
                div()
                    .id("pe-close")
                    .absolute()
                    .top(px(22.))
                    .right(px(26.))
                    .flex()
                    .flex_col()
                    .items_center()
                    .gap(px(4.))
                    .text_size(px(11.))
                    .line_height(px(16.5))
                    .font_weight(FontWeight::BOLD)
                    .text_color(muted)
                    .cursor_pointer()
                    .child(div().p(px(7.)).rounded_full().border_2().border_color(muted).child(ui::icon("x", 20., muted)))
                    .child("ESC")
                    .on_click(cx.listener(|this, _, window, cx| this.request_close_profile(window, cx))),
            );
        // `.pe-savebar`: unsaved changes (red after a close attempt), then "Saved".
        if dirty || e.status_text.is_some() || e.error.is_some() {
            let text = if let Some(err) = &e.error {
                err.clone()
            } else if !dirty {
                e.status_text.clone().unwrap_or_else(|| "Saved".into())
            } else if e.warned {
                "Careful — you have unsaved changes! Close again to discard.".into()
            } else if let Some(note) = &e.status_text {
                note.clone()
            } else {
                "Careful — you have unsaved changes!".into()
            };
            let bar_w = 700f32.min(vw - 32.);
            root = root.child(
                div()
                    .absolute()
                    .bottom(px(24.))
                    .left(px((vw - bar_w) / 2.))
                    .w(px(bar_w))
                    .pl(px(18.))
                    .pr(px(10.))
                    .py(px(10.))
                    .rounded(px(12.))
                    .bg(if e.warned && dirty { rgb(0xb4262b) } else if !dirty { rgb(0x1f6b3d) } else { rgb(0x111214) })
                    .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.5), offset: gpui::point(px(0.), px(12.)), blur_radius: px(40.), spread_radius: px(0.) }])
                    .flex()
                    .items_center()
                    .when(!dirty, |d| d.justify_center())
                    .gap(px(10.))
                    .child(div().when(dirty, |d| d.flex_1()).min_w_0().text_size(px(14.5)).line_height(px(21.75)).font_weight(FontWeight::SEMIBOLD).text_color(gpui::white()).child(text))
                    .when(dirty, |d| {
                        d.child(div().id("pe-reset").h(px(38.)).px(px(12.)).flex().items_center().text_size(px(14.)).font_weight(FontWeight::SEMIBOLD).text_color(gpui::white()).cursor_pointer().hover(|s| s.underline()).child("Reset").on_click(cx.listener(|this, _, _, cx| this.reset_profile(cx))))
                            .child(
                                div()
                                    .id("pe-save")
                                    .h(px(38.))
                                    .px(px(16.))
                                    .rounded(px(10.))
                                    .bg(rgb(0x248046))
                                    .hover(|s| s.bg(rgb(0x1a6334)))
                                    .flex()
                                    .items_center()
                                    .text_size(px(14.))
                                    .font_weight(FontWeight::SEMIBOLD)
                                    .text_color(gpui::white())
                                    .cursor_pointer()
                                    .when(e.saving, |d| d.opacity(0.5))
                                    .child(if e.saving { "Saving…" } else { "Save Changes" })
                                    .on_click(cx.listener(|this, _, _, cx| this.save_profile(cx))),
                            )
                    }),
            );
        }
        Some(root.into_any_element())
    }

    /// The colour panel (swatches and hex) or the banner panel (upload / remove).
    fn render_profile_panel(&self, e: &ProfileEditor, cx: &mut Context<Self>) -> AnyElement {
        let ink: Hsla = Theme::ink().into();
        let panel = div().mt(px(12.)).p(px(14.)).rounded(px(14.)).border_1().border_color(Theme::line()).bg(ink.opacity(0.04)).flex().flex_col().gap(px(12.));
        if e.panel == Some("banner") {
            let chip = |id: &'static str, icon: &'static str, label: &'static str, danger: bool| {
                div().id(id).h(px(32.)).px(px(12.)).rounded(px(8.)).bg(ink.opacity(0.1)).hover(|s| s.bg(gpui::white().opacity(0.16))).flex().items_center().gap(px(6.)).text_size(px(12.5)).font_weight(FontWeight::SEMIBOLD).text_color(if danger { rgb(0xff8f93).into() } else { ink }).cursor_pointer().child(ui::icon(icon, 14., if danger { rgb(0xff8f93).into() } else { ink })).child(label)
            };
            return panel
                .child(
                    div()
                        .flex()
                        .flex_wrap()
                        .gap(px(8.))
                        .child(chip("pe-banner-up", "image-plus", "Upload image", false).on_click(cx.listener(|this, _, _, cx| this.upload_profile_image(true, cx))))
                        .when(e.banner_url.is_some(), |d| {
                            d.child(chip("pe-banner-rm", "trash-2", "Remove", true).on_click(cx.listener(|this, _, _, cx| {
                                if let Some(e) = this.profile_editor.as_mut() {
                                    e.banner_url = None;
                                    e.banner_key = Some(None);
                                    cx.notify();
                                }
                            })))
                        }),
                )
                .into_any_element();
        }
        let mut swatches = div().flex().flex_wrap().gap(px(8.));
        for s in SWATCHES {
            let chosen = e.color.eq_ignore_ascii_case(s);
            swatches = swatches.child(
                div()
                    .id(SharedString::from(format!("pe-swatch-{s}")))
                    .size(px(26.))
                    .rounded_full()
                    .bg(parse(s))
                    .border_1()
                    .border_color(gpui::white().opacity(0.18))
                    .when(chosen, |d| d.shadow(vec![gpui::BoxShadow { color: ink, offset: gpui::point(px(0.), px(0.)), blur_radius: px(0.), spread_radius: px(4.) }, gpui::BoxShadow { color: Theme::panel().into(), offset: gpui::point(px(0.), px(0.)), blur_radius: px(0.), spread_radius: px(2.) }]))
                    .cursor_pointer()
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if let Some(e) = this.profile_editor.as_mut() {
                            e.color = s.to_string();
                            e.hex.update(cx, |i, cx| i.set_text(s.to_string(), cx));
                            cx.notify();
                        }
                    })),
            );
        }
        panel
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(10.))
                    .child(div().flex_none().size(px(42.)).rounded(px(10.)).bg(parse(&e.color)).border_1().border_color(gpui::white().opacity(0.2)))
                    .child(div().flex_1().min_h(px(42.)).px(px(12.)).py(px(10.)).rounded(px(10.)).border_1().border_color(ink.opacity(0.1)).bg(rgba(0x13101ab3)).child(e.hex.clone())),
            )
            .child(swatches)
            .into_any_element()
    }

    /// ProfilePreviewCard, size "lg": banner, avatar with its ring and presence, name, @username,
    /// the buttons others see, About Me and Member Since.
    fn render_profile_preview(&self, e: &ProfileEditor, w: f32, name: &str, letters: &str, scale: f32, cx: &Context<Self>) -> AnyElement {
        let accent = parse(&e.color);
        let ring = mix(accent, 0.22, rgb(0x17181d));
        let banner = banner_css(&e.color);
        let bio = e.bio.read(cx).value();
        let pronouns = e.pronouns.read(cx).text();
        let tagline = e.tagline.read(cx).text();
        let status = e.status.read(cx).text();
        let white: Hsla = gpui::white().into();
        let since = crate::model::parse_time(&self.me.created_at).map(|t| t.with_timezone(&chrono::Local).format("%b %-d, %Y").to_string()).unwrap_or_default();
        let bg = gpui::linear_gradient(180., gpui::linear_color_stop(mix(accent, 0.22, rgb(0x17181d)), 0.), gpui::linear_color_stop(mix(accent, 0.08, rgb(0x101115)), 1.));
        let section = |title: &str| div().mt(px(20.)).flex().flex_col().child(div().mb(px(6.)).text_size(px(13.)).line_height(px(19.5)).font_weight(FontWeight::BOLD).text_color(white.opacity(0.92)).child(title.to_string()));
        let mut sub = div().flex().flex_wrap().items_center().gap_x(px(7.)).gap_y(px(4.)).text_size(px(15.5)).line_height(px(23.25)).text_color(white.opacity(0.86)).child(div().text_size(px(13.)).line_height(px(19.5)).text_color(Theme::muted()).child(self.me.username.clone()));
        if !pronouns.is_empty() {
            sub = sub.child(div().opacity(0.6).child("•")).child(pronouns);
        }
        // `.pv-pride`: the first badge in a little box beside the username; the rest under it.
        if let Some(first) = e.pride.first().and_then(|id| pride_badge(id, white.opacity(0.86), scale)) {
            sub = sub.child(div().px(px(6.)).pt(px(6.)).pb(px(2.)).rounded(px(8.)).border_1().border_color(white.opacity(0.1)).bg(white.opacity(0.07)).flex().child(first));
        }
        let more: Vec<AnyElement> = e.pride.iter().skip(1).filter_map(|id| pride_badge(id, rgb(0xf2f3f5).into(), scale)).collect();
        let banner_el: AnyElement = match self.picture(&e.banner_url) {
            Some(url) => gpui::img(url).w(px(w)).h(px(220.)).rounded_t(px(18.)).object_fit(gpui::ObjectFit::Cover).into_any_element(),
            // gpui clips to rectangles: the banner rounds its own top corners.
            // a taller picture cut at 220 keeps the bottom corners square.
            None => div().h(px(220.)).overflow_hidden().children(crate::cssbg::picture(&banner, w, 240., 18., scale).map(|b| gpui::img(gpui::ImageSource::Render(b)).w(px(w)).h(px(240.)))).into_any_element(),
        };
        let mut body = div()
            .pt(px(18.))
            .px(px(28.))
            .pb(px(30.))
            .flex()
            .flex_col()
            .gap(px(4.))
            .child(div().text_size(px(28.)).line_height(px(32.2)).font_weight(FontWeight::EXTRA_BOLD).text_color(white).child(name.to_string()))
            .child(sub);
        if !tagline.is_empty() {
            body = body.child(div().mt(px(2.)).text_size(px(13.)).text_color(white.opacity(0.68)).child(tagline));
        }
        if !more.is_empty() {
            body = body.child(div().mt(px(6.)).pt(px(4.)).flex().flex_wrap().gap(px(4.)).children(more));
        }
        let button = |icon: &'static str, label: Option<&'static str>, primary: bool| {
            div()
                .h(px(40.))
                .when(label.is_some(), |d| d.px(px(18.)))
                .when(label.is_none(), |d| d.w(px(40.)))
                .rounded(px(10.))
                .bg(if primary { mix(accent, 0.6, rgb(0x3c3f9a)) } else { white.opacity(0.1) })
                .flex()
                .items_center()
                .justify_center()
                .gap(px(8.))
                .text_size(px(15.))
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(white)
                .child(ui::icon(icon, 16., white))
                .children(label)
        };
        body = body
            .child(div().mt(px(16.)).mb(px(4.)).flex().gap(px(8.)).child(button("message-circle", Some("Message"), true)).child(button("user-plus", None, false)).child(button("ellipsis", None, false)))
            .child(section("About Me").child(div().text_size(px(15.)).line_height(px(21.75)).text_color(white.opacity(0.88)).child(if bio.trim().is_empty() { "Nothing here yet. Write something in About.".to_string() } else { bio })))
            .child(section("Member Since").child(div().flex().items_center().gap(px(8.)).text_size(px(14.5)).line_height(px(21.75)).text_color(white.opacity(0.88)).child(ui::icon("calendar", 14., white.opacity(0.88))).child(since)));
        let avatar = div()
            .relative()
            .flex_none()
            .size(px(140.))
            .rounded_full()
            .shadow(vec![gpui::BoxShadow { color: ring, offset: gpui::point(px(0.), px(0.)), blur_radius: px(0.), spread_radius: px(7.) }])
            .child(ui::avatar_with(self.picture(&e.avatar_url), letters, &e.color, name, 140., 52., FontWeight::BOLD, white))
            .child(div().absolute().right(px(8.)).bottom(px(8.)).size(px(30.)).rounded_full().bg(rgb(0x23a55a)).border(px(6.)).border_color(ring));
        let mut head = div().relative().mt(px(-74.)).px(px(24.)).flex().items_center().gap(px(14.)).child(avatar);
        if !status.trim().is_empty() {
            head = head.child(div().ml(px(6.)).max_w(px(260.)).px(px(16.)).py(px(12.)).rounded(px(16.)).bg(rgba(0x111216d1)).text_size(px(15.)).text_color(white).child(status));
        }
        div()
            .relative()
            .w(px(w))
            .rounded(px(18.))
            .overflow_hidden()
            .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.45), offset: gpui::point(px(0.), px(24.)), blur_radius: px(64.), spread_radius: px(0.) }])
            .bg(bg)
            .child(div().relative().flex().flex_col().child(banner_el).child(head).child(body))
            .child(div().absolute().inset_0().rounded(px(18.)).border_1().border_color(white.opacity(0.07)))
            .into_any_element()
    }

    /// `.pe-details`: Identity and About here; Connections, Music and CSS still on the web.
    fn render_profile_details(&self, e: &ProfileEditor, inner_w: f32, window_scale: f32, cx: &mut Context<Self>) -> AnyElement {
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let line: Hsla = Theme::line().into();
        let accent = parse(&e.color);
        let mut tabs = div().flex().gap(px(18.)).border_b_1().border_color(line);
        for (id, label) in [("identity", "Identity"), ("about", "About"), ("links", "Connections"), ("music", "Music"), ("css", "CSS")] {
            let active = e.details == id;
            tabs = tabs.child(
                div()
                    .id(SharedString::from(format!("pe-tab-{id}")))
                    .relative()
                    .pt(px(10.))
                    .pb(px(12.))
                    .text_size(px(14.5))
                    .line_height(px(21.75))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(if active { ink } else { muted })
                    .cursor_pointer()
                    .hover(|s| s.text_color(Theme::ink()))
                    .child(label)
                    .when(active, |d| d.child(div().absolute().left_0().right_0().bottom(px(-1.)).h(px(2.)).rounded(px(2.)).bg(ink)))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if let Some(e) = this.profile_editor.as_mut() {
                            e.details = id;
                            cx.notify();
                        }
                    })),
            );
        }
        let input = |child: AnyElement, short: bool| {
            div().when(short, |d| d.w(px(90.))).min_h(px(43.75)).px(px(12.)).py(px(10.)).text_size(px(14.5)).line_height(px(21.75)).rounded(px(10.)).border_1().border_color(ink.opacity(0.1)).bg(rgba(0x13101ab3)).child(child)
        };
        let field = |label: &str, count: Option<String>| {
            div()
                .flex()
                .flex_col()
                .gap(px(8.))
                .child(div().flex().justify_between().items_baseline().child(div().text_size(px(13.5)).line_height(px(20.25)).font_weight(FontWeight::BOLD).text_color(ink).child(label.to_string())).children(count.map(|c| div().text_size(px(11.5)).line_height(px(17.25)).text_color(muted).child(c))))
        };
        let hint = |h: &str| div().text_size(px(12.5)).line_height(px(18.75)).text_color(muted).child(h.to_string());
        let chip = |id: SharedString, label: String, active: bool| {
            div().id(id).h(px(30.)).px(px(12.)).rounded_full().border_1().border_color(if active { accent } else { ink.opacity(0.12) }).bg(if active { accent.opacity(0.22) } else { ink.opacity(0.04) }).flex().items_center().text_size(px(12.5)).font_weight(FontWeight::SEMIBOLD).text_color(ink).cursor_pointer().hover(|s| s.bg(gpui::white().opacity(0.1))).child(label)
        };
        let mut body = div().pt(px(24.)).flex().flex_col().gap(px(22.));
        match e.details {
            "identity" => {
                let name_len = e.name.read(cx).text().chars().count();
                let pronouns = e.pronouns.read(cx).text();
                let mut chips = div().flex().flex_wrap().gap(px(6.));
                for p in PRONOUN_CHIPS {
                    chips = chips.child(chip(SharedString::from(format!("pe-pr-{p}")), p.to_string(), pronouns == p).on_click(cx.listener(move |this, _, _, cx| {
                        if let Some(e) = this.profile_editor.as_ref() {
                            e.pronouns.update(cx, |i, cx| i.set_text(p.to_string(), cx));
                        }
                    })));
                }
                let mut emojis = div().flex().flex_wrap().gap(px(2.));
                for emoji in STATUS_EMOJIS {
                    emojis = emojis.child(
                        div().id(SharedString::from(format!("pe-em-{emoji}"))).size(px(34.)).rounded(px(8.)).flex().items_center().justify_center().text_size(px(18.)).cursor_pointer().hover(|s| s.bg(gpui::white().opacity(0.1))).child(emoji).on_click(cx.listener(move |this, _, _, cx| {
                            if let Some(e) = this.profile_editor.as_ref() {
                                let prev = e.status.read(cx).text();
                                let next = if prev.is_empty() { format!("{emoji} ") } else { format!("{emoji} {prev}") };
                                e.status.update(cx, |i, cx| i.set_text(next, cx));
                            }
                        })),
                    );
                }
                // `.pe-style-link`: opens the name-style studio on the web.
                let name_text = { let n = e.name.read(cx).text(); if n.is_empty() { self.me.username.clone() } else { n } };
                let style_link = div()
                    .id("pe-style-link")
                    .h(px(40.))
                    .px(px(12.))
                    .rounded(px(10.))
                    .border_1()
                    .border_dashed()
                    .border_color(ink.opacity(0.16))
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .text_size(px(13.))
                    .line_height(px(19.5))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(muted)
                    .cursor_pointer()
                    .hover(|s| s.bg(gpui::white().opacity(0.04)))
                    .child(ui::icon("sparkles", 14., muted))
                    .child(div().flex_1().child("Style your name"))
                    .child(div().text_size(px(16.)).line_height(px(24.)).font_weight(FontWeight::BOLD).text_color(ink).child(name_text))
                    .on_click(cx.listener(|this, _, _, cx| {
                        if let Some(e) = this.profile_editor.as_mut() {
                            e.status_text = Some("Styling your name is not in this app yet; change it on the web.".into());
                            cx.notify();
                        }
                    }));
                body = body
                    .child(field("Display Name", Some(format!("{name_len}/40"))).child(input(e.name.clone().into_any_element(), false)).child(style_link))
                    .child(field("Pronouns", None).child(input(e.pronouns.clone().into_any_element(), false)).child(chips))
                    .child(field("Tagline", None).child(input(e.tagline.clone().into_any_element(), false)).child(hint("A short line under your name.")))
                    .child(field("Custom Status", None).child(input(e.status.clone().into_any_element(), false)).child(emojis).child(hint("Shows as a bubble beside your avatar.")))
                    .child(field("Avatar Letters", None).child(input(e.letters.clone().into_any_element(), true).font_weight(FontWeight::BOLD)).child(hint("Shown when you have no picture.")));
            }
            "about" => {
                let bio_len = e.bio.read(cx).value().chars().count();
                // `.pe-pride`: a grid of 150px-or-wider cells, 8px apart; up to four picked.
                let scale = window_scale;
                let cols = ((inner_w + 8.) / (150. + 8.)).floor().max(1.) as usize;
                let cell_w = (inner_w - 8. * (cols as f32 - 1.)) / cols as f32;
                let mut grid = div().flex().flex_wrap().gap(px(8.));
                for (id, label, _, colors) in crate::model::PRIDE_BADGES.iter() {
                    let selected = e.pride.iter().any(|p| p == id);
                    grid = grid.child(
                        div()
                            .id(SharedString::from(format!("pe-pride-{id}")))
                            .w(px(cell_w))
                            .min_h(px(40.))
                            .px(px(10.))
                            .py(px(8.))
                            .rounded(px(10.))
                            .border_1()
                            .border_color(if selected { accent } else { ink.opacity(0.1) })
                            .bg(if selected { accent.opacity(0.16) } else { ink.opacity(0.04) })
                            .flex()
                            .items_center()
                            .gap(px(8.))
                            .text_size(px(13.))
                            .line_height(px(19.5))
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(ink)
                            .cursor_pointer()
                            .child(pride_swatch(colors, scale))
                            .child(div().flex_1().child(*label))
                            .when(selected, |d| d.child(ui::icon("check", 13., accent)))
                            .on_click(cx.listener(move |this, _, _, cx| {
                                if let Some(e) = this.profile_editor.as_mut() {
                                    if let Some(i) = e.pride.iter().position(|p| p == id) {
                                        e.pride.remove(i);
                                    } else if e.pride.len() < 4 {
                                        e.pride.push(id.to_string());
                                    }
                                    cx.notify();
                                }
                            })),
                    );
                }
                body = body
                    .child(field("About Me", Some(format!("{bio_len}/500"))).child(input(e.bio.clone().into_any_element(), false)))
                    .child(field("Pride Badges", None).child(grid).child(hint("Optional, up to 4. These are public, so pick only what you want to share.")));
            }
            _ => {
                body = body.child(div().p(px(18.)).rounded(px(12.)).border_1().border_dashed().border_color(ink.opacity(0.15)).text_center().text_size(px(13.)).text_color(muted).child("Not in this app yet: edit this part of your profile on the web."));
            }
        }
        div().flex().flex_col().child(tabs).child(body).into_any_element()
    }
}

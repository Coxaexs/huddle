//! The soundboard (voice-stage/soundboard-drawer.tsx) and the stage's ⋯ menu that opens it: the
//! thirteen instant presets and the server's clips, played to the room (POST /api/sounds/play) or
//! previewed for you alone; the volume; search; uploading a clip (optionally to your own pack) and
//! deleting one. Sounds anyone plays in your room arrive on the hub and play at that volume.

use std::sync::LazyLock;

use gpui::{AnyElement, Context, Entity, FontWeight, Hsla, SharedString, Window, div, prelude::*, px, rgb};
use serde_json::{Value, json};

use super::Shell;
use crate::input::TextInput;
use crate::theme::{Theme, mix};
use crate::ui;

#[derive(serde::Deserialize, Clone)]
struct Preset {
    id: String,
    name: String,
    emoji: String,
    description: String,
}

/// lib/soundboard-presets.ts SOUNDBOARD_PRESETS (their sounds rendered from the web's synthesis).
static PRESETS: LazyLock<Vec<Preset>> = LazyLock::new(|| {
    crate::assets::ASSETS.iter().find(|(p, _)| *p == "data/soundboard.json").and_then(|(_, b)| serde_json::from_slice(b).ok()).unwrap_or_default()
});

pub(super) struct Board {
    pub open: bool,
    /// The stage's ⋯ menu.
    pub more: bool,
    tab: &'static str,
    pub search: Entity<TextInput>,
    /// The server's clips (`/api/sounds`), and for which server.
    sounds: Vec<Value>,
    loaded_for: Option<String>,
    played: Option<(String, std::time::Instant)>,
    personal: bool,
    uploading: bool,
    error: Option<String>,
    volume_spot: std::rc::Rc<std::cell::Cell<gpui::Bounds<gpui::Pixels>>>,
    /// Downloaded clips, so a sound played twice is fetched once.
    clips: std::collections::HashMap<String, Vec<u8>>,
}

impl Board {
    pub fn new(cx: &mut Context<Shell>) -> Self {
        let search = cx.new(|cx| {
            TextInput::new("Search sounds...", cx).look(crate::input::Look { size: 12., line_height: 16., height: 16., color: Theme::ink().into(), placeholder: Hsla::from(Theme::muted()).opacity(0.7) })
        });
        Board {
            open: false,
            more: false,
            tab: "presets",
            search,
            sounds: Vec::new(),
            loaded_for: None,
            played: None,
            personal: false,
            uploading: false,
            error: None,
            volume_spot: Default::default(),
            clips: Default::default(),
        }
    }
}

impl Shell {
    /// playSound() for a hub `soundboard` event (or a preview): a preset, or a clip fetched once.
    pub(super) fn play_soundboard_url(&mut self, url: String, cx: &mut Context<Self>) {
        if let Some(id) = url.strip_prefix("preset:") {
            crate::sounds::play_soundboard(Some(id), None);
            return;
        }
        if let Some(bytes) = self.soundboard.clips.get(&url) {
            crate::sounds::play_soundboard(None, Some(bytes.clone()));
            return;
        }
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let key = url.clone();
            let got = cx.background_executor().spawn(async move { client.fetch(&key).ok().filter(|(s, _)| *s < 400).map(|(_, b)| b) }).await;
            if let Some(bytes) = got {
                crate::sounds::play_soundboard(None, Some(bytes.clone()));
                this.update(cx, |this, _| {
                    this.soundboard.clips.insert(url, bytes);
                })
                .ok();
            }
        })
        .detach();
    }

    pub(super) fn soundboard_load(&mut self, cx: &mut Context<Self>) {
        let Some(server) = self.server_id.clone().filter(|_| !self.home) else { return };
        self.soundboard.loaded_for = Some(server.clone());
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let path = format!("/api/sounds?serverId={}", url::form_urlencoded::byte_serialize(server.as_bytes()).collect::<String>());
            let result = cx.background_executor().spawn(async move { client.get_value(&path) }).await;
            this.update(cx, |this, cx| {
                if let Ok(v) = result {
                    this.soundboard.sounds = v["sounds"].as_array().cloned().unwrap_or_default();
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    /// Plays to the room: everyone in it hears it (and so do you, from the hub).
    fn soundboard_play(&mut self, sound_id: String, cx: &mut Context<Self>) {
        let Some(channel) = self.call.as_ref().map(|c| c.channel_id.clone()) else { return };
        self.soundboard.played = Some((sound_id.clone(), std::time::Instant::now()));
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let _ = cx.background_executor().spawn(async move { client.settings_post("/api/sounds/play", json!({ "channelId": channel, "soundId": sound_id })) }).await;
            cx.background_executor().timer(std::time::Duration::from_millis(600)).await;
            this.update(cx, |this, cx| {
                this.soundboard.played = None;
                cx.notify();
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    fn soundboard_upload(&mut self, cx: &mut Context<Self>) {
        let Some(server) = self.server_id.clone() else { return };
        let picked = cx.prompt_for_paths(gpui::PathPromptOptions { files: true, directories: false, multiple: false, prompt: None });
        let client = self.client.clone();
        let personal = self.soundboard.personal;
        cx.spawn(async move |this, cx| {
            let Ok(Ok(Some(paths))) = picked.await else { return };
            let Some(path) = paths.into_iter().next() else { return };
            this.update(cx, |this, cx| {
                this.soundboard.uploading = true;
                this.soundboard.error = None;
                cx.notify();
            })
            .ok();
            let result = cx
                .background_executor()
                .spawn(async move {
                    let file = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "sound".into());
                    let mime = match path.extension().map(|e| e.to_string_lossy().to_lowercase()).as_deref() {
                        Some("wav") => "audio/wav",
                        Some("ogg") => "audio/ogg",
                        Some("m4a") => "audio/mp4",
                        Some("webm") => "audio/webm",
                        _ => "audio/mpeg",
                    };
                    let key = client.upload(&file, mime, &std::fs::read(&path)?)?;
                    let name: String = file.rsplit_once('.').map(|(s, _)| s.to_string()).unwrap_or(file).chars().take(40).collect();
                    client.settings_post("/api/sounds", json!({ "serverId": server, "key": key, "name": name, "personal": personal }))
                })
                .await;
            this.update(cx, |this, cx| {
                this.soundboard.uploading = false;
                match result {
                    Ok(_) => this.soundboard_load(cx),
                    // Say why (too big, wrong format) instead of failing silently.
                    Err(e) => this.soundboard.error = Some(if e.to_string().is_empty() { "That sound did not upload.".into() } else { e.to_string() }),
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    fn soundboard_delete(&mut self, id: String, cx: &mut Context<Self>) {
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let path = format!("/api/sounds?id={}", url::form_urlencoded::byte_serialize(id.as_bytes()).collect::<String>());
            let _ = cx.background_executor().spawn(async move { client.settings_delete(&path, json!({})) }).await;
            this.update(cx, |this, cx| this.soundboard_load(cx)).ok();
        })
        .detach();
    }

    /// soundboardAllowed: the room has not switched it off.
    pub(super) fn soundboard_allowed(&self) -> bool {
        self.call.as_ref().and_then(|c| self.channel_by_id(&c.channel_id)).is_none_or(|c| c.soundboard != Some(false))
    }

    pub(super) fn toggle_stage_more(&mut self, cx: &mut Context<Self>) {
        self.soundboard.more = !self.soundboard.more;
        cx.notify();
    }

    /// `.vctrl-more-popover`, above the ⋯ button.
    pub(super) fn render_stage_more(&self, cx: &mut Context<Self>) -> Option<AnyElement> {
        if !self.soundboard.more {
            return None;
        }
        let item = |id: &'static str, icon: &'static str, color: gpui::Rgba, label: String| {
            div()
                .id(id)
                .flex()
                .items_center()
                .gap(px(10.))
                .px(px(12.))
                .py(px(8.))
                .rounded(px(8.))
                .text_size(px(12.))
                .line_height(px(16.))
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(Theme::ink())
                .cursor_pointer()
                .hover(|s| s.bg(Theme::line()))
                .child(ui::icon(icon, 15., color))
                .child(label)
        };
        let mut menu = div()
            .id("stage-more")
            .occlude()
            .absolute()
            .bottom(px(56.))
            .left(px(-68.))
            .min_w(px(180.))
            .p(px(6.))
            .rounded(px(12.))
            .bg(Theme::panel())
            .border_1()
            .border_color(Theme::line())
            .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.25), offset: gpui::point(px(0.), px(20.)), blur_radius: px(25.), spread_radius: px(-5.) }])
            .flex()
            .flex_col()
            .gap(px(4.))
            .on_mouse_down_out(cx.listener(|this, _, _, cx| {
                this.soundboard.more = false;
                cx.notify();
            }));
        if self.soundboard_allowed() {
            menu = menu.child(
                item("more-soundboard", "volume-2", Theme::lavender(), crate::i18n::t(if self.soundboard.open { "voiceStage.closeSoundboard" } else { "voiceStage.soundboard" })).on_click(cx.listener(|this, _, _, cx| {
                    this.soundboard.open = !this.soundboard.open;
                    this.soundboard.more = false;
                    if this.soundboard.open && this.soundboard.loaded_for != this.server_id {
                        this.soundboard_load(cx);
                    }
                    cx.notify();
                })),
            );
        }
        // Q&A, while you are in the call (stage rooms have their own button).
        if self.qa_available() {
            let open = self.qa_open_count();
            menu = menu.child(
                item("more-qa", "message-circle-question-mark", Theme::coral(), format!("{}{}", crate::i18n::t("voiceStage.qa"), if open > 0 { format!(" ({open})") } else { String::new() }))
                    .on_click(cx.listener(|this, _, window, cx| {
                        this.soundboard.more = false;
                        this.toggle_qa(window, cx);
                    })),
            );
        }
        // Captions: showing the lines others share (sharing your own is not in this app yet).
        menu = menu.child(
            item("more-captions", "captions", Theme::lavender(), crate::i18n::t(if self.captions.showing { "voiceStage.hideCaptions" } else { "voiceStage.showCaptions" })).on_click(cx.listener(|this, _, _, cx| {
                this.soundboard.more = false;
                this.toggle_captions(cx);
            })),
        );
        // Voice Table: the table view, or back to the grid.
        menu = menu.child(item("more-table", "volume-1", Theme::mint(), crate::i18n::t("voiceStage.voiceTable")).on_click(cx.listener(|this, _, _, cx| {
            this.soundboard.more = false;
            if let Some(stage) = this.stage.as_mut() {
                stage.view = if stage.view == "table" { "grid" } else { "table" };
            }
            cx.notify();
        })));
        Some(gpui::deferred(menu).with_priority(1).into_any_element())
    }

    /// SoundboardDrawer: across the stage, above the call buttons.
    pub(super) fn render_soundboard(&self, width: f32, _window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        if !self.soundboard.open || !self.soundboard_allowed() {
            return None;
        }
        let b = &self.soundboard;
        let query = b.search.read(cx).text().to_lowercase();
        let muted: Hsla = Theme::muted().into();
        let lavender: Hsla = Theme::lavender().into();
        let can_manage = self.my_permissions() & (1 << 1) != 0;
        let volume = crate::sounds::soundboard_volume();
        let tab = |id: &'static str, label: String, active: bool| {
            div()
                .id(id)
                .px(px(10.))
                .py(px(4.))
                .rounded(px(8.))
                .border_1()
                .border_color(if active { Hsla::from(Theme::line()) } else { gpui::transparent_black() })
                .text_size(px(11.))
                .line_height(px(16.5))
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(if active { lavender } else { muted })
                .when(active, |d| d.bg(Theme::paper()).shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.12), offset: gpui::point(px(0.), px(1.)), blur_radius: px(2.), spread_radius: px(0.) }]))
                .when(!active, |d| d.hover(|s| s.bg(Theme::paper()).text_color(Theme::ink())))
                .cursor_pointer()
                .child(label)
        };
        let presets: Vec<&Preset> = PRESETS.iter().filter(|p| query.is_empty() || p.name.to_lowercase().contains(&query) || p.description.to_lowercase().contains(&query)).collect();
        let sounds: Vec<&Value> = b.sounds.iter().filter(|s| query.is_empty() || s["name"].as_str().unwrap_or_default().to_lowercase().contains(&query)).collect();
        let head = div()
            .w_full()
            .flex()
            .items_center()
            .justify_between()
            .gap(px(8.))
            .pb(px(8.))
            .mb(px(4.))
            .border_b_1()
            .border_color(Theme::line())
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(4.))
                    .child(tab("sb-tab-presets", format!("Instant Presets ({})", PRESETS.len()), b.tab == "presets").on_click(cx.listener(|this, _, _, cx| {
                        this.soundboard.tab = "presets";
                        cx.notify();
                    })))
                    .child(tab("sb-tab-server", format!("Server Clips ({})", b.sounds.len()), b.tab == "server").on_click(cx.listener(|this, _, _, cx| {
                        this.soundboard.tab = "server";
                        cx.notify();
                    }))),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(12.))
                    .child(
                        div()
                            .id("sb-volume-wrap")
                            .flex()
                            .items_center()
                            .gap(px(6.))
                            .tooltip(ui::tooltip(format!("Soundboard Volume: {}%", (volume * 100.).round())))
                            .child(ui::icon(if volume == 0. { "volume-x" } else if volume < 0.5 { "volume-1" } else { "volume-2" }, 14., muted))
                            // A range like Chrome's: the lavender part, the track, the thumb.
                            .child(
                                div()
                                    .id("sb-volume")
                                    .relative()
                                    .w(px(64.))
                                    .h(px(16.))
                                    .cursor_pointer()
                                    .child(div().absolute().left_0().right_0().top(px(6.)).h(px(4.)).rounded_full().bg(Hsla::from(Theme::ink()).opacity(0.2)))
                                    .child(div().absolute().left_0().top(px(6.)).w(px(4. + 52. * volume)).h(px(4.)).rounded_full().bg(lavender))
                                    .child(div().absolute().left(px(48. * volume)).top_0().size(px(16.)).rounded_full().bg(lavender))
                                    .child(super::profile_card::track(&b.volume_spot))
                                    .on_mouse_down(gpui::MouseButton::Left, cx.listener(|this, e: &gpui::MouseDownEvent, _, cx| {
                                        let r = this.soundboard.volume_spot.get();
                                        let v = (f32::from(e.position.x - r.origin.x) / f32::from(r.size.width).max(1.)).clamp(0., 1.);
                                        crate::sounds::set_soundboard_volume((v * 20.).round() / 20.);
                                        cx.notify();
                                    })),
                            )
                            .child(div().w(px(24.)).font_family(crate::theme::MONO_FONT).text_size(px(10.)).text_color(muted).child(format!("{}%", (volume * 100.).round()))),
                    )
                    .child(
                        div()
                            .relative()
                            .w(px(112.))
                            .pl(px(24.))
                            .pr(px(8.))
                            .py(px(2.))
                            .rounded(px(6.))
                            .bg(Theme::paper())
                            .border_1()
                            .border_color(Theme::line())
                            .child(div().absolute().left(px(8.)).top(px(4.)).child(ui::icon("search", 12., muted)))
                            .child(b.search.clone()),
                    ),
            );
        let pad = |id: String, emoji: String, name: String, tip: String, played: bool, personal: bool| {
            div()
                .id(SharedString::from(id))
                .relative()
                .w(px(84.))
                .h(px(64.))
                .rounded(px(12.))
                .border_1()
                .border_color(if played || personal { lavender } else { Hsla::from(Theme::line()) })
                .bg(Theme::paper())
                .flex()
                .flex_col()
                .items_center()
                .justify_center()
                .gap(px(2.))
                .cursor_pointer()
                .hover(|s| s.border_color(Theme::lavender()))
                .when(played, |d| d.shadow(vec![gpui::BoxShadow { color: lavender.opacity(0.4), offset: gpui::point(px(0.), px(0.)), blur_radius: px(12.), spread_radius: px(0.) }]))
                .tooltip(ui::tooltip(tip))
                .child(div().text_size(px(22.)).line_height(px(22.)).child(emoji))
                .child(div().max_w(px(76.)).overflow_hidden().whitespace_nowrap().text_ellipsis().text_size(px(11.)).line_height(px(16.5)).text_color(muted).child(name))
                .when(personal, |d| {
                    d.child(div().absolute().top(px(-7.)).left(px(-7.)).px(px(4.)).py(px(1.)).rounded(px(6.)).bg(lavender).text_size(px(8.)).line_height(px(10.)).font_weight(FontWeight::EXTRA_BOLD).text_color(Theme::on_accent()).child("YOU"))
                })
        };
        let preview = |id: String, group: SharedString| {
            div()
                .id(SharedString::from(id))
                .absolute()
                .bottom(px(4.))
                .right(px(4.))
                .size(px(18.))
                .rounded(px(6.))
                .bg(Theme::panel())
                .border_1()
                .border_color(Theme::line())
                .flex()
                .items_center()
                .justify_center()
                .opacity(0.)
                .group_hover(group, |s| s.opacity(1.))
                .hover(|s| s.bg(Theme::lavender()))
                .cursor_pointer()
                .tooltip(ui::tooltip("Preview for only you"))
                .child(ui::icon("play", 10., muted))
        };
        let played = b.played.as_ref().filter(|(_, at)| at.elapsed().as_millis() < 600).map(|(id, _)| id.clone());
        let mut grid = div().w_full().flex().flex_wrap().gap(px(8.));
        let empty = |text: String| div().p(px(6.)).text_size(px(13.)).line_height(px(19.5)).text_color(muted).child(text);
        if b.tab == "presets" {
            for p in &presets {
                let sound_id = format!("preset:{}", p.id);
                let group = SharedString::from(format!("sb-wrap-{}", p.id));
                let (sid, pid) = (sound_id.clone(), p.id.clone());
                grid = grid.child(
                    div()
                        .relative()
                        .group(group.clone())
                        .child(pad(format!("sb-pad-{}", p.id), p.emoji.clone(), p.name.clone(), format!("{} - {}\n(Click to play to room)", p.name, p.description), played.as_deref() == Some(sound_id.as_str()), false).on_click(cx.listener(move |this, _, _, cx| this.soundboard_play(sid.clone(), cx))))
                        .child(preview(format!("sb-prev-{}", p.id), group).on_click(move |_, _, cx| {
                            cx.stop_propagation();
                            crate::sounds::play_soundboard(Some(&pid), None);
                        })),
                );
            }
            if presets.is_empty() {
                grid = grid.child(empty(format!("No preset sounds match \u{201c}{query}\u{201d}")));
            }
        } else {
            for s in &sounds {
                let id = s["id"].as_str().unwrap_or_default().to_string();
                let name = s["name"].as_str().unwrap_or_default().to_string();
                let personal = s["personal"] == true;
                let group = SharedString::from(format!("sb-wrap-{id}"));
                let url = self.client.absolute(s["url"].as_str().unwrap_or_default());
                let (sid, did) = (id.clone(), id.clone());
                grid = grid.child(
                    div()
                        .relative()
                        .group(group.clone())
                        .child(
                            pad(format!("sb-pad-{id}"), s["emoji"].as_str().unwrap_or("🔊").to_string(), name.clone(), format!("{name}{}\n(Click to play to room)", if personal { " (your pack)" } else { "" }), played.as_deref() == Some(id.as_str()), personal)
                                .on_click(cx.listener(move |this, _, _, cx| this.soundboard_play(sid.clone(), cx))),
                        )
                        .child(preview(format!("sb-prev-{id}"), group).on_click(cx.listener(move |this, _, _, cx| {
                            cx.stop_propagation();
                            this.play_soundboard_url(url.clone(), cx);
                        })))
                        .when(can_manage || personal, |d| {
                            d.child(
                                div()
                                    .id(SharedString::from(format!("sb-del-{id}")))
                                    .absolute()
                                    .top(px(-6.))
                                    .right(px(-6.))
                                    .size(px(18.))
                                    .rounded_full()
                                    .border_1()
                                    .border_color(Theme::line())
                                    .bg(Theme::paper())
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .text_size(px(13.))
                                    .line_height(px(13.))
                                    .text_color(Theme::coral())
                                    .cursor_pointer()
                                    .hover(|s| s.bg(Theme::coral()).border_color(Theme::coral()).text_color(gpui::white()))
                                    .tooltip(ui::tooltip(format!("Delete {name}")))
                                    .child("×")
                                    .on_click(cx.listener(move |this, _, _, cx| {
                                        cx.stop_propagation();
                                        this.soundboard_delete(did.clone(), cx);
                                    })),
                            )
                        }),
                );
            }
            grid = grid.child(
                div()
                    .id("sb-upload")
                    .w(px(84.))
                    .h(px(64.))
                    .rounded(px(12.))
                    .border_1()
                    .border_dashed()
                    .border_color(Theme::line())
                    .bg(Theme::paper())
                    .flex()
                    .flex_col()
                    .items_center()
                    .justify_center()
                    .gap(px(2.))
                    .when(!b.uploading, |d| d.cursor_pointer().hover(|s| s.border_color(Theme::lavender())).on_click(cx.listener(|this, _, _, cx| this.soundboard_upload(cx))))
                    .child(div().text_size(px(22.)).line_height(px(22.)).text_color(Theme::ink()).child(if b.uploading { "…" } else { "＋" }))
                    .child(div().text_size(px(11.)).line_height(px(16.5)).text_color(muted).child("Upload")),
            );
            if sounds.is_empty() && b.sounds.is_empty() {
                grid = grid.child(empty("No custom sounds yet. Click upload to add audio clips!".into()));
            }
            if let Some(e) = &b.error {
                grid = grid.child(empty(e.clone()));
            }
            if sounds.is_empty() && !b.sounds.is_empty() {
                grid = grid.child(empty(format!("No server sounds match \u{201c}{query}\u{201d}")));
            }
            let personal = b.personal;
            grid = grid.child(
                div()
                    .id("sb-personal")
                    .w_full()
                    .mt(px(4.))
                    .flex()
                    .items_center()
                    .gap(px(6.))
                    .text_size(px(12.))
                    .line_height(px(18.))
                    .text_color(muted)
                    .cursor_pointer()
                    .child(div().size(px(13.)).rounded(px(3.)).border_1().border_color(if personal { lavender } else { Hsla::from(rgb(0x767676)) }).when(personal, |d| d.bg(lavender)).flex().items_center().justify_center().when(personal, |d| d.child(ui::icon("check", 10., gpui::white()))))
                    .child("Add to my personal pack")
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.soundboard.personal = !this.soundboard.personal;
                        cx.notify();
                    })),
            );
        }
        Some(
            div()
                .id("soundboard")
                .flex_none()
                .w(px(width))
                .max_h(px(180.))
                .overflow_y_scroll()
                .py(px(12.))
                .px(px(18.))
                .border_t_1()
                .border_color(Theme::line())
                .bg(mix(Theme::panel(), 0.6, Theme::paper()))
                .child(head)
                .child(grid)
                .into_any_element(),
        )
    }
}

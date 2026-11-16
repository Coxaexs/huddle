//! 1:1 DM calls (use-dm-calls.ts, dm-call-view.tsx, the incoming call card in overlays.tsx):
//! placing a call rings the other person (hub `dm-call`) with the outgoing ring until they answer,
//! decline, or 35 s pass (then a "Missed call" line in the DM); a call to you rings, with a card to
//! accept or decline, for 45 s at most; in the call, the DM shows everyone in it large, the timer,
//! and the call's buttons. Coming back to a call (another device, a restart) rebuilds it from the
//! room. Video calls start as voice calls here: this app does not send a camera yet.

use std::time::{Duration, Instant};

use gpui::{AnimationExt, AnyElement, Context, FontWeight, Hsla, SharedString, div, prelude::*, px, rgb};
use serde_json::{Value, json};

use super::Shell;
use crate::theme::{Theme, mix};
use crate::ui;

#[derive(Clone)]
pub(super) struct Person {
    pub id: String,
    pub name: String,
    pub avatar: String,
    pub avatar_url: Option<String>,
    pub color: String,
}

pub(super) struct Incoming {
    channel: String,
    from: Person,
    video: bool,
}

pub(super) struct DmCall {
    pub channel: String,
    other: Person,
    connected: bool,
    start: Instant,
    /// The other person has been in the room (an accept arrives before their join).
    seen_other: bool,
    /// When a placed call gives up, and when an accepted call whose caller never came does.
    give_up: Option<Instant>,
}

#[derive(Default)]
pub(super) struct Calls {
    pub incoming: Option<Incoming>,
    pub call: Option<DmCall>,
    /// Bumped to stop the ring loops.
    ring: u64,
    incoming_until: Option<Instant>,
    /// Leaving on purpose: the restore below stays out.
    ending: bool,
}

impl Shell {
    /// The outgoing (or incoming) ring, every `period` until `ring` changes.
    fn ring_loop(&mut self, cue: &'static str, period: u64, cx: &mut Context<Self>) {
        self.calls.ring += 1;
        let ring = self.calls.ring;
        cx.spawn(async move |this, cx| {
            loop {
                let go = this.update(cx, |this, _| this.calls.ring == ring).unwrap_or(false);
                if !go {
                    break;
                }
                crate::sounds::play(cue);
                cx.background_executor().timer(Duration::from_millis(period)).await;
            }
        })
        .detach();
    }

    fn stop_rings(&mut self) {
        self.calls.ring += 1;
    }

    fn dm_person(&self, channel: &str) -> Option<Person> {
        let dm = self.dms.iter().find(|d| d.channel_id == channel)?;
        Some(Person { id: dm.user.id.clone(), name: dm.user.name().to_string(), avatar: dm.user.avatar.clone(), avatar_url: dm.user.avatar_url.clone(), color: dm.user.color.clone() })
    }

    /// startDmCall(): into the DM's room, ringing the other person.
    pub(super) fn start_dm_call(&mut self, channel: String, video: bool, cx: &mut Context<Self>) {
        let Some(other) = self.dm_person(&channel) else { return };
        self.calls.call = Some(DmCall { channel: channel.clone(), other: other.clone(), connected: false, start: Instant::now(), seen_other: false, give_up: Some(Instant::now() + Duration::from_secs(35)) });
        self.ring_loop("ringOut", 3200, cx);
        self.join_voice(channel.clone(), cx);
        self.hub.send(json!({ "t": "dm-call", "channelId": channel, "targetUserId": other.id, "action": "call", "isVideo": video }));
        cx.notify();
    }

    /// endDmCall(): hang up (a placed call that was never answered tells them, and when it timed
    /// out, leaves a "Missed call" line in the DM).
    pub(super) fn end_dm_call(&mut self, missed: bool, cx: &mut Context<Self>) {
        self.stop_rings();
        crate::sounds::play("callEnd");
        if let Some(call) = self.calls.call.take() {
            if !call.connected {
                self.hub.send(json!({ "t": "dm-call", "channelId": call.channel, "targetUserId": call.other.id, "action": "cancel" }));
            }
            if missed {
                let now = chrono::Local::now();
                let text = format!("📞 Missed call from {} on {} at {}", self.me.name(), now.format("%b %-d"), now.format("%-I:%M %p"));
                let client = self.client.clone();
                let channel = call.channel.clone();
                cx.background_executor().spawn(async move { client.post_message(json!({ "channelId": channel, "content": text })) }).detach();
            }
        }
        self.calls.ending = true;
        if self.call.is_some() {
            self.leave_voice(cx);
        }
        cx.notify();
    }

    pub(super) fn accept_dm_call(&mut self, cx: &mut Context<Self>) {
        let Some(incoming) = self.calls.incoming.take() else { return };
        self.stop_rings();
        self.hub.send(json!({ "t": "dm-call", "channelId": incoming.channel, "targetUserId": incoming.from.id, "action": "accept" }));
        self.open_home(cx);
        self.open_dm(incoming.channel.clone(), cx);
        self.calls.call = Some(DmCall { channel: incoming.channel.clone(), other: incoming.from, connected: true, start: Instant::now(), seen_other: false, give_up: Some(Instant::now() + Duration::from_secs(25)) });
        crate::sounds::play("callAnswer");
        let _ = incoming.video;
        self.join_voice(incoming.channel, cx);
        cx.notify();
    }

    pub(super) fn decline_dm_call(&mut self, cx: &mut Context<Self>) {
        let Some(incoming) = self.calls.incoming.take() else { return };
        self.stop_rings();
        self.hub.send(json!({ "t": "dm-call", "channelId": incoming.channel, "targetUserId": incoming.from.id, "action": "decline" }));
        cx.notify();
    }

    /// The hub's `dm-call` events.
    pub(super) fn on_dm_call(&mut self, value: &Value, cx: &mut Context<Self>) {
        let channel = value["channelId"].as_str().unwrap_or_default().to_string();
        let from = value["fromUserId"].as_str().unwrap_or_default().to_string();
        match value["action"].as_str().unwrap_or_default() {
            "call" => {
                if from == self.me.id || self.friends.blocked.iter().any(|b| b.id == from) {
                    return;
                }
                let name = value["fromDisplayName"].as_str().filter(|s| !s.is_empty()).unwrap_or("Someone").to_string();
                let video = value["isVideo"] == true;
                self.ring_loop("ringIn", 2600, cx);
                // If the caller's app dies without cancelling, stop ringing anyway.
                self.calls.incoming_until = Some(Instant::now() + Duration::from_secs(45));
                crate::desktop::notify(&format!("Incoming {} Call", if video { "Video" } else { "Voice" }), &format!("{name} is calling you..."));
                self.calls.incoming = Some(Incoming {
                    channel,
                    from: Person { id: from, name, avatar: value["fromAvatar"].as_str().unwrap_or_default().to_string(), avatar_url: value["fromAvatarUrl"].as_str().map(String::from), color: String::new() },
                    video,
                });
            }
            "accept" => {
                self.stop_rings();
                crate::sounds::play("callAnswer");
                if let Some(call) = self.calls.call.as_mut() {
                    call.connected = true;
                    call.start = Instant::now();
                    call.give_up = Some(Instant::now() + Duration::from_secs(25));
                }
            }
            "decline" => {
                self.stop_rings();
                crate::sounds::play("callEnd");
                if self.calls.call.take().is_some() && self.call.is_some() {
                    self.leave_voice(cx);
                }
                let name = value["fromDisplayName"].as_str().unwrap_or("They").to_string();
                self.set_notice(format!("{name} declined the call."), cx);
            }
            "cancel" => {
                self.stop_rings();
                self.calls.incoming = None;
            }
            _ => {}
        }
        cx.notify();
    }

    /// Once a second: timeouts, following the other person in and out, rebuilding a call you are
    /// in after a restart.
    pub(super) fn dm_call_tick(&mut self, cx: &mut Context<Self>) {
        if self.calls.incoming_until.is_some_and(|t| Instant::now() >= t) {
            self.calls.incoming_until = None;
            if self.calls.incoming.take().is_some() {
                self.stop_rings();
                cx.notify();
            }
        }
        let room = self.call.as_ref().map(|c| c.channel_id.clone());
        if room.is_none() {
            self.calls.ending = false;
        }
        if self.calls.call.is_none()
            && !self.calls.ending
            && let Some(room) = room.clone()
            && let Some(other) = self.dm_person(&room)
            && other.id != self.me.id
        {
            let seen = self.rooms.get(&room).is_some_and(|p| p.iter().any(|p| p.id == other.id));
            self.calls.call = Some(DmCall { channel: room, other, connected: true, start: Instant::now(), seen_other: seen, give_up: None });
            cx.notify();
        }
        let Some((channel, other_id)) = self.calls.call.as_ref().map(|c| (c.channel.clone(), c.other.id.clone())) else { return };
        let other_in = self.rooms.get(&channel).is_some_and(|p| p.iter().any(|p| p.id == other_id));
        let mut stop_ring = false;
        let mut end = None;
        if let Some(call) = self.calls.call.as_mut() {
            if other_in {
                if !call.connected {
                    stop_ring = true;
                    call.connected = true;
                    call.start = Instant::now();
                }
                call.seen_other = true;
                call.give_up = None;
            } else if call.give_up.is_some_and(|t| Instant::now() >= t) && !call.seen_other {
                // A placed call nobody answered is a missed call; an accept whose caller never came ends.
                end = Some(!call.connected);
            }
        }
        if stop_ring {
            self.stop_rings();
            crate::sounds::play("callAnswer");
        }
        if let Some(missed) = end {
            self.end_dm_call(missed, cx);
            return;
        }
        cx.notify();
    }

    /// `.incoming-call-overlay`: who is calling, decline and accept.
    pub(super) fn render_incoming_call(&self, cx: &mut Context<Self>) -> Option<AnyElement> {
        let incoming = self.calls.incoming.as_ref()?;
        let lavender: Hsla = Theme::lavender().into();
        let round = |id: &'static str, bg: u32, glow: Hsla, glyph: &'static str| {
            div()
                .id(id)
                .size(px(42.))
                .rounded_full()
                .bg(rgb(bg))
                .shadow(vec![gpui::BoxShadow { color: glow, offset: gpui::point(px(0.), px(4.)), blur_radius: px(14.), spread_radius: px(0.) }])
                .flex()
                .items_center()
                .justify_center()
                .cursor_pointer()
                .child(ui::icon(glyph, 20., gpui::white()))
        };
        Some(
            div()
                .id("incoming-call")
                .occlude()
                .absolute()
                .top(px(24.))
                .right(px(24.))
                .min_w(px(320.))
                .px(px(20.))
                .py(px(16.))
                .rounded(px(18.))
                .bg(rgb(0x1e1a30))
                .border_1()
                .border_color(lavender.opacity(0.35))
                .shadow(vec![
                    gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.55), offset: gpui::point(px(0.), px(12.)), blur_radius: px(36.), spread_radius: px(0.) },
                    gpui::BoxShadow { color: lavender.opacity(0.15), offset: gpui::point(px(0.), px(0.)), blur_radius: px(0.), spread_radius: px(1.) },
                ])
                .flex()
                .items_center()
                .gap(px(16.))
                .child(div().flex_none().child(ui::avatar(self.picture(&incoming.from.avatar_url), &incoming.from.avatar, "#a78bfa", &incoming.from.name, 52.)))
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .flex()
                        .flex_col()
                        .gap(px(2.))
                        .child(div().truncate().text_size(px(14.)).line_height(px(21.)).font_weight(FontWeight::BOLD).text_color(rgb(0xf1f0f7)).child(incoming.from.name.clone()))
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(4.))
                                .text_size(px(12.))
                                .line_height(px(18.))
                                .font_weight(FontWeight::MEDIUM)
                                .text_color(lavender)
                                .child(ui::icon(if incoming.video { "video" } else { "phone-call" }, 13., lavender))
                                .child(format!("Incoming {} Call...", if incoming.video { "Video" } else { "Voice" })),
                        ),
                )
                .child(
                    div()
                        .flex_none()
                        .flex()
                        .items_center()
                        .gap(px(10.))
                        .child(round("call-decline", 0xef4444, gpui::hsla(0., 0.84, 0.6, 0.45), "phone-off").tooltip(ui::tooltip("Decline Call")).on_click(cx.listener(|this, _, _, cx| this.decline_dm_call(cx))))
                        .child(round("call-accept", 0x22c55e, gpui::hsla(142. / 360., 0.71, 0.45, 0.45), if incoming.video { "video" } else { "phone-call" }).tooltip(ui::tooltip("Accept Call")).on_click(cx.listener(|this, _, _, cx| this.accept_dm_call(cx)))),
                )
                .into_any_element(),
        )
    }

    /// `.dm-call-stage`: above an open DM while there is a call in it (or one being placed).
    pub(super) fn render_dm_call_panel(&self, channel: &str, cx: &mut Context<Self>) -> Option<AnyElement> {
        let dm = self.dms.iter().find(|d| d.channel_id == channel)?;
        if dm.user.id == self.me.id {
            return None;
        }
        let mut people = self.rooms.get(channel).cloned().unwrap_or_default();
        let placing = self.calls.call.as_ref().filter(|c| c.channel == channel);
        // You, from the moment you are in it (before the room list says so).
        if (placing.is_some() || self.call.as_ref().is_some_and(|c| c.channel_id == channel)) && !people.iter().any(|p| p.id == self.me.id) {
            people.insert(0, crate::model::VoiceParticipant { id: self.me.id.clone(), display_name: self.me.name().to_string(), avatar: self.me.avatar.clone(), avatar_url: self.me.avatar_url.clone(), color: self.me.color.clone(), muted: self.muted, ..Default::default() });
        }
        let ringing = placing.filter(|c| !c.connected && !people.iter().any(|p| p.id == c.other.id)).map(|c| c.other.clone());
        if people.is_empty() && placing.is_none() {
            return None;
        }
        let joined = self.call.as_ref().is_some_and(|c| c.channel_id == channel) || placing.is_some();
        let status = match (&ringing, placing) {
            (Some(p), _) => format!("Calling {}…", p.name),
            (None, Some(c)) if joined => {
                let s = c.start.elapsed().as_secs();
                format!("{}:{:02}", s / 60, s % 60)
            }
            _ => format!("{} in the call", people.len()),
        };
        let connected = ringing.is_none();
        let speaking = self.call.as_ref().filter(|c| c.channel_id == channel).map(|c| c.speaking.clone()).unwrap_or_default();
        let mint: Hsla = Theme::mint().into();
        let lavender: Hsla = Theme::lavender().into();
        let mut row = div().flex().items_center().justify_center().gap(px(22.));
        for p in &people {
            let me = p.id == self.me.id;
            let talking = speaking.iter().any(|s| s.starts_with(&format!("{}|", p.id)) || s == &p.id);
            let muted = if me { self.muted } else { p.muted };
            row = row.child(
                div()
                    .relative()
                    .child(
                        div()
                            .rounded_full()
                            .when(talking, |d| {
                                d.shadow(vec![
                                    gpui::BoxShadow { color: mint, offset: gpui::point(px(0.), px(0.)), blur_radius: px(0.), spread_radius: px(3.) },
                                    gpui::BoxShadow { color: mint.opacity(0.45), offset: gpui::point(px(0.), px(0.)), blur_radius: px(18.), spread_radius: px(0.) },
                                ])
                            })
                            .child(ui::avatar_with(self.picture(&p.avatar_url), &p.avatar, if p.color.is_empty() { "#a78bfa" } else { &p.color }, p.name(), 96., 34., FontWeight::EXTRA_BOLD, letter_on(&p.color))),
                    )
                    .when(muted, |d| {
                        d.child(
                            div()
                                .absolute()
                                .right(px(2.))
                                .bottom(px(2.))
                                .size(px(26.))
                                .rounded_full()
                                .bg(Theme::coral())
                                .shadow(vec![gpui::BoxShadow { color: mix(Theme::paper(), 0.8, gpui::black()), offset: gpui::point(px(0.), px(0.)), blur_radius: px(0.), spread_radius: px(3.) }])
                                .flex()
                                .items_center()
                                .justify_center()
                                .child(ui::icon("mic-off", 13., gpui::white())),
                        )
                    }),
            );
        }
        if let Some(p) = &ringing {
            // dm-call-ring: a lavender ring pulsing out every 1.6 s (ease-in-out).
            let face = ui::avatar_with(self.picture(&p.avatar_url), &p.avatar, if p.color.is_empty() { "#a78bfa" } else { &p.color }, &p.name, 96., 34., FontWeight::EXTRA_BOLD, letter_on(&p.color));
            row = row.child(div().rounded_full().opacity(0.75).child(face).with_animation(
                "dm-call-ring",
                gpui::Animation::new(Duration::from_millis(1600)).repeat(),
                move |d, t| {
                    let k = if t < 0.5 { t * 2. } else { 2. - t * 2. };
                    let k = k * k * (3. - 2. * k);
                    d.shadow(vec![gpui::BoxShadow { color: lavender.opacity(0.55 * (1. - k)), offset: gpui::point(px(0.), px(0.)), blur_radius: px(0.), spread_radius: px(10. * k) }])
                },
            ));
        }
        let ctrl = |id: &'static str, glyph: &'static str, color: gpui::Rgba| {
            div().id(id).w(px(44.)).h(px(40.)).rounded(px(10.)).flex().items_center().justify_center().cursor_pointer().hover(|s| s.bg(Hsla::from(Theme::ink()).opacity(0.09))).child(ui::icon(glyph, 19., color))
        };
        let group = || div().flex().gap(px(2.)).p(px(4.)).rounded(px(14.)).bg(Theme::card()).border_1().border_color(Theme::line());
        let controls = if joined {
            let room = channel.to_string();
            div()
                .flex()
                .items_center()
                .gap(px(10.))
                .child(
                    group()
                        .child(ctrl("dmc-mute", if self.muted { "mic-off" } else { "mic" }, if self.muted { Theme::coral() } else { Theme::ink() }).tooltip(ui::tooltip(if self.muted { "Unmute" } else { "Mute" })).on_click(cx.listener(|this, _, _, cx| this.toggle_mute(cx))))
                        .child(
                            ctrl("dmc-deafen", if self.deafened { "headphone-off" } else { "headphones" }, if self.deafened { Theme::coral() } else { Theme::ink() })
                                .tooltip(ui::tooltip(if self.deafened { "Undeafen" } else { "Deafen" }))
                                .on_click(cx.listener(|this, _, _, cx| this.toggle_deafen(cx))),
                        ),
                )
                .child(
                    group()
                        .child(ctrl("dmc-camera", "video-off", Theme::ink()).tooltip(ui::tooltip("Turn on camera")).on_click(cx.listener(|this, _, _, cx| this.set_notice("The camera is not in this app yet.", cx))))
                        .child(ctrl("dmc-screen", "monitor", Theme::ink()).tooltip(ui::tooltip("Share screen")).on_click(cx.listener(|this, _, _, cx| this.set_notice("Sharing your screen is not in this app yet.", cx))))
                        .child(ctrl("dmc-full", "maximize-2", Theme::ink()).tooltip(ui::tooltip("Open full call view")).on_click(cx.listener(move |this, _, window, cx| this.open_stage(room.clone(), window, cx)))),
                )
                .child(
                    div()
                        .id("dmc-hangup")
                        .w(px(72.))
                        .h(px(48.))
                        .rounded(px(14.))
                        .bg(rgb(0xda373c))
                        .hover(|s| s.bg(rgb(0xc22f34)))
                        .flex()
                        .items_center()
                        .justify_center()
                        .cursor_pointer()
                        .tooltip(ui::tooltip(if ringing.is_some() { "Cancel call" } else { "Leave call" }))
                        .child(ui::icon("phone-off", 21., gpui::white()))
                        .on_click(cx.listener(|this, _, _, cx| this.end_dm_call(false, cx))),
                )
        } else {
            let room = channel.to_string();
            div().flex().items_center().gap(px(10.)).child(
                div()
                    .id("dmc-join")
                    .h(px(44.))
                    .px(px(22.))
                    .rounded(px(14.))
                    .bg(rgb(0x248046))
                    .hover(|s| s.bg(rgb(0x1a6334)))
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .text_color(gpui::white())
                    .font_weight(FontWeight::SEMIBOLD)
                    .cursor_pointer()
                    .child(ui::icon("phone", 18., gpui::white()))
                    .child("Join call")
                    .on_click(cx.listener(move |this, _, _, cx| this.join_dm_room(room.clone(), cx))),
            )
        };
        Some(
            div()
                .flex_none()
                .relative()
                .pt(px(18.))
                .px(px(20.))
                .pb(px(20.))
                .flex()
                .flex_col()
                .items_center()
                .gap(px(16.))
                .border_b_1()
                .border_color(Theme::line())
                // radial-gradient(70% 90% at 50% 0%, lavender 14%, transparent 70%) over
                // mix(paper 80%, black).
                .child({
                    let css = |c: Hsla| {
                        let c = gpui::Rgba::from(c);
                        format!("rgba({}, {}, {}, {})", (c.r * 255.).round(), (c.g * 255.).round(), (c.b * 255.).round(), c.a)
                    };
                    ui::css_background(ui::css_static(format!("radial-gradient(70% 90% at 50% 0%, {} 0%, {} 70%), {}", css(lavender.opacity(0.14)), css(lavender.opacity(0.)), css(mix(Theme::paper(), 0.8, gpui::black())))), 0.)
                })
                .child(
                    div()
                        .relative()
                        .flex()
                        .items_center()
                        .text_size(px(12.))
                        .line_height(px(18.))
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(Theme::muted())
                        .when(connected, |d| d.child(div().mr(px(7.)).size(px(7.)).rounded_full().bg(mint)))
                        .child(status),
                )
                .child(row.relative())
                .child(controls.relative())
                .into_any_element(),
        )
    }

    /// "Join call" (in the panel, or the header): answering if it is ringing you, else joining.
    pub(super) fn join_dm_room(&mut self, room: String, cx: &mut Context<Self>) {
        if self.calls.incoming.as_ref().is_some_and(|i| i.channel == room) {
            self.accept_dm_call(cx);
            return;
        }
        if let Some(other) = self.dm_person(&room) {
            let seen = self.rooms.get(&room).is_some_and(|p| p.iter().any(|p| p.id == other.id));
            self.calls.call = Some(DmCall { channel: room.clone(), other, connected: true, start: Instant::now(), seen_other: seen, give_up: None });
        }
        crate::sounds::play("callAnswer");
        self.join_voice(room, cx);
        cx.notify();
    }

    pub(super) fn dm_call_here(&self, channel: &str) -> bool {
        self.calls.call.as_ref().is_some_and(|c| c.channel == channel)
    }

    #[allow(dead_code)]
    fn _unused(_: SharedString) {}
}

/// The letter on a letter avatar: readable on its colour, as everywhere else.
fn letter_on(color: &str) -> Hsla {
    crate::theme::on_color(crate::theme::css_color(if color.is_empty() { "#a78bfa" } else { color }).unwrap_or(Theme::lavender_soft().into()))
}

//! VoiceMessagePlayer (components/voice-message.tsx): play / pause, the seekable waveform, the time,
//! 1× / 1.5× / 2×, and CC (transcribed on the server). One voice message plays at a time.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use gpui::{AnyElement, Context, FontWeight, Hsla, SharedString, Window, div, prelude::*, px, rgb};
use serde_json::json;

use super::Shell;
use crate::model::Message;
use crate::theme::{Theme, mix};
use crate::ui;
use crate::voice_clip::Pcm;

const SPEEDS: [f32; 3] = [1., 1.5, 2.];

/// The voice message playing now: from where, how fast, since when, and the afplay doing it.
pub(super) struct Playing {
    id: String,
    from: f32,
    speed: f32,
    since: Instant,
    total: f32,
    child: std::process::Child,
}

#[derive(Default)]
pub(super) struct VoiceState {
    pub(super) playing: Option<Playing>,
    /// Where each message was left (seconds) and its speed.
    position: HashMap<String, f32>,
    speed: HashMap<String, f32>,
    /// Decoded sound by file, and the files on their way.
    pub(super) clips: HashMap<String, Arc<Pcm>>,
    loading: std::collections::HashSet<String>,
    transcripts: HashMap<String, String>,
    show_transcript: std::collections::HashSet<String>,
    transcribing: std::collections::HashSet<String>,
    errors: HashMap<String, String>,
    /// A voice message being recorded, and whether it is on its way.
    pub(super) recording: Option<crate::recorder::Recorder>,
    sending: bool,
}

/// formatDuration().
fn mmss(seconds: f32) -> String {
    let total = seconds.max(0.).round() as u64;
    format!("{}:{:02}", total / 60, total % 60)
}

impl Playing {
    fn position(&self) -> f32 {
        (self.from + self.since.elapsed().as_secs_f32() * self.speed).min(self.total)
    }
}

impl Shell {
    pub(super) fn dev_play_voice(&mut self, id: String, cx: &mut Context<Self>) {
        let url = self.channel_id.as_ref().and_then(|c| self.messages.get(c)).and_then(|l| l.iter().find(|m| m.id == id)).and_then(|m| m.audio.clone());
        if let Some(url) = url {
            self.voice_toggle(id, url, cx);
        }
    }

    pub(super) fn stop_voice_message(&mut self) {
        self.voice_stop();
    }

    fn voice_stop(&mut self) {
        if let Some(mut p) = self.voice_msgs.playing.take() {
            let at = p.position();
            let _ = p.child.kill();
            let _ = p.child.wait();
            self.voice_msgs.position.insert(p.id.clone(), if at >= p.total - 0.05 { 0. } else { at });
        }
    }

    /// Starts `id` at `from` seconds, fetching and decoding its file first if need be.
    fn voice_play(&mut self, id: String, url: String, from: f32, cx: &mut Context<Self>) {
        self.voice_stop();
        let Some(pcm) = self.voice_msgs.clips.get(&url).cloned() else {
            if self.voice_msgs.loading.insert(url.clone()) {
                let client = self.client.clone();
                let key = url.clone();
                cx.spawn(async move |this, cx| {
                    let decoded = cx.background_executor().spawn(async move { client.fetch(&key).ok().and_then(|(status, bytes)| (status < 400).then(|| crate::voice_clip::decode(&bytes)).flatten()) }).await;
                    this.update(cx, |this, cx| {
                        this.voice_msgs.loading.remove(&url);
                        match decoded {
                            Some(pcm) => {
                                this.voice_msgs.clips.insert(url.clone(), Arc::new(pcm));
                                this.voice_play(id, url, from, cx);
                            }
                            None => {
                                this.voice_msgs.errors.insert(id, "Couldn't play that voice message.".into());
                            }
                        }
                        cx.notify();
                    })
                    .ok();
                })
                .detach();
            }
            cx.notify();
            return;
        };
        let speed = self.voice_msgs.speed.get(&id).copied().unwrap_or(1.);
        let total = pcm.seconds();
        let from = if from >= total - 0.05 { 0. } else { from };
        let file = std::env::temp_dir().join(format!("hoffle-voice-{}.wav", std::process::id()));
        if std::fs::write(&file, pcm.wav_from(from)).is_err() {
            return;
        }
        let mut command = std::process::Command::new("/usr/bin/afplay");
        command.arg("-r").arg(format!("{speed}")).arg("-q").arg("1");
        // Test runs (HOFFLE_DEV_MUTED) play silently.
        if std::env::var("HOFFLE_DEV_MUTED").is_ok() {
            command.arg("-v").arg("0");
        }
        let Ok(child) = command.arg(&file).spawn() else { return };
        self.voice_msgs.playing = Some(Playing { id: id.clone(), from, speed, since: Instant::now(), total, child });
        // The clock: redraw as it plays, and stop at the end.
        cx.spawn(async move |this, cx| {
            loop {
                cx.background_executor().timer(std::time::Duration::from_millis(100)).await;
                let done = this
                    .update(cx, |this, cx| {
                        let Some(p) = this.voice_msgs.playing.as_mut() else { return true };
                        if p.id != id {
                            return true;
                        }
                        let finished = p.position() >= p.total || p.child.try_wait().ok().flatten().is_some();
                        if finished {
                            let _ = p.child.kill();
                            this.voice_msgs.playing = None;
                            this.voice_msgs.position.insert(id.clone(), 0.);
                        }
                        cx.notify();
                        finished
                    })
                    .unwrap_or(true);
                if done {
                    break;
                }
            }
        })
        .detach();
        cx.notify();
    }

    fn voice_toggle(&mut self, id: String, url: String, cx: &mut Context<Self>) {
        if self.voice_msgs.playing.as_ref().is_some_and(|p| p.id == id) {
            self.voice_stop();
            cx.notify();
            return;
        }
        let from = self.voice_msgs.position.get(&id).copied().unwrap_or(0.);
        self.voice_play(id, url, from, cx);
    }

    fn voice_transcribe(&mut self, id: String, cx: &mut Context<Self>) {
        if self.voice_msgs.transcripts.contains_key(&id) {
            if !self.voice_msgs.show_transcript.remove(&id) {
                self.voice_msgs.show_transcript.insert(id);
            }
            cx.notify();
            return;
        }
        if !self.voice_msgs.transcribing.insert(id.clone()) {
            return;
        }
        self.voice_msgs.errors.remove(&id);
        let client = self.client.clone();
        let mid = id.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.settings_post("/api/stt/transcribe", json!({ "messageId": mid })) }).await;
            this.update(cx, |this, cx| {
                this.voice_msgs.transcribing.remove(&id);
                match result {
                    Ok(v) => {
                        this.voice_msgs.transcripts.insert(id.clone(), v["text"].as_str().unwrap_or_default().to_string());
                        this.voice_msgs.show_transcript.insert(id);
                    }
                    Err(e) => {
                        this.voice_msgs.errors.insert(id, if e.to_string().is_empty() { "Could not transcribe that.".into() } else { e.to_string() });
                    }
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    /// Fetches and decodes a sound without playing it (preload="metadata": its length shows).
    fn voice_preload(&mut self, url: String, cx: &mut Context<Self>) {
        if self.voice_msgs.clips.contains_key(&url) || !self.voice_msgs.loading.insert(url.clone()) {
            return;
        }
        let client = self.client.clone();
        let key = url.clone();
        cx.spawn(async move |this, cx| {
            let decoded = cx.background_executor().spawn(async move { client.fetch(&key).ok().and_then(|(status, bytes)| (status < 400).then(|| crate::voice_clip::decode(&bytes)).flatten()) }).await;
            this.update(cx, |this, cx| {
                this.voice_msgs.loading.remove(&url);
                if let Some(pcm) = decoded {
                    this.voice_msgs.clips.insert(url, Arc::new(pcm));
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    /// InlineAudioAttachment (message-file-card.tsx): an audio file played here, with its name,
    /// Download, play / pause, a seekable bar and the two times.
    pub(super) fn render_inline_audio(&self, message: &Message, n: usize, file: &crate::model::FileRef, cx: &mut Context<Self>) -> AnyElement {
        let url = file.url.clone();
        let id = format!("file:{}:{n}", message.id);
        if !self.voice_msgs.clips.contains_key(&url) && !self.voice_msgs.loading.contains(&url) {
            let u = url.clone();
            cx.spawn(async move |this, cx| this.update(cx, |this, cx| this.voice_preload(u, cx)).ok()).detach();
        }
        let total = self.voice_msgs.clips.get(&url).map(|p| p.seconds()).unwrap_or(0.);
        let playing = self.voice_msgs.playing.as_ref().filter(|p| p.id == id);
        // HOFFLE_DEV_AUDIO_AT=<s>: shown as left there, to compare with the web.
        let dev_at = std::env::var("HOFFLE_DEV_AUDIO_AT").ok().and_then(|v| v.parse::<f32>().ok());
        let at = playing.map(|p| p.position()).unwrap_or_else(|| self.voice_msgs.position.get(&id).copied().or(dev_at).unwrap_or(0.));
        let share = if total > 0. { (at / total).clamp(0., 1.) } else { 0. };
        let clean = {
            let lower = file.name.to_lowercase();
            if lower.starts_with("spoiler_") || lower.starts_with("spoiler-") { file.name[8..].to_string() } else { file.name.clone() }
        };
        let white = |a: f32| gpui::white().opacity(a);
        let link = self.client.absolute(&file.url);
        let spot = self.audio_spots.borrow_mut().entry(id.clone()).or_default().clone();
        let (pid, purl, sid, surl) = (id.clone(), url.clone(), id.clone(), url.clone());
        let time = |s: f32| {
            let s = s.max(0.).floor() as u64;
            format!("{}:{:02}", s / 60, s % 60)
        };
        div()
            .w_full()
            .max_w(px(380.))
            .p(px(12.))
            .rounded(px(12.))
            .bg(gpui::hsla(0., 0., 0., 0.4))
            .border_1()
            .border_color(white(0.1))
            .flex()
            .flex_col()
            .gap(px(8.))
            .text_size(px(12.))
            .line_height(px(16.))
            .text_color(gpui::white())
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .gap(px(8.))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(8.))
                            .min_w_0()
                            .child(div().flex_none().size(px(28.)).rounded(px(8.)).bg(gpui::hsla(239. / 360., 0.84, 0.67, 0.2)).flex().items_center().justify_center().child(ui::icon("volume-2", 15., rgb(0x818cf8))))
                            .child(div().truncate().font_weight(FontWeight::MEDIUM).text_color(white(0.9)).child(clean.clone())),
                    )
                    .child(
                        div()
                            .id(SharedString::from(format!("{id}-dl")))
                            .flex_none()
                            .p(px(4.))
                            .rounded(px(4.))
                            .cursor_pointer()
                            .tooltip(ui::tooltip("Download audio"))
                            .child(ui::icon("download", 14., white(0.5)))
                            .on_click(move |_, _, cx| cx.open_url(&link)),
                    ),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(10.))
                    .child(
                        div()
                            .id(SharedString::from(format!("{id}-play")))
                            .flex_none()
                            .size(px(32.))
                            .rounded_full()
                            .bg(rgb(0x4f46e5))
                            .hover(|s| s.bg(rgb(0x6366f1)))
                            .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.2), offset: gpui::point(px(0.), px(4.)), blur_radius: px(6.), spread_radius: px(-1.) }])
                            .flex()
                            .items_center()
                            .justify_center()
                            .cursor_pointer()
                            .child(div().when(playing.is_none(), |d| d.ml(px(2.))).child(ui::icon(if playing.is_some() { "pause-filled" } else { "play-filled" }, 14., gpui::white())))
                            .on_click(cx.listener(move |this, _, _, cx| this.voice_toggle(pid.clone(), purl.clone(), cx))),
                    )
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .flex()
                            .flex_col()
                            .gap(px(4.))
                            .child(
                                div()
                                    .id(SharedString::from(format!("{id}-bar")))
                                    .relative()
                                    .h(px(6.))
                                    .rounded(px(8.))
                                    .bg(white(0.15))
                                    .cursor_pointer()
                                    .child(div().absolute().left_0().top_0().h_full().w(gpui::relative(share)).rounded(px(8.)).bg(rgb(0x818cf8)))
                                    .when(total > 0., |d| d.child(div().absolute().top(px(-4.)).left(gpui::relative(share)).ml(px(-14. * share)).size(px(14.)).rounded_full().bg(rgb(0x818cf8))))
                                    .child(super::profile_card::track(&spot))
                                    .on_mouse_down(gpui::MouseButton::Left, cx.listener(move |this, e: &gpui::MouseDownEvent, _, cx| {
                                        let b = spot.get();
                                        let Some(total) = this.voice_msgs.clips.get(&surl).map(|p| p.seconds()) else { return };
                                        let k = (f32::from(e.position.x - b.origin.x) / f32::from(b.size.width).max(1.)).clamp(0., 1.);
                                        let to = k * total;
                                        if this.voice_msgs.playing.as_ref().is_some_and(|p| p.id == sid) {
                                            this.voice_play(sid.clone(), surl.clone(), to, cx);
                                        } else {
                                            this.voice_msgs.position.insert(sid.clone(), to);
                                            cx.notify();
                                        }
                                    })),
                            )
                            .child(
                                div()
                                    .flex()
                                    .justify_between()
                                    .font_family(crate::theme::MONO_FONT)
                                    .text_size(px(10.))
                                    .line_height(px(13.3))
                                    .text_color(white(0.5))
                                    .child(time(at))
                                    .child(time(total)),
                            ),
                    ),
            )
            .into_any_element()
    }

    /// The card, for a `voice` message with its sound.
    pub(super) fn render_voice(&self, message: &Message, width: f32, _window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        if message.kind.as_deref() != Some("voice") {
            return None;
        }
        let url = message.audio.clone().filter(|a| !a.is_empty())?;
        let voice = message.payload.as_ref().and_then(|p| p.get("voice"));
        if let Some(t) = voice.and_then(|v| v.get("transcript")).and_then(|t| t.as_str())
            && !self.voice_msgs.transcripts.contains_key(&message.id)
        {
            // A stored transcript shows without asking the server (kept per render: cheap).
            let _ = t;
        }
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let lavender: Hsla = Theme::lavender().into();
        let id = message.id.clone();
        let playing = self.voice_msgs.playing.as_ref().filter(|p| p.id == id);
        let decoded = self.voice_msgs.clips.get(&url).map(|p| p.seconds());
        // Recorded webm often reports no length: the sender's is trusted.
        let total = voice.and_then(|v| v["durationMs"].as_f64()).filter(|d| *d > 0.).map(|d| d as f32 / 1000.).or(decoded).unwrap_or(0.);
        let position = playing.map(|p| p.position()).unwrap_or_else(|| self.voice_msgs.position.get(&id).copied().unwrap_or(0.));
        let progress = if total > 0. { (position / total).min(1.) } else { 0. };
        let bars: Vec<f32> = voice
            .and_then(|v| v["waveform"].as_array())
            .filter(|a| !a.is_empty())
            .map(|a| a.iter().take(96).map(|v| v.as_f64().unwrap_or(0.).clamp(6., 100.) as f32).collect())
            .unwrap_or_else(|| vec![30.; 48]);
        let speed = self.voice_msgs.speed.get(&id).copied().unwrap_or(1.);
        let stored = voice.and_then(|v| v.get("transcript")).and_then(|t| t.as_str()).map(String::from);
        let transcript = self.voice_msgs.transcripts.get(&id).cloned().or(stored.clone());
        let showing = self.voice_msgs.show_transcript.contains(&id);
        let loading = self.voice_msgs.loading.contains(&url);
        let card_w = width.min(360.);

        // `.voice-message-wave`: 2px bars 2px apart, as tall as the level; overflowing like the web's.
        let mut wave = div().flex().items_center().gap(px(2.)).h(px(30.));
        let n = bars.len();
        for (i, h) in bars.iter().enumerate() {
            let played = (i as f32) / (n as f32) < progress;
            wave = wave.child(div().flex_none().w(px(2.)).h(px(30. * h / 100.)).rounded(px(2.)).bg(if played { lavender } else { ink.opacity(0.3) }));
        }
        let (id1, url1, id2, url2) = (id.clone(), url.clone(), id.clone(), url.clone());
        let wave_w = card_w - 20. - 36. - 34. - 34. - 34. - 40.;
        let wave_box = div()
            .id(SharedString::from(format!("vm-wave-{id}")))
            .flex_1()
            .min_w_0()
            .h(px(30.))
            .cursor_pointer()
            .child(wave)
            .on_mouse_down(
                gpui::MouseButton::Left,
                cx.listener(move |this, e: &gpui::MouseDownEvent, _, cx| {
                    // Seek: the click's share of the wave's width, measured from the card's layout.
                    let Some(origin) = this.voice_wave_x.borrow().get(&id1).copied() else { return };
                    let ratio = ((f32::from(e.position.x) - origin) / wave_w.max(1.)).clamp(0., 1.);
                    let total = total.max(0.);
                    if this.voice_msgs.playing.as_ref().is_some_and(|p| p.id == id1) {
                        this.voice_play(id1.clone(), url1.clone(), ratio * total, cx);
                    } else {
                        this.voice_msgs.position.insert(id1.clone(), ratio * total);
                        cx.notify();
                    }
                }),
            );
        let spot = self.voice_wave_x.clone();
        let id_spot = id.clone();
        let wave_box = wave_box.child(gpui::canvas(move |bounds, _, _| {
            spot.borrow_mut().insert(id_spot.clone(), f32::from(bounds.origin.x));
        }, |_, _, _, _| {}).absolute().size_full());
        let pill = |key: String| div().id(SharedString::from(key)).flex_none().min_w(px(34.)).h(px(22.)).px(px(6.)).rounded_full().flex().items_center().justify_center().text_size(px(11.)).font_weight(FontWeight::BOLD).cursor_pointer();
        let id3 = id.clone();
        let id4 = id.clone();
        let speed_label = if speed.fract() == 0. { format!("{}×", speed as i32) } else { format!("{speed}×") };
        let player = div()
            .mt(px(6.))
            .w(px(card_w))
            .flex()
            .items_center()
            .gap(px(10.))
            .pl(px(8.))
            .pr(px(12.))
            .py(px(8.))
            .rounded_full()
            .bg(mix(Theme::lavender(), 0.14, Theme::panel()))
            .border_1()
            .border_color(Theme::line())
            .child(
                div()
                    .id(SharedString::from(format!("vm-play-{id}")))
                    .flex_none()
                    .size(px(36.))
                    .rounded_full()
                    .bg(lavender)
                    .flex()
                    .items_center()
                    .justify_center()
                    .cursor_pointer()
                    .child(if loading {
                        ui::icon("loader-circle", 16., rgb(0x15121f)).into_any_element()
                    } else {
                        ui::icon(if playing.is_some() { "pause-fill" } else { "play-fill" }, 16., rgb(0x15121f)).into_any_element()
                    })
                    .on_click(cx.listener(move |this, _, _, cx| this.voice_toggle(id2.clone(), url2.clone(), cx))),
            )
            .child(wave_box)
            .child(div().flex_none().min_w(px(34.)).text_size(px(12.)).text_color(muted).child(mmss(if playing.is_some() || position > 0. { position } else { total })))
            .child(pill(format!("vm-speed-{id}")).bg(ink.opacity(0.1)).text_color(ink).child(speed_label).on_click(cx.listener(move |this, _, _, cx| {
                let now = this.voice_msgs.speed.get(&id3).copied().unwrap_or(1.);
                let next = SPEEDS[(SPEEDS.iter().position(|s| *s == now).unwrap_or(0) + 1) % SPEEDS.len()];
                this.voice_msgs.speed.insert(id3.clone(), next);
                // Playing on at the new speed from where it is.
                if let Some(p) = this.voice_msgs.playing.as_ref().filter(|p| p.id == id3) {
                    let at = p.position();
                    let url = this.voice_msgs.clips.iter().find(|(_, c)| (c.seconds() - p.total).abs() < 0.01).map(|(u, _)| u.clone());
                    if let Some(url) = url {
                        this.voice_play(id3.clone(), url, at, cx);
                    }
                }
                cx.notify();
            })))
            .child(
                pill(format!("vm-cc-{id}"))
                    .when(showing, |d| d.bg(lavender))
                    .when(!showing, |d| d.bg(ink.opacity(0.1)))
                    .child(ui::icon(if self.voice_msgs.transcribing.contains(&id) { "loader-circle" } else { "captions" }, 13., if showing { rgb(0x15121f).into() } else { ink }))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if this.voice_msgs.transcripts.contains_key(&id4) || stored.is_some() {
                            if let Some(s) = stored.clone() {
                                this.voice_msgs.transcripts.entry(id4.clone()).or_insert(s);
                            }
                            if !this.voice_msgs.show_transcript.remove(&id4) {
                                this.voice_msgs.show_transcript.insert(id4.clone());
                            }
                            cx.notify();
                        } else {
                            this.voice_transcribe(id4.clone(), cx);
                        }
                    })),
            );
        let error = self.voice_msgs.errors.get(&id).cloned();
        if !showing && error.is_none() {
            return Some(player.into_any_element());
        }
        let line = match error {
            Some(e) => div().italic().text_color(muted).child(e),
            None => div().text_color(ink).child(transcript.filter(|t| !t.is_empty()).unwrap_or_else(|| "No speech in this clip.".into())),
        };
        Some(div().w(px(card_w)).child(player).child(div().mt(px(6.)).px(px(12.)).py(px(6.)).border_l_2().border_color(lavender).text_size(px(13.)).line_height(px(18.85)).child(line)).into_any_element())
    }
}


impl Shell {
    pub(super) fn dev_record(&mut self, secs: u64, cx: &mut Context<Self>) {
        // Never a system prompt from a test run: record only where the mic is already allowed.
        let permission = crate::recorder::permission();
        crate::trace(format!("voice message: microphone permission {permission}"));
        if permission != 3 {
            return;
        }
        self.start_recording(cx);
        cx.spawn(async move |this, cx| {
            cx.background_executor().timer(std::time::Duration::from_secs(secs)).await;
            this.update(cx, |this, cx| this.send_recording(cx)).ok();
        })
        .detach();
    }

    pub(super) fn is_recording(&self) -> bool {
        self.voice_msgs.recording.is_some() || self.voice_msgs.sending
    }

    /// start(): the mic on, the meter running, stopping by itself at five minutes.
    pub(super) fn start_recording(&mut self, cx: &mut Context<Self>) {
        if self.is_recording() || self.channel_id.is_none() {
            return;
        }
        match crate::recorder::permission() {
            3 => {}
            // Not asked yet: macOS asks, and recording starts once it is allowed.
            0 => {
                let (tx, rx) = std::sync::mpsc::channel();
                crate::recorder::ask_permission(move |granted| {
                    let _ = tx.send(granted);
                });
                cx.spawn(async move |this, cx| {
                    let granted = cx.background_executor().spawn(async move { rx.recv().unwrap_or(false) }).await;
                    this.update(cx, |this, cx| {
                        if granted {
                            this.start_recording(cx);
                        } else {
                            this.status = Some("Microphone access was blocked.".into());
                            cx.notify();
                        }
                    })
                    .ok();
                })
                .detach();
                return;
            }
            _ => {
                self.status = Some("Microphone access was blocked. Allow Hoffle in System Settings → Privacy & Security → Microphone.".into());
                cx.notify();
                return;
            }
        }
        match crate::recorder::Recorder::start() {
            Ok(rec) => {
                crate::trace(format!("voice message: recording to {}", rec.path.display()));
                self.voice_msgs.recording = Some(rec);
            }
            Err(e) => {
                crate::trace(format!("voice message: no recording: {e}"));
                self.status = Some(e.into());
                cx.notify();
                return;
            }
        }
        cx.spawn(async move |this, cx| {
            loop {
                cx.background_executor().timer(std::time::Duration::from_millis(100)).await;
                let go_on = this
                    .update(cx, |this, cx| {
                        let Some(rec) = this.voice_msgs.recording.as_mut() else { return false };
                        rec.sample();
                        let full = rec.seconds() >= crate::recorder::MAX_SECONDS;
                        if full {
                            this.send_recording(cx);
                        }
                        cx.notify();
                        !full
                    })
                    .unwrap_or(false);
                if !go_on {
                    break;
                }
            }
        })
        .detach();
        cx.notify();
    }

    pub(super) fn cancel_recording(&mut self, cx: &mut Context<Self>) {
        if let Some(rec) = self.voice_msgs.recording.take() {
            rec.cancel();
        }
        cx.notify();
    }

    /// finish(true): the file up as a voice upload, then the message with its length and waveform.
    fn send_recording(&mut self, cx: &mut Context<Self>) {
        let Some(rec) = self.voice_msgs.recording.take() else { return };
        let (path, seconds, waveform) = rec.finish();
        crate::trace(format!("voice message: {seconds:.2}s, {} bytes", std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0)));
        let Some(channel) = self.channel_id.clone() else { return };
        if seconds < 0.5 {
            let _ = std::fs::remove_file(&path);
            cx.notify();
            return;
        }
        self.voice_msgs.sending = true;
        let reply = self.reply_to.take().map(|(id, _)| id);
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    let bytes = std::fs::read(&path)?;
                    let _ = std::fs::remove_file(&path);
                    let name = format!("voice-{}.m4a", chrono::Utc::now().timestamp_millis());
                    let key = client.upload_voice(&name, "audio/mp4", &bytes)?;
                    let encoded: String = url::form_urlencoded::byte_serialize(key.as_bytes()).collect();
                    let mut body = json!({
                        "channelId": channel,
                        "content": format!("Voice message ({})", mmss(seconds)),
                        "audio": format!("/hangout/api/uploads/{}", encoded.replace('+', "%20")),
                        "kind": "voice",
                        "payload": { "voice": { "durationMs": (seconds * 1000.).round() as u64, "waveform": waveform } },
                    });
                    if let Some(reply) = reply {
                        body["replyTo"] = json!(reply);
                    }
                    client.post_message(body)
                })
                .await;
            this.update(cx, |this, cx| {
                this.voice_msgs.sending = false;
                match result {
                    Ok(message) => this.add_message(message, cx),
                    Err(e) => {
                        crate::trace(format!("voice message: not sent: {e}"));
                        this.status = Some(if e.to_string().is_empty() { "Couldn't send that voice message.".to_string() } else { e.to_string() }.into())
                    }
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    /// VoiceRecordingBar: discard, the dot, the time, Paused, the live meter, pause / resume, send.
    pub(super) fn render_recording_bar(&self, cx: &mut Context<Self>) -> AnyElement {
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let lavender: Hsla = Theme::lavender().into();
        let red: Hsla = rgb(0xed4245).into();
        let sending = self.voice_msgs.sending;
        let rec = self.voice_msgs.recording.as_ref();
        let paused = rec.is_some_and(|r| r.paused);
        let levels: Vec<f32> = rec.map(|r| r.levels.iter().rev().take(40).rev().copied().collect()).unwrap_or_default();
        let mut meter = div().flex_1().min_w_0().h(px(28.)).flex().items_center().justify_end().gap(px(2.)).overflow_hidden();
        for i in 0..40 {
            let level = if i + levels.len() >= 40 { levels[i + levels.len() - 40] } else { 0. };
            meter = meter.child(div().flex_none().w(px(3.)).h(px(28. * (level * 100.).max(8.) / 100.)).rounded(px(2.)).bg(lavender));
        }
        let square = |id: &'static str, icon: &'static str, danger: bool| {
            div()
                .id(id)
                .flex_none()
                .size(px(34.))
                .rounded(px(10.))
                .flex()
                .items_center()
                .justify_center()
                .text_color(muted)
                .when(!sending, |d| d.cursor_pointer())
                .hover(move |s| if danger { s.bg(red.opacity(0.12)) } else { s.bg(ink.opacity(0.1)) })
                .child(ui::icon(icon, 16., muted))
        };
        let seconds = rec.map(|r| r.seconds()).unwrap_or(0.);
        div()
            .flex_1()
            .min_w_0()
            .pl(px(2.))
            .flex()
            .items_center()
            .gap(px(10.))
            .child(square("rec-cancel", "trash-2", true).tooltip(ui::tooltip("Discard (Esc)".to_string())).when(!sending, |d| d.on_click(cx.listener(|this, _, _, cx| this.cancel_recording(cx)))))
            .child(div().flex_none().size(px(10.)).rounded_full().bg(if sending { lavender } else if paused { muted } else { red }))
            .child(div().flex_none().min_w(px(44.)).text_size(px(13.)).font_weight(FontWeight::BOLD).text_color(ink).child(if sending { "Sending…".to_string() } else { mmss(seconds) }))
            .when(paused, |d| d.child(div().flex_none().text_size(px(12.)).text_color(muted).child("Paused")))
            .child(meter)
            .child(square("rec-pause", if paused { "mic" } else { "pause" }, false).tooltip(ui::tooltip(if paused { "Resume".to_string() } else { "Pause".to_string() })).when(!sending, |d| {
                d.on_click(cx.listener(|this, _, _, cx| {
                    if let Some(rec) = this.voice_msgs.recording.as_mut() {
                        rec.toggle_pause();
                    }
                    cx.notify();
                }))
            }))
            .child(
                div()
                    .id("rec-send")
                    .flex_none()
                    .size(px(32.))
                    .rounded(px(12.))
                    .bg(Theme::send())
                    .flex()
                    .items_center()
                    .justify_center()
                    .when(!sending, |d| d.cursor_pointer().on_click(cx.listener(|this, _, _, cx| this.send_recording(cx))))
                    .child(ui::icon("send", 15., rgb(0x15121f))),
            )
            .into_any_element()
    }
}

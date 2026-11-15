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
    clips: HashMap<String, Arc<Pcm>>,
    loading: std::collections::HashSet<String>,
    transcripts: HashMap<String, String>,
    show_transcript: std::collections::HashSet<String>,
    transcribing: std::collections::HashSet<String>,
    errors: HashMap<String, String>,
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

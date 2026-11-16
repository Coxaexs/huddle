//! Reading /tts messages aloud (use-shell-realtime.ts → lib/tts/client.ts speakMessage): to whoever
//! has the channel open, unless the sender is blocked or muted for everyone, and unless hearing
//! /tts is off in Settings → Text-to-Speech. The voices are the web's own: its TTS client runs in
//! a hidden web view (resources/web/tts.html), Turkish through the server's Alania-2 and English
//! through the in-browser models, queued one after another there. Also the voice preview in
//! Settings, and an admin's /ttsstop.

use std::cell::Cell;
use std::rc::Rc;
use std::time::Duration;

use gpui::{Context, Window};
use serde_json::{Value, json};

use super::Shell;
use crate::model::Message;
use crate::webview::WebOverlay;

#[derive(Default)]
pub(super) struct Speech {
    view: Option<WebOverlay>,
    /// The page's script has run (`window.__speak` exists).
    ready: Rc<Cell<bool>>,
    /// Calls waiting for the page.
    queue: Vec<String>,
    polling: bool,
}

impl Shell {
    /// `__speak(text, lang, voice)` once the page can take it.
    pub(super) fn speak(&mut self, text: &str, lang: &str, voice: &Value, cx: &mut Context<Self>) {
        let call = format!("window.__speak({}, {}, {})", json!(text), json!(if lang == "tr" { "tr" } else { "en" }), voice);
        if self.speech.ready.get()
            && let Some(view) = &self.speech.view
        {
            view.eval(&call);
            return;
        }
        self.speech.queue.push(call);
        cx.notify();
    }

    /// An incoming message: read it aloud when it is a /tts here.
    pub(super) fn maybe_speak(&mut self, message: &Message, cx: &mut Context<Self>) {
        let Some(tts) = message.payload.as_ref().and_then(|p| p.get("tts")).filter(|v| !v.is_null() && v.as_bool() != Some(false)) else { return };
        if message.channel_id.is_none() || message.channel_id != self.channel_id {
            return;
        }
        if let Some(user) = &message.user_id
            && (self.friends.blocked.iter().any(|b| &b.id == user) || self.forced_mutes.contains(user))
        {
            return;
        }
        if !super::settings::tts_playback_enabled() {
            return;
        }
        let lang = tts.get("lang").and_then(Value::as_str).unwrap_or("en").to_string();
        // The sender's voice; the page clamps it (a payload is just data).
        let voice = tts.get("voice").cloned().unwrap_or(Value::Null);
        let text = message.text.clone();
        self.speak(&text, &lang, &voice, cx);
    }

    /// An admin's /ttsstop for the channel open here or the call you are in.
    pub(super) fn on_tts_stop(&mut self, value: &Value, cx: &mut Context<Self>) {
        let channel = value.get("channelId").and_then(Value::as_str).unwrap_or("");
        let here = self.channel_id.as_deref() == Some(channel);
        let in_call = self.call.as_ref().is_some_and(|c| c.channel_id == channel);
        if !here && !in_call {
            return;
        }
        self.speech.queue.clear();
        if let Some(view) = &self.speech.view {
            view.eval("window.__stopTts && window.__stopTts()");
        }
        let by = value.get("by").and_then(Value::as_str).unwrap_or("Someone").to_string();
        self.set_notice(format!("{by} stopped text-to-speech."), cx);
    }

    /// Each frame: the page is made when something is waiting for it, then fed once it is ready.
    pub(super) fn speech_tick(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.speech.queue.is_empty() {
            return;
        }
        if self.speech.view.is_none() {
            let base = self.client.base().to_string();
            let session = self.client.token().map(|t| (crate::api::SESSION_COOKIE.to_string(), t));
            self.speech.view = crate::webview::speech_view(window, &base, session);
            if self.speech.view.is_none() {
                self.speech.queue.clear();
                return;
            }
        }
        if self.speech.polling {
            return;
        }
        self.speech.polling = true;
        cx.spawn(async move |this, cx| {
            for _ in 0..80 {
                let done = this
                    .update(cx, |this, _| {
                        if this.speech.ready.get() {
                            if let Some(view) = &this.speech.view {
                                for call in this.speech.queue.drain(..) {
                                    view.eval(&call);
                                }
                            }
                            return true;
                        }
                        let ready = this.speech.ready.clone();
                        if let Some(view) = &this.speech.view {
                            view.eval_with("typeof window.__speak", move |kind| {
                                if kind == "function" {
                                    ready.set(true);
                                }
                            });
                        }
                        false
                    })
                    .unwrap_or(true);
                if done {
                    break;
                }
                cx.background_executor().timer(Duration::from_millis(250)).await;
            }
            this.update(cx, |this, _| this.speech.polling = false).ok();
        })
        .detach();
    }

    /// HOFFLE_DEV_TTS_LOG: prints what the speech page did (started, ended, errors) every 2 s.
    pub(super) fn dev_tts_log(&mut self, cx: &mut Context<Self>) {
        static STARTED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
        if std::env::var_os("HOFFLE_DEV_TTS_LOG").is_none() || STARTED.swap(true, std::sync::atomic::Ordering::Relaxed) {
            return;
        }
        cx.spawn(async move |this, cx| {
            loop {
                cx.background_executor().timer(Duration::from_secs(2)).await;
                let alive = this
                    .update(cx, |this, _| {
                        if let Some(view) = &this.speech.view {
                            view.eval_with("JSON.stringify(window.__ttsLog || null)", |log| eprintln!("tts log: {log}"));
                        }
                    })
                    .is_ok();
                if !alive {
                    break;
                }
            }
        })
        .detach();
    }

    /// "Speak message": a /tts keeps its sender's language and voice; anything else is guessed and
    /// read in this computer's voice.
    pub(super) fn speak_message(&mut self, message: &Message, cx: &mut Context<Self>) {
        if speakable(&message.text).is_empty() {
            self.set_notice("There is nothing in that message to read aloud.", cx);
            return;
        }
        let tts = message.payload.as_ref().and_then(|p| p.get("tts")).filter(|v| !v.is_null() && v.as_bool() != Some(false)).cloned();
        let (lang, voice) = match tts {
            Some(tts) => (tts.get("lang").and_then(Value::as_str).unwrap_or("en").to_string(), tts.get("voice").cloned().unwrap_or(Value::Null)),
            None => (detect_language(&message.text).unwrap_or("en").to_string(), super::settings::tts_voice()),
        };
        let text = message.text.clone();
        self.speak(&text, &lang, &voice, cx);
    }
}

/// speakableText(): no links, emoji codes, code blocks, style tags or markup (here only to tell
/// whether anything is left; the page cleans the text itself).
fn speakable(text: &str) -> String {
    let mut out = String::new();
    for word in text.split_whitespace() {
        if word.starts_with("http://") || word.starts_with("https://") {
            continue;
        }
        if word.len() > 2 && word.starts_with(':') && word.ends_with(':') {
            continue;
        }
        out.push_str(word);
        out.push(' ');
    }
    out.chars().filter(|c| !matches!(c, '*' | '_' | '~' | '`' | '|' | '>' | '#')).collect::<String>().trim().to_string()
}

/// detectLanguage(): Turkish letters settle it, else the commoner short words; a tie is None.
fn detect_language(text: &str) -> Option<&'static str> {
    const TURKISH: [&str; 61] = [
        "ve", "bir", "bu", "da", "de", "ne", "mi", "mı", "mu", "mü", "ben", "sen", "o", "biz", "siz", "onlar", "için", "ile", "gibi", "ama", "çok", "var", "yok", "evet", "hayır", "tamam",
        "merhaba", "selam", "nasıl", "neden", "niye", "nerede", "kim", "şimdi", "sonra", "önce", "daha", "en", "her", "hiç", "abi", "kanka", "lan", "ya", "yani", "işte", "bence", "olur", "oldu",
        "değil", "geliyorum", "gel", "hadi", "haydi", "iyi", "kötü", "güzel", "zar", "at", "bak", "bi",
    ];
    const TURKISH_MORE: [&str; 3] = ["şu", "naber", "nasılsın"];
    const ENGLISH: [&str; 56] = [
        "the", "and", "a", "an", "is", "are", "was", "were", "i", "you", "he", "she", "it", "we", "they", "to", "of", "in", "on", "for", "with", "this", "that", "what", "why", "how", "where",
        "who", "yes", "no", "not", "do", "does", "did", "have", "has", "can", "will", "just", "my", "your", "hello", "hi", "hey", "ok", "okay", "lol", "please", "thanks", "roll", "attack", "go",
        "be", "", "", "",
    ];
    if text.chars().any(|c| "çğıöşüÇĞİÖŞÜ".contains(c)) {
        return Some("tr");
    }
    let (mut tr, mut en) = (0, 0);
    // toLocaleLowerCase("tr"): I → ı, İ → i.
    let lower: String = text.chars().map(|c| match c {
        'I' => 'ı',
        'İ' => 'i',
        c => c.to_lowercase().next().unwrap_or(c),
    }).collect();
    for word in lower.split(|c: char| !c.is_alphabetic()).filter(|w| !w.is_empty()) {
        if TURKISH.contains(&word) || TURKISH_MORE.contains(&word) {
            tr += 1;
        }
        if ENGLISH.contains(&word) {
            en += 1;
        }
    }
    match tr.cmp(&en) {
        std::cmp::Ordering::Equal => None,
        std::cmp::Ordering::Greater => Some("tr"),
        std::cmp::Ordering::Less => Some("en"),
    }
}

//! Voice rooms through LiveKit, natively.
//!
//! Audio goes through libwebrtc's own device module (`PlatformAudio`): CoreAudio's plain HAL unit on
//! macOS with WebRTC's software echo canceller, noise suppression and gain control, the same path
//! Chrome uses. The web view build (Hoffle Lite on WKWebView) instead lands in Apple's voice-processing
//! unit, which plays the whole room through a 24 kHz phone-call engine.
//!
//! The UI talks to this module over channels: it sends commands and gets `VoiceEvent`s back. LiveKit
//! needs tokio, so the room lives on its own small runtime.

use std::collections::HashSet;

use livekit::options::{AudioEncoding, TrackPublishOptions};
use livekit::prelude::*;
use livekit::{PlatformAudio, RoomOptions};
use smol::channel::{Receiver, Sender, unbounded};
use tokio::sync::mpsc;

pub enum VoiceCmd {
    Join { url: String, token: String, bitrate: u64, muted: bool, deafened: bool },
    /// Leave the room; the sender, if any, hears back once LiveKit was told.
    Leave(Option<std::sync::mpsc::Sender<()>>),
    Mute(bool),
    Deafen(bool),
    /// People this app should not play ("Mute for me"), by user id.
    MuteFor(std::collections::HashSet<String>),
    /// Settings → Voice & Video: devices and libwebrtc's processing, now and for later calls.
    Audio(AudioPrefs),
}

/// The microphone and speakers to use (None: the system's) and the processing switches, kept on
/// this computer like the web's device and mic settings.
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AudioPrefs {
    pub input: Option<String>,
    pub output: Option<String>,
    pub noise_suppression: bool,
    pub echo_cancellation: bool,
    pub auto_gain: bool,
}

impl Default for AudioPrefs {
    fn default() -> Self {
        Self { input: None, output: None, noise_suppression: true, echo_cancellation: true, auto_gain: true }
    }
}

fn prefs_path() -> Option<std::path::PathBuf> {
    Some(dirs::config_dir()?.join("Hoffle Lite").join("audio.json"))
}

pub fn load_prefs() -> AudioPrefs {
    prefs_path().and_then(|p| std::fs::read(p).ok()).and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

pub fn save_prefs(prefs: &AudioPrefs) {
    if let Some(path) = prefs_path() {
        let _ = std::fs::create_dir_all(path.parent().unwrap_or(&path));
        let _ = std::fs::write(path, serde_json::to_vec(prefs).unwrap_or_default());
    }
}

/// The microphones and speakers the system has: (id, name) each.
pub fn list_devices() -> (Vec<(String, String)>, Vec<(String, String)>) {
    match PlatformAudio::new() {
        Ok(audio) => (
            audio.recording_devices().map(|d| (d.id.as_str().to_string(), d.name.clone())).collect(),
            audio.playout_devices().map(|d| (d.id.as_str().to_string(), d.name.clone())).collect(),
        ),
        Err(_) => (Vec::new(), Vec::new()),
    }
}

/// Puts the chosen devices and processing on this audio module.
fn apply_prefs(audio: &PlatformAudio, prefs: &AudioPrefs, live: bool) {
    use livekit::{PlayoutDeviceId, RecordingDeviceId};
    if let Some(id) = prefs.input.as_deref().filter(|i| !i.is_empty()) {
        let id = RecordingDeviceId::from_unchecked_guid(id);
        let result = if live { audio.switch_recording_device(&id) } else { audio.set_recording_device(&id) };
        if let Err(e) = result {
            log_err(format!("input device not set: {e}"));
        }
    }
    if let Some(id) = prefs.output.as_deref().filter(|i| !i.is_empty()) {
        let id = PlayoutDeviceId::from_unchecked_guid(id);
        let result = if live { audio.switch_playout_device(&id) } else { audio.set_playout_device(&id) };
        if let Err(e) = result {
            log_err(format!("output device not set: {e}"));
        }
    }
    let _ = audio.set_noise_suppression(prefs.noise_suppression, false);
    let _ = audio.set_echo_cancellation(prefs.echo_cancellation, false);
    let _ = audio.set_auto_gain_control(prefs.auto_gain, false);
}

#[derive(Debug)]
pub enum VoiceEvent {
    Connected,
    Reconnecting,
    /// Gone for good: kicked, network lost past LiveKit's own retries, or left.
    Disconnected(String),
    /// LiveKit identities (`userId|connectionId`) talking right now.
    Speaking(HashSet<String>),
    Error(String),
}

pub struct Voice {
    commands: mpsc::UnboundedSender<VoiceCmd>,
    _runtime: tokio::runtime::Runtime,
}

impl Voice {
    pub fn start() -> (Self, Receiver<VoiceEvent>) {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .thread_name("hoffle-voice")
            .enable_all()
            .build()
            .expect("voice runtime");
        let (commands, rx) = mpsc::unbounded_channel();
        let (events_tx, events_rx) = unbounded();
        runtime.spawn(run(rx, events_tx));
        (Self { commands, _runtime: runtime }, events_rx)
    }

    pub fn send(&self, command: VoiceCmd) {
        let _ = self.commands.send(command);
    }

    /// For quitting: leave and wait (briefly) until LiveKit has been told, so the seat does not
    /// linger for everyone else until the server times it out.
    pub fn leave_blocking(&self, timeout: std::time::Duration) -> bool {
        let (done, wait) = std::sync::mpsc::channel();
        self.send(VoiceCmd::Leave(Some(done)));
        wait.recv_timeout(timeout).is_ok()
    }
}

struct Session {
    room: Room,
    mic: LocalAudioTrack,
    deafened: bool,
    muted_for: std::collections::HashSet<String>,
    // Kept alive for as long as the call: dropping the last handle turns the devices off.
    audio: PlatformAudio,
    events: mpsc::UnboundedReceiver<RoomEvent>,
}

async fn run(mut commands: mpsc::UnboundedReceiver<VoiceCmd>, events: Sender<VoiceEvent>) {
    let mut session: Option<Session> = None;
    let mut prefs = load_prefs();
    loop {
        let room_event = async {
            match session.as_mut() {
                Some(s) => s.events.recv().await,
                None => std::future::pending().await,
            }
        };
        tokio::select! {
            command = commands.recv() => {
                let Some(command) = command else { break };
                match command {
                    VoiceCmd::Join { url, token, bitrate, muted, deafened } => {
                        if let Some(old) = session.take() {
                            let _ = old.room.close().await;
                        }
                        match join(&url, &token, bitrate, muted, deafened, &prefs).await {
                            Ok(s) => {
                                session = Some(s);
                                let _ = events.send(VoiceEvent::Connected).await;
                            }
                            Err(err) => {
                                let _ = events.send(VoiceEvent::Error(err)).await;
                            }
                        }
                    }
                    VoiceCmd::Leave(done) => {
                        if let Some(old) = session.take() {
                            let _ = old.room.close().await;
                        }
                        if let Some(done) = done {
                            let _ = done.send(());
                        }
                        let _ = events.send(VoiceEvent::Disconnected("left".into())).await;
                    }
                    VoiceCmd::Mute(muted) => {
                        if let Some(s) = &session {
                            if muted { s.mic.mute() } else { s.mic.unmute() }
                        }
                    }
                    VoiceCmd::Deafen(deafened) => {
                        if let Some(s) = session.as_mut() {
                            s.deafened = deafened;
                            set_hearing(s);
                        }
                    }
                    VoiceCmd::MuteFor(users) => {
                        if let Some(s) = session.as_mut() {
                            s.muted_for = users;
                            set_hearing(s);
                        }
                    }
                    VoiceCmd::Audio(next) => {
                        if let Some(s) = &session {
                            apply_prefs(&s.audio, &next, true);
                        }
                        prefs = next;
                    }
                }
            }
            event = room_event => {
                let Some(event) = event else {
                    session = None;
                    let _ = events.send(VoiceEvent::Disconnected("The voice connection closed.".into())).await;
                    continue;
                };
                match event {
                    RoomEvent::ActiveSpeakersChanged { speakers } => {
                        let ids = speakers.iter().map(|p| p.identity().to_string()).collect();
                        let _ = events.send(VoiceEvent::Speaking(ids)).await;
                    }
                    RoomEvent::TrackSubscribed { publication, participant, .. } => {
                        // Someone new while deafened (or muted for this app) stays unheard too.
                        if session.as_ref().is_some_and(|s| s.deafened || s.muted_for.contains(user_of(participant.identity().as_str()))) {
                            publication.set_enabled(false);
                        }
                    }
                    RoomEvent::Reconnecting => {
                        let _ = events.send(VoiceEvent::Reconnecting).await;
                    }
                    RoomEvent::Reconnected => {
                        let _ = events.send(VoiceEvent::Connected).await;
                    }
                    RoomEvent::Disconnected { reason } => {
                        session = None;
                        let _ = events.send(VoiceEvent::Disconnected(format!("{reason:?}"))).await;
                    }
                    _ => {}
                }
            }
        }
    }
}

async fn join(url: &str, token: &str, bitrate: u64, muted: bool, deafened: bool, prefs: &AudioPrefs) -> Result<Session, String> {
    let audio = PlatformAudio::new().map_err(|e| format!("No microphone or speakers found ({e})."))?;
    apply_prefs(&audio, prefs, false);
    let (room, room_events) = Room::connect(url, token, RoomOptions::default())
        .await
        .map_err(|e| format!("Could not reach the voice server: {e}"))?;

    let mic = LocalAudioTrack::create_audio_track("microphone", audio.rtc_source());
    if muted {
        mic.mute();
    }
    // As the web client does (app/lib/sfu-voice.ts): no DTX, and redundant packets up to 192 kbps,
    // above which two copies no longer fit one packet.
    let options = TrackPublishOptions {
        source: TrackSource::Microphone,
        dtx: false,
        red: bitrate <= 192_000,
        audio_encoding: Some(AudioEncoding { max_bitrate: bitrate }),
        ..Default::default()
    };
    // A listen-only seat (stage audience, timed out) has no publish right; stay in and listen.
    if let Err(err) = room.local_participant().publish_track(LocalTrack::Audio(mic.clone()), options).await {
        log_err(format!("microphone not published: {err}"));
    }
    let session = Session { room, mic, deafened, muted_for: Default::default(), audio, events: room_events };
    if deafened {
        set_hearing(&session);
    }
    Ok(session)
}

/// Plays everyone's audio unless deafened, except the people muted for this app.
fn set_hearing(s: &Session) {
    for participant in s.room.remote_participants().values() {
        let on = !s.deafened && !s.muted_for.contains(user_of(participant.identity().as_str()));
        for publication in participant.track_publications().values() {
            if publication.kind() == TrackKind::Audio {
                publication.set_enabled(on);
            }
        }
    }
}

/// A LiveKit identity is `userId|connectionId`.
fn user_of(identity: &str) -> &str {
    identity.split('|').next().unwrap_or(identity)
}

fn log_err(message: String) {
    eprintln!("voice: {message}");
}

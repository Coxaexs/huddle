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
    /// Tune in to (or out of) someone's screen share, by LiveKit identity.
    Watch(String, bool),
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
    /// A camera or screen share's newest picture (BGRA, as gpui draws), or None when it stopped.
    Video { identity: String, screen: bool, frame: Option<std::sync::Arc<gpui::RenderImage>> },
    /// Someone shares their screen: nothing is received until you tune in (`VoiceCmd::Watch`).
    ScreenOffered(String),
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
    /// Screen shares in the call, by identity: kept off until tuned in.
    screens: std::collections::HashMap<String, RemoteTrackPublication>,
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
                    VoiceCmd::Watch(identity, on) => {
                        if let Some(publication) = session.as_ref().and_then(|s| s.screens.get(&identity)) {
                            publication.set_enabled(on);
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
                    RoomEvent::TrackSubscribed { track, publication, participant } => {
                        if let RemoteTrack::Video(video) = track {
                            let screen = publication.source() == TrackSource::Screenshare;
                            let identity = participant.identity().to_string();
                            if screen {
                                // Tune-in: a remote screen share arrives paused until you choose to see it.
                                publication.set_enabled(false);
                                if let Some(s) = session.as_mut() {
                                    s.screens.insert(identity.clone(), publication.clone());
                                }
                                let _ = events.send(VoiceEvent::ScreenOffered(identity.clone())).await;
                            }
                            tokio::spawn(watch_video(video, identity, screen, events.clone()));
                            continue;
                        }
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
    let session = Session { room, mic, deafened, muted_for: Default::default(), screens: Default::default(), audio, events: room_events };
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
/// Development: an I420 picture of one colour (BT.601 limited range), converted the way remote
/// video is, for checking the byte order and the tiles without a second account in the call.
pub fn test_picture(r: u8, g: u8, b: u8, w: u32, h: u32) -> std::sync::Arc<gpui::RenderImage> {
    use livekit::webrtc::prelude::I420Buffer;
    use livekit::webrtc::video_frame::VideoFormatType;
    use livekit::webrtc::video_frame::native::VideoFrameBufferExt;
    let (rf, gf, bf) = (r as f32, g as f32, b as f32);
    let y = (16. + 0.257 * rf + 0.504 * gf + 0.098 * bf).round() as u8;
    let u = (128. - 0.148 * rf - 0.291 * gf + 0.439 * bf).round() as u8;
    let v = (128. + 0.439 * rf - 0.368 * gf - 0.071 * bf).round() as u8;
    let mut i420 = I420Buffer::new(w, h);
    {
        let (ys, us, vs) = i420.data_mut();
        ys.fill(y);
        us.fill(u);
        vs.fill(v);
    }
    let mut bgra = vec![0u8; (w * h * 4) as usize];
    i420.to_argb(VideoFormatType::ARGB, &mut bgra, w * 4, w as i32, h as i32);
    crate::trace(format!("video test picture: asked rgb({r},{g},{b}), first bytes {:?}", &bgra[..4]));
    let image = image::RgbaImage::from_raw(w, h, bgra).expect("picture");
    std::sync::Arc::new(gpui::RenderImage::new(smallvec::smallvec![image::Frame::new(image)]))
}

/// A remote camera or screen share, decoded: at most 30 pictures a second, the widest side kept to
/// 1920px, converted to the BGRA gpui draws. Ends (sending None) when the track does.
async fn watch_video(video: RemoteVideoTrack, identity: String, screen: bool, events: Sender<VoiceEvent>) {
    use futures_util::StreamExt;
    use livekit::webrtc::video_frame::VideoFormatType;
    use livekit::webrtc::video_frame::native::VideoFrameBufferExt;
    use livekit::webrtc::prelude::VideoBuffer;
    use livekit::webrtc::video_stream::native::NativeVideoStream;
    let mut stream = NativeVideoStream::new(video.rtc_track());
    let mut last: Option<std::time::Instant> = None;
    while let Some(frame) = stream.next().await {
        if last.is_some_and(|at| at.elapsed() < std::time::Duration::from_millis(33)) {
            continue;
        }
        last = Some(std::time::Instant::now());
        let buffer = &frame.buffer;
        let i420 = match (buffer.as_native(), buffer.as_i420()) {
            (Some(native), _) => native.to_i420(),
            (None, Some(i420)) => i420.to_i420(),
            _ => continue,
        };
        let (w, h) = (i420.width(), i420.height());
        if w == 0 || h == 0 {
            continue;
        }
        let shrink = (1920f32 / w.max(h) as f32).min(1.);
        let (dw, dh) = (((w as f32 * shrink) as u32).max(2) & !1, ((h as f32 * shrink) as u32).max(2) & !1);
        let mut bgra = vec![0u8; (dw * dh * 4) as usize];
        // libyuv's "ARGB" is B, G, R, A in memory.
        i420.to_argb(VideoFormatType::ARGB, &mut bgra, dw * 4, dw as i32, dh as i32);
        let Some(image) = image::RgbaImage::from_raw(dw, dh, bgra) else { continue };
        let picture = std::sync::Arc::new(gpui::RenderImage::new(smallvec::smallvec![image::Frame::new(image)]));
        if events.send(VoiceEvent::Video { identity: identity.clone(), screen, frame: Some(picture) }).await.is_err() {
            return;
        }
    }
    let _ = events.send(VoiceEvent::Video { identity, screen, frame: None }).await;
}

fn user_of(identity: &str) -> &str {
    identity.split('|').next().unwrap_or(identity)
}

fn log_err(message: String) {
    eprintln!("voice: {message}");
}

//! Voice cues (lib/audio-cues.ts): mute, deafen, people joining and leaving, disconnecting… The web
//! synthesizes them with Web Audio; these are those same cues rendered once by the web's own code
//! (an OfflineAudioContext in Chrome) and bundled as WAV files. Each can be switched off in
//! Settings → Voice & Video → Sounds, kept on this computer.

use std::collections::HashSet;
use std::sync::Mutex;

/// In the order Settings lists them; the first four are always shown.
pub const SOUNDS: [(&str, &str); 17] = [
    ("deafen", "Deafen"),
    ("undeafen", "Undeafen"),
    ("mute", "Mute"),
    ("unmute", "Unmute"),
    ("userJoin", "User join"),
    ("userLeave", "User leave"),
    ("disconnect", "Voice disconnected"),
    ("pttOn", "Push to talk activate"),
    ("pttOff", "Push to talk deactivate"),
    ("cameraOn", "Camera on"),
    ("cameraOff", "Camera off"),
    ("shareStart", "Stream started"),
    ("shareStop", "Stream stopped"),
    ("callAnswer", "Call answered"),
    ("callEnd", "Call ended"),
    ("ringOut", "Outgoing ring"),
    ("ringIn", "Incoming ring"),
];

static OFF: Mutex<Option<HashSet<String>>> = Mutex::new(None);

fn path() -> Option<std::path::PathBuf> {
    Some(dirs::config_dir()?.join("Hoffle Lite").join("voice-sounds.json"))
}

/// Only the switched-off sounds are stored, so new sounds start on.
fn with_off<T>(f: impl FnOnce(&mut HashSet<String>) -> T) -> T {
    let mut guard = OFF.lock().unwrap();
    let off = guard.get_or_insert_with(|| path().and_then(|p| std::fs::read(p).ok()).and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default());
    f(off)
}

pub fn is_on(id: &str) -> bool {
    with_off(|off| !off.contains(id))
}

pub fn set_on(id: &str, on: bool) {
    with_off(|off| {
        if on {
            off.remove(id);
        } else {
            off.insert(id.to_string());
        }
        if let Some(p) = path() {
            let _ = std::fs::create_dir_all(p.parent().unwrap_or(&p));
            let _ = std::fs::write(p, serde_json::to_vec(off).unwrap_or_default());
        }
    });
}

/// Plays a cue unless it is switched off.
pub fn play(id: &str) {
    if is_on(id) {
        preview(id);
    }
}

/// Plays a cue even while it is switched off (the settings list's "Preview sound").
pub fn preview(id: &str) {
    let Some(bytes) = crate::assets::ASSETS.iter().find(|(p, _)| *p == format!("sounds/{id}.wav")).map(|(_, b)| *b) else { return };
    let id = id.to_string();
    std::thread::spawn(move || {
        let file = std::env::temp_dir().join(format!("hoffle-cue-{id}.wav"));
        if !file.exists() && std::fs::write(&file, bytes).is_err() {
            return;
        }
        let _ = std::process::Command::new("/usr/bin/afplay").arg(&file).status();
    });
}

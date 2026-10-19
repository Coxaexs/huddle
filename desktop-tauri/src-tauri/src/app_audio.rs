//! The screen share's audio, captured per application on Windows.
//!
//! Sharing audio through the webview records the whole output device, which
//! includes Hoffle's own playback, so the room hears itself; behind an audio
//! router such as SteelSeries Sonar even Chromium's way of leaving its own
//! process out fails. hoffle-app-audio.exe (desktop/native/app-audio.cpp,
//! shared with the Electron and native apps) captures the shared window's app,
//! or for a whole screen every app except this one and its children (the
//! WebView2 processes among them). The page asks for it once its share has
//! started (app/lib/app-audio.ts), and the PCM goes back to it as base64 in
//! "app-audio:pcm" events.

use std::io::{BufRead, BufReader, Read};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Mutex};
use std::thread;
use std::time::Duration;

use base64::Engine;
use tauri::{AppHandle, Emitter, Manager};

struct Capture {
    child: Child,
    stdin: Option<ChildStdin>,
}

static CURRENT: Mutex<Option<Capture>> = Mutex::new(None);
/// Bumped on every start and stop, so output from a stopped capture is dropped.
static GENERATION: AtomicU64 = AtomicU64::new(0);

fn helper(app: &AppHandle) -> Option<PathBuf> {
    if !cfg!(windows) {
        return None;
    }
    let path = app.path().resource_dir().ok()?.join("hoffle-app-audio.exe");
    path.exists().then_some(path)
}

/// Stops the capture, if any. The helper exits when its stdin closes; it is
/// killed if it has not after a second.
pub fn stop() {
    GENERATION.fetch_add(1, Ordering::SeqCst);
    let Some(mut capture) = CURRENT.lock().ok().and_then(|mut current| current.take()) else {
        return;
    };
    drop(capture.stdin.take());
    thread::spawn(move || {
        for _ in 0..10 {
            if let Ok(Some(_)) = capture.child.try_wait() {
                return;
            }
            thread::sleep(Duration::from_millis(100));
        }
        let _ = capture.child.kill();
        let _ = capture.child.wait();
    });
}

#[tauri::command]
pub fn app_audio_available(app: AppHandle) -> bool {
    helper(&app).is_some()
}

#[tauri::command]
pub fn app_audio_stop() {
    stop();
}

/// Starts capturing for the share just begun; false where this Windows (or
/// this install) cannot.
#[tauri::command]
pub async fn app_audio_start(app: AppHandle, window_id: Option<String>) -> bool {
    stop();
    let Some(path) = helper(&app) else {
        return false;
    };
    let pid = std::process::id().to_string();
    let mut command = Command::new(path);
    match window_id.filter(|id| !id.is_empty() && id.bytes().all(|b| b.is_ascii_digit())) {
        Some(id) => command.args(["--window", id.as_str(), "--self", pid.as_str()]),
        None => command.args(["--all-except", pid.as_str()]),
    };
    command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let Ok(mut child) = command.spawn() else {
        return false;
    };
    let (Some(stdin), Some(mut stdout), Some(stderr)) = (child.stdin.take(), child.stdout.take(), child.stderr.take())
    else {
        let _ = child.kill();
        return false;
    };
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    if let Ok(mut current) = CURRENT.lock() {
        *current = Some(Capture { child, stdin: Some(stdin) });
    }

    // "ready" on stderr once capture works; exiting first means it cannot.
    let (ready_tx, ready_rx) = mpsc::channel::<bool>();
    thread::spawn(move || {
        let mut told = false;
        for line in BufReader::new(stderr).lines() {
            let Ok(line) = line else { break };
            if !told && line.contains("ready") {
                told = true;
                let _ = ready_tx.send(true);
            }
        }
        if !told {
            let _ = ready_tx.send(false);
        }
    });

    // Stereo float32 at 48 kHz; whole frames, about 20 ms per event.
    let events = app.clone();
    thread::spawn(move || {
        let mut buf = vec![0u8; 16384];
        let mut pending: Vec<u8> = Vec::new();
        loop {
            let read = match stdout.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(read) => read,
            };
            pending.extend_from_slice(&buf[..read]);
            if pending.len() < 7680 {
                continue;
            }
            let whole = pending.len() - pending.len() % 8;
            if GENERATION.load(Ordering::SeqCst) == generation {
                let data = base64::engine::general_purpose::STANDARD.encode(&pending[..whole]);
                let _ = events.emit("app-audio:pcm", data);
            }
            pending.drain(..whole);
        }
    });

    let ok = tauri::async_runtime::spawn_blocking(move || {
        ready_rx.recv_timeout(Duration::from_secs(4)).unwrap_or(false)
    })
    .await
    .unwrap_or(false);
    if !ok && GENERATION.load(Ordering::SeqCst) == generation {
        stop();
    }
    ok && GENERATION.load(Ordering::SeqCst) == generation
}

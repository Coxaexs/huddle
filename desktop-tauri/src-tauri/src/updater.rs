//! Hoffle Lite keeps itself current, like the Electron app (desktop/src/updater.js).
//!
//! The chat is the hosted site, so a deploy already reaches Lite at its next
//! reload; this is for Lite itself. tauri-plugin-updater reads
//! lite-latest.json from GitHub's latest release (CI writes it, see
//! .github/workflows/desktop.yml), downloads a newer build in the background
//! and checks its signature against the public key in tauri.conf.json. It
//! installs straight away when the download finishes within a minute of
//! launch and no call is live, and otherwise when the person picks "Restart"
//! in the page's update banner (app/lib/app-update.ts).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::{Update, UpdaterExt};

/// How often a running Lite looks for a newer version.
const CHECK_EVERY: Duration = Duration::from_secs(4 * 60 * 60);
/// An update ready this soon after launch is installed at once.
const APPLY_AT_LAUNCH: Duration = Duration::from_secs(60);

/// What the page's banner reads: "ready" means a restart installs `version`.
#[derive(Clone, Serialize)]
pub struct UpdateState {
    status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    version: Option<String>,
}

struct Downloaded {
    update: Update,
    bytes: Vec<u8>,
}

static STATE: Mutex<UpdateState> = Mutex::new(UpdateState { status: "idle", version: None });
static DOWNLOADED: Mutex<Option<Downloaded>> = Mutex::new(None);
/// Set by the page (app/lib/tauri-shell.ts) while a call is live.
static IN_CALL: AtomicBool = AtomicBool::new(false);

fn set(app: &AppHandle, status: &'static str, version: Option<String>) {
    let state = UpdateState { status, version };
    if let Ok(mut current) = STATE.lock() {
        *current = state.clone();
    }
    let _ = app.emit("hoffle:update", state);
}

/// Checks now and every few hours after, on a thread of its own.
pub fn start(app: &AppHandle) {
    let app = app.clone();
    let launched = Instant::now();
    thread::spawn(move || loop {
        tauri::async_runtime::block_on(check(&app, launched));
        thread::sleep(CHECK_EVERY);
    });
}

async fn check(app: &AppHandle, launched: Instant) {
    // One download waiting for its restart is enough.
    if DOWNLOADED.lock().map(|done| done.is_some()).unwrap_or(true) {
        return;
    }
    let Ok(updater) = app.updater() else { return };
    let update = match updater.check().await {
        Ok(Some(update)) => update,
        Ok(None) => return,
        Err(error) => {
            eprintln!("update check failed: {error}");
            return;
        }
    };
    let version = update.version.clone();
    set(app, "downloading", Some(version.clone()));
    match update.download(|_, _| {}, || {}).await {
        Ok(bytes) => {
            if let Ok(mut done) = DOWNLOADED.lock() {
                *done = Some(Downloaded { update, bytes });
            }
            set(app, "ready", Some(version));
            if launched.elapsed() < APPLY_AT_LAUNCH && !IN_CALL.load(Ordering::SeqCst) {
                install(app);
            }
        }
        Err(error) => {
            eprintln!("update download failed: {error}");
            set(app, "error", None);
        }
    }
}

/// Installs the downloaded update and starts it. On Windows the installer
/// takes over and this process exits on its own.
fn install(app: &AppHandle) {
    let Some(Downloaded { update, bytes }) = DOWNLOADED.lock().ok().and_then(|mut done| done.take()) else {
        return;
    };
    match update.install(bytes) {
        Ok(()) => app.restart(),
        Err(error) => {
            eprintln!("update install failed: {error}");
            set(app, "error", None);
        }
    }
}

#[tauri::command]
pub fn update_state() -> UpdateState {
    STATE
        .lock()
        .map(|state| state.clone())
        .unwrap_or(UpdateState { status: "idle", version: None })
}

#[tauri::command]
pub fn update_install(app: AppHandle) {
    install(&app);
}

#[tauri::command]
pub fn set_in_call(on: bool) {
    IN_CALL.store(on, Ordering::SeqCst);
}

//! AirPods (and other head-tracking headphones) orientation, forwarded to the webview.
//!
//! Only Apple platforms can read this: CoreMotion's `CMHeadphoneMotionManager` is
//! the sole source of the head pose, and web content has no access to it. The
//! webview asks for it over `head_tracking_start`, then receives a stream of
//! `huddle:head-pose` events until it calls `head_tracking_stop`.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeadPose {
    /// Radians. Yaw is around the vertical axis; turning left is positive.
    pub yaw: f64,
    pub pitch: f64,
    pub roll: f64,
    /// Seconds since the sensor's own epoch — useful only for ordering and staleness.
    pub timestamp: f64,
}

#[derive(Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Availability {
    /// No head-tracking headphones, or an OS without `CMHeadphoneMotionManager`.
    Unsupported,
    /// Supported, but the user declined motion access.
    Denied,
    Available,
}

impl Availability {
    fn from_native(code: i32) -> Self {
        match code {
            1 => Availability::Available,
            2 => Availability::Denied,
            _ => Availability::Unsupported,
        }
    }
}

/// Poses arrive on a CoreMotion queue with no payload of ours attached, so the
/// handle the emitter needs lives here rather than travelling through the callback.
static EMITTER: Mutex<Option<Box<dyn Fn(HeadPose) + Send + 'static>>> = Mutex::new(None);

fn emit(pose: HeadPose) {
    // A poisoned lock would only ever hold a stale emitter; dropping the sample is right.
    if let Ok(guard) = EMITTER.lock() {
        if let Some(emitter) = guard.as_ref() {
            emitter(pose);
        }
    }
}

#[cfg(target_vendor = "apple")]
mod native {
    use super::HeadPose;

    type PoseCallback = extern "C" fn(yaw: f64, pitch: f64, roll: f64, timestamp: f64);

    extern "C" {
        fn huddle_head_tracking_available() -> i32;
        fn huddle_head_tracking_start(callback: PoseCallback) -> i32;
        fn huddle_head_tracking_stop();
    }

    extern "C" fn on_pose(yaw: f64, pitch: f64, roll: f64, timestamp: f64) {
        super::emit(HeadPose { yaw, pitch, roll, timestamp });
    }

    pub fn available() -> i32 {
        unsafe { huddle_head_tracking_available() }
    }

    pub fn start() -> bool {
        unsafe { huddle_head_tracking_start(on_pose) == 1 }
    }

    pub fn stop() {
        unsafe { huddle_head_tracking_stop() }
    }
}

#[cfg(not(target_vendor = "apple"))]
mod native {
    pub fn available() -> i32 {
        0
    }
    pub fn start() -> bool {
        false
    }
    pub fn stop() {}
}

#[tauri::command]
pub fn head_tracking_available() -> Availability {
    Availability::from_native(native::available())
}

#[tauri::command]
pub fn head_tracking_start<R: Runtime>(app: AppHandle<R>) -> Availability {
    let availability = Availability::from_native(native::available());
    if availability != Availability::Available {
        return availability;
    }
    if let Ok(mut guard) = EMITTER.lock() {
        *guard = Some(Box::new(move |pose| {
            let _ = app.emit("huddle:head-pose", pose);
        }));
    }
    if native::start() {
        Availability::Available
    } else {
        // Nothing will arrive, so don't leave the emitter holding an app handle.
        head_tracking_stop();
        Availability::Unsupported
    }
}

#[tauri::command]
pub fn head_tracking_stop() {
    native::stop();
    if let Ok(mut guard) = EMITTER.lock() {
        *guard = None;
    }
}

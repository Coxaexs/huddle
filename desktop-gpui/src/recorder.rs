//! Recording a voice message (useVoiceRecorder): AVAudioRecorder writes AAC to an .m4a (the web takes
//! Safari's .m4a the same way) and meters the level, sampled ten times a second for the live meter
//! and the waveform that goes with the message.

use std::path::PathBuf;

use cocoa::base::{id, nil};
use cocoa::foundation::NSString;
use objc::{class, msg_send, sel, sel_impl};

#[link(name = "AVFoundation", kind = "framework")]
unsafe extern "C" {}

/// The longest voice message.
pub const MAX_SECONDS: f32 = 5. * 60.;
const WAVEFORM_BARS: usize = 48;

/// AVCaptureDevice's answer for the microphone: 0 not asked yet, 1 restricted, 2 denied, 3 allowed.
pub fn permission() -> i64 {
    // SAFETY: a class method taking AVMediaTypeAudio ("soun").
    unsafe { msg_send![class!(AVCaptureDevice), authorizationStatusForMediaType: ns("soun")] }
}

/// Asks macOS for the microphone (its prompt); `done` hears the answer, on some other thread.
pub fn ask_permission(done: impl Fn(bool) + Send + 'static) {
    let block = block::ConcreteBlock::new(move |granted: bool| done(granted)).copy();
    // SAFETY: the block is copied to the heap and AVFoundation keeps it until it answers.
    unsafe {
        let _: () = msg_send![class!(AVCaptureDevice), requestAccessForMediaType: ns("soun") completionHandler: &*block];
    }
}

pub struct Recorder {
    recorder: id,
    pub path: PathBuf,
    /// The levels sampled so far (0–1).
    pub levels: Vec<f32>,
    pub paused: bool,
}

// The recorder is only touched from the UI thread.
unsafe impl Send for Recorder {}

fn ns(text: &str) -> id {
    // SAFETY: an autoreleased NSString from a Rust string.
    unsafe { NSString::alloc(nil).init_str(text) }
}

impl Recorder {
    /// Starts recording, or says why it could not.
    pub fn start() -> Result<Self, String> {
        let path = std::env::temp_dir().join(format!("hoffle-voice-{}.m4a", chrono::Utc::now().timestamp_millis()));
        // SAFETY: plain AVFoundation / Foundation calls on objects made here; the recorder is retained
        // (alloc/init) and released in Drop.
        unsafe {
            let url: id = msg_send![class!(NSURL), fileURLWithPath: ns(path.to_str().unwrap_or_default())];
            let keys: [id; 4] = [ns("AVFormatIDKey"), ns("AVSampleRateKey"), ns("AVNumberOfChannelsKey"), ns("AVEncoderBitRateKey")];
            // kAudioFormatMPEG4AAC ('aac '), 48 kHz, mono, 48 kbit/s as the web records.
            let values: [id; 4] = [
                msg_send![class!(NSNumber), numberWithUnsignedInt: 0x6161_6320u32],
                msg_send![class!(NSNumber), numberWithDouble: 48_000f64],
                msg_send![class!(NSNumber), numberWithInt: 1i32],
                msg_send![class!(NSNumber), numberWithInt: 48_000i32],
            ];
            let settings: id = msg_send![class!(NSDictionary), dictionaryWithObjects: values.as_ptr() forKeys: keys.as_ptr() count: 4usize];
            let mut error: id = nil;
            let recorder: id = msg_send![class!(AVAudioRecorder), alloc];
            let recorder: id = msg_send![recorder, initWithURL: url settings: settings error: &mut error];
            if recorder == nil {
                let reason = if error != nil {
                    let text: id = msg_send![error, localizedDescription];
                    let cstr: *const std::os::raw::c_char = msg_send![text, UTF8String];
                    std::ffi::CStr::from_ptr(cstr).to_string_lossy().into_owned()
                } else {
                    String::new()
                };
                crate::trace(format!("recorder: init failed: {reason}"));
                return Err("Microphone access was blocked.".into());
            }
            let _: () = msg_send![recorder, setMeteringEnabled: true];
            let ready: bool = msg_send![recorder, prepareToRecord];
            let started: bool = msg_send![recorder, record];
            if !ready || !started {
                crate::trace(format!("recorder: prepared {ready}, started {started}"));
                let _: () = msg_send![recorder, release];
                // Allowed but not starting: no working input (a closed lid turns the built-in mic off).
                return Err("Couldn't start the microphone. Check that one is connected and on.".into());
            }
            Ok(Self { recorder, path, levels: Vec::new(), paused: false })
        }
    }

    /// Recorded time so far, not counting pauses.
    pub fn seconds(&self) -> f32 {
        // SAFETY: the recorder lives as long as self.
        unsafe {
            let t: f64 = msg_send![self.recorder, currentTime];
            t as f32
        }
    }

    /// One level sample (the web's RMS × 3, clamped), kept for the waveform.
    pub fn sample(&mut self) -> f32 {
        if self.paused {
            return *self.levels.last().unwrap_or(&0.);
        }
        // SAFETY: as above.
        let db: f32 = unsafe {
            let _: () = msg_send![self.recorder, updateMeters];
            msg_send![self.recorder, averagePowerForChannel: 0usize]
        };
        let level = (10f32.powf(db / 20.) * 3.).clamp(0., 1.);
        self.levels.push(level);
        level
    }

    pub fn toggle_pause(&mut self) {
        // SAFETY: as above.
        unsafe {
            if self.paused {
                let _: bool = msg_send![self.recorder, record];
            } else {
                let _: () = msg_send![self.recorder, pause];
            }
        }
        self.paused = !self.paused;
    }

    /// Stops and answers the file, its length and the waveform (48 bars, 6–100).
    pub fn finish(self) -> (PathBuf, f32, Vec<u32>) {
        let seconds = self.seconds();
        // SAFETY: as above; Drop releases it after.
        unsafe {
            let _: () = msg_send![self.recorder, stop];
        }
        (self.path.clone(), seconds, waveform(&self.levels))
    }

    /// Stops and throws the recording away.
    pub fn cancel(self) {
        let path = self.path.clone();
        // SAFETY: as above.
        unsafe {
            let _: () = msg_send![self.recorder, stop];
        }
        drop(self);
        let _ = std::fs::remove_file(path);
    }
}

impl Drop for Recorder {
    fn drop(&mut self) {
        // SAFETY: balances the alloc/init in start().
        unsafe {
            let _: () = msg_send![self.recorder, stop];
            let _: () = msg_send![self.recorder, release];
        }
    }
}

/// toWaveform(): the sampled levels squashed into 48 bars, scaled to the loudest, at least 6.
pub fn waveform(levels: &[f32]) -> Vec<u32> {
    if levels.is_empty() {
        return vec![8; WAVEFORM_BARS];
    }
    let bars: Vec<f32> = (0..WAVEFORM_BARS)
        .map(|i| {
            let from = i * levels.len() / WAVEFORM_BARS;
            let to = ((i + 1) * levels.len() / WAVEFORM_BARS).max(from + 1).min(levels.len());
            let slice = &levels[from.min(levels.len() - 1)..to.max(from.min(levels.len() - 1) + 1)];
            slice.iter().sum::<f32>() / slice.len() as f32
        })
        .collect();
    let peak = bars.iter().copied().fold(0.01, f32::max);
    bars.iter().map(|v| ((v / peak) * 100.).round().max(6.) as u32).collect()
}

#[cfg(test)]
mod tests {
    #[test]
    fn waveform_has_48_bars() {
        let w = super::waveform(&[0.1, 0.5, 1.0]);
        assert_eq!(w.len(), 48);
        assert_eq!(*w.iter().max().unwrap(), 100);
        assert!(w.iter().all(|v| *v >= 6));
    }
}

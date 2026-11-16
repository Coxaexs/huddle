//! Video files in messages, decoded with AVFoundation (AVAssetReader): the size and length, and the
//! pictures from any point on as BGRA, which is what gpui draws. WebM and MKV are not something
//! macOS reads; those come back as None and the card says so, as Chrome does when it cannot play.
#![allow(unexpected_cfgs)]

use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use cocoa::base::{id, nil};
use cocoa::foundation::NSString;
use objc::{class, msg_send, sel, sel_impl};

#[link(name = "AVFoundation", kind = "framework")]
#[link(name = "CoreMedia", kind = "framework")]
#[link(name = "CoreVideo", kind = "framework")]
unsafe extern "C" {
    static kCVPixelBufferPixelFormatTypeKey: id;
    static kCVPixelBufferWidthKey: id;
    static kCVPixelBufferHeightKey: id;
    fn CMSampleBufferGetImageBuffer(sbuf: id) -> *mut std::ffi::c_void;
    fn CMSampleBufferGetPresentationTimeStamp(sbuf: id) -> CMTime;
    fn CVPixelBufferLockBaseAddress(pb: *mut std::ffi::c_void, flags: u64) -> i32;
    fn CVPixelBufferUnlockBaseAddress(pb: *mut std::ffi::c_void, flags: u64) -> i32;
    fn CVPixelBufferGetBaseAddress(pb: *mut std::ffi::c_void) -> *const u8;
    fn CVPixelBufferGetBytesPerRow(pb: *mut std::ffi::c_void) -> usize;
    fn CVPixelBufferGetWidth(pb: *mut std::ffi::c_void) -> usize;
    fn CVPixelBufferGetHeight(pb: *mut std::ffi::c_void) -> usize;
    fn CFRelease(obj: id);
}

#[repr(C)]
#[derive(Clone, Copy)]
struct CMTime {
    value: i64,
    timescale: i32,
    flags: u32,
    epoch: i64,
}

impl CMTime {
    fn at(seconds: f64) -> Self {
        CMTime { value: (seconds * 600.).round() as i64, timescale: 600, flags: 1, epoch: 0 }
    }
    fn seconds(self) -> f64 {
        if self.timescale == 0 { 0. } else { self.value as f64 / self.timescale as f64 }
    }
}

#[repr(C)]
#[derive(Clone, Copy)]
struct CMTimeRange {
    start: CMTime,
    duration: CMTime,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct CGSize {
    width: f64,
    height: f64,
}

/// What a file holds: its picture size and length.
#[derive(Clone, Copy, Debug)]
pub struct Info {
    pub width: u32,
    pub height: u32,
    pub seconds: f32,
}

/// One decoded picture: when it shows, and the picture (BGRA, `width` × `height`).
pub struct Frame {
    pub at: f32,
    pub width: u32,
    pub height: u32,
    pub bgra: Vec<u8>,
}

fn ns(s: &str) -> id {
    // SAFETY: an autoreleased NSString from a Rust string.
    unsafe { NSString::alloc(nil).init_str(s) }
}

/// Runs `f` inside an autorelease pool (the decoding threads have none of their own).
fn pooled<T>(f: impl FnOnce() -> T) -> T {
    // SAFETY: a pool created and drained on this thread.
    unsafe {
        let pool: id = msg_send![class!(NSAutoreleasePool), new];
        let out = f();
        let _: () = msg_send![pool, drain];
        out
    }
}

/// The asset and its first video track.
unsafe fn open(path: &Path) -> Option<(id, id)> {
    unsafe {
        let url: id = msg_send![class!(NSURL), fileURLWithPath: ns(&path.to_string_lossy())];
        let asset: id = msg_send![class!(AVURLAsset), URLAssetWithURL: url options: nil];
        if asset == nil {
            return None;
        }
        let tracks: id = msg_send![asset, tracksWithMediaType: ns("vide")];
        let count: usize = msg_send![tracks, count];
        if count == 0 {
            return None;
        }
        let track: id = msg_send![tracks, objectAtIndex: 0usize];
        Some((asset, track))
    }
}

/// The size and length of a video file, or None when macOS cannot read it.
pub fn info(path: &Path) -> Option<Info> {
    pooled(|| unsafe {
        let (asset, track) = open(path)?;
        let size: CGSize = msg_send![track, naturalSize];
        let duration: CMTime = msg_send![asset, duration];
        (size.width > 0. && size.height > 0.).then(|| Info { width: size.width.round() as u32, height: size.height.round() as u32, seconds: duration.seconds() as f32 })
    })
}

/// Decodes from `from` seconds on, at most `max_width` wide, handing each picture to `each` until
/// it says stop (false), `stop` is set, or the file ends. Runs on the calling thread.
pub fn decode(path: &Path, from: f32, max_width: u32, stop: Arc<AtomicBool>, mut each: impl FnMut(Frame) -> bool) -> bool {
    unsafe {
        let pool: id = msg_send![class!(NSAutoreleasePool), new];
        let started = (|| {
            let (asset, track) = open(path)?;
            let size: CGSize = msg_send![track, naturalSize];
            let duration: CMTime = msg_send![asset, duration];
            let scale = (max_width as f64 / size.width).min(1.);
            let (w, h) = (((size.width * scale) as i64).max(2) & !1, ((size.height * scale) as i64).max(2) & !1);
            let settings: id = msg_send![class!(NSMutableDictionary), dictionary];
            let format: id = msg_send![class!(NSNumber), numberWithUnsignedInt: 0x4247_5241u32];
            let width: id = msg_send![class!(NSNumber), numberWithLongLong: w];
            let height: id = msg_send![class!(NSNumber), numberWithLongLong: h];
            let _: () = msg_send![settings, setObject: format forKey: kCVPixelBufferPixelFormatTypeKey];
            let _: () = msg_send![settings, setObject: width forKey: kCVPixelBufferWidthKey];
            let _: () = msg_send![settings, setObject: height forKey: kCVPixelBufferHeightKey];
            let mut error: id = nil;
            let reader: id = msg_send![class!(AVAssetReader), assetReaderWithAsset: asset error: &mut error];
            if reader == nil {
                return None;
            }
            let output: id = msg_send![class!(AVAssetReaderTrackOutput), assetReaderTrackOutputWithTrack: track outputSettings: settings];
            let _: () = msg_send![output, setAlwaysCopiesSampleData: false];
            let start = (from as f64).clamp(0., duration.seconds());
            let range = CMTimeRange { start: CMTime::at(start), duration: CMTime::at((duration.seconds() - start).max(0.)) };
            let _: () = msg_send![reader, setTimeRange: range];
            let _: () = msg_send![reader, addOutput: output];
            let ok: bool = msg_send![reader, startReading];
            ok.then_some((reader, output))
        })();
        let Some((reader, output)) = started else {
            let _: () = msg_send![pool, drain];
            return false;
        };
        loop {
            if stop.load(Ordering::Relaxed) {
                break;
            }
            let inner: id = msg_send![class!(NSAutoreleasePool), new];
            let sample: id = msg_send![output, copyNextSampleBuffer];
            if sample == nil {
                let _: () = msg_send![inner, drain];
                break;
            }
            let at = CMSampleBufferGetPresentationTimeStamp(sample).seconds() as f32;
            let buffer = CMSampleBufferGetImageBuffer(sample);
            let mut frame = None;
            if !buffer.is_null() && CVPixelBufferLockBaseAddress(buffer, 1) == 0 {
                let (w, h, row) = (CVPixelBufferGetWidth(buffer), CVPixelBufferGetHeight(buffer), CVPixelBufferGetBytesPerRow(buffer));
                let base = CVPixelBufferGetBaseAddress(buffer);
                if !base.is_null() && w > 0 && h > 0 {
                    let mut bgra = Vec::with_capacity(w * h * 4);
                    for y in 0..h {
                        bgra.extend_from_slice(std::slice::from_raw_parts(base.add(y * row), w * 4));
                    }
                    frame = Some(Frame { at, width: w as u32, height: h as u32, bgra });
                }
                CVPixelBufferUnlockBaseAddress(buffer, 1);
            }
            CFRelease(sample);
            let _: () = msg_send![inner, drain];
            if let Some(frame) = frame
                && !each(frame)
            {
                break;
            }
        }
        let _: () = msg_send![reader, cancelReading];
        let _: () = msg_send![pool, drain];
        true
    }
}

/// The picture at `at` seconds (the first one from there).
pub fn picture_at(path: &Path, at: f32, max_width: u32) -> Option<Frame> {
    let mut first = None;
    decode(path, at, max_width, Arc::new(AtomicBool::new(false)), |f| {
        first = Some(f);
        false
    });
    first
}

#[cfg(test)]
mod tests {
    /// HOFFLE_TEST_MP4=<file>: its size, length and a picture from the middle.
    #[test]
    fn decodes_an_mp4() {
        let Ok(path) = std::env::var("HOFFLE_TEST_MP4") else { return };
        let path = std::path::PathBuf::from(path);
        let info = super::info(&path).expect("info");
        assert!(info.width > 0 && info.seconds > 0.);
        let frame = super::picture_at(&path, info.seconds / 2., 320).expect("frame");
        assert_eq!(frame.bgra.len(), (frame.width * frame.height * 4) as usize);
        assert!(frame.at >= info.seconds / 2. - 0.1);
        let mut n = 0;
        super::decode(&path, 0., 320, std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)), |_| {
            n += 1;
            true
        });
        assert!(n > 10, "{n} frames");
    }
}

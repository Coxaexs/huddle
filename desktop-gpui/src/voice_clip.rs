//! Voice messages as sound: the WebM (Chrome's MediaRecorder) or Ogg (Firefox) container opened by
//! hand, the Opus inside decoded with the libopus that libwebrtc already links in, and the result
//! written as a WAV that `afplay` plays (from any point, at 1×, 1.5× or 2×).

use std::ffi::c_void;

unsafe extern "C" {
    fn opus_decoder_create(fs: i32, channels: i32, error: *mut i32) -> *mut c_void;
    fn opus_decode(st: *mut c_void, data: *const u8, len: i32, pcm: *mut i16, frame_size: i32, decode_fec: i32) -> i32;
    fn opus_decoder_destroy(st: *mut c_void);
}

/// Decoded sound: interleaved 16-bit samples at 48 kHz.
pub struct Pcm {
    pub samples: Vec<i16>,
    pub channels: u16,
}

impl Pcm {
    pub fn seconds(&self) -> f32 {
        self.samples.len() as f32 / self.channels.max(1) as f32 / 48_000.
    }

    /// A WAV of the sound from `from` seconds on.
    pub fn wav_from(&self, from: f32) -> Vec<u8> {
        let ch = self.channels.max(1) as usize;
        let start = ((from.max(0.) * 48_000.) as usize * ch).min(self.samples.len());
        let body = &self.samples[start - start % ch..];
        let data_len = (body.len() * 2) as u32;
        let mut out = Vec::with_capacity(44 + body.len() * 2);
        out.extend_from_slice(b"RIFF");
        out.extend_from_slice(&(36 + data_len).to_le_bytes());
        out.extend_from_slice(b"WAVEfmt ");
        out.extend_from_slice(&16u32.to_le_bytes());
        out.extend_from_slice(&1u16.to_le_bytes());
        out.extend_from_slice(&(ch as u16).to_le_bytes());
        out.extend_from_slice(&48_000u32.to_le_bytes());
        out.extend_from_slice(&(48_000 * ch as u32 * 2).to_le_bytes());
        out.extend_from_slice(&(ch as u16 * 2).to_le_bytes());
        out.extend_from_slice(&16u16.to_le_bytes());
        out.extend_from_slice(b"data");
        out.extend_from_slice(&data_len.to_le_bytes());
        for s in body {
            out.extend_from_slice(&s.to_le_bytes());
        }
        out
    }
}

/// What the container held: the Opus packets, the channel count and how many samples to skip.
struct OpusStream {
    packets: Vec<Vec<u8>>,
    channels: u16,
    pre_skip: usize,
}

/// An EBML variable-length number: (value, length). `keep_marker` for element IDs.
fn vint(data: &[u8], keep_marker: bool) -> Option<(u64, usize)> {
    let first = *data.first()?;
    let len = first.leading_zeros() as usize + 1;
    if len > 8 || data.len() < len {
        return None;
    }
    let mut value = if keep_marker { first as u64 } else { (first as u64) & ((1u64 << (8 - len)) - 1) };
    for b in &data[1..len] {
        value = (value << 8) | *b as u64;
    }
    Some((value, len))
}

fn opus_head(private: &[u8], channels: &mut u16, pre_skip: &mut usize) {
    if private.len() >= 12 && &private[..8] == b"OpusHead" {
        *channels = private[9].max(1) as u16;
        *pre_skip = u16::from_le_bytes([private[10], private[11]]) as usize;
    }
}

/// The Opus packets of a WebM / Matroska file (SimpleBlocks and Blocks of its audio track; the
/// unknown-size Segment and Clusters a live recording writes are read as they come).
fn webm(data: &[u8]) -> Option<OpusStream> {
    const CONTAINERS: [u64; 7] = [0x18538067, 0x1654AE6B, 0xAE, 0xE1, 0x1F43B675, 0xA0, 0x1A45DFA3];
    let mut i = 0;
    let (mut track, mut channels, mut pre_skip) = (None::<u64>, 1u16, 0usize);
    let mut current_track = 0u64;
    let mut codec_opus = false;
    let mut packets = Vec::new();
    while i < data.len() {
        let (id, id_len) = vint(&data[i..], true)?;
        let (size, size_len) = vint(&data[i + id_len..], false)?;
        let unknown = size == (1u64 << (7 * size_len)) - 1;
        let body = i + id_len + size_len;
        if id == 0x1A45DFA3 {
            // The EBML header: skip it whole.
            i = body + size as usize;
            continue;
        }
        if CONTAINERS.contains(&id) || unknown {
            i = body;
            continue;
        }
        let end = (body + size as usize).min(data.len());
        let payload = &data[body..end];
        match id {
            0xD7 => current_track = payload.iter().fold(0, |a, b| (a << 8) | *b as u64),
            0x86 => codec_opus = payload.starts_with(b"A_OPUS"),
            0x63A2 => {
                if codec_opus || payload.starts_with(b"OpusHead") {
                    track = Some(current_track);
                    opus_head(payload, &mut channels, &mut pre_skip);
                }
            }
            0x9F => channels = payload.iter().fold(0u16, |a, b| (a << 8) | *b as u16).max(1),
            0xA3 | 0xA1 => {
                if let Some((number, n)) = vint(payload, false)
                    && payload.len() > n + 3
                {
                    let flags = payload[n + 2];
                    let wanted = track.is_none_or(|t| t == number) || codec_opus;
                    // No lacing: one frame per block (MediaRecorder never laces).
                    if wanted && flags & 0x06 == 0 {
                        packets.push(payload[n + 3..].to_vec());
                    }
                }
            }
            _ => {}
        }
        i = end;
    }
    (!packets.is_empty()).then_some(OpusStream { packets, channels, pre_skip })
}

/// The Opus packets of an Ogg file: pages put back into packets, the two header packets read.
fn ogg(data: &[u8]) -> Option<OpusStream> {
    let mut i = 0;
    let mut packets: Vec<Vec<u8>> = Vec::new();
    let mut partial: Vec<u8> = Vec::new();
    while i + 27 <= data.len() && &data[i..i + 4] == b"OggS" {
        let segments = data[i + 26] as usize;
        let table = &data[i + 27..(i + 27 + segments).min(data.len())];
        let mut at = i + 27 + segments;
        for &len in table {
            let end = (at + len as usize).min(data.len());
            partial.extend_from_slice(&data[at..end]);
            at = end;
            if len < 255 {
                packets.push(std::mem::take(&mut partial));
            }
        }
        i = at;
    }
    let (mut channels, mut pre_skip) = (1, 0);
    let head = packets.first()?.clone();
    opus_head(&head, &mut channels, &mut pre_skip);
    if !head.starts_with(b"OpusHead") {
        return None;
    }
    let packets = packets.into_iter().skip(2).filter(|p| !p.is_empty()).collect();
    Some(OpusStream { packets, channels, pre_skip })
}

/// Anything else (Safari's and this app's .m4a): macOS's afconvert makes a 48 kHz WAV of it.
fn convert(data: &[u8]) -> Option<Pcm> {
    let dir = std::env::temp_dir();
    let stamp = format!("{}-{}", std::process::id(), data.len());
    let (input, output) = (dir.join(format!("hoffle-clip-{stamp}.m4a")), dir.join(format!("hoffle-clip-{stamp}.wav")));
    std::fs::write(&input, data).ok()?;
    let ok = std::process::Command::new("/usr/bin/afconvert").arg("-f").arg("WAVE").arg("-d").arg("LEI16@48000").arg(&input).arg(&output).status().ok()?.success();
    let wav = if ok { std::fs::read(&output).ok() } else { None };
    let _ = std::fs::remove_file(&input);
    let _ = std::fs::remove_file(&output);
    let wav = wav?;
    // The fmt chunk's channel count, then the data chunk's samples.
    let mut i = 12;
    let (mut channels, mut samples) = (1u16, Vec::new());
    while i + 8 <= wav.len() {
        let size = u32::from_le_bytes(wav[i + 4..i + 8].try_into().ok()?) as usize;
        let body = &wav[i + 8..(i + 8 + size).min(wav.len())];
        match &wav[i..i + 4] {
            b"fmt " if body.len() >= 4 => channels = u16::from_le_bytes([body[2], body[3]]).max(1),
            b"data" => samples = body.chunks_exact(2).map(|c| i16::from_le_bytes([c[0], c[1]])).collect(),
            _ => {}
        }
        i += 8 + size + size % 2;
    }
    (!samples.is_empty()).then_some(Pcm { samples, channels })
}

/// Decodes a voice message's file.
pub fn decode(data: &[u8]) -> Option<Pcm> {
    let opus = data.starts_with(b"OggS") || data.starts_with(&[0x1A, 0x45, 0xDF, 0xA3]);
    if !opus {
        return convert(data);
    }
    let stream = if data.starts_with(b"OggS") { ogg(data) } else { webm(data) }?;
    let channels = stream.channels.clamp(1, 2);
    let mut error = 0;
    // SAFETY: libopus's own constructor; the handle is freed below.
    let decoder = unsafe { opus_decoder_create(48_000, channels as i32, &mut error) };
    if decoder.is_null() || error != 0 {
        return None;
    }
    let mut samples = Vec::new();
    let mut frame = vec![0i16; 5760 * channels as usize];
    for packet in &stream.packets {
        // SAFETY: the buffers outlive the call and are as long as the lengths given.
        let n = unsafe { opus_decode(decoder, packet.as_ptr(), packet.len() as i32, frame.as_mut_ptr(), 5760, 0) };
        if n > 0 {
            samples.extend_from_slice(&frame[..n as usize * channels as usize]);
        }
    }
    // SAFETY: made above, not used again.
    unsafe { opus_decoder_destroy(decoder) };
    let skip = (stream.pre_skip * channels as usize).min(samples.len());
    samples.drain(..skip);
    (!samples.is_empty()).then_some(Pcm { samples, channels })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vints() {
        assert_eq!(vint(&[0x81], false), Some((1, 1)));
        assert_eq!(vint(&[0x40, 0x02], false), Some((2, 2)));
        assert_eq!(vint(&[0x1A, 0x45, 0xDF, 0xA3], true), Some((0x1A45DFA3, 4)));
    }

    #[test]
    fn decodes_a_webm_clip() {
        let Ok(data) = std::fs::read(std::env::var("HOFFLE_TEST_WEBM").unwrap_or_default()) else { return };
        let pcm = decode(&data).expect("decodes");
        assert!((pcm.seconds() - 3.0).abs() < 0.2, "{} s", pcm.seconds());
    }
}

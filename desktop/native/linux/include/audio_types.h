#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace audio_capture {

enum class BackendType {
  None = 0,
  PipeWire = 1,
  PulseAudio = 2
};

inline const char* BackendTypeToString(BackendType type) {
  switch (type) {
    case BackendType::PipeWire: return "pipewire";
    case BackendType::PulseAudio: return "pulseaudio";
    default: return "none";
  }
}

enum class CaptureMode {
  Idle = 0,
  System = 1,
  Application = 2
};

enum class CaptureState {
  Uninitialized = 0,
  Ready = 1,
  Capturing = 2,
  Recovering = 3,
  Error = 4,
  Disposed = 5
};

inline const char* CaptureStateToString(CaptureState state) {
  switch (state) {
    case CaptureState::Uninitialized: return "uninitialized";
    case CaptureState::Ready: return "ready";
    case CaptureState::Capturing: return "capturing";
    case CaptureState::Recovering: return "recovering";
    case CaptureState::Error: return "error";
    case CaptureState::Disposed: return "disposed";
    default: return "unknown";
  }
}

struct AudioFormat {
  uint32_t sampleRate = 48000;
  uint32_t channels = 2;
  uint32_t framesPerChunk = 480; // 10ms at 48kHz
};

struct AudioDevice {
  std::string id;          // PipeWire node.name or PulseAudio sink name
  std::string description; // Human-readable device name
  uint32_t numericId = 0;  // PipeWire object.id / serial or PulseAudio sink index
  bool isDefault = false;
};

struct AudioApplicationStream {
  std::string streamId;     // Stable composite or backend stream identifier
  uint32_t backendNodeId = 0; // PipeWire node id or PulseAudio sink_input index
  uint64_t objectSerial = 0;  // PipeWire object.serial (0 on PulseAudio)
  std::string nodeName;
  std::string mediaName;
  std::string sinkName;     // Output sink this stream is currently routed to
  uint32_t sinkIndex = 0;
  bool isCorked = false;
};

struct AudioApplication {
  std::string appId;       // Stable app identifier: "<pid>:<binary>" or "<binary>"
  std::string name;        // application.name
  std::string binary;      // application.process.binary
  int32_t pid = -1;        // application.process.id
  std::vector<AudioApplicationStream> streams;
};

struct AppCaptureTarget {
  std::string appId;       // Optional: match all streams for this appId
  int32_t pid = -1;        // Optional: match all streams for this PID
  std::string appName;     // Optional: fallback match by application.name
  std::string streamId;    // Optional: match a specific streamId only
};

struct BackendCapabilities {
  BackendType backend = BackendType::None;
  std::string serverName;
  std::string serverVersion;
  bool isPipeWirePulseCompat = false;
  bool supportsSystemCapture = false;
  bool supportsAppCapture = false;
  bool supportsMultiAppCapture = false;
  std::vector<std::string> limitations;
};

struct CaptureOptions {
  AudioFormat format;
  bool softClip = true;
  bool emitSilenceWhenIdle = false;
  bool excludeSelf = true;
};

struct AudioErrorEvent {
  std::string code;
  std::string message;
  bool recoverable = false;
};

} // namespace audio_capture

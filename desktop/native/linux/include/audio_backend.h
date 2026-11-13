#pragma once

#include "audio_types.h"
#include <functional>
#include <memory>
#include <vector>

namespace audio_capture {

struct BackendCallbacks {
  // Called with interleaved float32 PCM frames (sampleCount = frames * channels).
  std::function<void(const float* samples, size_t frameCount, uint32_t sampleRate, uint32_t channels)> onAudioData;
  std::function<void(const std::vector<AudioApplication>& apps)> onApplicationsChanged;
  std::function<void(const AudioDevice& device)> onDefaultDeviceChanged;
  std::function<void(CaptureState state)> onStateChanged;
  std::function<void(const AudioErrorEvent& error)> onError;
};

/**
 * Abstract audio capture backend interface.
 * Implemented by PipeWireBackend, PulseAudioBackend, and mock backends in tests.
 */
class IAudioBackend {
public:
  virtual ~IAudioBackend() = default;

  virtual BackendType type() const = 0;
  virtual bool initialize(const BackendCallbacks& callbacks) = 0;
  virtual void shutdown() = 0;

  virtual BackendCapabilities getCapabilities() const = 0;
  virtual std::vector<AudioApplication> listApplications() const = 0;
  virtual AudioDevice getDefaultDevice() const = 0;

  virtual bool startSystemCapture(const CaptureOptions& options) = 0;
  virtual bool startAppCapture(const std::vector<AppCaptureTarget>& targets, const CaptureOptions& options) = 0;
  virtual void stopCapture() = 0;

  virtual bool isHealthy() const = 0;
};

// Factory functions for concrete Linux backends.
std::unique_ptr<IAudioBackend> createPipeWireBackend();
std::unique_ptr<IAudioBackend> createPulseAudioBackend();

} // namespace audio_capture

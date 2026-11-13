#pragma once

#include "audio_backend.h"
#include "audio_types.h"
#include "ring_buffer.h"

#include <atomic>
#include <condition_variable>
#include <functional>
#include <memory>
#include <mutex>
#include <thread>
#include <vector>

namespace audio_capture {

/**
 * Coordinates runtime backend detection (PipeWire -> PulseAudio),
 * decouples real-time audio callbacks from JS/N-API via a lock-free RingBuffer
 * and dedicated dispatcher thread, and handles automatic recovery on server restarts.
 */
class BackendManager {
public:
  using BackendFactory = std::function<std::unique_ptr<IAudioBackend>()>;

  BackendManager();
  // Dependency-injected constructor for deterministic unit testing.
  BackendManager(BackendFactory primaryFactory, BackendFactory fallbackFactory);
  ~BackendManager();

  BackendManager(const BackendManager&) = delete;
  BackendManager& operator=(const BackendManager&) = delete;

  BackendCapabilities initialize(const BackendCallbacks& callbacks);
  void dispose();

  BackendCapabilities getCapabilities() const;
  CaptureState getState() const { return state_.load(std::memory_order_acquire); }
  CaptureMode getMode() const { return mode_.load(std::memory_order_acquire); }
  uint64_t getDroppedSamples() const { return ringBuffer_.droppedSamples(); }

  std::vector<AudioApplication> listApplications() const;
  AudioDevice getDefaultDevice() const;

  bool startSystemCapture(const CaptureOptions& options);
  bool startAppCapture(const std::vector<AppCaptureTarget>& targets, const CaptureOptions& options);
  void stopCapture();

private:
  bool probeAndActivateBackend();
  void handleBackendAudio(const float* samples, size_t frameCount, uint32_t sampleRate, uint32_t channels);
  void handleBackendState(CaptureState state);
  void handleBackendError(const AudioErrorEvent& error);
  void dispatchLoop();
  void recoveryLoop();
  void setState(CaptureState newState);

  BackendFactory primaryFactory_;
  BackendFactory fallbackFactory_;

  mutable std::mutex backendMutex_;
  std::unique_ptr<IAudioBackend> activeBackend_;
  BackendCallbacks userCallbacks_;
  BackendCapabilities capabilities_;

  std::atomic<CaptureState> state_{CaptureState::Uninitialized};
  std::atomic<CaptureMode> mode_{CaptureMode::Idle};
  std::atomic<bool> running_{false};
  std::atomic<bool> recovering_{false};

  CaptureOptions lastOptions_;
  std::vector<AppCaptureTarget> lastTargets_;

  RingBuffer ringBuffer_;
  std::mutex dispatchMutex_;
  std::condition_variable dispatchCv_;
  std::thread dispatchThread_;

  std::mutex recoveryMutex_;
  std::condition_variable recoveryCv_;
  std::thread recoveryThread_;
};

} // namespace audio_capture

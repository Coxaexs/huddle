#pragma once

#include <cstddef>
#include <cstdint>
#include <mutex>
#include <unordered_map>
#include <vector>

namespace audio_capture {

/**
 * Thread-safe multi-stream PCM mixer.
 * Aggregates interleaved float32 PCM from 1..N active capture streams
 * (e.g., an application with multiple audio streams, or multiple selected apps)
 * and produces mixed fixed-size output chunks with optional soft-clipping.
 */
class StreamMixer {
public:
  StreamMixer(uint32_t channels, size_t maxBufferedFramesPerStream = 48000);

  void configure(uint32_t channels, size_t maxBufferedFramesPerStream = 48000);
  void addStream(uint64_t streamKey);
  void removeStream(uint64_t streamKey);
  void clear();

  // Push interleaved float32 frames for a given streamKey.
  void pushFrames(uint64_t streamKey, const float* interleavedSamples, size_t frameCount);

  // Returns the maximum number of frames available across all active streams.
  size_t availableFrames() const;

  // Mix up to `frameCount` frames into `outInterleaved`.
  // Streams with fewer frames than requested contribute 0.0f for missing frames.
  // Returns actual frames mixed (0 if no streams have data).
  size_t mixFrames(float* outInterleaved, size_t frameCount, bool softClip = true);

  size_t activeStreamCount() const;

private:
  struct StreamQueue {
    std::vector<float> samples;
    size_t readOffset = 0;
  };

  mutable std::mutex mutex_;
  uint32_t channels_;
  size_t maxBufferedSamples_;
  std::unordered_map<uint64_t, StreamQueue> streams_;
};

} // namespace audio_capture

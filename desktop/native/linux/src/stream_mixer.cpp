#include "stream_mixer.h"

#include <algorithm>
#include <cmath>
#include <cstring>

namespace audio_capture {

StreamMixer::StreamMixer(uint32_t channels, size_t maxBufferedFramesPerStream)
    : channels_(channels > 0 ? channels : 2),
      maxBufferedSamples_(maxBufferedFramesPerStream * channels_) {}

void StreamMixer::configure(uint32_t channels, size_t maxBufferedFramesPerStream) {
  std::lock_guard<std::mutex> lock(mutex_);
  channels_ = channels > 0 ? channels : 2;
  maxBufferedSamples_ = maxBufferedFramesPerStream * channels_;
  streams_.clear();
}

void StreamMixer::addStream(uint64_t streamKey) {
  std::lock_guard<std::mutex> lock(mutex_);
  streams_.try_emplace(streamKey, StreamQueue{});
}

void StreamMixer::removeStream(uint64_t streamKey) {
  std::lock_guard<std::mutex> lock(mutex_);
  streams_.erase(streamKey);
}

void StreamMixer::clear() {
  std::lock_guard<std::mutex> lock(mutex_);
  streams_.clear();
}

void StreamMixer::pushFrames(uint64_t streamKey, const float* interleavedSamples, size_t frameCount) {
  if (!interleavedSamples || frameCount == 0) return;

  std::lock_guard<std::mutex> lock(mutex_);
  auto& q = streams_[streamKey];

  // Compact consumed prefix if it grew large
  if (q.readOffset > 0) {
    if (q.readOffset >= q.samples.size()) {
      q.samples.clear();
      q.readOffset = 0;
    } else if (q.readOffset > maxBufferedSamples_ / 2) {
      q.samples.erase(q.samples.begin(), q.samples.begin() + static_cast<std::ptrdiff_t>(q.readOffset));
      q.readOffset = 0;
    }
  }

  const size_t newSamples = frameCount * channels_;
  const size_t currentUnread = q.samples.size() - q.readOffset;
  if (currentUnread + newSamples > maxBufferedSamples_) {
    // Drop oldest unread samples to stay bounded in latency
    const size_t overflow = (currentUnread + newSamples) - maxBufferedSamples_;
    if (overflow >= currentUnread) {
      q.samples.clear();
      q.readOffset = 0;
    } else {
      q.readOffset += overflow;
    }
  }

  const size_t incomingToCopy = std::min(newSamples, maxBufferedSamples_);
  const size_t startOffset = newSamples - incomingToCopy;
  q.samples.insert(q.samples.end(),
                   interleavedSamples + startOffset,
                   interleavedSamples + newSamples);
}

size_t StreamMixer::availableFrames() const {
  std::lock_guard<std::mutex> lock(mutex_);
  size_t maxSamples = 0;
  for (const auto& [key, q] : streams_) {
    if (q.samples.size() > q.readOffset) {
      maxSamples = std::max(maxSamples, q.samples.size() - q.readOffset);
    }
  }
  return maxSamples / channels_;
}

size_t StreamMixer::mixFrames(float* outInterleaved, size_t frameCount, bool softClip) {
  if (!outInterleaved || frameCount == 0) return 0;

  std::lock_guard<std::mutex> lock(mutex_);
  size_t maxSamplesAvail = 0;
  for (const auto& [key, q] : streams_) {
    if (q.samples.size() > q.readOffset) {
      maxSamplesAvail = std::max(maxSamplesAvail, q.samples.size() - q.readOffset);
    }
  }

  const size_t framesAvail = maxSamplesAvail / channels_;
  const size_t framesToMix = std::min(frameCount, framesAvail);
  if (framesToMix == 0) return 0;

  const size_t samplesToMix = framesToMix * channels_;
  std::fill(outInterleaved, outInterleaved + samplesToMix, 0.0f);

  for (auto& [key, q] : streams_) {
    const size_t unread = q.samples.size() - q.readOffset;
    const size_t take = std::min(samplesToMix, unread);
    for (size_t i = 0; i < take; ++i) {
      outInterleaved[i] += q.samples[q.readOffset + i];
    }
    q.readOffset += take;
    if (q.readOffset == q.samples.size()) {
      q.samples.clear();
      q.readOffset = 0;
    }
  }

  if (softClip) {
    for (size_t i = 0; i < samplesToMix; ++i) {
      const float x = outInterleaved[i];
      if (x > 1.0f || x < -1.0f) {
        outInterleaved[i] = std::tanh(x);
      }
    }
  } else {
    for (size_t i = 0; i < samplesToMix; ++i) {
      outInterleaved[i] = std::clamp(outInterleaved[i], -1.0f, 1.0f);
    }
  }

  return framesToMix;
}

size_t StreamMixer::activeStreamCount() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return streams_.size();
}

} // namespace audio_capture

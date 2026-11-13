#pragma once

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <vector>

namespace audio_capture {

/**
 * Lock-free Single-Producer Single-Consumer (SPSC) ring buffer for float PCM samples.
 * Designed for real-time audio callbacks: write() never blocks or allocates.
 * If the consumer falls behind, write() drops the incoming overflow or advances
 * cleanly while tracking dropped sample counts.
 */
class RingBuffer {
public:
  explicit RingBuffer(size_t capacitySamples);

  size_t capacity() const { return capacity_; }
  size_t availableRead() const;
  size_t availableWrite() const;

  // Producer (RT thread): writes up to `count` samples. Returns samples written.
  size_t write(const float* data, size_t count);

  // Consumer (dispatcher thread): reads up to `count` samples. Returns samples read.
  size_t read(float* out, size_t count);

  // Discards all buffered samples (call only when producer/consumer are quiesced or from consumer).
  void clear();

  uint64_t droppedSamples() const {
    return droppedSamples_.load(std::memory_order_relaxed);
  }

private:
  const size_t capacity_;
  std::vector<float> buffer_;
  alignas(64) std::atomic<size_t> writeIdx_{0};
  alignas(64) std::atomic<size_t> readIdx_{0};
  std::atomic<uint64_t> droppedSamples_{0};
};

} // namespace audio_capture

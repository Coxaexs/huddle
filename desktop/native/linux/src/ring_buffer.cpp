#include "ring_buffer.h"

#include <algorithm>
#include <cstring>

namespace audio_capture {

RingBuffer::RingBuffer(size_t capacitySamples)
    : capacity_(capacitySamples + 1), buffer_(capacitySamples + 1, 0.0f) {}

size_t RingBuffer::availableRead() const {
  const size_t w = writeIdx_.load(std::memory_order_acquire);
  const size_t r = readIdx_.load(std::memory_order_acquire);
  if (w >= r) {
    return w - r;
  }
  return capacity_ - r + w;
}

size_t RingBuffer::availableWrite() const {
  return (capacity_ - 1) - availableRead();
}

size_t RingBuffer::write(const float* data, size_t count) {
  if (!data || count == 0) return 0;

  const size_t avail = availableWrite();
  if (avail == 0) {
    droppedSamples_.fetch_add(count, std::memory_order_relaxed);
    return 0;
  }

  const size_t toWrite = std::min(count, avail);
  if (toWrite < count) {
    droppedSamples_.fetch_add(count - toWrite, std::memory_order_relaxed);
  }

  const size_t w = writeIdx_.load(std::memory_order_relaxed);
  const size_t firstPart = std::min(toWrite, capacity_ - w);
  std::memcpy(&buffer_[w], data, firstPart * sizeof(float));

  const size_t secondPart = toWrite - firstPart;
  if (secondPart > 0) {
    std::memcpy(&buffer_[0], data + firstPart, secondPart * sizeof(float));
  }

  const size_t nextW = (w + toWrite) % capacity_;
  writeIdx_.store(nextW, std::memory_order_release);
  return toWrite;
}

size_t RingBuffer::read(float* out, size_t count) {
  if (!out || count == 0) return 0;

  const size_t avail = availableRead();
  if (avail == 0) return 0;

  const size_t toRead = std::min(count, avail);
  const size_t r = readIdx_.load(std::memory_order_relaxed);
  const size_t firstPart = std::min(toRead, capacity_ - r);
  std::memcpy(out, &buffer_[r], firstPart * sizeof(float));

  const size_t secondPart = toRead - firstPart;
  if (secondPart > 0) {
    std::memcpy(out + firstPart, &buffer_[0], secondPart * sizeof(float));
  }

  const size_t nextR = (r + toRead) % capacity_;
  readIdx_.store(nextR, std::memory_order_release);
  return toRead;
}

void RingBuffer::clear() {
  readIdx_.store(writeIdx_.load(std::memory_order_acquire), std::memory_order_release);
}

} // namespace audio_capture

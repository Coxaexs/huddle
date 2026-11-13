#include "audio_backend.h"
#include "backend_manager.h"
#include "ring_buffer.h"
#include "stream_mixer.h"

#include <atomic>
#include <cassert>
#include <chrono>
#include <cmath>
#include <cstring>
#include <iostream>
#include <memory>
#include <thread>
#include <vector>

using namespace audio_capture;

namespace {

class MockBackend final : public IAudioBackend {
public:
  struct Control {
    bool initSucceeds = true;
    BackendType type = BackendType::PipeWire;
    bool supportsAppCapture = true;
    int initCount = 0;
    int systemStartCount = 0;
    int appStartCount = 0;
    int stopCount = 0;
    BackendCallbacks callbacks;
  };

  explicit MockBackend(std::shared_ptr<Control> ctrl) : ctrl_(std::move(ctrl)) {}

  BackendType type() const override { return ctrl_->type; }

  bool initialize(const BackendCallbacks& callbacks) override {
    ctrl_->initCount++;
    ctrl_->callbacks = callbacks;
    return ctrl_->initSucceeds;
  }

  void shutdown() override {}

  BackendCapabilities getCapabilities() const override {
    BackendCapabilities caps;
    caps.backend = ctrl_->type;
    caps.serverName = ctrl_->type == BackendType::PipeWire ? "PipeWire-Mock" : "PulseAudio-Mock";
    caps.supportsSystemCapture = true;
    caps.supportsAppCapture = ctrl_->supportsAppCapture;
    caps.supportsMultiAppCapture = ctrl_->supportsAppCapture;
    return caps;
  }

  std::vector<AudioApplication> listApplications() const override {
    AudioApplication app;
    app.appId = "1234:firefox";
    app.name = "Firefox";
    app.binary = "firefox";
    app.pid = 1234;
    app.streams.push_back({"pw:42", 42, 1001, "Firefox", "Playback", "", 0, false});
    return {app};
  }

  AudioDevice getDefaultDevice() const override {
    return {"alsa_output.pci-0000_00_1f.3.analog-stereo", "Built-in Audio Analog Stereo", 10, true};
  }

  bool startSystemCapture(const CaptureOptions& options) override {
    (void)options;
    ctrl_->systemStartCount++;
    return true;
  }

  bool startAppCapture(const std::vector<AppCaptureTarget>& targets, const CaptureOptions& options) override {
    (void)targets;
    (void)options;
    if (!ctrl_->supportsAppCapture) return false;
    ctrl_->appStartCount++;
    return true;
  }

  void stopCapture() override {
    ctrl_->stopCount++;
  }

  bool isHealthy() const override { return true; }

private:
  std::shared_ptr<Control> ctrl_;
};

void testRingBuffer() {
  RingBuffer rb(8);
  assert(rb.capacity() == 9);
  assert(rb.availableRead() == 0);
  assert(rb.availableWrite() == 8);

  float in1[5] = {1.0f, 2.0f, 3.0f, 4.0f, 5.0f};
  assert(rb.write(in1, 5) == 5);
  assert(rb.availableRead() == 5);
  assert(rb.availableWrite() == 3);

  float out1[3] = {};
  assert(rb.read(out1, 3) == 3);
  assert(out1[0] == 1.0f && out1[1] == 2.0f && out1[2] == 3.0f);

  // Wrap-around write
  float in2[6] = {6.0f, 7.0f, 8.0f, 9.0f, 10.0f, 11.0f};
  assert(rb.write(in2, 6) == 6);
  assert(rb.availableRead() == 8);

  // Overflow tracking
  float in3[2] = {12.0f, 13.0f};
  assert(rb.write(in3, 2) == 0);
  assert(rb.droppedSamples() == 2);

  float out2[8] = {};
  assert(rb.read(out2, 8) == 8);
  assert(out2[0] == 4.0f && out2[1] == 5.0f && out2[7] == 11.0f);
  assert(rb.availableRead() == 0);

  std::cout << "[PASS] testRingBuffer\n";
}

void testStreamMixer() {
  StreamMixer mixer(2, 1024);
  mixer.addStream(1);
  mixer.addStream(2);

  float s1[4] = {0.4f, -0.4f, 0.8f, -0.8f}; // 2 stereo frames
  float s2[4] = {0.3f, 0.2f, 0.7f, -0.7f};  // 2 stereo frames
  mixer.pushFrames(1, s1, 2);
  mixer.pushFrames(2, s2, 2);

  assert(mixer.availableFrames() == 2);
  float mixed[4] = {};
  const size_t n = mixer.mixFrames(mixed, 2, true);
  assert(n == 2);
  assert(std::fabs(mixed[0] - 0.7f) < 1e-5f);
  assert(std::fabs(mixed[1] - (-0.2f)) < 1e-5f);
  // Frame 2: 0.8 + 0.7 = 1.5 -> soft-clipped via tanh(1.5) < 1.0
  assert(mixed[2] > 0.89f && mixed[2] < 1.0f);
  assert(mixed[3] < -0.89f && mixed[3] > -1.0f);

  mixer.removeStream(2);
  assert(mixer.activeStreamCount() == 1);

  std::cout << "[PASS] testStreamMixer\n";
}

void testBackendPriorityAndFallback() {
  // Case 1: PipeWire succeeds -> selects PipeWire
  {
    auto pwCtrl = std::make_shared<MockBackend::Control>();
    pwCtrl->type = BackendType::PipeWire;
    pwCtrl->initSucceeds = true;

    auto paCtrl = std::make_shared<MockBackend::Control>();
    paCtrl->type = BackendType::PulseAudio;
    paCtrl->initSucceeds = true;

    BackendManager mgr(
        [pwCtrl]() { return std::make_unique<MockBackend>(pwCtrl); },
        [paCtrl]() { return std::make_unique<MockBackend>(paCtrl); });

    auto caps = mgr.initialize({});
    assert(caps.backend == BackendType::PipeWire);
    assert(pwCtrl->initCount == 1);
    assert(paCtrl->initCount == 0);
    mgr.dispose();
  }

  // Case 2: PipeWire fails -> falls back to PulseAudio
  {
    auto pwCtrl = std::make_shared<MockBackend::Control>();
    pwCtrl->type = BackendType::PipeWire;
    pwCtrl->initSucceeds = false;

    auto paCtrl = std::make_shared<MockBackend::Control>();
    paCtrl->type = BackendType::PulseAudio;
    paCtrl->initSucceeds = true;
    paCtrl->supportsAppCapture = false;

    BackendManager mgr(
        [pwCtrl]() { return std::make_unique<MockBackend>(pwCtrl); },
        [paCtrl]() { return std::make_unique<MockBackend>(paCtrl); });

    auto caps = mgr.initialize({});
    assert(caps.backend == BackendType::PulseAudio);
    assert(caps.supportsSystemCapture == true);
    assert(caps.supportsAppCapture == false);
    assert(mgr.startAppCapture({{ "1234:firefox", 1234, "Firefox", "" }}, {}) == false);
    mgr.dispose();
  }

  // Case 3: Both fail -> BackendType::None + CaptureState::Error
  {
    auto pwCtrl = std::make_shared<MockBackend::Control>();
    pwCtrl->initSucceeds = false;
    auto paCtrl = std::make_shared<MockBackend::Control>();
    paCtrl->initSucceeds = false;

    BackendManager mgr(
        [pwCtrl]() { return std::make_unique<MockBackend>(pwCtrl); },
        [paCtrl]() { return std::make_unique<MockBackend>(paCtrl); });

    auto caps = mgr.initialize({});
    assert(caps.backend == BackendType::None);
    assert(mgr.getState() == CaptureState::Error);
    mgr.dispose();
  }

  std::cout << "[PASS] testBackendPriorityAndFallback\n";
}

void testAudioDispatchAndRecovery() {
  auto pwCtrl = std::make_shared<MockBackend::Control>();
  pwCtrl->type = BackendType::PipeWire;
  pwCtrl->initSucceeds = true;

  BackendManager mgr(
      [pwCtrl]() { return std::make_unique<MockBackend>(pwCtrl); },
      nullptr);

  std::atomic<size_t> receivedFrames{0};
  std::atomic<bool> sawRecovering{false};

  BackendCallbacks cbs;
  cbs.onAudioData = [&](const float* samples, size_t frames, uint32_t sr, uint32_t ch) {
    (void)samples;
    (void)sr;
    (void)ch;
    receivedFrames.fetch_add(frames);
  };
  cbs.onStateChanged = [&](CaptureState st) {
    if (st == CaptureState::Recovering) {
      sawRecovering.store(true);
    }
  };

  mgr.initialize(cbs);
  CaptureOptions opts;
  opts.format.sampleRate = 48000;
  opts.format.channels = 2;
  opts.format.framesPerChunk = 128;
  assert(mgr.startSystemCapture(opts));
  assert(pwCtrl->systemStartCount == 1);

  // Push 256 stereo frames from simulated RT callback
  std::vector<float> dummy(256 * 2, 0.25f);
  pwCtrl->callbacks.onAudioData(dummy.data(), 256, 48000, 2);

  for (int i = 0; i < 50 && receivedFrames.load() < 256; ++i) {
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
  }
  assert(receivedFrames.load() == 256);

  // Simulate audio server restart (recoverable error)
  pwCtrl->callbacks.onError({"PIPEWIRE_DISCONNECTED", "server restarted", true});

  for (int i = 0; i < 60 && pwCtrl->systemStartCount < 2; ++i) {
    std::this_thread::sleep_for(std::chrono::milliseconds(20));
  }
  assert(sawRecovering.load() == true);
  assert(pwCtrl->initCount >= 2);
  assert(pwCtrl->systemStartCount >= 2);
  assert(mgr.getState() == CaptureState::Capturing);

  mgr.dispose();
  std::cout << "[PASS] testAudioDispatchAndRecovery\n";
}

} // namespace

int main() {
  testRingBuffer();
  testStreamMixer();
  testBackendPriorityAndFallback();
  testAudioDispatchAndRecovery();
  std::cout << "All native core tests passed!\n";
  return 0;
}

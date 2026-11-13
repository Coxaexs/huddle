#include "backend_manager.h"

#include <chrono>
#include <cstring>

namespace audio_capture {

namespace {
constexpr size_t kDefaultRingCapacitySamples = 48000 * 2 * 2; // 2 seconds stereo @ 48kHz
}

BackendManager::BackendManager()
    : primaryFactory_([]() { return createPipeWireBackend(); }),
      fallbackFactory_([]() { return createPulseAudioBackend(); }),
      ringBuffer_(kDefaultRingCapacitySamples) {}

BackendManager::BackendManager(BackendFactory primaryFactory, BackendFactory fallbackFactory)
    : primaryFactory_(std::move(primaryFactory)),
      fallbackFactory_(std::move(fallbackFactory)),
      ringBuffer_(kDefaultRingCapacitySamples) {}

BackendManager::~BackendManager() {
  dispose();
}

BackendCapabilities BackendManager::initialize(const BackendCallbacks& callbacks) {
  {
    std::lock_guard<std::mutex> lock(backendMutex_);
    userCallbacks_ = callbacks;
  }

  if (!running_.load(std::memory_order_acquire)) {
    running_.store(true, std::memory_order_release);
    dispatchThread_ = std::thread(&BackendManager::dispatchLoop, this);
    recoveryThread_ = std::thread(&BackendManager::recoveryLoop, this);
  }

  if (probeAndActivateBackend()) {
    setState(CaptureState::Ready);
  } else {
    setState(CaptureState::Error);
  }

  std::lock_guard<std::mutex> lock(backendMutex_);
  return capabilities_;
}

void BackendManager::dispose() {
  stopCapture();

  running_.store(false, std::memory_order_release);
  recovering_.store(false, std::memory_order_release);
  dispatchCv_.notify_all();
  recoveryCv_.notify_all();

  if (dispatchThread_.joinable()) {
    dispatchThread_.join();
  }
  if (recoveryThread_.joinable()) {
    recoveryThread_.join();
  }

  std::lock_guard<std::mutex> lock(backendMutex_);
  if (activeBackend_) {
    activeBackend_->shutdown();
    activeBackend_.reset();
  }
  setState(CaptureState::Disposed);
}

bool BackendManager::probeAndActivateBackend() {
  BackendCallbacks wiredCallbacks;
  {
    std::lock_guard<std::mutex> lock(backendMutex_);
    wiredCallbacks.onAudioData = [this](const float* samples, size_t frameCount, uint32_t sr, uint32_t ch) {
      handleBackendAudio(samples, frameCount, sr, ch);
    };
    wiredCallbacks.onApplicationsChanged = userCallbacks_.onApplicationsChanged;
    wiredCallbacks.onDefaultDeviceChanged = userCallbacks_.onDefaultDeviceChanged;
    wiredCallbacks.onStateChanged = [this](CaptureState s) { handleBackendState(s); };
    wiredCallbacks.onError = [this](const AudioErrorEvent& err) { handleBackendError(err); };
  }

  auto tryFactory = [&](const BackendFactory& factory) -> std::unique_ptr<IAudioBackend> {
    if (!factory) return nullptr;
    auto candidate = factory();
    if (!candidate) return nullptr;
    if (candidate->initialize(wiredCallbacks)) {
      return candidate;
    }
    candidate->shutdown();
    return nullptr;
  };

  auto chosen = tryFactory(primaryFactory_);
  if (!chosen) {
    chosen = tryFactory(fallbackFactory_);
  }

  std::lock_guard<std::mutex> lock(backendMutex_);
  if (activeBackend_) {
    activeBackend_->shutdown();
    activeBackend_.reset();
  }

  if (chosen) {
    capabilities_ = chosen->getCapabilities();
    activeBackend_ = std::move(chosen);
    return true;
  }

  capabilities_ = BackendCapabilities{};
  capabilities_.limitations.push_back("No supported Linux audio server (PipeWire or PulseAudio) is running or accessible.");
  return false;
}

BackendCapabilities BackendManager::getCapabilities() const {
  std::lock_guard<std::mutex> lock(backendMutex_);
  return capabilities_;
}

std::vector<AudioApplication> BackendManager::listApplications() const {
  std::lock_guard<std::mutex> lock(backendMutex_);
  if (!activeBackend_) return {};
  return activeBackend_->listApplications();
}

AudioDevice BackendManager::getDefaultDevice() const {
  std::lock_guard<std::mutex> lock(backendMutex_);
  if (!activeBackend_) return AudioDevice{};
  return activeBackend_->getDefaultDevice();
}

bool BackendManager::startSystemCapture(const CaptureOptions& options) {
  std::lock_guard<std::mutex> lock(backendMutex_);
  if (!activeBackend_) return false;

  lastOptions_ = options;
  lastTargets_.clear();
  ringBuffer_.clear();

  if (activeBackend_->startSystemCapture(options)) {
    mode_.store(CaptureMode::System, std::memory_order_release);
    setState(CaptureState::Capturing);
    return true;
  }
  return false;
}

bool BackendManager::startAppCapture(const std::vector<AppCaptureTarget>& targets, const CaptureOptions& options) {
  std::lock_guard<std::mutex> lock(backendMutex_);
  if (!activeBackend_) return false;
  if (!capabilities_.supportsAppCapture) return false;

  lastOptions_ = options;
  lastTargets_ = targets;
  ringBuffer_.clear();

  if (activeBackend_->startAppCapture(targets, options)) {
    mode_.store(CaptureMode::Application, std::memory_order_release);
    setState(CaptureState::Capturing);
    return true;
  }
  return false;
}

void BackendManager::stopCapture() {
  {
    std::lock_guard<std::mutex> lock(backendMutex_);
    if (activeBackend_) {
      activeBackend_->stopCapture();
    }
    mode_.store(CaptureMode::Idle, std::memory_order_release);
    if (state_.load(std::memory_order_acquire) == CaptureState::Capturing) {
      setState(CaptureState::Ready);
    }
  }
  ringBuffer_.clear();
}

void BackendManager::handleBackendAudio(const float* samples, size_t frameCount, uint32_t sampleRate, uint32_t channels) {
  if (!samples || frameCount == 0 || channels == 0) return;
  {
    std::lock_guard<std::mutex> lock(dispatchMutex_);
    lastOptions_.format.sampleRate = sampleRate;
    lastOptions_.format.channels = channels;
  }
  ringBuffer_.write(samples, frameCount * channels);
  dispatchCv_.notify_one();
}

void BackendManager::handleBackendState(CaptureState state) {
  if (state == CaptureState::Recovering || state == CaptureState::Error) {
    if (!recovering_.exchange(true, std::memory_order_acq_rel)) {
      setState(CaptureState::Recovering);
      recoveryCv_.notify_one();
    }
  } else {
    setState(state);
  }
}

void BackendManager::handleBackendError(const AudioErrorEvent& error) {
  BackendCallbacks cb;
  {
    std::lock_guard<std::mutex> lock(backendMutex_);
    cb = userCallbacks_;
  }
  if (cb.onError) {
    cb.onError(error);
  }
  if (error.recoverable) {
    if (!recovering_.exchange(true, std::memory_order_acq_rel)) {
      setState(CaptureState::Recovering);
      recoveryCv_.notify_one();
    }
  }
}

void BackendManager::dispatchLoop() {
  std::vector<float> chunkBuf;

  while (running_.load(std::memory_order_acquire)) {
    uint32_t sampleRate = 48000;
    uint32_t channels = 2;
    uint32_t framesPerChunk = 480;
    {
      std::unique_lock<std::mutex> lock(dispatchMutex_);
      dispatchCv_.wait_for(lock, std::chrono::milliseconds(15), [this]() {
        return !running_.load(std::memory_order_acquire) || ringBuffer_.availableRead() > 0;
      });
      if (!running_.load(std::memory_order_acquire)) break;
      sampleRate = lastOptions_.format.sampleRate > 0 ? lastOptions_.format.sampleRate : 48000;
      channels = lastOptions_.format.channels > 0 ? lastOptions_.format.channels : 2;
      framesPerChunk = lastOptions_.format.framesPerChunk > 0 ? lastOptions_.format.framesPerChunk : 480;
    }

    const size_t targetSamples = static_cast<size_t>(framesPerChunk) * channels;
    if (chunkBuf.size() != targetSamples) {
      chunkBuf.resize(targetSamples);
    }

    while (running_.load(std::memory_order_acquire) && ringBuffer_.availableRead() >= targetSamples) {
      const size_t readSamples = ringBuffer_.read(chunkBuf.data(), targetSamples);
      if (readSamples == 0) break;

      std::function<void(const float*, size_t, uint32_t, uint32_t)> cb;
      {
        std::lock_guard<std::mutex> lock(backendMutex_);
        cb = userCallbacks_.onAudioData;
      }
      if (cb) {
        cb(chunkBuf.data(), readSamples / channels, sampleRate, channels);
      }
    }
  }
}

void BackendManager::recoveryLoop() {
  uint32_t backoffMs = 250;

  while (running_.load(std::memory_order_acquire)) {
    {
      std::unique_lock<std::mutex> lock(recoveryMutex_);
      recoveryCv_.wait(lock, [this]() {
        return !running_.load(std::memory_order_acquire) || recovering_.load(std::memory_order_acquire);
      });
    }
    if (!running_.load(std::memory_order_acquire)) break;

    std::this_thread::sleep_for(std::chrono::milliseconds(backoffMs));
    if (!running_.load(std::memory_order_acquire)) break;

    if (probeAndActivateBackend()) {
      backoffMs = 250;
      recovering_.store(false, std::memory_order_release);

      const CaptureMode savedMode = mode_.load(std::memory_order_acquire);
      if (savedMode == CaptureMode::System) {
        std::lock_guard<std::mutex> lock(backendMutex_);
        if (activeBackend_ && activeBackend_->startSystemCapture(lastOptions_)) {
          setState(CaptureState::Capturing);
        } else {
          setState(CaptureState::Ready);
        }
      } else if (savedMode == CaptureMode::Application) {
        std::lock_guard<std::mutex> lock(backendMutex_);
        if (activeBackend_ && activeBackend_->startAppCapture(lastTargets_, lastOptions_)) {
          setState(CaptureState::Capturing);
        } else {
          setState(CaptureState::Ready);
        }
      } else {
        setState(CaptureState::Ready);
      }
    } else {
      backoffMs = std::min<uint32_t>(backoffMs * 2, 5000);
    }
  }
}

void BackendManager::setState(CaptureState newState) {
  const CaptureState prev = state_.exchange(newState, std::memory_order_acq_rel);
  if (prev != newState && userCallbacks_.onStateChanged) {
    userCallbacks_.onStateChanged(newState);
  }
}

} // namespace audio_capture

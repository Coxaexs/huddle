#include "audio_backend.h"
#include "pa_dlopen.h"
#include "stream_mixer.h"

#include <algorithm>
#include <atomic>
#include <cstring>
#include <map>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

#if defined(__linux__)
#include <unistd.h>
#endif

namespace audio_capture {

namespace {

int32_t getSelfPid() {
#if defined(__linux__)
  return static_cast<int32_t>(getpid());
#else
  return -1;
#endif
}

} // namespace

class PulseAudioBackend final : public IAudioBackend {
public:
  PulseAudioBackend() = default;
  ~PulseAudioBackend() override { shutdown(); }

  BackendType type() const override { return BackendType::PulseAudio; }

  bool initialize(const BackendCallbacks& callbacks) override {
    if (initialized_.load(std::memory_order_acquire)) return true;
    callbacks_ = callbacks;

    if (!pa_abi::loadPulseAudioApi(api_)) {
      return false;
    }

    mainloop_ = api_.pa_threaded_mainloop_new();
    if (!mainloop_) {
      pa_abi::unloadPulseAudioApi(api_);
      return false;
    }

    if (api_.pa_threaded_mainloop_start(mainloop_) < 0) {
      api_.pa_threaded_mainloop_free(mainloop_);
      mainloop_ = nullptr;
      pa_abi::unloadPulseAudioApi(api_);
      return false;
    }

    api_.pa_threaded_mainloop_lock(mainloop_);
    context_ = api_.pa_context_new(api_.pa_threaded_mainloop_get_api(mainloop_), "electron-audio-capture");
    if (!context_) {
      api_.pa_threaded_mainloop_unlock(mainloop_);
      shutdown();
      return false;
    }

    api_.pa_context_set_state_callback(context_, &PulseAudioBackend::onContextState, this);
    if (api_.pa_context_connect(context_, nullptr, pa_abi::PA_CONTEXT_NOAUTOSPAWN, nullptr) < 0) {
      api_.pa_threaded_mainloop_unlock(mainloop_);
      shutdown();
      return false;
    }

    while (!contextReady_ && !contextFailed_) {
      api_.pa_threaded_mainloop_wait(mainloop_);
    }

    if (contextFailed_) {
      api_.pa_threaded_mainloop_unlock(mainloop_);
      shutdown();
      return false;
    }

    api_.pa_context_set_subscribe_callback(context_, &PulseAudioBackend::onSubscribeEvent, this);
    auto* subOp = api_.pa_context_subscribe(
        context_,
        static_cast<pa_abi::pa_subscription_mask_t>(
            pa_abi::PA_SUBSCRIPTION_MASK_SINK |
            pa_abi::PA_SUBSCRIPTION_MASK_SINK_INPUT |
            pa_abi::PA_SUBSCRIPTION_MASK_SERVER),
        nullptr,
        nullptr);
    if (subOp) api_.pa_operation_unref(subOp);

    refreshServerInfoLocked(true);
    refreshSinksLocked(true);
    refreshSinkInputsLocked(true);

    api_.pa_threaded_mainloop_unlock(mainloop_);

    healthy_.store(true, std::memory_order_release);
    initialized_.store(true, std::memory_order_release);
    return true;
  }

  void shutdown() override {
    stopCapture();

    if (mainloop_) {
      api_.pa_threaded_mainloop_lock(mainloop_);
      if (context_) {
        api_.pa_context_set_state_callback(context_, nullptr, nullptr);
        api_.pa_context_set_subscribe_callback(context_, nullptr, nullptr);
        api_.pa_context_disconnect(context_);
        api_.pa_context_unref(context_);
        context_ = nullptr;
      }
      api_.pa_threaded_mainloop_unlock(mainloop_);
      api_.pa_threaded_mainloop_stop(mainloop_);
      api_.pa_threaded_mainloop_free(mainloop_);
      mainloop_ = nullptr;
    }

    pa_abi::unloadPulseAudioApi(api_);

    {
      std::lock_guard<std::mutex> lock(stateMutex_);
      sinks_.clear();
      sinkInputs_.clear();
      defaultSinkName_.clear();
    }

    contextReady_ = false;
    contextFailed_ = false;
    healthy_.store(false, std::memory_order_release);
    initialized_.store(false, std::memory_order_release);
  }

  BackendCapabilities getCapabilities() const override {
    std::lock_guard<std::mutex> lock(stateMutex_);
    BackendCapabilities caps;
    caps.backend = BackendType::PulseAudio;
    caps.serverName = serverName_.empty() ? "PulseAudio" : serverName_;
    caps.serverVersion = serverVersion_;
    caps.isPipeWirePulseCompat = isPipeWireCompat_;
    caps.supportsSystemCapture = true;
    caps.supportsAppCapture = (api_.pa_stream_set_monitor_stream != nullptr);
    caps.supportsMultiAppCapture = caps.supportsAppCapture;
    if (!caps.supportsAppCapture) {
      caps.limitations.push_back("Loaded libpulse does not export pa_stream_set_monitor_stream; application-specific capture is disabled.");
    } else if (!isPipeWireCompat_) {
      caps.limitations.push_back("Using native PulseAudio pa_stream_set_monitor_stream; streams may need re-attachment if moved between sinks.");
    }
    return caps;
  }

  std::vector<AudioApplication> listApplications() const override {
    std::lock_guard<std::mutex> lock(stateMutex_);
    return buildApplicationListLocked();
  }

  AudioDevice getDefaultDevice() const override {
    std::lock_guard<std::mutex> lock(stateMutex_);
    return resolveDefaultDeviceLocked();
  }

  bool startSystemCapture(const CaptureOptions& options) override {
    if (!initialized_.load(std::memory_order_acquire) || !mainloop_) return false;
    stopCapture();

    {
      std::lock_guard<std::mutex> lock(stateMutex_);
      activeOptions_ = options;
      captureMode_ = CaptureMode::System;
    }

    api_.pa_threaded_mainloop_lock(mainloop_);
    const bool ok = createSystemStreamLocked();
    api_.pa_threaded_mainloop_unlock(mainloop_);
    return ok;
  }

  bool startAppCapture(const std::vector<AppCaptureTarget>& targets, const CaptureOptions& options) override {
    if (!initialized_.load(std::memory_order_acquire) || !mainloop_) return false;
    if (!api_.pa_stream_set_monitor_stream) return false;
    stopCapture();

    std::vector<SinkInputInfo> matching;
    {
      std::lock_guard<std::mutex> lock(stateMutex_);
      activeOptions_ = options;
      activeTargets_ = targets;
      captureMode_ = CaptureMode::Application;
      mixer_.configure(options.format.channels);
      for (const auto& [idx, info] : sinkInputs_) {
        if (matchesTargetsLocked(info, targets, options.excludeSelf)) {
          matching.push_back(info);
        }
      }
    }

    api_.pa_threaded_mainloop_lock(mainloop_);
    for (const auto& info : matching) {
      attachAppStreamLocked(info);
    }
    api_.pa_threaded_mainloop_unlock(mainloop_);
    return true;
  }

  void stopCapture() override {
    {
      std::lock_guard<std::mutex> lock(stateMutex_);
      captureMode_ = CaptureMode::Idle;
      activeTargets_.clear();
    }

    if (!mainloop_) return;
    api_.pa_threaded_mainloop_lock(mainloop_);
    destroyAllCaptureStreamsLocked();
    api_.pa_threaded_mainloop_unlock(mainloop_);
    mixer_.clear();
  }

  bool isHealthy() const override {
    return healthy_.load(std::memory_order_acquire);
  }

private:
  struct SinkInfo {
    uint32_t index = 0;
    std::string name;
    std::string description;
    std::string monitorSourceName;
  };

  struct SinkInputInfo {
    uint32_t index = 0;
    uint32_t sinkIndex = 0;
    std::string name;
    std::string appName;
    std::string binary;
    int32_t pid = -1;
    bool corked = false;
  };

  struct ActivePaStream {
    PulseAudioBackend* backend = nullptr;
    uint32_t targetSinkInput = 0;
    pa_abi::pa_stream* stream = nullptr;
    bool isSystem = false;
  };

  static void onContextState(pa_abi::pa_context* c, void* userdata) {
    auto* self = static_cast<PulseAudioBackend*>(userdata);
    const auto st = self->api_.pa_context_get_state(c);
    switch (st) {
      case pa_abi::PA_CONTEXT_READY:
        self->contextReady_ = true;
        self->api_.pa_threaded_mainloop_signal(self->mainloop_, 0);
        break;
      case pa_abi::PA_CONTEXT_FAILED:
      case pa_abi::PA_CONTEXT_TERMINATED:
        self->contextFailed_ = true;
        self->api_.pa_threaded_mainloop_signal(self->mainloop_, 0);
        if (self->initialized_.load(std::memory_order_acquire)) {
          self->healthy_.store(false, std::memory_order_release);
          if (self->callbacks_.onError) {
            const int err = self->api_.pa_context_errno(c);
            const char* msg = self->api_.pa_strerror ? self->api_.pa_strerror(err) : "PulseAudio connection lost";
            self->callbacks_.onError({"PULSEAUDIO_DISCONNECTED", msg ? msg : "PulseAudio disconnected", true});
          }
          if (self->callbacks_.onStateChanged) {
            self->callbacks_.onStateChanged(CaptureState::Recovering);
          }
        }
        break;
      default:
        break;
    }
  }

  static void onSubscribeEvent(pa_abi::pa_context* c, pa_abi::pa_subscription_event_type_t t,
                               uint32_t idx, void* userdata) {
    (void)c;
    (void)idx;
    auto* self = static_cast<PulseAudioBackend*>(userdata);
    const uint32_t facility = t & pa_abi::PA_SUBSCRIPTION_EVENT_FACILITY_MASK;

    if (facility == pa_abi::PA_SUBSCRIPTION_EVENT_SERVER) {
      self->refreshServerInfoLocked(false);
    } else if (facility == pa_abi::PA_SUBSCRIPTION_EVENT_SINK) {
      self->refreshSinksLocked(false);
    } else if (facility == pa_abi::PA_SUBSCRIPTION_EVENT_SINK_INPUT) {
      self->refreshSinkInputsLocked(false);
    }
  }

  void waitOperation(pa_abi::pa_operation* op) {
    if (!op) return;
    // pa_operation_get_state isn't strictly needed if callback signals mainloop
    api_.pa_threaded_mainloop_wait(mainloop_);
    api_.pa_operation_unref(op);
  }

  void refreshServerInfoLocked(bool synchronousWait) {
    auto* op = api_.pa_context_get_server_info(context_, &PulseAudioBackend::onServerInfo, this);
    if (!op) return;
    if (synchronousWait) {
      waitOperation(op);
    } else {
      api_.pa_operation_unref(op);
    }
  }

  void refreshSinksLocked(bool synchronousWait) {
    {
      std::lock_guard<std::mutex> lock(stateMutex_);
      pendingSinks_.clear();
    }
    auto* op = api_.pa_context_get_sink_info_list(context_, &PulseAudioBackend::onSinkInfo, this);
    if (!op) return;
    if (synchronousWait) {
      waitOperation(op);
    } else {
      api_.pa_operation_unref(op);
    }
  }

  void refreshSinkInputsLocked(bool synchronousWait) {
    {
      std::lock_guard<std::mutex> lock(stateMutex_);
      pendingSinkInputs_.clear();
    }
    auto* op = api_.pa_context_get_sink_input_info_list(context_, &PulseAudioBackend::onSinkInputInfo, this);
    if (!op) return;
    if (synchronousWait) {
      waitOperation(op);
    } else {
      api_.pa_operation_unref(op);
    }
  }

  static void onServerInfo(pa_abi::pa_context* c, const pa_abi::pa_server_info* i, void* userdata) {
    (void)c;
    auto* self = static_cast<PulseAudioBackend*>(userdata);
    bool defaultChanged = false;
    bool needRetarget = false;
    AudioDevice newDefault;

    if (i) {
      std::lock_guard<std::mutex> lock(self->stateMutex_);
      if (i->server_name) {
        self->serverName_ = i->server_name;
        self->isPipeWireCompat_ = (self->serverName_.find("PipeWire") != std::string::npos);
      }
      if (i->server_version) self->serverVersion_ = i->server_version;
      if (i->default_sink_name && self->defaultSinkName_ != i->default_sink_name) {
        self->defaultSinkName_ = i->default_sink_name;
        defaultChanged = true;
        newDefault = self->resolveDefaultDeviceLocked();
        needRetarget = (self->captureMode_ == CaptureMode::System);
      }
    }

    self->api_.pa_threaded_mainloop_signal(self->mainloop_, 0);

    if (needRetarget) {
      self->destroyAllCaptureStreamsLocked();
      self->createSystemStreamLocked();
    }
    if (defaultChanged && self->callbacks_.onDefaultDeviceChanged) {
      self->callbacks_.onDefaultDeviceChanged(newDefault);
    }
  }

  static void onSinkInfo(pa_abi::pa_context* c, const pa_abi::pa_sink_info_full* i, int eol, void* userdata) {
    (void)c;
    auto* self = static_cast<PulseAudioBackend*>(userdata);
    if (eol > 0) {
      {
        std::lock_guard<std::mutex> lock(self->stateMutex_);
        self->sinks_ = std::move(self->pendingSinks_);
      }
      self->api_.pa_threaded_mainloop_signal(self->mainloop_, 0);
      return;
    }
    if (!i) return;

    SinkInfo info;
    info.index = i->index;
    if (i->name) info.name = i->name;
    if (i->description) info.description = i->description;
    if (i->monitor_source_name) {
      info.monitorSourceName = i->monitor_source_name;
    } else if (!info.name.empty()) {
      info.monitorSourceName = info.name + ".monitor";
    }

    std::lock_guard<std::mutex> lock(self->stateMutex_);
    self->pendingSinks_[info.index] = std::move(info);
  }

  static void onSinkInputInfo(pa_abi::pa_context* c, const pa_abi::pa_sink_input_info* i, int eol, void* userdata) {
    (void)c;
    auto* self = static_cast<PulseAudioBackend*>(userdata);
    if (eol > 0) {
      std::vector<AudioApplication> appsSnapshot;
      std::vector<SinkInputInfo> toAttach;
      std::vector<uint32_t> toDetach;
      bool isAppMode = false;

      {
        std::lock_guard<std::mutex> lock(self->stateMutex_);
        self->sinkInputs_ = std::move(self->pendingSinkInputs_);
        appsSnapshot = self->buildApplicationListLocked();
        isAppMode = (self->captureMode_ == CaptureMode::Application);

        if (isAppMode) {
          for (const auto& [idx, info] : self->sinkInputs_) {
            if (self->matchesTargetsLocked(info, self->activeTargets_, self->activeOptions_.excludeSelf)) {
              toAttach.push_back(info);
            }
          }
          for (const auto& s : self->activeStreams_) {
            if (!s->isSystem && self->sinkInputs_.find(s->targetSinkInput) == self->sinkInputs_.end()) {
              toDetach.push_back(s->targetSinkInput);
            }
          }
        }
      }

      if (isAppMode) {
        for (uint32_t idx : toDetach) {
          self->detachAppStreamLocked(idx);
        }
        for (const auto& info : toAttach) {
          self->attachAppStreamLocked(info);
        }
      }

      self->api_.pa_threaded_mainloop_signal(self->mainloop_, 0);

      if (self->initialized_.load(std::memory_order_acquire) && self->callbacks_.onApplicationsChanged) {
        self->callbacks_.onApplicationsChanged(appsSnapshot);
      }
      return;
    }

    if (!i) return;

    SinkInputInfo info;
    info.index = i->index;
    info.sinkIndex = i->sink;
    info.corked = (i->corked != 0);
    if (i->name) info.name = i->name;
    if (i->proplist && self->api_.pa_proplist_gets) {
      if (const char* a = self->api_.pa_proplist_gets(i->proplist, "application.name")) info.appName = a;
      if (const char* b = self->api_.pa_proplist_gets(i->proplist, "application.process.binary")) info.binary = b;
      if (const char* p = self->api_.pa_proplist_gets(i->proplist, "application.process.id")) info.pid = std::atoi(p);
    }

    if (info.pid > 0 && info.pid == getSelfPid()) {
      return;
    }

    std::lock_guard<std::mutex> lock(self->stateMutex_);
    self->pendingSinkInputs_[info.index] = std::move(info);
  }

  static void onStreamRead(pa_abi::pa_stream* s, size_t nbytes, void* userdata) {
    (void)nbytes;
    auto* ctx = static_cast<ActivePaStream*>(userdata);
    if (!ctx || !ctx->backend) return;
    auto* self = ctx->backend;

    const void* data = nullptr;
    size_t len = 0;
    while (self->api_.pa_stream_peek(s, &data, &len) >= 0 && len > 0) {
      if (data) {
        const uint32_t channels = self->activeOptions_.format.channels > 0 ? self->activeOptions_.format.channels : 2;
        const uint32_t sampleRate = self->activeOptions_.format.sampleRate > 0 ? self->activeOptions_.format.sampleRate : 48000;
        const size_t frameCount = len / (sizeof(float) * channels);
        if (frameCount > 0) {
          const float* samples = static_cast<const float*>(data);
          if (ctx->isSystem) {
            if (self->callbacks_.onAudioData) {
              self->callbacks_.onAudioData(samples, frameCount, sampleRate, channels);
            }
          } else {
            self->mixer_.pushFrames(ctx->targetSinkInput, samples, frameCount);
            const size_t avail = self->mixer_.availableFrames();
            if (avail > 0) {
              std::vector<float> mixed(avail * channels);
              const size_t outFrames = self->mixer_.mixFrames(mixed.data(), avail, self->activeOptions_.softClip);
              if (outFrames > 0 && self->callbacks_.onAudioData) {
                self->callbacks_.onAudioData(mixed.data(), outFrames, sampleRate, channels);
              }
            }
          }
        }
      }
      self->api_.pa_stream_drop(s);
      data = nullptr;
      len = 0;
    }
  }

  static void onStreamState(pa_abi::pa_stream* s, void* userdata) {
    auto* ctx = static_cast<ActivePaStream*>(userdata);
    if (!ctx || !ctx->backend) return;
    const auto st = ctx->backend->api_.pa_stream_get_state(s);
    if (st == pa_abi::PA_STREAM_FAILED && ctx->backend->callbacks_.onError) {
      ctx->backend->callbacks_.onError({"PULSEAUDIO_STREAM_ERROR", "PulseAudio capture stream failed", false});
    }
  }

  bool createSystemStreamLocked() {
    std::string monitorSource;
    uint32_t sampleRate = 48000;
    uint32_t channels = 2;
    {
      std::lock_guard<std::mutex> lock(stateMutex_);
      sampleRate = activeOptions_.format.sampleRate;
      channels = activeOptions_.format.channels;
      for (const auto& [idx, sink] : sinks_) {
        if (sink.name == defaultSinkName_) {
          monitorSource = sink.monitorSourceName;
          break;
        }
      }
      if (monitorSource.empty() && !defaultSinkName_.empty()) {
        monitorSource = defaultSinkName_ + ".monitor";
      }
    }

    pa_abi::pa_sample_spec ss{};
    ss.format = pa_abi::PA_SAMPLE_FLOAT32LE;
    ss.rate = sampleRate;
    ss.channels = static_cast<uint8_t>(channels);

    pa_abi::pa_buffer_attr attr{};
    attr.maxlength = static_cast<uint32_t>(-1);
    attr.fragsize = sampleRate * channels * sizeof(float) / 100; // 10ms

    auto ctx = std::make_unique<ActivePaStream>();
    ctx->backend = this;
    ctx->isSystem = true;
    ctx->stream = api_.pa_stream_new(context_, "electron-system-capture", &ss, nullptr);
    if (!ctx->stream) return false;

    api_.pa_stream_set_state_callback(ctx->stream, &PulseAudioBackend::onStreamState, ctx.get());
    api_.pa_stream_set_read_callback(ctx->stream, &PulseAudioBackend::onStreamRead, ctx.get());

    const int res = api_.pa_stream_connect_record(
        ctx->stream,
        monitorSource.empty() ? nullptr : monitorSource.c_str(),
        &attr,
        static_cast<pa_abi::pa_stream_flags_t>(
            pa_abi::PA_STREAM_ADJUST_LATENCY | pa_abi::PA_STREAM_AUTO_TIMING_UPDATE));
    if (res < 0) {
      api_.pa_stream_unref(ctx->stream);
      return false;
    }

    activeStreams_.push_back(std::move(ctx));
    return true;
  }

  void attachAppStreamLocked(const SinkInputInfo& info) {
    for (const auto& existing : activeStreams_) {
      if (!existing->isSystem && existing->targetSinkInput == info.index) {
        return;
      }
    }

    std::string monitorSource;
    uint32_t sampleRate = 48000;
    uint32_t channels = 2;
    {
      std::lock_guard<std::mutex> lock(stateMutex_);
      sampleRate = activeOptions_.format.sampleRate;
      channels = activeOptions_.format.channels;
      auto it = sinks_.find(info.sinkIndex);
      if (it != sinks_.end()) {
        monitorSource = it->second.monitorSourceName;
      } else if (!defaultSinkName_.empty()) {
        monitorSource = defaultSinkName_ + ".monitor";
      }
    }

    pa_abi::pa_sample_spec ss{};
    ss.format = pa_abi::PA_SAMPLE_FLOAT32LE;
    ss.rate = sampleRate;
    ss.channels = static_cast<uint8_t>(channels);

    pa_abi::pa_buffer_attr attr{};
    attr.maxlength = static_cast<uint32_t>(-1);
    attr.fragsize = sampleRate * channels * sizeof(float) / 100;

    auto ctx = std::make_unique<ActivePaStream>();
    ctx->backend = this;
    ctx->targetSinkInput = info.index;
    ctx->isSystem = false;
    const std::string name = "electron-app-capture-" + std::to_string(info.index);
    ctx->stream = api_.pa_stream_new(context_, name.c_str(), &ss, nullptr);
    if (!ctx->stream) return;

    if (api_.pa_stream_set_monitor_stream(ctx->stream, info.index) < 0) {
      api_.pa_stream_unref(ctx->stream);
      return;
    }

    mixer_.addStream(info.index);
    api_.pa_stream_set_state_callback(ctx->stream, &PulseAudioBackend::onStreamState, ctx.get());
    api_.pa_stream_set_read_callback(ctx->stream, &PulseAudioBackend::onStreamRead, ctx.get());

    const int res = api_.pa_stream_connect_record(
        ctx->stream,
        monitorSource.empty() ? nullptr : monitorSource.c_str(),
        &attr,
        static_cast<pa_abi::pa_stream_flags_t>(
            pa_abi::PA_STREAM_ADJUST_LATENCY | pa_abi::PA_STREAM_AUTO_TIMING_UPDATE));
    if (res < 0) {
      mixer_.removeStream(info.index);
      api_.pa_stream_unref(ctx->stream);
      return;
    }

    activeStreams_.push_back(std::move(ctx));
  }

  void detachAppStreamLocked(uint32_t sinkInputIdx) {
    for (auto it = activeStreams_.begin(); it != activeStreams_.end();) {
      if (!(*it)->isSystem && (*it)->targetSinkInput == sinkInputIdx) {
        if ((*it)->stream) {
          api_.pa_stream_disconnect((*it)->stream);
          api_.pa_stream_unref((*it)->stream);
        }
        mixer_.removeStream(sinkInputIdx);
        it = activeStreams_.erase(it);
      } else {
        ++it;
      }
    }
  }

  void destroyAllCaptureStreamsLocked() {
    for (auto& s : activeStreams_) {
      if (s->stream) {
        api_.pa_stream_disconnect(s->stream);
        api_.pa_stream_unref(s->stream);
      }
    }
    activeStreams_.clear();
  }

  AudioDevice resolveDefaultDeviceLocked() const {
    AudioDevice dev;
    dev.id = defaultSinkName_;
    dev.description = defaultSinkName_;
    dev.isDefault = true;
    for (const auto& [idx, sink] : sinks_) {
      if (sink.name == defaultSinkName_) {
        dev.numericId = sink.index;
        dev.description = sink.description;
        break;
      }
    }
    return dev;
  }

  static std::string makeAppId(const SinkInputInfo& info) {
    if (info.pid > 0 && !info.binary.empty()) {
      return std::to_string(info.pid) + ":" + info.binary;
    }
    if (info.pid > 0 && !info.appName.empty()) {
      return std::to_string(info.pid) + ":" + info.appName;
    }
    return !info.binary.empty() ? info.binary : info.appName;
  }

  std::vector<AudioApplication> buildApplicationListLocked() const {
    std::map<std::string, AudioApplication> grouped;
    for (const auto& [idx, info] : sinkInputs_) {
      const std::string appId = makeAppId(info);
      auto& app = grouped[appId];
      if (app.appId.empty()) {
        app.appId = appId;
        app.name = !info.appName.empty() ? info.appName : info.name;
        app.binary = info.binary;
        app.pid = info.pid;
      }
      AudioApplicationStream stream;
      stream.streamId = "pa:" + std::to_string(info.index);
      stream.backendNodeId = info.index;
      stream.nodeName = info.name;
      stream.mediaName = info.name;
      stream.sinkIndex = info.sinkIndex;
      stream.isCorked = info.corked;
      app.streams.push_back(std::move(stream));
    }

    std::vector<AudioApplication> result;
    result.reserve(grouped.size());
    for (auto& [k, v] : grouped) {
      result.push_back(std::move(v));
    }
    return result;
  }

  bool matchesTargetsLocked(const SinkInputInfo& info,
                            const std::vector<AppCaptureTarget>& targets,
                            bool excludeSelf) const {
    if (excludeSelf && info.pid > 0 && info.pid == getSelfPid()) {
      return false;
    }
    const std::string streamId = "pa:" + std::to_string(info.index);
    const std::string appId = makeAppId(info);

    for (const auto& t : targets) {
      if (!t.streamId.empty() && t.streamId == streamId) return true;
      if (!t.appId.empty() && t.appId == appId) return true;
      if (t.pid > 0 && t.pid == info.pid) return true;
      if (!t.appName.empty() && !info.appName.empty() && t.appName == info.appName) return true;
    }
    return false;
  }

  pa_abi::PulseAudioApi api_;
  BackendCallbacks callbacks_;

  pa_abi::pa_threaded_mainloop* mainloop_ = nullptr;
  pa_abi::pa_context* context_ = nullptr;
  bool contextReady_ = false;
  bool contextFailed_ = false;

  std::atomic<bool> initialized_{false};
  std::atomic<bool> healthy_{false};

  mutable std::mutex stateMutex_;
  std::string serverName_;
  std::string serverVersion_;
  bool isPipeWireCompat_ = false;
  std::string defaultSinkName_;
  std::unordered_map<uint32_t, SinkInfo> sinks_;
  std::unordered_map<uint32_t, SinkInfo> pendingSinks_;
  std::unordered_map<uint32_t, SinkInputInfo> sinkInputs_;
  std::unordered_map<uint32_t, SinkInputInfo> pendingSinkInputs_;

  CaptureMode captureMode_ = CaptureMode::Idle;
  CaptureOptions activeOptions_;
  std::vector<AppCaptureTarget> activeTargets_;
  std::vector<std::unique_ptr<ActivePaStream>> activeStreams_;
  StreamMixer mixer_{2};
};

std::unique_ptr<IAudioBackend> createPulseAudioBackend() {
  return std::make_unique<PulseAudioBackend>();
}

} // namespace audio_capture

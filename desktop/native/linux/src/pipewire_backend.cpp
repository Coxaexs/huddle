#include "audio_backend.h"
#include "pw_dlopen.h"
#include "stream_mixer.h"

#include <algorithm>
#include <atomic>
#include <cerrno>
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

// Fixed-layout SPA POD Object for SPA_PARAM_EnumFormat (Float32LE interleaved)
struct alignas(8) SpaAudioFormatPod {
  uint32_t objSize;
  uint32_t objType;
  uint32_t bodyType;
  uint32_t bodyId;

  struct alignas(8) PropId {
    uint32_t key;
    uint32_t flags;
    uint32_t size;
    uint32_t type;
    uint32_t value;
    uint32_t pad;
  };

  struct alignas(8) PropInt {
    uint32_t key;
    uint32_t flags;
    uint32_t size;
    uint32_t type;
    int32_t value;
    uint32_t pad;
  };

  PropId mediaType;
  PropId mediaSubtype;
  PropId format;
  PropInt rate;
  PropInt channels;
};

SpaAudioFormatPod makeFloat32FormatPod(uint32_t sampleRate, uint32_t channels) {
  SpaAudioFormatPod pod{};
  pod.objSize = sizeof(SpaAudioFormatPod) - 8;
  pod.objType = pw_abi::SPA_TYPE_Object;
  pod.bodyType = pw_abi::SPA_TYPE_OBJECT_Format;
  pod.bodyId = pw_abi::SPA_PARAM_EnumFormat;

  pod.mediaType = {pw_abi::SPA_FORMAT_mediaType, 0, 4, pw_abi::SPA_TYPE_Id, pw_abi::SPA_MEDIA_TYPE_audio, 0};
  pod.mediaSubtype = {pw_abi::SPA_FORMAT_mediaSubtype, 0, 4, pw_abi::SPA_TYPE_Id, pw_abi::SPA_MEDIA_SUBTYPE_raw, 0};
  pod.format = {pw_abi::SPA_FORMAT_AUDIO_format, 0, 4, pw_abi::SPA_TYPE_Id, pw_abi::SPA_AUDIO_FORMAT_F32_LE, 0};
  pod.rate = {pw_abi::SPA_FORMAT_AUDIO_rate, 0, 4, pw_abi::SPA_TYPE_Int, static_cast<int32_t>(sampleRate), 0};
  pod.channels = {pw_abi::SPA_FORMAT_AUDIO_channels, 0, 4, pw_abi::SPA_TYPE_Int, static_cast<int32_t>(channels), 0};
  return pod;
}

// Extracts "name" from WirePlumber metadata JSON string like {"name":"alsa_output.pci-..."}
std::string parseMetadataJsonName(const char* json) {
  if (!json) return "";
  std::string s(json);
  const std::string key = "\"name\"";
  auto pos = s.find(key);
  if (pos == std::string::npos) return "";
  pos = s.find(':', pos + key.size());
  if (pos == std::string::npos) return "";
  auto q1 = s.find('"', pos + 1);
  if (q1 == std::string::npos) return "";
  auto q2 = s.find('"', q1 + 1);
  if (q2 == std::string::npos) return "";
  return s.substr(q1 + 1, q2 - q1 - 1);
}

int32_t getSelfPid() {
#if defined(__linux__)
  return static_cast<int32_t>(getpid());
#else
  return -1;
#endif
}

template <typename Methods, typename Obj, typename... Args>
auto spaCall(Obj* obj, Methods* (Methods::*unused) = nullptr) = delete;

inline const pw_abi::pw_core_methods* coreMethods(pw_abi::pw_core* core) {
  auto* iface = reinterpret_cast<pw_abi::spa_interface*>(core);
  return reinterpret_cast<const pw_abi::pw_core_methods*>(iface->cb.funcs);
}

inline const pw_abi::pw_registry_methods* registryMethods(pw_abi::pw_registry* reg) {
  auto* iface = reinterpret_cast<pw_abi::spa_interface*>(reg);
  return reinterpret_cast<const pw_abi::pw_registry_methods*>(iface->cb.funcs);
}

} // namespace

class PipeWireBackend final : public IAudioBackend {
public:
  PipeWireBackend() = default;
  ~PipeWireBackend() override { shutdown(); }

  BackendType type() const override { return BackendType::PipeWire; }

  bool initialize(const BackendCallbacks& callbacks) override {
    if (initialized_.load(std::memory_order_acquire)) return true;
    callbacks_ = callbacks;

    if (!pw_abi::loadPipeWireApi(api_)) {
      return false;
    }

    api_.pw_init(nullptr, nullptr);
    loop_ = api_.pw_thread_loop_new("electron-pw-capture", nullptr);
    if (!loop_) {
      cleanupLocked();
      return false;
    }

    if (api_.pw_thread_loop_start(loop_) < 0) {
      cleanupLocked();
      return false;
    }

    api_.pw_thread_loop_lock(loop_);
    context_ = api_.pw_context_new(api_.pw_thread_loop_get_loop(loop_), nullptr, 0);
    if (!context_) {
      api_.pw_thread_loop_unlock(loop_);
      cleanupLocked();
      return false;
    }

    core_ = api_.pw_context_connect(context_, nullptr, 0);
    if (!core_) {
      api_.pw_thread_loop_unlock(loop_);
      cleanupLocked();
      return false;
    }

    setupCoreAndRegistryListeners();

    // Sync to wait for initial globals (default metadata, sinks, existing streams)
    syncSeq_ = coreMethods(core_)->sync(core_, 0, 0);
    syncDone_ = false;
    while (!syncDone_ && !coreError_) {
      api_.pw_thread_loop_wait(loop_);
    }

    const bool ok = !coreError_;
    api_.pw_thread_loop_unlock(loop_);

    if (!ok) {
      shutdown();
      return false;
    }

    healthy_.store(true, std::memory_order_release);
    initialized_.store(true, std::memory_order_release);
    return true;
  }

  void shutdown() override {
    stopCapture();

    if (loop_) {
      api_.pw_thread_loop_lock(loop_);
      if (defaultMetadataProxy_) {
        api_.pw_proxy_destroy(defaultMetadataProxy_);
        defaultMetadataProxy_ = nullptr;
      }
      if (registry_) {
        api_.pw_proxy_destroy(reinterpret_cast<pw_abi::pw_proxy*>(registry_));
        registry_ = nullptr;
      }
      if (core_) {
        api_.pw_core_disconnect(core_);
        core_ = nullptr;
      }
      if (context_) {
        api_.pw_context_destroy(context_);
        context_ = nullptr;
      }
      api_.pw_thread_loop_unlock(loop_);
      api_.pw_thread_loop_stop(loop_);
      api_.pw_thread_loop_destroy(loop_);
      loop_ = nullptr;
    }

    if (api_.loaded && api_.pw_deinit) {
      api_.pw_deinit();
    }
    pw_abi::unloadPipeWireApi(api_);

    {
      std::lock_guard<std::mutex> lock(stateMutex_);
      sinks_.clear();
      appStreams_.clear();
      defaultSinkName_.clear();
    }

    healthy_.store(false, std::memory_order_release);
    initialized_.store(false, std::memory_order_release);
  }

  BackendCapabilities getCapabilities() const override {
    std::lock_guard<std::mutex> lock(stateMutex_);
    BackendCapabilities caps;
    caps.backend = BackendType::PipeWire;
    caps.serverName = serverName_.empty() ? "PipeWire" : serverName_;
    caps.serverVersion = serverVersion_;
    caps.isPipeWirePulseCompat = false;
    caps.supportsSystemCapture = true;
    caps.supportsAppCapture = true;
    caps.supportsMultiAppCapture = true;
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
    if (!initialized_.load(std::memory_order_acquire) || !loop_) return false;
    stopCapture();

    {
      std::lock_guard<std::mutex> lock(stateMutex_);
      activeOptions_ = options;
      captureMode_ = CaptureMode::System;
    }

    api_.pw_thread_loop_lock(loop_);
    const bool ok = createSystemStreamLocked();
    api_.pw_thread_loop_unlock(loop_);
    return ok;
  }

  bool startAppCapture(const std::vector<AppCaptureTarget>& targets, const CaptureOptions& options) override {
    if (!initialized_.load(std::memory_order_acquire) || !loop_) return false;
    stopCapture();

    std::vector<StreamNode> matchingNodes;
    {
      std::lock_guard<std::mutex> lock(stateMutex_);
      activeOptions_ = options;
      activeTargets_ = targets;
      captureMode_ = CaptureMode::Application;
      mixer_.configure(options.format.channels);
      for (const auto& [id, node] : appStreams_) {
        if (matchesTargetsLocked(node, targets, options.excludeSelf)) {
          matchingNodes.push_back(node);
        }
      }
    }

    api_.pw_thread_loop_lock(loop_);
    for (const auto& node : matchingNodes) {
      attachAppStreamLocked(node);
    }
    api_.pw_thread_loop_unlock(loop_);
    return true;
  }

  void stopCapture() override {
    {
      std::lock_guard<std::mutex> lock(stateMutex_);
      captureMode_ = CaptureMode::Idle;
      activeTargets_.clear();
    }

    if (!loop_) return;
    api_.pw_thread_loop_lock(loop_);
    destroyAllCaptureStreamsLocked();
    api_.pw_thread_loop_unlock(loop_);
    mixer_.clear();
  }

  bool isHealthy() const override {
    return healthy_.load(std::memory_order_acquire);
  }

private:
  struct SinkNode {
    uint32_t id = 0;
    uint64_t objectSerial = 0;
    std::string nodeName;
    std::string description;
  };

  struct StreamNode {
    uint32_t id = 0;
    uint64_t objectSerial = 0;
    std::string nodeName;
    std::string mediaName;
    std::string appName;
    std::string binary;
    int32_t pid = -1;
  };

  struct ActiveCaptureStream {
    PipeWireBackend* backend = nullptr;
    uint32_t targetNodeId = 0; // 0 for system capture
    pw_abi::pw_stream* stream = nullptr;
    pw_abi::spa_hook listener{};
    bool isSystem = false;
  };

  void cleanupLocked() {
    if (loop_) {
      api_.pw_thread_loop_stop(loop_);
      api_.pw_thread_loop_destroy(loop_);
      loop_ = nullptr;
    }
    if (api_.loaded && api_.pw_deinit) {
      api_.pw_deinit();
    }
    pw_abi::unloadPipeWireApi(api_);
  }

  void setupCoreAndRegistryListeners() {
    coreEvents_ = {};
    coreEvents_.version = pw_abi::PW_VERSION_CORE_EVENTS;
    coreEvents_.info = &PipeWireBackend::onCoreInfo;
    coreEvents_.done = &PipeWireBackend::onCoreDone;
    coreEvents_.error = &PipeWireBackend::onCoreError;
    coreMethods(core_)->add_listener(core_, &coreListener_, &coreEvents_, this);

    registry_ = coreMethods(core_)->get_registry(core_, pw_abi::PW_VERSION_REGISTRY, 0);
    registryEvents_ = {};
    registryEvents_.version = pw_abi::PW_VERSION_REGISTRY_EVENTS;
    registryEvents_.global = &PipeWireBackend::onRegistryGlobal;
    registryEvents_.global_remove = &PipeWireBackend::onRegistryGlobalRemove;
    registryMethods(registry_)->add_listener(registry_, &registryListener_, &registryEvents_, this);
  }

  static void onCoreInfo(void* data, const pw_abi::pw_core_info* info) {
    auto* self = static_cast<PipeWireBackend*>(data);
    if (!info) return;
    std::lock_guard<std::mutex> lock(self->stateMutex_);
    if (info->name) self->serverName_ = info->name;
    if (info->version) self->serverVersion_ = info->version;
  }

  static void onCoreDone(void* data, uint32_t id, int seq) {
    auto* self = static_cast<PipeWireBackend*>(data);
    if (id == 0 && seq == self->syncSeq_) {
      self->syncDone_ = true;
      self->api_.pw_thread_loop_signal(self->loop_, false);
    }
  }

  static void onCoreError(void* data, uint32_t id, int seq, int res, const char* message) {
    (void)seq;
    auto* self = static_cast<PipeWireBackend*>(data);
    if (id == 0 && (res == -EPIPE || res == -ECONNRESET)) {
      self->coreError_ = true;
      self->healthy_.store(false, std::memory_order_release);
      self->api_.pw_thread_loop_signal(self->loop_, false);
      if (self->callbacks_.onError) {
        self->callbacks_.onError({"PIPEWIRE_DISCONNECTED", message ? message : "PipeWire connection lost", true});
      }
      if (self->callbacks_.onStateChanged) {
        self->callbacks_.onStateChanged(CaptureState::Recovering);
      }
    }
  }

  static void onRegistryGlobal(void* data, uint32_t id, uint32_t permissions,
                               const char* type, uint32_t version, const pw_abi::spa_dict* props) {
    (void)permissions;
    (void)version;
    auto* self = static_cast<PipeWireBackend*>(data);
    if (!type || !props) return;

    const std::string typeStr(type);
    if (typeStr == pw_abi::PW_TYPE_INTERFACE_Metadata) {
      const char* metaName = pw_abi::spaDictLookup(props, "metadata.name");
      if (metaName && std::string(metaName) == "default" && !self->defaultMetadataProxy_) {
        self->defaultMetadataProxy_ = static_cast<pw_abi::pw_proxy*>(
            registryMethods(self->registry_)->bind(self->registry_, id, type, pw_abi::PW_VERSION_METADATA, 0));
        if (self->defaultMetadataProxy_) {
          self->metadataEvents_ = {};
          self->metadataEvents_.version = pw_abi::PW_VERSION_METADATA_EVENTS;
          self->metadataEvents_.property = &PipeWireBackend::onMetadataProperty;
          self->api_.pw_proxy_add_object_listener(
              self->defaultMetadataProxy_, &self->metadataListener_, &self->metadataEvents_, self);
        }
      }
      return;
    }

    if (typeStr != pw_abi::PW_TYPE_INTERFACE_Node) return;

    const char* mediaClass = pw_abi::spaDictLookup(props, "media.class");
    if (!mediaClass) return;
    const std::string mc(mediaClass);

    if (mc == "Audio/Sink") {
      SinkNode sink;
      sink.id = id;
      if (const char* s = pw_abi::spaDictLookup(props, "object.serial")) {
        sink.objectSerial = std::strtoull(s, nullptr, 10);
      }
      if (const char* n = pw_abi::spaDictLookup(props, "node.name")) sink.nodeName = n;
      if (const char* d = pw_abi::spaDictLookup(props, "node.description")) sink.description = d;
      if (sink.description.empty()) sink.description = sink.nodeName;

      bool notifyDefault = false;
      AudioDevice defaultDev;
      {
        std::lock_guard<std::mutex> lock(self->stateMutex_);
        self->sinks_[id] = sink;
        if (!self->defaultSinkName_.empty() && sink.nodeName == self->defaultSinkName_) {
          defaultDev = self->resolveDefaultDeviceLocked();
          notifyDefault = true;
        }
      }
      if (notifyDefault && self->callbacks_.onDefaultDeviceChanged) {
        self->callbacks_.onDefaultDeviceChanged(defaultDev);
      }
      return;
    }

    if (mc == "Stream/Output/Audio") {
      StreamNode node;
      node.id = id;
      if (const char* s = pw_abi::spaDictLookup(props, "object.serial")) {
        node.objectSerial = std::strtoull(s, nullptr, 10);
      }
      if (const char* n = pw_abi::spaDictLookup(props, "node.name")) node.nodeName = n;
      if (const char* m = pw_abi::spaDictLookup(props, "media.name")) node.mediaName = m;
      if (const char* a = pw_abi::spaDictLookup(props, "application.name")) node.appName = a;
      if (const char* b = pw_abi::spaDictLookup(props, "application.process.binary")) node.binary = b;
      if (const char* p = pw_abi::spaDictLookup(props, "application.process.id")) {
        node.pid = std::atoi(p);
      }

      if (node.pid > 0 && node.pid == getSelfPid()) {
        return; // Never expose or capture our own process to prevent feedback loops
      }

      bool shouldAttach = false;
      std::vector<AudioApplication> appsSnapshot;
      {
        std::lock_guard<std::mutex> lock(self->stateMutex_);
        self->appStreams_[id] = node;
        appsSnapshot = self->buildApplicationListLocked();
        if (self->captureMode_ == CaptureMode::Application &&
            self->matchesTargetsLocked(node, self->activeTargets_, self->activeOptions_.excludeSelf)) {
          shouldAttach = true;
        }
      }

      if (shouldAttach) {
        self->attachAppStreamLocked(node);
      }
      if (self->callbacks_.onApplicationsChanged) {
        self->callbacks_.onApplicationsChanged(appsSnapshot);
      }
    }
  }

  static void onRegistryGlobalRemove(void* data, uint32_t id) {
    auto* self = static_cast<PipeWireBackend*>(data);
    bool appsChanged = false;
    std::vector<AudioApplication> appsSnapshot;

    {
      std::lock_guard<std::mutex> lock(self->stateMutex_);
      self->sinks_.erase(id);
      if (self->appStreams_.erase(id) > 0) {
        appsChanged = true;
        appsSnapshot = self->buildApplicationListLocked();
      }
    }

    // Detach any active app capture stream for this node id
    self->detachAppStreamLocked(id);

    if (appsChanged && self->callbacks_.onApplicationsChanged) {
      self->callbacks_.onApplicationsChanged(appsSnapshot);
    }
  }

  static int onMetadataProperty(void* data, uint32_t subject, const char* key,
                                const char* type, const char* value) {
    (void)subject;
    (void)type;
    auto* self = static_cast<PipeWireBackend*>(data);
    if (!key || !value) return 0;

    const std::string k(key);
    if (k == "default.audio.sink" || k == "default.configured.audio.sink") {
      const std::string sinkName = parseMetadataJsonName(value);
      if (sinkName.empty()) return 0;

      bool changed = false;
      bool needRetargetSystem = false;
      AudioDevice newDefault;
      {
        std::lock_guard<std::mutex> lock(self->stateMutex_);
        if (self->defaultSinkName_ != sinkName) {
          self->defaultSinkName_ = sinkName;
          changed = true;
          newDefault = self->resolveDefaultDeviceLocked();
          needRetargetSystem = (self->captureMode_ == CaptureMode::System);
        }
      }

      if (needRetargetSystem) {
        self->destroyAllCaptureStreamsLocked();
        self->createSystemStreamLocked();
      }
      if (changed && self->callbacks_.onDefaultDeviceChanged) {
        self->callbacks_.onDefaultDeviceChanged(newDefault);
      }
    }
    return 0;
  }

  static void onStreamProcess(void* data) {
    auto* ctx = static_cast<ActiveCaptureStream*>(data);
    if (!ctx || !ctx->backend || !ctx->stream) return;
    auto* self = ctx->backend;

    pw_abi::pw_buffer* buf = self->api_.pw_stream_dequeue_buffer(ctx->stream);
    if (!buf) return;

    if (buf->buffer && buf->buffer->n_datas > 0) {
      const auto& d = buf->buffer->datas[0];
      if (d.data && d.chunk && d.chunk->size > 0) {
        const uint8_t* raw = static_cast<const uint8_t*>(d.data) + d.chunk->offset;
        const size_t byteSize = d.chunk->size;
        const uint32_t channels = self->activeOptions_.format.channels > 0 ? self->activeOptions_.format.channels : 2;
        const uint32_t sampleRate = self->activeOptions_.format.sampleRate > 0 ? self->activeOptions_.format.sampleRate : 48000;
        const size_t frameCount = byteSize / (sizeof(float) * channels);

        if (frameCount > 0) {
          const float* samples = reinterpret_cast<const float*>(raw);
          if (ctx->isSystem) {
            if (self->callbacks_.onAudioData) {
              self->callbacks_.onAudioData(samples, frameCount, sampleRate, channels);
            }
          } else {
            self->mixer_.pushFrames(ctx->targetNodeId, samples, frameCount);
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
    }

    self->api_.pw_stream_queue_buffer(ctx->stream, buf);
  }

  static void onStreamStateChanged(void* data, pw_abi::pw_stream_state oldState,
                                   pw_abi::pw_stream_state state, const char* error) {
    (void)oldState;
    auto* ctx = static_cast<ActiveCaptureStream*>(data);
    if (!ctx || !ctx->backend) return;
    if (state == pw_abi::PW_STREAM_STATE_ERROR && ctx->backend->callbacks_.onError) {
      ctx->backend->callbacks_.onError({
          "PIPEWIRE_STREAM_ERROR",
          error ? error : "PipeWire stream entered error state",
          false
      });
    }
  }

  bool createSystemStreamLocked() {
    std::string targetSink;
    uint32_t sampleRate = 48000;
    uint32_t channels = 2;
    {
      std::lock_guard<std::mutex> lock(stateMutex_);
      targetSink = defaultSinkName_;
      sampleRate = activeOptions_.format.sampleRate;
      channels = activeOptions_.format.channels;
    }

    pw_abi::pw_properties* props = api_.pw_properties_new(
        "media.type", "Audio",
        "media.category", "Capture",
        "media.role", "Screen",
        "node.name", "electron-system-audio-capture",
        "stream.capture.sink", "true",
        nullptr);
    if (!targetSink.empty()) {
      api_.pw_properties_set(props, "target.object", targetSink.c_str());
    }

    auto ctx = std::make_unique<ActiveCaptureStream>();
    ctx->backend = this;
    ctx->isSystem = true;

    pw_abi::pw_stream_events events{};
    events.version = pw_abi::PW_VERSION_STREAM_EVENTS;
    events.process = &PipeWireBackend::onStreamProcess;
    events.state_changed = &PipeWireBackend::onStreamStateChanged;

    ctx->stream = api_.pw_stream_new_simple(
        api_.pw_thread_loop_get_loop(loop_),
        "electron-system-audio-capture",
        props,
        &events,
        ctx.get());
    if (!ctx->stream) return false;

    SpaAudioFormatPod formatPod = makeFloat32FormatPod(sampleRate, channels);
    const pw_abi::spa_pod* params[1] = {reinterpret_cast<const pw_abi::spa_pod*>(&formatPod)};
    const int res = api_.pw_stream_connect(
        ctx->stream,
        pw_abi::PW_DIRECTION_INPUT,
        pw_abi::PW_ID_ANY,
        static_cast<pw_abi::pw_stream_flags>(
            pw_abi::PW_STREAM_FLAG_AUTOCONNECT |
            pw_abi::PW_STREAM_FLAG_MAP_BUFFERS |
            pw_abi::PW_STREAM_FLAG_RT_PROCESS),
        params,
        1);
    if (res < 0) {
      api_.pw_stream_destroy(ctx->stream);
      return false;
    }

    activeStreams_.push_back(std::move(ctx));
    return true;
  }

  void attachAppStreamLocked(const StreamNode& node) {
    for (const auto& existing : activeStreams_) {
      if (!existing->isSystem && existing->targetNodeId == node.id) {
        return; // Already attached
      }
    }

    const uint32_t sampleRate = activeOptions_.format.sampleRate;
    const uint32_t channels = activeOptions_.format.channels;
    const std::string target = node.objectSerial > 0
        ? std::to_string(node.objectSerial)
        : node.nodeName;
    const std::string captureName = "electron-app-capture-" + std::to_string(node.id);

    pw_abi::pw_properties* props = api_.pw_properties_new(
        "media.type", "Audio",
        "media.category", "Capture",
        "media.role", "Screen",
        "node.name", captureName.c_str(),
        "node.passive", "true",
        "target.object", target.c_str(),
        nullptr);

    auto ctx = std::make_unique<ActiveCaptureStream>();
    ctx->backend = this;
    ctx->targetNodeId = node.id;
    ctx->isSystem = false;

    pw_abi::pw_stream_events events{};
    events.version = pw_abi::PW_VERSION_STREAM_EVENTS;
    events.process = &PipeWireBackend::onStreamProcess;
    events.state_changed = &PipeWireBackend::onStreamStateChanged;

    ctx->stream = api_.pw_stream_new_simple(
        api_.pw_thread_loop_get_loop(loop_),
        captureName.c_str(),
        props,
        &events,
        ctx.get());
    if (!ctx->stream) return;

    mixer_.addStream(node.id);

    SpaAudioFormatPod formatPod = makeFloat32FormatPod(sampleRate, channels);
    const pw_abi::spa_pod* params[1] = {reinterpret_cast<const pw_abi::spa_pod*>(&formatPod)};
    const int res = api_.pw_stream_connect(
        ctx->stream,
        pw_abi::PW_DIRECTION_INPUT,
        pw_abi::PW_ID_ANY,
        static_cast<pw_abi::pw_stream_flags>(
            pw_abi::PW_STREAM_FLAG_AUTOCONNECT |
            pw_abi::PW_STREAM_FLAG_MAP_BUFFERS |
            pw_abi::PW_STREAM_FLAG_RT_PROCESS),
        params,
        1);
    if (res < 0) {
      mixer_.removeStream(node.id);
      api_.pw_stream_destroy(ctx->stream);
      return;
    }

    activeStreams_.push_back(std::move(ctx));
  }

  void detachAppStreamLocked(uint32_t nodeId) {
    for (auto it = activeStreams_.begin(); it != activeStreams_.end();) {
      if (!(*it)->isSystem && (*it)->targetNodeId == nodeId) {
        if ((*it)->stream) {
          api_.pw_stream_disconnect((*it)->stream);
          api_.pw_stream_destroy((*it)->stream);
        }
        mixer_.removeStream(nodeId);
        it = activeStreams_.erase(it);
      } else {
        ++it;
      }
    }
  }

  void destroyAllCaptureStreamsLocked() {
    for (auto& s : activeStreams_) {
      if (s->stream) {
        api_.pw_stream_disconnect(s->stream);
        api_.pw_stream_destroy(s->stream);
      }
    }
    activeStreams_.clear();
  }

  AudioDevice resolveDefaultDeviceLocked() const {
    AudioDevice dev;
    dev.id = defaultSinkName_;
    dev.description = defaultSinkName_;
    dev.isDefault = true;
    for (const auto& [id, sink] : sinks_) {
      if (sink.nodeName == defaultSinkName_) {
        dev.numericId = sink.id;
        dev.description = sink.description;
        break;
      }
    }
    return dev;
  }

  static std::string makeAppId(const StreamNode& node) {
    if (node.pid > 0 && !node.binary.empty()) {
      return std::to_string(node.pid) + ":" + node.binary;
    }
    if (node.pid > 0 && !node.appName.empty()) {
      return std::to_string(node.pid) + ":" + node.appName;
    }
    return !node.binary.empty() ? node.binary : node.appName;
  }

  std::vector<AudioApplication> buildApplicationListLocked() const {
    std::map<std::string, AudioApplication> grouped;
    for (const auto& [id, node] : appStreams_) {
      const std::string appId = makeAppId(node);
      auto& app = grouped[appId];
      if (app.appId.empty()) {
        app.appId = appId;
        app.name = !node.appName.empty() ? node.appName : node.nodeName;
        app.binary = node.binary;
        app.pid = node.pid;
      }
      AudioApplicationStream stream;
      stream.streamId = "pw:" + std::to_string(node.id);
      stream.backendNodeId = node.id;
      stream.objectSerial = node.objectSerial;
      stream.nodeName = node.nodeName;
      stream.mediaName = node.mediaName;
      app.streams.push_back(std::move(stream));
    }

    std::vector<AudioApplication> result;
    result.reserve(grouped.size());
    for (auto& [k, v] : grouped) {
      result.push_back(std::move(v));
    }
    return result;
  }

  bool matchesTargetsLocked(const StreamNode& node,
                            const std::vector<AppCaptureTarget>& targets,
                            bool excludeSelf) const {
    if (excludeSelf && node.pid > 0 && node.pid == getSelfPid()) {
      return false;
    }
    const std::string nodeStreamId = "pw:" + std::to_string(node.id);
    const std::string nodeAppId = makeAppId(node);

    for (const auto& t : targets) {
      if (!t.streamId.empty() && t.streamId == nodeStreamId) return true;
      if (!t.appId.empty() && t.appId == nodeAppId) return true;
      if (t.pid > 0 && t.pid == node.pid) return true;
      if (!t.appName.empty() && !node.appName.empty() && t.appName == node.appName) return true;
    }
    return false;
  }

  pw_abi::PipeWireApi api_;
  BackendCallbacks callbacks_;

  pw_abi::pw_thread_loop* loop_ = nullptr;
  pw_abi::pw_context* context_ = nullptr;
  pw_abi::pw_core* core_ = nullptr;
  pw_abi::pw_registry* registry_ = nullptr;
  pw_abi::pw_proxy* defaultMetadataProxy_ = nullptr;

  pw_abi::spa_hook coreListener_{};
  pw_abi::pw_core_events coreEvents_{};
  pw_abi::spa_hook registryListener_{};
  pw_abi::pw_registry_events registryEvents_{};
  pw_abi::spa_hook metadataListener_{};
  pw_abi::pw_metadata_events metadataEvents_{};

  int syncSeq_ = 0;
  bool syncDone_ = false;
  bool coreError_ = false;

  std::atomic<bool> initialized_{false};
  std::atomic<bool> healthy_{false};

  mutable std::mutex stateMutex_;
  std::string serverName_;
  std::string serverVersion_;
  std::string defaultSinkName_;
  std::unordered_map<uint32_t, SinkNode> sinks_;
  std::unordered_map<uint32_t, StreamNode> appStreams_;

  CaptureMode captureMode_ = CaptureMode::Idle;
  CaptureOptions activeOptions_;
  std::vector<AppCaptureTarget> activeTargets_;
  std::vector<std::unique_ptr<ActiveCaptureStream>> activeStreams_;
  StreamMixer mixer_{2};
};

std::unique_ptr<IAudioBackend> createPipeWireBackend() {
  return std::make_unique<PipeWireBackend>();
}

} // namespace audio_capture

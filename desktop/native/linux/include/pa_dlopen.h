#pragma once

#include <cstddef>
#include <cstdint>

namespace audio_capture {
namespace pa_abi {

// Minimal, ABI-stable PulseAudio C definitions for runtime dlopen() loading.
// Eliminates hard DT_NEEDED dependencies on libpulse.so.0 in AppImages.

struct pa_threaded_mainloop;
struct pa_mainloop_api;
struct pa_context;
struct pa_stream;
struct pa_operation;
struct pa_proplist;

enum pa_context_state_t {
  PA_CONTEXT_UNCONNECTED = 0,
  PA_CONTEXT_CONNECTING = 1,
  PA_CONTEXT_AUTHORIZING = 2,
  PA_CONTEXT_SETTING_NAME = 3,
  PA_CONTEXT_READY = 4,
  PA_CONTEXT_FAILED = 5,
  PA_CONTEXT_TERMINATED = 6
};

enum pa_stream_state_t {
  PA_STREAM_UNCONNECTED = 0,
  PA_STREAM_CREATING = 1,
  PA_STREAM_READY = 2,
  PA_STREAM_FAILED = 3,
  PA_STREAM_TERMINATED = 4
};

enum pa_sample_format_t {
  PA_SAMPLE_U8 = 0,
  PA_SAMPLE_ALAW = 1,
  PA_SAMPLE_ULAW = 2,
  PA_SAMPLE_S16LE = 3,
  PA_SAMPLE_S16BE = 4,
  PA_SAMPLE_FLOAT32LE = 5,
  PA_SAMPLE_FLOAT32BE = 6,
  PA_SAMPLE_S32LE = 7,
  PA_SAMPLE_S32BE = 8
};

enum pa_subscription_mask_t {
  PA_SUBSCRIPTION_MASK_NULL = 0x0000U,
  PA_SUBSCRIPTION_MASK_SINK = 0x0001U,
  PA_SUBSCRIPTION_MASK_SOURCE = 0x0002U,
  PA_SUBSCRIPTION_MASK_SINK_INPUT = 0x0004U,
  PA_SUBSCRIPTION_MASK_SOURCE_OUTPUT = 0x0008U,
  PA_SUBSCRIPTION_MASK_MODULE = 0x0010U,
  PA_SUBSCRIPTION_MASK_CLIENT = 0x0020U,
  PA_SUBSCRIPTION_MASK_SAMPLE_CACHE = 0x0040U,
  PA_SUBSCRIPTION_MASK_SERVER = 0x0080U
};

enum pa_subscription_event_type_t {
  PA_SUBSCRIPTION_EVENT_SINK = 0x0000U,
  PA_SUBSCRIPTION_EVENT_SOURCE = 0x0001U,
  PA_SUBSCRIPTION_EVENT_SINK_INPUT = 0x0002U,
  PA_SUBSCRIPTION_EVENT_CLIENT = 0x0005U,
  PA_SUBSCRIPTION_EVENT_SERVER = 0x0007U,
  PA_SUBSCRIPTION_EVENT_FACILITY_MASK = 0x000FU,
  PA_SUBSCRIPTION_EVENT_NEW = 0x0000U,
  PA_SUBSCRIPTION_EVENT_CHANGE = 0x0010U,
  PA_SUBSCRIPTION_EVENT_REMOVE = 0x0020U,
  PA_SUBSCRIPTION_EVENT_TYPE_MASK = 0x0030U
};

enum pa_stream_flags_t {
  PA_STREAM_NOFLAGS = 0x0000U,
  PA_STREAM_START_CORKED = 0x0001U,
  PA_STREAM_INTERPOLATE_TIMING = 0x0002U,
  PA_STREAM_AUTO_TIMING_UPDATE = 0x0008U,
  PA_STREAM_ADJUST_LATENCY = 0x2000U
};

enum pa_context_flags_t {
  PA_CONTEXT_NOFLAGS = 0x0000U,
  PA_CONTEXT_NOAUTOSPAWN = 0x0001U,
  PA_CONTEXT_NOFAIL = 0x0002U
};

struct pa_sample_spec {
  pa_sample_format_t format;
  uint32_t rate;
  uint8_t channels;
};

struct pa_buffer_attr {
  uint32_t maxlength;
  uint32_t tlength;
  uint32_t prebuf;
  uint32_t minreq;
  uint32_t fragsize;
};

struct pa_server_info {
  const char* user_name;
  const char* host_name;
  const char* server_version;
  const char* server_name;
  pa_sample_spec sample_spec;
  const char* default_sink_name;
  const char* default_source_name;
  uint32_t cookie;
};

struct pa_sink_info {
  const char* name;
  uint32_t index;
  const char* description;
  pa_sample_spec sample_spec;
  uint8_t channel_map_channels;
  uint8_t channel_map_pad[128]; // opaque tail padding; we only read name, index, description, monitor_source_name via offset or safe fields
  // Note: to avoid struct-layout fragility on pa_sink_info/pa_sink_input_info,
  // we use "<sink_name>.monitor" or query source_info / standard PulseAudio fields.
};

// Note: pa_sink_input_info layout in libpulse 1.0 - 17.0:
// We only access the first fields (index, name, owner_module, client, sink, sample_spec)
// and proplist. To be 100% ABI safe across all libpulse versions, we define the exact
// PulseAudio 0.9.22+ struct prefix up to proplist, or use pa_proplist_gets.
struct pa_channel_map {
  uint8_t channels;
  int map[32];
};

struct pa_cvolume {
  uint8_t channels;
  uint32_t values[32];
};

struct pa_sink_info_full {
  const char* name;
  uint32_t index;
  const char* description;
  pa_sample_spec sample_spec;
  pa_channel_map channel_map;
  uint32_t owner_module;
  pa_cvolume volume;
  int mute;
  uint32_t monitor_source;
  const char* monitor_source_name;
  uint64_t latency;
  const char* driver;
  int flags;
  pa_proplist* proplist;
  uint64_t configured_latency;
  uint32_t base_volume;
  int state;
  uint32_t n_volume_steps;
  uint32_t card;
  uint32_t n_ports;
  void* ports;
  void* active_port;
  uint8_t n_formats;
  void* formats;
};

struct pa_sink_input_info {
  uint32_t index;
  const char* name;
  uint32_t owner_module;
  uint32_t client;
  uint32_t sink;
  pa_sample_spec sample_spec;
  pa_channel_map channel_map;
  pa_cvolume volume;
  uint64_t buffer_usec;
  uint64_t sink_usec;
  const char* resample_method;
  const char* driver;
  int mute;
  pa_proplist* proplist;
  int corked;
  int has_volume;
  int volume_writable;
  void* format;
};

using pa_context_notify_cb_t = void (*)(pa_context* c, void* userdata);
using pa_context_subscribe_cb_t = void (*)(pa_context* c, pa_subscription_event_type_t t, uint32_t idx, void* userdata);
using pa_server_info_cb_t = void (*)(pa_context* c, const pa_server_info* i, void* userdata);
using pa_sink_info_cb_t = void (*)(pa_context* c, const pa_sink_info_full* i, int eol, void* userdata);
using pa_sink_input_info_cb_t = void (*)(pa_context* c, const pa_sink_input_info* i, int eol, void* userdata);
using pa_context_success_cb_t = void (*)(pa_context* c, int success, void* userdata);
using pa_stream_notify_cb_t = void (*)(pa_stream* s, void* userdata);
using pa_stream_request_cb_t = void (*)(pa_stream* s, size_t nbytes, void* userdata);

struct PulseAudioApi {
  void* handle = nullptr;
  bool loaded = false;

  pa_threaded_mainloop* (*pa_threaded_mainloop_new)(void) = nullptr;
  void (*pa_threaded_mainloop_free)(pa_threaded_mainloop* m) = nullptr;
  int (*pa_threaded_mainloop_start)(pa_threaded_mainloop* m) = nullptr;
  void (*pa_threaded_mainloop_stop)(pa_threaded_mainloop* m) = nullptr;
  void (*pa_threaded_mainloop_lock)(pa_threaded_mainloop* m) = nullptr;
  void (*pa_threaded_mainloop_unlock)(pa_threaded_mainloop* m) = nullptr;
  void (*pa_threaded_mainloop_wait)(pa_threaded_mainloop* m) = nullptr;
  void (*pa_threaded_mainloop_signal)(pa_threaded_mainloop* m, int wait_for_accept) = nullptr;
  pa_mainloop_api* (*pa_threaded_mainloop_get_api)(pa_threaded_mainloop* m) = nullptr;

  pa_context* (*pa_context_new)(pa_mainloop_api* mainloop, const char* name) = nullptr;
  void (*pa_context_unref)(pa_context* c) = nullptr;
  int (*pa_context_connect)(pa_context* c, const char* server, pa_context_flags_t flags, const void* api) = nullptr;
  void (*pa_context_disconnect)(pa_context* c) = nullptr;
  pa_context_state_t (*pa_context_get_state)(const pa_context* c) = nullptr;
  int (*pa_context_errno)(const pa_context* c) = nullptr;
  void (*pa_context_set_state_callback)(pa_context* c, pa_context_notify_cb_t cb, void* userdata) = nullptr;
  void (*pa_context_set_subscribe_callback)(pa_context* c, pa_context_subscribe_cb_t cb, void* userdata) = nullptr;
  pa_operation* (*pa_context_subscribe)(pa_context* c, pa_subscription_mask_t m, pa_context_success_cb_t cb, void* userdata) = nullptr;
  pa_operation* (*pa_context_get_server_info)(pa_context* c, pa_server_info_cb_t cb, void* userdata) = nullptr;
  pa_operation* (*pa_context_get_sink_info_by_name)(pa_context* c, const char* name, pa_sink_info_cb_t cb, void* userdata) = nullptr;
  pa_operation* (*pa_context_get_sink_info_list)(pa_context* c, pa_sink_info_cb_t cb, void* userdata) = nullptr;
  pa_operation* (*pa_context_get_sink_input_info_list)(pa_context* c, pa_sink_input_info_cb_t cb, void* userdata) = nullptr;

  pa_stream* (*pa_stream_new)(pa_context* c, const char* name, const pa_sample_spec* ss, const pa_channel_map* map) = nullptr;
  void (*pa_stream_unref)(pa_stream* s) = nullptr;
  int (*pa_stream_set_monitor_stream)(pa_stream* s, uint32_t sink_input_idx) = nullptr; // optional: checked at runtime!
  int (*pa_stream_connect_record)(pa_stream* s, const char* dev, const pa_buffer_attr* attr, pa_stream_flags_t flags) = nullptr;
  int (*pa_stream_disconnect)(pa_stream* s) = nullptr;
  pa_stream_state_t (*pa_stream_get_state)(const pa_stream* s) = nullptr;
  void (*pa_stream_set_state_callback)(pa_stream* s, pa_stream_notify_cb_t cb, void* userdata) = nullptr;
  void (*pa_stream_set_read_callback)(pa_stream* s, pa_stream_request_cb_t cb, void* userdata) = nullptr;
  int (*pa_stream_peek)(pa_stream* s, const void** data, size_t* nbytes) = nullptr;
  int (*pa_stream_drop)(pa_stream* s) = nullptr;

  void (*pa_operation_unref)(pa_operation* o) = nullptr;
  const char* (*pa_proplist_gets)(const pa_proplist* p, const char* key) = nullptr;
  const char* (*pa_strerror)(int error) = nullptr;
};

bool loadPulseAudioApi(PulseAudioApi& api);
void unloadPulseAudioApi(PulseAudioApi& api);

} // namespace pa_abi
} // namespace audio_capture

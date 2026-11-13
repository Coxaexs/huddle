#pragma once

#include <cstddef>
#include <cstdint>
#include <string_view>

namespace audio_capture {
namespace pw_abi {

// Minimal, ABI-stable PipeWire 0.3 / SPA C definitions for runtime dlopen() loading.
// Eliminates hard DT_NEEDED dependencies on libpipewire-0.3.so.0 in AppImages.

struct spa_list {
  struct spa_list* next;
  struct spa_list* prev;
};

struct spa_callbacks {
  const void* funcs;
  void* data;
};

struct spa_interface {
  const char* type;
  uint32_t version;
  struct spa_callbacks cb;
};

struct spa_hook {
  struct spa_list link;
  struct spa_callbacks cb;
  void (*removed)(struct spa_hook* hook);
  void* priv;
};

struct spa_dict_item {
  const char* key;
  const char* value;
};

struct spa_dict {
  uint32_t flags;
  uint32_t n_items;
  const struct spa_dict_item* items;
};

struct spa_pod {
  uint32_t size;
  uint32_t type;
};

struct spa_chunk {
  uint32_t offset;
  uint32_t size;
  int32_t stride;
  int32_t flags;
};

struct spa_data {
  uint32_t type;
  uint32_t flags;
  int64_t fd;
  uint32_t mapoffset;
  uint32_t maxsize;
  void* data;
  struct spa_chunk* chunk;
};

struct spa_meta {
  uint32_t type;
  uint32_t size;
  void* data;
};

struct spa_buffer {
  uint32_t n_metas;
  uint32_t n_datas;
  struct spa_meta* metas;
  struct spa_data* datas;
};

struct pw_loop;
struct pw_thread_loop;
struct pw_context;
struct pw_core;
struct pw_registry;
struct pw_proxy;
struct pw_properties;
struct pw_stream;

struct pw_buffer {
  struct spa_buffer* buffer;
  void* user_data;
  uint64_t size;
  uint64_t requested;
};

struct pw_core_info {
  uint32_t id;
  uint32_t cookie;
  const char* user_name;
  const char* host_name;
  const char* version;
  const char* name;
  uint64_t change_mask;
  struct spa_dict* props;
};

enum pw_direction {
  PW_DIRECTION_INPUT = 0,
  PW_DIRECTION_OUTPUT = 1
};

enum pw_stream_state {
  PW_STREAM_STATE_ERROR = -1,
  PW_STREAM_STATE_UNCONNECTED = 0,
  PW_STREAM_STATE_CONNECTING = 1,
  PW_STREAM_STATE_PAUSED = 2,
  PW_STREAM_STATE_STREAMING = 3
};

enum pw_stream_flags {
  PW_STREAM_FLAG_NONE = 0,
  PW_STREAM_FLAG_AUTOCONNECT = (1 << 0),
  PW_STREAM_FLAG_INACTIVE = (1 << 1),
  PW_STREAM_FLAG_MAP_BUFFERS = (1 << 2),
  PW_STREAM_FLAG_DRIVER = (1 << 3),
  PW_STREAM_FLAG_RT_PROCESS = (1 << 4),
  PW_STREAM_FLAG_NO_CONVERT = (1 << 5),
  PW_STREAM_FLAG_EXCLUSIVE = (1 << 6),
  PW_STREAM_FLAG_DONT_RECONNECT = (1 << 7),
  PW_STREAM_FLAG_ALLOC_BUFFERS = (1 << 8),
  PW_STREAM_FLAG_TRIGGER = (1 << 9)
};

constexpr uint32_t PW_ID_ANY = 0xffffffffu;
constexpr uint32_t PW_VERSION_CORE = 4;
constexpr uint32_t PW_VERSION_CORE_EVENTS = 1;
constexpr uint32_t PW_VERSION_REGISTRY = 3;
constexpr uint32_t PW_VERSION_REGISTRY_EVENTS = 0;
constexpr uint32_t PW_VERSION_METADATA = 3;
constexpr uint32_t PW_VERSION_METADATA_EVENTS = 0;
constexpr uint32_t PW_VERSION_STREAM_EVENTS = 2;

constexpr const char* PW_TYPE_INTERFACE_Node = "PipeWire:Interface:Node";
constexpr const char* PW_TYPE_INTERFACE_Metadata = "PipeWire:Interface:Metadata";
constexpr const char* PW_TYPE_INTERFACE_Registry = "PipeWire:Interface:Registry";

// SPA Pod & Audio constants
constexpr uint32_t SPA_TYPE_Int = 4;
constexpr uint32_t SPA_TYPE_Id = 3;
constexpr uint32_t SPA_TYPE_Object = 15;
constexpr uint32_t SPA_TYPE_OBJECT_Format = 0x40003;
constexpr uint32_t SPA_PARAM_EnumFormat = 3;
constexpr uint32_t SPA_FORMAT_mediaType = 1;
constexpr uint32_t SPA_FORMAT_mediaSubtype = 2;
constexpr uint32_t SPA_FORMAT_AUDIO_format = 0x10001;
constexpr uint32_t SPA_FORMAT_AUDIO_rate = 0x10002;
constexpr uint32_t SPA_FORMAT_AUDIO_channels = 0x10003;
constexpr uint32_t SPA_MEDIA_TYPE_audio = 1;
constexpr uint32_t SPA_MEDIA_SUBTYPE_raw = 1;
constexpr uint32_t SPA_AUDIO_FORMAT_F32_LE = 0x11b; // SPA_AUDIO_FORMAT_F32LE

struct pw_core_events {
  uint32_t version;
  void (*info)(void* data, const struct pw_core_info* info);
  void (*done)(void* data, uint32_t id, int seq);
  void (*ping)(void* data, uint32_t id, int seq);
  void (*error)(void* data, uint32_t id, int seq, int res, const char* message);
  void (*remove_id)(void* data, uint32_t id);
  void (*bound_id)(void* data, uint32_t id, uint32_t global_id);
  void (*add_mem)(void* data, uint32_t id, uint32_t type, int fd, uint32_t flags);
  void (*remove_mem)(void* data, uint32_t id);
  void (*bound_props)(void* data, uint32_t id, uint32_t global_id, const struct spa_dict* props);
};

struct pw_core_methods {
  uint32_t version;
  int (*add_listener)(void* object, struct spa_hook* listener, const struct pw_core_events* events, void* data);
  int (*hello)(void* object, uint32_t version);
  int (*sync)(void* object, uint32_t id, int seq);
  int (*pong)(void* object, uint32_t id, int seq);
  int (*error)(void* object, uint32_t id, int seq, int res, const char* message);
  struct pw_registry* (*get_registry)(void* object, uint32_t version, size_t user_data_size);
  void* (*create_object)(void* object, const char* factory_name, const char* type, uint32_t version, const struct spa_dict* props, size_t user_data_size);
  int (*destroy)(void* object, void* proxy);
};

struct pw_registry_events {
  uint32_t version;
  void (*global)(void* data, uint32_t id, uint32_t permissions, const char* type, uint32_t version, const struct spa_dict* props);
  void (*global_remove)(void* data, uint32_t id);
};

struct pw_registry_methods {
  uint32_t version;
  int (*add_listener)(void* object, struct spa_hook* listener, const struct pw_registry_events* events, void* data);
  void* (*bind)(void* object, uint32_t id, const char* type, uint32_t version, size_t user_data_size);
  int (*destroy)(void* object, uint32_t id);
};

struct pw_metadata_events {
  uint32_t version;
  int (*property)(void* data, uint32_t subject, const char* key, const char* type, const char* value);
};

struct pw_stream_events {
  uint32_t version;
  void (*destroy)(void* data);
  void (*state_changed)(void* data, enum pw_stream_state old, enum pw_stream_state state, const char* error);
  void (*control_info)(void* data, uint32_t id, const void* control);
  void (*io_changed)(void* data, uint32_t id, void* area, uint32_t size);
  void (*param_changed)(void* data, uint32_t id, const struct spa_pod* param);
  void (*add_buffer)(void* data, struct pw_buffer* buffer);
  void (*remove_buffer)(void* data, struct pw_buffer* buffer);
  void (*process)(void* data);
  void (*drained)(void* data);
  void (*command)(void* data, const void* command);
  void (*trigger_done)(void* data);
};

struct PipeWireApi {
  void* handle = nullptr;
  bool loaded = false;

  void (*pw_init)(int* argc, char*** argv) = nullptr;
  void (*pw_deinit)(void) = nullptr;
  const char* (*pw_get_library_version)(void) = nullptr;

  struct pw_thread_loop* (*pw_thread_loop_new)(const char* name, const struct spa_dict* props) = nullptr;
  void (*pw_thread_loop_destroy)(struct pw_thread_loop* loop) = nullptr;
  struct pw_loop* (*pw_thread_loop_get_loop)(struct pw_thread_loop* loop) = nullptr;
  int (*pw_thread_loop_start)(struct pw_thread_loop* loop) = nullptr;
  void (*pw_thread_loop_stop)(struct pw_thread_loop* loop) = nullptr;
  void (*pw_thread_loop_lock)(struct pw_thread_loop* loop) = nullptr;
  void (*pw_thread_loop_unlock)(struct pw_thread_loop* loop) = nullptr;
  void (*pw_thread_loop_signal)(struct pw_thread_loop* loop, bool wait_for_accept) = nullptr;
  void (*pw_thread_loop_wait)(struct pw_thread_loop* loop) = nullptr;

  struct pw_context* (*pw_context_new)(struct pw_loop* main_loop, struct pw_properties* props, size_t user_data_size) = nullptr;
  void (*pw_context_destroy)(struct pw_context* context) = nullptr;
  struct pw_core* (*pw_context_connect)(struct pw_context* context, struct pw_properties* properties, size_t user_data_size) = nullptr;
  int (*pw_core_disconnect)(struct pw_core* core) = nullptr;

  struct pw_properties* (*pw_properties_new)(const char* key, ...) = nullptr;
  int (*pw_properties_set)(struct pw_properties* properties, const char* key, const char* value) = nullptr;
  void (*pw_properties_free)(struct pw_properties* properties) = nullptr;

  struct pw_stream* (*pw_stream_new_simple)(struct pw_loop* loop, const char* name, struct pw_properties* props, const struct pw_stream_events* events, void* data) = nullptr;
  void (*pw_stream_destroy)(struct pw_stream* stream) = nullptr;
  int (*pw_stream_connect)(struct pw_stream* stream, enum pw_direction direction, uint32_t target_id, enum pw_stream_flags flags, const struct spa_pod** params, uint32_t n_params) = nullptr;
  int (*pw_stream_disconnect)(struct pw_stream* stream) = nullptr;
  struct pw_buffer* (*pw_stream_dequeue_buffer)(struct pw_stream* stream) = nullptr;
  int (*pw_stream_queue_buffer)(struct pw_stream* stream, struct pw_buffer* buffer) = nullptr;
  enum pw_stream_state (*pw_stream_get_state)(struct pw_stream* stream, const char** error) = nullptr;

  void (*pw_proxy_destroy)(struct pw_proxy* proxy) = nullptr;
  void (*pw_proxy_add_object_listener)(struct pw_proxy* proxy, struct spa_hook* listener, const void* funcs, void* data) = nullptr;
};

bool loadPipeWireApi(PipeWireApi& api);
void unloadPipeWireApi(PipeWireApi& api);

// Helper to lookup a key in spa_dict
inline const char* spaDictLookup(const struct spa_dict* dict, const char* key) {
  if (!dict || !key) return nullptr;
  for (uint32_t i = 0; i < dict->n_items; ++i) {
    if (dict->items[i].key && std::string_view(dict->items[i].key) == key) {
      return dict->items[i].value;
    }
  }
  return nullptr;
}

} // namespace pw_abi
} // namespace audio_capture

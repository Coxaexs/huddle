#include "pw_dlopen.h"

#if defined(__linux__)
#include <dlfcn.h>
#endif

namespace audio_capture {
namespace pw_abi {

namespace {
template <typename T>
bool loadSym(void* handle, const char* name, T& fn) {
#if defined(__linux__)
  fn = reinterpret_cast<T>(dlsym(handle, name));
  return fn != nullptr;
#else
  (void)handle;
  (void)name;
  fn = nullptr;
  return false;
#endif
}
} // namespace

bool loadPipeWireApi(PipeWireApi& api) {
  if (api.loaded) return true;
#if !defined(__linux__)
  return false;
#else
  const char* candidates[] = {
    "libpipewire-0.3.so.0",
    "libpipewire-0.3.so"
  };

  void* handle = nullptr;
  for (const char* name : candidates) {
    handle = dlopen(name, RTLD_LAZY | RTLD_LOCAL);
    if (handle) break;
  }
  if (!handle) {
    return false;
  }

  bool ok = true;
  ok &= loadSym(handle, "pw_init", api.pw_init);
  ok &= loadSym(handle, "pw_deinit", api.pw_deinit);
  loadSym(handle, "pw_get_library_version", api.pw_get_library_version);

  ok &= loadSym(handle, "pw_thread_loop_new", api.pw_thread_loop_new);
  ok &= loadSym(handle, "pw_thread_loop_destroy", api.pw_thread_loop_destroy);
  ok &= loadSym(handle, "pw_thread_loop_get_loop", api.pw_thread_loop_get_loop);
  ok &= loadSym(handle, "pw_thread_loop_start", api.pw_thread_loop_start);
  ok &= loadSym(handle, "pw_thread_loop_stop", api.pw_thread_loop_stop);
  ok &= loadSym(handle, "pw_thread_loop_lock", api.pw_thread_loop_lock);
  ok &= loadSym(handle, "pw_thread_loop_unlock", api.pw_thread_loop_unlock);
  ok &= loadSym(handle, "pw_thread_loop_signal", api.pw_thread_loop_signal);
  ok &= loadSym(handle, "pw_thread_loop_wait", api.pw_thread_loop_wait);

  ok &= loadSym(handle, "pw_context_new", api.pw_context_new);
  ok &= loadSym(handle, "pw_context_destroy", api.pw_context_destroy);
  ok &= loadSym(handle, "pw_context_connect", api.pw_context_connect);
  ok &= loadSym(handle, "pw_core_disconnect", api.pw_core_disconnect);

  ok &= loadSym(handle, "pw_properties_new", api.pw_properties_new);
  ok &= loadSym(handle, "pw_properties_set", api.pw_properties_set);
  ok &= loadSym(handle, "pw_properties_free", api.pw_properties_free);

  ok &= loadSym(handle, "pw_stream_new_simple", api.pw_stream_new_simple);
  ok &= loadSym(handle, "pw_stream_destroy", api.pw_stream_destroy);
  ok &= loadSym(handle, "pw_stream_connect", api.pw_stream_connect);
  ok &= loadSym(handle, "pw_stream_disconnect", api.pw_stream_disconnect);
  ok &= loadSym(handle, "pw_stream_dequeue_buffer", api.pw_stream_dequeue_buffer);
  ok &= loadSym(handle, "pw_stream_queue_buffer", api.pw_stream_queue_buffer);
  ok &= loadSym(handle, "pw_stream_get_state", api.pw_stream_get_state);

  ok &= loadSym(handle, "pw_proxy_destroy", api.pw_proxy_destroy);
  ok &= loadSym(handle, "pw_proxy_add_object_listener", api.pw_proxy_add_object_listener);

  if (!ok) {
    dlclose(handle);
    api = PipeWireApi{};
    return false;
  }

  api.handle = handle;
  api.loaded = true;
  return true;
#endif
}

void unloadPipeWireApi(PipeWireApi& api) {
#if defined(__linux__)
  if (api.handle) {
    dlclose(api.handle);
  }
#endif
  api = PipeWireApi{};
}

} // namespace pw_abi
} // namespace audio_capture

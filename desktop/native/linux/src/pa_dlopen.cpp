#include "pa_dlopen.h"

#if defined(__linux__)
#include <dlfcn.h>
#endif

namespace audio_capture {
namespace pa_abi {

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

bool loadPulseAudioApi(PulseAudioApi& api) {
  if (api.loaded) return true;
#if !defined(__linux__)
  return false;
#else
  const char* candidates[] = {
    "libpulse.so.0",
    "libpulse.so"
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
  ok &= loadSym(handle, "pa_threaded_mainloop_new", api.pa_threaded_mainloop_new);
  ok &= loadSym(handle, "pa_threaded_mainloop_free", api.pa_threaded_mainloop_free);
  ok &= loadSym(handle, "pa_threaded_mainloop_start", api.pa_threaded_mainloop_start);
  ok &= loadSym(handle, "pa_threaded_mainloop_stop", api.pa_threaded_mainloop_stop);
  ok &= loadSym(handle, "pa_threaded_mainloop_lock", api.pa_threaded_mainloop_lock);
  ok &= loadSym(handle, "pa_threaded_mainloop_unlock", api.pa_threaded_mainloop_unlock);
  ok &= loadSym(handle, "pa_threaded_mainloop_wait", api.pa_threaded_mainloop_wait);
  ok &= loadSym(handle, "pa_threaded_mainloop_signal", api.pa_threaded_mainloop_signal);
  ok &= loadSym(handle, "pa_threaded_mainloop_get_api", api.pa_threaded_mainloop_get_api);

  ok &= loadSym(handle, "pa_context_new", api.pa_context_new);
  ok &= loadSym(handle, "pa_context_unref", api.pa_context_unref);
  ok &= loadSym(handle, "pa_context_connect", api.pa_context_connect);
  ok &= loadSym(handle, "pa_context_disconnect", api.pa_context_disconnect);
  ok &= loadSym(handle, "pa_context_get_state", api.pa_context_get_state);
  ok &= loadSym(handle, "pa_context_errno", api.pa_context_errno);
  ok &= loadSym(handle, "pa_context_set_state_callback", api.pa_context_set_state_callback);
  ok &= loadSym(handle, "pa_context_set_subscribe_callback", api.pa_context_set_subscribe_callback);
  ok &= loadSym(handle, "pa_context_subscribe", api.pa_context_subscribe);
  ok &= loadSym(handle, "pa_context_get_server_info", api.pa_context_get_server_info);
  ok &= loadSym(handle, "pa_context_get_sink_info_by_name", api.pa_context_get_sink_info_by_name);
  ok &= loadSym(handle, "pa_context_get_sink_info_list", api.pa_context_get_sink_info_list);
  ok &= loadSym(handle, "pa_context_get_sink_input_info_list", api.pa_context_get_sink_input_info_list);

  ok &= loadSym(handle, "pa_stream_new", api.pa_stream_new);
  ok &= loadSym(handle, "pa_stream_unref", api.pa_stream_unref);
  // Optional: checked at runtime to determine app-specific capture capability
  loadSym(handle, "pa_stream_set_monitor_stream", api.pa_stream_set_monitor_stream);
  ok &= loadSym(handle, "pa_stream_connect_record", api.pa_stream_connect_record);
  ok &= loadSym(handle, "pa_stream_disconnect", api.pa_stream_disconnect);
  ok &= loadSym(handle, "pa_stream_get_state", api.pa_stream_get_state);
  ok &= loadSym(handle, "pa_stream_set_state_callback", api.pa_stream_set_state_callback);
  ok &= loadSym(handle, "pa_stream_set_read_callback", api.pa_stream_set_read_callback);
  ok &= loadSym(handle, "pa_stream_peek", api.pa_stream_peek);
  ok &= loadSym(handle, "pa_stream_drop", api.pa_stream_drop);

  ok &= loadSym(handle, "pa_operation_unref", api.pa_operation_unref);
  ok &= loadSym(handle, "pa_proplist_gets", api.pa_proplist_gets);
  ok &= loadSym(handle, "pa_strerror", api.pa_strerror);

  if (!ok) {
    dlclose(handle);
    api = PulseAudioApi{};
    return false;
  }

  api.handle = handle;
  api.loaded = true;
  return true;
#endif
}

void unloadPulseAudioApi(PulseAudioApi& api) {
#if defined(__linux__)
  if (api.handle) {
    dlclose(api.handle);
  }
#endif
  api = PulseAudioApi{};
}

} // namespace pa_abi
} // namespace audio_capture

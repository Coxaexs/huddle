#pragma once

#include <cstdint>

namespace audio_capture {

/**
 * Resolves an X11 Window ID (from Electron desktopCapturer `window:<id>:...`)
 * to its owning process PID via `_NET_WM_PID` using runtime `dlopen("libX11.so.6")`.
 * Returns -1 if X11 is unavailable (e.g. pure Wayland) or `_NET_WM_PID` is unset.
 */
int32_t resolveX11WindowPid(uint64_t windowId);

} // namespace audio_capture

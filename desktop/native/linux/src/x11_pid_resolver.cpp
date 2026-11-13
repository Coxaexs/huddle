#include "x11_pid_resolver.h"

#include <cstdint>
#include <cstdlib>
#include <dlfcn.h>

namespace audio_capture {

int32_t resolveX11WindowPid(uint64_t windowId) {
  if (windowId == 0 || !std::getenv("DISPLAY")) {
    return -1;
  }

  void* x11 = dlopen("libX11.so.6", RTLD_LAZY | RTLD_LOCAL);
  if (!x11) x11 = dlopen("libX11.so", RTLD_LAZY | RTLD_LOCAL);
  if (!x11) return -1;

  using Display = void;
  using Atom = unsigned long;
  using Window = unsigned long;

  auto XOpenDisplay = reinterpret_cast<Display* (*)(const char*)>(dlsym(x11, "XOpenDisplay"));
  auto XCloseDisplay = reinterpret_cast<int (*)(Display*)>(dlsym(x11, "XCloseDisplay"));
  auto XInternAtom = reinterpret_cast<Atom (*)(Display*, const char*, int)>(dlsym(x11, "XInternAtom"));
  auto XGetWindowProperty = reinterpret_cast<int (*)(
      Display*, Window, Atom, long, long, int, Atom, Atom*, int*, unsigned long*, unsigned long*, unsigned char**)>(
      dlsym(x11, "XGetWindowProperty"));
  auto XFree = reinterpret_cast<int (*)(void*)>(dlsym(x11, "XFree"));

  if (!XOpenDisplay || !XCloseDisplay || !XInternAtom || !XGetWindowProperty || !XFree) {
    dlclose(x11);
    return -1;
  }

  Display* dpy = XOpenDisplay(nullptr);
  if (!dpy) {
    dlclose(x11);
    return -1;
  }

  int32_t pid = -1;
  Atom pidAtom = XInternAtom(dpy, "_NET_WM_PID", 1 /* True */);
  if (pidAtom != 0) {
    Atom actualType = 0;
    int actualFormat = 0;
    unsigned long nItems = 0;
    unsigned long bytesAfter = 0;
    unsigned char* prop = nullptr;

    // XA_CARDINAL = 6
    const int status = XGetWindowProperty(
        dpy, static_cast<Window>(windowId), pidAtom, 0, 1, 0 /* False */,
        6 /* XA_CARDINAL */, &actualType, &actualFormat, &nItems, &bytesAfter, &prop);

    if (status == 0 && prop && nItems >= 1 && actualFormat == 32) {
      const uint32_t rawPid = *reinterpret_cast<uint32_t*>(prop);
      if (rawPid > 0) {
        pid = static_cast<int32_t>(rawPid);
      }
    }
    if (prop) {
      XFree(prop);
    }
  }

  XCloseDisplay(dpy);
  dlclose(x11);
  return pid;
}

} // namespace audio_capture

#include "audio_types.h"
#include "backend_manager.h"
#include "x11_pid_resolver.h"

#include <atomic>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <string>
#include <unistd.h>
#include <vector>

using namespace audio_capture;

namespace {

std::string jsonEscape(const std::string& s) {
  std::string out;
  out.reserve(s.size() + 8);
  for (char c : s) {
    switch (c) {
      case '"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default: out += c; break;
    }
  }
  return out;
}

void printProbeJson(const BackendCapabilities& caps, const AudioDevice& dev) {
  std::cout << "{"
            << "\"backend\":\"" << BackendTypeToString(caps.backend) << "\","
            << "\"serverName\":\"" << jsonEscape(caps.serverName) << "\","
            << "\"serverVersion\":\"" << jsonEscape(caps.serverVersion) << "\","
            << "\"isPipeWirePulseCompat\":" << (caps.isPipeWirePulseCompat ? "true" : "false") << ","
            << "\"supportsSystemCapture\":" << (caps.supportsSystemCapture ? "true" : "false") << ","
            << "\"supportsAppCapture\":" << (caps.supportsAppCapture ? "true" : "false") << ","
            << "\"supportsMultiAppCapture\":" << (caps.supportsMultiAppCapture ? "true" : "false") << ","
            << "\"defaultDevice\":{\"id\":\"" << jsonEscape(dev.id) << "\",\"description\":\""
            << jsonEscape(dev.description) << "\",\"numericId\":" << dev.numericId << "},"
            << "\"limitations\":[";
  for (size_t i = 0; i < caps.limitations.size(); ++i) {
    if (i > 0) std::cout << ",";
    std::cout << "\"" << jsonEscape(caps.limitations[i]) << "\"";
  }
  std::cout << "]}\n";
}

void printAppsJson(const std::vector<AudioApplication>& apps) {
  std::cout << "[";
  for (size_t i = 0; i < apps.size(); ++i) {
    if (i > 0) std::cout << ",";
    const auto& a = apps[i];
    std::cout << "{"
              << "\"appId\":\"" << jsonEscape(a.appId) << "\","
              << "\"name\":\"" << jsonEscape(a.name) << "\","
              << "\"binary\":\"" << jsonEscape(a.binary) << "\","
              << "\"pid\":" << a.pid << ","
              << "\"streams\":[";
    for (size_t j = 0; j < a.streams.size(); ++j) {
      if (j > 0) std::cout << ",";
      const auto& s = a.streams[j];
      std::cout << "{"
                << "\"streamId\":\"" << jsonEscape(s.streamId) << "\","
                << "\"backendNodeId\":" << s.backendNodeId << ","
                << "\"objectSerial\":" << s.objectSerial << ","
                << "\"nodeName\":\"" << jsonEscape(s.nodeName) << "\","
                << "\"mediaName\":\"" << jsonEscape(s.mediaName) << "\""
                << "}";
    }
    std::cout << "]}";
  }
  std::cout << "]\n";
}

} // namespace

int main(int argc, char** argv) {
  bool probeOnly = false;
  bool listAppsOnly = false;
  bool systemCapture = false;
  uint64_t windowId = 0;
  std::vector<int32_t> targetPids;
  std::vector<std::string> targetApps;
  std::vector<std::string> targetStreams;
  int32_t selfPid = -1;

  for (int i = 1; i < argc; ++i) {
    const std::string arg(argv[i]);
    if (arg == "--probe") {
      probeOnly = true;
    } else if (arg == "--list-apps") {
      listAppsOnly = true;
    } else if (arg == "--all-except" && i + 1 < argc) {
      systemCapture = true;
      selfPid = std::atoi(argv[++i]);
    } else if (arg == "--window" && i + 1 < argc) {
      windowId = std::strtoull(argv[++i], nullptr, 10);
    } else if (arg == "--pid" && i + 1 < argc) {
      targetPids.push_back(std::atoi(argv[++i]));
    } else if (arg == "--app" && i + 1 < argc) {
      targetApps.emplace_back(argv[++i]);
    } else if (arg == "--stream" && i + 1 < argc) {
      targetStreams.emplace_back(argv[++i]);
    } else if (arg == "--self" && i + 1 < argc) {
      selfPid = std::atoi(argv[++i]);
    }
  }
  (void)selfPid;

  BackendManager manager;
  BackendCallbacks cbs;

  std::atomic<bool> readyEmitted{false};
  cbs.onAudioData = [&](const float* samples, size_t frameCount, uint32_t sr, uint32_t ch) {
    (void)sr;
    if (!samples || frameCount == 0 || ch == 0) return;
    if (!readyEmitted.exchange(true)) {
      std::cerr << "ready\n" << std::flush;
    }
    const size_t bytes = frameCount * ch * sizeof(float);
    const ssize_t written = ::write(STDOUT_FILENO, samples, bytes);
    (void)written;
  };

  cbs.onError = [](const AudioErrorEvent& err) {
    std::cerr << "[hoffle-app-audio-linux] " << err.code << ": " << err.message << "\n" << std::flush;
  };

  const BackendCapabilities caps = manager.initialize(cbs);
  if (probeOnly) {
    printProbeJson(caps, manager.getDefaultDevice());
    manager.dispose();
    return caps.backend == BackendType::None ? 1 : 0;
  }

  if (listAppsOnly) {
    printAppsJson(manager.listApplications());
    manager.dispose();
    return caps.backend == BackendType::None ? 1 : 0;
  }

  if (caps.backend == BackendType::None) {
    std::cerr << "[hoffle-app-audio-linux] No supported audio server (PipeWire or PulseAudio) found.\n";
    manager.dispose();
    return 1;
  }

  CaptureOptions opts;
  opts.format.sampleRate = 48000;
  opts.format.channels = 2;
  opts.format.framesPerChunk = 480;
  opts.softClip = true;
  opts.excludeSelf = true;

  bool started = false;
  if (systemCapture) {
    started = manager.startSystemCapture(opts);
  } else {
    if (!caps.supportsAppCapture) {
      std::cerr << "[hoffle-app-audio-linux] Application-specific capture is not supported by active backend.\n";
      manager.dispose();
      return 2;
    }

    if (windowId != 0) {
      const int32_t winPid = resolveX11WindowPid(windowId);
      if (winPid > 0) {
        targetPids.push_back(winPid);
      } else {
        std::cerr << "[hoffle-app-audio-linux] Could not resolve PID for window " << windowId << ".\n";
        manager.dispose();
        return 3;
      }
    }

    std::vector<AppCaptureTarget> targets;
    for (int32_t pid : targetPids) {
      AppCaptureTarget t;
      t.pid = pid;
      targets.push_back(t);
    }
    for (const auto& appId : targetApps) {
      AppCaptureTarget t;
      t.appId = appId;
      targets.push_back(t);
    }
    for (const auto& streamId : targetStreams) {
      AppCaptureTarget t;
      t.streamId = streamId;
      targets.push_back(t);
    }

    if (targets.empty()) {
      std::cerr << "[hoffle-app-audio-linux] No capture target specified.\n";
      manager.dispose();
      return 1;
    }

    started = manager.startAppCapture(targets, opts);
  }

  if (!started) {
    manager.dispose();
    return 1;
  }

  // Emit ready immediately once capture stream is armed so Electron's 4s handshake succeeds
  // even when the target application is momentarily silent.
  if (!readyEmitted.exchange(true)) {
    std::cerr << "ready\n" << std::flush;
  }

  // Wait for stdin EOF (Electron closes stdin on stopAppAudio())
  char buf[64];
  while (::read(STDIN_FILENO, buf, sizeof(buf)) > 0) {
  }

  manager.dispose();
  return 0;
}

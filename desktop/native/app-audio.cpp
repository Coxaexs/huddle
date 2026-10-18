// hoffle-app-audio: the audio for a screen share, captured per application.
//
// Electron's only system-audio option is a loopback of the whole output
// device, which includes Hoffle's own playback: everyone's voices go back out
// with the share and the room hears itself. Chromium can leave its own process
// out, but behind an audio router (SteelSeries Sonar, Voicemeeter) the voices
// are played again by the router's process, so that fails too.
//
// This captures applications instead of the device, with WASAPI process
// loopback (Windows 10 2004 and later):
//
//   --window <hwnd>       the app that owns the shared window, and its children
//   --all-except <pid>    every app playing sound, except Hoffle (<pid> and its
//                         children), anything that launched it, and audio
//                         routers, whose output is everything else re-played
//
// Output on stdout: interleaved stereo float32 at 48 kHz, in 10 ms chunks.
// "ready" on stderr once capture works; exit code 2 if this Windows cannot do
// process loopback. It exits when stdin closes, so it never outlives Hoffle.

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <initguid.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <audiopolicy.h>
#include <tlhelp32.h>
#include <fcntl.h>
#include <io.h>

#include <algorithm>
#include <atomic>
#include <cstdio>
#include <cstring>
#include <cwchar>
#include <deque>
#include <map>
#include <memory>
#include <mutex>
#include <set>
#include <string>
#include <thread>
#include <vector>

// From audioclientactivationparams.h, which MinGW does not ship.
enum AUDIOCLIENT_ACTIVATION_TYPE {
  AUDIOCLIENT_ACTIVATION_TYPE_DEFAULT = 0,
  AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK = 1,
};
enum PROCESS_LOOPBACK_MODE {
  PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE = 0,
  PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE = 1,
};
struct AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS {
  DWORD TargetProcessId;
  PROCESS_LOOPBACK_MODE ProcessLoopbackMode;
};
struct AUDIOCLIENT_ACTIVATION_PARAMS {
  AUDIOCLIENT_ACTIVATION_TYPE ActivationType;
  AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS ProcessLoopbackParams;
};
static const wchar_t* const kProcessLoopbackDevice = L"VAD\\Process_Loopback";

static const int kRate = 48000;
static const int kChunk = kRate / 100;  // 10 ms
/** A source more than this far ahead is trimmed back, so latency stays put. */
static const size_t kMaxQueued = kRate / 10 * 2;  // 100 ms, stereo samples

static std::mutex g_outMutex;

// ---------------------------------------------------------------------------
// Activation: ActivateAudioInterfaceAsync reports back on a COM thread.

class ActivationHandler : public IActivateAudioInterfaceCompletionHandler, public IAgileObject {
 public:
  ActivationHandler() : done_(CreateEventW(nullptr, TRUE, FALSE, nullptr)) {}
  ~ActivationHandler() { CloseHandle(done_); }

  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** out) override {
    if (riid == __uuidof(IUnknown) || riid == __uuidof(IActivateAudioInterfaceCompletionHandler)) {
      *out = static_cast<IActivateAudioInterfaceCompletionHandler*>(this);
    } else if (riid == __uuidof(IAgileObject)) {
      *out = static_cast<IAgileObject*>(this);
    } else {
      *out = nullptr;
      return E_NOINTERFACE;
    }
    AddRef();
    return S_OK;
  }
  ULONG STDMETHODCALLTYPE AddRef() override { return ++refs_; }
  ULONG STDMETHODCALLTYPE Release() override {
    ULONG left = --refs_;
    if (left == 0) delete this;
    return left;
  }
  HRESULT STDMETHODCALLTYPE ActivateCompleted(IActivateAudioInterfaceAsyncOperation*) override {
    SetEvent(done_);
    return S_OK;
  }

  HANDLE done_;

 private:
  std::atomic<ULONG> refs_{1};
};

/** An IAudioClient capturing `pid` and its children, or null. */
static IAudioClient* ActivateProcessLoopback(DWORD pid, HRESULT* why) {
  AUDIOCLIENT_ACTIVATION_PARAMS params = {};
  params.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
  params.ProcessLoopbackParams.TargetProcessId = pid;
  params.ProcessLoopbackParams.ProcessLoopbackMode = PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE;
  PROPVARIANT prop = {};
  prop.vt = VT_BLOB;
  prop.blob.cbSize = sizeof(params);
  prop.blob.pBlobData = reinterpret_cast<BYTE*>(&params);

  auto* handler = new ActivationHandler();
  IActivateAudioInterfaceAsyncOperation* op = nullptr;
  HRESULT hr = ActivateAudioInterfaceAsync(kProcessLoopbackDevice, __uuidof(IAudioClient), &prop, handler, &op);
  IAudioClient* client = nullptr;
  if (SUCCEEDED(hr)) {
    if (WaitForSingleObject(handler->done_, 5000) != WAIT_OBJECT_0) {
      hr = HRESULT_FROM_WIN32(ERROR_TIMEOUT);
    } else {
      HRESULT result = E_FAIL;
      IUnknown* unknown = nullptr;
      hr = op->GetActivateResult(&result, &unknown);
      if (SUCCEEDED(hr)) hr = result;
      if (SUCCEEDED(hr) && unknown) hr = unknown->QueryInterface(__uuidof(IAudioClient), reinterpret_cast<void**>(&client));
      if (unknown) unknown->Release();
    }
  }
  if (op) op->Release();
  handler->Release();
  if (why) *why = hr;
  return SUCCEEDED(hr) ? client : nullptr;
}

// ---------------------------------------------------------------------------
// One captured application.

class Source {
 public:
  explicit Source(DWORD pid) : pid_(pid) {}
  ~Source() { Stop(); }

  /** Starts capturing; false if this process cannot be captured. */
  bool Start(HRESULT* why) {
    client_ = ActivateProcessLoopback(pid_, why);
    if (!client_) return false;
    // Process loopback has no mix format to ask for; the engine converts to
    // whatever is requested. 16-bit PCM is what Microsoft's own sample uses.
    WAVEFORMATEX format = {};
    format.wFormatTag = WAVE_FORMAT_PCM;
    format.nChannels = 2;
    format.nSamplesPerSec = kRate;
    format.wBitsPerSample = 16;
    format.nBlockAlign = format.nChannels * format.wBitsPerSample / 8;
    format.nAvgBytesPerSec = format.nSamplesPerSec * format.nBlockAlign;
    HRESULT hr = client_->Initialize(
        AUDCLNT_SHAREMODE_SHARED,
        AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,
        200000, 0, &format, nullptr);
    if (SUCCEEDED(hr)) {
      event_ = CreateEventW(nullptr, FALSE, FALSE, nullptr);
      hr = client_->SetEventHandle(event_);
    }
    if (SUCCEEDED(hr)) hr = client_->GetService(__uuidof(IAudioCaptureClient), reinterpret_cast<void**>(&capture_));
    if (SUCCEEDED(hr)) hr = client_->Start();
    if (FAILED(hr)) {
      if (why) *why = hr;
      Stop();
      return false;
    }
    running_ = true;
    thread_ = std::thread([this] { Run(); });
    return true;
  }

  void Stop() {
    running_ = false;
    if (thread_.joinable()) thread_.join();
    if (client_) client_->Stop();
    if (capture_) capture_->Release();
    if (client_) client_->Release();
    if (event_) CloseHandle(event_);
    capture_ = nullptr;
    client_ = nullptr;
    event_ = nullptr;
  }

  /** Adds up to `samples` of this source into `mix`. */
  void MixInto(float* mix, size_t samples) {
    std::lock_guard<std::mutex> lock(mutex_);
    size_t n = std::min(samples, queue_.size());
    for (size_t i = 0; i < n; i++) {
      mix[i] += queue_.front();
      queue_.pop_front();
    }
  }

  DWORD pid() const { return pid_; }

 private:
  void Run() {
    CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    while (running_) {
      WaitForSingleObject(event_, 100);
      UINT32 packet = 0;
      while (running_ && SUCCEEDED(capture_->GetNextPacketSize(&packet)) && packet > 0) {
        BYTE* data = nullptr;
        UINT32 frames = 0;
        DWORD flags = 0;
        if (FAILED(capture_->GetBuffer(&data, &frames, &flags, nullptr, nullptr))) break;
        {
          std::lock_guard<std::mutex> lock(mutex_);
          const int16_t* pcm = reinterpret_cast<const int16_t*>(data);
          bool silent = (flags & AUDCLNT_BUFFERFLAGS_SILENT) != 0;
          for (UINT32 i = 0; i < frames * 2; i++) queue_.push_back(silent ? 0.f : pcm[i] / 32768.f);
          while (queue_.size() > kMaxQueued) queue_.pop_front();
        }
        capture_->ReleaseBuffer(frames);
      }
    }
    CoUninitialize();
  }

  DWORD pid_;
  IAudioClient* client_ = nullptr;
  IAudioCaptureClient* capture_ = nullptr;
  HANDLE event_ = nullptr;
  std::atomic<bool> running_{false};
  std::thread thread_;
  std::mutex mutex_;
  std::deque<float> queue_;
};

// ---------------------------------------------------------------------------
// Which processes to capture.

struct ProcessTable {
  std::map<DWORD, DWORD> parent;
  std::map<DWORD, std::wstring> exe;

  void Load() {
    parent.clear();
    exe.clear();
    HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snap == INVALID_HANDLE_VALUE) return;
    PROCESSENTRY32W entry = {};
    entry.dwSize = sizeof(entry);
    for (BOOL ok = Process32FirstW(snap, &entry); ok; ok = Process32NextW(snap, &entry)) {
      parent[entry.th32ProcessID] = entry.th32ParentProcessID;
      std::wstring name = entry.szExeFile;
      for (auto& c : name) c = towlower(c);
      exe[entry.th32ProcessID] = name;
    }
    CloseHandle(snap);
  }

  /** Whether `pid` is `root` or one of its descendants. */
  bool InTree(DWORD pid, DWORD root) const {
    for (int depth = 0; depth < 64 && pid != 0; depth++) {
      if (pid == root) return true;
      auto it = parent.find(pid);
      if (it == parent.end() || it->second == pid) return false;
      pid = it->second;
    }
    return false;
  }
};

/** Apps whose output is other apps' sound played again: capturing them would bring the voices back. */
static bool IsAudioRouter(const std::wstring& exe) {
  static const wchar_t* const prefixes[] = {
      L"steelseries", L"sonar", L"voicemeeter", L"vbaudio", L"audiorepeater",
      L"nahimic", L"fxsound", L"soundswitch", L"equalizerapo", L"peace",
  };
  for (const wchar_t* prefix : prefixes) {
    if (exe.compare(0, wcslen(prefix), prefix) == 0) return true;
  }
  return false;
}

/** Process ids with an audio session on any output device. */
static std::set<DWORD> SessionProcesses() {
  std::set<DWORD> pids;
  IMMDeviceEnumerator* enumerator = nullptr;
  if (FAILED(CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, __uuidof(IMMDeviceEnumerator),
                              reinterpret_cast<void**>(&enumerator)))) {
    return pids;
  }
  IMMDeviceCollection* devices = nullptr;
  if (SUCCEEDED(enumerator->EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE, &devices))) {
    UINT count = 0;
    devices->GetCount(&count);
    for (UINT d = 0; d < count; d++) {
      IMMDevice* device = nullptr;
      if (FAILED(devices->Item(d, &device))) continue;
      IAudioSessionManager2* manager = nullptr;
      if (SUCCEEDED(device->Activate(__uuidof(IAudioSessionManager2), CLSCTX_ALL, nullptr,
                                     reinterpret_cast<void**>(&manager)))) {
        IAudioSessionEnumerator* sessions = nullptr;
        if (SUCCEEDED(manager->GetSessionEnumerator(&sessions))) {
          int n = 0;
          sessions->GetCount(&n);
          for (int i = 0; i < n; i++) {
            IAudioSessionControl* control = nullptr;
            if (FAILED(sessions->GetSession(i, &control))) continue;
            IAudioSessionControl2* control2 = nullptr;
            if (SUCCEEDED(control->QueryInterface(__uuidof(IAudioSessionControl2), reinterpret_cast<void**>(&control2)))) {
              AudioSessionState state = AudioSessionStateExpired;
              DWORD pid = 0;
              control2->GetState(&state);
              if (control2->IsSystemSoundsSession() != S_OK && state != AudioSessionStateExpired &&
                  SUCCEEDED(control2->GetProcessId(&pid)) && pid != 0) {
                pids.insert(pid);
              }
              control2->Release();
            }
            control->Release();
          }
          sessions->Release();
        }
        manager->Release();
      }
      device->Release();
    }
    devices->Release();
  }
  enumerator->Release();
  return pids;
}

/**
 * What --all-except should capture: each app with a session, minus Hoffle's
 * own tree, its ancestors (capturing those would include Hoffle again, since a
 * capture takes the whole tree), routers, and apps already covered because an
 * ancestor of theirs is captured.
 */
static std::set<DWORD> Targets(DWORD self, const ProcessTable& table) {
  std::set<DWORD> wanted;
  DWORD me = GetCurrentProcessId();
  for (DWORD pid : SessionProcesses()) {
    if (pid == me || table.InTree(pid, self) || table.InTree(self, pid)) continue;
    auto exe = table.exe.find(pid);
    if (exe != table.exe.end() && IsAudioRouter(exe->second)) continue;
    wanted.insert(pid);
  }
  std::set<DWORD> roots;
  for (DWORD pid : wanted) {
    bool covered = false;
    for (DWORD other : wanted) {
      if (other != pid && table.InTree(pid, other)) {
        covered = true;
        break;
      }
    }
    if (!covered) roots.insert(pid);
  }
  return roots;
}

// ---------------------------------------------------------------------------

static void Ready() {
  fputs("ready\n", stderr);
  fflush(stderr);
}

static void WatchStdin() {
  std::thread([] {
    char buf[256];
    DWORD got = 0;
    HANDLE in = GetStdHandle(STD_INPUT_HANDLE);
    while (ReadFile(in, buf, sizeof(buf), &got, nullptr) && got > 0) {
    }
    ExitProcess(0);
  }).detach();
}

int wmain(int argc, wchar_t** argv) {
  _setmode(_fileno(stdout), _O_BINARY);
  CoInitializeEx(nullptr, COINIT_MULTITHREADED);

  DWORD windowPid = 0;
  DWORD self = 0;
  bool all = false;
  for (int i = 1; i + 1 < argc; i++) {
    if (wcscmp(argv[i], L"--window") == 0) {
      HWND hwnd = reinterpret_cast<HWND>(static_cast<uintptr_t>(_wcstoui64(argv[i + 1], nullptr, 10)));
      GetWindowThreadProcessId(hwnd, &windowPid);
    } else if (wcscmp(argv[i], L"--all-except") == 0) {
      all = true;
      self = static_cast<DWORD>(wcstoul(argv[i + 1], nullptr, 10));
    } else if (wcscmp(argv[i], L"--self") == 0) {
      self = static_cast<DWORD>(wcstoul(argv[i + 1], nullptr, 10));
    }
  }
  if (!all && !windowPid) {
    fputs("usage: hoffle-app-audio --window <hwnd> [--self <pid>] | --all-except <pid>\n", stderr);
    return 1;
  }

  // Can this Windows do process loopback at all? Try it on ourselves.
  {
    HRESULT why = S_OK;
    IAudioClient* probe = ActivateProcessLoopback(GetCurrentProcessId(), &why);
    if (!probe) {
      fprintf(stderr, "unsupported 0x%08lx\n", static_cast<unsigned long>(why));
      return 2;
    }
    probe->Release();
  }

  ProcessTable table;
  std::map<DWORD, std::unique_ptr<Source>> sources;
  std::mutex sourcesMutex;
  auto refresh = [&] {
    table.Load();
    std::set<DWORD> targets;
    if (all) {
      targets = Targets(self, table);
    } else if (!self || !table.InTree(windowPid, self)) {
      // Sharing Hoffle's own window captures nothing, rather than the room.
      targets.insert(windowPid);
    }
    std::lock_guard<std::mutex> lock(sourcesMutex);
    for (auto it = sources.begin(); it != sources.end();) {
      it = targets.count(it->first) ? std::next(it) : sources.erase(it);
    }
    for (DWORD pid : targets) {
      if (sources.count(pid)) continue;
      auto source = std::make_unique<Source>(pid);
      if (source->Start(nullptr)) sources[pid] = std::move(source);
    }
  };
  refresh();
  WatchStdin();
  Ready();

  // Apps start and stop playing; look again every couple of seconds.
  std::thread([&] {
    CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    for (;;) {
      Sleep(2000);
      refresh();
    }
  }).detach();

  // Mix and write a chunk every 10 ms, on the performance counter's clock.
  LARGE_INTEGER freq, start, now;
  QueryPerformanceFrequency(&freq);
  QueryPerformanceCounter(&start);
  std::vector<float> mix(kChunk * 2);
  for (long long written = 0;; written++) {
    long long due = start.QuadPart + (written * freq.QuadPart) / 100;
    for (;;) {
      QueryPerformanceCounter(&now);
      if (now.QuadPart >= due) break;
      Sleep(static_cast<DWORD>(std::max<long long>(1, (due - now.QuadPart) * 1000 / freq.QuadPart)));
    }
    std::fill(mix.begin(), mix.end(), 0.f);
    {
      std::lock_guard<std::mutex> lock(sourcesMutex);
      for (auto& entry : sources) entry.second->MixInto(mix.data(), mix.size());
    }
    for (float& v : mix) v = std::max(-1.f, std::min(1.f, v));
    if (fwrite(mix.data(), sizeof(float), mix.size(), stdout) != mix.size()) return 0;
    fflush(stdout);
  }
}

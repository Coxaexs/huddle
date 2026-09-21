# Huddle Native Client (C++20 / Qt 6)

High-performance, ultra-low-latency native desktop client for Huddle built with **C++20**, **Qt 6**, and designed for the **LiveKit C++ SDK**.

## Features
- **Zero browser overhead:** Direct native rendering with Qt 6 Widgets and hardware acceleration.
- **Minimal memory footprint:** ~20–35 MB idle RAM (vs 250MB+ in Electron).
- **Sub-15ms Voice Pipeline:** Direct platform audio bindings (CoreAudio on macOS, WASAPI on Windows, PipeWire/ALSA on Linux).
- **Native System Tray:** Window minimize-to-tray and background operation.

## Architecture

```
native-qt/
├── CMakeLists.txt         # Modern CMake 3.25+ configuration
├── src/
│   ├── main.cpp           # Application entrypoint & CLI argument parsing
│   ├── ui/
│   │   ├── mainwindow.h   # Desktop window layout, dark theme, chat & voice grid
│   │   └── mainwindow.cpp
│   ├── voice/
│   │   ├── voice_engine.h # Voice state machine, VU meter, push-to-talk, LiveKit SDK hooks
│   │   └── voice_engine.cpp
│   └── network/
│       ├── api_client.h   # REST API & WebSocket Realtime Gateway client
│       └── api_client.cpp
```

## Build Instructions

### 1. Prerequisites

#### macOS
```bash
brew install cmake qt6 ninja
```

#### Ubuntu / Debian
```bash
sudo apt update
sudo apt install build-essential cmake ninja-build qt6-base-dev qt6-websockets-dev qt6-multimedia-dev
```

#### Windows
Install via [vcpkg](https://vcpkg.io/):
```powershell
vcpkg install qtbase:x64-windows qtwebsockets:x64-windows
```

### 2. Configure and Build

```bash
cd native-qt
mkdir build && cd build

# Configure with CMake
cmake -G Ninja -DCMAKE_BUILD_TYPE=Release ..

# Build
cmake --build .
```

### 3. Run

```bash
./hoffle-native --server https://deeppixel.online
```

### 4. Optional LiveKit C++ SDK Integration

To link the native LiveKit C++ SDK for native WebRTC audio pipelines:
```bash
cmake -G Ninja -DENABLE_LIVEKIT=ON ..
cmake --build .
```
See [LiveKit C++ Client SDK](https://github.com/livekit/client-sdk-cpp) for precompiled static/shared library distributions.

# Hoffle Audio Architecture & Voice Protocol Guide

This guide documents how real-time voice works across popular voice platforms (TeamSpeak, Discord, Mumble, WebRTC), why browser-based voice differs from native apps, and how Hoffle supports multiple audio alternatives so self-hosters and users can choose the best engine for their needs.

---

## 1. How the Platforms Actually Work Under the Hood

| Platform | Transport Protocol | Audio Codec | Architecture | Network Characteristics |
| :--- | :--- | :--- | :--- | :--- |
| **TeamSpeak (TS3/TS5)** | Custom Binary UDP | Opus (historical: Speex/CELT) | Centralized Server Relay | Ultra-low overhead, minimal buffering, raw OS sockets |
| **Discord** | WebSockets (Signaling) + WebRTC UDP/SRTP | Opus (48kHz, mono/stereo) | Centralized SFU (Elixir/C++) | Central server routes voice packets; scales to 100+ per channel |
| **Mumble** | TCP (TLS control) + UDP (OCB-AES128 voice) | Opus | Centralized Server Relay | Encrypted, lightweight, positional/spatial audio support |
| **Hoffle (Current)** | WebSockets (Hub DO) + WebRTC Mesh | Opus (via browser RTCPeerConnection) | Decentralized P2P Mesh | Zero extra server cost, but bandwidth scales as $O(N^2)$ |
| **Hoffle (Pluggable SFU)** | WebSockets + LiveKit/mediasoup SFU | Opus (Dynamic bitrates 16-128kbps) | Centralized SFU | Discord-level scalability, $O(N)$ upload, handles 50+ users |

---

## 2. In-Depth Comparison: TeamSpeak vs Discord vs WebRTC

### What makes TeamSpeak feel so fast?
TeamSpeak is a native compiled C++ application. It has direct access to the operating system's networking stack and sound hardware:
1. **Raw UDP Datagrams**: TeamSpeak does not negotiate SDPs (Session Description Protocol), ICE candidates, or complex DTLS handshakes like WebRTC. A client simply authenticates over a command socket and streams Opus audio frames packed into lightweight binary UDP packets directly to the TeamSpeak server port (e.g., `9987/UDP`).
2. **Minimal Packet Header**: Each voice packet has just a few bytes of header (packet ID, client ID, codec flag) followed by the encoded Opus payload.
3. **No Browser Sandbox**: Browsers impose strict audio buffering, security policies, and process isolation. TeamSpeak captures audio directly via WASAPI / CoreAudio / ALSA and sends it with near-zero latency.

### How Discord works (and why it uses WebRTC)
Contrary to common belief, **Discord actually uses WebRTC**! 
* Discord does not use browser-to-browser P2P mesh.
* Instead, Discord built a distributed **SFU (Selective Forwarding Unit)**. When you connect to a Discord voice channel:
  1. Your client sends **one** outgoing audio stream to Discord's voice server over UDP.
  2. The voice server does **not** decode or re-encode your voice (which would be CPU-heavy MCU style). Instead, it inspects the RTP header and immediately forwards your audio packets to every other person sitting in that channel.
  3. You receive incoming streams from the other members in the room.
* This is why Discord works seamlessly in both desktop apps (Electron) and standard web browsers (Chrome, Firefox, Safari).

### Why Web Browsers Cannot Use TeamSpeak's Protocol Directly
Standard web browsers prohibit arbitrary raw UDP socket access (`dgram`) via JavaScript to prevent web pages from being used as botnets or scanning local network devices. In a web browser, low-latency UDP communications are restricted to:
1. **WebRTC (`RTCPeerConnection`)**: Encrypted SRTP over UDP with ICE/STUN/TURN NAT traversal.
2. **WebTransport (`WebTransport` / HTTP/3 over QUIC)**: Exposes bi-directional streams and unreliable UDP datagrams. When combined with `WebCodecs` (AudioEncoder/AudioDecoder), it allows building custom UDP voice pipelines in web browsers without WebRTC's SDP negotiation overhead.

---

## 3. P2P Mesh vs SFU in Hoffle

```
P2P MESH (Current Huddle/Hoffle):          SFU ARCHITECTURE (Discord-style):
Every user uploads to every other user.     Every user uploads ONLY ONCE to server.

      [User A]                                   [User A]
      /   |   \                                      ▲
     /    |    \                                     │ (1 Upload)
[User B]--+--[User C]                                ▼
     \    |    /                              ┌─────────────┐
      \   |   /                               │ Hoffle SFU  │
      [User D]                                └─────────────┘
                                                ▲    ▲    ▲
- 4 users = 12 peer streams                     │    │    │ (1 Upload, 3 Downloads)
- 8 users = 56 peer streams                    [B]  [C]  [D]
- Upload bandwidth: O(N - 1)                  - Upload bandwidth: O(1)
```

### When to use P2P Mesh (Legacy Mode):
* 2 to 4 people hanging out.
* Zero external infrastructure: Runs entirely on your existing lightweight Cloudflare Worker or Node host without needing an extra media server daemon.

### When to use Centralized SFU (LiveKit / mediasoup):
* 5+ people in a voice room.
* High-resolution screen sharing (1080p60 fps).
* Users on asymmetric connections (e.g. slow upload speeds / mobile data).

---

## 4. The Multi-Engine Pluggable Voice Provider Architecture

Hoffle is designed so users and server admins do not have to choose just one technology forever. The client hook `app/hooks/use-voice.ts` can be wired to a unified interface:

```typescript
export interface VoiceEngine {
  readonly id: "webrtc-mesh" | "livekit-sfu" | "webtransport";
  readonly name: string;
  joinRoom(channelId: string, options: VoiceOptions): Promise<void>;
  leaveRoom(): Promise<void>;
  setMuted(muted: boolean): void;
  setDeafened(deafened: boolean): void;
  publishScreenShare(stream: MediaStream): Promise<void>;
  stopScreenShare(): Promise<void>;
}
```

### How to Select Voice Engine in Hoffle:
1. **Server Default**: A server owner can set the default engine in **Server Settings → Voice & Video**:
   * **P2P Mesh**: Decentralized, no central media relay.
   * **SFU (Server-Forwarded)**: Recommended for servers with more than 4 concurrent talkers.
2. **User Bitrate Control**:
   * **Low Bandwidth (TeamSpeak mode)**: 16–32 kbps Opus (crisp speech, minimal bandwidth).
   * **Standard Voice (Discord default)**: 64 kbps Opus.
   * **High-Fidelity / Music**: 128–320 kbps Opus (for jam sessions and music bots).

---

## 5. Summary & Next Steps for Native Desktop

For the desktop client (`desktop/` Electron app), Hoffle has full Node.js API access, allowing:
* Global push-to-talk hotkeys even when the window is in the background or playing full-screen games.
* Optional native C++/Rust UDP voice client for users wanting the exact low-overhead experience of TeamSpeak with zero browser mediation.

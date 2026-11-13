# Hoffle GPUI (native Hoffle Lite, experimental)

A Hoffle desktop client drawn natively with [GPUI](https://crates.io/crates/gpui) (Zed's GPU UI
framework) instead of a web view, with voice through the [LiveKit Rust SDK](https://crates.io/crates/livekit).
Every other desktop build (`desktop/`, `desktop-tauri/`, `desktop-native-*`) wraps the web app;
this one talks to the same API and hub socket directly.

**Status: working prototype, not a replacement for Lite yet.** It signs in, reads and sends
messages live, and joins voice rooms, all tested against production. Most of the web app's
features are not here; see "What is missing" below.

## Why it is worth doing: voice

Hoffle Lite (Tauri on WKWebView) sends call audio through Apple's VoiceProcessingIO unit as soon as
echo cancellation is on, which plays the whole room, music bot included, through a 24 kHz
phone-call engine (see the voice-lab notes). Here audio goes through libwebrtc's own device module
(`livekit::PlatformAudio`): CoreAudio's plain HAL unit with WebRTC's software echo canceller, noise
suppression and gain control, the path Chrome and Hoffle.app (Electron) take. It also allows things
a page can't do: real global push-to-talk, per-device selection, and no WebKit constraint gaps
(WebKit ignores `noiseSuppression`/`autoGainControl`).

## What works (tested live, 2026-11-13)

| Area | State |
| --- | --- |
| Sign in | Username + password, two-factor codes, session kept in `~/Library/Application Support/Hoffle Lite/session.json` (0600). Passkeys and sign-up open the web app. |
| Servers and channels | Server rail, categories, text/voice/forum/announcement channels, unread dots, structure changes reloaded live. |
| Messages | History with paging on scroll-up, live new/edited/deleted messages and reactions, author grouping, bot badges, slash-command lines, replies, thread counts, attachments as links. |
| Markdown | Bold, italic, underline, strike, inline code, code blocks, quotes, headings, bullets, links (clickable), `@mentions` (highlighted when they name you), spoilers (click to reveal). Unit-tested in `src/markdown.rs`. |
| Composer | Sends with Enter, typing indicator both ways, IME and emoji palette. |
| Hub socket | `/api/realtime` with the session cookie, resume tickets, 25 s pings, dead-socket detection, back-off reconnect. |
| Voice | Join/leave, mute, deafen, who is in each room, speaking ring. The hub seat is taken with `sfu: true` and the LiveKit identity is `userId\|connectionId`, so web clients trust and play it. Mic is published like the web (`app/lib/sfu-voice.ts`): no DTX, RED up to 192 kbps, the room's bitrate (320k tier for rooms of 10 or fewer). Leaves LiveKit cleanly on quit. |

Measured: LiveKit showed the native seat publishing `audio/red` from the microphone source, active
speaker events arrived, and the room emptied immediately after Cmd-Q.

## What is missing (before it could replace Lite)

Roughly in order of how much it matters to people using Lite today:

1. **Pictures**: avatars, server icons and image attachments (needs a gpui `HttpClient`; `Client::fetch_bytes` is there for it).
2. **DMs and group DMs**, friends list, the DM call ring.
3. **Multi-line composer**, replies, editing/deleting own messages, reactions picker, uploads, emoji/sticker picker, slash-command autocomplete.
4. **Notifications** (UNUserNotificationCenter), dock badge, tray/menu-bar item, global mute and push-to-talk hotkeys, self-update.
5. **Voice extras**: device pickers, input/output volume, per-person volume, Krisp-free noise options (the web's RNNoise chain), screen share and cameras (watching and sending), soundboard, stage/hand-raise, whispers, the peer-to-peer mesh fallback for clients without LiveKit.
6. **Everything the web app renders that is its own product**: music player and DJ booth, watch party, living room / club 3D scenes, battlemap, dice, games, polls, forums, PDF viewer, themes and retro skins, settings. The sensible plan is to keep those in the web app (or a web view opened for just that panel) and keep native for chat and calls.

The web client is about 240k lines of TypeScript; full parity is many months. A native chat + voice
client that hands the rest to the browser is a few weeks more.

## Build and run (macOS)

```sh
cargo build                    # debug; first build compiles libwebrtc bindings (~12 min)
cargo run                      # opens the sign-in window
scripts/bundle-macos.sh        # release "Hoffle GPUI.app" (ad-hoc signed, has the mic prompt text)
```

Shaders are compiled at launch (`runtime_shaders`) because Xcode 26 ships the Metal compiler as a
separate download (`xcodebuild -downloadComponent MetalToolchain`); with it installed the feature
can go. `build.rs` links with `-ObjC`, without which libwebrtc's Objective-C categories are dropped
and the first call (H.264 codec setup) throws.

Development switches:

- `HOFFLE_URL` points at another Hoffle (default `https://chat.hoffle.online/hangout`).
- `HOFFLE_SESSION=<cookie value>` signs in with an existing session.
- `HOFFLE_DEBUG=1` traces session, hub and voice events on stderr.
- `HOFFLE_DEV_JOIN=<room name or id>` joins that voice room once the hub is ready;
  `HOFFLE_DEV_QUIT_AFTER=<seconds>` then quits the way Cmd-Q does.

Screenshots without Screen Recording permission: apply `tools/gpui-snapshot.patch` to a local copy
of gpui 0.2.2 and point Cargo at it in an untracked `.cargo/config.toml`
(`[patch.crates-io] gpui = { path = "…" }`), then `tools/shot.sh out.png 5`.

## Layout

| File | What it does |
| --- | --- |
| `src/main.rs` | App, window, menus, switching between sign-in and the shell |
| `src/api.rs` | HTTP API (ureq, blocking, run on gpui's background executor) and the saved session |
| `src/realtime.rs` | Hub socket thread (tungstenite) |
| `src/shell.rs` | Signed-in window: rail, channels, voice rosters, conversation, composer, call panel |
| `src/voice.rs` | LiveKit room on its own tokio runtime, driven by commands |
| `src/markdown.rs`, `src/rich.rs` | Message Markdown parsing and drawing |
| `src/input.rs` | Single-line text field (from gpui's example, plus password mode and scrolling) |
| `src/model.rs`, `src/theme.rs` | Wire types and the Cozy theme colours |

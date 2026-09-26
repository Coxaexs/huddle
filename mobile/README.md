# Huddle for Android and iOS

A [Capacitor](https://capacitorjs.com) shell around `https://chat.hoffle.online`.
The app loads the live site, so every web deploy reaches phones immediately. Only
changes under `mobile/` need a new app build.

What the native side adds on top of the website:

| | Android | iOS |
|---|---|---|
| Voice keeps running when you switch apps | Foreground service | `audio` background mode |
| Call controls outside the app | "In voice" notification: Mute / Deafen / Disconnect (lock screen too) | CallKit: status bar / Dynamic Island, mute + hang up from the lock screen |
| Floating bubble over other apps | Yes: tap for Mute / Deafen / Open / Leave, drag to move | Not allowed by iOS |

The bridge is `HuddleVoice` (Android: `android/app/src/main/java/online/hoffle/huddle/`,
iOS: `ios/App/App/HuddleVoice.swift`), driven by `app/lib/native-voice.ts` in the
web app.

## Building

GitHub Actions builds both apps (`.github/workflows/mobile.yml`) on pushes that
touch `mobile/`, or from the Actions tab → **Mobile apps** → **Run workflow**. The
files are in the run's **Artifacts**:

- `huddle-android`: `app-release.aab` (upload to Play Console), `app-release.apk`
  (install directly), `app-debug.apk`
- `huddle-ios`: `Huddle.ipa` (unsigned, for sideloading)

### Android signing (one time)

Play needs every update signed with the same key. Make one and **back it up**;
losing it means you can't update the app:

```bash
keytool -genkeypair -v -keystore huddle-release.jks -alias huddle -keyalg RSA -keysize 2048 -validity 10000
```

Then in GitHub → Settings → Secrets and variables → Actions, add:

- `ANDROID_KEYSTORE_BASE64`: output of `base64 -w0 huddle-release.jks`
- `ANDROID_KEYSTORE_PASSWORD`: the keystore password
- `ANDROID_KEY_ALIAS`: `huddle`
- `ANDROID_KEY_PASSWORD`: the key password (same as the keystore one unless you chose otherwise)

In Play Console, create the app with package name `online.hoffle.huddle`, and
upload the `.aab` to the Internal testing track first.

### iOS sideloading

Install `Huddle.ipa` with [AltStore](https://altstore.io) or
[Sideloadly](https://sideloadly.io). They sign it with your Apple ID. With a free
Apple ID the app expires after 7 days and has to be refreshed (AltStore does this
automatically).

## Local development

```bash
npm install
npx cap sync
npx cap open android   # needs Android Studio
npx cap open ios       # needs a Mac with Xcode
```

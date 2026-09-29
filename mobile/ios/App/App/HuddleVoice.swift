import AVFoundation
import CallKit
import Capacitor
import UIKit

/// The app's root view controller: Capacitor's bridge plus our voice plugin.
class HuddleBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(HuddleVoicePlugin())
    }
}

/// Bridge between the Huddle web app and iOS's call UI.
///
/// iOS doesn't allow bubbles over other apps, so voice shows up the way a
/// phone call does instead: CallKit puts "Huddle" in the status bar / Dynamic
/// Island and lets you mute or hang up from the lock screen. Taps there come
/// back to the web app as "action" events (mute, disconnect), the same events
/// the Android bubble sends.
@objc(HuddleVoicePlugin)
public class HuddleVoicePlugin: CAPPlugin, CAPBridgedPlugin, CXProviderDelegate {
    public let identifier = "HuddleVoicePlugin"
    public let jsName = "HuddleVoice"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "canDrawOverlays", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestOverlayPermission", returnType: CAPPluginReturnPromise),
    ]

    /// Flip to false if CallKit ever fights WebRTC for the audio session; voice
    /// then still runs in the background via the "audio" background mode.
    private let useCallKit = true

    private var provider: CXProvider?
    private let callController = CXCallController()
    private var callId: UUID?
    private var muted = false
    private var endingFromWeb = false

    private func emit(_ action: String) {
        notifyListeners("action", data: ["action": action], retainUntilConsumed: true)
    }

    private func makeProvider() -> CXProvider {
        if let provider = provider { return provider }
        let config = CXProviderConfiguration()
        config.supportsVideo = false
        config.maximumCallsPerCallGroup = 1
        config.maximumCallGroups = 1
        config.supportedHandleTypes = [.generic]
        config.includesCallsInRecents = false
        let created = CXProvider(configuration: config)
        created.setDelegate(self, queue: nil)
        provider = created
        return created
    }

    @objc func start(_ call: CAPPluginCall) {
        let name = call.getString("channelName") ?? "Voice"
        muted = call.getBool("muted") ?? false
        try? AVAudioSession.sharedInstance().setCategory(
            .playAndRecord, mode: .voiceChat, options: [.allowBluetoothHFP, .defaultToSpeaker])
        guard useCallKit else {
            call.resolve()
            return
        }
        DispatchQueue.main.async {
            let provider = self.makeProvider()
            if let existing = self.callId {
                let update = CXCallUpdate()
                update.remoteHandle = CXHandle(type: .generic, value: name)
                provider.reportCall(with: existing, updated: update)
                call.resolve()
                return
            }
            let id = UUID()
            self.callId = id
            let start = CXStartCallAction(call: id, handle: CXHandle(type: .generic, value: name))
            self.callController.request(CXTransaction(action: start)) { error in
                if error != nil {
                    self.callId = nil
                } else {
                    provider.reportOutgoingCall(with: id, startedConnectingAt: nil)
                    provider.reportOutgoingCall(with: id, connectedAt: nil)
                    self.syncMuted()
                }
                call.resolve()
            }
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        muted = call.getBool("muted") ?? muted
        DispatchQueue.main.async { self.syncMuted() }
        call.resolve()
    }

    /// Mirrors the web app's mute into the system call UI. The delegate sees
    /// the state already matches and doesn't echo it back as a toggle.
    private func syncMuted() {
        guard let id = callId else { return }
        callController.request(CXTransaction(action: CXSetMutedCallAction(call: id, muted: muted))) { _ in }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let id = self.callId else {
                call.resolve()
                return
            }
            self.endingFromWeb = true
            self.callController.request(CXTransaction(action: CXEndCallAction(call: id))) { _ in
                self.callId = nil
                call.resolve()
            }
        }
    }

    /// No such thing on iOS; answered so the web app can call it anywhere.
    @objc func canDrawOverlays(_ call: CAPPluginCall) {
        call.resolve(["granted": false])
    }

    @objc func requestOverlayPermission(_ call: CAPPluginCall) {
        call.resolve()
    }

    // MARK: CXProviderDelegate

    public func providerDidReset(_ provider: CXProvider) {
        callId = nil
    }

    public func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        action.fulfill()
    }

    public func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        if action.isMuted != muted {
            // Muted from the lock screen / call UI: the web app toggles.
            muted = action.isMuted
            emit("mute")
        }
        action.fulfill()
    }

    public func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        if !endingFromWeb {
            emit("disconnect")
        }
        endingFromWeb = false
        callId = nil
        action.fulfill()
    }
}

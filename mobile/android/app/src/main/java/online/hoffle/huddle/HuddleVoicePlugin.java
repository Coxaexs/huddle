package online.hoffle.huddle;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridge between the Huddle web app and Android's call furniture.
 *
 * The web app calls start/update/stop as you join, mute and leave voice. We
 * keep a foreground service alive (so the mic survives backgrounding) and,
 * when you switch to another app, float a bubble over it. Taps on either come
 * back to the web app as "action" events: mute, deafen, disconnect.
 */
@CapacitorPlugin(name = "HuddleVoice")
public class HuddleVoicePlugin extends Plugin {
    private static HuddleVoicePlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    /** Called by the service and the bubble when a button is pressed. */
    static void emitAction(String action) {
        HuddleVoicePlugin plugin = instance;
        if (plugin == null) return;
        JSObject data = new JSObject();
        data.put("action", action);
        plugin.notifyListeners("action", data, true);
    }

    private void readState(PluginCall call) {
        VoiceState.channelName = call.getString("channelName", VoiceState.channelName);
        VoiceState.muted = Boolean.TRUE.equals(call.getBoolean("muted", VoiceState.muted));
        VoiceState.deafened = Boolean.TRUE.equals(call.getBoolean("deafened", VoiceState.deafened));
    }

    @PluginMethod
    public void start(PluginCall call) {
        readState(call);
        VoiceState.inVoice = true;
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(getActivity(), new String[] {Manifest.permission.POST_NOTIFICATIONS}, 4101);
        }
        VoiceCallService.refresh(getContext());
        call.resolve();
    }

    @PluginMethod
    public void update(PluginCall call) {
        readState(call);
        if (VoiceState.inVoice) {
            VoiceCallService.refresh(getContext());
            BubbleService.refresh(getContext());
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        VoiceState.inVoice = false;
        BubbleService.hide(getContext());
        VoiceCallService.stop(getContext());
        call.resolve();
    }

    @PluginMethod
    public void canDrawOverlays(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", Settings.canDrawOverlays(getContext()));
        call.resolve(result);
    }

    /** Opens Android's "Display over other apps" page for Huddle. */
    @PluginMethod
    public void requestOverlayPermission(PluginCall call) {
        if (!Settings.canDrawOverlays(getContext())) {
            Intent intent = new Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        // You left Huddle while in voice: float the bubble over the other app.
        if (VoiceState.inVoice && Settings.canDrawOverlays(getContext())) {
            BubbleService.show(getContext());
        }
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        BubbleService.hide(getContext());
    }

    @Override
    protected void handleOnDestroy() {
        BubbleService.hide(getContext());
        VoiceCallService.stop(getContext());
        VoiceState.inVoice = false;
        if (instance == this) instance = null;
        super.handleOnDestroy();
    }
}

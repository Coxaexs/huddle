package online.hoffle.huddle;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

/**
 * Keeps Huddle alive while you're in voice, like a phone call: an ongoing
 * "In voice" notification with Mute, Deafen and Disconnect buttons that also
 * work from the lock screen.
 */
public class VoiceCallService extends Service {
    static final String ACTION_REFRESH = "online.hoffle.huddle.REFRESH";
    static final String ACTION_MUTE = "online.hoffle.huddle.MUTE";
    static final String ACTION_DEAFEN = "online.hoffle.huddle.DEAFEN";
    static final String ACTION_DISCONNECT = "online.hoffle.huddle.DISCONNECT";
    private static final String CHANNEL_ID = "huddle-voice";
    private static final int NOTIFICATION_ID = 4100;

    static void refresh(Context context) {
        Intent intent = new Intent(context, VoiceCallService.class).setAction(ACTION_REFRESH);
        try {
            ContextCompat.startForegroundService(context, intent);
        } catch (RuntimeException ignored) {
            // Android refused to start it (e.g. from the background); the call
            // still works while Huddle is open.
        }
    }

    static void stop(Context context) {
        context.stopService(new Intent(context, VoiceCallService.class));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_MUTE.equals(action)) {
            HuddleVoicePlugin.emitAction("mute");
        } else if (ACTION_DEAFEN.equals(action)) {
            HuddleVoicePlugin.emitAction("deafen");
        } else if (ACTION_DISCONNECT.equals(action)) {
            HuddleVoicePlugin.emitAction("disconnect");
        }

        if (!VoiceState.inVoice) {
            stopSelf();
            return START_NOT_STICKY;
        }

        Notification notification = build();
        try {
            int type = Build.VERSION.SDK_INT >= 30 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE : 0;
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type);
        } catch (RuntimeException e) {
            // No mic permission yet: fall back to a plain notification.
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.notify(NOTIFICATION_ID, notification);
        }
        return START_NOT_STICKY;
    }

    private PendingIntent actionIntent(String action, int requestCode) {
        Intent intent = new Intent(this, VoiceCallService.class).setAction(action);
        return PendingIntent.getService(
                this, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private Notification build() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26 && manager != null && manager.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel channel =
                    new NotificationChannel(CHANNEL_ID, "Voice calls", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Shown while you're connected to a voice channel");
            channel.setShowBadge(false);
            manager.createNotificationChannel(channel);
        }

        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openIntent = PendingIntent.getActivity(
                this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        String state = VoiceState.deafened ? "Deafened" : VoiceState.muted ? "Muted" : "Connected";
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_voice)
                .setContentTitle("In voice: " + VoiceState.channelName)
                .setContentText(state + " · tap to return to Huddle")
                .setContentIntent(openIntent)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .addAction(0, VoiceState.muted ? "Unmute" : "Mute", actionIntent(ACTION_MUTE, 1))
                .addAction(0, VoiceState.deafened ? "Undeafen" : "Deafen", actionIntent(ACTION_DEAFEN, 2))
                .addAction(0, "Disconnect", actionIntent(ACTION_DISCONNECT, 3))
                .setStyle(new androidx.media.app.NotificationCompat.MediaStyle().setShowActionsInCompactView(0, 1, 2))
                .build();
    }

    @Override
    public void onDestroy() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.cancel(NOTIFICATION_ID);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}

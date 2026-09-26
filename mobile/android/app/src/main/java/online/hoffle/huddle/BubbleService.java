package online.hoffle.huddle;

import android.annotation.SuppressLint;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.IBinder;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * The little Huddle dot that floats over other apps while you're in voice.
 * Drag it anywhere (it snaps to the nearest edge); tap it for Mute, Deafen,
 * Open and Leave. A red ring means you're muted.
 */
public class BubbleService extends Service {
    private static final String ACTION_SHOW = "online.hoffle.huddle.BUBBLE_SHOW";
    private static final String ACTION_REFRESH = "online.hoffle.huddle.BUBBLE_REFRESH";
    private static boolean showing = false;
    private static int lastX = -1;
    private static int lastY = 300;

    private WindowManager windowManager;
    private LinearLayout root;
    private FrameLayout bubble;
    private LinearLayout panel;
    private TextView muteButton;
    private TextView deafenButton;
    private WindowManager.LayoutParams params;

    static void show(Context context) {
        if (!Settings.canDrawOverlays(context)) return;
        context.startService(new Intent(context, BubbleService.class).setAction(ACTION_SHOW));
    }

    static void refresh(Context context) {
        if (!showing) return;
        context.startService(new Intent(context, BubbleService.class).setAction(ACTION_REFRESH));
    }

    static void hide(Context context) {
        if (!showing) return;
        context.stopService(new Intent(context, BubbleService.class));
    }

    private int dp(float value) {
        return Math.round(TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics()));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!VoiceState.inVoice || !Settings.canDrawOverlays(this)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (root == null) create();
        render();
        return START_NOT_STICKY;
    }

    @SuppressLint("ClickableViewAccessibility")
    private void create() {
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        int type = Build.VERSION.SDK_INT >= 26
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
        params = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT);
        params.gravity = Gravity.TOP | Gravity.START;
        int screenWidth = getResources().getDisplayMetrics().widthPixels;
        params.x = lastX >= 0 ? lastX : screenWidth - dp(72);
        params.y = lastY;

        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);

        // The dot: the app icon in a ring that turns red when muted.
        bubble = new FrameLayout(this);
        ImageView icon = new ImageView(this);
        icon.setImageResource(R.mipmap.ic_launcher_round);
        FrameLayout.LayoutParams iconParams = new FrameLayout.LayoutParams(dp(50), dp(50), Gravity.CENTER);
        bubble.addView(icon, iconParams);
        root.addView(bubble, new LinearLayout.LayoutParams(dp(58), dp(58)));
        if (Build.VERSION.SDK_INT >= 21) bubble.setElevation(dp(6));

        // The panel that opens under it.
        panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(6), dp(6), dp(6), dp(6));
        GradientDrawable panelBg = new GradientDrawable();
        panelBg.setColor(Color.parseColor("#F21E1A2E"));
        panelBg.setCornerRadius(dp(16));
        panel.setBackground(panelBg);
        if (Build.VERSION.SDK_INT >= 21) panel.setElevation(dp(8));
        muteButton = addButton("Mute", "mute");
        deafenButton = addButton("Deafen", "deafen");
        addButton("Open Huddle", "open");
        TextView leave = addButton("Leave call", "disconnect");
        ((GradientDrawable) leave.getBackground()).setColor(Color.parseColor("#E5484D"));
        panel.setVisibility(View.GONE);
        LinearLayout.LayoutParams panelParams = new LinearLayout.LayoutParams(dp(150), LinearLayout.LayoutParams.WRAP_CONTENT);
        panelParams.topMargin = dp(6);
        root.addView(panel, panelParams);

        bubble.setOnTouchListener(new View.OnTouchListener() {
            private int startX;
            private int startY;
            private float touchX;
            private float touchY;
            private boolean moved;

            @Override
            public boolean onTouch(View view, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        startX = params.x;
                        startY = params.y;
                        touchX = event.getRawX();
                        touchY = event.getRawY();
                        moved = false;
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        int dx = Math.round(event.getRawX() - touchX);
                        int dy = Math.round(event.getRawY() - touchY);
                        if (Math.abs(dx) > dp(6) || Math.abs(dy) > dp(6)) moved = true;
                        if (moved) {
                            params.x = startX + dx;
                            params.y = Math.max(0, startY + dy);
                            windowManager.updateViewLayout(root, params);
                        }
                        return true;
                    case MotionEvent.ACTION_UP:
                        if (moved) {
                            snapToEdge();
                        } else {
                            panel.setVisibility(panel.getVisibility() == View.VISIBLE ? View.GONE : View.VISIBLE);
                        }
                        return true;
                    default:
                        return false;
                }
            }
        });

        windowManager.addView(root, params);
        showing = true;
    }

    private TextView addButton(String label, String action) {
        TextView button = new TextView(this);
        button.setText(label);
        button.setTextColor(Color.WHITE);
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        button.setGravity(Gravity.CENTER);
        button.setPadding(dp(10), dp(10), dp(10), dp(10));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#2E2750"));
        bg.setCornerRadius(dp(10));
        button.setBackground(bg);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(4);
        panel.addView(button, lp);
        button.setOnClickListener(v -> {
            if ("open".equals(action)) {
                Intent open = new Intent(this, MainActivity.class)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                startActivity(open);
                return;
            }
            HuddleVoicePlugin.emitAction(action);
            if ("disconnect".equals(action)) {
                stopSelf();
            }
        });
        return button;
    }

    private void snapToEdge() {
        int screenWidth = getResources().getDisplayMetrics().widthPixels;
        int middle = params.x + dp(29);
        params.x = middle < screenWidth / 2 ? dp(4) : screenWidth - dp(62);
        lastX = params.x;
        lastY = params.y;
        windowManager.updateViewLayout(root, params);
    }

    private void render() {
        GradientDrawable ring = new GradientDrawable();
        ring.setShape(GradientDrawable.OVAL);
        ring.setColor(Color.parseColor("#1E1A2E"));
        boolean silenced = VoiceState.muted || VoiceState.deafened;
        ring.setStroke(dp(3), Color.parseColor(silenced ? "#E5484D" : "#4ADE80"));
        bubble.setBackground(ring);
        muteButton.setText(VoiceState.muted ? "Unmute" : "Mute");
        deafenButton.setText(VoiceState.deafened ? "Undeafen" : "Deafen");
    }

    @Override
    public void onDestroy() {
        if (root != null && windowManager != null) {
            try {
                windowManager.removeView(root);
            } catch (IllegalArgumentException ignored) {
                // Already gone.
            }
        }
        root = null;
        showing = false;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}

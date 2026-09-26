package online.hoffle.huddle;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Native voice controls: call notification + the floating bubble.
        registerPlugin(HuddleVoicePlugin.class);
        super.onCreate(savedInstanceState);
    }
}

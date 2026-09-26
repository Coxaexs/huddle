package online.hoffle.huddle;

/**
 * What the web app last told us about the voice call. The notification and
 * the bubble both draw from this, so they always agree.
 */
final class VoiceState {
    static volatile boolean inVoice = false;
    static volatile boolean muted = false;
    static volatile boolean deafened = false;
    static volatile String channelName = "Voice";

    private VoiceState() {}
}

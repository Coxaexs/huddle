#include "voice/voice_engine.h"
#include <QDebug>
#include <QRandomGenerator>

#ifdef HAVE_LIVEKIT_SDK
// LiveKit C++ SDK headers
// #include <livekit/room.h>
// #include <livekit/track.h>
#endif

VoiceEngine::VoiceEngine(QObject* parent) : QObject(parent) {
    m_audioMeterTimer = new QTimer(this);
    m_audioMeterTimer->setInterval(80); // 12.5 FPS update for VU meter
    connect(m_audioMeterTimer, &QTimer::timeout, this, &VoiceEngine::simulateAudioTick);
}

VoiceEngine::~VoiceEngine() {
    disconnectRoom();
}

QList<VoiceParticipant> VoiceEngine::participants() const {
    return m_participants.values();
}

void VoiceEngine::connectToRoom(const QString& livekitUrl, const QString& token, const QString& roomName) {
    if (m_state == VoiceConnectionState::Connected || m_state == VoiceConnectionState::Connecting) {
        disconnectRoom();
    }

    m_currentRoom = roomName;
    m_state = VoiceConnectionState::Connecting;
    emit stateChanged(m_state);

#ifdef HAVE_LIVEKIT_SDK
    // Native LiveKit client connection flow:
    // livekit::RoomOptions options;
    // auto room = livekit::Room::Create(options);
    // room->Connect(livekitUrl.toStdString(), token.toStdString());
#else
    // Local native simulation / fallback connection
    qInfo() << "Connecting to native voice room:" << roomName << "via" << livekitUrl;
    
    // Simulate instantaneous local connection
    m_state = VoiceConnectionState::Connected;
    emit stateChanged(m_state);
    emit roomJoined(roomName);

    // Add local self participant
    VoiceParticipant self;
    self.id = "local-user";
    self.name = "You";
    self.isMuted = m_isMuted;
    self.isDeafened = m_isDeafened;
    m_participants.insert(self.id, self);
    emit participantJoined(self);

    m_audioMeterTimer->start();
#endif
}

void VoiceEngine::disconnectRoom() {
    if (m_state == VoiceConnectionState::Disconnected) return;

    m_audioMeterTimer->stop();
    m_participants.clear();
    m_currentRoom.clear();

    m_state = VoiceConnectionState::Disconnected;
    emit stateChanged(m_state);
    emit roomLeft();
}

void VoiceEngine::setMuted(bool muted) {
    if (m_isMuted == muted) return;
    m_isMuted = muted;

    if (m_participants.contains("local-user")) {
        m_participants["local-user"].isMuted = muted;
    }

    if (m_isMuted) {
        emit localAudioLevelChanged(0.0f);
        emit speakingChanged("local-user", false);
    }
}

void VoiceEngine::setDeafened(bool deafened) {
    if (m_isDeafened == deafened) return;
    m_isDeafened = deafened;

    // Deafen automatically mutes the user
    if (m_isDeafened && !m_isMuted) {
        setMuted(true);
    }

    if (m_participants.contains("local-user")) {
        m_participants["local-user"].isDeafened = deafened;
    }
}

void VoiceEngine::setPushToTalkEnabled(bool enabled) {
    m_isPushToTalk = enabled;
}

void VoiceEngine::handlePushToTalkTrigger(bool active) {
    if (!m_isPushToTalk) return;
    m_isPttActive = active;
    setMuted(!active);
}

void VoiceEngine::simulateAudioTick() {
    if (m_state != VoiceConnectionState::Connected) return;

    if (m_isMuted) {
        emit localAudioLevelChanged(0.0f);
        return;
    }

    // When speaking or unmuted, simulate a subtle ambient audio floor
    float level = static_cast<float>(QRandomGenerator::global()->bounded(10, 45)) / 100.0f;
    emit localAudioLevelChanged(level);
    emit speakingChanged("local-user", level > 0.25f);
}

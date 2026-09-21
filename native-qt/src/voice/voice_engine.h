#pragma once

#include <QObject>
#include <QString>
#include <QList>
#include <QMap>
#include <QTimer>

enum class VoiceConnectionState {
    Disconnected,
    Connecting,
    Connected,
    Reconnecting,
    Failed
};

struct VoiceParticipant {
    QString id;
    QString name;
    bool isSpeaking = false;
    float audioLevel = 0.0f; // 0.0 to 1.0
    bool isMuted = false;
    bool isDeafened = false;
};

class VoiceEngine : public QObject {
    Q_OBJECT

public:
    explicit VoiceEngine(QObject* parent = nullptr);
    ~VoiceEngine() override;

    VoiceConnectionState connectionState() const { return m_state; }
    QString currentRoom() const { return m_currentRoom; }

    bool isMuted() const { return m_isMuted; }
    bool isDeafened() const { return m_isDeafened; }
    bool isPushToTalk() const { return m_isPushToTalk; }

    QList<VoiceParticipant> participants() const;

public slots:
    void connectToRoom(const QString& livekitUrl, const QString& token, const QString& roomName);
    void disconnectRoom();
    void setMuted(bool muted);
    void setDeafened(bool deafened);
    void setPushToTalkEnabled(bool enabled);
    void handlePushToTalkTrigger(bool active);

signals:
    void stateChanged(VoiceConnectionState newState);
    void roomJoined(const QString& roomName);
    void roomLeft();
    void participantJoined(const VoiceParticipant& participant);
    void participantLeft(const QString& participantId);
    void speakingChanged(const QString& participantId, bool isSpeaking);
    void localAudioLevelChanged(float level);
    void audioDeviceError(const QString& message);

private slots:
    void simulateAudioTick();

private:
    VoiceConnectionState m_state = VoiceConnectionState::Disconnected;
    QString m_currentRoom;
    bool m_isMuted = false;
    bool m_isDeafened = false;
    bool m_isPushToTalk = false;
    bool m_isPttActive = false;

    QMap<QString, VoiceParticipant> m_participants;

    // Simulation timer for audio meters when standalone
    QTimer* m_audioMeterTimer = nullptr;
};

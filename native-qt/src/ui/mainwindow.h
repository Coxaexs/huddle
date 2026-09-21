#pragma once

#include <QMainWindow>
#include <QListWidget>
#include <QTreeWidget>
#include <QTextBrowser>
#include <QLineEdit>
#include <QPushButton>
#include <QProgressBar>
#include <QLabel>
#include <QSystemTrayIcon>
#include <QStackedWidget>

#include "voice/voice_engine.h"
#include "network/api_client.h"

class MainWindow : public QMainWindow {
    Q_OBJECT

public:
    explicit MainWindow(QWidget* parent = nullptr);
    ~MainWindow() override;

private slots:
    void onServerSelected(QListWidgetItem* current, QListWidgetItem* previous);
    void onChannelClicked(QTreeWidgetItem* item, int column);
    void onSendMessageClicked();
    void onToggleMute();
    void onToggleDeafen();
    void onDisconnectVoice();

    // Voice Engine signals
    void onVoiceStateChanged(VoiceConnectionState state);
    void onSpeakingChanged(const QString& participantId, bool isSpeaking);
    void onAudioLevelChanged(float level);
    void onParticipantJoined(const VoiceParticipant& participant);
    void onParticipantLeft(const QString& participantId);

    // API signals
    void onMessagesLoaded(const QString& channelId, const QJsonArray& messages);
    void onMessageReceived(const QString& channelId, const QString& author, const QString& content);

private:
    void setupUi();
    void setupTray();
    void applyDarkTheme();

    // Core services
    VoiceEngine* m_voiceEngine;
    ApiClient* m_apiClient;

    // UI Widgets
    QListWidget* m_serverList;
    QTreeWidget* m_channelTree;
    QTextBrowser* m_chatBrowser;
    QLineEdit* m_messageInput;
    QPushButton* m_sendButton;

    // Voice bar widgets
    QWidget* m_voicePanel;
    QLabel* m_voiceStatusLabel;
    QProgressBar* m_audioMeter;
    QPushButton* m_muteBtn;
    QPushButton* m_deafenBtn;
    QPushButton* m_disconnectVoiceBtn;

    // Voice participant grid
    QListWidget* m_voiceParticipantList;
    QStackedWidget* m_mainStack;

    // System Tray
    QSystemTrayIcon* m_trayIcon;
    QString m_activeChannelId;
};

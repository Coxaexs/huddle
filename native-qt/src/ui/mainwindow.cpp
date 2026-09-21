#include "ui/mainwindow.h"

#include <QHBoxLayout>
#include <QVBoxLayout>
#include <QSplitter>
#include <QMenu>
#include <QMenuBar>
#include <QDateTime>
#include <QApplication>
#include <QStyle>

MainWindow::MainWindow(QWidget* parent)
    : QMainWindow(parent),
      m_voiceEngine(new VoiceEngine(this)),
      m_apiClient(new ApiClient("https://deeppixel.online", this)) {
    
    setupUi();
    setupTray();
    applyDarkTheme();

    // Wire Voice signals
    connect(m_voiceEngine, &VoiceEngine::stateChanged, this, &MainWindow::onVoiceStateChanged);
    connect(m_voiceEngine, &VoiceEngine::speakingChanged, this, &MainWindow::onSpeakingChanged);
    connect(m_voiceEngine, &VoiceEngine::localAudioLevelChanged, this, &MainWindow::onAudioLevelChanged);
    connect(m_voiceEngine, &VoiceEngine::participantJoined, this, &MainWindow::onParticipantJoined);
    connect(m_voiceEngine, &VoiceEngine::participantLeft, this, &MainWindow::onParticipantLeft);

    // Wire API signals
    connect(m_apiClient, &ApiClient::messagesLoaded, this, &MainWindow::onMessagesLoaded);
    connect(m_apiClient, &ApiClient::messageReceived, this, &MainWindow::onMessageReceived);
}

MainWindow::~MainWindow() = default;

void MainWindow::setupUi() {
    setWindowTitle(tr("Huddle (Native Qt)"));
    resize(1200, 800);
    setMinimumSize(900, 600);

    auto* centralWidget = new QWidget(this);
    setCentralWidget(centralWidget);
    auto* rootLayout = new QHBoxLayout(centralWidget);
    rootLayout->setContentsMargins(0, 0, 0, 0);
    rootLayout->setSpacing(0);

    // 1. Server Sidebar (Left-most)
    m_serverList = new QListWidget(this);
    m_serverList->setFixedWidth(72);
    m_serverList->setStyleSheet("QListWidget { background-color: #121217; border: none; padding-top: 12px; }");
    
    auto* homeItem = new QListWidgetItem("🏠", m_serverList);
    homeItem->setTextAlignment(Qt::AlignCenter);
    homeItem->setSizeHint(QSize(48, 48));

    auto* huddleItem = new QListWidgetItem("⚡", m_serverList);
    huddleItem->setTextAlignment(Qt::AlignCenter);
    huddleItem->setSizeHint(QSize(48, 48));

    rootLayout->addWidget(m_serverList);

    // 2. Channels Sidebar (Middle-left)
    auto* channelContainer = new QWidget(this);
    channelContainer->setFixedWidth(240);
    channelContainer->setStyleSheet("background-color: #1b1b21; border-right: 1px solid #282832;");
    auto* channelLayout = new QVBoxLayout(channelContainer);
    channelLayout->setContentsMargins(0, 0, 0, 0);
    channelLayout->setSpacing(0);

    // Server title header
    auto* serverHeader = new QLabel(tr("Huddle HQ"), channelContainer);
    serverHeader->setFixedHeight(48);
    serverHeader->setStyleSheet("font-weight: bold; font-size: 14px; padding-left: 16px; border-bottom: 1px solid #282832; color: #f4f4f5;");
    channelLayout->addWidget(serverHeader);

    // Channel Tree
    m_channelTree = new QTreeWidget(channelContainer);
    m_channelTree->setHeaderHidden(true);
    m_channelTree->setStyleSheet(
        "QTreeWidget { background-color: transparent; border: none; padding: 8px; color: #a1a1aa; font-size: 13px; }"
        "QTreeWidget::item { height: 32px; border-radius: 6px; padding-left: 8px; }"
        "QTreeWidget::item:hover { background-color: #26262e; color: #f4f4f5; }"
        "QTreeWidget::item:selected { background-color: #33333e; color: #ffffff; }"
    );

    auto* textCategory = new QTreeWidgetItem(m_channelTree, QStringList() << tr("TEXT CHANNELS"));
    textCategory->setFlags(Qt::ItemIsEnabled);
    auto* generalText = new QTreeWidgetItem(textCategory, QStringList() << "# general");
    generalText->setData(0, Qt::UserRole, "text_general");
    auto* devText = new QTreeWidgetItem(textCategory, QStringList() << "# development");
    devText->setData(0, Qt::UserRole, "text_dev");
    textCategory->setExpanded(true);

    auto* voiceCategory = new QTreeWidgetItem(m_channelTree, QStringList() << tr("VOICE ROOMS"));
    voiceCategory->setFlags(Qt::ItemIsEnabled);
    auto* loungeVoice = new QTreeWidgetItem(voiceCategory, QStringList() << "🔊 Lounge");
    loungeVoice->setData(0, Qt::UserRole, "voice_lounge");
    auto* gamingVoice = new QTreeWidgetItem(voiceCategory, QStringList() << "🔊 Gaming Hub");
    gamingVoice->setData(0, Qt::UserRole, "voice_gaming");
    voiceCategory->setExpanded(true);

    channelLayout->addWidget(m_channelTree, 1);

    // Voice control panel at bottom of channel sidebar
    m_voicePanel = new QWidget(channelContainer);
    m_voicePanel->setFixedHeight(86);
    m_voicePanel->setStyleSheet("background-color: #141419; border-top: 1px solid #282832; padding: 8px;");
    auto* voicePanelLayout = new QVBoxLayout(m_voicePanel);
    voicePanelLayout->setContentsMargins(10, 6, 10, 6);
    voicePanelLayout->setSpacing(4);

    m_voiceStatusLabel = new QLabel(tr("Voice: Disconnected"), m_voicePanel);
    m_voiceStatusLabel->setStyleSheet("color: #71717a; font-size: 11px; font-weight: bold;");
    voicePanelLayout->addWidget(m_voiceStatusLabel);

    // Audio VU meter
    m_audioMeter = new QProgressBar(m_voicePanel);
    m_audioMeter->setRange(0, 100);
    m_audioMeter->setValue(0);
    m_audioMeter->setFixedHeight(4);
    m_audioMeter->setTextVisible(false);
    m_audioMeter->setStyleSheet("QProgressBar { background-color: #282832; border-radius: 2px; } QProgressBar::chunk { background-color: #22c55e; border-radius: 2px; }");
    voicePanelLayout->addWidget(m_audioMeter);

    // Buttons: Mute, Deafen, Disconnect
    auto* btnRow = new QHBoxLayout();
    btnRow->setSpacing(8);

    m_muteBtn = new QPushButton(tr("🎤 Mute"), m_voicePanel);
    m_muteBtn->setCheckable(true);
    m_muteBtn->setStyleSheet("QPushButton { background-color: #26262e; border: none; border-radius: 4px; padding: 4px; color: #f4f4f5; font-size: 11px; } QPushButton:checked { background-color: #ef4444; color: white; }");
    connect(m_muteBtn, &QPushButton::clicked, this, &MainWindow::onToggleMute);
    btnRow->addWidget(m_muteBtn);

    m_deafenBtn = new QPushButton(tr("🎧 Deafen"), m_voicePanel);
    m_deafenBtn->setCheckable(true);
    m_deafenBtn->setStyleSheet("QPushButton { background-color: #26262e; border: none; border-radius: 4px; padding: 4px; color: #f4f4f5; font-size: 11px; } QPushButton:checked { background-color: #ef4444; color: white; }");
    connect(m_deafenBtn, &QPushButton::clicked, this, &MainWindow::onToggleDeafen);
    btnRow->addWidget(m_deafenBtn);

    m_disconnectVoiceBtn = new QPushButton(tr("Disconnect"), m_voicePanel);
    m_disconnectVoiceBtn->setVisible(false);
    m_disconnectVoiceBtn->setStyleSheet("QPushButton { background-color: #ef4444; border: none; border-radius: 4px; padding: 4px; color: white; font-size: 11px; }");
    connect(m_disconnectVoiceBtn, &QPushButton::clicked, this, &MainWindow::onDisconnectVoice);
    btnRow->addWidget(m_disconnectVoiceBtn);

    voicePanelLayout->addLayout(btnRow);
    channelLayout->addWidget(m_voicePanel);

    rootLayout->addWidget(channelContainer);

    // 3. Main Content Stack (Chat or Voice Room Grid)
    m_mainStack = new QStackedWidget(this);
    m_mainStack->setStyleSheet("background-color: #1e1e24;");

    // Page 0: Text Chat View
    auto* chatPage = new QWidget(m_mainStack);
    auto* chatLayout = new QVBoxLayout(chatPage);
    chatLayout->setContentsMargins(16, 16, 16, 16);
    chatLayout->setSpacing(12);

    m_chatBrowser = new QTextBrowser(chatPage);
    m_chatBrowser->setStyleSheet(
        "QTextBrowser { background-color: #18181e; border: 1px solid #282832; border-radius: 8px; padding: 12px; color: #f4f4f5; font-size: 13px; font-family: sans-serif; }"
    );
    m_chatBrowser->append("<b style='color:#7c3aed;'>Huddle System:</b> Welcome to Huddle Native (C++ / Qt 6). Ready for low-latency communication.");
    chatLayout->addWidget(m_chatBrowser, 1);

    auto* inputRow = new QHBoxLayout();
    inputRow->setSpacing(8);

    m_messageInput = new QLineEdit(chatPage);
    m_messageInput->setPlaceholderText(tr("Send a message to #general..."));
    m_messageInput->setStyleSheet(
        "QLineEdit { background-color: #26262e; border: 1px solid #383844; border-radius: 6px; padding: 8px 12px; color: #f4f4f5; font-size: 13px; }"
        "QLineEdit:focus { border: 1px solid #7c3aed; }"
    );
    connect(m_messageInput, &QLineEdit::returnPressed, this, &MainWindow::onSendMessageClicked);
    inputRow->addWidget(m_messageInput, 1);

    m_sendButton = new QPushButton(tr("Send"), chatPage);
    m_sendButton->setStyleSheet(
        "QPushButton { background-color: #7c3aed; color: white; border: none; border-radius: 6px; padding: 8px 16px; font-weight: bold; font-size: 13px; }"
        "QPushButton:hover { background-color: #6d28d9; }"
    );
    connect(m_sendButton, &QPushButton::clicked, this, &MainWindow::onSendMessageClicked);
    inputRow->addWidget(m_sendButton);

    chatLayout->addLayout(inputRow);
    m_mainStack->addWidget(chatPage);

    // Page 1: Voice Room Participant Grid
    auto* voicePage = new QWidget(m_mainStack);
    auto* voicePageLayout = new QVBoxLayout(voicePage);
    voicePageLayout->setContentsMargins(20, 20, 20, 20);

    auto* voiceHeader = new QLabel(tr("Voice Room: Active"), voicePage);
    voiceHeader->setStyleSheet("font-size: 18px; font-weight: bold; color: #f4f4f5;");
    voicePageLayout->addWidget(voiceHeader);

    m_voiceParticipantList = new QListWidget(voicePage);
    m_voiceParticipantList->setViewMode(QListView::IconMode);
    m_voiceParticipantList->setIconSize(QSize(96, 96));
    m_voiceParticipantList->setSpacing(16);
    m_voiceParticipantList->setStyleSheet(
        "QListWidget { background-color: #141419; border: 1px solid #282832; border-radius: 8px; padding: 16px; color: #f4f4f5; font-size: 14px; font-weight: bold; }"
        "QListWidget::item { width: 140px; height: 140px; border: 2px solid #282832; border-radius: 12px; background-color: #1f1f27; }"
        "QListWidget::item:selected { border: 2px solid #22c55e; }"
    );
    voicePageLayout->addWidget(m_voiceParticipantList, 1);
    m_mainStack->addWidget(voicePage);

    rootLayout->addWidget(m_mainStack, 1);

    // Channel selection handler
    connect(m_channelTree, &QTreeWidget::itemClicked, this, &MainWindow::onChannelClicked);
}

void MainWindow::setupTray() {
    m_trayIcon = new QSystemTrayIcon(this);
    m_trayIcon->setIcon(style()->standardIcon(QStyle::SP_ComputerIcon));

    auto* trayMenu = new QMenu(this);
    auto* toggleAction = trayMenu->addAction(tr("Show / Hide"));
    connect(toggleAction, &QAction::triggered, [this]() {
        if (isVisible()) hide();
        else { show(); activateWindow(); }
    });

    trayMenu->addSeparator();
    auto* quitAction = trayMenu->addAction(tr("Quit"));
    connect(quitAction, &QAction::triggered, qApp, &QApplication::quit);

    m_trayIcon->setContextMenu(trayMenu);
    m_trayIcon->show();
}

void MainWindow::applyDarkTheme() {
    setStyleSheet(
        "QMainWindow { background-color: #1b1b21; }"
        "QScrollBar:vertical { border: none; background: #1b1b21; width: 8px; margin: 0px; }"
        "QScrollBar::handle:vertical { background: #383844; min-height: 20px; border-radius: 4px; }"
        "QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical { height: 0px; }"
    );
}

void MainWindow::onServerSelected(QListWidgetItem*, QListWidgetItem*) {
    // Switch server
}

void MainWindow::onChannelClicked(QTreeWidgetItem* item, int) {
    if (!item) return;
    QString channelKey = item->data(0, Qt::UserRole).toString();

    if (channelKey.startsWith("text_")) {
        m_activeChannelId = channelKey;
        m_mainStack->setCurrentIndex(0);
        m_messageInput->setPlaceholderText(QString("Send a message to %1...").arg(item->text(0)));
    } else if (channelKey.startsWith("voice_")) {
        m_mainStack->setCurrentIndex(1);
        m_voiceEngine->connectToRoom("wss://deeppixel.online/livekit", "token-preview", item->text(0));
    }
}

void MainWindow::onSendMessageClicked() {
    QString text = m_messageInput->text().trimmed();
    if (text.isEmpty()) return;

    QString timestamp = QDateTime::currentDateTime().toString("hh:mm AP");
    m_chatBrowser->append(QString("<span style='color:#71717a; font-size:11px;'>[%1]</span> <b style='color:#38bdf8;'>You:</b> %2")
        .arg(timestamp)
        .arg(text.toHtmlEscaped()));

    m_apiClient->sendMessage(m_activeChannelId.isEmpty() ? "general" : m_activeChannelId, text);
    m_messageInput->clear();
}

void MainWindow::onToggleMute() {
    bool muted = m_muteBtn->isChecked();
    m_voiceEngine->setMuted(muted);
    m_muteBtn->setText(muted ? tr("🔇 Muted") : tr("🎤 Mute"));
}

void MainWindow::onToggleDeafen() {
    bool deafened = m_deafenBtn->isChecked();
    m_voiceEngine->setDeafened(deafened);
    m_deafenBtn->setText(deafened ? tr("Deafened") : tr("🎧 Deafen"));
}

void MainWindow::onDisconnectVoice() {
    m_voiceEngine->disconnectRoom();
}

void MainWindow::onVoiceStateChanged(VoiceConnectionState state) {
    switch (state) {
        case VoiceConnectionState::Connected:
            m_voiceStatusLabel->setText(tr("Voice: Connected (%1)").arg(m_voiceEngine->currentRoom()));
            m_voiceStatusLabel->setStyleSheet("color: #22c55e; font-size: 11px; font-weight: bold;");
            m_disconnectVoiceBtn->setVisible(true);
            break;
        case VoiceConnectionState::Connecting:
            m_voiceStatusLabel->setText(tr("Voice: Connecting..."));
            m_voiceStatusLabel->setStyleSheet("color: #eab308; font-size: 11px; font-weight: bold;");
            m_disconnectVoiceBtn->setVisible(true);
            break;
        case VoiceConnectionState::Disconnected:
        default:
            m_voiceStatusLabel->setText(tr("Voice: Disconnected"));
            m_voiceStatusLabel->setStyleSheet("color: #71717a; font-size: 11px; font-weight: bold;");
            m_audioMeter->setValue(0);
            m_disconnectVoiceBtn->setVisible(false);
            m_voiceParticipantList->clear();
            break;
    }
}

void MainWindow::onSpeakingChanged(const QString& participantId, bool isSpeaking) {
    if (participantId == "local-user") {
        for (int i = 0; i < m_voiceParticipantList->count(); ++i) {
            auto* item = m_voiceParticipantList->item(i);
            if (item->data(Qt::UserRole).toString() == participantId) {
                item->setSelected(isSpeaking);
                break;
            }
        }
    }
}

void MainWindow::onAudioLevelChanged(float level) {
    m_audioMeter->setValue(static_cast<int>(level * 100.0f));
}

void MainWindow::onParticipantJoined(const VoiceParticipant& participant) {
    auto* item = new QListWidgetItem(participant.name, m_voiceParticipantList);
    item->setData(Qt::UserRole, participant.id);
    item->setTextAlignment(Qt::AlignCenter);
}

void MainWindow::onParticipantLeft(const QString& participantId) {
    for (int i = 0; i < m_voiceParticipantList->count(); ++i) {
        auto* item = m_voiceParticipantList->item(i);
        if (item->data(Qt::UserRole).toString() == participantId) {
            delete m_voiceParticipantList->takeItem(i);
            break;
        }
    }
}

void MainWindow::onMessagesLoaded(const QString&, const QJsonArray&) {
}

void MainWindow::onMessageReceived(const QString&, const QString& author, const QString& content) {
    QString timestamp = QDateTime::currentDateTime().toString("hh:mm AP");
    m_chatBrowser->append(QString("<span style='color:#71717a; font-size:11px;'>[%1]</span> <b style='color:#a855f7;'>%2:</b> %3")
        .arg(timestamp)
        .arg(author.toHtmlEscaped())
        .arg(content.toHtmlEscaped()));
}

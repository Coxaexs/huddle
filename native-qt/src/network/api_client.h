#pragma once

#include <QObject>
#include <QString>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QJsonObject>
#include <QJsonArray>
#include <QJsonDocument>
#include <QUrl>

#ifdef HAVE_QT_WEBSOCKETS
#include <QWebSocket>
#endif

class ApiClient : public QObject {
    Q_OBJECT

public:
    explicit ApiClient(const QString& baseUrl, QObject* parent = nullptr);
    ~ApiClient() override;

    void setBaseUrl(const QString& baseUrl);
    QString baseUrl() const { return m_baseUrl; }

    void setToken(const QString& token);
    QString token() const { return m_token; }

    // REST API actions
    void fetchCurrentUser();
    void fetchGuilds();
    void fetchChannels(const QString& guildId);
    void fetchMessages(const QString& channelId, int limit = 50);
    void sendMessage(const QString& channelId, const QString& content);

    // Realtime gateway
    void connectGateway();
    void disconnectGateway();

signals:
    void authenticated(const QString& userId, const QString& username);
    void guildsLoaded(const QJsonArray& guilds);
    void channelsLoaded(const QString& guildId, const QJsonArray& channels);
    void messagesLoaded(const QString& channelId, const QJsonArray& messages);
    void messageReceived(const QString& channelId, const QString& author, const QString& content);
    void gatewayStatusChanged(bool connected);
    void apiError(const QString& errorMessage);

private slots:
    void onNetworkReplyFinished(QNetworkReply* reply);

#ifdef HAVE_QT_WEBSOCKETS
    void onWebSocketConnected();
    void onWebSocketDisconnected();
    void onWebSocketTextMessage(const QString& message);
#endif

private:
    QNetworkRequest createRequest(const QString& endpoint) const;

    QString m_baseUrl;
    QString m_token;
    QNetworkAccessManager* m_http;

#ifdef HAVE_QT_WEBSOCKETS
    QWebSocket* m_websocket = nullptr;
#endif
};

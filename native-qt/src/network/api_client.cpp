#include "network/api_client.h"
#include <QDebug>
#include <QUrlQuery>

ApiClient::ApiClient(const QString& baseUrl, QObject* parent)
    : QObject(parent), m_baseUrl(baseUrl), m_http(new QNetworkAccessManager(this)) {
    connect(m_http, &QNetworkAccessManager::finished, this, &ApiClient::onNetworkReplyFinished);

#ifdef HAVE_QT_WEBSOCKETS
    m_websocket = new QWebSocket(QString(), QWebSocketProtocol::VersionLatest, this);
    connect(m_websocket, &QWebSocket::connected, this, &ApiClient::onWebSocketConnected);
    connect(m_websocket, &QWebSocket::disconnected, this, &ApiClient::onWebSocketDisconnected);
    connect(m_websocket, &QWebSocket::textMessageReceived, this, &ApiClient::onWebSocketTextMessage);
#endif
}

ApiClient::~ApiClient() {
#ifdef HAVE_QT_WEBSOCKETS
    if (m_websocket && m_websocket->isValid()) {
        m_websocket->close();
    }
#endif
}

void ApiClient::setBaseUrl(const QString& baseUrl) {
    m_baseUrl = baseUrl;
    if (m_baseUrl.endsWith('/')) {
        m_baseUrl.chop(1);
    }
}

void ApiClient::setToken(const QString& token) {
    m_token = token;
}

QNetworkRequest ApiClient::createRequest(const QString& endpoint) const {
    QUrl url(m_baseUrl + endpoint);
    QNetworkRequest request(url);
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    if (!m_token.isEmpty()) {
        request.setRawHeader("Authorization", ("Bearer " + m_token).toUtf8());
    }
    return request;
}

void ApiClient::fetchCurrentUser() {
    auto req = createRequest("/hangout/api/v1/users/@me");
    auto* reply = m_http->get(req);
    reply->setProperty("action", "fetchCurrentUser");
}

void ApiClient::fetchGuilds() {
    auto req = createRequest("/hangout/api/v1/guilds");
    auto* reply = m_http->get(req);
    reply->setProperty("action", "fetchGuilds");
}

void ApiClient::fetchChannels(const QString& guildId) {
    auto req = createRequest(QString("/hangout/api/v1/guilds/%1/channels").arg(guildId));
    auto* reply = m_http->get(req);
    reply->setProperty("action", "fetchChannels");
    reply->setProperty("guildId", guildId);
}

void ApiClient::fetchMessages(const QString& channelId, int limit) {
    QString endpoint = QString("/hangout/api/v1/channels/%1/messages?limit=%2").arg(channelId).arg(limit);
    auto req = createRequest(endpoint);
    auto* reply = m_http->get(req);
    reply->setProperty("action", "fetchMessages");
    reply->setProperty("channelId", channelId);
}

void ApiClient::sendMessage(const QString& channelId, const QString& content) {
    auto req = createRequest(QString("/hangout/api/v1/channels/%1/messages").arg(channelId));
    QJsonObject body;
    body["content"] = content;
    QByteArray data = QJsonDocument(body).toJson(QJsonDocument::Compact);

    auto* reply = m_http->post(req, data);
    reply->setProperty("action", "sendMessage");
    reply->setProperty("channelId", channelId);
}

void ApiClient::onNetworkReplyFinished(QNetworkReply* reply) {
    reply->deleteLater();
    if (reply->error() != QNetworkReply::NoError) {
        emit apiError(reply->errorString());
        return;
    }

    QByteArray responseData = reply->readAll();
    QJsonDocument doc = QJsonDocument::fromJson(responseData);
    QString action = reply->property("action").toString();

    if (action == "fetchCurrentUser" && doc.isObject()) {
        QJsonObject user = doc.object();
        emit authenticated(user["id"].toString(), user["username"].toString());
    } else if (action == "fetchGuilds" && doc.isArray()) {
        emit guildsLoaded(doc.array());
    } else if (action == "fetchChannels" && doc.isArray()) {
        QString guildId = reply->property("guildId").toString();
        emit channelsLoaded(guildId, doc.array());
    } else if (action == "fetchMessages" && doc.isArray()) {
        QString channelId = reply->property("channelId").toString();
        emit messagesLoaded(channelId, doc.array());
    }
}

void ApiClient::connectGateway() {
#ifdef HAVE_QT_WEBSOCKETS
    if (!m_websocket) return;

    QUrl wsUrl(m_baseUrl);
    wsUrl.setScheme(wsUrl.scheme() == "https" ? "wss" : "ws");
    wsUrl.setPath("/hangout/api/realtime");

    QNetworkRequest req(wsUrl);
    if (!m_token.isEmpty()) {
        req.setRawHeader("Authorization", ("Bearer " + m_token).toUtf8());
    }
    m_websocket->open(req);
#endif
}

void ApiClient::disconnectGateway() {
#ifdef HAVE_QT_WEBSOCKETS
    if (m_websocket && m_websocket->isValid()) {
        m_websocket->close();
    }
#endif
}

#ifdef HAVE_QT_WEBSOCKETS
void ApiClient::onWebSocketConnected() {
    emit gatewayStatusChanged(true);
}

void ApiClient::onWebSocketDisconnected() {
    emit gatewayStatusChanged(false);
}

void ApiClient::onWebSocketTextMessage(const QString& message) {
    QJsonDocument doc = QJsonDocument::fromJson(message.toUtf8());
    if (!doc.isObject()) return;

    QJsonObject obj = doc.object();
    QString type = obj["type"].toString();

    if (type == "MESSAGE_CREATE") {
        QJsonObject payload = obj["payload"].toObject();
        emit messageReceived(
            payload["channel_id"].toString(),
            payload["author"].toString(),
            payload["content"].toString()
        );
    }
}
#endif

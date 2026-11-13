//! The hub socket (`/api/realtime`): presence, messages, voice rosters, typing.
//!
//! One thread owns the socket. It reconnects with back-off, resumes the same connection id with the
//! hub's ticket (as app/hooks/use-hub.ts does), pings every 25 s and treats a ping that got no reply
//! within a beat as a dead socket. Events go to the UI over a channel; the UI sends JSON back.

use std::io::ErrorKind;
use std::net::TcpStream;
use std::thread;
use std::time::{Duration, Instant};

use serde_json::{Value, json};
use smol::channel::{Receiver, Sender, TryRecvError, unbounded};
use tungstenite::client::IntoClientRequest;
use tungstenite::stream::MaybeTlsStream;
use tungstenite::{Message as WsMessage, WebSocket};

use crate::api::Client;

pub enum HubEvent {
    Connected,
    Disconnected(String),
    Event(Value),
}

#[derive(Clone)]
pub struct Hub {
    outbound: Sender<String>,
}

impl Hub {
    pub fn send(&self, event: Value) {
        let _ = self.outbound.try_send(event.to_string());
    }
}

const PING_EVERY: Duration = Duration::from_secs(25);

pub fn start(client: Client) -> (Hub, Receiver<HubEvent>) {
    let (events_tx, events_rx) = unbounded();
    let (out_tx, out_rx) = unbounded::<String>();
    thread::Builder::new()
        .name("hoffle-hub".into())
        .spawn(move || run(client, events_tx, out_rx))
        .expect("spawn hub thread");
    (Hub { outbound: out_tx }, events_rx)
}

fn run(client: Client, events: Sender<HubEvent>, outbound: Receiver<String>) {
    let mut resume: Option<(String, String)> = None;
    let mut attempt: u32 = 0;
    // Things the UI asked for while offline that must reach the hub once back (the open channel).
    let mut sticky: Option<String> = None;
    loop {
        if events.is_closed() {
            return;
        }
        match connect(&client, resume.as_ref()) {
            Ok(mut socket) => {
                attempt = 0;
                if events.try_send(HubEvent::Connected).is_err() {
                    return;
                }
                if let Some(subscribe) = &sticky {
                    let _ = socket.send(WsMessage::text(subscribe.clone()));
                }
                let reason = pump(&mut socket, &events, &outbound, &mut resume, &mut sticky);
                let _ = socket.close(None);
                if events.try_send(HubEvent::Disconnected(reason)).is_err() {
                    return;
                }
            }
            Err(err) => {
                // A refused resume (hub restarted) must not keep failing: start fresh next time.
                resume = None;
                if events.try_send(HubEvent::Disconnected(err)).is_err() {
                    return;
                }
            }
        }
        // 1 s, 2 s, 4 s … capped at 20 s, like the web client's back-off.
        let wait = Duration::from_millis((1000u64 << attempt.min(5)).min(20_000));
        attempt += 1;
        thread::sleep(wait);
    }
}

fn connect(client: &Client, resume: Option<&(String, String)>) -> Result<WebSocket<MaybeTlsStream<TcpStream>>, String> {
    let mut url = client.realtime_url();
    if let Some((id, ticket)) = resume {
        url.push_str(&format!(
            "?resume={}&ticket={}",
            url::form_urlencoded::byte_serialize(id.as_bytes()).collect::<String>(),
            url::form_urlencoded::byte_serialize(ticket.as_bytes()).collect::<String>()
        ));
    }
    let mut request = url.into_client_request().map_err(|e| e.to_string())?;
    if let Some(cookie) = client.cookie_header() {
        request.headers_mut().insert("Cookie", cookie.parse().map_err(|_| "bad cookie")?);
    }
    request
        .headers_mut()
        .insert("Origin", client.absolute("").parse().map_err(|_| "bad origin")?);
    let (socket, _) = tungstenite::connect(request).map_err(|e| e.to_string())?;
    let tcp = match socket.get_ref() {
        MaybeTlsStream::Plain(s) => s,
        MaybeTlsStream::Rustls(s) => s.get_ref(),
        _ => return Err("unsupported stream".into()),
    };
    // Short reads let one thread both listen and send.
    tcp.set_read_timeout(Some(Duration::from_millis(50))).map_err(|e| e.to_string())?;
    let _ = tcp.set_nodelay(true);
    Ok(socket)
}

fn pump(
    socket: &mut WebSocket<MaybeTlsStream<TcpStream>>,
    events: &Sender<HubEvent>,
    outbound: &Receiver<String>,
    resume: &mut Option<(String, String)>,
    sticky: &mut Option<String>,
) -> String {
    let mut last_heard = Instant::now();
    let mut ping_sent: Option<Instant> = None;
    let mut next_ping = Instant::now() + PING_EVERY;
    loop {
        // Outgoing first, so a send never waits behind a quiet socket.
        loop {
            match outbound.try_recv() {
                Ok(text) => {
                    if text.contains("\"t\":\"subscribe\"") {
                        *sticky = Some(text.clone());
                    }
                    if let Err(err) = socket.send(WsMessage::text(text)) {
                        return err.to_string();
                    }
                }
                Err(TryRecvError::Empty) => break,
                Err(TryRecvError::Closed) => return "closed".into(),
            }
        }
        if Instant::now() >= next_ping {
            if let Some(sent) = ping_sent
                && last_heard < sent
            {
                return "The connection stopped answering.".into();
            }
            if let Err(err) = socket.send(WsMessage::text(json!({ "t": "ping" }).to_string())) {
                return err.to_string();
            }
            ping_sent = Some(Instant::now());
            next_ping = Instant::now() + PING_EVERY;
        }
        match socket.read() {
            Ok(WsMessage::Text(text)) => {
                last_heard = Instant::now();
                let Ok(value) = serde_json::from_str::<Value>(text.as_str()) else { continue };
                if value.get("t").and_then(Value::as_str) == Some("ready") {
                    let id = value.get("connectionId").and_then(Value::as_str);
                    let ticket = value.get("resumeTicket").and_then(Value::as_str);
                    *resume = id.zip(ticket).map(|(i, t)| (i.to_string(), t.to_string()));
                }
                if value.get("t").and_then(Value::as_str) == Some("pong") {
                    continue;
                }
                if events.try_send(HubEvent::Event(value)).is_err() {
                    return "closed".into();
                }
            }
            Ok(WsMessage::Close(frame)) => {
                return frame.map(|f| f.reason.to_string()).unwrap_or_else(|| "closed".into());
            }
            Ok(_) => last_heard = Instant::now(),
            Err(tungstenite::Error::Io(err))
                if matches!(err.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => {}
            Err(err) => return err.to_string(),
        }
    }
}

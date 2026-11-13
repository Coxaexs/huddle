//! Lets gpui's `img(url)` load pictures (avatars, server icons, uploads) with the signed-in session,
//! since uploads are only served to members. gpui caches what it decodes.

use std::future::Future;
use std::pin::Pin;
use std::sync::{Mutex, OnceLock};

use gpui::http_client::{self, AsyncBody, HttpClient, Request, Response, Url, http::HeaderValue};

use crate::api::Client;

fn current() -> &'static Mutex<Option<Client>> {
    static CLIENT: OnceLock<Mutex<Option<Client>>> = OnceLock::new();
    CLIENT.get_or_init(|| Mutex::new(None))
}

/// Pictures load as this session from now on (None when signed out).
pub fn set_client(client: Option<Client>) {
    *current().lock().unwrap() = client;
}

pub struct Fetcher {
    agent: HeaderValue,
}

impl Fetcher {
    pub fn new() -> Self {
        Self { agent: HeaderValue::from_static(concat!("HoffleLite-GPUI/", env!("CARGO_PKG_VERSION"))) }
    }
}

type BoxFuture<T> = Pin<Box<dyn Future<Output = T> + Send + 'static>>;

impl HttpClient for Fetcher {
    fn type_name(&self) -> &'static str {
        "hoffle-images"
    }

    fn user_agent(&self) -> Option<&HeaderValue> {
        Some(&self.agent)
    }

    fn proxy(&self) -> Option<&Url> {
        None
    }

    fn send(&self, request: Request<AsyncBody>) -> BoxFuture<anyhow::Result<Response<AsyncBody>>> {
        let uri = request.uri().to_string();
        let client = current().lock().unwrap().clone();
        Box::pin(smol::unblock(move || {
            let client = client.unwrap_or_else(|| Client::new(crate::api::DEFAULT_BASE, None));
            let (status, bytes) = client.fetch(&uri)?;
            Ok(Response::builder()
                .status(http_client::StatusCode::from_u16(status)?)
                .body(AsyncBody::from(bytes))?)
        }))
    }
}

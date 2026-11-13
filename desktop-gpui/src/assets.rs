//! Icons (Lucide 1.27, the web app's set) and fonts (Instrument Sans, Fraunces, JetBrains Mono, the
//! web app's faces), compiled into the binary.

use std::borrow::Cow;

use gpui::{App, AssetSource, SharedString};

include!(concat!(env!("OUT_DIR"), "/assets.rs"));

pub struct Assets;

impl AssetSource for Assets {
    fn load(&self, path: &str) -> anyhow::Result<Option<Cow<'static, [u8]>>> {
        Ok(ASSETS.iter().find(|(p, _)| *p == path).map(|(_, bytes)| Cow::Borrowed(*bytes)))
    }

    fn list(&self, path: &str) -> anyhow::Result<Vec<SharedString>> {
        Ok(ASSETS.iter().filter(|(p, _)| p.starts_with(path)).map(|(p, _)| SharedString::from(*p)).collect())
    }
}

pub fn load_fonts(cx: &mut App) {
    let fonts: Vec<Cow<'static, [u8]>> = ASSETS
        .iter()
        .filter(|(p, _)| p.starts_with("fonts/") && p.ends_with(".ttf"))
        .map(|(_, bytes)| Cow::Borrowed(*bytes))
        .collect();
    if let Err(err) = cx.text_system().add_fonts(fonts) {
        eprintln!("fonts: {err}");
    }
}

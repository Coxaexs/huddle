//! Fonts for styled display names. The web loads each name font from Google Fonts the first time a
//! name needs it (loadNameFont in app/lib/profile-look.ts); this does the same request, keeps the
//! file in the cache folder, and registers it with gpui (plain names) and with resvg (names drawn
//! with an effect).

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

use gpui::App;

struct State {
    /// Families ready to use, with their bytes (for resvg and metrics).
    loaded: HashMap<String, Vec<u8>>,
    pending: HashSet<String>,
    db: Arc<resvg::usvg::fontdb::Database>,
}

fn state() -> &'static Mutex<State> {
    static STATE: OnceLock<Mutex<State>> = OnceLock::new();
    STATE.get_or_init(|| {
        let mut db = resvg::usvg::fontdb::Database::new();
        // The app's own faces, so effects on names without a name font use Instrument Sans.
        for (path, bytes) in crate::assets::ASSETS {
            if path.starts_with("fonts/") && path.ends_with(".ttf") {
                db.load_font_data(bytes.to_vec());
            }
        }
        // Symbols the effects draw (the sparkle's ✦) come from the system.
        db.load_system_fonts();
        Mutex::new(State { loaded: HashMap::new(), pending: HashSet::new(), db: Arc::new(db) })
    })
}

/// resvg's font database: the app's faces plus every name font loaded so far.
pub fn database() -> Arc<resvg::usvg::fontdb::Database> {
    state().lock().unwrap().db.clone()
}

/// The font file for a family, once it is here.
pub fn bytes(family: &str) -> Option<Vec<u8>> {
    if let Some(bytes) = state().lock().unwrap().loaded.get(family) {
        return Some(bytes.clone());
    }
    crate::assets::ASSETS
        .iter()
        .find(|(p, _)| p.starts_with(&format!("fonts/{}-", family.replace(' ', ""))))
        .map(|(_, b)| b.to_vec())
}

pub fn is_ready(family: &str) -> bool {
    state().lock().unwrap().loaded.contains_key(family)
}

fn cache_path(family: &str, weight: u16) -> Option<PathBuf> {
    Some(dirs::cache_dir()?.join("Hoffle GPUI").join("fonts").join(format!("{}-{weight}.ttf", family.replace(' ', ""))))
}

/// Starts loading a name font if it is not here yet; `done` runs on the main thread once it is,
/// so the caller can redraw.
pub fn ensure(family: &str, weight: u16, cx: &mut App, done: impl FnOnce(&mut App) + 'static) {
    {
        let mut s = state().lock().unwrap();
        if s.loaded.contains_key(family) || !s.pending.insert(family.to_string()) {
            return;
        }
    }
    let family = family.to_string();
    let task = cx.background_executor().spawn({
        let family = family.clone();
        async move { fetch(&family, weight) }
    });
    cx.spawn(async move |cx| {
        let bytes = task.await;
        cx.update(|cx| {
            let mut s = state().lock().unwrap();
            s.pending.remove(&family);
            let Some(bytes) = bytes else { return };
            if cx.text_system().add_fonts(vec![std::borrow::Cow::Owned(bytes.clone())]).is_err() {
                return;
            }
            let mut db = (*s.db).clone();
            db.load_font_data(bytes.clone());
            s.db = Arc::new(db);
            s.loaded.insert(family, bytes);
            drop(s);
            done(cx);
        })
        .ok();
    })
    .detach();
}

/// The cached file, or Google Fonts' TTF for that family and weight.
fn fetch(family: &str, weight: u16) -> Option<Vec<u8>> {
    let path = cache_path(family, weight)?;
    if let Ok(bytes) = std::fs::read(&path) {
        return Some(bytes);
    }
    let agent: ureq::Agent = ureq::Agent::config_builder()
        // A bare user agent gets one TrueType file per family; browsers get WOFF2 subsets.
        .user_agent("Mozilla/5.0")
        .build()
        .into();
    let css_url = format!(
        "https://fonts.googleapis.com/css2?family={}:wght@{weight}&display=swap",
        family.replace(' ', "+")
    );
    let css = agent.get(&css_url).call().ok()?.body_mut().read_to_string().ok()?;
    let start = css.find("url(")? + 4;
    let end = css[start..].find(')')? + start;
    let url = css[start..end].trim_matches(|c| c == '\'' || c == '"');
    let bytes = agent.get(url).call().ok()?.body_mut().with_config().limit(8 * 1024 * 1024).read_to_vec().ok()?;
    ttf_parser::Face::parse(&bytes, 0).ok()?;
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let _ = std::fs::write(&path, &bytes);
    Some(bytes)
}

/// Ascent and descent of a face, as fractions of the font size (the inline box CSS paints a
/// background into: hhea, or typo metrics when the font asks for them).
pub fn vertical_metrics(bytes: &[u8]) -> (f32, f32) {
    match ttf_parser::Face::parse(bytes, 0) {
        Ok(face) => {
            let em = face.units_per_em() as f32;
            (face.ascender() as f32 / em, -(face.descender() as f32) / em)
        }
        Err(_) => (0.9, 0.25),
    }
}

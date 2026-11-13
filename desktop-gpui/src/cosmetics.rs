//! Cosmetics from app/components/cosmetics.tsx and its stylesheets: avatar decorations (SVG laid over
//! an avatar) and nameplates (a backdrop behind a name in the member list). The art is the web's own,
//! exported by tools/export-cosmetics.mjs; nameplate colours come from the CSS rules
//! (tools/extract-nameplates.py).

use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

use gpui::{AnyElement, ImageSource, IntoElement, RenderImage, SharedString, div, img, prelude::*, px};
use serde_json::Value;

use crate::cssbg::{self, Box2};

fn asset(path: &str) -> Option<&'static [u8]> {
    crate::assets::ASSETS.iter().find(|(p, _)| *p == path).map(|(_, b)| *b)
}

/// The ring-style decorations are drawn by CSS around the avatar, not as art (RING_DECORATIONS).
const RINGS: [&str; 6] = ["neon", "rainbow", "cyber", "gold", "sakura", "diamond"];

/// An avatar of `size` with its decoration on top: `.avatar-deco` covers 120% of the avatar, offset
/// by −10%; the exported art has a widened viewBox (−60…180) so wings and horns are not cut off.
pub fn decorate(avatar: AnyElement, frame: &str, size: f32) -> AnyElement {
    decorate_grey(avatar, frame, size, false)
}

/// The same, greyed out (an offline member's avatar).
pub fn decorate_grey(avatar: AnyElement, frame: &str, size: f32, grey: bool) -> AnyElement {
    if frame.is_empty() || frame == "none" || RINGS.contains(&frame) {
        return avatar;
    }
    let path = format!("cosmetics/decorations/{frame}.svg");
    if asset(&path).is_none() {
        return avatar;
    }
    let deco = size * 1.2;
    div()
        .relative()
        .size(px(size))
        .flex_none()
        .child(avatar)
        .child(
            img(SharedString::from(path))
                .absolute()
                .left(px(-size * 0.1 - deco * 0.5))
                .top(px(-size * 0.1 - deco * 0.5))
                .size(px(deco * 2.))
                .grayscale(grey),
        )
        .into_any_element()
}

fn table() -> &'static HashMap<String, Value> {
    static TABLE: OnceLock<HashMap<String, Value>> = OnceLock::new();
    TABLE.get_or_init(|| {
        asset("cosmetics/nameplates.json")
            .and_then(|b| serde_json::from_slice::<HashMap<String, Value>>(b).ok())
            .unwrap_or_default()
    })
}

pub fn has_nameplate(id: &str) -> bool {
    !id.is_empty() && id != "none" && table().contains_key(id)
}

/// `.has-nameplate` backdrop at `w`×`h`: the base colour, the CSS gradients (`background-size:
/// cover`), the art on the right 64% faded in over its first 38%, the inset border, 8px corners.
pub fn nameplate(id: &str, w: f32, h: f32, scale: f32) -> Option<AnyElement> {
    let key = format!("{id}|{w}|{h}|{scale}");
    static CACHE: OnceLock<Mutex<HashMap<String, Arc<RenderImage>>>> = OnceLock::new();
    let cache = CACHE.get_or_init(Default::default);
    let cached = cache.lock().unwrap().get(&key).cloned();
    let image = match cached {
        Some(image) => image,
        None => {
            let image = Arc::new(paint_nameplate(id, w, h, scale)?);
            cache.lock().unwrap().insert(key, image.clone());
            image
        }
    };
    Some(img(ImageSource::Render(image)).absolute().left_0().top_0().w(px(w)).h(px(h)).into_any_element())
}

fn paint_nameplate(id: &str, w: f32, h: f32, scale: f32) -> Option<RenderImage> {
    let rule = table().get(id)?;
    let base = rule.get("base").and_then(Value::as_str).unwrap_or("transparent");
    let art_css = rule.get("art").and_then(Value::as_str).unwrap_or("");
    let (bg_defs, bg_draw) = cssbg::to_svg(art_css, &Box2 { x: 0., y: 0., w, h }, "bg");
    let base_fill = crate::names::Rgba::parse(base).unwrap_or(crate::names::Rgba::CLEAR);
    // The art file is a whole <svg>: nest it, keeping its viewBox and aspect rule.
    let art = asset(&format!("cosmetics/nameplates/{id}.svg"))
        .and_then(|b| std::str::from_utf8(b).ok())
        .map(|s| {
            let open_end = s.find('>').unwrap_or(0);
            let head = &s[..open_end];
            let attr = |name: &str| {
                head.find(&format!("{name}=\"")).map(|i| {
                    let rest = &head[i + name.len() + 2..];
                    rest[..rest.find('"').unwrap_or(0)].to_string()
                })
            };
            let view_box = attr("viewBox").unwrap_or_else(|| "60 0 100 48".into());
            let aspect = attr("preserveAspectRatio").unwrap_or_else(|| "xMaxYMid slice".into());
            let inner = &s[open_end + 1..s.rfind("</svg>").unwrap_or(s.len())];
            format!(
                r#"<g mask="url(#fade)"><svg x="{}" y="0" width="{}" height="{h}" viewBox="{view_box}" preserveAspectRatio="{aspect}" overflow="hidden">{inner}</svg></g>"#,
                w * 0.36,
                w * 0.64
            )
        })
        .unwrap_or_default();
    let border = rule
        .get("box-shadow")
        .and_then(Value::as_str)
        .and_then(|s| s.strip_prefix("inset 0 0 0 1px "))
        .and_then(crate::names::Rgba::parse)
        .map(|c| format!(r#"<rect x="0.5" y="0.5" width="{}" height="{}" rx="7.5" fill="none" stroke="{}" stroke-opacity="{}"/>"#, w - 1., h - 1., c.hex(), c.opacity()))
        .unwrap_or_default();
    let svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
<defs>{bg_defs}
<clipPath id="round"><rect width="{w}" height="{h}" rx="8"/></clipPath>
<linearGradient id="fadeg" gradientUnits="userSpaceOnUse" x1="{}" y1="0" x2="{w}" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.38" stop-color="#fff"/></linearGradient>
<mask id="fade" maskUnits="userSpaceOnUse" x="0" y="0" width="{w}" height="{h}"><rect x="{}" width="{}" height="{h}" fill="url(#fadeg)"/></mask>
</defs>
<g clip-path="url(#round)"><rect width="{w}" height="{h}" fill="{}" fill-opacity="{}"/>{bg_draw}{art}</g>{border}</svg>"##,
        w * 0.36,
        w * 0.36,
        w * 0.64,
        base_fill.hex(),
        base_fill.opacity()
    );
    let options = resvg::usvg::Options { fontdb: crate::fonts::database(), ..Default::default() };
    let tree = resvg::usvg::Tree::from_str(&svg, &options).ok()?;
    let (pw, ph) = ((w * scale).ceil() as u32, (h * scale).ceil() as u32);
    let mut pixmap = resvg::tiny_skia::Pixmap::new(pw.max(1), ph.max(1))?;
    resvg::render(&tree, resvg::tiny_skia::Transform::from_scale(scale, scale), &mut pixmap.as_mut());
    let mut data = Vec::with_capacity((pw * ph * 4) as usize);
    for p in pixmap.pixels() {
        let c = p.demultiply();
        data.extend_from_slice(&[c.blue(), c.green(), c.red(), c.alpha()]);
    }
    Some(RenderImage::new(vec![image::Frame::new(image::RgbaImage::from_raw(pw, ph, data)?)]))
}

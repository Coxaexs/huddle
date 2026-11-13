//! CSS backgrounds (`linear-gradient(...)`, `radial-gradient(...)`, layered, with `pos / size`) turned
//! into SVG, so the web's decorative backgrounds (nameplates, cards, themes) render the same here.

use crate::names::Rgba;

pub struct Box2 {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

/// Top-level commas only: `a(b, c), d` → [`a(b, c)`, `d`].
pub fn split_top(value: &str) -> Vec<String> {
    let (mut depth, mut cur, mut out) = (0i32, String::new(), Vec::new());
    for ch in value.chars() {
        match ch {
            '(' => depth += 1,
            ')' => depth -= 1,
            ',' if depth == 0 => {
                out.push(cur.trim().to_string());
                cur.clear();
                continue;
            }
            _ => {}
        }
        cur.push(ch);
    }
    if !cur.trim().is_empty() {
        out.push(cur.trim().to_string());
    }
    out
}

/// "40%" of `whole`, "12px", "0.3em" (16px em), or a bare number as px.
fn length(token: &str, whole: f32) -> Option<f32> {
    let t = token.trim();
    if let Some(p) = t.strip_suffix('%') {
        return p.parse::<f32>().ok().map(|v| v / 100. * whole);
    }
    if let Some(p) = t.strip_suffix("px") {
        return p.parse().ok();
    }
    if let Some(p) = t.strip_suffix("em") {
        return p.parse::<f32>().ok().map(|v| v * 16.);
    }
    t.parse().ok()
}

/// "#fff 30%", "rgba(...) 0 50%", "transparent" → colour and up to two positions (px along `len`).
fn parse_stop(stop: &str, len: f32) -> Option<(Rgba, Vec<f32>)> {
    let s = stop.trim();
    let (color_text, rest) = if let Some(close) = s.find(')').filter(|_| s.starts_with("rgb")) {
        (&s[..=close], s[close + 1..].trim())
    } else {
        match s.split_once(char::is_whitespace) {
            Some((c, r)) => (c, r.trim()),
            None => (s, ""),
        }
    };
    let color = Rgba::parse(color_text)?;
    let positions = rest.split_whitespace().filter_map(|p| length(p, len)).collect();
    Some((color, positions))
}

/// CSS stop list → (colour, 0..1) with unpositioned stops spread evenly between their neighbours.
fn resolve_stops(stops: &[(Rgba, Vec<f32>)], len: f32) -> Vec<(Rgba, f32)> {
    let mut flat: Vec<(Rgba, Option<f32>)> = Vec::new();
    for (c, ps) in stops {
        if ps.is_empty() {
            flat.push((*c, None));
        }
        for p in ps {
            flat.push((*c, Some(p / len.max(0.0001))));
        }
    }
    if flat.is_empty() {
        return vec![];
    }
    let last = flat.len() - 1;
    if flat[0].1.is_none() {
        flat[0].1 = Some(0.);
    }
    if flat[last].1.is_none() {
        flat[last].1 = Some(1.);
    }
    let mut i = 0;
    while i < flat.len() {
        if flat[i].1.is_none() {
            let start = i - 1;
            let mut end = i;
            while flat[end].1.is_none() {
                end += 1;
            }
            let (a, b) = (flat[start].1.unwrap(), flat[end].1.unwrap());
            for (k, item) in flat.iter_mut().enumerate().take(end).skip(i) {
                item.1 = Some(a + (b - a) * (k - start) as f32 / (end - start) as f32);
            }
            i = end;
        }
        i += 1;
    }
    // Positions never go backwards.
    let mut max = 0f32;
    flat.into_iter()
        .map(|(c, p)| {
            max = max.max(p.unwrap());
            (c, max)
        })
        .collect()
}

/// SVG for one background value painted over `area`. Returns (defs, drawing).
pub fn to_svg(value: &str, area: &Box2, prefix: &str) -> (String, String) {
    let mut defs = String::new();
    let mut draw = String::new();
    for (n, layer) in split_top(value).iter().enumerate().rev() {
        let id = format!("{prefix}{n}");
        // "gradient(...) pos / size" → tile placement.
        let close = layer.rfind(')').unwrap_or(layer.len().saturating_sub(1));
        let (func, extra) = layer.split_at((close + 1).min(layer.len()));
        let (mut tx, mut ty, mut tw, mut th) = (area.x, area.y, area.w, area.h);
        let mut tiled = false;
        if let Some((pos, size)) = extra.split_once('/') {
            let p: Vec<&str> = pos.split_whitespace().collect();
            let z: Vec<&str> = size.split_whitespace().collect();
            tw = z.first().and_then(|v| length(v, area.w)).unwrap_or(area.w);
            th = z.get(1).and_then(|v| length(v, area.h)).unwrap_or(tw);
            tx += p.first().and_then(|v| length(v, area.w - tw)).unwrap_or(0.);
            ty += p.get(1).and_then(|v| length(v, area.h - th)).unwrap_or(0.);
            tiled = true;
        }
        let Some(open) = func.find('(') else {
            if let Some(c) = Rgba::parse(func) {
                draw.push_str(&format!(r#"<rect x="{}" y="{}" width="{}" height="{}" fill="{}" fill-opacity="{}"/>"#, area.x, area.y, area.w, area.h, c.hex(), c.opacity()));
            }
            continue;
        };
        let name = func[..open].trim();
        let args = split_top(&func[open + 1..func.len().saturating_sub(1)]);
        // Gradient defined over the tile (local coordinates when tiled).
        let (gx, gy) = if tiled { (0., 0.) } else { (tx, ty) };
        let gradient = match name {
            "linear-gradient" | "repeating-linear-gradient" => {
                let (angle, stop_args) = match args.first().map(|a| a.trim()) {
                    Some(a) if a.ends_with("deg") => (a.trim_end_matches("deg").parse::<f32>().unwrap_or(180.), &args[1..]),
                    Some(a) if a.starts_with("to ") => (
                        match a {
                            "to right" => 90.,
                            "to left" => 270.,
                            "to top" => 0.,
                            "to bottom right" => 135.,
                            "to bottom left" => 225.,
                            "to top right" => 45.,
                            "to top left" => 315.,
                            _ => 180.,
                        },
                        &args[1..],
                    ),
                    _ => (180., &args[..]),
                };
                let rad = angle.to_radians();
                let (dx, dy) = (rad.sin(), -rad.cos());
                let len = (tw * dx).abs() + (th * dy).abs();
                let stops: Vec<_> = stop_args.iter().filter_map(|s| parse_stop(s, len)).collect();
                let stops = resolve_stops(&stops, len);
                let (cx, cy) = (gx + tw / 2., gy + th / 2.);
                let stops_svg: String = stops.iter().map(|(c, o)| c.stop(*o)).collect();
                format!(
                    r#"<linearGradient id="{id}" gradientUnits="userSpaceOnUse" x1="{}" y1="{}" x2="{}" y2="{}">{stops_svg}</linearGradient>"#,
                    cx - dx * len / 2.,
                    cy - dy * len / 2.,
                    cx + dx * len / 2.,
                    cy + dy * len / 2.
                )
            }
            "radial-gradient" => {
                let first = args.first().map(|a| a.trim().to_string()).unwrap_or_default();
                let has_shape = first.contains(" at ") || first.starts_with("at ") || first.starts_with("circle") || first.starts_with("ellipse") || first.split_whitespace().all(|t| length(t, 1.).is_some());
                let (shape, stop_args) = if has_shape && !first.starts_with('#') && !first.starts_with("rgb") && !first.starts_with("transparent") {
                    (first, &args[1..])
                } else {
                    (String::new(), &args[..])
                };
                let (size_part, at_part) = match shape.split_once("at") {
                    Some((s, a)) => (s.trim().to_string(), a.trim().to_string()),
                    None => (shape.clone(), "50% 50%".into()),
                };
                let at: Vec<&str> = at_part.split_whitespace().collect();
                let cx = gx + at.first().and_then(|v| length(v, tw)).unwrap_or(tw / 2.);
                let cy = gy + at.get(1).and_then(|v| length(v, th)).unwrap_or(th / 2.);
                let size: Vec<&str> = size_part.split_whitespace().filter(|t| *t != "circle" && *t != "ellipse").collect();
                let (rx, ry) = match (size.first().and_then(|v| length(v, tw)), size.get(1).and_then(|v| length(v, th))) {
                    (Some(x), Some(y)) => (x, y),
                    (Some(x), None) => (x, x),
                    _ => {
                        // farthest-corner
                        let fx = (cx - gx).max(gx + tw - cx);
                        let fy = (cy - gy).max(gy + th - cy);
                        if size_part.contains("circle") {
                            let r = (fx * fx + fy * fy).sqrt();
                            (r, r)
                        } else {
                            (fx * std::f32::consts::SQRT_2, fy * std::f32::consts::SQRT_2)
                        }
                    }
                };
                let stops: Vec<_> = stop_args.iter().filter_map(|s| parse_stop(s, rx)).collect();
                let stops_svg: String = resolve_stops(&stops, rx).iter().map(|(c, o)| c.stop(*o)).collect();
                let k = if rx > 0. { ry / rx } else { 1. };
                format!(
                    r#"<radialGradient id="{id}" gradientUnits="userSpaceOnUse" cx="{cx}" cy="{}" r="{rx}" gradientTransform="scale(1 {k})">{stops_svg}</radialGradient>"#,
                    cy / k.max(0.0001)
                )
            }
            _ => continue,
        };
        defs.push_str(&gradient);
        if tiled {
            defs.push_str(&format!(
                r#"<pattern id="{id}p" patternUnits="userSpaceOnUse" x="{tx}" y="{ty}" width="{tw}" height="{th}"><rect width="{tw}" height="{th}" fill="url(#{id})"/></pattern>"#
            ));
            draw.push_str(&format!(r#"<rect x="{}" y="{}" width="{}" height="{}" fill="url(#{id}p)"/>"#, area.x, area.y, area.w, area.h));
        } else {
            draw.push_str(&format!(r#"<rect x="{tx}" y="{ty}" width="{tw}" height="{th}" fill="url(#{id})"/>"#));
        }
    }
    (defs, draw)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_layers() {
        let v = split_top("radial-gradient(80% 120% at 85% 30%, rgba(200, 20, 50, 0.55), transparent 65%), linear-gradient(100deg, #120106, #3a0510 60%)");
        assert_eq!(v.len(), 2);
    }

    #[test]
    fn spreads_stops() {
        let s = resolve_stops(&[(Rgba::WHITE, vec![]), (Rgba::WHITE, vec![]), (Rgba::WHITE, vec![60.]), (Rgba::WHITE, vec![])], 100.);
        let o: Vec<f32> = s.iter().map(|(_, o)| *o).collect();
        assert_eq!(o, vec![0., 0.3, 0.6, 1.]);
    }

    #[test]
    fn every_nameplate_renders() {
        let table: serde_json::Value = serde_json::from_slice(include_bytes!("../resources/cosmetics/nameplates.json")).unwrap();
        for (id, rule) in table.as_object().unwrap() {
            let art = rule.get("art").and_then(|v| v.as_str()).unwrap_or("");
            let (defs, draw) = to_svg(art, &Box2 { x: 0., y: 0., w: 217., h: 47. }, "b");
            let svg = format!(r#"<svg xmlns="http://www.w3.org/2000/svg" width="217" height="47"><defs>{defs}</defs>{draw}</svg>"#);
            resvg::usvg::Tree::from_str(&svg, &resvg::usvg::Options::default()).unwrap_or_else(|e| panic!("{id}: {e}"));
        }
    }
}

/// A CSS background painted into a picture of `w`×`h` with `radius` corners (cached by all of it).
pub fn picture(css: &str, w: f32, h: f32, radius: f32, scale: f32) -> Option<std::sync::Arc<gpui::RenderImage>> {
    use std::cell::RefCell;
    use std::collections::HashMap;
    thread_local! {
        static CACHE: RefCell<HashMap<String, Option<std::sync::Arc<gpui::RenderImage>>>> = RefCell::new(HashMap::new());
    }
    let key = format!("{css}|{w}|{h}|{radius}|{scale}");
    if let Some(hit) = CACHE.with(|c| c.borrow().get(&key).cloned()) {
        return hit;
    }
    let paint = || -> Option<std::sync::Arc<gpui::RenderImage>> {
        let (defs, draw) = to_svg(css, &Box2 { x: 0., y: 0., w, h }, "bg");
        let svg = format!(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><defs>{defs}<clipPath id="round"><rect width="{w}" height="{h}" rx="{radius}"/></clipPath></defs><g clip-path="url(#round)">{draw}</g></svg>"#
        );
        let tree = resvg::usvg::Tree::from_str(&svg, &resvg::usvg::Options::default()).ok()?;
        let (pw, ph) = ((w * scale).ceil() as u32, (h * scale).ceil() as u32);
        let mut pixmap = resvg::tiny_skia::Pixmap::new(pw.max(1), ph.max(1))?;
        resvg::render(&tree, resvg::tiny_skia::Transform::from_scale(scale, scale), &mut pixmap.as_mut());
        let mut data = Vec::with_capacity((pw * ph * 4) as usize);
        for p in pixmap.pixels() {
            let c = p.demultiply();
            data.extend_from_slice(&[c.blue(), c.green(), c.red(), c.alpha()]);
        }
        Some(std::sync::Arc::new(gpui::RenderImage::new(vec![image::Frame::new(image::RgbaImage::from_raw(pw, ph, data)?)])))
    };
    let result = paint();
    CACHE.with(|c| c.borrow_mut().insert(key, result.clone()));
    result
}

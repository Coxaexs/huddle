//! Hoffle's UI strings, exported from the web app's catalogs (tools/export-i18n.mjs), resolved the way
//! lib/i18n.ts resolves them: the chosen locale, then its base language, then English, then the key.

use std::collections::HashMap;
use std::sync::OnceLock;

pub const LOCALES: [&str; 7] = ["en", "tr", "es", "de", "fr", "pt-BR", "nl"];

struct Catalog {
    locale: &'static str,
    strings: HashMap<String, String>,
    english: HashMap<String, String>,
}

fn load(locale: &str) -> HashMap<String, String> {
    crate::assets::ASSETS
        .iter()
        .find(|(p, _)| *p == format!("i18n/{locale}.json"))
        .and_then(|(_, bytes)| serde_json::from_slice(bytes).ok())
        .unwrap_or_default()
}

fn catalog() -> &'static Catalog {
    static CATALOG: OnceLock<Catalog> = OnceLock::new();
    CATALOG.get_or_init(|| {
        let locale = detect();
        Catalog { locale, strings: load(locale), english: load("en") }
    })
}

/// HOFFLE_LOCALE, else the system's preferred languages in order (the web reads navigator.languages).
fn detect() -> &'static str {
    let wanted: Vec<String> = std::env::var("HOFFLE_LOCALE")
        .ok()
        .into_iter()
        .chain(sys_locale::get_locales())
        .map(|l| l.replace('_', "-"))
        .collect();
    for want in &wanted {
        if let Some(exact) = LOCALES.iter().find(|l| l.eq_ignore_ascii_case(want)) {
            return exact;
        }
        let base = want.split('-').next().unwrap_or("");
        if let Some(by_base) = LOCALES.iter().find(|l| l.split('-').next() == Some(base)) {
            return by_base;
        }
    }
    "en"
}

pub fn locale() -> &'static str {
    catalog().locale
}

fn lookup(key: &str) -> Option<&'static str> {
    let c = catalog();
    c.strings.get(key).or_else(|| c.english.get(key)).filter(|s| !s.is_empty()).map(String::as_str)
}

/// The string for `key`.
pub fn t(key: &str) -> String {
    lookup(key).unwrap_or(key).to_string()
}

/// The string for `key` with `{name}` placeholders filled in. A placeholder with no value stays as it
/// is, as on the web.
pub fn tv(key: &str, vars: &[(&str, &str)]) -> String {
    fill(lookup(key).unwrap_or(key), vars)
}

/// A counted string: `key.one` / `key.other` when the catalog has them, `{count}` filled in.
pub fn tc(key: &str, count: i64, vars: &[(&str, &str)]) -> String {
    let category = if count == 1 { "one" } else { "other" };
    let template = lookup(&format!("{key}.{category}"))
        .or_else(|| lookup(&format!("{key}.other")))
        .or_else(|| lookup(key))
        .unwrap_or(key);
    let number = format_number(count);
    let mut all: Vec<(&str, &str)> = vars.to_vec();
    all.push(("count", &number));
    fill(template, &all)
}

fn fill(template: &str, vars: &[(&str, &str)]) -> String {
    let mut out = String::with_capacity(template.len());
    let mut rest = template;
    while let Some(open) = rest.find('{') {
        out.push_str(&rest[..open]);
        let after = &rest[open + 1..];
        match after.find('}') {
            Some(close) if after[..close].chars().all(|c| c.is_alphanumeric() || c == '_') => {
                let name = &after[..close];
                match vars.iter().find(|(k, _)| *k == name) {
                    Some((_, v)) => out.push_str(v),
                    None => out.push_str(&rest[open..open + close + 2]),
                }
                rest = &after[close + 1..];
            }
            _ => {
                out.push('{');
                rest = after;
            }
        }
    }
    out.push_str(rest);
    out
}

/// Intl.NumberFormat's grouping for the locales Hoffle ships: 1,234 in English, 1.234 elsewhere.
pub fn format_number(n: i64) -> String {
    let digits = n.unsigned_abs().to_string();
    if digits.len() <= 3 {
        return n.to_string();
    }
    let sep = if locale() == "en" { ',' } else { '.' };
    let mut out = String::new();
    for (i, ch) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i) % 3 == 0 {
            out.push(sep);
        }
        out.push(ch);
    }
    if n < 0 { format!("-{out}") } else { out }
}

#[cfg(test)]
mod tests {
    use super::fill;

    #[test]
    fn fills_and_keeps_unknown_placeholders() {
        assert_eq!(fill("Online — {count}", &[("count", "2")]), "Online — 2");
        assert_eq!(fill("Hi {name}, {other}", &[("name", "kiwi")]), "Hi kiwi, {other}");
        assert_eq!(fill("a {not a var} b", &[]), "a {not a var} b");
    }
}

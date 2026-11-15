//! Events (components/events-panel.tsx): the sidebar chip with the next event, and the Events panel:
//! upcoming events with RSVPs, who is coming, Join voice when it is on, add to calendar (.ics), the
//! calendar subscription links, and the form that plans or edits one.

use chrono::{DateTime, Local, TimeZone as _, Utc};
use gpui::{AnyElement, AppContext as _, Context, Entity, Focusable as _, FontWeight, Hsla, SharedString, Subscription, Window, div, prelude::*, px, rgb, rgba};
use serde_json::{Value, json};

use super::Shell;
use super::context_menu::{Confirm, ConfirmAction};
use crate::i18n::t;
use crate::input::{InputEvent, Look, TextInput};
use crate::textarea::TextArea;
use crate::theme::Theme;
use crate::ui;

pub(super) struct EventsPanel {
    server_id: String,
    subscribing: bool,
    token: Option<String>,
    copied: bool,
    error: String,
    saving: bool,
    draft: Option<Draft>,
}

struct Draft {
    id: Option<String>,
    title: Entity<TextInput>,
    starts: Entity<TextInput>,
    ends: Entity<TextInput>,
    channel: String,
    channel_open: bool,
    details: Entity<TextArea>,
    _subs: Vec<Subscription>,
}

fn parse(iso: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(iso).ok().map(|d| d.with_timezone(&Utc))
}

/// Start and end; an event without an end lasts three hours here.
fn span(event: &Value) -> Option<(DateTime<Utc>, DateTime<Utc>)> {
    let start = parse(event["startsAt"].as_str()?)?;
    let end = event["endsAt"].as_str().and_then(parse).unwrap_or(start + chrono::Duration::hours(3));
    Some((start, end))
}

/// eventWhen(): "Starts in 20m", "Happening now", "Sat, Oct 4, 8:00 PM".
pub(super) fn event_when(event: &Value) -> String {
    let Some((start, end)) = span(event) else { return String::new() };
    let now = Utc::now();
    if start <= now && now < end {
        return "Happening now".into();
    }
    if now >= end {
        return "Ended".into();
    }
    let minutes = ((start - now).num_seconds() as f64 / 60.).round() as i64;
    if minutes < 60 {
        return format!("Starts in {}m", minutes.max(1));
    }
    if minutes < 6 * 60 {
        return format!("Starts in {}h", (minutes as f64 / 60.).round() as i64);
    }
    start.with_timezone(&Local).format("%a, %b %-d, %-I:%M %p").to_string()
}

/// eventIsOpen(): from 15 minutes before until it ends.
pub(super) fn event_is_open(event: &Value) -> bool {
    let Some((start, end)) = span(event) else { return false };
    let now = Utc::now();
    now >= start - chrono::Duration::minutes(15) && now < end
}

/// What Chrome shows in an en-US datetime-local box: 11/15/2026, 09:00 PM.
fn to_local_input(iso: Option<&str>) -> String {
    iso.and_then(parse).map(|d| d.with_timezone(&Local).format("%m/%d/%Y, %I:%M %p").to_string()).unwrap_or_default()
}

/// The box's text back to an instant (the viewer's own time zone).
fn from_local_input(text: &str) -> Option<String> {
    let naive = chrono::NaiveDateTime::parse_from_str(text.trim(), "%m/%d/%Y, %I:%M %p").ok()?;
    Local.from_local_datetime(&naive).earliest().map(|d| d.with_timezone(&Utc).to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
}

/// The next whole hour.
fn next_hour() -> String {
    let next = Local::now() + chrono::Duration::hours(1);
    let whole = next.date_naive().and_hms_opt(chrono::Timelike::hour(&next), 0, 0).unwrap_or(next.naive_local());
    Local.from_local_datetime(&whole).earliest().map(|d| d.with_timezone(&Utc).to_rfc3339()).unwrap_or_default()
}

/// lib/ics.ts icsText().
fn ics_text(value: &str) -> String {
    value.replace('\\', "\\\\").replace(';', "\\;").replace(',', "\\,").replace("\r\n", "\\n").replace('\n', "\\n")
}

/// lib/ics.ts foldLine(): 75 octets, continuations after a space.
fn fold_line(line: &str) -> String {
    if line.len() <= 75 {
        return line.to_string();
    }
    let mut parts: Vec<String> = Vec::new();
    let mut current = String::new();
    for ch in line.chars() {
        let limit = if parts.is_empty() { 75 } else { 74 };
        if current.len() + ch.len_utf8() > limit {
            parts.push(std::mem::take(&mut current));
        }
        current.push(ch);
    }
    parts.push(current);
    parts.join("\r\n ")
}

fn ics_date(at: DateTime<Utc>) -> String {
    at.format("%Y%m%dT%H%M%SZ").to_string()
}

/// lib/ics.ts buildIcs() for one event; without an end it lasts an hour.
fn build_ics(event: &Value, server_name: &str, url: &str) -> String {
    let start = event["startsAt"].as_str().and_then(parse).unwrap_or_else(Utc::now);
    let end = event["endsAt"].as_str().and_then(parse).unwrap_or(start + chrono::Duration::hours(1));
    let title = event["title"].as_str().unwrap_or_default();
    let details = event["description"].as_str().unwrap_or_default();
    let description = [details.to_string(), format!("{server_name} on Hoffle: {url}")].into_iter().filter(|s| !s.is_empty()).collect::<Vec<_>>().join("\n\n");
    let lines = [
        "BEGIN:VCALENDAR".to_string(),
        "VERSION:2.0".into(),
        "PRODID:-//Hoffle//Events//EN".into(),
        "CALSCALE:GREGORIAN".into(),
        "METHOD:PUBLISH".into(),
        format!("X-WR-CALNAME:{}", ics_text(title)),
        "X-PUBLISHED-TTL:PT1H".into(),
        "REFRESH-INTERVAL;VALUE=DURATION:PT1H".into(),
        "BEGIN:VEVENT".into(),
        format!("UID:{}@hoffle", event["id"].as_str().unwrap_or_default()),
        format!("DTSTAMP:{}", ics_date(Utc::now())),
        format!("DTSTART:{}", ics_date(start)),
        format!("DTEND:{}", ics_date(end)),
        format!("SUMMARY:{}", ics_text(title)),
        format!("DESCRIPTION:{}", ics_text(&description)),
        format!("LOCATION:{}", ics_text(&format!("{server_name} · Hoffle"))),
        format!("URL:{url}"),
        "END:VEVENT".into(),
        "END:VCALENDAR".into(),
    ];
    format!("{}\r\n", lines.iter().map(|l| fold_line(l)).collect::<Vec<_>>().join("\r\n"))
}

fn enc(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
}

/// `.events-primary` / `.events-secondary` / `.events-rsvp`: 13px bold, 7×12, 8px corners.
fn ev_button(id: impl Into<SharedString>, kind: &str) -> gpui::Stateful<gpui::Div> {
    let ink: Hsla = Theme::ink().into();
    let base = div().id(id.into()).flex_none().flex().items_center().gap(px(6.)).px(px(11.)).py(px(7.)).rounded(px(8.)).border_1().text_size(px(13.)).line_height(px(19.5)).font_weight(FontWeight::BOLD).cursor_pointer();
    match kind {
        "primary" => base.border_color(gpui::transparent_black()).bg(Theme::lavender()).text_color(rgb(0x15121f)),
        "chosen" => base.border_color(Hsla::from(Theme::lavender()).opacity(0.45)).bg(Theme::lavender_soft()).text_color(ink),
        _ => base.border_color(Theme::line()).text_color(ink),
    }
}

fn icon_btn(id: impl Into<SharedString>, icon: &'static str, size: f32, danger: bool) -> gpui::Stateful<gpui::Div> {
    let muted: Hsla = Theme::muted().into();
    let hover: Hsla = if danger { rgb(0xf87171).into() } else { Theme::ink().into() };
    div()
        .id(id.into())
        .flex_none()
        .size(px(28.))
        .rounded(px(8.))
        .flex()
        .items_center()
        .justify_center()
        .cursor_pointer()
        .text_color(muted)
        .hover(move |s| s.bg(gpui::white().opacity(0.08)).text_color(hover))
        .child(gpui::svg().path(SharedString::from(format!("icons/{icon}.svg"))).size(px(size)).text_color(muted))
}

impl Shell {
    /// useServerEvents(): the open server's upcoming events, fetched once and after changes.
    pub(super) fn load_events(&self, server: &str, cx: &mut Context<Self>) {
        if !self.events_loading.borrow_mut().insert(server.to_string()) {
            return;
        }
        let path = format!("/api/events?serverId={}", enc(server));
        let client = self.client.clone();
        let server = server.to_string();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.get_value(&path) }).await;
            this.update(cx, |this, cx| {
                this.events_loading.borrow_mut().remove(&server);
                if let Ok(v) = result {
                    this.events.insert(server, v["events"].as_array().cloned().unwrap_or_default());
                    cx.notify();
                }
            })
            .ok();
        })
        .detach();
    }

    fn reload_events(&mut self, cx: &mut Context<Self>) {
        if let Some(server) = self.events_panel.as_ref().map(|p| p.server_id.clone()).or_else(|| self.server_id.clone()) {
            self.load_events(&server, cx);
        }
    }

    /// The sidebar chip: the soonest event that hasn't ended, or "Events".
    pub(super) fn render_events_chip(&self, cx: &mut Context<Self>) -> AnyElement {
        let server = self.server_id.clone().unwrap_or_default();
        if !server.is_empty() && !self.events.contains_key(&server) {
            self.load_events(&server, cx);
        }
        let list = self.events.get(&server).cloned().unwrap_or_default();
        let next = list.iter().find(|e| event_when(e) != "Ended").cloned();
        let open = next.as_ref().is_some_and(event_is_open);
        let quiet: Hsla = Theme::quiet().into();
        let ink: Hsla = Theme::ink().into();
        let mint: Hsla = Theme::mint().into();
        let text = match &next {
            Some(e) => div()
                .flex_1()
                .min_w_0()
                .flex()
                .flex_col()
                .child(div().text_size(px(13.)).line_height(px(15.6)).font_weight(FontWeight::BOLD).text_color(ink).overflow_hidden().whitespace_nowrap().text_ellipsis().child(e["title"].as_str().unwrap_or_default().to_string()))
                .child(div().text_size(px(11.)).line_height(px(13.2)).child(event_when(e))),
            None => div().flex_1().text_size(px(13.)).line_height(px(15.6)).font_weight(FontWeight::BOLD).text_color(ink).child(t("sidebar.events")),
        };
        div()
            .flex_none()
            .pb(px(5.))
            .px(px(9.))
            .child(
                div()
                    .id("events")
                    .min_h(px(34.))
                    .px(px(10.))
                    .py(px(7.))
                    .rounded(px(10.))
                    .border_1()
                    .border_color(if open { mint.opacity(0.55) } else { gpui::transparent_black() })
                    .when(open, |d| d.bg(mint.opacity(0.12)))
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .cursor_pointer()
                    .text_color(if open { ink } else { quiet })
                    .hover(|s| s.bg(Theme::hover()))
                    .child(ui::icon("calendar-days", 15., quiet))
                    .child(text)
                    .when(list.len() > 1, |d| d.child(div().flex_none().px(px(7.)).py(px(1.)).rounded_full().bg(Theme::lavender_soft()).text_size(px(11.)).line_height(px(16.5)).font_weight(FontWeight::BOLD).text_color(ink).child(list.len().to_string())))
                    .on_click(cx.listener(|this, _, _, cx| this.open_events(cx))),
            )
            .into_any_element()
    }

    pub(super) fn open_events(&mut self, cx: &mut Context<Self>) {
        let Some(server) = self.server_id.clone() else { return };
        self.load_events(&server, cx);
        self.events_panel = Some(EventsPanel { server_id: server, subscribing: false, token: None, copied: false, error: String::new(), saving: false, draft: None });
        cx.notify();
    }

    pub(super) fn dev_events_form(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.start_draft(None, window, cx);
    }

    pub(super) fn dev_events_subscribe(&mut self, cx: &mut Context<Self>) {
        self.toggle_subscribe(cx);
    }

    fn close_events(&mut self, cx: &mut Context<Self>) {
        self.events_panel = None;
        cx.notify();
    }

    fn voice_channels(&self) -> Vec<(String, String)> {
        self.server().map(|s| {
            let mut list: Vec<&crate::model::Channel> = s.channels.iter().filter(|c| c.is_voice()).collect();
            list.sort_by_key(|c| (c.category_id.is_some(), c.position));
            list.into_iter().map(|c| (c.id.clone(), c.name.clone())).collect()
        })
        .unwrap_or_default()
    }

    /// startDraft(): a blank one starting at the next whole hour, or an event to edit.
    fn start_draft(&mut self, event: Option<Value>, window: &mut Window, cx: &mut Context<Self>) {
        let look = |size: f32| Look { size, line_height: 24., height: 24., color: Theme::ink().into(), placeholder: Hsla::from(Theme::ink()).opacity(0.5) };
        let title = cx.new(|cx| TextInput::new("Game night", cx).look(look(16.)));
        let starts = cx.new(|cx| TextInput::new("mm/dd/yyyy, --:-- --", cx).look(look(16.)));
        let ends = cx.new(|cx| TextInput::new("mm/dd/yyyy, --:-- --", cx).look(look(16.)));
        let details = cx.new(|cx| TextArea::new("What are we playing? Bring snacks?", cx).text(16., 24.).min_height(72.).enter_newline().placeholder_color(Hsla::from(Theme::ink()).opacity(0.5)));
        let channel = match &event {
            Some(e) => e["channelId"].as_str().unwrap_or_default().to_string(),
            None => self.voice_channels().first().map(|c| c.0.clone()).unwrap_or_default(),
        };
        let (t0, s0, e0, d0) = match &event {
            Some(e) => (e["title"].as_str().unwrap_or_default().to_string(), to_local_input(e["startsAt"].as_str()), to_local_input(e["endsAt"].as_str()), e["description"].as_str().unwrap_or_default().to_string()),
            None => (String::new(), to_local_input(Some(&next_hour())), String::new(), String::new()),
        };
        title.update(cx, |i, cx| i.set_text(t0, cx));
        starts.update(cx, |i, cx| i.set_text(s0, cx));
        ends.update(cx, |i, cx| i.set_text(e0, cx));
        details.update(cx, |a, cx| a.set_value(d0, cx));
        let mut subs = Vec::new();
        for (input, max) in [(&title, 100usize), (&starts, 24), (&ends, 24)] {
            subs.push(cx.subscribe_in(input, window, move |this, input, event, _, cx| {
                match event {
                    InputEvent::Changed => {
                        let text = input.read(cx).text();
                        if text.chars().count() > max {
                            let cut: String = text.chars().take(max).collect();
                            input.update(cx, |i, cx| i.set_text(cut, cx));
                        }
                    }
                    InputEvent::Submit => this.save_event(cx),
                    InputEvent::Escape => this.close_events(cx),
                }
                cx.notify();
            }));
        }
        subs.push(cx.subscribe(&details, |_, _, _, cx| cx.notify()));
        window.focus(&title.focus_handle(cx));
        if let Some(p) = self.events_panel.as_mut() {
            p.error.clear();
            p.draft = Some(Draft { id: event.as_ref().and_then(|e| e["id"].as_str().map(String::from)), title, starts, ends, channel, channel_open: false, details, _subs: subs });
        }
        cx.notify();
    }

    fn save_event(&mut self, cx: &mut Context<Self>) {
        let Some(p) = self.events_panel.as_ref() else { return };
        let Some(d) = p.draft.as_ref() else { return };
        let title = d.title.read(cx).text();
        let starts = d.starts.read(cx).text();
        if p.saving || title.trim().is_empty() || starts.trim().is_empty() {
            return;
        }
        let Some(starts_at) = from_local_input(&starts) else {
            if let Some(p) = self.events_panel.as_mut() {
                p.error = "Pick a start date and time like 11/20/2026, 08:00 PM.".into();
            }
            cx.notify();
            return;
        };
        let ends = d.ends.read(cx).text();
        let ends_at = if ends.trim().is_empty() { None } else { from_local_input(&ends) };
        let body = json!({
            "serverId": p.server_id,
            "title": title,
            "description": d.details.read(cx).value(),
            "startsAt": starts_at,
            "endsAt": ends_at,
            "channelId": if d.channel.is_empty() { Value::Null } else { json!(d.channel) },
        });
        let id = d.id.clone();
        if let Some(p) = self.events_panel.as_mut() {
            p.saving = true;
            p.error.clear();
        }
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    match id {
                        Some(id) => client.settings_patch(&format!("/api/events/{}", enc(&id)), body),
                        None => client.settings_post("/api/events", body),
                    }
                })
                .await;
            this.update(cx, |this, cx| {
                if let Some(p) = this.events_panel.as_mut() {
                    p.saving = false;
                    match result {
                        Ok(_) => p.draft = None,
                        Err(e) => p.error = if e.to_string().is_empty() { "Could not save the event.".into() } else { e.to_string() },
                    }
                }
                this.reload_events(cx);
                cx.notify();
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    fn rsvp(&mut self, event: &Value, status: &'static str, cx: &mut Context<Self>) {
        let id = event["id"].as_str().unwrap_or_default().to_string();
        let next = if event["myStatus"] == status { Value::Null } else { json!(status) };
        if let Some(p) = self.events_panel.as_mut() {
            p.error.clear();
        }
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.settings_post(&format!("/api/events/{}/rsvp", enc(&id)), json!({ "status": next })) }).await;
            this.update(cx, |this, cx| {
                if let Err(e) = result
                    && let Some(p) = this.events_panel.as_mut()
                {
                    p.error = if e.to_string().is_empty() { "Could not save your answer.".into() } else { e.to_string() };
                }
                this.reload_events(cx);
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    /// The confirm's "Cancel Event".
    pub(super) fn cancel_event(&mut self, id: String, cx: &mut Context<Self>) {
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.settings_delete(&format!("/api/events/{}", enc(&id)), json!({})) }).await;
            this.update(cx, |this, cx| {
                if let Err(e) = result
                    && let Some(p) = this.events_panel.as_mut()
                {
                    p.error = if e.to_string().is_empty() { "Could not cancel it.".into() } else { e.to_string() };
                }
                this.reload_events(cx);
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    /// downloadEvent(): the .ics goes to Downloads and opens in the calendar app.
    fn download_event(&mut self, event: &Value, cx: &mut Context<Self>) {
        let server_name = self.server().map(|s| s.name.clone()).unwrap_or_else(|| "Hoffle".into());
        let url = self.client.absolute(&format!("/hangout/?server={}", enc(event["serverId"].as_str().unwrap_or_default())));
        let ics = build_ics(event, &server_name, &url);
        let title = event["title"].as_str().unwrap_or_default();
        let clean: String = title.chars().filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-' || c.is_whitespace()).collect::<String>().trim().chars().take(60).collect();
        let name = format!("{}.ics", if clean.is_empty() { "event".to_string() } else { clean });
        let dir = std::env::var("HOME").map(|h| std::path::PathBuf::from(h).join("Downloads")).unwrap_or_else(|_| std::env::temp_dir());
        let path = dir.join(name);
        match std::fs::write(&path, ics) {
            Ok(()) => {
                let _ = std::process::Command::new("open").arg(&path).spawn();
            }
            Err(e) => {
                if let Some(p) = self.events_panel.as_mut() {
                    p.error = e.to_string();
                }
            }
        }
        cx.notify();
    }

    fn toggle_subscribe(&mut self, cx: &mut Context<Self>) {
        let Some(p) = self.events_panel.as_mut() else { return };
        p.subscribing = !p.subscribing;
        if p.subscribing && p.token.is_none() {
            self.fetch_calendar_token(false, cx);
        }
        cx.notify();
    }

    fn fetch_calendar_token(&mut self, reset: bool, cx: &mut Context<Self>) {
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move { if reset { client.settings_post("/api/events/calendar", json!({ "reset": true })) } else { client.get_value("/api/events/calendar") } })
                .await;
            this.update(cx, |this, cx| {
                if let Some(p) = this.events_panel.as_mut() {
                    match result {
                        Ok(v) => p.token = v["token"].as_str().map(String::from),
                        Err(e) => p.error = if reset { "Could not reset the link.".into() } else if e.to_string().is_empty() { "Could not make your calendar link.".into() } else { e.to_string() },
                    }
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    /// calendarLinks(): webcal://, https:// and Google's add-by-URL.
    fn calendar_links(&self, token: &str) -> (String, String, String) {
        let https = self.client.absolute(&format!("/hangout/api/events/calendar/{token}.ics"));
        let webcal = format!("webcal://{}", https.split_once("://").map(|(_, rest)| rest).unwrap_or(&https));
        let google = format!("https://calendar.google.com/calendar/r?cid={}", url::form_urlencoded::byte_serialize(webcal.as_bytes()).collect::<String>());
        (https, webcal, google)
    }

    pub(super) fn render_events(&self, window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let p = self.events_panel.as_ref()?;
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let lavender: Hsla = Theme::lavender().into();
        let mint: Hsla = Theme::mint().into();
        let events = self.events.get(&p.server_id).cloned().unwrap_or_default();
        let voice = self.voice_channels();
        // MANAGE_SERVER (1 << 3) or MANAGE_CHANNELS (1 << 1), as lib/permissions.ts.
        let can_manage = self.has_permission(1 << 3) || self.has_permission(1 << 1);

        let mut head_actions = div().flex().items_center().gap(px(8.));
        if p.draft.is_none() {
            head_actions = head_actions
                .child(ev_button("ev-subscribe", if p.subscribing { "chosen" } else { "secondary" }).child(ui::icon("calendar-plus", 14., ink)).child("Subscribe").on_click(cx.listener(|this, _, _, cx| this.toggle_subscribe(cx))))
                .child(ev_button("ev-new", "primary").child(ui::icon("plus", 14., rgb(0x15121f))).child("New event").on_click(cx.listener(|this, _, window, cx| this.start_draft(None, window, cx))));
        }
        head_actions = head_actions.child(icon_btn("ev-close", "x", 16., false).on_click(cx.listener(|this, _, _, cx| this.close_events(cx))));
        let head = div()
            .flex_none()
            .flex()
            .items_center()
            .justify_between()
            .gap(px(12.))
            .px(px(18.))
            .py(px(14.))
            .border_b_1()
            .border_color(Theme::line())
            .child(div().flex().items_center().gap(px(8.)).text_size(px(16.)).line_height(px(24.)).text_color(ink).child(ui::icon("calendar-days", 18., ink)).child("Events"))
            .child(head_actions);

        let mut panel = div()
            .id("events-panel")
            .w(px(560.))
            .max_h(px((f32::from(window.viewport_size().height) * 0.88).min(720.)))
            .flex()
            .flex_col()
            .bg(Theme::panel())
            .text_color(ink)
            .border_1()
            .border_color(Theme::line())
            .rounded(px(16.))
            .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.5), offset: gpui::point(px(0.), px(24.)), blur_radius: px(60.), spread_radius: px(0.) }])
            .overflow_hidden()
            .on_mouse_down(gpui::MouseButton::Left, |_, _, cx| cx.stop_propagation())
            .child(head);

        if !p.error.is_empty() {
            panel = panel.child(div().mx(px(18.)).mt(px(10.)).text_size(px(13.)).line_height(px(19.5)).text_color(rgb(0xf87171)).child(p.error.clone()));
        }

        if p.subscribing && p.draft.is_none() {
            panel = panel.child(match &p.token {
                None => div().mx(px(16.)).mb(px(6.)).into_any_element(),
                Some(token) => {
                    let (https, webcal, google) = self.calendar_links(token);
                    let link_btn = |id: &'static str| div().id(id).flex().items_center().gap(px(6.)).px(px(11.)).py(px(7.)).rounded(px(8.)).bg(Theme::paper()).border_1().border_color(Theme::line()).text_size(px(13.)).line_height(px(18.85)).font_weight(FontWeight::BOLD).text_color(ink).cursor_pointer();
                    let copied = p.copied;
                    div()
                        .flex_none()
                        .mx(px(16.))
                        .mb(px(6.))
                        .px(px(16.))
                        .py(px(14.))
                        .rounded(px(12.))
                        .bg(Theme::lavender_soft())
                        .flex()
                        .flex_col()
                        .gap(px(10.))
                        .text_size(px(13.5))
                        .line_height(px(19.575))
                        .child("See every event from all your servers in your own calendar. New ones show up there by themselves.")
                        .child(
                            div()
                                .flex()
                                .flex_wrap()
                                .gap(px(8.))
                                .child(link_btn("ev-google").child("Google Calendar").on_click(cx.listener(move |_, _, _, cx| cx.open_url(&google))))
                                .child(link_btn("ev-webcal").child("Apple / Outlook").on_click(cx.listener(move |_, _, _, cx| cx.open_url(&webcal))))
                                .child(link_btn("ev-copy").child(ui::icon(if copied { "check" } else { "copy" }, 13., ink)).child(if copied { "Copied" } else { "Copy link" }).on_click(cx.listener(move |this, _, _, cx| {
                                    cx.write_to_clipboard(gpui::ClipboardItem::new_string(https.clone()));
                                    if let Some(p) = this.events_panel.as_mut() {
                                        p.copied = true;
                                    }
                                    cx.spawn(async move |this, cx| {
                                        cx.background_executor().timer(std::time::Duration::from_millis(1800)).await;
                                        this.update(cx, |this, cx| {
                                            if let Some(p) = this.events_panel.as_mut() {
                                                p.copied = false;
                                            }
                                            cx.notify();
                                        })
                                        .ok();
                                    })
                                    .detach();
                                    cx.notify();
                                }))),
                        )
                        .child(
                            div()
                                .flex()
                                .flex_wrap()
                                .items_center()
                                .text_size(px(12.))
                                .line_height(px(17.4))
                                .text_color(muted)
                                .child("Anyone with this link can see your events' names and times.\u{a0}")
                                .child(
                                    div()
                                        .id("ev-reset")
                                        .flex()
                                        .items_center()
                                        .gap(px(4.))
                                        .font_weight(FontWeight::SEMIBOLD)
                                        .text_color(lavender)
                                        .cursor_pointer()
                                        .child(ui::icon("refresh-cw", 11., lavender))
                                        .child("Reset link")
                                        .on_click(cx.listener(|this, _, _, cx| this.fetch_calendar_token(true, cx))),
                                ),
                        )
                        .into_any_element()
                }
            });
        }

        if let Some(d) = p.draft.as_ref() {
            // In the two-column row the labels stay inline: no margins, one 24px line above the box.
            let inline_label = |text: &str| div().h(px(24.)).pt(px(5.)).text_size(px(11.)).line_height(px(16.5)).font_weight(FontWeight::EXTRA_BOLD).text_color(rgb(0xc9cad2)).child(text.to_uppercase());
            let label = |text: &str| div().mt(px(14.)).mb(px(6.)).text_size(px(11.)).line_height(px(16.5)).font_weight(FontWeight::EXTRA_BOLD).text_color(rgb(0xc9cad2)).child(text.to_uppercase());
            let field = |input: &Entity<TextInput>, focused: bool| {
                div()
                    .h(px(44.))
                    .px(px(12.))
                    .rounded(px(10.))
                    .bg(rgb(0x120f1c))
                    .border_1()
                    .border_color(if focused { lavender } else { Theme::line().into() })
                    .when(focused, |d| d.shadow(vec![gpui::BoxShadow { color: lavender.opacity(0.32), offset: gpui::point(px(0.), px(0.)), blur_radius: px(0.), spread_radius: px(3.) }]))
                    .flex()
                    .items_center()
                    .child(div().flex_1().min_w_0().child(input.clone()))
            };
            let focused = |input: &Entity<TextInput>| input.focus_handle(cx).is_focused(window);
            let date_field = |input: &Entity<TextInput>| field(input, focused(input)).gap(px(8.)).child(ui::icon("calendar", 16., ink));
            let channel_name = voice.iter().find(|c| c.0 == d.channel).map(|c| c.1.clone()).unwrap_or_else(|| "None".into());
            let mut select = div().relative().child(
                div()
                    .id("ev-channel")
                    .h(px(42.))
                    .px(px(16.))
                    .rounded(px(10.))
                    .bg(rgb(0x120f1c))
                    .border_1()
                    .border_color(if d.channel_open { lavender } else { Theme::line().into() })
                    .flex()
                    .items_center()
                    .justify_between()
                    .text_size(px(16.))
                    .cursor_pointer()
                    .child(channel_name)
                    .child(ui::icon("chevron-down", 14., ink))
                    .on_click(cx.listener(|this, _, _, cx| {
                        if let Some(d) = this.events_panel.as_mut().and_then(|p| p.draft.as_mut()) {
                            d.channel_open = !d.channel_open;
                        }
                        cx.notify();
                    })),
            );
            if d.channel_open {
                let mut menu = div().absolute().top(px(44.)).left_0().right_0().max_h(px(240.)).p(px(4.)).rounded(px(8.)).bg(Theme::panel()).border_1().border_color(Theme::line()).shadow(ui::card_shadow()).flex().flex_col();
                let mut options = vec![(String::new(), "None".to_string())];
                options.extend(voice.iter().cloned());
                for (n, (id, name)) in options.into_iter().enumerate() {
                    menu = menu.child(div().id(SharedString::from(format!("ev-ch-{n}"))).px(px(10.)).py(px(5.)).rounded(px(6.)).text_size(px(15.)).cursor_pointer().hover(|s| s.bg(gpui::white().opacity(0.08))).child(name).on_click(cx.listener(move |this, _, _, cx| {
                        if let Some(d) = this.events_panel.as_mut().and_then(|p| p.draft.as_mut()) {
                            d.channel = id.clone();
                            d.channel_open = false;
                        }
                        cx.notify();
                    })));
                }
                select = select.child(gpui::deferred(menu).with_priority(4));
            }
            let ok = !p.saving && !d.title.read(cx).text().trim().is_empty() && !d.starts.read(cx).text().trim().is_empty();
            let editing = d.id.is_some();
            panel = panel.child(
                div()
                    .id("events-form")
                    .flex()
                    .flex_col()
                    .px(px(18.))
                    .pt(px(6.))
                    .pb(px(18.))
                    .overflow_y_scroll()
                    .child(label("Name"))
                    .child(field(&d.title, focused(&d.title)))
                    .child(
                        div()
                            .flex()
                            .gap(px(12.))
                            .child(div().flex_1().min_w_0().child(inline_label("Starts")).child(date_field(&d.starts)))
                            .child(div().flex_1().min_w_0().child(inline_label("Ends (optional)")).child(date_field(&d.ends))),
                    )
                    .child(label("Voice channel"))
                    .child(select)
                    .child(label("Details (optional)"))
                    .child(div().px(px(12.)).py(px(9.)).rounded(px(10.)).bg(rgb(0x120f1c)).border_1().border_color(Theme::line()).child(d.details.clone()))
                    .child(
                        div()
                            .mt(px(16.))
                            .flex()
                            .justify_end()
                            .gap(px(8.))
                            .child(ev_button("ev-cancel", "secondary").child("Cancel").on_click(cx.listener(|this, _, _, cx| {
                                if let Some(p) = this.events_panel.as_mut() {
                                    p.draft = None;
                                }
                                cx.notify();
                            })))
                            .child(
                                ev_button("ev-save", "primary")
                                    .child(if p.saving { "Saving…" } else if editing { "Save changes" } else { "Create event" })
                                    .when(!ok, |b| ui::faded(b, lavender, rgb(0x15121f), Theme::panel()).opacity(1.).cursor_default())
                                    .when(ok, |b| b.on_click(cx.listener(|this, _, _, cx| this.save_event(cx)))),
                            ),
                    ),
            );
        } else if events.is_empty() {
            panel = panel.child(
                div()
                    .flex()
                    .flex_col()
                    .items_center()
                    .gap(px(6.))
                    .px(px(24.))
                    .py(px(40.))
                    .text_color(muted)
                    .child(ui::icon("calendar-days", 36., muted))
                    .child(div().text_size(px(16.)).line_height(px(24.)).child("Nothing planned yet."))
                    .child(div().text_center().text_size(px(12.)).line_height(px(18.)).child("Schedule a game night and everyone who says they're going gets a reminder 15 minutes before.")),
            );
        } else {
            let mut list = div().id("events-list").flex().flex_col().gap(px(12.)).px(px(18.)).pt(px(12.)).pb(px(18.)).overflow_y_scroll();
            for event in events {
                let open = event_is_open(&event);
                let id = event["id"].as_str().unwrap_or_default().to_string();
                let title = event["title"].as_str().unwrap_or_default().to_string();
                let mine = event["createdBy"] == self.me.id.as_str() || can_manage;
                let when_color: Hsla = if open { mint } else { lavender };
                let mut tools = div().flex().gap(px(2.));
                let ev1 = event.clone();
                tools = tools.child(icon_btn(SharedString::from(format!("ev-dl-{id}")), "download", 13., false).on_click(cx.listener(move |this, _, _, cx| this.download_event(&ev1, cx))));
                if mine {
                    let ev2 = event.clone();
                    let (id3, title3) = (id.clone(), title.clone());
                    tools = tools
                        .child(icon_btn(SharedString::from(format!("ev-edit-{id}")), "pencil", 13., false).on_click(cx.listener(move |this, _, window, cx| this.start_draft(Some(ev2.clone()), window, cx))))
                        .child(icon_btn(SharedString::from(format!("ev-del-{id}")), "trash-2", 13., true).on_click(cx.listener(move |this, _, _, cx| {
                            this.confirm = Some(Confirm {
                                title: format!("Cancel \"{title3}\"?"),
                                text: "It will be removed for everyone, along with the RSVPs.".into(),
                                ok: "Cancel Event".into(),
                                cancel: t("common.cancel"),
                                action: ConfirmAction::CancelEvent(id3.clone()),
                            });
                            cx.notify();
                        })));
                }
                let start_long = event["startsAt"].as_str().and_then(parse).map(|d| d.with_timezone(&Local).format("%A, %b %-d, %-I:%M %p").to_string()).unwrap_or_default();
                let room = event["channelId"].as_str().and_then(|c| voice.iter().find(|v| v.0 == c)).cloned();
                // The web's flex items: date, "·", icon, room, "· by", creator.
                let mut meta = div().flex().flex_wrap().items_center().gap(px(4.)).text_size(px(12.)).line_height(px(18.)).text_color(muted).child(start_long);
                if let Some((_, name)) = &room {
                    meta = meta.child("·").child(ui::icon("volume-2", 12., muted)).child(name.clone());
                }
                meta = meta.child("· by");
                meta = meta.child(event["creatorName"].as_str().unwrap_or_default().to_string());
                let mut card = div()
                    .flex_none()
                    .px(px(13.))
                    .py(px(11.))
                    .rounded(px(12.))
                    .border_1()
                    .border_color(if open { mint.opacity(0.55) } else { Theme::line().into() })
                    .bg(rgba(0x0000002e))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .child(div().flex().items_center().gap(px(5.)).text_size(px(11.)).line_height(px(16.5)).font_weight(FontWeight::EXTRA_BOLD).text_color(when_color).child(ui::icon("clock", 12., when_color)).child(div().child(event_when(&event).to_uppercase())))
                            .child(tools),
                    )
                    .child(div().mt(px(4.)).mb(px(2.)).text_size(px(16.)).line_height(px(24.)).child(title.clone()))
                    .child(meta);
                if let Some(desc) = event["description"].as_str().filter(|d| !d.is_empty()) {
                    card = card.child(div().mt(px(8.)).text_size(px(13.)).line_height(px(18.85)).child(desc.to_string()));
                }
                let attendees = event["attendees"].as_array().cloned().unwrap_or_default();
                if !attendees.is_empty() {
                    let mut row = div().mt(px(10.)).flex().flex_wrap().items_center().gap(px(4.));
                    for person in attendees.iter().take(12) {
                        let picture = person["avatarUrl"].as_str().map(|u| self.client.absolute(u));
                        row = row.child(
                            div()
                                .rounded_full()
                                .border_2()
                                .border_color(Theme::panel())
                                .m(px(-2.))
                                .when(person["status"] == "maybe", |d| d.opacity(0.6))
                                .child(ui::avatar(picture, person["avatar"].as_str().unwrap_or_default(), person["color"].as_str().unwrap_or_default(), person["displayName"].as_str().unwrap_or_default(), 24.)),
                        );
                    }
                    let going = event["counts"]["going"].as_i64().unwrap_or(0);
                    let maybe = event["counts"]["maybe"].as_i64().unwrap_or(0);
                    row = row.child(div().ml(px(6.)).text_size(px(12.)).line_height(px(18.)).text_color(muted).child(format!("{going} going{}", if maybe > 0 { format!(" · {maybe} maybe") } else { String::new() })));
                    card = card.child(row);
                }
                let mut actions = div().mt(px(12.)).flex().flex_wrap().gap(px(6.));
                for (status, label, icon) in [("going", "Going", "check"), ("maybe", "Maybe", "circle-help"), ("no", "Can't", "x")] {
                    let chosen = event["myStatus"] == status;
                    let (bg, border): (Hsla, Hsla) = match (status, chosen) {
                        ("going", true) => (mint.opacity(0.22), mint),
                        ("maybe", true) => (rgba(0xfbbf242e).into(), rgb(0xfbbf24).into()),
                        ("no", true) => (rgba(0xf8717129).into(), rgb(0xf87171).into()),
                        _ => (gpui::white().opacity(0.05), Theme::line().into()),
                    };
                    let ev = event.clone();
                    actions = actions.child(
                        div()
                            .id(SharedString::from(format!("ev-{status}-{id}")))
                            .flex()
                            .items_center()
                            .gap(px(6.))
                            .px(px(11.))
                            .py(px(7.))
                            .rounded(px(8.))
                            .border_1()
                            .border_color(border)
                            .bg(bg)
                            .text_size(px(13.))
                            .line_height(px(19.5))
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(ink)
                            .cursor_pointer()
                            .when(!chosen, |d| d.hover(|s| s.bg(gpui::white().opacity(0.09))))
                            .child(ui::icon(icon, 13., ink))
                            .child(label)
                            .on_click(cx.listener(move |this, _, _, cx| this.rsvp(&ev, status, cx))),
                    );
                }
                if open && let Some((room_id, _)) = room {
                    actions = actions.child(div().flex_1()).child(ev_button(SharedString::from(format!("ev-join-{id}")), "primary").child(ui::icon("volume-2", 13., rgb(0x15121f))).child("Join voice").on_click(cx.listener(move |this, _, window, cx| {
                        this.events_panel = None;
                        this.open_stage(room_id.clone(), window, cx);
                    })));
                }
                list = list.child(card.child(actions));
            }
            panel = panel.child(list);
        }

        Some(
            div()
                .id("events-backdrop")
                .absolute()
                .inset_0()
                .bg(rgba(0x000000bf))
                .flex()
                .items_center()
                .justify_center()
                .on_mouse_down(gpui::MouseButton::Left, cx.listener(|this, _, _, cx| this.close_events(cx)))
                .child(panel)
                .into_any_element(),
        )
    }
}

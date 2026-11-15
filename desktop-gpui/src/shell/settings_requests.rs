//! Settings → Ideas & Bug Reports (app/components/requests-tab.tsx): send kiwi and flo a feature
//! request, bug report, improvement or anything else; see your own; the staff inbox for them.

use gpui::{AnyElement, Context, Entity, FontWeight, Hsla, SharedString, Window, div, prelude::*, px, rgb, rgba};
use serde::Deserialize;
use serde_json::{Value, json};

use super::Shell;
use crate::input::{InputEvent, Look, TextInput};
use crate::textarea::{AreaEvent, TextArea};
use crate::ui;

const KIWI: &str = "b4203f0e-38a7-43f1-b1b5-374116afb49d";
const FLO: &str = "ac9e8e27-6cd9-4df1-af7a-afd85a59caa0";

/// id, label, icon, description, colour.
const CATEGORIES: [(&str, &str, &str, &str, u32); 4] = [
    ("feature", "Feature Request", "lightbulb", "Suggest a brand new idea or feature", 0x38bdf8),
    ("bug", "Bug Report", "bug", "Report an issue, glitch, or unexpected behavior", 0xf87171),
    ("improvement", "Improvement", "zap", "Enhance or polish an existing part of Hoffle", 0xfbbf24),
    ("other", "General Request", "message-square", "Feedback, questions, or general suggestions", 0xa78bfa),
];

/// status, label, icon, (background, text, border) as Tailwind's 500/15, 300, 500/30.
const STATUSES: [(&str, &str, &str, u32, u32); 4] = [
    ("pending", "Pending", "clock", 0xf59e0b, 0xfcd34d),
    ("in_progress", "In Progress", "zap", 0x0ea5e9, 0x7dd3fc),
    ("completed", "Completed", "circle-check", 0x10b981, 0x6ee7b7),
    ("declined", "Declined", "circle-x", 0xf43f5e, 0xfda4af),
];

const GRAY3: u32 = 0xd1d5db;
const GRAY4: u32 = 0x9ca3af;
const GRAY5: u32 = 0x6b7280;
const EMERALD6: u32 = 0x059669;

#[derive(Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct Author {
    id: String,
    username: String,
    display_name: String,
    avatar: String,
    avatar_url: Option<String>,
    color: String,
}

#[derive(Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub(super) struct Request {
    id: String,
    category: String,
    status: String,
    title: String,
    details: String,
    response_note: Option<String>,
    created_at: String,
    user: Option<Author>,
}

pub(super) struct Requests {
    subtab: &'static str,
    list: Vec<Request>,
    is_handler: bool,
    loading: bool,
    category: &'static str,
    title: Entity<TextInput>,
    details: Entity<TextArea>,
    search: Entity<TextInput>,
    note: Entity<TextArea>,
    submitting: bool,
    success: Option<String>,
    error: Option<String>,
    filter: &'static str,
    editing_note: Option<String>,
    updating: Option<String>,
    _subs: Vec<gpui::Subscription>,
}

/// formatDate: "Nov 14, 03:45 PM", with the year when it is not this year's.
fn when(iso: &str) -> String {
    let Some(at) = crate::model::parse_time(iso) else { return iso.to_string() };
    let local = at.with_timezone(&chrono::Local);
    if chrono::Datelike::year(&local) == chrono::Datelike::year(&chrono::Local::now()) {
        local.format("%b %-d, %I:%M %p").to_string()
    } else {
        local.format("%b %-d, %Y, %I:%M %p").to_string()
    }
}

impl Shell {
    pub(super) fn new_requests(&mut self, window: &mut Window, cx: &mut Context<Self>) -> Requests {
        let field = |placeholder: &str, size: f32, cx: &mut Context<Self>| {
            cx.new(|cx| {
                TextInput::new(placeholder.to_string(), cx).look(Look { size, line_height: 20., height: 20., color: gpui::white().into(), placeholder: rgb(GRAY5).into() })
            })
        };
        let title = field("e.g. Add custom soundboard, Discord server sync, Fix mic gate...", 14., cx);
        let search = field("Search requests by title, text, or author...", 12., cx);
        let details = cx.new(|cx| {
            TextArea::new("Explain your idea, what you'd like it to do, or any helpful context. The more details you share, the better!", cx)
                .text(14., 20.)
                .min_height(100.)
                .max_lines(12)
                .enter_newline()
                .color(gpui::white())
                .placeholder_color(rgb(GRAY5))
        });
        let note = cx.new(|cx| {
            TextArea::new("e.g. Added in current release! / Working on this right now.", cx).text(12., 16.).min_height(32.).max_lines(6).enter_newline().color(gpui::white()).placeholder_color(rgb(GRAY5))
        });
        let subs = vec![
            cx.subscribe_in(&title, window, |this, input, event, window, cx| match event {
                InputEvent::Escape => this.close_settings(window, cx),
                _ => {
                    // maxLength 150.
                    let text = input.read(cx).text();
                    if text.chars().count() > 150 {
                        let cut: String = text.chars().take(150).collect();
                        input.update(cx, |i, cx| i.set_text(cut, cx));
                    }
                    cx.notify();
                }
            }),
            cx.subscribe_in(&search, window, |this, _, event, window, cx| match event {
                InputEvent::Escape => this.close_settings(window, cx),
                _ => cx.notify(),
            }),
            cx.subscribe_in(&details, window, |_, area, event, _, cx| {
                if matches!(event, AreaEvent::Changed) {
                    // maxLength 4000.
                    let text = area.read(cx).value();
                    if text.chars().count() > 4000 {
                        let cut: String = text.chars().take(4000).collect();
                        area.update(cx, |a, cx| a.set_value(cut, cx));
                    }
                    cx.notify();
                }
            }),
            cx.subscribe_in(&note, window, |_, _, _, _, cx| cx.notify()),
        ];
        Requests {
            subtab: "submit",
            list: Vec::new(),
            is_handler: false,
            loading: true,
            category: "feature",
            title,
            details,
            search,
            note,
            submitting: false,
            success: None,
            error: None,
            filter: "all",
            editing_note: None,
            updating: None,
            _subs: subs,
        }
    }

    /// loadRequests: yours, or every request for the staff inbox.
    pub(super) fn load_requests(&mut self, cx: &mut Context<Self>) {
        let Some(r) = self.settings.as_mut().map(|s| &mut s.requests) else { return };
        r.loading = true;
        let path = if r.subtab == "inbox" { "/api/requests?all=true" } else { "/api/requests" };
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.settings_get(path) }).await;
            this.update(cx, |this, cx| {
                let Some(r) = this.settings.as_mut().map(|s| &mut s.requests) else { return };
                r.loading = false;
                if let Ok(v) = result {
                    r.list = serde_json::from_value(v.get("requests").cloned().unwrap_or(Value::Null)).unwrap_or_default();
                    r.is_handler = v.get("isHandler").and_then(Value::as_bool).unwrap_or(false);
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    fn requests_subtab(&mut self, tab: &'static str, cx: &mut Context<Self>) {
        if let Some(s) = self.settings.as_mut() {
            s.requests.subtab = tab;
        }
        self.load_requests(cx);
    }

    fn submit_request(&mut self, cx: &mut Context<Self>) {
        let Some(r) = self.settings.as_mut().map(|s| &mut s.requests) else { return };
        let title = r.title.read(cx).text().trim().to_string();
        let details = r.details.read(cx).value().trim().to_string();
        if title.is_empty() {
            r.error = Some("Please provide a title for your request.".into());
            return cx.notify();
        }
        if details.is_empty() {
            r.error = Some("Please include some details describing your request.".into());
            return cx.notify();
        }
        r.submitting = true;
        r.error = None;
        r.success = None;
        let category = r.category;
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.settings_post("/api/requests", json!({ "category": category, "title": title, "details": details })) }).await;
            this.update(cx, |this, cx| {
                let Some(r) = this.settings.as_mut().map(|s| &mut s.requests) else { return };
                r.submitting = false;
                match result {
                    Ok(v) => {
                        let to: Vec<String> = v.get("deliveredTo").and_then(Value::as_array).map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect()).unwrap_or_default();
                        let recipients = if to.is_empty() { "Delivered to kiwi and flo via DM!".to_string() } else { format!("Delivered directly to {} via DM!", to.join(" and ")) };
                        r.success = Some(format!("Your request was sent successfully! {recipients}"));
                        r.title.update(cx, |i, cx| i.set_text(String::new(), cx));
                        r.details.update(cx, |a, cx| a.set_value("", cx));
                        this.load_requests(cx);
                    }
                    Err(e) => r.error = Some(if e.to_string().is_empty() { "Failed to send request.".into() } else { e.to_string() }),
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    /// PATCH a request's status or note; DELETE it.
    fn change_request(&mut self, id: String, body: Option<Value>, cx: &mut Context<Self>) {
        if let Some(r) = self.settings.as_mut().map(|s| &mut s.requests) {
            r.updating = Some(id.clone());
        }
        let client = self.client.clone();
        let path = format!("/api/requests/{id}");
        let delete = body.is_none();
        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move { if let Some(body) = body { client.settings_patch(&path, body) } else { client.settings_delete(&path, Value::Null) } })
                .await;
            this.update(cx, |this, cx| {
                let Some(r) = this.settings.as_mut().map(|s| &mut s.requests) else { return };
                r.updating = None;
                if let Ok(v) = result {
                    if delete {
                        r.list.retain(|q| q.id != id);
                    } else if let Some(updated) = v.get("request").and_then(|q| serde_json::from_value::<Request>(q.clone()).ok())
                        && let Some(q) = r.list.iter_mut().find(|q| q.id == id)
                    {
                        q.status = updated.status;
                        q.response_note = updated.response_note;
                        r.editing_note = None;
                    }
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    fn open_dm_from_settings(&mut self, id: &str, window: &mut Window, cx: &mut Context<Self>) {
        self.close_settings(window, cx);
        self.open_dm_with(id.to_string(), cx);
    }

    pub(super) fn render_requests_page(&self, r: &Requests, window: &Window, cx: &mut Context<Self>) -> Vec<AnyElement> {
        let white: Hsla = gpui::white().into();
        let line: Hsla = white.opacity(0.1);
        let scale = window.scale_factor();
        let pill = |icon: &'static str, label: String, bg: Hsla, fg: Hsla, border: Hsla| {
            div().flex().items_center().gap(px(4.)).px(px(8.)).py(px(2.)).rounded_full().bg(bg).border_1().border_color(border).text_size(px(11.)).line_height(px(16.5)).font_weight(FontWeight::MEDIUM).text_color(fg).child(ui::icon(icon, 12., fg)).child(label)
        };
        let category_pill = |id: &str| {
            let (_, label, icon, _, color) = CATEGORIES.iter().find(|c| c.0 == id).copied().unwrap_or(CATEGORIES[0]);
            let c: Hsla = rgb(color).into();
            pill(icon, label.into(), c.opacity(0.08), c, c.opacity(0.19))
        };
        let status_pill = |id: &str| {
            let (_, label, icon, base, text) = STATUSES.iter().find(|s| s.0 == id).copied().unwrap_or(STATUSES[0]);
            let b: Hsla = rgb(base).into();
            pill(icon, label.into(), b.opacity(0.15), rgb(text).into(), b.opacity(0.3))
        };
        let small_button = |id: SharedString, icon: Option<&'static str>, label: String| {
            div().id(id).flex().items_center().gap(px(6.)).px(px(12.)).py(px(6.)).rounded(px(8.)).bg(white.opacity(0.05)).hover(|s| s.bg(gpui::white().opacity(0.1))).border_1().border_color(line).text_size(px(12.)).line_height(px(16.)).font_weight(FontWeight::MEDIUM).text_color(rgb(0xe5e7eb)).cursor_pointer().children(icon.map(|i| ui::icon(i, 13., rgb(0xc084fc)))).child(label)
        };
        let mut out = Vec::new();

        // The banner.
        out.push(
            div()
                .relative()
                .flex_none()
                .p(px(20.))
                .rounded(px(12.))
                .border_1()
                .border_color(line)
                .overflow_hidden()
                .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.1), offset: gpui::point(px(0.), px(10.)), blur_radius: px(15.), spread_radius: px(-3.) }])
                .children(
                    crate::cssbg::picture("linear-gradient(90deg, rgba(2, 44, 34, 0.4) 0%, rgba(59, 7, 100, 0.3) 50%, rgba(23, 37, 84, 0.4) 100%)", 766., 117., 0., scale)
                        .map(|bg| gpui::img(gpui::ImageSource::Render(bg)).absolute().top_0().left_0().w(px(766.)).h(px(117.))),
                )
                .child(
                    div()
                        .relative()
                        .flex()
                        .items_center()
                        .justify_between()
                        .gap(px(16.))
                        .child(
                            div()
                                .flex_1()
                                .min_w_0()
                                .flex()
                                .flex_col()
                                .child(
                                    div()
                                        .flex()
                                        .items_center()
                                        .gap(px(8.))
                                        .child(div().size(px(32.)).rounded(px(8.)).bg(Hsla::from(rgb(0x10b981)).opacity(0.2)).border_1().border_color(Hsla::from(rgb(0x10b981)).opacity(0.3)).flex().items_center().justify_center().child(ui::icon("sparkles", 18., rgb(0x34d399))))
                                        .child(div().text_size(px(20.)).line_height(px(28.)).font_weight(FontWeight::BOLD).text_color(white).child("Make a Request")),
                                )
                                .child({
                                    // One paragraph, the two names bold and coloured inside it.
                                    let lead = "Have an idea, found a bug, or want a feature added? Submit it here. Every request is automatically delivered straight to ";
                                    let text = format!("{lead}kiwi and flo (@..) in their direct messages!");
                                    let kiwi = lead.len()..lead.len() + 4;
                                    let flo = kiwi.end + 5..kiwi.end + 8;
                                    let bold = |c: u32| gpui::HighlightStyle { color: Some(rgb(c).into()), font_weight: Some(FontWeight::BOLD), ..Default::default() };
                                    div()
                                        .mt(px(6.))
                                        .max_w(px(576.))
                                        .text_size(px(12.))
                                        .line_height(px(19.5))
                                        .text_color(rgb(GRAY3))
                                        .child(gpui::StyledText::new(text).with_highlights(vec![(kiwi, bold(0x34d399)), (flo, bold(0xc084fc))]))
                                }),
                        )
                        .child(
                            div()
                                .flex_none()
                                .flex()
                                .gap(px(8.))
                                .child(small_button("req-dm-kiwi".into(), None, "🥝 DM Kiwi".into()).tooltip(ui::tooltip("Open direct message with kiwi")).on_click(cx.listener(|this, _, window, cx| this.open_dm_from_settings(KIWI, window, cx))))
                                .child(
                                    small_button("req-dm-flo".into(), None, "Flo (@..)".into())
                                        .child(ui::icon("message-circle", 13., rgb(0xc084fc)))
                                        .tooltip(ui::tooltip("Open direct message with flo"))
                                        .on_click(cx.listener(|this, _, window, cx| this.open_dm_from_settings(FLO, window, cx))),
                                ),
                        ),
                )
                .into_any_element(),
        );

        // Sub-tabs.
        let pending = r.list.iter().filter(|q| q.status == "pending").count();
        let tab = |id: &'static str, icon: &'static str, label: &'static str, cx: &mut Context<Self>| {
            let active = r.subtab == id;
            div()
                .id(SharedString::from(format!("req-tab-{id}")))
                .flex()
                .items_center()
                .gap(px(8.))
                .px(px(14.))
                .py(px(8.))
                .rounded(px(8.))
                .when(active, |d| d.bg(rgb(if id == "inbox" { 0x9333ea } else { EMERALD6 })))
                .when(!active, |d| d.hover(|s| s.bg(gpui::white().opacity(0.05))))
                .text_size(px(12.))
                .line_height(px(16.))
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(if active { white } else { rgb(if id == "inbox" { 0xd8b4fe } else { GRAY4 }).into() })
                .cursor_pointer()
                .child(ui::icon(icon, 14., if active { white } else { rgb(if id == "inbox" { 0xd8b4fe } else { GRAY4 }).into() }))
                .child(label)
                .on_click(cx.listener(move |this, _, _, cx| this.requests_subtab(id, cx)))
        };
        let mut tabs = div().flex_none().pb(px(8.)).border_b_1().border_color(line).flex().items_center().gap(px(8.)).child(tab("submit", "send", "New Request", cx)).child(tab("mine", "clock", "My Requests", cx));
        if r.is_handler {
            tabs = tabs.child(div().flex_1()).child(
                tab("inbox", "inbox", "Staff Inbox", cx)
                    .when(r.subtab != "inbox", |d| d.border_1().border_color(Hsla::from(rgb(0xa855f7)).opacity(0.2)))
                    .when(pending > 0, |d| d.child(div().ml(px(4.)).px(px(6.)).rounded_full().bg(rgb(0xf59e0b)).text_size(px(10.)).font_weight(FontWeight::BOLD).text_color(gpui::black()).child(pending.to_string()))),
            );
        }
        out.push(tabs.mt(px(20.)).into_any_element());

        let body = match r.subtab {
            "submit" => self.render_request_form(r, window, cx),
            "mine" => {
                let mut list = div().flex().flex_col().gap(px(12.));
                if r.loading {
                    list = list.child(div().py(px(48.)).text_center().text_size(px(12.)).text_color(rgb(GRAY4)).child("Loading requests..."));
                } else if r.list.is_empty() {
                    list = list.child(
                        div()
                            .py(px(48.))
                            .px(px(16.))
                            .rounded(px(12.))
                            .border_1()
                            .border_dashed()
                            .border_color(line)
                            .bg(white.opacity(0.02))
                            .flex()
                            .flex_col()
                            .items_center()
                            .child(div().mb(px(8.)).child(ui::icon("lightbulb", 32., rgb(GRAY5))))
                            .child(div().text_size(px(14.)).line_height(px(20.)).font_weight(FontWeight::SEMIBOLD).text_color(rgb(GRAY3)).child("No requests submitted yet"))
                            .child(div().mt(px(4.)).max_w(px(384.)).text_center().text_size(px(12.)).line_height(px(16.)).text_color(rgb(GRAY5)).child("Got a suggestion or found an issue? Use the New Request tab to send a direct note to kiwi and flo."))
                            .child(
                                div()
                                    .id("req-create")
                                    .mt(px(16.))
                                    .px(px(16.))
                                    .py(px(8.))
                                    .rounded(px(8.))
                                    .bg(rgb(EMERALD6))
                                    .hover(|s| s.bg(rgb(0x10b981)))
                                    .text_size(px(12.))
                                    .line_height(px(16.))
                                    .font_weight(FontWeight::SEMIBOLD)
                                    .text_color(white)
                                    .cursor_pointer()
                                    .child("Create Request")
                                    .on_click(cx.listener(|this, _, _, cx| this.requests_subtab("submit", cx))),
                            ),
                    );
                } else {
                    for q in &r.list {
                        let id = q.id.clone();
                        list = list.child(
                            div()
                                .p(px(16.))
                                .rounded(px(12.))
                                .border_1()
                                .border_color(line)
                                .bg(white.opacity(0.03))
                                .flex()
                                .flex_col()
                                .gap(px(12.))
                                .child(
                                    div()
                                        .flex()
                                        .items_start()
                                        .justify_between()
                                        .gap(px(12.))
                                        .child(div().flex().flex_wrap().items_center().gap(px(8.)).child(category_pill(&q.category)).child(status_pill(&q.status)).child(div().text_size(px(11.)).text_color(rgb(GRAY5)).child(when(&q.created_at))))
                                        .when(q.status == "pending", |d| {
                                            d.child(
                                                div()
                                                    .id(SharedString::from(format!("req-del-{id}")))
                                                    .p(px(4.))
                                                    .cursor_pointer()
                                                    .tooltip(ui::tooltip("Delete this request"))
                                                    .child(ui::icon("trash-2", 13., rgb(GRAY5)))
                                                    .on_click(cx.listener(move |this, _, _, cx| this.change_request(id.clone(), None, cx))),
                                            )
                                        }),
                                )
                                .child(
                                    div()
                                        .flex()
                                        .flex_col()
                                        .child(div().text_size(px(14.)).line_height(px(20.)).font_weight(FontWeight::BOLD).text_color(white).child(q.title.clone()))
                                        .child(div().mt(px(4.)).text_size(px(12.)).line_height(px(19.5)).text_color(rgb(GRAY3)).child(q.details.clone())),
                                )
                                .when_some(q.response_note.clone().filter(|n| !n.is_empty()), |d, note| {
                                    d.child(
                                        div()
                                            .p(px(12.))
                                            .rounded(px(8.))
                                            .bg(rgba(0x3b076466))
                                            .border_1()
                                            .border_color(Hsla::from(rgb(0xa855f7)).opacity(0.3))
                                            .text_size(px(12.))
                                            .line_height(px(16.))
                                            .text_color(rgb(0xe9d5ff))
                                            .child(div().mb(px(4.)).flex().items_center().gap(px(6.)).font_weight(FontWeight::SEMIBOLD).text_color(rgb(0xd8b4fe)).child(ui::icon("message-square", 12., rgb(0xd8b4fe))).child("Note from Kiwi & Flo:"))
                                            .child(note),
                                    )
                                }),
                        );
                    }
                }
                list.into_any_element()
            }
            _ => self.render_request_inbox(r, cx),
        };
        out.push(div().mt(px(20.)).pb(px(40.)).child(body).into_any_element());
        out
    }

    fn render_request_form(&self, r: &Requests, window: &Window, cx: &mut Context<Self>) -> AnyElement {
        // Four cards in 768px with 10px between, 12px padding and a 1px border each side.
        let card_text_w = (768. - 30.) / 4. - 26.;
        let white: Hsla = gpui::white().into();
        let line: Hsla = white.opacity(0.1);
        let emerald: Hsla = rgb(0x10b981).into();
        let mut cats = div().flex().gap(px(10.));
        for (id, label, icon, desc, color) in CATEGORIES {
            let active = r.category == id;
            let c: Hsla = rgb(color).into();
            cats = cats.child(
                div()
                    .id(SharedString::from(format!("req-cat-{id}")))
                    .flex_1()
                    .min_w_0()
                    .p(px(12.))
                    .rounded(px(12.))
                    .border_1()
                    .relative()
                    .border_color(if active { emerald.opacity(0.6) } else { line })
                    .bg(if active { white.opacity(0.1) } else { white.opacity(0.03) })
                    // ring-1: a 1px outline just outside the border.
                    .when(active, |d| d.child(div().absolute().top(px(-2.)).bottom(px(-2.)).left(px(-2.)).right(px(-2.)).rounded(px(13.)).border_1().border_color(emerald.opacity(0.4))))
                    .when(!active, |d| d.hover(|s| s.bg(gpui::white().opacity(0.06))))
                    .flex()
                    .flex_col()
                    .items_start()
                    .cursor_pointer()
                    .child(div().mb(px(8.)).p(px(6.)).rounded(px(8.)).bg(c.opacity(0.125)).child(ui::icon(icon, 16., c)))
                    .child(div().text_size(px(12.)).line_height(px(16.)).font_weight(FontWeight::SEMIBOLD).text_color(white).child(label))
                    .child(div().mt(px(2.)).text_size(px(10.)).line_height(px(15.)).text_color(rgb(GRAY4)).child(ui::fit(window, desc, FontWeight::NORMAL, 10., px(card_text_w))))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if let Some(s) = this.settings.as_mut() {
                            s.requests.category = id;
                            cx.notify();
                        }
                    })),
            );
        }
        let title_len = r.title.read(cx).text().chars().count();
        let details_len = r.details.read(cx).value().chars().count();
        let can_send = !r.submitting && title_len > 0 && !r.details.read(cx).value().trim().is_empty() && !r.title.read(cx).text().trim().is_empty();
        // The labels pick up the dialog's own label style (uppercase, 11px, 800) and its margins.
        let field_head = |label: &str, count: String| {
            div()
                .relative()
                .h(px(34.7))
                .child(div().absolute().left_0().top(px(14.)).text_size(px(11.)).line_height(px(14.7)).font_weight(FontWeight::EXTRA_BOLD).text_color(rgb(0xc9cad2)).child(label.to_uppercase()))
                .child(div().absolute().right_0().top(px(9.8)).text_size(px(10.)).line_height(px(15.)).text_color(rgb(GRAY5)).child(count))
        };
        let boxed = |child: AnyElement| div().mt(px(4.)).px(px(14.)).py(px(10.)).rounded(px(8.)).bg(gpui::black().opacity(0.3)).border_1().border_color(white.opacity(0.15)).child(child);
        let mut form = div().flex().flex_col().gap(px(16.));
        if let Some(ok) = &r.success {
            form = form.child(
                div()
                    .p(px(14.))
                    .rounded(px(8.))
                    .bg(rgba(0x022c2280))
                    .border_1()
                    .border_color(emerald.opacity(0.4))
                    .flex()
                    .items_start()
                    .gap(px(12.))
                    .text_size(px(12.))
                    .line_height(px(16.))
                    .text_color(rgb(0xa7f3d0))
                    .child(div().mt(px(2.)).child(ui::icon("circle-check", 16., rgb(0x34d399))))
                    .child(
                        div()
                            .flex_1()
                            .flex()
                            .flex_col()
                            .child(div().font_weight(FontWeight::SEMIBOLD).child(ok.clone()))
                            .child(div().id("req-view-mine").mt(px(8.)).underline().cursor_pointer().child("View in My Requests →").on_click(cx.listener(|this, _, _, cx| this.requests_subtab("mine", cx)))),
                    ),
            );
        }
        if let Some(e) = &r.error {
            form = form.child(
                div()
                    .p(px(12.))
                    .rounded(px(8.))
                    .bg(rgba(0x4c051980))
                    .border_1()
                    .border_color(Hsla::from(rgb(0xf43f5e)).opacity(0.4))
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .text_size(px(12.))
                    .text_color(rgb(0xfda4af))
                    .child(ui::icon("circle-alert", 15., rgb(0xfda4af)))
                    .child(e.clone()),
            );
        }
        form.child(
            div()
                .flex()
                .flex_col()
                .child(div().mb(px(8.)).text_size(px(12.)).line_height(px(16.)).font_weight(FontWeight::SEMIBOLD).text_color(rgb(GRAY3)).child("Request Type"))
                .child(cats),
        )
        .child(div().flex().flex_col().child(field_head("Title / Summary", format!("{title_len}/150"))).child(boxed(r.title.clone().into_any_element())))
        .child(div().flex().flex_col().child(field_head("Description & Details", format!("{details_len}/4000"))).child(boxed(r.details.clone().into_any_element())))
        .child(
            div()
                .pt(px(4.))
                .flex()
                .items_center()
                .justify_between()
                .child(
                    div()
                        .flex()
                        .gap(px(3.))
                        .text_size(px(11.))
                        .line_height(px(16.5))
                        .text_color(rgb(GRAY4))
                        .child("Directly notified:")
                        .child(div().font_weight(FontWeight::BOLD).child("kiwi"))
                        .child("&")
                        .child(div().font_weight(FontWeight::BOLD).child("flo")),
                )
                .child(
                    div()
                        .id("req-submit")
                        .flex()
                        .items_center()
                        .gap(px(8.))
                        .px(px(20.))
                        .py(px(10.))
                        .rounded(px(8.))
                        .bg(rgb(EMERALD6))
                        .text_size(px(12.))
                        .line_height(px(16.))
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(white)
                        .when(!can_send, |d| d.opacity(0.5))
                        .when(can_send, |d| d.cursor_pointer().hover(|s| s.bg(rgb(0x10b981))))
                        .child(ui::icon("send", 14., white))
                        .child(if r.submitting { "Sending..." } else { "Submit Request" })
                        .on_click(cx.listener(move |this, _, _, cx| {
                            if can_send {
                                this.submit_request(cx);
                            }
                        })),
                ),
        )
        .into_any_element()
    }

    /// The staff inbox (kiwi and flo): search, a status filter, and each request with its author,
    /// status buttons and a note that reaches the author by DM.
    fn render_request_inbox(&self, r: &Requests, cx: &mut Context<Self>) -> AnyElement {
        let white: Hsla = gpui::white().into();
        let line: Hsla = white.opacity(0.1);
        let q = r.search.read(cx).text().trim().to_lowercase();
        let shown: Vec<&Request> = r
            .list
            .iter()
            .filter(|x| r.filter == "all" || x.status == r.filter)
            .filter(|x| {
                q.is_empty()
                    || x.title.to_lowercase().contains(&q)
                    || x.details.to_lowercase().contains(&q)
                    || x.user.as_ref().is_some_and(|u| u.username.to_lowercase().contains(&q) || u.display_name.to_lowercase().contains(&q))
            })
            .collect();
        let mut filters = div().flex().items_center().gap(px(4.));
        for (st, label) in [("all", "All"), ("pending", "Pending"), ("in_progress", "In Progress"), ("completed", "Completed"), ("declined", "Declined")] {
            let active = r.filter == st;
            filters = filters.child(
                div()
                    .id(SharedString::from(format!("req-filter-{st}")))
                    .px(px(10.))
                    .py(px(6.))
                    .rounded(px(8.))
                    .bg(if active { rgb(0x9333ea).into() } else { white.opacity(0.05) })
                    .text_size(px(12.))
                    .line_height(px(16.))
                    .font_weight(FontWeight::MEDIUM)
                    .text_color(if active { white } else { rgb(GRAY4).into() })
                    .cursor_pointer()
                    .child(label)
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if let Some(s) = this.settings.as_mut() {
                            s.requests.filter = st;
                            cx.notify();
                        }
                    })),
            );
        }
        let mut list = div().flex().flex_col().gap(px(12.));
        if r.loading {
            list = list.child(div().py(px(48.)).text_center().text_size(px(12.)).text_color(rgb(GRAY4)).child("Loading requests..."));
        } else if shown.is_empty() {
            list = list.child(div().py(px(48.)).rounded(px(12.)).border_1().border_dashed().border_color(line).text_center().text_size(px(12.)).text_color(rgb(GRAY5)).child("No matching requests found."));
        }
        for x in shown {
            let id = x.id.clone();
            let editing = r.editing_note.as_deref() == Some(x.id.as_str());
            let author = x.user.clone();
            let (_, cat_label, cat_icon, _, cat_color) = CATEGORIES.iter().find(|c| c.0 == x.category).copied().unwrap_or(CATEGORIES[0]);
            let cc: Hsla = rgb(cat_color).into();
            let mut statuses = div().flex().flex_wrap().items_center().gap(px(6.)).child(div().mr(px(4.)).text_size(px(11.)).font_weight(FontWeight::MEDIUM).text_color(rgb(GRAY4)).child("Set status:"));
            for (st, label, _, base, text) in STATUSES {
                let current = x.status == st;
                let rid = id.clone();
                let b: Hsla = rgb(base).into();
                statuses = statuses.child(
                    div()
                        .id(SharedString::from(format!("req-st-{id}-{st}")))
                        .px(px(10.))
                        .py(px(4.))
                        .rounded(px(4.))
                        .when(current, |d| d.bg(b.opacity(0.15)).border_1().border_color(b.opacity(0.3)).text_color(rgb(text)))
                        .when(!current, |d| d.bg(gpui::white().opacity(0.05)).text_color(rgb(GRAY4)))
                        .text_size(px(11.))
                        .font_weight(FontWeight::MEDIUM)
                        .cursor_pointer()
                        .child(label)
                        .on_click(cx.listener(move |this, _, _, cx| this.change_request(rid.clone(), Some(json!({ "status": st })), cx))),
                );
            }
            let note_id = id.clone();
            let existing = x.response_note.clone().unwrap_or_default();
            let mut card = div()
                .p(px(16.))
                .rounded(px(12.))
                .border_1()
                .border_color(line)
                .bg(white.opacity(0.03))
                .flex()
                .flex_col()
                .gap(px(14.))
                .child(
                    div()
                        .flex()
                        .items_start()
                        .justify_between()
                        .gap(px(12.))
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(10.))
                                .child(match &author {
                                    Some(a) => ui::avatar(self.picture(&a.avatar_url), &a.avatar, &a.color, &a.display_name, 32.),
                                    None => div().size(px(32.)).rounded_full().bg(rgb(0x374151)).flex().items_center().justify_center().text_size(px(12.)).child("👤").into_any_element(),
                                })
                                .child(
                                    div()
                                        .flex()
                                        .flex_col()
                                        .child(
                                            div()
                                                .flex()
                                                .items_center()
                                                .gap(px(8.))
                                                .child(div().text_size(px(12.)).font_weight(FontWeight::BOLD).text_color(white).child(author.as_ref().map(|a| if a.display_name.is_empty() { a.username.clone() } else { a.display_name.clone() }).unwrap_or_else(|| "Unknown".into())))
                                                .children(author.as_ref().filter(|a| !a.username.is_empty()).map(|a| div().text_size(px(11.)).text_color(rgb(GRAY4)).child(format!("@{}", a.username)))),
                                        )
                                        .child(div().text_size(px(10.)).text_color(rgb(GRAY5)).child(when(&x.created_at))),
                                ),
                        )
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(8.))
                                .children(author.as_ref().map(|a| {
                                    let who = a.id.clone();
                                    div()
                                        .id(SharedString::from(format!("req-dm-{id}")))
                                        .flex()
                                        .items_center()
                                        .gap(px(6.))
                                        .px(px(10.))
                                        .py(px(4.))
                                        .rounded(px(6.))
                                        .bg(gpui::white().opacity(0.05))
                                        .text_size(px(12.))
                                        .text_color(rgb(0xe5e7eb))
                                        .cursor_pointer()
                                        .child(ui::icon("message-circle", 12., rgb(0xe5e7eb)))
                                        .child("DM Author")
                                        .on_click(cx.listener(move |this, _, window, cx| this.open_dm_from_settings(&who, window, cx)))
                                }))
                                .child({
                                    let del = id.clone();
                                    div().id(SharedString::from(format!("req-x-{id}"))).p(px(4.)).cursor_pointer().child(ui::icon("trash-2", 13., rgb(GRAY5))).on_click(cx.listener(move |this, _, _, cx| this.change_request(del.clone(), None, cx)))
                                }),
                        ),
                )
                .child(div().flex().items_center().gap(px(8.)).child(
                    div().flex().items_center().gap(px(4.)).px(px(8.)).py(px(2.)).rounded_full().bg(cc.opacity(0.08)).border_1().border_color(cc.opacity(0.19)).text_size(px(11.)).font_weight(FontWeight::MEDIUM).text_color(cc).child(ui::icon(cat_icon, 12., cc)).child(cat_label),
                ))
                .child(div().flex().flex_col().child(div().text_size(px(14.)).font_weight(FontWeight::BOLD).text_color(white).child(x.title.clone())).child(div().mt(px(4.)).text_size(px(12.)).line_height(px(19.5)).text_color(rgb(GRAY3)).child(x.details.clone())))
                .child(
                    div()
                        .pt(px(8.))
                        .border_t_1()
                        .border_color(white.opacity(0.05))
                        .flex()
                        .flex_wrap()
                        .items_center()
                        .justify_between()
                        .gap(px(10.))
                        .child(statuses)
                        .child(
                            div()
                                .id(SharedString::from(format!("req-note-{id}")))
                                .text_size(px(12.))
                                .text_color(rgb(0xd8b4fe))
                                .underline()
                                .cursor_pointer()
                                .child(if existing.is_empty() { "+ Add Note for Author" } else { "Edit Note" })
                                .on_click(cx.listener(move |this, _, window, cx| {
                                    let Some(s) = this.settings.as_mut() else { return };
                                    if s.requests.editing_note.as_deref() == Some(note_id.as_str()) {
                                        s.requests.editing_note = None;
                                    } else {
                                        s.requests.editing_note = Some(note_id.clone());
                                        let draft = existing.clone();
                                        let note = s.requests.note.clone();
                                        note.update(cx, |n, cx| n.set_value(draft, cx));
                                        window.focus(&note.focus_handle(cx));
                                    }
                                    cx.notify();
                                })),
                        ),
                );
            if editing {
                let save = id.clone();
                card = card.child(
                    div()
                        .p(px(12.))
                        .rounded(px(8.))
                        .bg(gpui::black().opacity(0.4))
                        .border_1()
                        .border_color(Hsla::from(rgb(0xa855f7)).opacity(0.4))
                        .flex()
                        .flex_col()
                        .gap(px(8.))
                        .child(div().text_size(px(11.)).font_weight(FontWeight::SEMIBOLD).text_color(rgb(0xd8b4fe)).child("Response Note (sent to author via DM when updated):"))
                        .child(div().px(px(12.)).py(px(6.)).rounded(px(4.)).bg(gpui::black().opacity(0.5)).border_1().border_color(line).child(r.note.clone()))
                        .child(
                            div()
                                .flex()
                                .justify_end()
                                .gap(px(8.))
                                .child(div().id("req-note-cancel").px(px(10.)).py(px(4.)).text_size(px(12.)).text_color(rgb(GRAY4)).cursor_pointer().child("Cancel").on_click(cx.listener(|this, _, _, cx| {
                                    if let Some(s) = this.settings.as_mut() {
                                        s.requests.editing_note = None;
                                        cx.notify();
                                    }
                                })))
                                .child(div().id("req-note-save").px(px(12.)).py(px(4.)).rounded(px(4.)).bg(rgb(0x9333ea)).text_size(px(12.)).font_weight(FontWeight::SEMIBOLD).text_color(white).cursor_pointer().child("Save Note").on_click(cx.listener(move |this, _, _, cx| {
                                    let draft = this.settings.as_ref().map(|s| s.requests.note.read(cx).value()).unwrap_or_default();
                                    let note = if draft.trim().is_empty() { Value::Null } else { json!(draft.trim()) };
                                    this.change_request(save.clone(), Some(json!({ "responseNote": note })), cx);
                                }))),
                        ),
                );
            } else if let Some(note) = x.response_note.clone().filter(|n| !n.is_empty()) {
                card = card.child(
                    div()
                        .p(px(10.))
                        .rounded(px(8.))
                        .bg(rgba(0x3b07644d))
                        .border_1()
                        .border_color(Hsla::from(rgb(0xa855f7)).opacity(0.2))
                        .flex()
                        .flex_wrap()
                        .text_size(px(12.))
                        .text_color(rgb(0xe9d5ff))
                        .child(div().font_weight(FontWeight::SEMIBOLD).text_color(rgb(0xd8b4fe)).child("Note:\u{a0}"))
                        .child(note),
                );
            }
            list = list.child(card);
        }
        div()
            .flex()
            .flex_col()
            .gap(px(16.))
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .gap(px(10.))
                    .child(
                        div()
                            .relative()
                            .flex_1()
                            .pl(px(36.))
                            .pr(px(12.))
                            .py(px(8.))
                            .rounded(px(8.))
                            .bg(gpui::black().opacity(0.3))
                            .border_1()
                            .border_color(line)
                            .child(div().absolute().left(px(12.)).top(px(11.)).child(ui::icon("search", 14., rgb(GRAY4))))
                            .child(r.search.clone()),
                    )
                    .child(filters),
            )
            .child(list)
            .into_any_element()
    }
}

use gpui::Focusable;

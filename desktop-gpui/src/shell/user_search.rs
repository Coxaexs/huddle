//! "Find people" (app/components/global-user-search-dialog.tsx): your servers, and anyone on this
//! Hoffle by name, to message, befriend, accept or block.

use gpui::{AnyElement, Context, Entity, Focusable, FontWeight, Hsla, SharedString, Subscription, Task, Window, div, prelude::*, px, rgb};
use serde::Deserialize;
use serde_json::{Value, json};

use super::Shell;
use crate::i18n::{t, tv};
use crate::input::{InputEvent, Look, TextInput};
use crate::theme::Theme;
use crate::ui;

#[derive(Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub(super) struct Found {
    pub id: String,
    pub username: String,
    pub display_name: String,
    pub avatar: String,
    pub avatar_url: Option<String>,
    pub color: String,
    pub custom_status: Option<String>,
    pub is_self: bool,
    /// self, friend, incoming, outgoing, blocked or none.
    pub relationship: String,
}

pub(super) struct UserSearch {
    query: Entity<TextInput>,
    results: Vec<Found>,
    loading: bool,
    busy: Option<String>,
    search: Option<Task<()>>,
    _sub: Subscription,
}

impl UserSearch {
    pub(super) fn query_input(&self) -> Entity<TextInput> {
        self.query.clone()
    }
}

impl Shell {
    pub(super) fn dev_find_changed(&mut self, cx: &mut Context<Self>) {
        self.user_search_changed(cx);
    }

    pub(super) fn open_user_search(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let query = cx.new(|cx| {
            TextInput::new(t("searchDialog.placeholder"), cx).look(Look {
                size: 16.,
                line_height: 24.,
                height: 24.,
                color: rgb(0xe8e3f5).into(),
                placeholder: rgb(0x7c7599).into(),
            })
        });
        let sub = cx.subscribe_in(&query, window, |this, _, event, _, cx| match event {
            InputEvent::Escape => this.close_user_search(cx),
            _ => this.user_search_changed(cx),
        });
        window.focus(&query.focus_handle(cx));
        self.user_search = Some(UserSearch { query, results: Vec::new(), loading: false, busy: None, search: None, _sub: sub });
        cx.notify();
    }

    pub(super) fn close_user_search(&mut self, cx: &mut Context<Self>) {
        if self.user_search.take().is_some() {
            cx.notify();
        }
    }

    /// The search runs 200ms after the typing stops; a slower answer to an older query loses.
    fn user_search_changed(&mut self, cx: &mut Context<Self>) {
        let Some(s) = self.user_search.as_mut() else { return };
        let q = s.query.read(cx).text().trim().to_string();
        if q.is_empty() {
            s.results.clear();
            s.loading = false;
            s.search = None;
            cx.notify();
            return;
        }
        s.loading = true;
        let client = self.client.clone();
        s.search = Some(cx.spawn(async move |this, cx| {
            cx.background_executor().timer(std::time::Duration::from_millis(200)).await;
            let path = format!("/api/users/search?q={}&limit=30", url::form_urlencoded::byte_serialize(q.as_bytes()).collect::<String>());
            let found = cx.background_executor().spawn(async move { client.settings_get(&path) }).await;
            this.update(cx, |this, cx| {
                if let Some(s) = this.user_search.as_mut() {
                    s.results = found.ok().and_then(|v| serde_json::from_value(v.get("users").cloned().unwrap_or(Value::Null)).ok()).unwrap_or_default();
                    s.loading = false;
                    cx.notify();
                }
            })
            .ok();
        }));
        cx.notify();
    }

    /// Add / Accept / Block / Unblock, then the row shows what it became.
    fn user_search_action(&mut self, id: String, action: &'static str, cx: &mut Context<Self>) {
        let Some(s) = self.user_search.as_mut() else { return };
        let Some(user) = s.results.iter().find(|u| u.id == id).cloned() else { return };
        s.busy = Some(id.clone());
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    match action {
                        "add" => client.settings_post("/api/friends", json!({ "username": user.username })),
                        "accept" => client.settings_post("/api/friends/accept", json!({ "requesterId": user.id })),
                        "block" => client.settings_post("/api/friends/block", json!({ "targetId": user.id })),
                        _ => client.settings_delete(&format!("/api/friends?id={}", user.id), Value::Null),
                    }
                })
                .await;
            this.update(cx, |this, cx| {
                if let Some(s) = this.user_search.as_mut() {
                    s.busy = None;
                    if result.is_ok()
                        && let Some(u) = s.results.iter_mut().find(|u| u.id == id)
                    {
                        u.relationship = match action {
                            "add" => "outgoing",
                            "accept" => "friend",
                            "block" => "blocked",
                            _ => "none",
                        }
                        .into();
                    }
                    cx.notify();
                }
            })
            .ok();
        })
        .detach();
    }

    pub(super) fn render_user_search(&self, window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let s = self.user_search.as_ref()?;
        let q = s.query.read(cx).text().trim().to_string();
        let ink = rgb(0xe8e3f5);
        let soft = rgb(0x9d95bc);
        let faint = rgb(0x7c7599);
        let line: Hsla = gpui::white().opacity(0.08).into();
        let label = |text: String| div().px(px(8.)).pt(px(4.)).pb(px(4.)).text_size(px(10.)).line_height(px(15.)).font_weight(FontWeight::BOLD).text_color(faint).child(text.to_uppercase());
        let row = |id: SharedString| div().id(id).flex().items_center().justify_between().p(px(10.)).rounded(px(12.));
        let pill = |icon: &'static str, text: String, bg: Hsla, color: Hsla| {
            div().flex().items_center().gap(px(4.)).px(px(10.)).py(px(6.)).rounded(px(8.)).bg(bg).text_size(px(12.)).line_height(px(16.)).font_weight(FontWeight::SEMIBOLD).text_color(color).child(ui::icon(icon, 12., color)).child(text)
        };
        let server_rows = |servers: Vec<&crate::model::Server>, cx: &mut Context<Self>| {
            servers
                .into_iter()
                .map(|server| {
                    let initials: String = server.name.split_whitespace().filter_map(|w| w.chars().next()).collect::<String>().chars().take(2).collect::<String>().to_uppercase();
                    let face = match self.picture(&server.icon_url) {
                        Some(url) => gpui::img(url).size(px(40.)).rounded(px(12.)).object_fit(gpui::ObjectFit::Cover).into_any_element(),
                        None => div()
                            .size(px(40.))
                            .rounded(px(12.))
                            .bg(crate::theme::css_color(&server.color).unwrap_or(Theme::lavender().into()))
                            .flex()
                            .items_center()
                            .justify_center()
                            .text_size(px(14.))
                            .font_weight(FontWeight::BOLD)
                            .text_color(gpui::white())
                            .child(if server.icon.is_empty() { if initials.is_empty() { "SV".into() } else { initials } } else { server.icon.clone() })
                            .into_any_element(),
                    };
                    let id = server.id.clone();
                    row(SharedString::from(format!("us-server-{}", server.id)))
                        .cursor_pointer()
                        .hover(|s| s.bg(gpui::white().opacity(0.05)))
                        .child(
                            div()
                                .min_w_0()
                                .pr(px(12.))
                                .flex()
                                .items_center()
                                .gap(px(12.))
                                .child(div().flex_none().child(face))
                                .child(
                                    div()
                                        .min_w_0()
                                        .flex()
                                        .flex_col()
                                        .child(div().truncate().text_size(px(14.)).line_height(px(20.)).font_weight(FontWeight::BOLD).text_color(ink).child(server.name.clone()))
                                        .child(div().mt(px(2.)).truncate().text_size(px(11.)).line_height(px(16.5)).text_color(faint).child(tv("searchDialog.channelsCount", &[("count", &server.channels.len().to_string())]))),
                                ),
                        )
                        .child(pill("server", t("searchDialog.server"), gpui::white().opacity(0.04), soft.into()))
                        .on_click(cx.listener(move |this, _, _, cx| {
                            this.user_search = None;
                            this.open_server(id.clone(), cx);
                        }))
                        .into_any_element()
                })
                .collect::<Vec<_>>()
        };

        let mut body = div().id("us-results").flex_1().min_h_0().overflow_y_scroll().p(px(8.)).flex().flex_col().gap(px(4.));
        if q.is_empty() {
            if !self.servers.is_empty() {
                body = body.child(div().flex().flex_col().child(label(t("searchDialog.yourServers"))).children(server_rows(self.servers.iter().collect(), cx)));
            }
            body = body.child(
                div()
                    .py(px(32.))
                    .px(px(16.))
                    .flex()
                    .flex_col()
                    .items_center()
                    .child(div().text_center().text_size(px(14.)).line_height(px(20.)).font_weight(FontWeight::MEDIUM).text_color(soft).child(t("searchDialog.emptyPrompt")))
                    .child(div().mt(px(4.)).text_center().text_size(px(12.)).line_height(px(16.)).text_color(faint).child(t("searchDialog.emptyPromptSub"))),
            );
        } else {
            let lower = q.to_lowercase();
            let matched: Vec<&crate::model::Server> = self.servers.iter().filter(|s| s.name.to_lowercase().contains(&lower)).collect();
            let any_servers = !matched.is_empty();
            if any_servers {
                body = body.child(div().flex().flex_col().child(label(t("searchDialog.servers"))).children(server_rows(matched, cx)));
            }
            if !s.results.is_empty() {
                let mut people = div().flex().flex_col().child(label(t("searchDialog.people")));
                for u in &s.results {
                    let online = self.presence_of(&u.id) != "offline";
                    let busy = s.busy.as_deref() == Some(u.id.as_str());
                    let id = u.id.clone();
                    let name_line = div()
                        .flex()
                        .items_center()
                        .gap(px(8.))
                        .child(div().truncate().text_size(px(14.)).line_height(px(20.)).font_weight(FontWeight::BOLD).text_color(ink).child(u.display_name.clone()))
                        .child(div().truncate().text_size(px(12.)).line_height(px(16.)).text_color(soft).child(format!("@{}", u.username)))
                        .when(u.is_self, |d| d.child(div().px(px(6.)).rounded(px(4.)).bg(gpui::white().opacity(0.08)).text_size(px(10.)).font_weight(FontWeight::BOLD).text_color(Theme::lavender()).child(t("searchDialog.you").to_uppercase())));
                    let status_line = match u.custom_status.clone().filter(|s| !s.is_empty()) {
                        Some(status) => div().mt(px(2.)).truncate().text_size(px(12.)).line_height(px(16.)).text_color(soft).child(status),
                        None => div().mt(px(2.)).truncate().text_size(px(11.)).line_height(px(16.5)).text_color(faint).child(t(if online { "searchDialog.activeNow" } else { "searchDialog.offline" })),
                    };
                    let mut actions = div().flex_none().flex().items_center().gap(px(6.));
                    if !u.is_self {
                        let dm = id.clone();
                        actions = actions.child(
                            div()
                                .id(SharedString::from(format!("us-dm-{id}")))
                                .p(px(8.))
                                .rounded(px(8.))
                                .bg(gpui::white().opacity(0.06))
                                .hover(|s| s.bg(gpui::white().opacity(0.12)))
                                .cursor_pointer()
                                .tooltip(ui::tooltip(t("searchDialog.openDm")))
                                .child(ui::icon("message-square", 16., ink))
                                .on_click(cx.listener(move |this, _, _, cx| {
                                    this.user_search = None;
                                    this.open_dm_with(dm.clone(), cx);
                                })),
                        );
                        let act = |key: &'static str, action: &'static str, icon: &'static str, text: String, bg: Hsla, color: Hsla, cx: &mut Context<Self>| {
                            let id = id.clone();
                            div()
                                .id(SharedString::from(format!("us-{action}-{id}")))
                                .flex()
                                .items_center()
                                .gap(px(6.))
                                .px(px(12.))
                                .py(px(6.))
                                .rounded(px(8.))
                                .bg(bg)
                                .text_size(px(12.))
                                .line_height(px(16.))
                                .font_weight(FontWeight::BOLD)
                                .text_color(color)
                                .cursor_pointer()
                                .when(busy, |d| d.opacity(0.5))
                                .tooltip(ui::tooltip(t(key)))
                                .child(ui::icon(icon, 14., color))
                                .child(text)
                                .on_click(cx.listener(move |this, _, _, cx| this.user_search_action(id.clone(), action, cx)))
                        };
                        match u.relationship.as_str() {
                            "none" => actions = actions.child(act("searchDialog.addFriend", "add", "user-plus", t("searchDialog.add"), Hsla::from(Theme::lavender()).opacity(0.2), rgb(0xc4b5fd).into(), cx)),
                            "outgoing" => actions = actions.child(pill("clock", t("searchDialog.sent"), gpui::white().opacity(0.04), soft.into())),
                            "incoming" => actions = actions.child(act("searchDialog.acceptRequest", "accept", "check", t("searchDialog.accept"), Hsla::from(rgb(0x4ade80)).opacity(0.2), rgb(0x4ade80).into(), cx)),
                            "friend" => actions = actions.child(pill("check", t("searchDialog.friend"), Hsla::from(rgb(0x4ade80)).opacity(0.15), rgb(0x4ade80).into())),
                            _ => {}
                        }
                        if u.relationship == "blocked" {
                            let unblock = id.clone();
                            actions = actions.child(pill("shield-alert", t("searchDialog.blocked"), Hsla::from(rgb(0xf43f5e)).opacity(0.1), rgb(0xfb7185).into())).child(
                                div()
                                    .id(SharedString::from(format!("us-unblock-{id}")))
                                    .px(px(10.))
                                    .py(px(6.))
                                    .rounded(px(8.))
                                    .border_1()
                                    .border_color(gpui::white().opacity(0.1))
                                    .text_size(px(12.))
                                    .line_height(px(16.))
                                    .font_weight(FontWeight::SEMIBOLD)
                                    .text_color(gpui::white().opacity(0.8))
                                    .cursor_pointer()
                                    .child(t("searchDialog.unblock"))
                                    .on_click(cx.listener(move |this, _, _, cx| this.user_search_action(unblock.clone(), "unblock", cx))),
                            );
                        } else {
                            let block = id.clone();
                            actions = actions.child(
                                div()
                                    .id(SharedString::from(format!("us-block-{id}")))
                                    .p(px(6.))
                                    .rounded(px(8.))
                                    .cursor_pointer()
                                    .hover(|s| s.bg(Hsla::from(rgb(0xf43f5e)).opacity(0.1)))
                                    .tooltip(ui::tooltip(t("searchDialog.blockUser")))
                                    .child(ui::icon("shield-alert", 14., gpui::white().opacity(0.3)))
                                    .on_click(cx.listener(move |this, _, _, cx| this.user_search_action(block.clone(), "block", cx))),
                            );
                        }
                    }
                    let open = id.clone();
                    let is_self = u.is_self;
                    people = people.child(
                        row(SharedString::from(format!("us-user-{id}")))
                            .when(is_self, |d| d.opacity(0.6).bg(gpui::white().opacity(0.02)))
                            .when(!is_self, |d| d.cursor_pointer().hover(|s| s.bg(gpui::white().opacity(0.05))))
                            .child(
                                div()
                                    .min_w_0()
                                    .pr(px(12.))
                                    .flex()
                                    .items_center()
                                    .gap(px(12.))
                                    // The avatar sits at the top of a 47px box, its dot at the bottom right.
                                    .child(
                                        div()
                                            .relative()
                                            .flex_none()
                                            .w(px(40.))
                                            .h(px(47.))
                                            .child(ui::avatar(self.picture(&u.avatar_url), &u.avatar, &u.color, &u.display_name, 40.))
                                            .child(
                                                div()
                                                    .absolute()
                                                    .right(px(-2.))
                                                    .bottom(px(-2.))
                                                    .size(px(16.))
                                                    .rounded_full()
                                                    .border_2()
                                                    .border_color(rgb(0x1a1628))
                                                    .bg(if online { rgb(0x4ade80) } else { rgb(0x737373) }),
                                            ),
                                    )
                                    .child(div().min_w_0().flex().flex_col().child(name_line).child(status_line)),
                            )
                            .child(actions)
                            .on_click(cx.listener(move |this, _, _, cx| {
                                if !is_self {
                                    this.user_search = None;
                                    this.open_dm_with(open.clone(), cx);
                                }
                            })),
                    );
                }
                body = body.child(people);
            }
            if !any_servers && s.results.is_empty() && !s.loading {
                body = body.child(
                    div()
                        .py(px(48.))
                        .px(px(16.))
                        .flex()
                        .flex_col()
                        .items_center()
                        .child(div().text_center().text_size(px(14.)).line_height(px(20.)).font_weight(FontWeight::SEMIBOLD).text_color(soft).child(t("searchDialog.noResultsFound")))
                        .child(div().mt(px(4.)).text_center().text_size(px(12.)).line_height(px(16.)).text_color(faint).child(tv("searchDialog.noResultsMatching", &[("query", &q)]))),
                );
            }
        }

        let trailing = if s.loading {
            ui::icon("loader-2", 18., Theme::lavender()).into_any_element()
        } else if !q.is_empty() {
            div()
                .id("us-clear")
                .p(px(4.))
                .rounded(px(4.))
                .cursor_pointer()
                .hover(|s| s.bg(gpui::white().opacity(0.05)))
                .tooltip(ui::tooltip(t("searchDialog.clear")))
                .child(ui::icon("x", 16., soft))
                .on_click(cx.listener(|this, _, _, cx| {
                    if let Some(s) = this.user_search.as_ref() {
                        s.query.update(cx, |q, cx| q.set_text(String::new(), cx));
                    }
                    this.user_search_changed(cx);
                }))
                .into_any_element()
        } else {
            div().px(px(8.)).py(px(2.)).rounded(px(4.)).bg(gpui::white().opacity(0.08)).font_family(crate::theme::MONO_FONT).text_size(px(11.)).line_height(px(16.5)).text_color(soft).child("ESC").into_any_element()
        };
        let vh = f32::from(window.viewport_size().height);
        Some(
            div()
                .id("user-search")
                .absolute()
                .inset_0()
                .bg(gpui::hsla(0., 0., 0., 0.6))
                .flex()
                .flex_col()
                .items_center()
                .pt(px(96.))
                .px(px(16.))
                .on_mouse_down(gpui::MouseButton::Left, cx.listener(|this, _, _, cx| this.close_user_search(cx)))
                .child(
                    div()
                        .id("user-search-card")
                        // The dialog sets its own font: font-['Nunito',sans-serif].
                        .font_family("Nunito")
                        .w_full()
                        .max_w(px(576.))
                        .max_h(px(vh * 0.75))
                        .rounded(px(16.))
                        .bg(rgb(0x1a1628))
                        .border_1()
                        .border_color(line)
                        .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.25), offset: gpui::point(px(0.), px(25.)), blur_radius: px(50.), spread_radius: px(-12.) }])
                        .overflow_hidden()
                        .flex()
                        .flex_col()
                        .on_mouse_down(gpui::MouseButton::Left, |_, _, cx| cx.stop_propagation())
                        .child(
                            div()
                                .flex_none()
                                .px(px(16.))
                                .py(px(14.))
                                .border_b_1()
                                .border_color(line)
                                .bg(Hsla::from(rgb(0x16131f)).opacity(0.6))
                                .flex()
                                .items_center()
                                .gap(px(12.))
                                .child(ui::icon("search", 20., Theme::lavender()))
                                // The focused field's 3px ring, as the web draws it.
                                .child(
                                    div()
                                        .relative()
                                        .flex_1()
                                        .min_w_0()
                                        .child(s.query.clone())
                                        .child(div().absolute().top(px(-3.)).bottom(px(-3.)).left(px(-3.)).right(px(-3.)).border(px(3.)).border_color(Hsla::from(Theme::lavender()).opacity(0.32))),
                                )
                                .child(trailing),
                        )
                        .child(body)
                        .child(
                            div()
                                .flex_none()
                                .px(px(16.))
                                .py(px(10.))
                                .border_t_1()
                                .border_color(line)
                                .bg(Hsla::from(rgb(0x16131f)).opacity(0.8))
                                .flex()
                                .justify_between()
                                .text_size(px(12.))
                                .line_height(px(16.))
                                .text_color(faint)
                                .child(t("searchDialog.footerHint"))
                                .child(t("searchDialog.escToExit")),
                        ),
                )
                .into_any_element(),
        )
    }
}


//! A room's live Q&A (hooks/use-qa.ts, components/qa-panel.tsx): loaded once you are in the call,
//! kept current by hub "qa" events; the panel to ask, upvote, and (hosts) pin, mark answered or
//! hide; the "Now answering" banner on stage; "Q&A (n)" in the call's ⋯ menu.

use std::collections::HashSet;

use gpui::{AnyElement, Context, Entity, FontWeight, Hsla, SharedString, Subscription, Window, div, prelude::*, px};
use serde_json::{Value, json};

use super::Shell;
use crate::input::{InputEvent, TextInput};
use crate::theme::{Theme, mix};
use crate::ui;

/// QA_TEXT_LIMIT.
const TEXT_LIMIT: usize = 300;

#[derive(Clone, Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub(super) struct Question {
    pub id: String,
    pub user_id: String,
    pub author: String,
    pub text: String,
    pub votes: i64,
    pub created_at: String,
    pub answered: bool,
    pub pinned: bool,
}

#[derive(Default)]
pub(super) struct Qa {
    /// The room these are for (the call you are in).
    channel: Option<String>,
    questions: Vec<Question>,
    voted: HashSet<String>,
    can_host: bool,
    loaded: bool,
    pub open: bool,
    input: Option<Entity<TextInput>>,
    error: Option<String>,
    busy: bool,
    _sub: Option<Subscription>,
}

/// sortQuestions(): pinned, then open before answered, then votes, then oldest first.
fn sort(questions: &mut [Question]) {
    questions.sort_by(|a, b| {
        b.pinned.cmp(&a.pinned).then(a.answered.cmp(&b.answered)).then(b.votes.cmp(&a.votes)).then(a.created_at.cmp(&b.created_at))
    });
}

fn upsert(questions: &mut Vec<Question>, q: Question) {
    questions.retain(|item| item.id != q.id);
    questions.insert(0, q);
    sort(questions);
}

impl Shell {
    /// The room whose Q&A is live: the call you are in, while its stage is open.
    fn qa_room(&self) -> Option<String> {
        let stage = self.stage.as_ref()?;
        let joined = self.call.as_ref().is_some_and(|c| c.channel_id == stage.channel_id) || std::env::var_os("HOFFLE_DEV_STAGE_ONLY").is_some();
        joined.then(|| stage.channel_id.clone())
    }

    /// Each frame: (re)load for the room you are in, forget it when you leave.
    pub(super) fn qa_tick(&mut self, cx: &mut Context<Self>) {
        let room = self.qa_room();
        if room == self.qa.channel {
            return;
        }
        let open = self.qa.open && room.is_some();
        let input = self.qa.input.take();
        let sub = self.qa._sub.take();
        self.qa = super::qa::Qa { channel: room.clone(), open, input, _sub: sub, ..Default::default() };
        let Some(room) = room else { return };
        let client = self.client.clone();
        let path = format!("/api/qa?channelId={}", url::form_urlencoded::byte_serialize(room.as_bytes()).collect::<String>());
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.get_value(&path) }).await;
            this.update(cx, |this, cx| {
                let Ok(v) = result else { return };
                if this.qa.channel.as_deref() != Some(room.as_str()) {
                    return;
                }
                let mut questions: Vec<Question> = serde_json::from_value(v["questions"].clone()).unwrap_or_default();
                sort(&mut questions);
                this.qa.questions = questions;
                this.qa.voted = v["voted"].as_array().map(|a| a.iter().filter_map(Value::as_str).map(String::from).collect()).unwrap_or_default();
                this.qa.can_host = v["canHost"].as_bool().unwrap_or(false);
                this.qa.loaded = true;
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    /// Hub "qa": a question asked, changed or removed in the room.
    pub(super) fn on_qa(&mut self, value: &Value, cx: &mut Context<Self>) {
        if value.get("channelId").and_then(Value::as_str) != self.qa.channel.as_deref() {
            return;
        }
        match value.get("question").filter(|q| q.is_object()).and_then(|q| serde_json::from_value::<Question>(q.clone()).ok()) {
            Some(q) => upsert(&mut self.qa.questions, q),
            None => {
                let removed = value.get("removedId").and_then(Value::as_str).unwrap_or("");
                self.qa.questions.retain(|q| q.id != removed);
            }
        }
        cx.notify();
    }

    pub(super) fn qa_open_count(&self) -> usize {
        self.qa.questions.iter().filter(|q| !q.answered).count()
    }

    pub(super) fn qa_available(&self) -> bool {
        self.qa.channel.is_some()
    }

    pub(super) fn toggle_qa(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.qa.open = !self.qa.open;
        if self.qa.open && self.qa.input.is_none() {
            // The page's 16px text (inputs and buttons inherit it here).
            let input = cx.new(|cx| {
                TextInput::new("Ask the hosts a question…", cx).look(crate::input::Look {
                    size: 16.,
                    line_height: 24.,
                    height: 24.,
                    color: Theme::ink().into(),
                    placeholder: Theme::muted().into(),
                })
            });
            let sub = cx.subscribe_in(&input, window, |this, _, event, _, cx| match event {
                InputEvent::Submit => this.qa_ask(cx),
                InputEvent::Changed => cx.notify(),
                InputEvent::Escape => {
                    this.qa.open = false;
                    cx.notify();
                }
            });
            self.qa.input = Some(input);
            self.qa._sub = Some(sub);
        }
        cx.notify();
    }

    /// POST /api/qa: every action answers with the question as it is now.
    fn qa_act(&mut self, body: Value, then: impl FnOnce(&mut Self, &Value) + 'static, cx: &mut Context<Self>) {
        self.qa.error = None;
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.settings_post("/api/qa", body) }).await;
            this.update(cx, |this, cx| {
                this.qa.busy = false;
                match result {
                    Ok(v) => {
                        if let Some(q) = v.get("question").filter(|q| q.is_object()).and_then(|q| serde_json::from_value::<Question>(q.clone()).ok()) {
                            upsert(&mut this.qa.questions, q);
                        }
                        then(this, &v);
                    }
                    Err(e) => {
                        let text = e.to_string();
                        this.qa.error = Some(if text.is_empty() { "That did not work.".into() } else { text });
                    }
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    fn qa_ask(&mut self, cx: &mut Context<Self>) {
        let Some(input) = self.qa.input.clone() else { return };
        let text: String = input.read(cx).text().chars().take(TEXT_LIMIT).collect();
        if text.trim().is_empty() || self.qa.busy {
            return;
        }
        self.qa.busy = true;
        let channel = self.qa.channel.clone();
        self.qa_act(
            json!({ "action": "ask", "channelId": channel, "text": text }),
            move |this, v| {
                if let Some(id) = v.pointer("/question/id").and_then(Value::as_str) {
                    this.qa.voted.insert(id.to_string());
                }
            },
            cx,
        );
        input.update(cx, |i, cx| i.clear(cx));
    }

    fn qa_vote(&mut self, id: String, cx: &mut Context<Self>) {
        let key = id.clone();
        self.qa_act(
            json!({ "action": "vote", "id": id }),
            move |this, v| {
                if v.get("voted").and_then(Value::as_bool).unwrap_or(false) {
                    this.qa.voted.insert(key);
                } else {
                    this.qa.voted.remove(&key);
                }
            },
            cx,
        );
    }

    fn qa_host(&mut self, action: &'static str, id: String, cx: &mut Context<Self>) {
        let key = id.clone();
        self.qa_act(
            json!({ "action": action, "id": id }),
            move |this, _| {
                if action == "hide" {
                    this.qa.questions.retain(|q| q.id != key);
                }
            },
            cx,
        );
    }

    /// `.qa-banner`: the pinned question, over the stage (to the left of an open panel).
    pub(super) fn render_qa_banner(&self) -> Option<AnyElement> {
        let pinned = self.qa.questions.iter().find(|q| q.pinned)?;
        let coral: Hsla = Theme::coral().into();
        let beside = self.qa.open;
        Some(
            div()
                .absolute()
                .top(px(64.))
                .left_0()
                .right_0()
                .flex()
                .when(!beside, |d| d.justify_center())
                .when(beside, |d| d.pl(px(16.)).pr(px(384.)))
                .child(
                    div()
                        .max_w(px(820.))
                        .flex()
                        .items_center()
                        .gap(px(8.))
                        .px(px(16.))
                        .py(px(10.))
                        .rounded(px(14.))
                        .bg(mix(Theme::panel(), 0.92, coral))
                        .border_1()
                        .border_color(mix(coral, 0.45, Theme::line()))
                        .shadow(shadow_md())
                        .text_color(Theme::ink())
                        .child(ui::icon("message-circle-question-mark", 16., coral))
                        .child(div().flex_none().text_size(px(11.2)).font_weight(FontWeight::BOLD).text_color(coral).child("NOW ANSWERING"))
                        .child(div().min_w_0().font_weight(FontWeight::SEMIBOLD).child(pinned.text.clone()))
                        .child(div().flex_none().text_size(px(12.8)).text_color(Theme::muted()).child(format!("— {}", pinned.author))),
                )
                .into_any_element(),
        )
    }

    /// `.qa-panel`: on the right of the stage, over it.
    pub(super) fn render_qa_panel(&self, cx: &mut Context<Self>) -> Option<AnyElement> {
        if !self.qa.open || self.qa.channel.is_none() {
            return None;
        }
        let input = self.qa.input.clone()?;
        let muted: Hsla = Theme::muted().into();
        let lavender: Hsla = Theme::lavender().into();
        let coral: Hsla = Theme::coral().into();
        let can_send = !input.read(cx).text().trim().is_empty() && !self.qa.busy;
        let small_button = |id: String, glyph: &'static str, tip: &'static str| {
            div()
                .id(SharedString::from(id))
                .p(px(4.))
                .rounded(px(6.))
                .cursor_pointer()
                .hover(|s| s.bg(Theme::line()))
                .tooltip(ui::tooltip(tip))
                .child(ui::icon(glyph, 14., muted))
        };
        let mut list = div().id("qa-list").flex_1().min_h_0().overflow_y_scroll().px(px(8.)).pb(px(8.)).flex().flex_col();
        for q in &self.qa.questions {
            let voted = self.qa.voted.contains(&q.id);
            let (vote_id, pin_id, answer_id, hide_id) = (q.id.clone(), q.id.clone(), q.id.clone(), q.id.clone());
            let mine = q.user_id == self.me.id;
            list = list.child(
                div()
                    .flex()
                    .items_start()
                    .gap(px(8.))
                    .px(px(6.))
                    .py(px(8.))
                    .rounded(px(10.))
                    .when(q.pinned, |d| d.bg(coral.opacity(0.12)))
                    .when(q.answered, |d| d.opacity(0.55))
                    .child(
                        div()
                            .id(SharedString::from(format!("qa-vote-{}", q.id)))
                            .flex_none()
                            .min_w(px(34.))
                            .px(px(4.))
                            .py(px(2.))
                            .rounded(px(8.))
                            .border_1()
                            .border_color(if voted { lavender } else { Theme::line().into() })
                            .flex()
                            .flex_col()
                            .items_center()
                            .text_size(px(12.))
                            .font_weight(FontWeight::BOLD)
                            .text_color(if voted { lavender } else { muted })
                            .cursor_pointer()
                            .child(ui::icon("chevron-up", 14., if voted { lavender } else { muted }))
                            .child(q.votes.to_string())
                            .on_click(cx.listener(move |this, _, _, cx| this.qa_vote(vote_id.clone(), cx))),
                    )
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .child(div().text_size(px(13.6)).text_color(Theme::ink()).child(q.text.clone()))
                            .child(div().text_size(px(11.2)).text_color(muted).child(format!(
                                "{}{}",
                                q.author,
                                if q.pinned { " · on stage now" } else if q.answered { " · answered" } else { "" }
                            ))),
                    )
                    .child(
                        div()
                            .flex()
                            .gap(px(2.))
                            .when(self.qa.can_host, |d| {
                                d.child(small_button(format!("qa-pin-{}", q.id), "pin", if q.pinned { "Take off stage" } else { "Show on stage" }).on_click(cx.listener(move |this, _, _, cx| this.qa_host("pin", pin_id.clone(), cx))))
                                    .child(small_button(format!("qa-ans-{}", q.id), "check", if q.answered { "Reopen" } else { "Mark answered" }).on_click(cx.listener(move |this, _, _, cx| this.qa_host("answer", answer_id.clone(), cx))))
                            })
                            .when(self.qa.can_host || mine, |d| d.child(small_button(format!("qa-hide-{}", q.id), "eye-off", "Hide").on_click(cx.listener(move |this, _, _, cx| this.qa_host("hide", hide_id.clone(), cx))))),
                    ),
            );
        }
        if self.qa.loaded && self.qa.questions.is_empty() {
            list = list.child(div().p(px(16.)).text_center().text_size(px(12.8)).text_color(muted).child("No questions yet. Ask the first one!"));
        }
        Some(
            div()
                .id("qa-panel")
                .occlude()
                .absolute()
                .top(px(12.))
                .right(px(12.))
                .bottom(px(84.))
                .w(px(360.))
                .flex()
                .flex_col()
                .rounded(px(14.))
                .bg(Theme::panel())
                .border_1()
                .border_color(Theme::line())
                .shadow(shadow_md())
                .overflow_hidden()
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(8.))
                        .px(px(12.))
                        .py(px(10.))
                        .border_b_1()
                        .border_color(Theme::line())
                        .child(div().flex_none().mr(px(2.)).font_weight(FontWeight::BOLD).text_color(Theme::ink()).child("Q&A"))
                        .child(div().text_size(px(12.)).text_color(muted).child(format!("{} open", self.qa_open_count())))
                        .child(
                            div()
                                .id("qa-close")
                                .ml_auto()
                                .cursor_pointer()
                                .tooltip(ui::tooltip("Close Q&A"))
                                .child(ui::icon("x", 16., muted))
                                .on_click(cx.listener(|this, _, _, cx| {
                                    this.qa.open = false;
                                    cx.notify();
                                })),
                        ),
                )
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(6.))
                        .px(px(12.))
                        .py(px(10.))
                        .child(
                            div()
                                .flex_1()
                                .min_w_0()
                                .h(px(38.))
                                .flex()
                                .items_center()
                                .px(px(10.))
                                .rounded(px(8.))
                                .border_1()
                                .border_color(Theme::line())
                                .bg(Theme::card())
                                .text_color(Theme::ink())
                                .child(input),
                        )
                        .child(
                            div()
                                .id("qa-ask")
                                .h(px(38.))
                                .flex()
                                .items_center()
                                .px(px(12.))
                                .text_size(px(16.))
                                .rounded(px(8.))
                                .bg(lavender)
                                .text_color(Theme::on_accent())
                                .font_weight(FontWeight::SEMIBOLD)
                                .when(!can_send, |d| d.opacity(0.5))
                                .when(can_send, |d| d.cursor_pointer().on_click(cx.listener(|this, _, _, cx| this.qa_ask(cx))))
                                .child("Ask"),
                        ),
                )
                .when_some(self.qa.error.clone(), |d, e| d.child(div().mx(px(12.)).mb(px(6.)).text_size(px(12.)).text_color(coral).child(e)))
                .child(list)
                .into_any_element(),
        )
    }
}

/// --shadow-md (dark themes).
fn shadow_md() -> Vec<gpui::BoxShadow> {
    vec![
        gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.42), offset: gpui::point(px(0.), px(6.)), blur_radius: px(20.), spread_radius: px(0.) },
        gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.3), offset: gpui::point(px(0.), px(2.)), blur_radius: px(6.), spread_radius: px(0.) },
    ]
}

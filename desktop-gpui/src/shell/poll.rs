//! PollCard (poll-card.tsx): the question with Public/Private, a bar per option (click to vote,
//! again to take it back), who voted (public polls), and the totals. Tallies arrive over the hub.

use gpui::{AnyElement, Context, FontWeight, Hsla, SharedString, Window, div, prelude::*, px, rgb};
use serde_json::Value;

use super::Shell;
use crate::model::Message;
use crate::theme::Theme;
use crate::ui;

#[derive(Clone, Default)]
pub(super) struct PollState {
    pub counts: Vec<f64>,
    pub mine: Vec<usize>,
    pub private: bool,
    pub voters: Vec<Vec<String>>,
    pub busy: bool,
}

fn voters_of(v: &Value) -> Option<Vec<Vec<String>>> {
    v.as_array().map(|lists| {
        lists
            .iter()
            .map(|l| l.as_array().map(|a| a.iter().filter_map(|p| p.get("name").and_then(Value::as_str).map(str::to_string)).collect()).unwrap_or_default())
            .collect()
    })
}

impl Shell {
    fn apply_poll(&self, poll_id: &str, data: &Value) {
        let mut polls = self.polls.borrow_mut();
        let state = polls.entry(poll_id.to_string()).or_default();
        if let Some(counts) = data.get("counts").and_then(Value::as_array) {
            state.counts = counts.iter().map(|c| c.as_f64().unwrap_or(0.)).collect();
        }
        if let Some(mine) = data.get("mine").and_then(Value::as_array) {
            state.mine = mine.iter().filter_map(|c| c.as_u64().map(|n| n as usize)).collect();
        }
        if let Some(private) = data.get("isPrivate").and_then(Value::as_bool) {
            state.private = private;
        }
        if let Some(voters) = data.get("voters").or_else(|| data.get("voterLists")).and_then(voters_of) {
            state.voters = voters;
        }
    }

    /// The hub's `poll` event: new tallies (and voter lists) for a poll.
    pub(super) fn on_poll_event(&mut self, value: &Value, cx: &mut Context<Self>) {
        let Some(id) = value.get("pollId").and_then(Value::as_str).map(str::to_string) else { return };
        if self.polls.borrow().contains_key(&id) {
            self.apply_poll(&id, value);
            self.refresh_poll_rows(&id);
            cx.notify();
        }
    }

    fn refresh_poll_rows(&self, poll_id: &str) {
        if let Some(list) = self.channel_id.as_ref().and_then(|c| self.messages.get(c)) {
            for (ix, m) in list.iter().enumerate() {
                if m.payload.as_ref().and_then(|p| p.get("pollId")).and_then(Value::as_str) == Some(poll_id) {
                    self.list.splice(ix..ix + 1, 1);
                }
            }
        }
    }

    /// loadPollDetails, once per poll.
    fn load_poll(&self, poll_id: &str, cx: &mut Context<Self>) {
        if self.polls.borrow().contains_key(poll_id) {
            return;
        }
        self.polls.borrow_mut().insert(poll_id.to_string(), PollState::default());
        let (client, id) = (self.client.clone(), poll_id.to_string());
        cx.spawn(async move |this, cx| {
            let target = id.clone();
            let data = cx.background_executor().spawn(async move { client.poll(&target) }).await;
            this.update(cx, |this, cx| {
                if let Ok(data) = data {
                    this.apply_poll(&id, &data);
                    this.refresh_poll_rows(&id);
                    cx.notify();
                }
            })
            .ok();
        })
        .detach();
    }

    fn vote(&mut self, poll_id: String, choice: usize, cx: &mut Context<Self>) {
        {
            let mut polls = self.polls.borrow_mut();
            let state = polls.entry(poll_id.clone()).or_default();
            if state.busy {
                return;
            }
            state.busy = true;
        }
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let target = poll_id.clone();
            let data = cx.background_executor().spawn(async move { client.vote(&target, choice) }).await;
            this.update(cx, |this, cx| {
                // A failed vote just leaves the previous tallies in place.
                if let Ok(data) = data {
                    this.apply_poll(&poll_id, &data);
                }
                if let Some(state) = this.polls.borrow_mut().get_mut(&poll_id) {
                    state.busy = false;
                }
                this.refresh_poll_rows(&poll_id);
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    pub(super) fn render_poll(&self, message: &Message, width: f32, window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        if message.kind.as_deref() != Some("poll") {
            return None;
        }
        let payload = message.payload.as_ref()?;
        let poll_id = payload.get("pollId").and_then(Value::as_str)?.to_string();
        self.load_poll(&poll_id, cx);
        let state = self.polls.borrow().get(&poll_id).cloned().unwrap_or_default();
        let question = payload.get("question").and_then(Value::as_str).filter(|q| !q.is_empty()).map(str::to_string).unwrap_or_else(|| message.text.clone());
        let options: Vec<String> = payload.get("options").and_then(Value::as_array).map(|a| a.iter().map(|o| o.as_str().unwrap_or_default().to_string()).collect()).unwrap_or_default();
        let multi = payload.get("multi").and_then(Value::as_bool).unwrap_or(false);
        let total: f64 = state.counts.iter().sum();
        let muted: Hsla = Theme::muted().into();
        let lavender: Hsla = Theme::lavender().into();
        let card_w = width.min(440.);
        let inner = card_w - 28. - 2.;
        // Tailwind's indigo-500/300 and red-500/300.
        let (badge_fg, badge_tone, badge_icon, badge_label): (Hsla, Hsla, &str, &str) =
            if state.private { (rgb(0xfca5a5).into(), rgb(0xef4444).into(), "lock", "Private") } else { (rgb(0xa5b4fc).into(), rgb(0x6366f1).into(), "globe", "Public") };
        let mut list = div().flex().flex_col().gap(px(6.));
        for (index, option) in options.iter().enumerate() {
            let count = state.counts.get(index).copied().unwrap_or(0.);
            let percent = if total > 0. { (count / total * 100.).round() } else { 0. };
            let chosen = state.mine.contains(&index);
            let names = state.voters.get(index).cloned().unwrap_or_default();
            let id = poll_id.clone();
            let fill = (inner - 2.) * percent as f32 / 100.;
            list = list.child(
                div()
                    .my(px(4.))
                    .flex()
                    .flex_col()
                    .child(
                        div()
                            .id(SharedString::from(format!("poll-{}-{index}", message.id)))
                            .relative()
                            .w(px(inner))
                            .px(px(12.))
                            .py(px(9.))
                            .rounded(px(9.))
                            .bg(Theme::paper())
                            .border_1()
                            .border_color(if chosen { lavender } else { Theme::line().into() })
                            .hover(|s| s.border_color(Theme::lavender()))
                            .overflow_hidden()
                            .flex()
                            .items_center()
                            .gap(px(8.))
                            .cursor_pointer()
                            .child(div().absolute().left_0().top_0().bottom_0().w(px(fill)).bg(lavender.opacity(0.22)))
                            .child(div().relative().text_size(px(16.)).line_height(px(24.)).font_weight(if chosen { FontWeight(650.) } else { FontWeight::NORMAL }).text_color(Theme::ink()).child(format!("{} {option}", if chosen { "◉" } else { "○" })))
                            .child(div().relative().ml_auto().text_size(px(12.)).line_height(px(18.)).text_color(muted).child(format!("{}% · {}", percent as i64, count as i64)))
                            .on_click(cx.listener(move |this, _, _, cx| this.vote(id.clone(), index, cx))),
                    )
                    .when(!state.private && !names.is_empty(), |d| {
                        d.child(
                            div()
                                .pl(px(12.))
                                .pt(px(2.))
                                .flex()
                                .items_center()
                                .gap(px(4.))
                                .text_size(px(11.))
                                .line_height(px(16.5))
                                .text_color(rgb(0x9ca3af))
                                .child(div().font_weight(FontWeight::MEDIUM).text_color(rgb(0xd1d5db)).child("Voted by:"))
                                .child(names.join(", ")),
                        )
                    }),
            );
        }
        let foot = format!(
            "{} {}{}{}",
            total as i64,
            if total as i64 == 1 { "vote" } else { "votes" },
            if state.private { " · Anonymous voting" } else { " · Public votes visible" },
            if multi { " · Multi-choice allowed" } else { "" }
        );
        let _ = window;
        Some(
            div()
                .mt(px(4.))
                .w(px(card_w))
                .px(px(14.))
                .py(px(12.))
                .rounded(px(12.))
                .bg(Theme::panel())
                .border_1()
                .border_color(Theme::line())
                .flex()
                .flex_col()
                .child(
                    div()
                        .mb(px(10.))
                        .flex()
                        .items_center()
                        .justify_between()
                        .child(div().text_size(px(16.)).line_height(px(24.)).font_weight(FontWeight::BOLD).text_color(Theme::ink()).child(question))
                        .child(
                            div()
                                .px(px(8.))
                                .py(px(2.))
                                .rounded_full()
                                .bg(badge_tone.opacity(0.2))
                                .border_1()
                                .border_color(badge_tone.opacity(0.3))
                                .flex()
                                .items_center()
                                .gap(px(4.))
                                .text_size(px(11.))
                                .line_height(px(16.5))
                                .font_weight(FontWeight::SEMIBOLD)
                                .text_color(badge_fg)
                                .child(ui::icon(badge_icon, 11., badge_fg))
                                .child(badge_label),
                        ),
                )
                .child(list)
                .child(div().mt(px(9.)).text_size(px(12.)).line_height(px(18.)).text_color(muted).child(foot))
                .into_any_element(),
        )
    }
}

//! Right-click on a message: MessageContextMenu (app/components/chat/shell/message-context-menu.tsx)
//! with the actions message-row.tsx gives it, the notice bar its copy actions report to
//! (chat-main.tsx `.notice`), and the translation it can put under a message
//! (components/message-translation.tsx).

use gpui::{AnimationExt as _, AnyElement, ClipboardItem, Context, FontWeight, Pixels, Point, SharedString, Window, div, prelude::*, px};

use super::Shell;
use crate::i18n::{t, tv};
use crate::model::{Message, permission};
use crate::theme::Theme;
use crate::ui;

/// The open menu: which message, and where the right-click was.
pub(super) struct CtxMenu {
    pub message_id: String,
    pub at: Point<Pixels>,
}

/// "Translate" on a message (lib/message-translate.ts states).
pub(super) enum Translation {
    Loading,
    Done { text: String, to: String },
    Failed(String),
}

/// A question asked with showCustomConfirm before something that cannot be taken back.
pub(super) struct Confirm {
    pub title: String,
    pub text: String,
    pub ok: String,
    pub cancel: String,
    pub action: ConfirmAction,
}

#[derive(Clone)]
pub(super) enum ConfirmAction {
    Delete(String),
    Report(String),
    LeaveServer(String),
    DeleteServer(String),
}

#[derive(Clone, Copy)]
enum Item {
    AddReaction,
    Edit,
    Delete,
    Reply,
    Forward,
    Thread,
    CopyText,
    Translate,
    Pin,
    Bookmark,
    Reminder,
    Apps,
    MarkUnread,
    CopyLink,
    Speak,
    Report,
    CopyId,
}

enum Row {
    Item { item: Item, label: String, icon: &'static str, danger: bool, disabled: bool },
    Separator,
}

/// `.msg-ctx-menu`: 220 wide, 6px padding inside a 1px border; items 7px 9px around a 19.5px line;
/// separators 1px with 4px above and below.
const MENU_W: f32 = 220.;
const ITEM_H: f32 = 33.5;
const SEPARATOR_H: f32 = 9.;

impl Shell {
    /// canPin: anyone in a DM; in a server, MANAGE_MESSAGES (owners, admins and ADMINISTRATOR have
    /// everything), worked out like myPermissions in use-shell-session.ts.
    pub(super) fn can_pin(&self) -> bool {
        if self.home {
            return true;
        }
        let Some(server) = self.server() else { return false };
        if self.me.is_admin || server.owner_id.as_deref() == Some(self.me.id.as_str()) {
            return true;
        }
        let mine: Vec<String> = self
            .members
            .get(&server.id)
            .and_then(|list| list.iter().find(|m| m.id == self.me.id))
            .and_then(|m| m.role_ids.get(&server.id))
            .and_then(|v| v.as_array())
            .map(|ids| ids.iter().filter_map(|i| i.as_str().map(str::to_string)).collect())
            .unwrap_or_default();
        let mut mask = server.everyone_permissions;
        for role in &server.roles {
            if mine.contains(&role.id) {
                mask |= role.permissions;
            }
        }
        mask & (permission::ADMINISTRATOR | permission::MANAGE_MESSAGES) != 0
    }

    pub(super) fn open_context_menu(&mut self, message_id: String, at: Point<Pixels>, cx: &mut Context<Self>) {
        self.ctx_menu = Some(CtxMenu { message_id, at });
        cx.notify();
    }

    pub(super) fn close_context_menu(&mut self, cx: &mut Context<Self>) {
        if self.ctx_menu.take().is_some() {
            cx.notify();
        }
    }

    pub(super) fn set_notice(&mut self, text: impl Into<String>, cx: &mut Context<Self>) {
        self.notice = Some(text.into());
        cx.notify();
    }

    fn find_message(&self, id: &str) -> Option<Message> {
        self.channel_id.as_ref().and_then(|c| self.messages.get(c)).and_then(|l| l.iter().find(|m| m.id == id)).cloned()
    }

    fn rows(&self, message: &Message) -> Vec<Row> {
        let item = |item, key: &str, icon, danger, disabled| Row::Item { item, label: t(key), icon, danger, disabled };
        let own = message.user_id.as_deref() == Some(self.me.id.as_str());
        let mut rows = vec![item(Item::AddReaction, "menu.addReaction", "smile-plus", false, false)];
        if own {
            rows.push(item(Item::Edit, "menu.editMessage", "square-pen", false, false));
            rows.push(Row::Separator);
            rows.push(item(Item::Delete, "menu.deleteMessage", "trash-2", true, false));
        } else {
            rows.push(item(Item::Reply, "menu.reply", "reply", false, false));
            rows.push(Row::Separator);
        }
        rows.push(item(Item::Forward, "menu.forward", "forward", false, false));
        rows.push(item(Item::Thread, "menu.createThread", "message-circle", false, false));
        rows.push(Row::Separator);
        rows.push(item(Item::CopyText, "menu.copyText", "copy", false, false));
        if !message.text.trim().is_empty() {
            rows.push(item(Item::Translate, "menu.translate", "languages", false, false));
        }
        let pin_key = if message.pinned { "menu.unpinMessage" } else { "menu.pinMessage" };
        rows.push(item(Item::Pin, pin_key, "pin", false, !self.can_pin()));
        let save_key = if self.saved.contains(&message.id) { "menu.removeBookmark" } else { "menu.bookmarkMessage" };
        rows.push(item(Item::Bookmark, save_key, "save", false, false));
        rows.push(item(Item::Reminder, "menu.createReminder", "clock", false, false));
        rows.push(item(Item::Apps, "menu.apps", "more-horizontal", false, false));
        rows.push(Row::Separator);
        rows.push(item(Item::MarkUnread, "menu.markUnread", "eye-off", false, false));
        rows.push(item(Item::CopyLink, "menu.copyMessageLink", "link", false, false));
        rows.push(item(Item::Speak, "menu.speakMessage", "speaker", false, false));
        if !own && !message.bot {
            rows.push(Row::Separator);
            rows.push(item(Item::Report, "menu.reportMessage", "shield-alert", false, false));
        }
        rows.push(Row::Separator);
        rows.push(item(Item::CopyId, "menu.copyMessageId", "award", false, false));
        rows
    }

    pub(super) fn render_context_menu(&self, window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let menu = self.ctx_menu.as_ref()?;
        let message = self.find_message(&menu.message_id)?;
        let rows = self.rows(&message);
        let height = 14.
            + rows.iter().map(|r| if matches!(r, Row::Separator) { SEPARATOR_H } else { ITEM_H }).sum::<f32>();
        // Kept 8px inside the window, measured like the useLayoutEffect does.
        let size = window.viewport_size();
        let (w, h) = (f32::from(size.width), f32::from(size.height));
        let (x, y) = (f32::from(menu.at.x), f32::from(menu.at.y));
        let left = if x + MENU_W > w - 8. { (w - MENU_W - 8.).max(8.) } else { x };
        let top = if y + height > h - 8. { (h - height - 8.).max(8.) } else { y };
        let at = menu.at;
        let mut card = div()
            .id("msg-ctx-menu")
            .absolute()
            .left(px(left))
            .top(px(top))
            .w(px(MENU_W))
            .max_h(px(h - 24.))
            .overflow_y_scroll()
            .p(px(6.))
            .rounded(px(12.))
            .bg(Theme::panel())
            .border_1()
            .border_color(fade(Theme::ink(), 0.14))
            .shadow(vec![
                gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.55), offset: gpui::point(px(0.), px(20.)), blur_radius: px(50.), spread_radius: px(0.) },
                gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.4), offset: gpui::point(px(0.), px(4.)), blur_radius: px(14.), spread_radius: px(0.) },
            ])
            .text_size(px(13.))
            .line_height(px(19.5))
            .text_color(Theme::ink())
            .flex()
            .flex_col()
            // A press anywhere else closes it (and still does whatever it was pressed on).
            .on_mouse_down_out(cx.listener(move |this, _, _, cx| {
                if this.ctx_menu.as_ref().is_some_and(|m| m.at == at) {
                    this.close_context_menu(cx);
                }
            }));
        for (ix, row) in rows.into_iter().enumerate() {
            card = card.child(match row {
                Row::Separator => div().flex_none().h(px(1.)).mx(px(2.)).my(px(4.)).bg(fade(Theme::ink(), 0.12)).into_any_element(),
                Row::Item { item, label, icon, danger, disabled } => {
                    let color = if danger { Theme::coral() } else { Theme::ink() };
                    let group = SharedString::from(format!("ctx-item-{ix}"));
                    let id = message.id.clone();
                    div()
                        .id(group.clone())
                        .group(group.clone())
                        .flex_none()
                        .h(px(ITEM_H))
                        .px(px(9.))
                        .gap(px(9.))
                        .flex()
                        .items_center()
                        .rounded(px(6.))
                        .text_color(color)
                        .when(disabled, |d| d.opacity(0.45))
                        .when(!disabled, |d| {
                            d.cursor_pointer()
                                .hover(move |s| s.bg(if danger { fade(Theme::coral(), 0.16) } else { fade(Theme::lavender(), 0.24) }))
                                .on_click(cx.listener(move |this, _, window, cx| this.run_item(item, id.clone(), window, cx)))
                        })
                        .child(
                            div()
                                .flex_none()
                                .size(px(16.))
                                .opacity(0.7)
                                .when(!disabled, |d| d.group_hover(group.clone(), |s| s.opacity(1.)))
                                .child(ui::icon(icon, 16., color)),
                        )
                        .child(div().flex_1().min_w_0().child(label))
                        .into_any_element()
                }
            });
        }
        Some(card.into_any_element())
    }

    /// What each item does: the handlers message-row.tsx passes to the menu.
    fn run_item(&mut self, item: Item, id: String, window: &mut Window, cx: &mut Context<Self>) {
        if let Some(menu) = self.ctx_menu.take() {
            self.ctx_at = menu.at;
        }
        let Some(message) = self.find_message(&id) else {
            cx.notify();
            return;
        };
        match item {
            Item::Edit => self.start_edit(id, message.text.clone(), window, cx),
            Item::Reply => self.start_reply(id, message.author.clone(), window, cx),
            Item::Delete => {
                self.confirm = Some(Confirm {
                    title: "Delete Message".into(),
                    text: "Are you sure you want to delete this message? Pro tip: You can delete while pressing Shift to skip this confirmation.".into(),
                    ok: "Delete".into(),
                    cancel: "Cancel".into(),
                    action: ConfirmAction::Delete(id),
                });
            }
            Item::Report => {
                let text = if self.home { t("report.dmConfirm") } else { "Report this message to the server moderators?".into() };
                self.confirm = Some(Confirm {
                    title: "Report Message".into(),
                    text,
                    ok: "Report".into(),
                    cancel: "Cancel".into(),
                    action: ConfirmAction::Report(id),
                });
            }
            Item::CopyText => {
                cx.write_to_clipboard(ClipboardItem::new_string(message.text.clone()));
                self.notice = Some("Message text copied.".into());
            }
            Item::CopyLink => {
                let server = if self.home { None } else { self.server_id.clone() };
                let channel = message.channel_id.clone().or_else(|| self.channel_id.clone());
                let link = self.client.message_link(&id, channel.as_deref(), server.as_deref());
                cx.write_to_clipboard(ClipboardItem::new_string(link));
                self.notice = Some("Message link copied.".into());
            }
            Item::CopyId => {
                cx.write_to_clipboard(ClipboardItem::new_string(id));
                self.notice = Some("Message ID copied.".into());
            }
            Item::Reminder => self.notice = Some("Reminder coming soon.".into()),
            Item::MarkUnread => self.notice = Some("Mark as unread coming soon.".into()),
            Item::Pin => self.toggle_pin(message, cx),
            Item::Bookmark => self.toggle_saved(id, cx),
            Item::Translate => self.translate(id, cx),
            // The picker opens as if from the hover bar's react button: 48px in from the card's right
            // edge, level with the right-click.
            Item::AddReaction => {
                let at = gpui::point(px(self.article_right(window) - 48.), self.ctx_at.y);
                self.open_reaction_picker(id, at, window, cx);
            }
            Item::Forward => self.open_forward(&message, window, cx),
            Item::Thread => self.open_thread(message, window, cx),
            // Not built yet here: read-aloud.
            Item::Speak | Item::Apps => {}
        }
        cx.notify();
    }

    pub(super) fn toggle_pin(&mut self, message: Message, cx: &mut Context<Self>) {
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let id = message.id.clone();
            let want = !message.pinned;
            let result = cx.background_executor().spawn(async move { client.pin_message(&id, want) }).await;
            this.update(cx, |this, cx| match result {
                Ok(pinned) => this.set_pinned(&message.id, pinned),
                Err(e) => this.set_notice(e.to_string(), cx),
            })
            .ok();
        })
        .detach();
    }

    /// A message's pin changed (from here or the hub's `message-pinned`).
    pub(super) fn set_pinned(&mut self, message_id: &str, pinned: bool) {
        for list in self.messages.values_mut() {
            if let Some(m) = list.iter_mut().find(|m| m.id == message_id) {
                m.pinned = pinned;
            }
        }
    }

    pub(super) fn toggle_saved(&mut self, id: String, cx: &mut Context<Self>) {
        let saved = self.saved.contains(&id);
        if saved {
            self.saved.remove(&id);
        } else {
            self.saved.insert(id.clone());
        }
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn({
                let id = id.clone();
                async move { client.set_saved(&id, !saved) }
            })
            .await;
            this.update(cx, |this, cx| match result {
                Ok(()) => {
                    if !saved {
                        this.toast("Saved. Find it under the bookmark at the top.", cx);
                    }
                }
                Err(e) => {
                    this.set_notice(e.to_string(), cx);
                    this.load_saved(cx);
                }
            })
            .ok();
        })
        .detach();
    }

    pub(super) fn load_saved(&mut self, cx: &mut Context<Self>) {
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.saved_ids() }).await;
            this.update(cx, |this, _| {
                if let Ok(ids) = result {
                    this.saved = ids.into_iter().collect();
                }
            })
            .ok();
        })
        .detach();
    }

    fn translate(&mut self, id: String, cx: &mut Context<Self>) {
        if matches!(self.translations.get(&id), Some(Translation::Loading)) {
            return;
        }
        self.translations.insert(id.clone(), Translation::Loading);
        self.refresh_message(&id);
        let client = self.client.clone();
        let to = crate::i18n::locale().to_string();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn({
                let id = id.clone();
                async move { client.translate(&id, &to) }
            })
            .await;
            this.update(cx, |this, cx| {
                let state = match result {
                    Ok((text, to)) => Translation::Done { text, to },
                    Err(e) => Translation::Failed(e.to_string()),
                };
                this.translations.insert(id.clone(), state);
                this.refresh_message(&id);
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    /// MessageTranslation: under the text, a soft quote with a 2px accent edge.
    pub(super) fn render_translation(&self, message_id: &str, cx: &mut Context<Self>) -> Option<AnyElement> {
        let state = self.translations.get(message_id)?;
        let hide = {
            let id = message_id.to_string();
            div()
                .id(SharedString::from(format!("tr-hide-{message_id}")))
                .underline()
                .cursor_pointer()
                .child(t("translate.hide"))
                .on_click(cx.listener(move |this, _, _, cx| {
                    if this.translations.remove(&id).is_some() {
                        this.refresh_message(&id);
                        cx.notify();
                    }
                }))
        };
        let small = |d: gpui::Div| d.flex().gap(px(8.)).mt(px(2.)).opacity(0.65).text_size(px(11.)).line_height(px(16.5));
        let body = match state {
            Translation::Loading => div().child(t("translate.working")),
            Translation::Failed(error) => {
                let text = if error.is_empty() { t("translate.failed") } else { error.clone() };
                div().child(text).child(small(div()).child(hide))
            }
            Translation::Done { text, to } => {
                let language = locale_name(to);
                div()
                    .child(text.clone())
                    .child(small(div()).child(tv("translate.label", &[("language", language)])).child(hide))
            }
        };
        Some(
            body.mt(px(4.))
                .px(px(8.))
                .py(px(4.))
                .border_l_2()
                .border_color(gpui::rgb(0x5865f2))
                .rounded_r(px(6.))
                .bg(fade(Theme::ink(), 0.06))
                .into_any_element(),
        )
    }

    /// showToast: cards stacked at the bottom right, each gone after 3.5s.
    pub(super) fn toast(&mut self, text: impl Into<String>, cx: &mut Context<Self>) {
        self.toast_seq += 1;
        let id = self.toast_seq;
        self.toasts.push((id, text.into()));
        cx.spawn(async move |this, cx| {
            cx.background_executor().timer(std::time::Duration::from_millis(3500)).await;
            this.update(cx, |this, cx| {
                this.toasts.retain(|(i, _)| *i != id);
                cx.notify();
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    /// `.toast-container` / `.toast-card.success` (components/toast.tsx), sliding in over 0.25s.
    pub(super) fn render_toasts(&self, cx: &mut Context<Self>) -> Option<AnyElement> {
        if self.toasts.is_empty() {
            return None;
        }
        let mut stack = div().absolute().right(px(24.)).bottom(px(24.)).flex().flex_col().gap(px(10.));
        for (id, text) in &self.toasts {
            let id = *id;
            let card = div()
                .id(SharedString::from(format!("toast-{id}")))
                .min_w(px(260.))
                .max_w(px(380.))
                .px(px(16.))
                .py(px(12.))
                .rounded(px(8.))
                .bg(gpui::rgb(0x2b2d31))
                .border_1()
                .border_color(gpui::rgba(0xffffff1a))
                .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.4), offset: gpui::point(px(0.), px(8.)), blur_radius: px(24.), spread_radius: px(0.) }])
                .flex()
                .items_center()
                .gap(px(12.))
                .text_color(gpui::rgb(0xf2f3f5))
                .text_size(px(14.))
                .font_weight(FontWeight::MEDIUM)
                .child(div().flex_none().size(px(18.)).child(ui::icon("circle-check", 18., gpui::rgb(0x23a55a))))
                .child(div().flex_1().min_w_0().line_height(px(19.6)).child(text.clone()))
                .child(
                    div()
                        .id(SharedString::from(format!("toast-x-{id}")))
                        .flex_none()
                        .p(px(2.))
                        .cursor_pointer()
                        .child(ui::icon("x", 14., gpui::rgb(0x949ba4)))
                        .on_click(cx.listener(move |this, _, _, cx| {
                            this.toasts.retain(|(i, _)| *i != id);
                            cx.notify();
                        })),
                )
                .with_animation(
                    SharedString::from(format!("toast-in-{id}")),
                    gpui::Animation::new(std::time::Duration::from_millis(250)).with_easing(gpui::ease_out_quint()),
                    |card, delta| card.relative().top(px(16. * (1. - delta))).opacity(delta),
                );
            stack = stack.child(card);
        }
        Some(stack.into_any_element())
    }

    /// The `.notice` bar between the messages and the composer: a click dismisses it.
    pub(super) fn render_notice(&self, cx: &mut Context<Self>) -> Option<AnyElement> {
        let text = self.notice.clone()?;
        Some(
            div()
                .id("notice")
                .flex_none()
                .mx(px(25.))
                .mb(px(8.))
                .px(px(12.))
                .py(px(9.))
                .rounded(px(10.))
                .bg(gpui::rgb(0x2e2750))
                .border_1()
                .border_color(gpui::rgb(0x3d2f6b))
                .text_color(gpui::rgb(0xc4b5fd))
                .text_size(px(11.))
                .line_height(px(16.5))
                .cursor_pointer()
                .flex()
                .justify_between()
                .child(div().child(text))
                .child(div().ml(px(10.)).text_size(px(16.)).line_height(px(24.)).child("×"))
                .on_click(cx.listener(|this, _, _, cx| {
                    this.notice = None;
                    cx.notify();
                }))
                .into_any_element(),
        )
    }

    /// showCustomConfirm: dimmed backdrop, card, title with ×, text, Cancel and the danger button.
    pub(super) fn render_confirm(&self, cx: &mut Context<Self>) -> Option<AnyElement> {
        let confirm = self.confirm.as_ref()?;
        let cancel = cx.listener(|this, _, _, cx| {
            this.confirm = None;
            cx.notify();
        });
        let action = confirm.action.clone();
        Some(
            div()
                .absolute()
                .inset_0()
                .p(px(16.))
                .bg(gpui::rgba(0x000000bf))
                .flex()
                .items_center()
                .justify_center()
                .child(
                    div()
                        .id("confirm")
                        .w(px(440.))
                        .p(px(24.))
                        .rounded(px(16.))
                        .bg(Theme::paper())
                        .border_1()
                        .border_color(Theme::line())
                        .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.6), offset: gpui::point(px(0.), px(20.)), blur_radius: px(50.), spread_radius: px(0.) }])
                        .flex()
                        .flex_col()
                        .child(
                            div()
                                .flex()
                                .items_center()
                                .justify_between()
                                .child(div().text_size(px(18.)).line_height(px(27.)).font_weight(FontWeight::BOLD).text_color(Theme::ink()).child(confirm.title.clone()))
                                .child(div().id("confirm-x").cursor_pointer().child(ui::icon("x", 18., Theme::muted())).on_click(cx.listener(|this, _, _, cx| {
                                    this.confirm = None;
                                    cx.notify();
                                }))),
                        )
                        .child(div().mt(px(16.)).text_size(px(14.)).line_height(px(21.)).text_color(Theme::muted()).child(confirm.text.clone()))
                        .child(
                            div()
                                .mt(px(24.))
                                .flex()
                                .justify_end()
                                .gap(px(10.))
                                .child(
                                    div()
                                        .id("confirm-cancel")
                                        .px(px(18.))
                                        .py(px(10.))
                                        .rounded(px(8.))
                                        .text_size(px(14.))
                                        .line_height(px(21.))
                                        .font_weight(FontWeight::SEMIBOLD)
                                        .text_color(Theme::ink())
                                        .cursor_pointer()
                                        .hover(|s| s.bg(Theme::hover()))
                                        .child(confirm.cancel.clone())
                                        .on_click(cancel),
                                )
                                .child(
                                    div()
                                        .id("confirm-ok")
                                        .px(px(18.))
                                        .py(px(10.))
                                        .rounded(px(10.))
                                        .bg(Theme::coral())
                                        .text_size(px(14.))
                                        .line_height(px(21.))
                                        .font_weight(FontWeight::SEMIBOLD)
                                        .text_color(gpui::white())
                                        .cursor_pointer()
                                        .hover(|s| s.opacity(0.9))
                                        .child(confirm.ok.clone())
                                        .on_click(cx.listener(move |this, _, _, cx| this.confirmed(action.clone(), cx))),
                                ),
                        ),
                )
                .into_any_element(),
        )
    }

    fn confirmed(&mut self, action: ConfirmAction, cx: &mut Context<Self>) {
        self.confirm = None;
        match action {
            ConfirmAction::Delete(id) => self.delete_message(id, cx),
            ConfirmAction::LeaveServer(id) => self.leave_server(id, cx),
            ConfirmAction::DeleteServer(id) => self.delete_server(id, cx),
            ConfirmAction::Report(id) => {
                let client = self.client.clone();
                let server = if self.home { None } else { self.server_id.clone() };
                let channel = self.channel_id.clone();
                let dm = self.home;
                cx.spawn(async move |this, cx| {
                    let result = cx.background_executor().spawn(async move { client.report(server.as_deref(), channel.as_deref(), &id) }).await;
                    this.update(cx, |this, cx| match result {
                        Ok(()) => this.set_notice(if dm { t("report.dmSent") } else { "Message reported to moderators.".into() }, cx),
                        Err(e) => this.set_notice(e.to_string(), cx),
                    })
                    .ok();
                })
                .detach();
                cx.notify();
            }
        }
    }
}

/// A colour at a share of its strength (`color-mix(in srgb, c N%, transparent)`).
fn fade(color: gpui::Rgba, share: f32) -> gpui::Hsla {
    gpui::Hsla::from(color).opacity(share)
}

/// LOCALES in lib/i18n.ts: each language by its own name.
fn locale_name(code: &str) -> &str {
    match code {
        "en" => "English",
        "tr" => "Türkçe",
        "es" => "Español",
        "de" => "Deutsch",
        "fr" => "Français",
        "pt-BR" => "Português (Brasil)",
        "nl" => "Nederlands",
        other => other,
    }
}

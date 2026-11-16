//! Group DMs: GroupDmDialog (components/group-dm-dialog.tsx, styled with the forward dialog's
//! classes) to start one from friends or add friends to one, GroupDmContextMenu (right-click on a
//! group in the DM list), and renameGroupDm / leaveGroupDm / removeFromGroupDm
//! (hooks/chat-shell/use-shell-actions.ts), all on /api/dms/groups.

use std::collections::HashSet;

use gpui::{AnyElement, Context, Entity, Focusable, FontWeight, Hsla, Pixels, Point, SharedString, Subscription, Window, div, prelude::*, px, rgb, rgba};
use serde_json::{Value, json};

use super::Shell;
use super::channel_tools::PromptKind;
use super::context_menu::{Confirm, ConfirmAction};
use crate::i18n::{t, tc, tv};
use crate::input::{InputEvent, Look, TextInput};
use crate::theme::Theme;
use crate::ui;

fn error_text(e: &anyhow::Error, fallback: &str) -> String {
    let text = e.to_string();
    if text.is_empty() { fallback.to_string() } else { text }
}

/// Most people a group DM can hold (GROUP_DM_LIMIT on the server).
const GROUP_LIMIT: usize = 10;

pub(super) struct GroupDialog {
    /// Adding to this group (its members shown as already in, no name field); else starting one.
    adding: Option<String>,
    existing: HashSet<String>,
    group_name: String,
    picked: Vec<String>,
    search: Entity<TextInput>,
    name: Entity<TextInput>,
    busy: bool,
    error: Option<String>,
    _subs: Vec<Subscription>,
}

pub(super) struct GroupMenu {
    pub channel: String,
    pub at: Point<Pixels>,
}

impl Shell {
    pub(super) fn open_group_dialog(&mut self, adding: Option<String>, window: &mut Window, cx: &mut Context<Self>) {
        let group = adding.as_ref().and_then(|c| self.dm(c)).and_then(|d| d.group.clone().map(|g| (d.user.name().to_string(), g)));
        let look = Look { size: 13., line_height: 19.5, height: 19.5, color: gpui::white(), placeholder: rgb(0x92909e).into() };
        let search = cx.new(|cx| TextInput::new(t("groupDmDialog.placeholder"), cx).look(look.clone()));
        let name = cx.new(|cx| TextInput::new(t("groupDmDialog.namePlaceholder"), cx).look(look));
        let subs = vec![
            cx.subscribe_in(&search, window, |this, _, event, window, cx| match event {
                InputEvent::Escape => this.close_group_dialog(window, cx),
                InputEvent::Changed => cx.notify(),
                InputEvent::Submit => {}
            }),
            cx.subscribe_in(&name, window, |this, _, event, window, cx| match event {
                InputEvent::Escape => this.close_group_dialog(window, cx),
                _ => cx.notify(),
            }),
        ];
        window.focus(&gpui::Focusable::focus_handle(&search, cx));
        self.group_menu = None;
        self.group_dialog = Some(GroupDialog {
            adding,
            existing: group.as_ref().map(|(_, g)| g.members.iter().map(|m| m.id.clone()).collect()).unwrap_or_default(),
            group_name: group.map(|(n, _)| n).unwrap_or_else(|| "the group".into()),
            picked: Vec::new(),
            search,
            name,
            busy: false,
            error: None,
            _subs: subs,
        });
        // The dialog lists your friends as they are now.
        self.load_side_data(cx);
        cx.notify();
    }

    pub(super) fn close_group_dialog(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.group_dialog.take().is_some() {
            window.focus(&gpui::Focusable::focus_handle(&self.composer, cx));
            cx.notify();
        }
    }

    fn seats_left(dialog: &GroupDialog) -> i64 {
        // You count toward the limit when starting a group.
        GROUP_LIMIT as i64 - if dialog.adding.is_some() { dialog.existing.len() as i64 } else { 1 } - dialog.picked.len() as i64
    }

    /// createGroupDm (one friend and no name opens your DM with them) or addToGroupDm.
    fn submit_group_dialog(&mut self, cx: &mut Context<Self>) {
        let Some(dialog) = self.group_dialog.as_mut() else { return };
        if dialog.picked.is_empty() || dialog.busy {
            return;
        }
        let name: String = dialog.name.read(cx).text().trim().chars().take(100).collect();
        let ids = dialog.picked.clone();
        if dialog.adding.is_none() && ids.len() == 1 && name.is_empty() {
            self.group_dialog = None;
            self.open_dm_with(ids[0].clone(), cx);
            return;
        }
        dialog.busy = true;
        dialog.error = None;
        let (method, body) = match &dialog.adding {
            Some(channel) => ("PATCH", json!({ "channelId": channel, "addUserIds": ids })),
            None => ("POST", json!({ "userIds": ids, "name": name })),
        };
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { if method == "POST" { client.settings_post("/api/dms/groups", body) } else { client.settings_patch("/api/dms/groups", body) } }).await;
            this.update(cx, |this, cx| {
                match result {
                    Ok(v) => {
                        if let Ok(list) = serde_json::from_value(v["conversations"].clone()) {
                            this.dms = list;
                        }
                        let created = v["channelId"].as_str().map(String::from);
                        this.group_dialog = None;
                        if let Some(channel) = created {
                            this.open_home(cx);
                            this.open_dm(channel, cx);
                        }
                    }
                    Err(e) => {
                        if let Some(d) = this.group_dialog.as_mut() {
                            d.busy = false;
                            d.error = Some(error_text(&e, "Could not do that."));
                        }
                    }
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    /// Every /api/dms/groups change answers with the conversations.
    fn group_call(&mut self, method: &'static str, body: Value, fallback: &'static str, cx: &mut Context<Self>) {
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    match method {
                        "DELETE" => client.settings_delete("/api/dms/groups", body),
                        _ => client.settings_patch("/api/dms/groups", body),
                    }
                })
                .await;
            this.update(cx, |this, cx| {
                match result {
                    Ok(v) => {
                        if let Ok(list) = serde_json::from_value::<Vec<crate::model::DmConversation>>(v["conversations"].clone()) {
                            // Left: out of the conversation you were reading.
                            if this.home && this.channel_id.as_ref().is_some_and(|c| !list.iter().any(|d| &d.channel_id == c)) {
                                this.channel_id = None;
                                this.close_stage();
                            }
                            this.dms = list;
                        }
                    }
                    Err(e) => this.set_notice(error_text(&e, fallback), cx),
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    /// renameGroupDm(): empty names the group after its members.
    pub(super) fn rename_group(&mut self, channel: String, window: &mut Window, cx: &mut Context<Self>) {
        let current = self.dm(&channel).and_then(|d| d.group.as_ref()).map(|g| g.name.clone()).unwrap_or_default();
        self.group_menu = None;
        self.open_prompt(PromptKind::RenameGroup(channel), "Rename group".into(), "Leave it empty to name the group after its members.".into(), current, "Group name", "Save", Some(100), window, cx);
    }

    pub(super) fn save_group_name(&mut self, channel: String, name: String, cx: &mut Context<Self>) {
        self.group_call("PATCH", json!({ "channelId": channel, "name": name.trim() }), "Could not rename it.", cx);
    }

    pub(super) fn confirm_leave_group(&mut self, channel: String, cx: &mut Context<Self>) {
        let name = self.dm(&channel).map(|d| d.user.name().to_string()).unwrap_or_default();
        self.group_menu = None;
        self.confirm = Some(Confirm {
            title: format!("Leave '{name}'"),
            text: "Are you sure you want to leave? You won't be able to rejoin unless someone adds you back.".into(),
            ok: "Leave Group".into(),
            cancel: t("common.cancel"),
            action: ConfirmAction::LeaveGroup(channel),
        });
        cx.notify();
    }

    pub(super) fn leave_group(&mut self, channel: String, cx: &mut Context<Self>) {
        self.group_call("DELETE", json!({ "channelId": channel }), "Could not leave it.", cx);
    }

    pub(super) fn confirm_remove_from_group(&mut self, channel: String, user_id: String, cx: &mut Context<Self>) {
        let Some(dm) = self.dm(&channel) else { return };
        let who = dm.group.as_ref().and_then(|g| g.members.iter().find(|m| m.id == user_id)).map(|m| m.name().to_string()).unwrap_or_default();
        self.confirm = Some(Confirm {
            title: format!("Remove {who}"),
            text: format!("Remove {who} from {}? They will lose access to its messages.", dm.user.name()),
            ok: "Remove".into(),
            cancel: t("common.cancel"),
            action: ConfirmAction::RemoveFromGroup(channel, user_id),
        });
        cx.notify();
    }

    pub(super) fn remove_from_group(&mut self, channel: String, user_id: String, cx: &mut Context<Self>) {
        self.group_call("DELETE", json!({ "channelId": channel, "userId": user_id }), "Could not remove them.", cx);
    }

    /// The owner of the open group may remove this person from it.
    pub(super) fn can_remove_from_group(&self, user_id: &str) -> Option<String> {
        if !self.home || user_id == self.me.id {
            return None;
        }
        let channel = self.channel_id.clone()?;
        let group = self.dm(&channel)?.group.as_ref()?;
        (group.owner_id.as_deref() == Some(self.me.id.as_str()) && group.members.iter().any(|m| m.id == user_id)).then_some(channel)
    }

    /// GroupDmContextMenu: the group, then Pin, Rename, Add members, Leave, Close conversation.
    pub(super) fn render_group_menu(&self, window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let menu = self.group_menu.as_ref()?;
        let dm = self.dm(&menu.channel)?;
        let count = dm.group.as_ref().map_or(0, |g| g.members.len());
        let muted: Hsla = Theme::muted().into();
        let item = |id: &'static str, label: String, danger: bool| {
            div()
                .id(id)
                .p(px(8.))
                .rounded(px(8.))
                .text_size(px(13.))
                .line_height(px(19.5))
                .text_color(if danger { Theme::coral().into() } else { Hsla::from(rgb(0xe6e7ee)) })
                .cursor_pointer()
                .hover(|s| s.bg(Hsla::from(Theme::lavender()).opacity(0.24)))
                .child(label)
        };
        let (channel, pinned) = (menu.channel.clone(), dm.pinned);
        let c = channel.clone();
        let card = div()
            .flex()
            .flex_col()
            .child(
                div()
                    .mb(px(6.))
                    .px(px(8.))
                    .pt(px(6.))
                    .pb(px(10.))
                    .border_b_1()
                    .border_color(rgb(0x41434f))
                    .flex()
                    .flex_col()
                    .gap(px(6.))
                    .child(div().text_size(px(16.)).line_height(px(24.)).font_weight(FontWeight::BOLD).text_color(rgb(0xf5f3ee)).child(dm.user.name().to_string()))
                    .child(div().text_size(px(12.)).line_height(px(15.)).text_color(muted).child(tc("sidebar.groupMembers", count as i64, &[]))),
            )
            .child(item("gm-pin", t(if pinned { "groupDmMenu.unpin" } else { "groupDmMenu.pin" }), false).on_click(cx.listener(move |this, _, _, cx| {
                this.group_menu = None;
                this.pin_dm(c.clone(), !pinned, cx);
            })))
            .child({
                let c = channel.clone();
                item("gm-rename", t("groupDmMenu.rename"), false).on_click(cx.listener(move |this, _, window, cx| this.rename_group(c.clone(), window, cx)))
            })
            .child({
                let c = channel.clone();
                item("gm-add", t("groupDmMenu.addMembers"), false).on_click(cx.listener(move |this, _, window, cx| this.open_group_dialog(Some(c.clone()), window, cx)))
            })
            .child({
                let c = channel.clone();
                item("gm-leave", t("groupDmMenu.leave"), true).on_click(cx.listener(move |this, _, _, cx| this.confirm_leave_group(c.clone(), cx)))
            })
            .child({
                let c = channel.clone();
                item("gm-close", t("groupDmMenu.closeConversation"), false).on_click(cx.listener(move |this, _, _, cx| {
                    this.group_menu = None;
                    this.close_dm(c.clone(), cx);
                }))
            });
        // Kept 12px inside the window; above the click when there is no room below it.
        let size = window.viewport_size();
        let height = 272.;
        let (x, y) = (f32::from(menu.at.x), f32::from(menu.at.y));
        let left = x.min(f32::from(size.width) - 230. - 12.).max(12.);
        let max_top = f32::from(size.height) - height - 12.;
        let top = (if y > max_top { (y - height).min(max_top) } else { y }).max(12.);
        let at = menu.at;
        Some(
            div()
                .id("group-menu")
                .absolute()
                .left(px(left))
                .top(px(top))
                .w(px(230.))
                .p(px(8.))
                .rounded(px(14.))
                .bg(rgb(0x202129))
                .border_1()
                .border_color(rgb(0x41434f))
                .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.45), offset: gpui::point(px(0.), px(24.)), blur_radius: px(60.), spread_radius: px(0.) }])
                .child(card)
                .on_mouse_down_out(cx.listener(move |this, _, _, cx| {
                    if this.group_menu.as_ref().is_some_and(|m| m.at == at) {
                        this.group_menu = None;
                        cx.notify();
                    }
                }))
                .into_any_element(),
        )
    }

    pub(super) fn render_group_dialog(&self, window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let dialog = self.group_dialog.as_ref()?;
        let muted: Hsla = rgb(0x8b83a7).into();
        let lavender: Hsla = Theme::lavender().into();
        let adding = dialog.adding.is_some();
        let seats = Self::seats_left(dialog);
        let query = dialog.search.read(cx).text().trim().to_lowercase();
        let friends = &self.friends.friends;
        let shown: Vec<&crate::model::Friend> =
            friends.iter().filter(|f| query.is_empty() || f.display_name.to_lowercase().contains(&query) || f.username.to_lowercase().contains(&query)).collect();

        let header = div()
            .flex()
            .justify_between()
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .child(div().size(px(36.)).flex_none().rounded(px(10.)).bg(lavender.opacity(0.15)).flex().items_center().justify_center().child(ui::icon("users", 18., lavender)))
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .child(
                                div().text_size(px(16.)).line_height(px(24.)).font_weight(FontWeight::BOLD).text_color(gpui::white()).child(if adding {
                                    tv("groupDmDialog.addTitleToGroup", &[("group", &dialog.group_name)])
                                } else {
                                    t("groupDmDialog.createGroupTitle")
                                }),
                            )
                            .child(div().mt(px(2.)).text_size(px(12.)).line_height(px(18.)).text_color(rgb(0xa19bb6)).child(if seats > 0 { tc("groupDmDialog.seatsLeft", seats, &[]) } else { t("groupDmDialog.full") })),
                    ),
            )
            .child(
                div()
                    .id("gd-close")
                    .flex_none()
                    .size(px(24.))
                    .p(px(4.))
                    .rounded(px(6.))
                    .cursor_pointer()
                    .hover(|s| s.bg(rgba(0xffffff14)))
                    .child(ui::icon("x", 16., muted))
                    .on_click(cx.listener(|this, _, window, cx| this.close_group_dialog(window, cx))),
            );

        let name_focused = dialog.name.read(cx).focus_handle(cx).is_focused(window);
        let name_field = div()
            .id("gd-name")
            .px(px(12.))
            .py(px(8.))
            .rounded(px(10.))
            .bg(rgba(0x00000040))
            .border_1()
            .border_color(if name_focused { lavender } else { rgba(0xffffff14).into() })
            .child(dialog.name.clone());

        let search_focused = dialog.search.read(cx).focus_handle(cx).is_focused(window);
        let search = div()
            .relative()
            .h(px(39.5))
            .pl(px(34.))
            .pr(px(12.))
            .flex()
            .items_center()
            .rounded(px(10.))
            .bg(rgb(0x171423))
            .border_1()
            .border_color(if search_focused { lavender } else { rgba(0xffffff14).into() })
            .when(search_focused, |d| d.shadow(vec![gpui::BoxShadow { color: lavender.opacity(0.32), offset: gpui::point(px(0.), px(0.)), blur_radius: px(0.), spread_radius: px(3.) }]))
            .child(div().absolute().left(px(11.)).top(px(11.75)).child(ui::icon("search", 14., muted)))
            .child(div().flex_1().child(dialog.search.clone()));

        let mut list = div().id("gd-list").max_h(px(190.)).overflow_y_scroll().pr(px(4.)).flex().flex_col().gap(px(3.));
        if shown.is_empty() {
            list = list.child(div().p(px(18.)).text_center().text_size(px(12.)).line_height(px(18.)).text_color(muted).child(t(if friends.is_empty() { "groupDmDialog.noFriends" } else { "groupDmDialog.noMatch" })));
        }
        for friend in shown {
            let already = dialog.existing.contains(&friend.id);
            let checked = already || dialog.picked.contains(&friend.id);
            let disabled = already || (!checked && seats <= 0);
            let id = friend.id.clone();
            list = list.child(
                div()
                    .id(SharedString::from(format!("gd-{}", friend.id)))
                    .flex_none()
                    .px(px(10.))
                    .py(px(7.))
                    .rounded(px(8.))
                    .border_1()
                    .border_color(if checked && !already { lavender.opacity(0.35) } else { gpui::transparent_black() })
                    .when(checked && !already, |d| d.bg(lavender.opacity(0.15)))
                    .when(disabled, |d| d.opacity(0.55))
                    .when(!disabled && !checked, |d| d.hover(|s| s.bg(rgba(0xffffff0d))))
                    .when(!disabled, |d| d.cursor_pointer())
                    .flex()
                    .items_center()
                    .justify_between()
                    .gap(px(8.))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(10.))
                            .min_w_0()
                            .flex_1()
                            .child(ui::avatar(self.picture(&friend.avatar_url), &friend.avatar, &friend.color, &friend.display_name, 28.))
                            .child(
                                div()
                                    .flex()
                                    .flex_col()
                                    .min_w_0()
                                    .flex_1()
                                    .child(div().truncate().text_size(px(13.)).line_height(px(19.5)).font_weight(FontWeight::SEMIBOLD).text_color(gpui::white()).child(friend.display_name.clone()))
                                    .child(div().truncate().text_size(px(11.)).line_height(px(16.5)).text_color(muted).child(if already { t("groupDmDialog.alreadyInGroup") } else { format!("@{}", friend.username) })),
                            ),
                    )
                    .child(
                        // `.group-dm-check`: a square box, Discord blurple when ticked.
                        div()
                            .size(px(18.))
                            .flex_none()
                            .rounded(px(4.))
                            .border(px(1.5))
                            .border_color(if checked { rgb(0x5865f2).into() } else { Hsla::from(rgba(0xffffff40)) })
                            .when(checked, |d| d.bg(rgb(0x5865f2)))
                            .flex()
                            .items_center()
                            .justify_center()
                            .when(checked, |d| d.child(ui::icon("check", 12., gpui::white()))),
                    )
                    .when(!disabled, |d| {
                        d.on_click(cx.listener(move |this, _, _, cx| {
                            if let Some(dialog) = this.group_dialog.as_mut() {
                                if let Some(i) = dialog.picked.iter().position(|p| p == &id) {
                                    dialog.picked.remove(i);
                                } else if Self::seats_left(dialog) > 0 {
                                    dialog.picked.push(id.clone());
                                }
                                cx.notify();
                            }
                        }))
                    }),
            );
        }

        let can_send = !dialog.picked.is_empty() && !dialog.busy;
        let on_accent = Theme::on_accent();
        let label = if adding {
            t("groupDmDialog.add")
        } else if dialog.picked.len() == 1 {
            t("groupDmDialog.createDm")
        } else {
            t("groupDmDialog.createGroupDm")
        };
        let footer = div()
            .flex()
            .items_center()
            .justify_end()
            .gap(px(10.))
            .child(
                div()
                    .id("gd-cancel")
                    .px(px(14.))
                    .py(px(7.))
                    .rounded(px(8.))
                    .border_1()
                    .border_color(rgba(0xffffff1a))
                    .text_size(px(13.))
                    .line_height(px(19.5))
                    .font_weight(FontWeight::MEDIUM)
                    .text_color(rgb(0xb8b0cf))
                    .cursor_pointer()
                    .hover(|s| s.bg(rgba(0xffffff0f)).text_color(gpui::white()))
                    .child(t("common.cancel"))
                    .on_click(cx.listener(|this, _, window, cx| this.close_group_dialog(window, cx))),
            )
            .child(
                div()
                    .id("gd-submit")
                    .px(px(16.))
                    .py(px(7.))
                    .rounded(px(8.))
                    .bg(lavender)
                    .flex()
                    .items_center()
                    .gap(px(6.))
                    .text_size(px(13.))
                    .line_height(px(19.5))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(on_accent)
                    .when(!can_send, |d| d.opacity(0.5))
                    .when(can_send, |d| {
                        d.cursor_pointer().hover(|s| s.bg(crate::theme::mix(Theme::lavender(), 0.82, gpui::black()))).on_click(cx.listener(|this, _, _, cx| this.submit_group_dialog(cx)))
                    })
                    .when(dialog.busy, |d| d.child(ui::icon("loader-2", 14., on_accent)))
                    .child(label),
            );

        Some(
            div()
                .id("gd-backdrop")
                .absolute()
                .inset_0()
                .bg(rgba(0x000000bf))
                .flex()
                .items_center()
                .justify_center()
                .on_mouse_down(gpui::MouseButton::Left, cx.listener(|this, _, window, cx| this.close_group_dialog(window, cx)))
                .child(
                    div()
                        .id("gd-card")
                        .w(px(480.))
                        .p(px(20.))
                        .rounded(px(16.))
                        .bg(rgb(0x1e1b2e))
                        .border_1()
                        .border_color(rgba(0xffffff1a))
                        .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.45), offset: gpui::point(px(0.), px(20.)), blur_radius: px(40.), spread_radius: px(0.) }])
                        .text_color(rgb(0xe8e3f5))
                        .flex()
                        .flex_col()
                        .gap(px(14.))
                        .on_mouse_down(gpui::MouseButton::Left, |_, _, cx| cx.stop_propagation())
                        .child(header)
                        .when(!adding, |d| d.child(name_field))
                        .child(search)
                        .child(list)
                        .when_some(dialog.error.clone(), |d, e| d.child(div().mx(px(16.)).mb(px(8.)).text_size(px(12.)).text_color(rgb(0xf23f43)).child(e)))
                        .child(footer),
                )
                .into_any_element(),
        )
    }
}

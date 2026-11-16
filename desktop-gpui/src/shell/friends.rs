//! The DMs home: its sidebar (panels.tsx, the `inDmHome` branch) and the friends view
//! (app/components/friends-view.tsx, set in Nunito like the web).

use gpui::{AnyElement, Context, FontWeight, IntoElement, SharedString, div, img, prelude::*, px, rgb, rgba};

use super::Shell;
use crate::i18n::{t, tv};
use crate::model::Friend;
use crate::theme::{DISPLAY_FONT, Theme};
use crate::ui::{self, icon};

const NUNITO: &str = "Nunito";

/// `.friend-avatar` takes the place of `.avatar`: 40px, the letter 17px at the normal weight, in
/// the text colour.
fn friend_avatar(picture: Option<String>, glyph: &str, color: &str, name: &str) -> AnyElement {
    ui::avatar_with(picture, glyph, color, name, 40., 17., FontWeight::NORMAL, Theme::ink().into())
}

#[derive(Clone, Copy, PartialEq)]
pub enum Tab {
    Online,
    All,
    Pending,
    Blocked,
    Add,
}

impl Shell {
    pub(super) fn render_home_sidebar(&self, cx: &mut Context<Self>) -> impl IntoElement {
        let friends_open = self.channel_id.is_none();
        let header = div()
            .flex_none()
            .pt(px(17.))
            .pl(px(19.))
            .pr(px(17.))
            .h(px(89.))
            .child(
                div()
                    .text_size(px(9.))
                    .line_height(px(13.5))
                    .font_weight(FontWeight::EXTRA_BOLD)
                    .text_color(Theme::lavender())
                    .child(t("sidebar.private")),
            )
            .child(
                div()
                    .mt(px(1.))
                    .font_family(DISPLAY_FONT)
                    .text_size(px(21.))
                    .line_height(px(24.15))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(Theme::ink())
                    .child(t("sidebar.dms")),
            );

        let mut nav = div()
            .id("dm-nav")
            .flex_1()
            .min_h_0()
            .overflow_y_scroll()
            .pt(px(7.))
            .px(px(10.))
            .pb(px(20.))
            .flex()
            .flex_col();
        // "Find or start a chat".
        nav = nav.child(
            div().flex_none().px(px(9.)).pb(px(8.)).child(
                div()
                    .id("find-chat")
                    .h(px(34.))
                    .px(px(12.))
                    .rounded(px(8.))
                    .bg(rgba(0xffffff0a))
                    .border_1()
                    .border_color(rgba(0xffffff0a))
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .cursor_pointer()
                    .text_color(Theme::muted())
                    .hover(|s| s.bg(rgba(0xffffff14)).text_color(gpui::white()))
                    .child(icon("search", 14., Theme::lavender()))
                    .child(div().truncate().text_size(px(12.)).line_height(px(16.)).font_weight(FontWeight::SEMIBOLD).child(t("sidebar.findConversation"))),
            ),
        );
        // Friends.
        nav = nav.child(
            div().flex_none().px(px(9.)).pb(px(8.)).child(
                div()
                    .id("friends")
                    .h(px(36.))
                    .px(px(12.))
                    .rounded(px(8.))
                    .flex()
                    .items_center()
                    .gap(px(12.))
                    .cursor_pointer()
                    .text_size(px(14.))
                    .line_height(px(20.))
                    .font_weight(FontWeight::BOLD)
                    .when(friends_open, |d| d.bg(rgba(0xffffff1f)).text_color(gpui::white()))
                    .when(!friends_open, |d| d.text_color(Theme::muted()).hover(|s| s.bg(rgba(0xffffff0d)).text_color(gpui::white())))
                    .child(icon("users", 18., if friends_open { Theme::lavender() } else { rgb(0x7c7599) }))
                    .child(div().flex_1().child(t("sidebar.friends")))
                    .when(!self.friends.incoming.is_empty(), |d| {
                        d.child(
                            div()
                                .px(px(8.))
                                .rounded_full()
                                .bg(rgb(0xf43f5e))
                                .text_color(gpui::white())
                                .text_size(px(11.))
                                .font_weight(FontWeight::BLACK)
                                .child(self.friends.incoming.len().to_string()),
                        )
                    })
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.channel_id = None;
                        cx.notify();
                    })),
            ),
        );
        // Direct messages + create and note-to-self.
        nav = nav.child(
            // Measured: the label's line box is 182–200 and the first row starts at 207.
            div()
                .flex_none()
                .h(px(25.))
                .pb(px(7.))
                .pl(px(8.))
                .pr(px(9.))
                .flex()
                .items_start()
                .justify_between()
                .text_size(px(12.))
                .line_height(px(18.))
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(Theme::muted())
                .child(t("sidebar.directMessages"))
                .child(
                    div()
                        .flex()
                        .gap(px(8.))
                        .child(
                            div()
                                .id("create-dm")
                                .cursor_pointer()
                                .tooltip(ui::tooltip(t("sidebar.createDm")))
                                .child(icon("plus", 14., rgb(0xa09ca4)))
                                .on_click(cx.listener(|this, _, window, cx| this.open_group_dialog(None, window, cx))),
                        )
                        .child(
                            div()
                                .id("note-self")
                                .cursor_pointer()
                                .tooltip(ui::tooltip(t("sidebar.noteToSelf")))
                                .child(icon("sticky-note", 14., rgb(0xa09ca4)))
                                .on_click(cx.listener(|this, _, _, cx| {
                                    let me = this.me.id.clone();
                                    this.open_dm_with(me, cx);
                                })),
                        ),
                ),
        );
        let mut dms: Vec<_> = self.dms.iter().filter(|d| !d.hidden).collect();
        dms.sort_by(|a, b| b.pinned.cmp(&a.pinned).then(b.last_at.cmp(&a.last_at)));
        if dms.is_empty() {
            nav = nav.child(div().px(px(10.)).pt(px(6.)).text_size(px(12.)).text_color(Theme::muted()).child(t("sidebar.noDms")));
        }
        for dm in dms {
            let selected = self.channel_id.as_deref() == Some(&dm.channel_id);
            let unread = !selected && self.reads.get(&dm.channel_id).is_some_and(|r| r.unread);
            let count = self.reads.get(&dm.channel_id).map_or(0, |r| r.count);
            let me = dm.user.id == self.me.id;
            let group_size = dm.group.as_ref().map(|g| g.members.len());
            let online = !me && group_size.is_none() && self.online.contains(&dm.user.id);
            let in_call = self.rooms.get(&dm.channel_id).is_some_and(|r| !r.is_empty());
            let id = dm.channel_id.clone();
            let name = if me { t("sidebar.myNotes") } else { dm.user.name().to_string() };
            // `.dm-row:hover`: the pin and close buttons show, the indicators under them hide.
            let group = SharedString::from(format!("dmrow-g-{}", dm.channel_id));
            let (pin_id, close_id, menu_user, menu_channel, pinned) = (dm.channel_id.clone(), dm.channel_id.clone(), dm.user.id.clone(), dm.channel_id.clone(), dm.pinned);
            let action = |key: String, name: &'static str, size: f32, color: gpui::Rgba, tip: String| {
                div()
                    .id(SharedString::from(key))
                    .size(px(22.))
                    .rounded(px(6.))
                    .flex()
                    .items_center()
                    .justify_center()
                    .cursor_pointer()
                    .hover(|s| s.bg(gpui::white().opacity(0.1)))
                    .tooltip(ui::tooltip(tip))
                    .child(icon(name, size, color))
            };
            nav = nav.child(
                div()
                    .id(SharedString::from(format!("dmrow-{}", dm.channel_id)))
                    .relative()
                    .flex_none()
                    .h(px(38.))
                    .pl(px(10.))
                    // The pin and close buttons (shown on hover) take the right end of the row.
                    .pr(px(56.))
                    .mx(px(1.))
                    .rounded(px(12.))
                    .flex()
                    .items_center()
                    .cursor_pointer()
                    .text_size(px(13.))
                    .line_height(px(19.5))
                    .font_weight(FontWeight::SEMIBOLD)
                    .when(selected, |d| d.bg(Theme::lavender_soft()).text_color(Theme::lavender()))
                    .when(!selected, |d| d.text_color(Theme::quiet()).hover(|s| s.bg(Theme::hover()).text_color(Theme::ink())))
                    .when(unread, |d| d.child(div().absolute().left(px(-11.)).top(px(15.)).w(px(4.)).h(px(8.)).rounded_r(px(4.)).bg(Theme::ink())))
                    .child(div().flex_none().mr(px(10.)).child(ui::avatar(self.picture(&dm.user.avatar_url), &dm.user.avatar, &dm.user.color, dm.user.name(), 24.)))
                    .when(group_size.is_none(), |d| d.child(div().min_w_0().truncate().child(name.clone())))
                    // `.dm-group-label`: the group's name over its member count.
                    .when_some(group_size, |d, n| {
                        d.child(
                            div()
                                .min_w_0()
                                .flex()
                                .flex_col()
                                .child(div().truncate().line_height(px(15.6)).child(name.clone()))
                                .child(div().text_size(px(11.)).line_height(px(13.2)).font_weight(FontWeight::MEDIUM).text_color(Theme::muted()).child(crate::i18n::tc("sidebar.groupMembers", n as i64, &[]))),
                        )
                    })
                    .group(group.clone())
                    .when(dm.pinned, |d| d.child(div().ml_auto().group_hover(group.clone(), |s| s.opacity(0.)).child(icon("pin", 11., Theme::lavender()))))
                    .when(me, |d| d.child(div().ml_auto().group_hover(group.clone(), |s| s.opacity(0.)).child(icon("sticky-note", 12., gpui::rgba(0xfbbf24cc)))))
                    .when(online, |d| d.child(div().ml(px(25.)).size(px(8.)).rounded_full().bg(Theme::mint()).group_hover(group.clone(), |s| s.opacity(0.))))
                    .when(in_call, |d| d.child(div().group_hover(group.clone(), |s| s.opacity(0.)).child(icon("phone-call", 12., Theme::mint()))))
                    .when(count > 0, |d| {
                        d.child(
                            div()
                                .group_hover(group.clone(), |s| s.opacity(0.))
                                .ml_auto()
                                .min_w(px(18.))
                                .h(px(18.))
                                .px(px(6.))
                                .rounded(px(9.))
                                .bg(Theme::badge())
                                .flex()
                                .items_center()
                                .justify_center()
                                .text_size(px(11.))
                                .font_weight(FontWeight::EXTRA_BOLD)
                                .text_color(gpui::white())
                                .child(count.to_string()),
                        )
                    })
                    // `.dm-row-actions`: pin and close, on the hovered row.
                    .child(
                        div()
                            .absolute()
                            .right(px(5.))
                            .top(px(7.))
                            .flex()
                            .items_center()
                            .gap(px(2.))
                            .opacity(0.)
                            .group_hover(group.clone(), |s| s.opacity(1.))
                            .child(
                                action(format!("dm-pin-{pin_id}"), "pin", 12., if pinned { Theme::lavender() } else { Theme::muted() }, t(if pinned { "sidebar.unpin" } else { "sidebar.pin" }))
                                    .on_click(cx.listener(move |this, _, _, cx| {
                                        cx.stop_propagation();
                                        this.pin_dm(pin_id.clone(), !pinned, cx);
                                    })),
                            )
                            .child(action(format!("dm-close-{close_id}"), "x", 13., Theme::muted(), t("sidebar.closeHint")).on_click(cx.listener(move |this, _, _, cx| {
                                cx.stop_propagation();
                                this.close_dm(close_id.clone(), cx);
                            }))),
                    )
                    .on_mouse_down(gpui::MouseButton::Right, cx.listener(move |this, e: &gpui::MouseDownEvent, _, cx| {
                        if group_size.is_some() {
                            this.user_menu = None;
                            this.group_menu = Some(super::group_dm::GroupMenu { channel: menu_channel.clone(), at: e.position });
                            cx.notify();
                        } else {
                            this.open_dm_user_menu(menu_user.clone(), menu_channel.clone(), pinned, e.position, cx);
                        }
                    }))
                    .on_click(cx.listener(move |this, _, _, cx| this.open_dm(id.clone(), cx))),
            );
        }

        div()
            .w(px(240.))
            .h_full()
            .flex_none()
            .flex()
            .flex_col()
            .pb(px(super::rail::FOOTER_ROOM))
            .bg(Theme::panel())
            .child(header)
            .child(nav)
    }

    pub(super) fn render_friends_view(&self, window: &gpui::Window, cx: &mut Context<Self>) -> impl IntoElement {
        let tab = self.friends_tab;
        let wide = f32::from(window.viewport_size().width) >= 1280.;
        let tab_button = |id: &'static str, label: String, which: Tab, count: Option<usize>, cx: &mut Context<Self>| {
            let active = tab == which;
            div()
                .id(id)
                .px(px(12.))
                .py(px(6.))
                .rounded(px(8.))
                .flex()
                .items_center()
                .gap(px(6.))
                .cursor_pointer()
                .when(active, |d| d.bg(Theme::panel()).text_color(Theme::ink()))
                .when(!active, |d| d.text_color(Theme::muted()).hover(|s| s.bg(Theme::panel()).text_color(Theme::ink())))
                .child(label)
                .when_some(count.filter(|c| *c > 0), |d, c| {
                    d.child(div().px(px(6.)).rounded_full().bg(Theme::line()).text_color(Theme::muted()).text_size(px(12.)).child(c.to_string()))
                })
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.friends_tab = which;
                    cx.notify();
                }))
        };
        let online_ids = &self.online;
        let online_count = self.friends.friends.iter().filter(|f| online_ids.contains(&f.id)).count();
        let header = div()
            .h(px(56.))
            .flex_none()
            .px(px(20.))
            .flex()
            .items_center()
            .border_b_1()
            .border_color(Theme::line())
            .bg(gpui::rgba(0x1e1a2ee6))
            .font_family(NUNITO)
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .pr(px(12.))
                    .border_r_1()
                    .border_color(Theme::line())
                    .text_size(px(16.))
                    .line_height(px(24.))
                    .font_weight(FontWeight::EXTRA_BOLD)
                    .text_color(Theme::ink())
                    .child(icon("users", 20., Theme::lavender()))
                    .child(t("sidebar.friends")),
            )
            .child(
                div()
                    .ml(px(12.))
                    .flex()
                    .items_center()
                    .gap(px(4.))
                    .text_size(px(14.))
                    .line_height(px(20.))
                    .font_weight(FontWeight::BOLD)
                    .child(tab_button("tab-online", t("friends.tab.online"), Tab::Online, Some(online_count), cx))
                    .child(tab_button("tab-all", t("friends.tab.all"), Tab::All, Some(self.friends.friends.len()), cx))
                    .child(
                        tab_button("tab-pending", t("friends.tab.pending"), Tab::Pending, None, cx).when(!self.friends.incoming.is_empty(), |d| {
                            // A red count, unlike the grey ones.
                            d.child(
                                div()
                                    .px(px(6.))
                                    .py(px(2.))
                                    .rounded_full()
                                    .bg(rgb(0xf43f5e))
                                    .text_size(px(10.))
                                    .line_height(px(12.5))
                                    .font_weight(FontWeight::BLACK)
                                    .text_color(gpui::white())
                                    .child(self.friends.incoming.len().to_string()),
                            )
                        }),
                    )
                    .child(tab_button("tab-blocked", t("friends.tab.blocked"), Tab::Blocked, Some(self.friends.blocked.len()), cx))
                    .child(
                        div()
                            .id("tab-add")
                            .ml(px(8.))
                            .h(px(28.))
                            .px(px(14.))
                            .rounded(px(8.))
                            .flex()
                            .items_center()
                            .gap(px(6.))
                            .cursor_pointer()
                            .text_size(px(12.))
                            .font_weight(FontWeight::EXTRA_BOLD)
                            .when(tab == Tab::Add, |d| d.bg(rgb(0x10b981)).text_color(gpui::white()))
                            .when(tab != Tab::Add, |d| d.bg(rgba(0x10b98126)).text_color(rgb(0x059669)))
                            .child(icon("user-plus", 14., if tab == Tab::Add { rgb(0xffffff) } else { rgb(0x059669) }))
                            .child(t("friends.tab.add"))
                            .on_click(cx.listener(|this, _, window, cx| {
                                this.friends_tab = Tab::Add;
                                // autoFocus: the username field takes the keyboard.
                                window.focus(&gpui::Focusable::focus_handle(&this.friends_add, cx));
                                cx.notify();
                            })),
                    ),
            );

        let body: AnyElement = match tab {
            // Under xl (1280 px) "Active now" sits above the list, and only when someone is.
            Tab::Online | Tab::All => div()
                .w_full()
                .max_w(px(768.))
                .when(!wide, |d| d.children(self.render_active_now(true, cx)))
                .child(self.render_friend_list(tab, cx))
                .into_any_element(),
            _ => self.render_friends_other(tab, cx).into_any_element(),
        };

        div()
            .size_full()
            .flex()
            .flex_col()
            .font_family(NUNITO)
            .child(header)
            .child(
                div()
                    .flex_1()
                    .min_h_0()
                    .flex()
                    .child(div().id("friends-body").flex_1().min_w_0().h_full().overflow_y_scroll().p(px(24.)).child(body))
                    // xl: the column on the right.
                    .when(wide, |d| {
                        d.child(
                            div()
                                .id("friends-active-now")
                                .w(px(340.))
                                .flex_none()
                                .h_full()
                                .overflow_y_scroll()
                                .border_l_1()
                                .border_color(Theme::line())
                                .p(px(20.))
                                .children(self.render_active_now(false, cx)),
                        )
                    }),
            )
    }

    fn render_friend_list(&self, tab: Tab, cx: &mut Context<Self>) -> impl IntoElement {
        let query = self.friends_search.read(cx).text().to_lowercase();
        let shown: Vec<&Friend> = self
            .friends
            .friends
            .iter()
            .filter(|f| tab == Tab::All || self.online.contains(&f.id))
            .filter(|f| query.is_empty() || f.name().to_lowercase().contains(&query) || f.username.to_lowercase().contains(&query))
            .collect();
        let heading = if tab == Tab::Online {
            tv("friends.onlineCount", &[("count", &shown.len().to_string())])
        } else {
            tv("friends.allCount", &[("count", &shown.len().to_string())])
        };
        let mut col = div()
            .max_w(px(768.))
            .flex()
            .flex_col()
            .child(
                div()
                    .h(px(38.))
                    .pl(px(40.))
                    .pr(px(12.))
                    .relative()
                    .rounded(px(12.))
                    .bg(Theme::panel())
                    .border_1()
                    .border_color(Theme::line())
                    .flex()
                    .items_center()
                    .child(div().absolute().left(px(13.)).top(px(10.)).child(icon("search", 16., Theme::muted())))
                    .child(div().flex_1().child(self.friends_search.clone())),
            )
            .child(div().h(px(24.)))
            .child(
                div()
                    .text_size(px(12.))
                    .line_height(px(16.))
                    .font_weight(FontWeight::BLACK)
                    .text_color(Theme::muted())
                    .child(heading),
            )
            .child(div().h(px(12.)));
        if shown.is_empty() {
            let none_at_all = self.friends.friends.is_empty();
            // friends-view.tsx: sleepy at rest on Online, waving when there are no friends at all,
            // shrugging when a search finds nobody.
            let (face, pose) = if tab == Tab::Online { ("sleepy", "rest") } else if none_at_all { ("happy", "wave") } else { ("surprised", "shrug") };
            let message = if none_at_all {
                t("friends.emptyAll")
            } else if tab == Tab::Online {
                t("friends.emptyOnline")
            } else {
                t("friends.noSearchResults")
            };
            col = col.child(
                div()
                    .py(px(64.))
                    .flex()
                    .flex_col()
                    .items_center()
                    .text_color(Theme::muted())
                    .child(img(format!("images/hoffy-{face}-{pose}.svg")).size(px(110.)))
                    .child(div().h(px(8.)))
                    .child(div().text_size(px(14.)).line_height(px(20.)).font_weight(FontWeight::MEDIUM).child(message))
                    .when(none_at_all, |d| {
                        d.child(
                            div()
                                .id("empty-add")
                                .mt(px(16.))
                                .px(px(16.))
                                .py(px(8.))
                                .rounded(px(12.))
                                .bg(Theme::send())
                                .text_color(rgb(0x15121f))
                                .text_size(px(12.))
                                .line_height(px(16.))
                                .font_weight(FontWeight::BOLD)
                                .cursor_pointer()
                                .hover(|s| s.opacity(0.9))
                                .child(t("friends.tab.add"))
                                .on_click(cx.listener(|this, _, window, cx| {
                                    this.friends_tab = Tab::Add;
                                    // autoFocus: the username field takes the keyboard.
                                    window.focus(&gpui::Focusable::focus_handle(&this.friends_add, cx));
                                    cx.notify();
                                })),
                        )
                    }),
            );
        }
        for (row, friend) in shown.into_iter().enumerate() {
            let online = self.online.contains(&friend.id);
            // customStatus, else (online) memberActivityLine, else @username.
            let activity_line = online.then(|| self.active_now().into_iter().find(|e| e.0.id == friend.id)).flatten().and_then(|(_, _, a, s)| {
                a.map(|a| tv(&format!("activity.{}", a["kind"].as_str().unwrap_or("playing")), &[("name", a["name"].as_str().unwrap_or_default())]))
                    .or_else(|| s.map(|s| tv("activity.listening", &[("name", s["song"].as_str().unwrap_or_default())])))
            });
            let line = friend.status_text().or(activity_line).unwrap_or_else(|| format!("@{}", friend.username));
            let user_id = friend.id.clone();
            col = col.child(
                div()
                    .id(SharedString::from(format!("friend-{}", friend.id)))
                    .py(px(12.))
                    .px(px(12.))
                    .rounded(px(12.))
                    .flex()
                    .items_center()
                    .gap(px(14.))
                    // `divide-y`: a line between rows, none under the last.
                    .when(row > 0, |d| d.border_t_1().border_color(Theme::line()))
                    .hover(|s| s.bg(gpui::rgba(0x1a162899)))
                    .child(
                        div()
                            .relative()
                            .child(friend_avatar(self.picture(&friend.avatar_url), &friend.avatar, &friend.color, friend.name()))
                            .child(
                                div()
                                    .absolute()
                                    .right(px(-2.))
                                    .bottom(px(-2.))
                                    .size(px(14.))
                                    .rounded_full()
                                    .border_2()
                                    .border_color(Theme::chat_bg())
                                    .bg(if online { rgb(0x4ade80) } else { rgb(0x6b7280) }),
                            ),
                    )
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .child(div().truncate().text_size(px(14.)).font_weight(FontWeight::BOLD).text_color(Theme::ink()).child(friend.name().to_string()))
                            .child(div().truncate().text_size(px(12.)).text_color(Theme::muted()).child(line)),
                    )
                    .child(
                        div()
                            .id(SharedString::from(format!("friend-msg-{}", friend.id)))
                            .p(px(10.))
                            .rounded(px(12.))
                            .bg(Theme::panel())
                            .cursor_pointer()
                            .hover(|s| s.bg(Theme::line()))
                            .tooltip(ui::tooltip(t("friends.message")))
                            .child(icon("message-square", 18., Theme::muted()))
                            .on_click(cx.listener(move |this, _, _, cx| this.open_dm_with(user_id.clone(), cx))),
                    )
                    // The ⋮ button and its menu: Remove Friend, Block.
                    .child({
                        let (menu_id, remove_id, block_id) = (friend.id.clone(), friend.id.clone(), friend.id.clone());
                        let open = self.friend_menu.as_deref() == Some(friend.id.as_str());
                        let rose: gpui::Hsla = rgb(0xf43f5e).into();
                        // gap-1 beside the message button (the row's own gap is 14).
                        div()
                            .relative()
                            .ml(px(-10.))
                            .child(
                                div()
                                    .id(SharedString::from(format!("friend-more-{}", friend.id)))
                                    .p(px(10.))
                                    .rounded(px(12.))
                                    .bg(Theme::panel())
                                    .cursor_pointer()
                                    .hover(|s| s.bg(Theme::line()))
                                    .tooltip(ui::tooltip(t("composer.moreOptions")))
                                    .child(icon("ellipsis-vertical", 18., Theme::muted()))
                                    .on_click(cx.listener(move |this, _, _, cx| {
                                        cx.stop_propagation();
                                        this.friend_menu = if this.friend_menu.as_deref() == Some(menu_id.as_str()) { None } else { Some(menu_id.clone()) };
                                        cx.notify();
                                    })),
                            )
                            .when(open, |d| {
                                let item = |id: String, name: &'static str, label: String, color: gpui::Hsla| {
                                    div()
                                        .id(SharedString::from(id))
                                        .px(px(14.))
                                        .py(px(8.))
                                        .flex()
                                        .items_center()
                                        .gap(px(8.))
                                        .text_color(color)
                                        .cursor_pointer()
                                        .hover(move |s| s.bg(rose.opacity(0.1)).text_color(rose))
                                        .child(icon(name, 14., color))
                                        .child(label)
                                };
                                d.child(
                                    gpui::deferred(
                                        div()
                                            .id("friend-menu")
                                            .occlude()
                                            .absolute()
                                            .right_0()
                                            .top(px(44.))
                                            .w(px(176.))
                                            .py(px(6.))
                                            .rounded(px(12.))
                                            .bg(Theme::panel())
                                            .border_1()
                                            .border_color(Theme::line())
                                            .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.25), offset: gpui::point(px(0.), px(25.)), blur_radius: px(50.), spread_radius: px(-12.) }])
                                            .text_size(px(12.))
                                            .line_height(px(16.))
                                            .font_weight(FontWeight::SEMIBOLD)
                                            .on_mouse_down_out(cx.listener(|this, _, _, cx| {
                                                this.friend_menu = None;
                                                cx.notify();
                                            }))
                                            .child(item(format!("friend-remove-{remove_id}"), "x", t("friends.removeFriend"), rose).on_click(cx.listener(move |this, _, _, cx| {
                                                this.friends_call("DELETE", remove_id.clone(), serde_json::Value::Null, cx)
                                            })))
                                            .child(item(format!("friend-block-{block_id}"), "shield-alert", t("userMenu.block"), Theme::muted().into()).on_click(cx.listener(move |this, _, _, cx| {
                                                this.friends_call("POST", "/api/friends/block".into(), serde_json::json!({ "targetId": block_id }), cx)
                                            }))),
                                    )
                                    .with_priority(1),
                                )
                            })
                    }),
            );
        }
        col
    }

    /// activeNow(): friends in a voice room of a server you are in, or sharing a game or a song
    /// while online; rooms first, then games, then music, by name within each.
    fn active_now(&self) -> Vec<(&Friend, Option<(String, String, String, String, Vec<crate::model::VoiceParticipant>)>, Option<serde_json::Value>, Option<serde_json::Value>)> {
        let now = chrono::Utc::now().timestamp_millis() as f64;
        let mut entries = Vec::new();
        for friend in &self.friends.friends {
            let room = self.servers.iter().find_map(|server| {
                server.channels.iter().find_map(|channel| {
                    let seats = self.rooms.get(&channel.id)?;
                    seats.iter().any(|p| p.id == friend.id && !p.bot).then(|| {
                        // Two tabs of one person are one person in the room.
                        let mut people: Vec<crate::model::VoiceParticipant> = Vec::new();
                        for seat in seats.iter().filter(|s| !s.bot) {
                            if !people.iter().any(|p| p.id == seat.id) {
                                people.push(seat.clone());
                            }
                        }
                        (server.id.clone(), server.name.clone(), channel.id.clone(), channel.name.clone(), people)
                    })
                })
            });
            let here = self.online.contains(&friend.id);
            let activity = friend.activity.clone().filter(|a| {
                here && a.is_object() && {
                    let limit = if a["manual"] == true { 12. * 60. * 60_000. } else { 9. * 60_000. };
                    now - a["updatedAt"].as_f64().unwrap_or(0.) <= limit
                }
            });
            let song = friend.spotify_activity.clone().filter(|s| {
                here && s.is_object() && s["isPlaying"] != false && s["updatedAt"].as_f64().is_none_or(|at| now - at <= 9. * 60_000.)
            });
            if room.is_none() && activity.is_none() && song.is_none() {
                continue;
            }
            entries.push((friend, room, activity, song));
        }
        let rank = |e: &(&Friend, Option<(String, String, String, String, Vec<crate::model::VoiceParticipant>)>, Option<serde_json::Value>, Option<serde_json::Value>)| if e.1.is_some() { 0 } else if e.2.is_some() { 1 } else { 2 };
        entries.sort_by(|a, b| rank(a).cmp(&rank(b)).then_with(|| a.0.display_name.cmp(&b.0.display_name)));
        entries
    }

    /// ActiveNowPanel: the column (with its quiet state), or `compact` above the list.
    fn render_active_now(&self, compact: bool, cx: &mut Context<Self>) -> Option<AnyElement> {
        let entries = self.active_now();
        if compact && entries.is_empty() {
            return None;
        }
        let mut section = div().when(compact, |d| d.mb(px(24.))).child(div().mb(px(12.)).text_size(px(12.)).line_height(px(16.)).font_weight(FontWeight::BLACK).text_color(Theme::muted()).child(t("friends.activeNow").to_uppercase()));
        if entries.is_empty() {
            return Some(
                section
                    .child(
                        div()
                            .p(px(16.))
                            .rounded(px(12.))
                            .border_1()
                            .border_color(Theme::line())
                            .bg(gpui::Hsla::from(Theme::panel()).opacity(0.5))
                            .flex()
                            .flex_col()
                            .items_center()
                            .child(div().text_size(px(14.)).line_height(px(20.)).font_weight(FontWeight::BOLD).text_color(Theme::ink()).child(t("friends.activeNow.quietTitle")))
                            .child(div().mt(px(4.)).text_size(px(12.)).line_height(px(19.5)).text_color(Theme::muted()).text_center().child(t("friends.activeNow.quietBody"))),
                    )
                    .into_any_element(),
            );
        }
        let my_room = self.call.as_ref().map(|c| c.channel_id.clone());
        let now = chrono::Utc::now().timestamp_millis() as f64;
        let mut list = div().flex().gap(px(10.)).when(compact, |d| d.flex_wrap()).when(!compact, |d| d.flex_col());
        for (friend, room, activity, song) in entries {
            let subtitle = match (&room, &activity, &song) {
                (Some(r), _, _) => tv("friends.activeNow.inRoom", &[("room", &r.3)]),
                (None, Some(a), _) => tv(&format!("activity.{}", a["kind"].as_str().unwrap_or("playing")), &[("name", a["name"].as_str().unwrap_or_default())]),
                (None, None, Some(s)) => tv("activity.listening", &[("name", s["song"].as_str().unwrap_or_default())]),
                _ => String::new(),
            };
            let id = friend.id.clone();
            let mut card = div()
                .p(px(12.))
                .rounded(px(12.))
                .border_1()
                .border_color(Theme::line())
                .bg(gpui::Hsla::from(Theme::panel()).opacity(0.6))
                .when(compact, |d| d.w(px(379.)))
                .child(
                    div()
                        .id(SharedString::from(format!("an-open-{id}")))
                        .flex()
                        .items_center()
                        .gap(px(10.))
                        .min_w_0()
                        .cursor_pointer()
                        .child(ui::avatar(self.picture(&friend.avatar_url), &friend.avatar, &friend.color, friend.name(), 32.))
                        .child(
                            div()
                                .min_w_0()
                                .child(div().truncate().text_size(px(14.)).line_height(px(20.)).font_weight(FontWeight::BOLD).text_color(Theme::ink()).child(friend.display_name.clone()))
                                .child(div().truncate().text_size(px(12.)).line_height(px(16.)).text_color(Theme::muted()).child(subtitle)),
                        )
                        .on_click(cx.listener(move |this, _, _, cx| this.open_dm_with(id.clone(), cx))),
                );
            if let Some((server_id, server_name, channel_id, channel_name, people)) = room {
                let here = my_room.as_deref() == Some(channel_id.as_str());
                let mut faces = div().flex().items_center();
                for (n, p) in people.iter().take(5).enumerate() {
                    faces = faces.child(div().when(n > 0, |d| d.ml(px(-6.))).rounded_full().border_2().border_color(Theme::panel()).child(ui::avatar(self.picture(&p.avatar_url), &p.avatar, &p.color, p.name(), 22.)));
                }
                if people.len() > 5 {
                    faces = faces.child(div().ml(px(10.)).text_size(px(11.)).font_weight(FontWeight::BOLD).text_color(Theme::muted()).child(format!("+{}", people.len() - 5)));
                }
                let (sid, cid) = (server_id.clone(), channel_id.clone());
                card = card.child(
                    div()
                        .mt(px(10.))
                        .p(px(10.))
                        .rounded(px(8.))
                        .bg(gpui::Hsla::from(Theme::chat_bg()).opacity(0.7))
                        .child(div().flex().items_center().gap(px(6.)).min_w_0().text_size(px(12.)).line_height(px(16.)).font_weight(FontWeight::BOLD).text_color(Theme::ink()).child(icon("volume-2", 14., Theme::lavender())).child(div().truncate().child(channel_name)))
                        .child(div().truncate().text_size(px(11.)).line_height(px(16.5)).text_color(Theme::muted()).child(server_name))
                        .child(
                            div()
                                .mt(px(8.))
                                .flex()
                                .items_center()
                                .justify_between()
                                .gap(px(8.))
                                .child(faces)
                                .child(if here {
                                    div().text_size(px(11.)).font_weight(FontWeight::BOLD).text_color(rgb(0x34d399)).child(t("friends.activeNow.here")).into_any_element()
                                } else {
                                    div()
                                        .id(SharedString::from(format!("an-join-{cid}")))
                                        .px(px(12.))
                                        .py(px(4.))
                                        .rounded(px(8.))
                                        .bg(Theme::send())
                                        .text_size(px(12.))
                                        .line_height(px(16.))
                                        .font_weight(FontWeight::BOLD)
                                        .text_color(Theme::on_accent())
                                        .cursor_pointer()
                                        .child(t("friends.activeNow.join"))
                                        .on_click(cx.listener(move |this, _, window, cx| {
                                            this.open_server(sid.clone(), cx);
                                            this.open_stage(cid.clone(), window, cx);
                                        }))
                                        .into_any_element()
                                }),
                        ),
                );
            }
            if let Some(a) = activity {
                let kind = a["kind"].as_str().unwrap_or("playing");
                let glyph = match kind {
                    "coding" => "code-xml",
                    "streaming" => "radio",
                    "app" => "app-window",
                    _ => "gamepad-2",
                };
                let minutes = ((now - a["startedAt"].as_f64().unwrap_or(now)) / 60_000.).floor() as i64;
                let elapsed = if minutes < 1 {
                    String::new()
                } else if minutes < 60 {
                    tv("activity.elapsed.minutes", &[("minutes", &minutes.to_string())])
                } else {
                    tv("activity.elapsed.hoursMinutes", &[("hours", &(minutes / 60).to_string()), ("minutes", &(minutes % 60).to_string())])
                };
                let line = [a["details"].as_str().unwrap_or_default().to_string(), elapsed].into_iter().filter(|s| !s.is_empty()).collect::<Vec<_>>().join(" · ");
                card = card.child(
                    div()
                        .mt(px(10.))
                        .flex()
                        .items_center()
                        .gap(px(10.))
                        .min_w_0()
                        .child(div().flex_none().size(px(36.)).rounded(px(8.)).bg(gpui::Hsla::from(Theme::chat_bg()).opacity(0.7)).flex().items_center().justify_center().child(icon(glyph, 18., Theme::lavender())))
                        .child(
                            div()
                                .min_w_0()
                                .child(div().truncate().text_size(px(12.)).line_height(px(16.)).font_weight(FontWeight::BOLD).text_color(Theme::ink()).child(a["name"].as_str().unwrap_or_default().to_string()))
                                .when(!line.is_empty(), |d| d.child(div().truncate().text_size(px(11.)).line_height(px(16.5)).text_color(Theme::muted()).child(line))),
                        ),
                );
            }
            if let Some(s) = song {
                let art: AnyElement = match s["albumArt"].as_str().filter(|u| !u.is_empty()) {
                    Some(url) => img(url.to_string()).flex_none().size(px(36.)).rounded(px(8.)).object_fit(gpui::ObjectFit::Cover).into_any_element(),
                    None => div().flex_none().size(px(36.)).rounded(px(8.)).bg(gpui::Hsla::from(Theme::chat_bg()).opacity(0.7)).flex().items_center().justify_center().child(icon("music-2", 18., rgb(0x34d399))).into_any_element(),
                };
                card = card.child(
                    div()
                        .mt(px(10.))
                        .flex()
                        .items_center()
                        .gap(px(10.))
                        .min_w_0()
                        .child(art)
                        .child(
                            div()
                                .min_w_0()
                                .child(div().truncate().text_size(px(12.)).line_height(px(16.)).font_weight(FontWeight::BOLD).text_color(Theme::ink()).child(s["song"].as_str().unwrap_or_default().to_string()))
                                .child(div().truncate().text_size(px(11.)).line_height(px(16.5)).text_color(Theme::muted()).child(s["artist"].as_str().unwrap_or_default().to_string())),
                        ),
                );
            }
            list = list.child(card);
        }
        section = section.child(list);
        Some(section.into_any_element())
    }

    /// loadFriends().
    pub(super) fn reload_friends(&mut self, cx: &mut Context<Self>) {
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let data = cx.background_executor().spawn(async move { client.friends() }).await;
            this.update(cx, |this, cx| {
                if let Ok(data) = data {
                    this.friends = data;
                    cx.notify();
                }
            })
            .ok();
        })
        .detach();
    }

    /// A friends call (accept, decline, remove, block): then the lists again.
    fn friends_call(&mut self, method: &'static str, path: String, body: serde_json::Value, cx: &mut Context<Self>) {
        self.friend_menu = None;
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let _ = cx
                .background_executor()
                .spawn(async move { if method == "DELETE" { client.remove_friend(&path).map(|_| serde_json::Value::Null) } else { client.settings_post(&path, body) } })
                .await;
            this.update(cx, |this, cx| this.reload_friends(cx)).ok();
        })
        .detach();
        cx.notify();
    }

    /// handleSendRequest().
    pub(super) fn send_friend_request(&mut self, cx: &mut Context<Self>) {
        let username = self.friends_add.read(cx).text().trim().to_string();
        if username.is_empty() || self.friends_busy {
            return;
        }
        self.friends_busy = true;
        self.friends_add_status = None;
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.settings_post("/api/friends", serde_json::json!({ "username": username })) }).await;
            this.update(cx, |this, cx| {
                this.friends_busy = false;
                match result {
                    Ok(v) => {
                        let name = v["friend"]["username"].as_str().unwrap_or_default().to_string();
                        let key = if v["autoAccepted"] == true { "friends.successNowFriends" } else { "friends.successRequestSent" };
                        this.friends_add_status = Some((true, tv(key, &[("username", &name)])));
                        this.friends_add.update(cx, |i, cx| i.set_text(String::new(), cx));
                        this.reload_friends(cx);
                    }
                    Err(e) => this.friends_add_status = Some((false, if e.to_string().is_empty() { t("friends.errorSendFailed") } else { e.to_string() })),
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    /// handleBlockByUsername().
    pub(super) fn block_by_username(&mut self, cx: &mut Context<Self>) {
        let username = self.friends_block.read(cx).text().trim().to_string();
        if username.is_empty() || self.friends_busy {
            return;
        }
        self.friends_busy = true;
        self.friends_block_status = None;
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.settings_post("/api/friends/block", serde_json::json!({ "username": username })) }).await;
            this.update(cx, |this, cx| {
                this.friends_busy = false;
                match result {
                    Ok(v) => {
                        let text = match v["user"]["username"].as_str() {
                            Some(name) => tv("friends.successBlocked", &[("username", name)]),
                            None => t("friends.successBlockedGeneric"),
                        };
                        this.friends_block_status = Some((true, text));
                        this.friends_block.update(cx, |i, cx| i.set_text(String::new(), cx));
                        this.reload_friends(cx);
                    }
                    Err(e) => this.friends_block_status = Some((false, if e.to_string().is_empty() { t("friends.errorBlockFailed") } else { e.to_string() })),
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    /// A small square action (`p-2 rounded-xl`, an 18px icon).
    fn friend_action(id: String, name: &'static str, color: gpui::Rgba, bg: gpui::Hsla, hover_bg: gpui::Hsla, tip: String) -> gpui::Stateful<gpui::Div> {
        div()
            .id(SharedString::from(id))
            .p(px(8.))
            .rounded(px(12.))
            .bg(bg)
            .cursor_pointer()
            .hover(move |s| s.bg(hover_bg))
            .tooltip(ui::tooltip(tip))
            .child(icon(name, 18., color))
    }

    /// Pending, blocked and add: the lists and forms in friends-view.tsx.
    fn render_friends_other(&self, tab: Tab, cx: &mut Context<Self>) -> impl IntoElement {
        let section = |title: String| div().text_size(px(12.)).line_height(px(16.)).font_weight(FontWeight::BLACK).text_color(Theme::muted()).mb(px(12.)).child(title.to_uppercase());
        let empty = |text: String| div().text_size(px(12.)).line_height(px(16.)).italic().text_color(Theme::muted()).child(text);
        let person = |f: &Friend, sub: AnyElement, faded: bool| {
            div()
                .p(px(12.))
                .rounded(px(12.))
                .bg(Theme::panel())
                .border_1()
                .border_color(Theme::line())
                .flex()
                .items_center()
                .justify_between()
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(12.))
                        .min_w_0()
                        .child(div().when(faded, |d| d.opacity(0.6)).child(friend_avatar(self.picture(&f.avatar_url), &f.avatar, &f.color, f.name())))
                        .child(
                            div()
                                .min_w_0()
                                .child(div().truncate().text_size(px(14.)).line_height(px(20.)).font_weight(FontWeight::BOLD).text_color(Theme::ink()).child(f.display_name.clone()))
                                .child(div().text_size(px(12.)).line_height(px(16.)).text_color(Theme::muted()).child(sub)),
                        ),
                )
        };
        let rose: gpui::Hsla = rgb(0xf43f5e).into();
        let emerald: gpui::Hsla = rgb(0x10b981).into();
        // The success / error line under a form.
        let status = |status: &Option<(bool, String)>, big: bool| {
            status.clone().map(|(ok, text)| {
                let c: gpui::Hsla = if ok { emerald } else { rose };
                div()
                    .when(big, |d| d.p(px(14.)))
                    .when(!big, |d| d.mt(px(12.)).px(px(12.)).py(px(8.)))
                    .rounded(px(12.))
                    .bg(c.opacity(if big { 0.15 } else { 0.1 }))
                    .border_1()
                    .border_color(c.opacity(if big { 0.3 } else { 0.2 }))
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .text_size(px(12.))
                    .line_height(px(16.))
                    .font_weight(FontWeight::MEDIUM)
                    .text_color(if ok { rgb(0x6ee7b7) } else { rgb(0xfda4af) })
                    .child(icon(if ok { "check" } else if big { "x" } else { "circle-alert" }, if big { 16. } else { 14. }, if ok { rgb(0x6ee7b7) } else { rgb(0xfda4af) }))
                    .child(text)
            })
        };
        // As wide as the body allows (up to its max-w): inside the scrolling body nothing else gives
        // the text a width to wrap at.
        let mut col = div().w_full().flex().flex_col();
        match tab {
            Tab::Pending => {
                col = col.max_w(px(768.)).child(section(format!("{} — {}", t("friends.incomingRequest"), self.friends.incoming.len())));
                if self.friends.incoming.is_empty() {
                    col = col.child(empty(t("friends.emptyPending")));
                }
                let mut list = div().flex().flex_col().gap(px(8.));
                for f in &self.friends.incoming {
                    let (a, d, b) = (f.id.clone(), f.id.clone(), f.id.clone());
                    list = list.child(
                        person(f, div().truncate().child(format!("@{}", f.username)).into_any_element(), false).hover(|s| s.border_color(gpui::Hsla::from(Theme::lavender()).opacity(0.4))).child(
                            div()
                                .flex()
                                .items_center()
                                .gap(px(8.))
                                .child(Self::friend_action(format!("fr-accept-{a}"), "check", rgb(0x34d399), emerald.opacity(0.15), emerald.opacity(0.25), t("friends.accept")).on_click(cx.listener(move |this, _, _, cx| {
                                    this.friends_call("POST", "/api/friends/accept".into(), serde_json::json!({ "requesterId": a }), cx)
                                })))
                                .child(Self::friend_action(format!("fr-ignore-{d}"), "x", rgb(0xfb7185), rose.opacity(0.15), rose.opacity(0.25), t("friends.ignore")).on_click(cx.listener(move |this, _, _, cx| {
                                    this.friends_call("POST", "/api/friends/decline".into(), serde_json::json!({ "otherId": d }), cx)
                                })))
                                .child(Self::friend_action(format!("fr-block-{b}"), "shield-alert", Theme::muted(), Theme::line().into(), rose.opacity(0.2), t("friends.blockButton")).on_click(cx.listener(move |this, _, _, cx| {
                                    this.friends_call("POST", "/api/friends/block".into(), serde_json::json!({ "targetId": b }), cx)
                                }))),
                        ),
                    );
                }
                col = col.child(list).child(div().h(px(32.))).child(section(format!("{} — {}", t("friends.outgoingRequest"), self.friends.outgoing.len())));
                if self.friends.outgoing.is_empty() {
                    col = col.child(empty(t("friends.emptyPending")));
                }
                let mut list = div().flex().flex_col().gap(px(8.));
                for f in &self.friends.outgoing {
                    let id = f.id.clone();
                    let sub = div().flex().items_center().gap(px(6.)).child(icon("clock", 12., Theme::muted())).child(div().truncate().child(format!("{} · @{}", t("friends.outgoingRequest"), f.username))).into_any_element();
                    list = list.child(person(f, sub, false).child(
                        Self::friend_action(format!("fr-cancel-{id}"), "x", Theme::muted(), gpui::transparent_black(), Theme::line().into(), t("friends.cancel")).on_click(cx.listener(move |this, _, _, cx| {
                            this.friends_call("POST", "/api/friends/decline".into(), serde_json::json!({ "otherId": id }), cx)
                        })),
                    ));
                }
                col = col.child(list);
            }
            Tab::Blocked => {
                let typed = !self.friends_block.read(cx).text().trim().is_empty();
                let ready = typed && !self.friends_busy;
                col = col.max_w(px(768.)).child(
                    div()
                        .mb(px(24.))
                        .p(px(16.))
                        .rounded(px(16.))
                        .bg(Theme::panel())
                        .border_1()
                        .border_color(Theme::line())
                        .child(div().mb(px(4.)).text_size(px(12.)).line_height(px(16.)).font_weight(FontWeight::BLACK).text_color(Theme::ink()).child(t("friends.blockUserTitle").to_uppercase()))
                        .child(div().mb(px(12.)).text_size(px(12.)).line_height(px(16.)).text_color(Theme::muted()).child(t("friends.blockUserSubtitle")))
                        .child(
                            div()
                                .flex()
                                .gap(px(8.))
                                .child(
                                    div()
                                        .flex_1()
                                        .flex()
                                        .items_center()
                                        .px(px(14.))
                                        .py(px(8.))
                                        .rounded(px(12.))
                                        .bg(Theme::chat_bg())
                                        .border_1()
                                        .border_color(Theme::line())
                                        .child(div().mr(px(8.)).text_size(px(14.)).font_weight(FontWeight::BOLD).text_color(Theme::muted()).child("@"))
                                        .child(div().flex_1().child(self.friends_block.clone())),
                                )
                                .child(
                                    ui::faded(
                                        div()
                                            .id("fr-block-submit")
                                            .px(px(16.))
                                            .py(px(8.))
                                            .rounded(px(12.))
                                            .flex()
                                            .items_center()
                                            .gap(px(6.))
                                            .text_size(px(12.))
                                            .line_height(px(16.))
                                            .font_weight(FontWeight::BOLD)
                                            .when(ready, |d| d.bg(rgb(0xe11d48)).text_color(gpui::white()).cursor_pointer().hover(|s| s.bg(rgb(0xf43f5e))))
                                            .child(icon("shield-alert", 14., if ready { gpui::white() } else { gpui::white().opacity(0.4) }))
                                            .child(t(if self.friends_busy { "friends.blocking" } else { "friends.blockButton" }))
                                            .on_click(cx.listener(|this, _, _, cx| this.block_by_username(cx))),
                                        rgb(0xe11d48),
                                        gpui::white(),
                                        Theme::panel(),
                                    )
                                    .when(ready, |d| d.bg(rgb(0xe11d48)).text_color(gpui::white())),
                                ),
                        )
                        .children(status(&self.friends_block_status, false)),
                );
                col = col.child(section(tv("friends.blockedCount", &[("count", &self.friends.blocked.len().to_string())])));
                if self.friends.blocked.is_empty() {
                    col = col.child(empty(t("friends.emptyBlocked")));
                }
                let mut list = div().flex().flex_col().gap(px(8.));
                for f in &self.friends.blocked {
                    let id = f.id.clone();
                    list = list.child(person(f, div().truncate().child(format!("@{} · {}", f.username, t("friends.tab.blocked"))).into_any_element(), true).child(
                        div()
                            .id(SharedString::from(format!("fr-unblock-{id}")))
                            .px(px(12.))
                            .py(px(6.))
                            .rounded(px(8.))
                            .border_1()
                            .border_color(Theme::line())
                            .text_size(px(12.))
                            .line_height(px(16.))
                            .font_weight(FontWeight::BOLD)
                            .text_color(Theme::ink())
                            .cursor_pointer()
                            .hover(|s| s.bg(Theme::line()))
                            .child(t("friends.unblock"))
                            .on_click(cx.listener(move |this, _, _, cx| this.friends_call("DELETE", id.clone(), serde_json::Value::Null, cx))),
                    ));
                }
                col = col.child(list);
            }
            _ => {
                let typed = !self.friends_add.read(cx).text().trim().is_empty();
                let ready = typed && !self.friends_busy;
                let accent = Theme::send();
                // max-w-2xl as a width (no wider than the body): text inside is measured against a
                // width, which gpui does not take from a max-width.
                col = col
                    .w(px(672.))
                    .max_w(gpui::relative(1.))
                    .child(div().mb(px(4.)).text_size(px(18.)).line_height(px(28.)).font_weight(FontWeight::BLACK).text_color(Theme::ink()).child(t("friends.addFriendTitle").to_uppercase()))
                    .child(div().mb(px(16.)).text_size(px(12.)).line_height(px(16.)).text_color(Theme::muted()).child(t("friends.addFriendSubtitle")))
                    // The form's 16px below and the card's 48px above collapse into one 48px gap on
                    // the web unless a status line sits between them.
                    .child(
                        div()
                            .when(self.friends_add_status.is_some(), |d| d.mb(px(16.)))
                            .px(px(16.))
                            .py(px(12.))
                            .rounded(px(12.))
                            .bg(Theme::panel())
                            .border_1()
                            .border_color(Theme::lavender())
                            .flex()
                            .items_center()
                            .child(div().flex_1().min_w_0().flex().items_center().child(div().flex_1().min_w_0().child(self.friends_add.clone())))
                            .child(
                                ui::faded(
                                    div()
                                        .id("fr-add-submit")
                                        .ml(px(12.))
                                        .px(px(16.))
                                        .py(px(6.))
                                        .rounded(px(8.))
                                        .text_size(px(12.))
                                        .line_height(px(16.))
                                        .font_weight(FontWeight::BOLD)
                                        .when(ready, |d| d.cursor_pointer())
                                        .child(t(if self.friends_busy { "friends.sending" } else { "friends.sendRequest" }))
                                        .on_click(cx.listener(|this, _, _, cx| this.send_friend_request(cx))),
                                    accent,
                                    Theme::on_accent(),
                                    Theme::panel(),
                                )
                                .when(ready, |d| d.bg(accent).text_color(Theme::on_accent())),
                            ),
                    )
                    .children(status(&self.friends_add_status, true))
                    .child(
                        div()
                            .mt(px(48.))
                            .p(px(24.))
                            .rounded(px(16.))
                            .bg(Theme::panel())
                            .border_1()
                            .border_color(Theme::line())
                            .flex()
                            .items_center()
                            .gap(px(16.))
                            .child(div().flex_none().size(px(48.)).rounded(px(12.)).bg(gpui::Hsla::from(Theme::lavender()).opacity(0.15)).flex().items_center().justify_center().child(icon("sparkles", 24., Theme::lavender())))
                            .child(
                                div()
                                    .flex_1()
                                    .min_w_0()
                                    .child(div().mb(px(4.)).text_size(px(14.)).line_height(px(20.)).font_weight(FontWeight::BOLD).text_color(Theme::ink()).child("Private & Independent"))
                                    .child(
                                        div()
                                            .w_full()
                                            .text_size(px(12.))
                                            .line_height(px(19.5))
                                            .text_color(Theme::muted())
                                            .child("Friends can send direct messages, voice call in real-time, and see each other's live game or music activity across servers."),
                                    ),
                            ),
                    );
            }
        }
        col
    }
}

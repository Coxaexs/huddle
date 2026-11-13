//! The DMs home: its sidebar (panels.tsx, the `inDmHome` branch) and the friends view
//! (app/components/friends-view.tsx, set in Nunito like the web).

use gpui::{AnyElement, Context, FontWeight, IntoElement, SharedString, div, img, prelude::*, px, rgb, rgba};

use super::Shell;
use crate::i18n::{t, tv};
use crate::model::Friend;
use crate::theme::{DISPLAY_FONT, Theme};
use crate::ui::{self, icon};

const NUNITO: &str = "Nunito";

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
            .pb(px(super::rail::FOOTER_ROOM))
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
                        .child(div().id("create-dm").cursor_pointer().tooltip(ui::tooltip(t("sidebar.createDm"))).child(icon("plus", 14., rgb(0xa09ca4))))
                        .child(div().id("note-self").cursor_pointer().tooltip(ui::tooltip(t("sidebar.noteToSelf"))).child(icon("sticky-note", 14., rgb(0xa09ca4)))),
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
            let online = !me && self.online.contains(&dm.user.id);
            let in_call = self.rooms.get(&dm.channel_id).is_some_and(|r| !r.is_empty());
            let id = dm.channel_id.clone();
            let name = if me { t("sidebar.myNotes") } else { dm.user.name().to_string() };
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
                    .child(div().min_w_0().truncate().child(name))
                    .when(dm.pinned, |d| d.child(div().ml_auto().child(icon("pin", 11., Theme::lavender()))))
                    .when(me, |d| d.child(div().ml_auto().child(icon("sticky-note", 12., gpui::rgba(0xfbbf24cc)))))
                    .when(online, |d| d.child(div().ml(px(25.)).size(px(8.)).rounded_full().bg(Theme::mint())))
                    .when(in_call, |d| d.child(icon("phone-call", 12., Theme::mint())))
                    .when(count > 0, |d| {
                        d.child(
                            div()
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
                    // `.dm-row-actions`: pin and close, shown on the open (or hovered) row.
                    .when(selected, |d| {
                        d.child(
                            div()
                                .absolute()
                                .right(px(10.))
                                .top(px(12.))
                                .flex()
                                .gap(px(11.))
                                .child(icon("pin", 12., Theme::muted()))
                                .child(icon("x", 13., Theme::muted())),
                        )
                    })
                    .on_click(cx.listener(move |this, _, _, cx| this.open_dm(id.clone(), cx))),
            );
        }

        div()
            .w(px(240.))
            .h_full()
            .flex_none()
            .flex()
            .flex_col()
            .bg(Theme::panel())
            .child(header)
            .child(nav)
    }

    pub(super) fn render_friends_view(&self, cx: &mut Context<Self>) -> impl IntoElement {
        let tab = self.friends_tab;
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
                    .child(tab_button("tab-pending", t("friends.tab.pending"), Tab::Pending, None, cx))
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
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.friends_tab = Tab::Add;
                                cx.notify();
                            })),
                    ),
            );

        let body: AnyElement = match tab {
            Tab::Online | Tab::All => self.render_friend_list(tab, cx).into_any_element(),
            _ => self.render_friends_other(tab).into_any_element(),
        };

        div()
            .size_full()
            .flex()
            .flex_col()
            .font_family(NUNITO)
            .child(header)
            .child(div().id("friends-body").flex_1().min_h_0().overflow_y_scroll().p(px(24.)).child(body))
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
                                .on_click(cx.listener(|this, _, _, cx| {
                                    this.friends_tab = Tab::Add;
                                    cx.notify();
                                })),
                        )
                    }),
            );
        }
        for friend in shown {
            let online = self.online.contains(&friend.id);
            let line = friend.status_text().unwrap_or_else(|| format!("@{}", friend.username));
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
                    .border_b_1()
                    .border_color(Theme::line())
                    .hover(|s| s.bg(gpui::rgba(0x1a162899)))
                    .child(
                        div()
                            .relative()
                            .child(ui::avatar(self.picture(&friend.avatar_url), &friend.avatar, &friend.color, friend.name(), 40.))
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
                    ),
            );
        }
        col
    }

    /// Pending, blocked and add: the lists and forms in friends-view.tsx.
    fn render_friends_other(&self, tab: Tab) -> impl IntoElement {
        let section = |title: String| div().text_size(px(12.)).font_weight(FontWeight::BLACK).text_color(Theme::muted()).mb(px(12.)).child(title);
        let empty = |text: String| div().text_size(px(12.)).italic().text_color(Theme::muted()).child(text);
        let person = |f: &Friend, sub: String| {
            div()
                .p(px(12.))
                .mb(px(8.))
                .rounded(px(12.))
                .bg(Theme::panel())
                .border_1()
                .border_color(Theme::line())
                .flex()
                .items_center()
                .gap(px(12.))
                .child(ui::avatar(self.picture(&f.avatar_url), &f.avatar, &f.color, f.name(), 40.))
                .child(
                    div()
                        .min_w_0()
                        .child(div().truncate().text_size(px(14.)).font_weight(FontWeight::BOLD).text_color(Theme::ink()).child(f.name().to_string()))
                        .child(div().truncate().text_size(px(12.)).text_color(Theme::muted()).child(sub)),
                )
        };
        let mut col = div().max_w(px(768.)).flex().flex_col();
        match tab {
            Tab::Pending => {
                col = col.child(section(format!("{} — {}", t("friends.incomingRequest"), self.friends.incoming.len())));
                if self.friends.incoming.is_empty() {
                    col = col.child(empty(t("friends.emptyPending")));
                }
                for f in &self.friends.incoming {
                    col = col.child(person(f, format!("@{}", f.username)));
                }
                col = col.child(div().h(px(32.))).child(section(format!("{} — {}", t("friends.outgoingRequest"), self.friends.outgoing.len())));
                if self.friends.outgoing.is_empty() {
                    col = col.child(empty(t("friends.emptyPending")));
                }
                for f in &self.friends.outgoing {
                    col = col.child(person(f, format!("{} · @{}", t("friends.outgoingRequest"), f.username)));
                }
            }
            Tab::Blocked => {
                col = col.child(
                    div()
                        .mb(px(24.))
                        .p(px(16.))
                        .rounded(px(16.))
                        .bg(Theme::panel())
                        .border_1()
                        .border_color(Theme::line())
                        .child(div().text_size(px(12.)).font_weight(FontWeight::BLACK).text_color(Theme::ink()).child(t("friends.blockUserTitle")))
                        .child(div().text_size(px(12.)).text_color(Theme::muted()).child(t("friends.blockUserSubtitle"))),
                );
                if self.friends.blocked.is_empty() {
                    col = col.child(empty(t("friends.emptyBlocked")));
                }
                for f in &self.friends.blocked {
                    col = col.child(person(f, format!("@{} · {}", f.username, t("friends.tab.blocked"))));
                }
            }
            _ => {
                col = col
                    .child(div().text_size(px(18.)).font_weight(FontWeight::BLACK).text_color(Theme::ink()).child(t("friends.addFriendTitle")))
                    .child(div().mb(px(16.)).text_size(px(12.)).text_color(Theme::muted()).child(t("friends.addFriendSubtitle")))
                    .child(
                        div()
                            .px(px(16.))
                            .py(px(12.))
                            .rounded(px(12.))
                            .bg(Theme::panel())
                            .border_1()
                            .border_color(Theme::line())
                            .flex()
                            .items_center()
                            .child(div().flex_1().text_size(px(14.)).text_color(Theme::muted()).child(t("friends.addFriendInputPlaceholder")))
                            .child(
                                div()
                                    .px(px(16.))
                                    .py(px(6.))
                                    .rounded(px(8.))
                                    .bg(Theme::send())
                                    .opacity(0.4)
                                    .text_size(px(12.))
                                    .font_weight(FontWeight::BOLD)
                                    .text_color(rgb(0x15121f))
                                    .child(t("friends.sendRequest")),
                            ),
                    );
            }
        }
        col
    }
}

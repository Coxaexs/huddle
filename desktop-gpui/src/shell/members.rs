//! The members panel (`.member-panel`, panels.tsx): search, then online members (34px avatars, a
//! status line) and offline members (28px, dimmed names), and the window layout around it.

use gpui::{AnyElement, Context, FontWeight, IntoElement, SharedString, Window, div, prelude::*, px};

use super::Shell;
use crate::model::Member;
use crate::i18n::{t, tv};
use crate::theme::Theme;
use crate::ui;

impl Shell {
    fn render_members(&self, window: &Window, cx: &mut Context<Self>) -> AnyElement {
        // In a DM the panel lists the conversation's two people.
        let dm_people: Vec<Member>;
        let all: &[Member] = if self.home {
            let Some(dm) = self.channel_id.as_ref().and_then(|c| self.dm(c)) else { return div().into_any_element() };
            let me = &self.me;
            let as_member = |u: &crate::model::User| Member {
                id: u.id.clone(),
                username: u.username.clone(),
                display_name: u.display_name.clone(),
                avatar: u.avatar.clone(),
                avatar_url: u.avatar_url.clone(),
                color: u.color.clone(),
                ..Default::default()
            };
            // Their cosmetics (nameplate, frame, name style) come with their server membership.
            let person = |u: &crate::model::User| self.member_anywhere(&u.id).cloned().unwrap_or_else(|| as_member(u));
            dm_people = if dm.user.id == me.id { vec![person(me)] } else { vec![person(me), person(&dm.user)] };
            &dm_people
        } else {
            let Some(server_id) = self.server_id.as_ref() else { return div().into_any_element() };
            self.members.get(server_id).map(|m| m.as_slice()).unwrap_or(&[])
        };
        let (online, offline): (Vec<&Member>, Vec<&Member>) =
            all.iter().partition(|m| self.presence_of(&m.id) != "offline");

        let mut list = div()
            .id("members")
            .flex_1()
            .min_h_0()
            .overflow_y_scroll()
            .flex()
            .flex_col()
            .child(group_label(tv("members.online", &[("count", &online.len().to_string())])))
            .child(div().flex_none().h(px(11.)));
        for member in &online {
            list = list.child(self.render_member(member, true, window, cx));
        }
        list = list
            .child(div().flex_none().h(px(23.)))
            .child(group_label(tv("members.offline", &[("count", &offline.len().to_string())])))
            .child(div().flex_none().h(px(11.)));
        for member in &offline {
            list = list.child(self.render_member(member, false, window, cx));
        }

        div()
            .w(px(250.))
            .h_full()
            .flex_none()
            .flex()
            .flex_col()
            .bg(Theme::panel())
            .pt(px(30.))
            .px(px(16.))
            .child(
                div()
                    .flex_none()
                    .mx(px(13.))
                    .h(px(30.))
                    .px(px(10.))
                    .rounded(px(10.))
                    .bg(Theme::card())
                    .border_1()
                    .border_color(gpui::rgba(0xffffff12))
                    .flex()
                    .items_center()
                    // `text-xs`, `placeholder-white/40` over the panel.
                    .text_size(px(12.))
                    .line_height(px(16.))
                    .text_color(gpui::rgb(0x5a5275))
                    .child(t("members.search")),
            )
            .child(div().flex_none().h(px(32.)))
            .child(list)
            .into_any_element()
    }

    fn render_member(&self, member: &Member, online: bool, window: &Window, cx: &mut Context<Self>) -> impl IntoElement {
        let style = self.name_style(&member.id);
        // Styled names in the list come out at 8px for a 0.92 font (an 8.7px base), as on the web.
        let name = crate::names::styled_name(member.name(), style.as_ref(), if style.is_some() { 8.7 } else { 11. }, if online { FontWeight::BOLD } else { FontWeight::MEDIUM }, if online { Theme::ink().into() } else { Theme::muted().into() }, window, cx);
        let size = if online { 34. } else { 28. };
        let picture = member.picture().map(|p| self.client.absolute(p));
        let status = self.presence_of(&member.id);
        let line = if member.id == self.me.id {
            t("members.hereNow")
        } else {
            member.status_text().unwrap_or_else(|| match status.as_str() {
                "idle" => t("presence.idle"),
                "dnd" => t("presence.dnd"),
                _ => t("presence.online"),
            })
        };
        let face = div()
            .relative()
            .flex_none()
            .when(!online, |d| d.opacity(0.45))
            .child(crate::cosmetics::decorate_grey(
                if online { ui::avatar(picture, &member.avatar, &member.color, member.name(), size) } else { ui::grey_avatar(picture, &member.avatar, &member.color, member.name(), size) },
                &member.avatar_frame,
                size,
                !online,
            ))
            .when(online, |d| {
                d.child(div().absolute().right(px(-2.)).bottom(px(-2.)).child(ui::presence_dot(&status, 17., Theme::panel())))
            });
        // `.member.has-nameplate`: the plate behind the row, 6px side padding, names in white.
        let height = if online { 47. } else { 34. };
        let plate = crate::cosmetics::has_nameplate(&member.nameplate)
            .then(|| crate::cosmetics::nameplate(&member.nameplate, 217., height, window.scale_factor()))
            .flatten();
        let plated = plate.is_some();
        // A click opens their card beside the row.
        let spot = super::profile_card::spot();
        let open = {
            let (id, spot) = (member.id.clone(), spot.clone());
            cx.listener(move |this: &mut Self, _: &gpui::ClickEvent, window: &mut Window, cx: &mut Context<Self>| this.open_profile(&id, spot.get(), window, cx))
        };
        div()
            .id(SharedString::from(format!("member-{}", member.id)))
            .child(super::profile_card::track(&spot))
            .on_click(open)
            .on_mouse_down(gpui::MouseButton::Right, {
                let id = member.id.clone();
                cx.listener(move |this, e: &gpui::MouseDownEvent, _, cx| {
                    cx.stop_propagation();
                    this.open_user_menu(id.clone(), e.position, cx);
                })
            })
            .relative()
            .flex_none()
            .h(px(height))
            .px(px(if plated { 6. } else { 3. }))
            .rounded(px(8.))
            .flex()
            .items_center()
            .gap(px(if plated { 7. } else { 10. }))
            .cursor_pointer()
            .when(!plated, |d| d.hover(|s| s.bg(Theme::hover())))
            .children(plate)
            .child(face)
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .flex_col()
                    .child(
                        div()
                            .truncate()
                            .text_size(px(11.))
                            .line_height(px(16.5))
                            .font_weight(if online { FontWeight::BOLD } else { FontWeight::MEDIUM })
                            .text_color(if online { Theme::ink() } else { Theme::muted() })
                            .child(name),
                    )
                    .when(online, |d| {
                        d.child(div().truncate().text_size(px(8.)).line_height(px(12.)).text_color(Theme::muted()).child(line))
                    }),
            )
    }

    fn render_footer_menu(&self, cx: &mut Context<Self>) -> AnyElement {
        if !self.footer_menu {
            return div().into_any_element();
        }
        div()
            .absolute()
            .left(px(160.))
            .bottom(px(70.))
            .w(px(180.))
            .p(px(6.))
            .rounded(px(12.))
            .bg(Theme::card())
            .border_1()
            .border_color(Theme::line())
            .shadow(ui::card_shadow())
            .child(
                div()
                    .id("sign-out")
                    .px(px(10.))
                    .py(px(8.))
                    .rounded(px(8.))
                    .text_size(px(13.))
                    .text_color(Theme::badge())
                    .cursor_pointer()
                    .hover(|s| s.bg(Theme::hover()))
                    .child("Sign out")
                    .on_click(cx.listener(|this, _, _, cx| this.sign_out(cx))),
            )
            .into_any_element()
    }

    /// The display-name style someone picked, from any server's member list we have.
    /// This person as any server we know them from (name style, decorations).
    pub(super) fn member_anywhere(&self, user_id: &str) -> Option<&Member> {
        self.members.values().flat_map(|m| m.iter()).find(|m| m.id == user_id)
    }

    pub(super) fn name_style(&self, user_id: &str) -> Option<crate::names::NameStyle> {
        crate::names::NameStyle::from_profile(self.member_anywhere(user_id)?.profile_style.as_ref())
    }

    pub(super) fn avatar_frame(&self, user_id: &str) -> String {
        self.member_anywhere(user_id).map(|m| m.avatar_frame.clone()).unwrap_or_default()
    }

    pub(super) fn sign_out_menu(&mut self, cx: &mut Context<Self>) {
        self.footer_menu = !self.footer_menu;
        cx.notify();
    }
}

fn group_label(text: String) -> impl IntoElement {
    div()
        .flex_none()
        .h(px(15.))
        .px(px(3.))
        .text_size(px(12.))
        .line_height(px(15.))
        .font_weight(FontWeight::SEMIBOLD)
        .text_color(Theme::muted())
        .child(text)
}

impl gpui::Render for Shell {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        // Typing goes to the composer unless something else has focus.
        if window.focused(cx).is_none() {
            window.focus(&self.composer.focus_handle(cx));
        }
        // Development: HOFFLE_DEV_EDIT=1 opens the editor on your own last message once it is loaded.
        if std::env::var_os("HOFFLE_DEV_EDIT").is_some() && !self.dev_edit_done {
            let own = self.channel_id.as_ref().and_then(|c| self.messages.get(c)).and_then(|l| {
                l.iter().rev().find(|m| m.user_id.as_deref() == Some(self.me.id.as_str())).map(|m| (m.id.clone(), m.text.clone()))
            });
            if let Some((id, text)) = own {
                self.dev_edit_done = true;
                self.start_edit(id, text, window, cx);
            }
        }
        // Development: HOFFLE_DEV_CTX=x,y right-clicks your own last message there once it is loaded.
        if let Some(at) = std::env::var("HOFFLE_DEV_CTX").ok().filter(|_| !self.dev_ctx_done) {
            let own = self.channel_id.as_ref().and_then(|c| self.messages.get(c)).and_then(|l| {
                l.iter().rev().find(|m| m.user_id.as_deref() == Some(self.me.id.as_str())).map(|m| m.id.clone())
            });
            let mut xy = at.split(',').filter_map(|v| v.trim().parse::<f32>().ok());
            if let (Some(id), Some(x), Some(y)) = (own, xy.next(), xy.next()) {
                self.dev_ctx_done = true;
                self.ctx_menu = Some(super::context_menu::CtxMenu { message_id: id, at: gpui::point(px(x), px(y)) });
            }
        }
        // Development: HOFFLE_DEV_NOTICE / HOFFLE_DEV_TOAST show that text; HOFFLE_DEV_TRANSLATE puts
        // it under your own last message as a finished translation.
        if !self.dev_extras_done && self.channel_id.as_ref().is_some_and(|c| self.messages.contains_key(c)) {
            self.dev_extras_done = true;
            // HOFFLE_DEV_PROFILE=<user id prefix>,x,y,w,h: their card, as if clicked there.
            if let Ok(spec) = std::env::var("HOFFLE_DEV_PROFILE") {
                let mut parts = spec.split(',');
                let prefix = parts.next().unwrap_or_default().to_string();
                let n: Vec<f32> = parts.filter_map(|v| v.trim().parse().ok()).collect();
                let id = self.members.values().flat_map(|m| m.iter()).find(|m| m.id.starts_with(&prefix)).map(|m| m.id.clone());
                if let (Some(id), [x, y, w, h]) = (id, n.as_slice()) {
                    let bounds = gpui::Bounds::new(gpui::point(px(*x), px(*y)), gpui::size(px(*w), px(*h)));
                    self.open_profile(&id, bounds, window, cx);
                }
            }
            // HOFFLE_DEV_CHANNEL=<channel id>: open that text channel (in the current server), and
            // HOFFLE_DEV_UNREAD=<n> pretends it had n unread messages.
            if let Ok(channel) = std::env::var("HOFFLE_DEV_CHANNEL") {
                if let Some(n) = std::env::var("HOFFLE_DEV_UNREAD").ok().and_then(|v| v.parse::<u32>().ok()) {
                    self.reads.insert(channel.clone(), crate::model::ReadState { unread: true, count: n, mentions: 0 });
                }
                self.open_channel(channel, cx);
            }
            // HOFFLE_DEV_STAGE=<channel id>: that voice room's stage, joined (empty rooms only).
            if let Ok(room) = std::env::var("HOFFLE_DEV_STAGE") {
                self.open_stage(room, window, cx);
            }
            // HOFFLE_DEV_USERMENU=<user id prefix>,x,y: that person's menu, right-clicked there.
            if let Ok(spec) = std::env::var("HOFFLE_DEV_USERMENU") {
                let mut parts = spec.split(',');
                let prefix = parts.next().unwrap_or_default().to_string();
                let n: Vec<f32> = parts.filter_map(|v| v.trim().parse().ok()).collect();
                let id = self.members.values().flat_map(|m| m.iter()).find(|m| m.id.starts_with(&prefix)).map(|m| m.id.clone());
                if let (Some(id), [x, y]) = (id, n.as_slice()) {
                    self.open_user_menu(id, gpui::point(px(*x), px(*y)), cx);
                }
            }
            // HOFFLE_DEV_GIF=hoffy | gifs: the media picker on that tab.
            if let Ok(tab) = std::env::var("HOFFLE_DEV_GIF") {
                self.toggle_gif_picker(window, cx);
                if tab == "gifs" {
                    self.dev_gif_tab(cx);
                }
            }
            // HOFFLE_DEV_PANEL=pins | saved | mentions | search:<query>
            if let Ok(which) = std::env::var("HOFFLE_DEV_PANEL") {
                use super::side_panels::Panel;
                match which.split_once(':') {
                    Some(("search", query)) => {
                        self.toggle_search(window, cx);
                        if let Some((input, _)) = self.panels.search.as_ref() {
                            input.update(cx, |i, cx| i.set_text(query.to_string(), cx));
                        }
                        self.run_search_now(query.to_string(), cx);
                    }
                    _ => match which.as_str() {
                        "pins" => self.toggle_panel(Panel::Pins, cx),
                        "saved" => self.toggle_panel(Panel::Saved, cx),
                        "mentions" => self.toggle_panel(Panel::Mentions, cx),
                        _ => {}
                    },
                }
            }
            if let Ok(text) = std::env::var("HOFFLE_DEV_NOTICE") {
                self.notice = Some(text);
            }
            if let Ok(text) = std::env::var("HOFFLE_DEV_TOAST") {
                self.toast(text, cx);
            }
            // HOFFLE_DEV_PICKER=composer, or x,y: the reaction picker for your last message as if
            // its react button were there.
            if let Ok(at) = std::env::var("HOFFLE_DEV_PICKER") {
                if at == "composer" {
                    self.toggle_composer_picker(window, cx);
                } else {
                    let own = self.channel_id.as_ref().and_then(|c| self.messages.get(c)).and_then(|l| {
                        l.iter().rev().find(|m| m.user_id.as_deref() == Some(self.me.id.as_str())).map(|m| m.id.clone())
                    });
                    let mut xy = at.split(',').filter_map(|v| v.trim().parse::<f32>().ok());
                    if let (Some(id), Some(x), Some(y)) = (own, xy.next(), xy.next()) {
                        self.open_reaction_picker(id, gpui::point(px(x), px(y)), window, cx);
                    }
                }
            }
            if let Ok(text) = std::env::var("HOFFLE_DEV_TRANSLATE") {
                let own = self.channel_id.as_ref().and_then(|c| self.messages.get(c)).and_then(|l| {
                    l.iter().rev().find(|m| m.user_id.as_deref() == Some(self.me.id.as_str())).map(|m| m.id.clone())
                });
                if let Some(id) = own {
                    self.translations.insert(id.clone(), super::context_menu::Translation::Done { text, to: "en".into() });
                    self.refresh_message(&id);
                }
            }
        }
        // HOFFLE_DEV_SCROLL_TO=<message id prefix>: that message at the top of the list, every frame
        // (pages loading above it would move it otherwise).
        if let Ok(prefix) = std::env::var("HOFFLE_DEV_SCROLL_TO") {
            let ix = self.channel_id.as_ref().and_then(|c| self.messages.get(c)).and_then(|l| l.iter().position(|m| m.id.starts_with(&prefix)));
            if let Some(ix) = ix {
                self.list.scroll_to_item(ix);
            }
        }
        let members_open = self.members_open;
        // The composer grows to 40% of the window (`max-height: 40vh`), less its padding.
        let cap = f32::from(window.bounds().size.height) * 0.4 - 18.;
        self.composer.update(cx, |c, _| c.set_max_height(cap));
        div()
            .size_full()
            .flex()
            .bg(Theme::panel())
            .text_color(Theme::ink())
            .child(
                // The rail and the sidebar share the user card, which overlaps both.
                div()
                    .relative()
                    .h_full()
                    .flex_none()
                    .flex()
                    .child(self.render_rail(cx))
                    .child(if self.home { self.render_home_sidebar(cx).into_any_element() } else { self.render_sidebar(window, cx).into_any_element() })
                    .child(self.render_footer(window, cx))
                    .child(self.render_footer_menu(cx)),
            )
            .when(self.home && self.channel_id.is_none(), |d| {
                // The friends view sits in the same card, with a 10px gap on the right (no members panel).
                d.child(
                    div().flex_1().min_w_0().h_full().pt(px(10.)).pr(px(10.)).child(
                        div()
                            .size_full()
                            .rounded_t(px(16.))
                            .bg(Theme::chat_bg())
                            .border_1()
                            .border_color(Theme::line())
                            .overflow_hidden()
                            .child(self.render_friends_view(cx)),
                    ),
                )
            })
            .when(!(self.home && self.channel_id.is_none()), |d| d.child(self.render_chat_panel(window, cx)))
            .when(members_open && (!self.home || self.channel_id.is_some()) && self.stage.is_none(), |d| d.child(self.render_members(window, cx)))
            .children(self.render_panel(window, cx))
            .children(self.render_user_menu(window, cx))
            .children(self.render_profile(window, cx))
            .children(self.render_picker(window, cx))
            .children(self.render_context_menu(window, cx))
            .children(self.render_toasts(cx))
            .children(self.render_confirm(cx))
            // Escape closes the message menu before anything else hears it.
            .capture_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, _, cx| {
                if event.keystroke.key == "escape" && this.ctx_menu.is_some() {
                    this.close_context_menu(cx);
                    cx.stop_propagation();
                } else if event.keystroke.key == "escape" && this.user_menu.is_some() {
                    this.user_menu = None;
                    cx.notify();
                    cx.stop_propagation();
                } else if event.keystroke.key == "escape" && this.profile.is_some() {
                    this.close_profile(cx);
                    cx.stop_propagation();
                }
            }))
    }
}

use gpui::Focusable as _;

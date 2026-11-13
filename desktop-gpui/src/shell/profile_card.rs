//! UserProfileCard (app/components/user-profile-card.tsx) as it looks for a card nobody styled:
//! tinted by the member's colour (cosmetics.css `--pop-bg`), banner, avatar with presence, name and
//! member tag, the panel (bio, roles, mutual servers and friends, your private note, member since)
//! and the actions. Opens beside the name, avatar or row that was clicked.

use std::cell::Cell;
use std::rc::Rc;

use gpui::{Focusable as _,
    AnimationExt as _, AnyElement, ClipboardItem, Context, Entity, FontWeight, Hsla, ObjectFit, Pixels, SharedString,
    Subscription, Window, div, prelude::*, px, rgb, rgba,
};

use super::Shell;
use crate::i18n::{t, tv};
use crate::model::{Member, Mutuals, permission};
use crate::textarea::{AreaEvent, TextArea};
use crate::theme::{Theme, css_color, mix};
use crate::ui;

const CARD_WIDTH: f32 = 300.;
const CARD_GAP: f32 = 14.;

/// Where the card was asked from: the clicked element's left/top and right edge.
#[derive(Clone, Copy)]
pub(super) struct Anchor {
    pub x: f32,
    pub y: f32,
    pub right: f32,
}

#[derive(Clone, Copy, PartialEq)]
enum NoteState {
    Idle,
    Saving,
    Error,
}

pub(super) struct OpenProfile {
    member: Member,
    anchor: Anchor,
    mutuals: Option<Mutuals>,
    /// The note box; `saved` is what the server has, `None` until it loaded.
    note: Entity<TextArea>,
    saved: Option<String>,
    note_state: NoteState,
    bio_open: bool,
    copied: bool,
    /// The card's height from the last frame, for keeping it on screen.
    height: Rc<Cell<f32>>,
    key: u64,
    _subs: Vec<Subscription>,
}

/// Something the card can be opened from records where it was drawn here.
pub(super) type Spot = Rc<Cell<gpui::Bounds<Pixels>>>;

pub(super) fn spot() -> Spot {
    Rc::new(Cell::new(gpui::Bounds::default()))
}

/// An invisible layer that keeps `spot` up to date with its parent's bounds.
pub(super) fn track(spot: &Spot) -> impl IntoElement {
    let spot = spot.clone();
    gpui::canvas(move |bounds, _, _| spot.set(bounds), |_, _, _, _| {}).absolute().top_0().left_0().size_full()
}

impl Shell {
    /// openProfile: beside the element at `bounds`.
    pub(super) fn open_profile(&mut self, user_id: &str, bounds: gpui::Bounds<Pixels>, window: &mut Window, cx: &mut Context<Self>) {
        let Some(member) = self.member(user_id).cloned().or_else(|| self.member_anywhere(user_id).cloned()) else { return };
        let anchor = Anchor { x: f32::from(bounds.origin.x), y: f32::from(bounds.origin.y), right: f32::from(bounds.origin.x + bounds.size.width) };
        let note = cx.new(|cx| {
            TextArea::new(t("common.loading"), cx).text(12., 16.8).max_lines(7).placeholder_color(Hsla::from(Theme::ink()).opacity(0.45))
        });
        let id = member.id.clone();
        let subs = vec![
            cx.subscribe_in(&note, window, |this, _, event, window, cx| match event {
                // Enter saves (and leaves the box), like Discord; Esc just leaves it.
                AreaEvent::Submit | AreaEvent::Escape => {
                    window.focus(&this.composer.focus_handle(cx));
                    this.save_note(cx);
                }
                AreaEvent::Changed => {}
            }),
            cx.on_blur(&note.focus_handle(cx), window, |this, _, cx| this.save_note(cx)),
        ];
        self.profile_seq += 1;
        self.profile = Some(OpenProfile {
            member,
            anchor,
            mutuals: None,
            note,
            saved: None,
            note_state: NoteState::Idle,
            bio_open: false,
            copied: false,
            height: Rc::new(Cell::new(380.)),
            key: self.profile_seq,
            _subs: subs,
        });
        let client = self.client.clone();
        let mine = id == self.me.id;
        cx.spawn(async move |this, cx| {
            let fetch = client.clone();
            let uid = id.clone();
            let note = cx.background_executor().spawn(async move { fetch.note(&uid) }).await;
            let mutuals = if mine {
                None
            } else {
                let uid = id.clone();
                cx.background_executor().spawn(async move { client.mutuals(&uid) }).await.ok()
            };
            this.update(cx, |this, cx| {
                let Some(open) = this.profile.as_mut().filter(|p| p.member.id == id) else { return };
                let text = note.unwrap_or_default();
                open.note.update(cx, |n, cx| {
                    n.set_value(text.clone(), cx);
                    n.set_placeholder(t("profile.addNotePlaceholder"), cx);
                });
                open.saved = Some(text);
                open.mutuals = mutuals;
                cx.notify();
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    pub(super) fn close_profile(&mut self, cx: &mut Context<Self>) {
        if self.profile.take().is_some() {
            cx.notify();
        }
    }

    /// saveNote: when the box is left with something new in it.
    fn save_note(&mut self, cx: &mut Context<Self>) {
        let Some(open) = self.profile.as_mut() else { return };
        let Some(saved) = open.saved.clone() else { return };
        let text = open.note.read(cx).value();
        if text.trim() == saved {
            return;
        }
        open.note_state = NoteState::Saving;
        let (client, id) = (self.client.clone(), open.member.id.clone());
        cx.spawn(async move |this, cx| {
            let uid = id.clone();
            let result = cx.background_executor().spawn(async move { client.set_note(&uid, &text) }).await;
            this.update(cx, |this, cx| {
                if let Some(open) = this.profile.as_mut().filter(|p| p.member.id == id) {
                    match result {
                        Ok(note) => {
                            open.saved = Some(note);
                            open.note_state = NoteState::Idle;
                        }
                        Err(_) => open.note_state = NoteState::Error,
                    }
                    cx.notify();
                }
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    /// getMemberTagInfo: Owner, Admin, Mod, or the top role's name.
    fn member_tag(&self, member: &Member) -> Option<(String, &'static str, Option<Hsla>)> {
        let server = self.server()?;
        if server.owner_id.as_deref() == Some(member.id.as_str()) {
            return Some(("Owner".into(), "crown", None));
        }
        let held: Vec<String> = member.role_ids.get(&server.id).and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect()).unwrap_or_default();
        let mut mask = server.everyone_permissions;
        for role in server.roles.iter().filter(|r| held.contains(&r.id)) {
            mask |= role.permissions;
        }
        let has = |flag: u64| mask & permission::ADMINISTRATOR != 0 || mask & flag != 0;
        if member.is_admin || has(1 << 3) {
            return Some(("Admin".into(), "shield", None));
        }
        if has(1 << 2) || has(1 << 12) || has(1 << 11) || has(permission::MANAGE_MESSAGES) || has(1 << 5) {
            return Some(("Mod".into(), "shield-check", None));
        }
        let top = server.roles.iter().filter(|r| held.contains(&r.id)).max_by_key(|r| r.position)?;
        Some((top.name.clone(), "", css_color(&top.color)))
    }

    fn friend_status(&self, user_id: &str) -> &'static str {
        let has = |list: &Vec<crate::model::Friend>| list.iter().any(|f| f.id == user_id);
        if has(&self.friends.friends) {
            "friend"
        } else if has(&self.friends.incoming) {
            "incoming"
        } else if has(&self.friends.outgoing) {
            "outgoing"
        } else {
            "none"
        }
    }

    fn profile_action(&mut self, action: &'static str, cx: &mut Context<Self>) {
        let Some(open) = self.profile.as_ref() else { return };
        let member = open.member.clone();
        let client = self.client.clone();
        let (id, username) = (member.id.clone(), member.username.clone());
        // The lists change at once; a failure says so in the notice bar, as on the web.
        let friend = crate::model::Friend { id: id.clone(), username: username.clone(), ..Default::default() };
        match action {
            "add" => self.friends.outgoing.push(friend),
            "accept" => {
                self.friends.incoming.retain(|f| f.id != id);
                self.friends.friends.push(friend);
            }
            "remove" => self.friends.friends.retain(|f| f.id != id),
            "block" => self.friends.blocked.push(friend),
            "unblock" => self.friends.blocked.retain(|f| f.id != id),
            _ => {}
        }
        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    match action {
                        "add" => client.add_friend(&username),
                        "accept" => client.accept_friend(&id),
                        "remove" | "unblock" => client.remove_friend(&id),
                        "block" => client.block(&id),
                        _ => Ok(()),
                    }
                })
                .await;
            this.update(cx, |this, cx| {
                if let Err(e) = result {
                    this.set_notice(e.to_string(), cx);
                }
                this.load_side_data(cx);
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    pub(super) fn render_profile(&self, window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let open = self.profile.as_ref()?;
        let m = &open.member;
        let size = window.viewport_size();
        let (vw, vh) = (f32::from(size.width), f32::from(size.height));
        let width = CARD_WIDTH.min(vw - 24.);
        let a = open.anchor;
        let room_left = a.x - CARD_GAP - 12.;
        let room_right = vw - a.right - CARD_GAP - 12.;
        let place_left = room_left >= width || (room_right < width && room_left > room_right);
        let raw_left = if place_left { a.x - CARD_GAP - width } else { a.right + CARD_GAP };
        let height = open.height.get();
        let top = a.y.min(vh - height - 12.).max(12.);
        let left = raw_left.min(vw - width - 12.).max(12.);

        let accent: Hsla = css_color(&m.color).unwrap_or_else(|| rgb(0x5865f2).into());
        let line: Hsla = Theme::line().into();
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let me = m.id == self.me.id;
        let presence = self.presence_of(&m.id);
        let (status_label, status_color) = match presence.as_str() {
            "offline" => ("Offline", rgb(0x80848e)),
            "idle" => ("Idle", rgb(0xfaa81a)),
            "dnd" => ("Do not disturb", rgb(0xed4245)),
            "invisible" => ("Invisible", rgb(0x80848e)),
            _ => ("Online", rgb(0x3ba55d)),
        };

        // `.profile-card-banner`: the banner picture, or the colour fading to near black.
        let banner = match m.banner_url.as_deref().filter(|u| !u.is_empty()) {
            Some(url) => div().size_full().child(gpui::img(self.client.absolute(url)).size_full().rounded_t(px(15.)).object_fit(ObjectFit::Cover)).into_any_element(),
            None => div()
                .size_full()
                .rounded_t(px(15.))
                .bg(gpui::linear_gradient(135., gpui::linear_color_stop(accent, 0.), gpui::linear_color_stop(rgb(0x1e1f22), 1.)))
                .into_any_element(),
        };
        let round_button = |id: &'static str, icon: &'static str, size: f32| {
            div()
                .id(id)
                .absolute()
                .top(px(6.))
                .size(px(24.))
                .rounded_full()
                .bg(rgba(0x00000066))
                .flex()
                .items_center()
                .justify_center()
                .cursor_pointer()
                .child(ui::icon(icon, size, ink))
        };
        let banner = div()
            .relative()
            .flex_none()
            .h(px(112.))
            .rounded_t(px(15.))
            .overflow_hidden()
            .child(banner)
            .child(
                round_button("profile-copy", if open.copied { "check" } else { "copy" }, 14.)
                    .right(px(36.))
                    .tooltip(ui::tooltip(if open.copied { "Copied!" } else { "Copy User ID" }))
                    .on_click(cx.listener(|this, _, _, cx| this.copy_profile_id(cx))),
            )
            .child(round_button("profile-close", "x", 16.).right(px(6.)).on_click(cx.listener(|this, _, _, cx| this.close_profile(cx))));

        // The avatar (68px) with its decoration and presence dot, and a custom status bubble.
        let face = ui::avatar_with(m.picture().map(|p| self.client.absolute(p)), &m.avatar, &m.color, m.name(), 68., 16., FontWeight::NORMAL, rgb(0xf2f3f5).into());
        let avatar = div()
            .relative()
            .size(px(68.))
            .flex_none()
            .child(crate::cosmetics::decorate(face, &m.avatar_frame, 68.))
            .child(
                div()
                    .absolute()
                    .right_0()
                    .bottom_0()
                    .size(px(12.))
                    .rounded_full()
                    .bg(status_color)
                    .border(px(3.))
                    .border_color(rgb(0x16131f)),
            );
        let bubble = m.status_text().map(|text| {
            div()
                .relative()
                .mb(px(4.))
                .max_w(px(170.))
                .px(px(10.))
                .py(px(5.))
                .rounded(px(14.))
                .bg(Theme::panel())
                .border_1()
                .border_color(rgba(0xffffff1f))
                .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.35), offset: gpui::point(px(0.), px(4.)), blur_radius: px(16.), spread_radius: px(0.) }])
                .text_size(px(12.))
                .font_weight(FontWeight::MEDIUM)
                .text_color(rgb(0xf2f3f5))
                .child(div().truncate().child(text))
        });
        let avatar_row = div().flex_none().mt(px(-30.)).px(px(14.)).flex().items_end().gap(px(12.)).child(avatar).children(bubble);

        // Name, member tag, @username • pronouns, tagline.
        let tag = if self.home { None } else { self.member_tag(m) };
        let style = crate::names::NameStyle::from_profile(m.profile_style.as_ref());
        let name = div()
            .text_size(px(17.))
            .line_height(px(20.4))
            .font_weight(FontWeight::BOLD)
            .text_color(ink)
            .child(crate::names::styled_name(&m.display_name_or_name(), style.as_ref(), 17., FontWeight::BOLD, ink, window, cx));
        let tag = tag.map(|(label, icon, color)| {
            let (bg, fg, border, glow) = match icon {
                "crown" => (rgba(0xf59e0b2e), rgb(0xfbbf24).into(), rgba(0xf59e0b73), Some(rgba(0xf59e0b1f))),
                "shield" => (rgba(0xef44442e), rgb(0xf87171).into(), rgba(0xef444473), Some(rgba(0xef44441f))),
                "shield-check" => (rgba(0x3b82f62e), rgb(0x60a5fa).into(), rgba(0x3b82f673), Some(rgba(0x3b82f61f))),
                _ => (rgba(0xffffff14), color.unwrap_or_else(|| rgb(0xe2e8f0).into()), color.map(|c| gpui::Rgba::from(c.opacity(0.333))).unwrap_or(rgba(0xffffff33)), None),
            };
            div()
                .flex()
                .items_center()
                .gap(px(3.))
                .px(px(5.))
                .py(px(1.))
                .rounded(px(4.))
                .bg(bg)
                .border_1()
                .border_color(border)
                .when_some(glow, |d, g| d.shadow(vec![gpui::BoxShadow { color: g.into(), offset: gpui::point(px(0.), px(0.)), blur_radius: px(6.), spread_radius: px(0.) }]))
                .text_size(px(9.))
                .line_height(px(11.25))
                .font_weight(FontWeight::EXTRA_BOLD)
                .text_color(fg)
                .when(!icon.is_empty(), |d| d.child(ui::icon(icon, 11., fg)))
                .child(label.to_uppercase())
        });
        let mut sub = div().mt(px(1.)).flex().flex_wrap().gap_x(px(6.)).gap_y(px(4.)).text_size(px(12.)).line_height(px(18.));
        if let (Some(nick), Some(global)) = (m.nickname.as_deref().filter(|n| !n.is_empty()), m.global_name.as_deref()) {
            if global != nick {
                sub = sub.child(div().text_color(muted).child(format!("{global} ·")));
            }
        }
        sub = sub.child(div().text_color(muted).child(format!("@{}", m.username)));
        if let Some(p) = m.pronouns.as_deref().filter(|p| !p.is_empty()) {
            sub = sub.child(div().text_color(rgb(0x949ba4)).child(format!("• {p}")));
        }
        let mut header = div().flex_none().flex().flex_col().child(div().flex().flex_wrap().items_center().gap(px(8.)).child(name).children(tag)).child(sub);
        if !m.tagline.is_empty() {
            header = header.child(div().mt(px(4.)).text_size(px(12.)).line_height(px(18.)).text_color(muted).child(m.tagline.clone()));
        }

        // The panel.
        let h4 = |text: String| div().mb(px(3.)).text_size(px(10.5)).line_height(px(15.75)).font_weight(FontWeight::BOLD).text_color(muted).child(text);
        let long_bio = m.bio.chars().count() > 130;
        let bio_text = if m.bio.trim().is_empty() { t("profile.noBio") } else { m.bio.clone() };
        let mut bio = div().child(
            div().text_size(px(12.5)).line_height(px(17.5)).text_color(ink).when(long_bio && !open.bio_open, |d| d.line_clamp(3)).child(bio_text),
        );
        if long_bio {
            bio = bio.child(
                div()
                    .id("bio-toggle")
                    .mt(px(4.))
                    .text_size(px(12.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(Theme::lavender())
                    .cursor_pointer()
                    .child(t(if open.bio_open { "profile.collapseBio" } else { "profile.viewFullBio" }))
                    .on_click(cx.listener(|this, _, _, cx| {
                        if let Some(open) = this.profile.as_mut() {
                            open.bio_open = !open.bio_open;
                            cx.notify();
                        }
                    })),
            );
        }
        let mut panel = div()
            .flex_none()
            .flex()
            .flex_col()
            .gap(px(10.))
            .px(px(12.))
            .py(px(10.))
            .rounded(px(12.8))
            .bg(mix(accent, 0.08, ink.opacity(0.05)))
            .border_1()
            .border_color(rgba(0xffffff12))
            .child(bio);
        if !self.home
            && let Some(server) = self.server()
        {
            let held: Vec<String> = m.role_ids.get(&server.id).and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect()).unwrap_or_default();
            let roles: Vec<_> = server.roles.iter().filter(|r| held.contains(&r.id)).collect();
            if !roles.is_empty() {
                let mut list = div().flex().flex_wrap().gap(px(4.));
                for role in &roles {
                    let color: Hsla = css_color(&role.color).unwrap_or(muted);
                    list = list.child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(4.))
                            .px(px(8.))
                            .py(px(2.))
                            .rounded(px(6.4))
                            .bg(ink.opacity(0.06))
                            .border_1()
                            .border_color(color)
                            .text_size(px(12.))
                            .line_height(px(18.))
                            .font_weight(FontWeight::MEDIUM)
                            .child(div().size(px(8.)).rounded_full().bg(color))
                            .child(div().text_color(color).child(role.name.clone())),
                    );
                }
                panel = panel.child(div().child(h4(format!("ROLES ({})", roles.len()))).child(list));
            }
        }
        if let Some(mutuals) = &open.mutuals {
            let chip = || {
                div()
                    .flex()
                    .items_center()
                    .gap(px(6.))
                    .pl(px(3.))
                    .pr(px(8.))
                    .py(px(2.))
                    .rounded_full()
                    .bg(ink.opacity(0.06))
                    .border_1()
                    .border_color(rgba(0xffffff12))
                    .text_size(px(12.))
                    .line_height(px(18.))
                    .text_color(ink)
            };
            if !mutuals.servers.is_empty() {
                let mut list = div().flex().flex_wrap().gap(px(4.)).max_h(px(60.)).overflow_hidden();
                for server in &mutuals.servers {
                    let icon = match server.icon_url.as_deref().filter(|u| !u.is_empty()) {
                        Some(url) => gpui::img(ui::square(self.client.absolute(url))).size(px(18.)).rounded(px(6.)).object_fit(ObjectFit::Cover).into_any_element(),
                        None => div()
                            .size(px(18.))
                            .rounded(px(6.))
                            .bg(css_color(&server.color).unwrap_or(muted))
                            .flex()
                            .items_center()
                            .justify_center()
                            .text_size(px(10.))
                            .text_color(rgb(0x111111))
                            .child(server.icon.clone())
                            .into_any_element(),
                    };
                    list = list.child(chip().child(icon).child(div().truncate().child(server.name.clone())));
                }
                panel = panel.child(div().child(h4(format!("MUTUAL SERVERS ({})", mutuals.servers.len()))).child(list));
            }
            if !mutuals.friends.is_empty() {
                let mut list = div().flex().flex_wrap().gap(px(4.)).max_h(px(60.)).overflow_hidden();
                for friend in &mutuals.friends {
                    let face = ui::avatar(friend.avatar_url.as_deref().map(|p| self.client.absolute(p)), &friend.avatar, &friend.color, friend.name(), 18.);
                    list = list.child(chip().child(face).child(div().truncate().child(friend.name().to_string())));
                }
                panel = panel.child(div().child(h4(format!("MUTUAL FRIENDS ({})", mutuals.friends.len()))).child(list));
            }
        }
        let note_label = match open.note_state {
            NoteState::Saving => format!("{} · {}", t("profile.note"), t("profile.saving")),
            NoteState::Error => format!("{} · {}", t("profile.note"), t("profile.couldntSave")),
            NoteState::Idle => t("profile.note"),
        };
        let note_focused = open.note.focus_handle(cx).is_focused(window);
        // The textarea is inline-block: the line it sits on adds 6px under it.
        panel = panel.child(
            div().pb(px(6.)).child(h4(note_label)).child(
                div()
                    .ml(px(-6.))
                    .px(px(6.))
                    .py(px(4.))
                    .min_h(px(28.))
                    .rounded(px(4.8))
                    .border_1()
                    .border_color(if note_focused { line } else { gpui::transparent_black() })
                    .when(note_focused, |d| d.bg(Hsla::from(Theme::panel()).opacity(0.4)))
                    .hover(|s| s.border_color(Theme::line()))
                    .child(open.note.clone()),
            ),
        );
        let since = model_short_date(&m.created_at);
        panel = panel.child(
            div()
                .flex()
                .items_center()
                .gap(px(6.))
                .text_size(px(11.5))
                .line_height(px(17.25))
                .text_color(muted)
                .child(ui::icon("calendar", 13., muted))
                .child(tv("profile.memberSince", &[("date", &since)])),
        );

        // The buttons.
        let button = |id: &'static str, icon: &'static str, label: String, primary: bool, gap: f32| {
            div()
                .id(id)
                .flex_1()
                .min_w_0()
                .h(px(30.))
                .px(px(8.))
                .rounded(px(6.4))
                .flex()
                .items_center()
                .justify_center()
                .gap(px(gap))
                .whitespace_nowrap()
                .text_size(px(12.))
                .line_height(px(12.))
                .font_weight(FontWeight::SEMIBOLD)
                .cursor_pointer()
                .when(primary, |d| d.bg(Theme::lavender()).text_color(rgb(0x15121f)))
                .when(!primary, |d| d.bg(Theme::card()).border_1().border_color(rgba(0xffffff12)).text_color(ink))
                .child(ui::icon(icon, 14., if primary { Hsla::from(rgb(0x15121f)) } else { ink }))
                .child(label)
        };
        let blocked = self.friends.blocked.iter().any(|f| f.id == m.id);
        // The buttons go two to a row, each half the width (`flex: 1 1 calc(50% - 3px)`).
        let mut buttons: Vec<AnyElement> = Vec::new();
        if !me && !blocked {
            buttons.push(match self.friend_status(&m.id) {
                "friend" => button("pf-friend", "user-check", t("sidebar.friends"), false, 6.)
                    .tooltip(ui::tooltip(t("profile.removeFriend")))
                    .on_click(cx.listener(|this, _, _, cx| this.profile_action("remove", cx))),
                "outgoing" => button("pf-friend", "clock", t("friends.outgoingRequest"), false, 6.).text_color(Theme::lavender()).opacity(0.9),
                "incoming" => button("pf-friend", "user-check", t("profile.acceptRequest"), true, 6.)
                    .bg(rgb(0x059669))
                    .text_color(gpui::white())
                    .on_click(cx.listener(|this, _, _, cx| this.profile_action("accept", cx))),
                _ => button("pf-friend", "user-plus", t("profile.sendFriendRequest"), true, 6.)
                    .on_click(cx.listener(|this, _, _, cx| this.profile_action("add", cx))),
            }
            .into_any_element());
        }
        if !blocked || me {
            let id = m.id.clone();
            buttons.push(
                button("pf-dm", "message-square", if me { "Note to Self".into() } else { "Send DM".into() }, false, 8.).on_click(cx.listener(
                    move |this, _, _, cx| {
                        this.profile = None;
                        this.open_dm_with(id.clone(), cx);
                    },
                ))
                .into_any_element(),
            );
        }
        if !me {
            let username = m.username.clone();
            buttons.push(button("pf-mention", "at-sign", "Mention".into(), false, 8.).on_click(cx.listener(move |this, _, window, cx| {
                this.profile = None;
                let text = format!("{}@{username} ", this.composer.read(cx).value());
                this.composer.update(cx, |c, cx| c.set_value(text, cx));
                window.focus(&this.composer.focus_handle(cx));
                cx.notify();
            })).into_any_element());
            buttons.push(if blocked {
                button("pf-block", "shield-check", "Unblock".into(), false, 6.).on_click(cx.listener(|this, _, _, cx| this.profile_action("unblock", cx)))
            } else {
                button("pf-block", "shield-alert", "Block".into(), false, 6.).on_click(cx.listener(|this, _, _, cx| this.profile_action("block", cx)))
            }
            .into_any_element());
        }
        let mut actions = div().flex_none().flex().flex_col().gap(px(6.));
        let mut buttons = buttons.into_iter().peekable();
        while buttons.peek().is_some() {
            let pair: Vec<_> = buttons.by_ref().take(2).collect();
            actions = actions.child(div().flex().gap(px(6.)).children(pair));
        }
        if me {
            let tile = |content: AnyElement| {
                div()
                    .flex_1()
                    .min_w_0()
                    .h(px(30.))
                    .px(px(10.))
                    .rounded(px(8.))
                    .bg(Theme::card())
                    .border_1()
                    .border_color(rgba(0xffffff12))
                    .flex()
                    .items_center()
                    .text_size(px(12.))
                    .child(content)
            };
            actions = actions.child(
                div()
                    .w_full()
                    .flex()
                    .gap(px(6.))
                    .child(tile(div().flex().items_center().gap(px(10.)).child(ui::icon("pencil", 15., muted)).child("Edit Profile").into_any_element()))
                    .child(tile(
                        div().flex().items_center().gap(px(10.)).child(div().size(px(12.)).rounded_full().bg(status_color)).child(status_label).into_any_element(),
                    )),
            );
        }

        let body = div().flex_none().pt(px(8.)).px(px(14.)).pb(px(14.)).flex().flex_col().gap(px(8.)).child(header).child(panel).child(actions);
        let measured = open.height.clone();
        let card = div()
            .id("profile-card")
            .absolute()
            .left(px(left))
            .top(px(top))
            .w(px(width))
            .rounded(px(16.))
            .bg(gpui::linear_gradient(
                180.,
                gpui::linear_color_stop(mix(accent, 0.22, rgb(0x17181d)), 0.),
                gpui::linear_color_stop(mix(accent, 0.08, rgb(0x101115)), 1.),
            ))
            .border_1()
            .border_color(mix(accent, 0.45, line))
            .shadow(vec![
                gpui::BoxShadow { color: accent.opacity(0.18), offset: gpui::point(px(0.), px(0.)), blur_radius: px(0.), spread_radius: px(1.) },
                gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.55), offset: gpui::point(px(0.), px(20.)), blur_radius: px(50.), spread_radius: px(0.) },
                gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.4), offset: gpui::point(px(0.), px(4.)), blur_radius: px(14.), spread_radius: px(0.) },
            ])
            .text_color(rgb(0xf2f3f5))
            .flex()
            .flex_col()
            .child(banner)
            .child(avatar_row)
            .child(body)
            .child(gpui::canvas(move |bounds, _, _| measured.set(f32::from(bounds.size.height)), |_, _, _, _| {}).absolute().top_0().left_0().size_full())
            .on_mouse_down_out(cx.listener(|this, _, _, cx| this.close_profile(cx)));
        Some(
            card.with_animation(
                SharedString::from(format!("profile-{}", open.key)),
                gpui::Animation::new(std::time::Duration::from_millis(180)).with_easing(gpui::ease_out_quint()),
                move |d, t| d.opacity(t).top(px(top + 4. * (1. - t))),
            )
            .into_any_element(),
        )
    }

    fn copy_profile_id(&mut self, cx: &mut Context<Self>) {
        let Some(open) = self.profile.as_mut() else { return };
        cx.write_to_clipboard(ClipboardItem::new_string(open.member.id.clone()));
        open.copied = true;
        let key = open.key;
        cx.spawn(async move |this, cx| {
            cx.background_executor().timer(std::time::Duration::from_secs(2)).await;
            this.update(cx, |this, cx| {
                if let Some(open) = this.profile.as_mut().filter(|p| p.key == key) {
                    open.copied = false;
                    cx.notify();
                }
            })
            .ok();
        })
        .detach();
        cx.notify();
    }
}

impl Member {
    /// The card's heading: their display name (the server nickname is not used there).
    pub fn display_name_or_name(&self) -> String {
        if self.display_name.is_empty() { self.username.clone() } else { self.display_name.clone() }
    }
}

/// toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }).
fn model_short_date(value: &str) -> String {
    let Some(t) = crate::model::parse_time(value) else { return "Jun 2026".into() };
    let local = t.with_timezone(&chrono::Local);
    let locale = crate::i18n::locale();
    let (loc, pattern) = match locale.split('-').next().unwrap_or("en") {
        "tr" => (chrono::Locale::tr_TR, "%-d %b %Y"),
        "de" => (chrono::Locale::de_DE, "%-d. %b %Y"),
        "fr" => (chrono::Locale::fr_FR, "%-d %b %Y"),
        "es" => (chrono::Locale::es_ES, "%-d %b %Y"),
        "pt" => (chrono::Locale::pt_BR, "%-d de %b de %Y"),
        "nl" => (chrono::Locale::nl_NL, "%-d %b %Y"),
        _ => (chrono::Locale::en_US, "%b %-d, %Y"),
    };
    local.format_localized(pattern, loc).to_string()
}

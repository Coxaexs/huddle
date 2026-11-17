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
    /// The add-role picker (role managers only).
    role_picker: bool,
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
        // On a styled card the note writes in the card's own ink (dark on light cards).
        let note_ink: Hsla = super::profile_look::card_look(member.profile_style.as_ref(), &member.color).map(|l| l.ink).unwrap_or_else(|| Theme::ink().into());
        let note = cx.new(|cx| TextArea::new(t("common.loading"), cx).text(12., 16.8).max_lines(7).color(note_ink).placeholder_color(note_ink.opacity(0.45)));
        let id = member.id.clone();
        let subs = vec![
            cx.subscribe_in(&note, window, |this, _, event, window, cx| match event {
                // Enter saves (and leaves the box), like Discord; Esc just leaves it.
                AreaEvent::Submit | AreaEvent::Escape => {
                    window.focus(&this.composer.focus_handle(cx));
                    this.save_note(cx);
                }
                AreaEvent::Changed => {}
                _ => {}
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
            role_picker: false,
            copied: false,
            // Assumed tall until measured: the first frame then has the room to measure it whole
            // (an absolute box is cut to the room below its top).
            height: Rc::new(Cell::new(10_000.)),
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
        let Some(open) = self.profile.as_ref() else {
            self.fx_overlay.borrow_mut().take();
            return None;
        };
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
        // Frames draw art above and below the card, so leave room for it.
        let frame = m.profile_frame.clone().unwrap_or_default();
        let framed = !frame.is_empty() && frame != "none";
        let top = a.y.min(vh - height - if framed { 40. } else { 12. }).max(if framed { 64. } else { 12. });

        let left = raw_left.min(vw - width - 12.).max(12.);

        let accent: Hsla = css_color(&m.color).unwrap_or_else(|| rgb(0x5865f2).into());
        let line: Hsla = Theme::line().into();
        // The card's own style (profile-look.ts cardLook): its ink in three strengths, surfaces,
        // ring, button and background.
        let look = super::profile_look::card_look(m.profile_style.as_ref(), &m.color);
        let ink: Hsla = look.as_ref().map(|l| l.ink).unwrap_or_else(|| Theme::ink().into());
        let muted: Hsla = look.as_ref().map(|l| l.ink3).unwrap_or_else(|| Theme::muted().into());
        let ink2: Hsla = look.as_ref().map(|l| l.ink2).unwrap_or(muted);
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
            // `.pst .profile-card-avatar`: a 5px ring in the card's own colour.
            .when_some(look.as_ref().map(|l| l.ring), |d, ring| {
                d.rounded_full().shadow(vec![gpui::BoxShadow { color: ring, offset: gpui::point(px(0.), px(0.)), blur_radius: px(0.), spread_radius: px(5.) }])
            })
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
                    // `.pst { --paper: var(--pst-ring) }`: the dot's ring is the card's ring.
                    .border_color(look.as_ref().map(|l| l.ring).unwrap_or_else(|| rgb(0x16131f).into())),
            );
        let bubble_bg: Hsla = look.as_ref().map(|l| l.bubble).unwrap_or_else(|| Theme::panel().into());
        let bubble = m.status_text().map(|text| {
            div()
                .relative()
                .mb(px(4.))
                .max_w(px(170.))
                .px(px(10.))
                .py(px(5.))
                .rounded(px(14.))
                .bg(look.as_ref().map(|l| l.bubble).unwrap_or_else(|| Theme::panel().into()))
                .border_1()
                .border_color(rgba(0xffffff1f))
                .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.35), offset: gpui::point(px(0.), px(4.)), blur_radius: px(16.), spread_radius: px(0.) }])
                .text_size(px(12.))
                .font_weight(FontWeight::MEDIUM)
                .text_color(ink)
                .child(div().truncate().child(text))
                // `.profile-status-bubble-tail`: a 7x10 triangle pointing at the avatar.
                .child(
                    gpui::canvas(
                        |_, _, _| {},
                        move |bounds, _, window, _| {
                            let o = bounds.origin;
                            let mut b = gpui::PathBuilder::fill();
                            b.move_to(gpui::point(o.x + px(7.), o.y));
                            b.line_to(gpui::point(o.x, o.y + px(5.)));
                            b.line_to(gpui::point(o.x + px(7.), o.y + px(10.)));
                            b.close();
                            if let Ok(path) = b.build() {
                                window.paint_path(path, bubble_bg);
                            }
                        },
                    )
                    .absolute()
                    .left(px(-6.))
                    .bottom(px(12.))
                    .w(px(7.))
                    .h(px(10.)),
                )
        });
        let avatar_row = div().flex_none().mt(px(-30.)).px(px(14.)).flex().items_end().gap(px(12.)).child(avatar).children(bubble);

        // Name, member tag, @username • pronouns, tagline.
        let tag = if self.home { None } else { self.member_tag(m) };
        let style = crate::names::NameStyle::from_profile(m.profile_style.as_ref());
        // `.profile-display-name:has(> .pn)`: a styled name is 19px.
        let name_size = if style.is_some() { 19. } else { 17. };
        let name = div()
            .text_size(px(name_size))
            .line_height(px(name_size * 1.2))
            // The name's line box stays 1.2em, whatever the styled name draws over it.
            .h(px(name_size * 1.2))
            .flex()
            .items_center()
            .font_weight(FontWeight::BOLD)
            .text_color(ink)
            .child(crate::names::styled_name(&m.display_name_or_name(), style.as_ref(), name_size, FontWeight::BOLD, ink, window, cx));
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
                sub = sub.child(div().text_color(ink2).child(format!("{global} ·")));
            }
        }
        sub = sub.child(div().text_color(ink2).child(format!("@{}", m.username)));
        if let Some(p) = m.pronouns.as_deref().filter(|p| !p.is_empty()) {
            sub = sub.child(div().text_color(if look.is_some() { ink2 } else { rgb(0x949ba4).into() }).child(format!("• {p}")));
        }
        // `.profile-inline-pride`: the first badge beside the username, 4px low.
        if let Some(first) = m.pride_badges.first().and_then(|id| super::profile_editor::pride_badge(id, ink, window.scale_factor())) {
            sub = sub.items_center().child(div().pt(px(4.)).pb(px(1.)).child(first));
        }
        let mut header = div().flex_none().flex().flex_col().child(div().flex().flex_wrap().items_center().gap(px(8.)).child(name).children(tag)).child(sub);
        if !m.tagline.is_empty() {
            header = header.child(div().mt(px(4.)).text_size(px(12.)).line_height(px(15.6)).italic().text_color(muted).child(m.tagline.clone()));
        }

        // The panel.
        // `.pst .profile-section h4`: the card's own ink.
        let h4_color = if look.is_some() { ink } else { muted };
        let h4 = |text: String| div().mb(px(3.)).text_size(px(10.5)).line_height(px(15.75)).font_weight(FontWeight::BOLD).text_color(h4_color).child(text);
        let long_bio = m.bio.chars().count() > 130;
        let bio_text = if m.bio.trim().is_empty() { t("profile.noBio") } else { m.bio.clone() };
        let mut bio = div().child(
            div().text_size(px(12.5)).line_height(px(17.5)).text_color(if look.is_some() { ink2 } else { ink }).when(long_bio && !open.bio_open, |d| d.line_clamp(3)).child(bio_text),
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
            .bg(look.as_ref().map(|l| l.surface).unwrap_or_else(|| mix(accent, 0.08, ink.opacity(0.05))))
            .border_1()
            .border_color(look.as_ref().map(|l| l.line).unwrap_or_else(|| rgba(0xffffff12).into()))
            .child(bio);
        if !self.home
            && let Some(server) = self.server()
        {
            let held: Vec<String> = m.role_ids.get(&server.id).and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect()).unwrap_or_default();
            let roles: Vec<_> = server.roles.iter().filter(|r| held.contains(&r.id)).collect();
            // onToggleRole: the owner and those who manage the server or its roles can take a
            // role away (its dot turns into an x on hover) or give one (+, a picker).
            let perms = self.my_permissions();
            let manage = server.owner_id.as_deref() == Some(self.me.id.as_str()) || perms & (1 << 3) != 0 || perms & (1 << 5) != 0;
            let givable: Vec<_> = server.roles.iter().filter(|r| !held.contains(&r.id)).collect();
            if !roles.is_empty() || (manage && !server.roles.is_empty()) {
                let mut list = div().flex().flex_wrap().gap(px(4.));
                for role in &roles {
                    let color: Hsla = css_color(&role.color).unwrap_or(muted);
                    let pill = SharedString::from(format!("role-pill-{}", role.id));
                    let dot = if manage {
                        let (sid, uid, rid) = (server.id.clone(), m.id.clone(), role.id.clone());
                        div()
                            .id(SharedString::from(format!("role-remove-{}", role.id)))
                            .size(px(12.))
                            .flex_none()
                            .rounded_full()
                            .bg(color)
                            .flex()
                            .items_center()
                            .justify_center()
                            .cursor_pointer()
                            .tooltip(ui::tooltip(tv("profile.removeRole", &[("name", role.name.as_str())])))
                            .child(div().invisible().group_hover(pill.clone(), |s| s.visible()).child(ui::icon("x", 10., Hsla::from(Theme::paper()))))
                            .on_click(cx.listener(move |this, _, _, cx| {
                                cx.stop_propagation();
                                this.toggle_member_role(sid.clone(), uid.clone(), rid.clone(), false, cx);
                            }))
                            .into_any_element()
                    } else {
                        div().size(px(8.)).flex_none().rounded_full().bg(color).into_any_element()
                    };
                    list = list.child(
                        div()
                            .group(pill)
                            .flex()
                            .items_center()
                            .gap(px(4.))
                            .px(px(8.))
                            .py(px(2.))
                            .rounded(px(4.8))
                            .bg(ink.opacity(0.06))
                            .border_1()
                            .border_color(color)
                            .text_size(px(12.))
                            .line_height(px(18.))
                            .font_weight(FontWeight::MEDIUM)
                            .child(dot)
                            .child(div().text_color(color).child(role.name.clone())),
                    );
                }
                if manage && !givable.is_empty() {
                    let picker = open.role_picker.then(|| {
                        let mut menu = div()
                            .id("role-picker")
                            .absolute()
                            .top(px(26.))
                            .left_0()
                            .min_w(px(170.))
                            .max_h(px(200.))
                            .overflow_y_scroll()
                            .p(px(4.))
                            .rounded(px(7.2))
                            .border_1()
                            .border_color(rgba(0xffffff1a))
                            .bg(Theme::paper())
                            .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.5), offset: gpui::point(px(0.), px(8.)), blur_radius: px(20.), spread_radius: px(0.) }])
                            .on_mouse_down(gpui::MouseButton::Left, |_, _, cx| cx.stop_propagation());
                        for role in &givable {
                            let color: Hsla = css_color(&role.color).unwrap_or(muted);
                            let (sid, uid, rid) = (server.id.clone(), m.id.clone(), role.id.clone());
                            menu = menu.child(
                                div()
                                    .id(SharedString::from(format!("role-give-{}", role.id)))
                                    .flex()
                                    .items_center()
                                    .gap(px(8.))
                                    .px(px(8.))
                                    .py(px(6.))
                                    .rounded(px(3.6))
                                    .text_size(px(13.))
                                    .text_color(Theme::ink())
                                    .cursor_pointer()
                                    .hover(|s| s.bg(Hsla::from(Theme::ink()).opacity(0.08)))
                                    .child(div().size(px(10.)).flex_none().rounded_full().bg(color))
                                    .child(role.name.clone())
                                    .on_click(cx.listener(move |this, _, _, cx| {
                                        if let Some(open) = this.profile.as_mut() {
                                            open.role_picker = false;
                                        }
                                        this.toggle_member_role(sid.clone(), uid.clone(), rid.clone(), true, cx);
                                    })),
                            );
                        }
                        gpui::deferred(menu).with_priority(3)
                    });
                    let on = open.role_picker;
                    list = list.child(
                        div().relative().child(
                            div()
                                .id("role-add")
                                .w(px(24.))
                                .h(px(22.))
                                .rounded(px(4.8))
                                .border_1()
                                .border_color(look.as_ref().map(|l| l.line).unwrap_or(line))
                                .bg(if on { ink.opacity(0.12) } else { ink.opacity(0.06) })
                                .flex()
                                .items_center()
                                .justify_center()
                                .cursor_pointer()
                                .tooltip(ui::tooltip(t("profile.addRole")))
                                .hover(|s| s.bg(ink.opacity(0.12)))
                                .child(ui::icon("plus", 12., if on { ink } else { muted }))
                                .on_click(cx.listener(|this, _, _, cx| {
                                    if let Some(open) = this.profile.as_mut() {
                                        open.role_picker = !open.role_picker;
                                    }
                                    cx.notify();
                                })),
                        )
                        .children(picker),
                    );
                }
                let title = if roles.is_empty() { "ROLES".to_string() } else { format!("ROLES ({})", roles.len()) };
                panel = panel.child(div().child(h4(title)).child(list));
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
                    .border_color(look.as_ref().map(|l| l.line).unwrap_or_else(|| rgba(0xffffff12).into()))
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
                .child(div().min_w_0().child(tv("profile.memberSince", &[("date", &since)])))
                // lastSeenLabel, for someone else who is offline.
                .when_some((m.id != self.me.id && self.presence_of(&m.id) == "offline").then(|| last_seen_label(&m.last_seen_at)).flatten(), |d, seen| {
                    d.child(div().min_w_0().child(format!("· {seen}")))
                }),
        );

        // The buttons.
        let styled_button: Option<Hsla> = look.as_ref().map(|l| l.button);
        let button_glow: Hsla = look.as_ref().map(|l| l.pt_a.opacity(0.3)).unwrap_or_default();
        let made = Cell::new(false);
        let button = |id: &'static str, icon: &'static str, label: String, primary: bool, gap: f32| {
            // `.pst … .discord-btn:first-child`: buttons are made in order, so the first made leads.
            let lead = styled_button.is_some() && !made.replace(true);
            let primary = primary || lead;
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
                .when(primary && styled_button.is_none(), |d| d.bg(Theme::lavender()).text_color(rgb(0x15121f)))
                // `.pst … .discord-btn:first-child`: on a styled card the first button (whichever
                // it is) takes the card's colour.
                // `.pst … .discord-btn:first-child`: the card's own button colour, white text.
                .when_some(styled_button.filter(|_| primary), |d, bg| {
                    // inset 0 0 0 1px rgba(255,255,255,.16), 0 6px 16px (pt-a 30%)
                    d.bg(bg).text_color(gpui::white()).border_1().border_color(gpui::hsla(0., 0., 1., 0.16)).shadow(vec![gpui::BoxShadow {
                        color: button_glow,
                        offset: gpui::point(px(0.), px(6.)),
                        blur_radius: px(16.),
                        spread_radius: px(0.),
                    }])
                })
                .when(!primary, |d| d.bg(Theme::card()).border_1().border_color(rgba(0xffffff12)).text_color(ink))
                .when(!icon.is_empty(), |d| d.child(ui::icon(icon, 14., if primary { if styled_button.is_some() { gpui::white() } else { Hsla::from(rgb(0x15121f)) } } else { ink })))
                .when(!label.is_empty(), |d| d.child(label))
        };
        let blocked = self.friends.blocked.iter().any(|f| f.id == m.id);
        // The buttons go two to a row, each half the width (`flex: 1 1 calc(50% - 3px)`).
        let mut buttons: Vec<AnyElement> = Vec::new();
        if !me && !blocked {
            buttons.push(match self.friend_status(&m.id) {
                // Friends (a green check), turning into Remove Friend (a rose minus) on hover.
                "friend" => button("pf-friend", "", String::new(), false, 6.)
                    .group("pf-friend")
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(6.))
                            .group_hover("pf-friend", |s| s.hidden())
                            .child(ui::icon("user-check", 14., rgb(0x34d399)))
                            .child(t("sidebar.friends")),
                    )
                    .child(
                        div()
                            .hidden()
                            .items_center()
                            .gap(px(6.))
                            .group_hover("pf-friend", |s| s.flex())
                            .child(ui::icon("user-minus", 14., rgb(0xfb7185)))
                            .child(t("profile.removeFriend")),
                    )
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

        // `.pst .profile-badge-item, .pst .profile-social-link-pill`: the card's surface and line.
        let chip_bg: Hsla = look.as_ref().map(|l| l.surface).unwrap_or_else(|| rgba(0xffffff14).into());
        let chip_line: Hsla = look.as_ref().map(|l| l.line).unwrap_or_else(|| rgba(0xffffff1a).into());
        // `.profile-badges-shelf`: the owner mark and every pride badge, when there are any.
        let pride: Vec<AnyElement> = m.pride_badges.iter().filter_map(|id| super::profile_editor::pride_badge(id, ink, window.scale_factor())).collect();
        let shelf = (m.is_admin || !pride.is_empty()).then(|| {
            div()
                .flex_none()
                .flex()
                .flex_wrap()
                .items_center()
                .gap(px(4.))
                .when(m.is_admin, |d| {
                    d.child(
                        div()
                            .px(px(7.))
                            .py(px(3.))
                            .rounded(px(6.))
                            .border_1()
                            .border_color(chip_line)
                            .bg(chip_bg)
                            .text_size(px(11.))
                            .line_height(px(16.5))
                            .font_weight(FontWeight::BOLD)
                            .text_color(if look.is_some() { ink2 } else { gpui::white() })
                            .child("🛡️ Owner"),
                    )
                })
                .when(!pride.is_empty(), |d| d.child(div().pt(px(4.)).flex().flex_wrap().gap(px(6.)).children(pride)))
        });
        // `.profile-achievements-shelf`: their pinned achievements, each opening their board.
        let defs: Vec<super::achievements::Def> = m.achievement_showcase.iter().filter_map(|id| super::achievements::find_def(id)).collect();
        let achievements = (!defs.is_empty()).then(|| {
            let target = (m.id.clone(), m.display_name_or_name());
            let open_board = |target: (String, String)| cx.listener(move |this, _, _, cx| {
                this.profile = None;
                this.open_achievements_for(Some(target.clone()), cx);
            });
            // `flex: 1 1 0; max-width: 64px` worked out here (gpui measures clamped text badly in
            // a flex-sized box): the body's width shared out, 64 at most.
            let n = defs.len() as f32;
            let item_w = ((width - 28. - 2. - 4. * (n - 1.)) / n).min(64.);
            let mut row = div().flex().gap(px(4.));
            for def in &defs {
                row = row.child(
                    div()
                        .id(SharedString::from(format!("profile-ach-{}", def.id)))
                        .flex_none()
                        .w(px(item_w))
                        .px(px(2.))
                        .py(px(4.))
                        .rounded(px(10.))
                        .flex()
                        .flex_col()
                        .items_center()
                        .gap(px(3.))
                        .cursor_pointer()
                        .hover(|s| s.bg(ink.opacity(0.06)))
                        .tooltip(ui::tooltip(format!("{}: {}", def.label, def.description)))
                        .child(super::achievements::medal(def, true, 34., window.scale_factor()))
                        .child({
                            // CSS breaks only between words: a word wider than the box stays whole
                            // and is cut off at its edges, centred.
                            let box_w = item_w - 4.;
                            let mut lines: Vec<String> = Vec::new();
                            for word in def.label.split_whitespace() {
                                match lines.last_mut() {
                                    Some(last) if f32::from(ui::text_width(window, &format!("{last} {word}"), FontWeight::NORMAL, 9.5)) <= box_w => {
                                        last.push(' ');
                                        last.push_str(word);
                                    }
                                    _ => lines.push(word.to_string()),
                                }
                            }
                            div()
                                .w(px(box_w))
                                .h(px(21.8))
                                .overflow_hidden()
                                .flex()
                                .flex_col()
                                .items_center()
                                .text_size(px(9.5))
                                .line_height(px(10.9))
                                .text_color(ink)
                                .children(lines.into_iter().take(2).map(|line| {
                                    // An overflowing line starts at the left edge, as in CSS.
                                    let wide = f32::from(ui::text_width(window, &line, FontWeight::NORMAL, 9.5)) > box_w;
                                    div().flex_none().w_full().whitespace_nowrap().when(!wide, |d| d.text_center()).child(line)
                                }))
                        })
                        .on_click(open_board(target.clone())),
                );
            }
            // `.profile-achievements-shelf { margin: 8px 0 4px }` beside the body's 8px gap.
            div()
                .flex_none()
                .mt(px(8.))
                .mb(px(4.))
                .child(
                    div()
                        .mb(px(6.))
                        .flex()
                        .items_center()
                        .justify_between()
                        .text_size(px(11.))
                        .line_height(px(16.5))
                        .font_weight(FontWeight::BOLD)
                        .text_color(muted)
                        .child("ACHIEVEMENTS")
                        .child(div().id("profile-ach-all").text_size(px(10.5)).font_weight(FontWeight::NORMAL).text_color(Theme::lavender()).cursor_pointer().hover(|s| s.underline()).child("See all").on_click(open_board(target.clone()))),
                )
                .child(row)
        });
        // `.profile-social-links`: a pill per link, opening it in the browser.
        let socials = (!m.social_links.is_empty()).then(|| {
            // `.user-profile-card-popover .profile-social-links`: 4px apart, pills 2px 8px.
            let mut row = div().my(px(8.)).flex().flex_wrap().gap(px(4.));
            for (n, link) in m.social_links.iter().enumerate() {
                let label = link.label.clone().filter(|l| !l.is_empty()).unwrap_or_else(|| link.platform.clone());
                let url = if link.url.starts_with("http") { link.url.clone() } else { format!("https://{}", link.url) };
                let glyph = match link.platform.to_lowercase().trim() {
                    "github" => "social-github",
                    "twitter" | "x" => "social-twitter",
                    "discord" => "social-discord",
                    "youtube" => "social-youtube",
                    "twitch" => "social-twitch",
                    "instagram" => "social-instagram",
                    "spotify" => "music",
                    "steam" => "social-steam",
                    _ => "globe",
                };
                row = row.child(
                    div()
                        .id(SharedString::from(format!("profile-social-{n}")))
                        .relative()
                        .flex()
                        .items_center()
                        .gap(px(5.))
                        .px(px(8.))
                        .py(px(2.))
                        .rounded(px(14.))
                        .bg(if look.is_some() { chip_bg } else { gpui::rgba(0xffffff14).into() })
                        .border_1()
                        .border_color(if look.is_some() { chip_line } else { gpui::rgba(0xffffff1f).into() })
                        .text_size(px(11.))
                        .line_height(px(16.5))
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(if look.is_some() { ink2 } else { Theme::ink().into() })
                        .cursor_pointer()
                        .hover(|s| s.bg(gpui::rgba(0xffffff26)).border_color(Theme::lavender()).top(px(-1.)))
                        .tooltip(ui::tooltip(format!("{label}: {}", link.url)))
                        .child(ui::icon(glyph, 14., if look.is_some() { ink2 } else { Theme::ink().into() }))
                        .child(label)
                        .on_click(move |_, _, cx| cx.open_url(&url)),
                );
            }
            row
        });
        let body = div().flex_none().pt(px(8.)).px(px(14.)).pb(px(14.)).flex().flex_col().gap(px(8.)).child(header).children(shelf).children(achievements).children(socials).child(panel).child(actions);
        let measured = open.height.clone();
        // The card's layers: the edge (a frame's gradient, the style's gradient line, or a plain
        // line), then the background inside it (the style's finish, or the accent fading down).
        let frame_edge = if framed { super::profile_look::frame_edge(&frame) } else { None };
        let edge_grad: Option<(String, f32)> = frame_edge.as_ref().map(|(g, _)| (g.clone(), 3.)).or_else(|| look.as_ref().and_then(|l| l.edge_grad.clone()));
        let bw = edge_grad.as_ref().map_or(1., |(_, w)| *w);
        let edge_layer = match &edge_grad {
            Some((grad, _)) => div().absolute().inset_0().rounded(px(16.)).child(ui::css_background(ui::css_static(grad.clone()), 16.)).into_any_element(),
            None => div()
                .absolute()
                .inset_0()
                .rounded(px(16.))
                .bg(look.as_ref().map(|l| l.edge_line.unwrap_or(gpui::hsla(0., 0., 0., 0.))).unwrap_or_else(|| mix(accent, 0.45, line)))
                .into_any_element(),
        };
        // `.pst-backdrop`: an aurora card's lights, then the pattern, over the finish.
        let lights = look.as_ref().and_then(|l| l.lights.clone()).map(|css| {
            gpui::canvas(
                |_, _, _| {},
                move |bounds, _, window, _| {
                    let (w, h) = (f32::from(bounds.size.width).round(), f32::from(bounds.size.height).round());
                    if let Some(picture) = super::profile_look::lights_picture(&css, w, h, window.scale_factor()) {
                        let _ = window.paint_image(bounds, gpui::Corners::default(), picture, 0, false);
                    }
                },
            )
            .absolute()
            .top_0()
            .left_0()
            .size_full()
        });
        let pattern = look.as_ref().and_then(|l| l.pattern.clone().map(|(kind, color)| (kind, color, l.light))).map(|(kind, color, light)| {
            let radius = 16. - bw;
            gpui::canvas(
                |_, _, _| {},
                move |bounds, _, window, _| {
                    let (w, h) = (f32::from(bounds.size.width).round(), f32::from(bounds.size.height).round());
                    if let Some(picture) = super::profile_look::pattern_picture(&kind, color, light, w, h, window.scale_factor()) {
                        let _ = window.paint_image(bounds, gpui::Corners::all(px(radius)), picture, 0, false);
                    }
                },
            )
            .absolute()
            .top_0()
            .left_0()
            .size_full()
        });
        let flow = look.as_ref().and_then(|l| l.flow.clone());
        // Under a flow edge the background runs to the card's edge (its ring is partly clear).
        let inset = if flow.is_some() { 0. } else { bw };
        let flow_ring = flow.map(|stops| {
            gpui::canvas(|_, _, _| {}, move |bounds, _, window, _| super::profile_look::paint_flow_edge(bounds, &stops, 16., window))
                .absolute()
                .top_0()
                .left_0()
                .size_full()
        });
        let bg_layer = div().absolute().top(px(inset)).left(px(inset)).right(px(inset)).bottom(px(inset)).rounded(px(16. - inset)).overflow_hidden().child(match &look {
            Some(l) => ui::css_background(ui::css_static(l.bg.clone()), 16. - inset).into_any_element(),
            None => div()
                .size_full()
                .bg(gpui::linear_gradient(180., gpui::linear_color_stop(mix(accent, 0.22, rgb(0x17181d)), 0.), gpui::linear_color_stop(mix(accent, 0.08, rgb(0x101115)), 1.)))
                .into_any_element(),
        }).children(lights).children(pattern);
        let shadow = look.as_ref().and_then(|l| l.shadow.clone()).or_else(|| frame_edge.as_ref().map(|(_, s)| s.clone()).filter(|s| !s.is_empty())).unwrap_or_else(|| {
            vec![
                gpui::BoxShadow { color: accent.opacity(0.18), offset: gpui::point(px(0.), px(0.)), blur_radius: px(0.), spread_radius: px(1.) },
                gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.55), offset: gpui::point(px(0.), px(20.)), blur_radius: px(50.), spread_radius: px(0.) },
                gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.4), offset: gpui::point(px(0.), px(4.)), blur_radius: px(14.), spread_radius: px(0.) },
            ]
        });
        let card = div()
            .id("profile-card")
            .absolute()
            .left(px(left))
            .top(px(top))
            .w(px(width))
            .rounded(px(16.))
            .p(px(bw))
            .shadow(shadow)
            .child(edge_layer)
            .child(bg_layer)
            .text_color(rgb(0xf2f3f5))
            .flex()
            .flex_col()
            .child(banner.relative())
            .child(avatar_row.relative())
            .child(body.relative())
            .children(flow_ring)
            // `.pfx`: the effect, played by the web's own code in a web view kept over the card.
            .children(self.profile_effect_layer(m, open.key, window, cx))
            // `.pframe-art`: the frame's pieces, over the card and around it.
            .children(crate::cosmetics::frame_art(&frame, width, open.height.get(), window.scale_factor()))
            // Measured each frame; a change places the card again on the next one.
            .child(
                gpui::canvas(
                    move |bounds, window, _| {
                        let mut h = f32::from(bounds.size.height);
                        // An absolute box is cut to the room below its top: one that fills it may be
                        // taller, so it goes to the top edge first and is measured again there.
                        if top + h >= vh - 0.5 && top > 12.5 {
                            h = vh;
                        }
                        if (measured.get() - h).abs() > 0.5 {
                            measured.set(h);
                            // A refresh asked for while painting is lost with this frame: ask on the next.
                            window.on_next_frame(|window, _| window.refresh());
                        }
                    },
                    |_, _, _, _| {},
                )
                .absolute()
                .top_0()
                .left_0()
                .size_full(),
            )
            .on_mouse_down_out(cx.listener(|this, _, _, cx| this.close_profile(cx)));
        // A styled card arrives its own way (`.pst-in-*`); others pop in.
        if let Some(kind) = look.as_ref().and_then(|l| l.entrance.clone()) {
            let ms = super::profile_look::entrance_ms(&kind);
            return Some(
                card.with_animation(SharedString::from(format!("profile-{}", open.key)), gpui::Animation::new(std::time::Duration::from_millis(ms)), move |d, t| {
                    let (opacity, y) = super::profile_look::entrance_at(&kind, t);
                    d.opacity(opacity).top(px(top + y))
                })
                .into_any_element(),
            );
        }
        Some(
            card.with_animation(
                SharedString::from(format!("profile-{}", open.key)),
                gpui::Animation::new(std::time::Duration::from_millis(180)).with_easing(gpui::ease_out_quint()),
                move |d, t| d.opacity(t).top(px(top + 4. * (1. - t))),
            )
            .into_any_element(),
        )
    }

    fn profile_effect_layer(&self, m: &crate::model::Member, card: u64, window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let effect = m.profile_effect.clone().filter(|e| !e.is_empty() && e != "none");
        let Some(effect) = effect else {
            self.fx_overlay.borrow_mut().take();
            return None;
        };
        let key = format!("{card}|{effect}");
        let fresh = self.fx_overlay.borrow().as_ref().is_none_or(|(k, _)| k != &key);
        if fresh {
            let overlay = crate::webview::effect_overlay(window, &effect);
            *self.fx_overlay.borrow_mut() = overlay.map(|o| (key.clone(), o));
            // HOFFLE_DEV_FX_SHOT=<png>: the effect's own picture after 4 s (the window snapshot has
            // only GPUI's drawing).
            if let Ok(path) = std::env::var("HOFFLE_DEV_FX_SHOT") {
                let shared = self.fx_overlay.clone();
                cx.spawn(async move |_, cx| {
                    cx.background_executor().timer(std::time::Duration::from_secs(4)).await;
                    if let Some((_, o)) = shared.borrow().as_ref() {
                        o.snapshot(&path);
                    }
                })
                .detach();
            }
        }
        let shared = self.fx_overlay.clone();
        Some(
            gpui::canvas(
                |_, _, _| {},
                move |bounds, _, _, _| {
                    if let Some((_, o)) = shared.borrow_mut().as_mut() {
                        o.set_frame(f32::from(bounds.origin.x), f32::from(bounds.origin.y), f32::from(bounds.size.width), f32::from(bounds.size.height));
                    }
                },
            )
            .absolute()
            .top_0()
            .left_0()
            .size_full()
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

/// lib/users.ts lastSeenLabel: just now, minutes, hours, days, then the date.
fn last_seen_label(iso: &str) -> Option<String> {
    let then = crate::model::parse_time(iso)?;
    let minutes = (chrono::Utc::now() - then.with_timezone(&chrono::Utc)).num_minutes().max(0);
    Some(if minutes < 1 {
        t("lastSeen.justNow")
    } else if minutes < 60 {
        tv("lastSeen.minutesAgo", &[("minutes", &minutes.to_string())])
    } else if minutes < 60 * 24 {
        tv("lastSeen.hoursAgo", &[("hours", &(minutes / 60).to_string())])
    } else if minutes < 60 * 24 * 30 {
        tv("lastSeen.daysAgo", &[("days", &(minutes / 60 / 24).to_string())])
    } else {
        tv("lastSeen.date", &[("date", &model_short_date(iso))])
    })
}

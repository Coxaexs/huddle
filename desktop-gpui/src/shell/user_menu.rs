//! UserMenu (components/user-menu.tsx): right-click on someone (member row, name, avatar, voice
//! seat). Their name, @username and time in voice; nickname and server picture; Message, Block,
//! Mute for me and their volume; for moderators server mute, disconnect, move, timeout, kick / ban.

use std::cell::Cell;
use std::rc::Rc;

use gpui::{AnyElement, Context, FontWeight, Hsla, Pixels, Point, Window, div, prelude::*, px, rgb};

use super::Shell;
use crate::i18n::{t, tv};
use crate::theme::Theme;

pub(super) struct UserMenu {
    pub user_id: String,
    pub at: Point<Pixels>,
    height: Rc<Cell<f32>>,
}

/// A person's voice settings on this account (`/api/voice/prefs`).
#[derive(Clone, Copy, Debug, serde::Deserialize)]
#[serde(default)]
pub struct VoicePref {
    pub volume: u32,
    pub muted: bool,
}

impl Default for VoicePref {
    fn default() -> Self {
        Self { volume: 100, muted: false }
    }
}

impl Shell {
    pub(super) fn open_user_menu(&mut self, user_id: String, at: Point<Pixels>, cx: &mut Context<Self>) {
        self.profile = None;
        self.user_menu = Some(UserMenu { user_id, at, height: Rc::new(Cell::new(275.)) });
        self.load_banned(cx);
        cx.notify();
    }

    pub(super) fn load_voice_prefs(&mut self, cx: &mut Context<Self>) {
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let prefs = cx.background_executor().spawn(async move { client.voice_prefs() }).await;
            this.update(cx, |this, cx| {
                if let Ok(prefs) = prefs {
                    this.voice_prefs = prefs;
                    this.apply_voice_prefs();
                    cx.notify();
                }
            })
            .ok();
        })
        .detach();
    }

    /// Tells the call whom not to play (a volume of 0 counts as muted: the call has no per-person
    /// volume of its own).
    pub(super) fn apply_voice_prefs(&self) {
        let muted = self.voice_prefs.iter().filter(|(_, p)| p.muted || p.volume == 0).map(|(id, _)| id.clone()).collect();
        self.voice.send(crate::voice::VoiceCmd::MuteFor(muted));
    }

    /// saveVoicePref: changed here at once, then saved to the account.
    pub(super) fn save_voice_pref(&mut self, user_id: String, volume: Option<u32>, muted: Option<bool>, cx: &mut Context<Self>) {
        let pref = self.voice_prefs.entry(user_id.clone()).or_default();
        if let Some(v) = volume {
            pref.volume = v;
        }
        if let Some(m) = muted {
            pref.muted = m;
        }
        self.apply_voice_prefs();
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let saved = cx.background_executor().spawn(async move { client.save_voice_pref(&user_id, volume, muted) }).await;
            this.update(cx, |this, cx| {
                if let Err(e) = saved {
                    this.set_notice(e.to_string(), cx);
                }
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    pub(super) fn render_user_menu(&self, window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let menu = self.user_menu.as_ref()?;
        let member = self.member(&menu.user_id).or_else(|| self.member_anywhere(&menu.user_id)).cloned();
        let (name, username) = match &member {
            Some(m) => (m.display_name_or_name(), m.username.clone()),
            None => {
                let seat = self.rooms.values().flatten().find(|p| p.id == menu.user_id)?;
                (seat.name().to_string(), seat.username.clone())
            }
        };
        let me = menu.user_id == self.me.id;
        let blocked = self.friends.blocked.iter().any(|f| f.id == menu.user_id);
        let pref = self.voice_prefs.get(&menu.user_id).copied().unwrap_or_default();
        let muted: Hsla = Theme::muted().into();
        let seat = self.rooms.values().flatten().find(|p| p.id == menu.user_id);
        let in_voice = seat.map(|p| super::sidebar::duration(((self.hub_now() - p.joined_at) / 1000.).max(0.) as u64));

        let item = |id: gpui::ElementId, label: String, danger: bool| {
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
        let mut card = div()
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
                    .child(div().text_size(px(16.)).line_height(px(24.)).font_weight(FontWeight::BOLD).text_color(rgb(0xf5f3ee)).child(name))
                    // PrideBadges mini sits inline before the @username, no gap.
                    // The row's line box is 18px (12px/18px), the @username span inside it 15px.
                    .child(
                        div()
                            .h(px(18.))
                            .flex()
                            .items_center()
                            .children(member.as_ref().and_then(|m| super::profile_editor::pride_mini(&m.pride_badges, window.scale_factor())))
                            .child(div().text_size(px(12.)).line_height(px(15.)).text_color(muted).child(format!("@{username}"))),
                    )
                    .when_some(in_voice, |d, time| d.child(div().text_size(px(12.)).line_height(px(15.)).text_color(muted).child(time))),
            );
        let id = menu.user_id.clone();
        // menus.tsx: what this viewer may do to this person here.
        use super::member_actions::bits;
        let perms = if self.home { 0 } else { self.my_permissions() };
        let can_moderate = perms & bits::MODERATE != 0;
        let can_manage = perms & bits::MANAGE_SERVER != 0;
        let here = if self.home { None } else { self.member(&id).cloned() };
        let owner = self.server().and_then(|s| s.owner_id.clone());
        let protected = here.as_ref().is_some_and(|m| m.is_admin) || owner.as_deref() == Some(id.as_str());
        let can_nick = perms & bits::MANAGE_NICKNAMES != 0 && !protected;
        let voice_rooms: Vec<(String, String)> =
            if self.home { Vec::new() } else { self.server().map(|s| s.channels.iter().filter(|c| c.is_voice()).map(|c| (c.id.clone(), c.name.clone())).collect()).unwrap_or_default() };
        let sits_in = |room: &str| self.rooms.get(room).is_some_and(|people| people.iter().any(|p| p.id == id));
        let target_room = voice_rooms.iter().map(|(r, _)| r.clone()).find(|r| sits_in(r));
        let menu_room = target_room.clone().or_else(|| if me { self.rooms.keys().find(|r| sits_in(r)).cloned() } else { None });
        let divider = || div().h(px(1.)).my(px(6.)).bg(rgb(0x41434f));
        let note = |text: String| div().mt(px(4.)).mb(px(2.)).px(px(8.)).text_size(px(11.)).line_height(px(15.4)).text_color(muted).child(text);
        let section_label = |text: String| div().pt(px(2.)).px(px(8.)).pb(px(4.)).text_size(px(11.)).line_height(px(16.5)).font_weight(FontWeight::BOLD).text_color(muted).child(text.to_uppercase());
        if here.is_some() && (me || can_nick) {
            let id2 = id.clone();
            card = card.child(item("um-nick".into(), (if me { "Change nickname" } else { "Edit nickname" }).into(), false).on_click(cx.listener(move |this, _, window, cx| {
                this.user_menu = None;
                this.edit_nickname(id2.clone(), window, cx);
            })));
        }
        if me && here.is_some() {
            card = card.child(item("um-savatar".into(), t("serverAvatar.change"), false).on_click(cx.listener(|this, _, _, cx| {
                this.user_menu = None;
                let me = this.me.id.clone();
                this.set_server_avatar(me, false, cx);
            })));
        }
        if here.as_ref().is_some_and(|m| m.server_avatar_url.as_deref().is_some_and(|u| !u.is_empty())) && (me || can_nick) {
            let id2 = id.clone();
            card = card.child(item("um-savatar-off".into(), t("serverAvatar.remove"), false).on_click(cx.listener(move |this, _, _, cx| {
                this.user_menu = None;
                this.set_server_avatar(id2.clone(), true, cx);
            })));
        }
        let disconnect = |label: &str| {
            menu_room.clone().map(|room| {
                let id2 = id.clone();
                item("um-disconnect".into(), t(label), true).on_click(cx.listener(move |this, _, _, cx| {
                    this.user_menu = None;
                    this.disconnect_member(id2.clone(), room.clone(), cx);
                }))
            })
        };
        if me {
            let id2 = id.clone();
            card = card
                .child(item("um-notes".into(), t("userMenu.noteToSelf"), false).on_click(cx.listener(move |this, _, _, cx| {
                    this.user_menu = None;
                    this.open_dm_with(id2.clone(), cx);
                })))
                .children(disconnect("userMenu.disconnectSelf"))
                .child(div().mt(px(4.)).mb(px(2.)).px(px(8.)).text_size(px(12.)).text_color(muted).child(t("userMenu.thisIsYou")));
        } else {
            if !blocked {
                let id2 = id.clone();
                card = card.child(item("um-message".into(), t("userMenu.message"), false).on_click(cx.listener(move |this, _, _, cx| {
                    this.user_menu = None;
                    this.open_dm_with(id2.clone(), cx);
                })));
            }
            let id2 = id.clone();
            card = card.child(
                item("um-block".into(), t(if blocked { "userMenu.unblock" } else { "userMenu.block" }), !blocked).on_click(cx.listener(move |this, _, _, cx| {
                    this.user_menu = None;
                    this.block_toggle(id2.clone(), blocked, cx);
                })),
            );
            let id2 = id.clone();
            card = card.child(
                item("um-mute".into(), t(if pref.muted { "userMenu.unmuteForMe" } else { "userMenu.muteForMe" }), false)
                    .on_click(cx.listener(move |this, _, _, cx| this.save_voice_pref(id2.clone(), None, Some(!pref.muted), cx))),
            );
            // `.user-menu-volume`: "Their volume · N%" and a 0–200% slider.
            let id2 = id.clone();
            let fill = pref.volume.min(200) as f32 / 200.;
            card = card.child(
                div()
                    .p(px(8.))
                    .flex()
                    .flex_col()
                    .gap(px(6.))
                    .child(div().text_size(px(12.)).line_height(px(18.)).text_color(muted).child(tv("userMenu.volumeLabel", &[("volume", &pref.volume.to_string())])))
                    .child(
                        div()
                            .id("um-volume")
                            .relative()
                            .w(px(196.))
                            .h(px(16.))
                            .cursor_pointer()
                            // Chrome's dark-scheme range: a dark track with a grey edge, filled in light blue.
                            .child(div().absolute().left_0().right_0().top(px(4.)).h(px(8.)).rounded_full().bg(rgb(0x2b2a33)).border_1().border_color(rgb(0x767680)))
                            .child(div().absolute().left_0().top(px(4.)).w(px(8. + 180. * fill)).h(px(8.)).rounded_full().bg(rgb(0x8ab4f8)))
                            // The thumb stays inside the track, as Chrome draws a range.
                            .child(div().absolute().left(px(180. * fill)).top_0().size(px(16.)).rounded_full().bg(rgb(0x8ab4f8)))
                            .child(super::profile_card::track(&self.volume_spot))
                            .on_mouse_down(gpui::MouseButton::Left, {
                                let spot = self.volume_spot.clone();
                                cx.listener(move |this, e: &gpui::MouseDownEvent, _, cx| {
                                    let b = spot.get();
                                    let share = ((f32::from(e.position.x - b.origin.x)) / f32::from(b.size.width)).clamp(0., 1.);
                                    this.save_voice_pref(id2.clone(), Some((share * 200.).round() as u32), None, cx);
                                })
                            }),
                    ),
            );
            if can_moderate || can_manage {
                card = card.child(divider());
            }
            if can_moderate {
                let forced = self.forced_mutes.contains(&id);
                let id2 = id.clone();
                card = card
                    .child(item("um-server-mute".into(), t(if forced { "userMenu.unmuteOnServer" } else { "userMenu.muteOnServer" }), true).on_click(cx.listener(move |this, _, _, cx| {
                        this.user_menu = None;
                        this.server_mute(id2.clone(), !forced, cx);
                        cx.notify();
                    })))
                    .child(note(t("userMenu.serverMuteNote")));
                card = card.children(disconnect("userMenu.disconnectVoice"));
                if let Some(current) = target_room.clone() {
                    let others: Vec<(String, String)> = voice_rooms.iter().filter(|(r, _)| *r != current).cloned().collect();
                    let mut section = div().id("um-move").mt(px(6.)).pt(px(6.)).border_t_1().border_color(rgb(0x41434f)).max_h(px(180.)).overflow_y_scroll().child(section_label(t("userMenu.moveToVoice")));
                    if others.is_empty() {
                        section = section.child(note(t("userMenu.noOtherVoiceChannels")));
                    }
                    for (room, name) in others {
                        let id2 = id.clone();
                        section = section.child(item(gpui::ElementId::Name(format!("um-move-{room}").into()), format!("◖)) {name}"), false).on_click(cx.listener(move |this, _, _, cx| {
                            this.user_menu = None;
                            this.move_member(id2.clone(), room.clone(), cx);
                        })));
                    }
                    card = card.child(section);
                }
            }
            if here.is_some() && !protected && (can_moderate || can_manage || perms & bits::KICK_MEMBERS != 0) {
                let until = super::member_actions::active_until(here.as_ref().and_then(|m| m.timeout_until.as_deref()));
                let label = match until {
                    Some(at) => tv("userMenu.timedOutUntil", &[("when", &super::member_actions::short_when(at))]),
                    None => t("userMenu.timeout"),
                };
                let mut section = div().mt(px(6.)).pt(px(6.)).border_t_1().border_color(rgb(0x41434f)).child(section_label(label));
                if until.is_some() {
                    let id2 = id.clone();
                    section = section.child(item("um-untimeout".into(), t("userMenu.removeTimeout"), false).on_click(cx.listener(move |this, _, _, cx| {
                        this.user_menu = None;
                        this.timeout_member(id2.clone(), 0, cx);
                    })));
                } else {
                    let mut chips = div().flex().flex_wrap().gap(px(4.)).px(px(6.)).pb(px(4.));
                    for (minutes, label) in super::member_actions::TIMEOUT_CHOICES {
                        let id2 = id.clone();
                        chips = chips.child(
                            div()
                                .id(gpui::ElementId::Name(format!("um-timeout-{minutes}").into()))
                                .px(px(8.))
                                .py(px(4.))
                                .rounded_full()
                                .border_1()
                                .border_color(rgb(0x41434f))
                                .text_size(px(12.))
                                .line_height(px(18.))
                                .text_color(rgb(0xe6e7ee))
                                .cursor_pointer()
                                .hover(|s| s.bg(Hsla::from(Theme::lavender()).opacity(0.24)))
                                .child(label)
                                .on_click(cx.listener(move |this, _, _, cx| {
                                    this.user_menu = None;
                                    this.timeout_member(id2.clone(), minutes, cx);
                                })),
                        );
                    }
                    section = section.child(chips);
                }
                card = card.child(section);
            }
            if can_manage {
                let id2 = id.clone();
                card = card.child(item("um-kick".into(), t("userMenu.kickFromServer"), true).on_click(cx.listener(move |this, _, _, cx| {
                    this.user_menu = None;
                    this.confirm_moderation(id2.clone(), "kick", cx);
                })));
                let banned = self.banned_ids.contains(&id);
                let id2 = id.clone();
                card = card.child(
                    item("um-ban".into(), t(if banned { "userMenu.unbanFromServer" } else { "userMenu.banFromServer" }), !banned).on_click(cx.listener(move |this, _, _, cx| {
                        this.user_menu = None;
                        this.confirm_moderation(id2.clone(), if banned { "unban" } else { "ban" }, cx);
                    })),
                );
            }
            // A Hoffle admin: who may make invites anywhere.
            let target_admin = here.as_ref().or(member.as_ref()).is_some_and(|m| m.is_admin);
            if self.me.is_admin && !target_admin {
                let can_invite = here.as_ref().or(member.as_ref()).is_some_and(|m| m.can_invite);
                let id2 = id.clone();
                card = card.child(divider()).child(
                    item("um-invites".into(), t(if can_invite { "userMenu.revokeInvites" } else { "userMenu.allowInvites" }), false).on_click(cx.listener(move |this, _, _, cx| {
                        this.user_menu = None;
                        this.toggle_invite_permission(id2.clone(), !can_invite, cx);
                    })),
                );
            }
        }

        // Kept 12px inside the window; flipped above the click when there is no room below it.
        let size = window.viewport_size();
        let (vw, vh) = (f32::from(size.width), f32::from(size.height));
        let height = menu.height.get();
        let (x, y) = (f32::from(menu.at.x), f32::from(menu.at.y));
        let max_left = vw - 230. - 12.;
        let max_top = vh - height - 12.;
        let left = x.min(max_left).max(12.);
        let top = (if y > max_top { (y - height).min(max_top) } else { y }).max(12.);
        let measured = menu.height.clone();
        let at = menu.at;
        Some(
            div()
                .id("user-menu")
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
                .text_color(rgb(0xf5f3ee))
                .child(card)
                .child(gpui::canvas(move |b, _, _| measured.set(f32::from(b.size.height)), |_, _, _, _| {}).absolute().top_0().left_0().size_full())
                .on_mouse_down_out(cx.listener(move |this, _, _, cx| {
                    if this.user_menu.as_ref().is_some_and(|m| m.at == at) {
                        this.user_menu = None;
                        cx.notify();
                    }
                }))
                .into_any_element(),
        )
    }

    fn block_toggle(&mut self, user_id: String, blocked: bool, cx: &mut Context<Self>) {
        let client = self.client.clone();
        if blocked {
            self.friends.blocked.retain(|f| f.id != user_id);
        } else {
            self.friends.blocked.push(crate::model::Friend { id: user_id.clone(), ..Default::default() });
        }
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { if blocked { client.remove_friend(&user_id) } else { client.block(&user_id) } }).await;
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
}

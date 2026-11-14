//! UserMenu (components/user-menu.tsx): right-click on someone (member row, name, avatar, voice
//! seat). Their name, @username and time in voice; Message, Block, Mute for me and their volume.

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
    fn save_voice_pref(&mut self, user_id: String, volume: Option<u32>, muted: Option<bool>, cx: &mut Context<Self>) {
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
                    .child(div().text_size(px(12.)).line_height(px(15.)).text_color(muted).child(format!("@{username}")))
                    .when_some(in_voice, |d, time| d.child(div().text_size(px(12.)).line_height(px(15.)).text_color(muted).child(time))),
            );
        let id = menu.user_id.clone();
        if me {
            let id2 = id.clone();
            card = card
                .child(item("um-notes", t("userMenu.noteToSelf"), false).on_click(cx.listener(move |this, _, _, cx| {
                    this.user_menu = None;
                    this.open_dm_with(id2.clone(), cx);
                })))
                .child(div().mt(px(4.)).mb(px(2.)).px(px(8.)).text_size(px(12.)).text_color(muted).child(t("userMenu.thisIsYou")));
        } else {
            if !blocked {
                let id2 = id.clone();
                card = card.child(item("um-message", t("userMenu.message"), false).on_click(cx.listener(move |this, _, _, cx| {
                    this.user_menu = None;
                    this.open_dm_with(id2.clone(), cx);
                })));
            }
            let id2 = id.clone();
            card = card.child(
                item("um-block", t(if blocked { "userMenu.unblock" } else { "userMenu.block" }), !blocked).on_click(cx.listener(move |this, _, _, cx| {
                    this.user_menu = None;
                    this.block_toggle(id2.clone(), blocked, cx);
                })),
            );
            let id2 = id.clone();
            card = card.child(
                item("um-mute", t(if pref.muted { "userMenu.unmuteForMe" } else { "userMenu.muteForMe" }), false)
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
                            .child(div().absolute().left_0().top(px(4.)).w(px(196. * fill)).h(px(8.)).rounded_full().bg(rgb(0x8ab4f8)))
                            .child(div().absolute().left(px(196. * fill - 8.)).top_0().size(px(16.)).rounded_full().bg(rgb(0x8ab4f8)))
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

//! InviteDialog (components/invite-dialog.tsx), after Discord's "Invite friends to <server>": your
//! friends with an Invite button that DMs them the link, the link itself to copy, WhatsApp, Telegram
//! and a QR code, and the link's settings (how many joins it allows). The link is your own reusable
//! one for this server and channel, so opening this again hands back the same link.

use std::collections::HashMap;
use std::sync::Arc;

use gpui::{Focusable as _, AnyElement, ClipboardItem, Context, Entity, FontWeight, Hsla, SharedString, Subscription, Window, div, prelude::*, px, rgb, rgba};
use serde_json::{Value, json};

use super::Shell;
use crate::i18n::{t, tc, tv};
use crate::input::{InputEvent, Look, TextInput};
use crate::theme::Theme;
use crate::ui;

/// lib/invite-limits.ts: GROUP_INVITE_USES and INVITE_USE_CHOICES.
const DEFAULT_USES: i64 = 100;
const USE_CHOICES: [i64; 9] = [1, 5, 10, 25, 50, 100, 200, 500, 1000];

#[derive(Clone, Copy, PartialEq)]
enum Sending {
    Sending,
    Sent,
    Failed,
}

pub(super) struct InviteDialog {
    server_id: String,
    server_name: String,
    /// The text channel people land in.
    channel: Option<(String, String)>,
    friends: Option<Vec<crate::model::Friend>>,
    search: Entity<TextInput>,
    /// (code, maxUses, uses)
    invite: Option<(String, i64, i64)>,
    error: Option<String>,
    sent: HashMap<String, Sending>,
    copied: bool,
    editing: bool,
    max_uses: i64,
    uses_open: bool,
    generating: bool,
    qr: Option<Arc<gpui::RenderImage>>,
    _subs: Vec<Subscription>,
}

/// buildUserInviteLink: hoffle.online/i/CODE.
fn invite_link(code: &str) -> String {
    let clean = code.trim().to_uppercase();
    format!("https://hoffle.online/i/{}", url::form_urlencoded::byte_serialize(clean.as_bytes()).collect::<String>())
}

/// uqr's renderSVG(link, { border: 1, pixelSize: 8 }) drawn at `size` px: ECC L, no boost, as
/// qrcodegen (which uqr ports) picks it.
fn qr_picture(text: &str, size: f32, scale: f32) -> Option<Arc<gpui::RenderImage>> {
    let segs = qrcodegen::QrSegment::make_segments(text);
    let qr = qrcodegen::QrCode::encode_segments_advanced(&segs, qrcodegen::QrCodeEcc::Low, qrcodegen::Version::MIN, qrcodegen::Version::MAX, None, false).ok()?;
    let modules = qr.size() + 2;
    let px_size = (size * scale).round() as u32;
    let mut data = vec![255u8; (px_size * px_size * 4) as usize];
    for y in 0..px_size {
        for x in 0..px_size {
            // Sample each device pixel's centre, as the browser rasterises the SVG's rects.
            let mx = ((x as f32 + 0.5) / px_size as f32 * modules as f32).floor() as i32 - 1;
            let my = ((y as f32 + 0.5) / px_size as f32 * modules as f32).floor() as i32 - 1;
            if qr.get_module(mx, my) {
                let i = ((y * px_size + x) * 4) as usize;
                data[i] = 0;
                data[i + 1] = 0;
                data[i + 2] = 0;
            }
        }
    }
    let img = image::RgbaImage::from_raw(px_size, px_size, data)?;
    Some(Arc::new(gpui::RenderImage::new(vec![image::Frame::new(img)])))
}

impl InviteDialog {
    pub(super) fn editing_open(&self) -> bool {
        false
    }

    pub(super) fn stop_editing(&mut self) {
        self.editing = false;
    }

    pub(super) fn dev_state(&mut self, state: &str, scale: f32) {
        match state {
            "qr" => self.qr = self.invite.as_ref().and_then(|(code, _, _)| qr_picture(&invite_link(code), 160., scale)),
            "edit" => self.editing = true,
            _ => {}
        }
    }
}

impl Shell {
    /// setInviteDialog({ channelId }): the open server, landing in `channel_id` (or the open channel).
    pub(super) fn open_invite(&mut self, channel_id: Option<String>, window: &mut Window, cx: &mut Context<Self>) {
        let Some(server) = self.server().cloned() else { return };
        let channel_id = channel_id.or_else(|| self.channel_id.clone());
        let channel = channel_id.and_then(|id| server.channels.iter().find(|c| c.id == id && c.kind != "voice").map(|c| (c.id.clone(), c.name.clone())));
        let search = cx.new(|cx| {
            TextInput::new(t("inviteModal.search"), cx).look(Look { size: 13., line_height: 19.5, height: 19.5, color: gpui::white(), placeholder: rgb(0x92909e).into() })
        });
        let subs = vec![cx.subscribe_in(&search, window, |this, _, event, window, cx| match event {
            InputEvent::Escape => this.close_invite(window, cx),
            _ => cx.notify(),
        })];
        window.focus(&gpui::Focusable::focus_handle(&search, cx));
        self.server_menu = false;
        self.invite = Some(InviteDialog {
            server_id: server.id.clone(),
            server_name: server.name.clone(),
            channel,
            friends: None,
            search,
            invite: None,
            error: None,
            sent: HashMap::new(),
            copied: false,
            editing: false,
            max_uses: DEFAULT_USES,
            uses_open: false,
            generating: false,
            qr: None,
            _subs: subs,
        });
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let friends = cx.background_executor().spawn(async move { client.friends() }).await;
            this.update(cx, |this, cx| {
                if let Some(d) = this.invite.as_mut() {
                    d.friends = Some(friends.map(|f| f.friends).unwrap_or_default());
                    cx.notify();
                }
            })
            .ok();
        })
        .detach();
        self.load_invite(DEFAULT_USES, true, cx);
        cx.notify();
    }

    pub(super) fn close_invite(&mut self, _window: &mut Window, cx: &mut Context<Self>) {
        self.invite = None;
        cx.notify();
    }

    /// POST /api/invites: `reuse` hands back this account's link for the server and channel.
    fn load_invite(&mut self, uses: i64, reuse: bool, cx: &mut Context<Self>) {
        let Some(d) = self.invite.as_mut() else { return };
        d.error = None;
        // Development: HOFFLE_DEV_INVITE=CODE,max,uses stands in for the server's answer.
        if let Ok(spec) = std::env::var("HOFFLE_DEV_INVITE") {
            let mut parts = spec.split(',');
            let code = parts.next().unwrap_or("TEST").to_string();
            let max = parts.next().and_then(|v| v.parse().ok()).unwrap_or(uses);
            let used = parts.next().and_then(|v| v.parse().ok()).unwrap_or(0);
            d.invite = Some((code, max, used));
            d.qr = None;
            return;
        }
        let body = json!({ "serverId": d.server_id, "channelId": d.channel.as_ref().map(|c| c.0.clone()), "maxUses": uses, "reuse": reuse });
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.create_invite(body) }).await;
            this.update(cx, |this, cx| {
                let Some(d) = this.invite.as_mut() else { return };
                d.generating = false;
                match result {
                    Ok(v) => {
                        let inv = v.get("invite").cloned().unwrap_or(Value::Null);
                        let code = inv.get("code").and_then(Value::as_str).unwrap_or_default().to_string();
                        let max = inv.get("maxUses").and_then(Value::as_i64).unwrap_or(uses);
                        let used = inv.get("uses").and_then(Value::as_i64).unwrap_or(0);
                        d.invite = (!code.is_empty()).then_some((code, max, used));
                        d.editing = false;
                        d.qr = None;
                    }
                    Err(err) => d.error = Some(if err.to_string().is_empty() { t("inviteModal.failed") } else { err.to_string() }),
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    /// send(friend): open (or reopen) your DM with them and post the link there.
    fn send_invite(&mut self, friend_id: String, cx: &mut Context<Self>) {
        let Some(d) = self.invite.as_mut() else { return };
        let Some((code, _, _)) = d.invite.as_ref() else { return };
        if matches!(d.sent.get(&friend_id), Some(Sending::Sending | Sending::Sent)) {
            return;
        }
        let link = invite_link(code);
        d.sent.insert(friend_id.clone(), Sending::Sending);
        let client = self.client.clone();
        let id = friend_id.clone();
        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    let channel = client.open_dm(&id)?;
                    client.send(&channel, &link, None)
                })
                .await;
            this.update(cx, |this, cx| {
                if let Some(d) = this.invite.as_mut() {
                    d.sent.insert(friend_id, if result.is_ok() { Sending::Sent } else { Sending::Failed });
                }
                this.load_side_data(cx);
                cx.notify();
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    fn copy_invite(&mut self, cx: &mut Context<Self>) {
        let Some(d) = self.invite.as_mut() else { return };
        let Some((code, _, _)) = d.invite.as_ref() else { return };
        cx.write_to_clipboard(ClipboardItem::new_string(invite_link(code)));
        d.copied = true;
        cx.spawn(async move |this, cx| {
            cx.background_executor().timer(std::time::Duration::from_millis(1500)).await;
            this.update(cx, |this, cx| {
                if let Some(d) = this.invite.as_mut() {
                    d.copied = false;
                    cx.notify();
                }
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    pub(super) fn render_invite(&self, window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let d = self.invite.as_ref()?;
        let muted: Hsla = rgb(0x8b83a7).into();
        let lavender: Hsla = Theme::lavender().into();
        let soft: Hsla = rgb(0xa19bb6).into();
        let label_ink: Hsla = rgb(0xe2def0).into();
        let link = d.invite.as_ref().map(|(code, _, _)| invite_link(code)).unwrap_or_default();

        let close_btn = |id: &'static str, icon: &'static str| {
            div().id(id).flex_none().size(px(26.)).p(px(4.)).rounded(px(6.)).cursor_pointer().hover(|s| s.bg(rgba(0xffffff14))).child(ui::icon(icon, 18., muted))
        };
        let title = if d.editing { t("inviteModal.settings") } else { tv("inviteModal.title", &[("server", &d.server_name)]) };
        let mut heading = div().min_w_0().flex().flex_col().child(div().text_size(px(18.)).line_height(px(27.)).font_weight(FontWeight::BOLD).text_color(gpui::white()).child(title));
        if !d.editing && let Some((_, name)) = &d.channel {
            heading = heading.child(
                div()
                    .mt(px(4.))
                    .flex()
                    .flex_wrap()
                    .items_center()
                    .gap(px(4.))
                    .text_size(px(13.))
                    .line_height(px(19.5))
                    .text_color(soft)
                    .child(t("inviteModal.landIn"))
                    .child(div().flex().items_center().gap(px(2.)).font_weight(FontWeight::SEMIBOLD).text_color(label_ink).child(ui::icon("hash", 13., label_ink)).child(name.clone())),
            );
        }
        let header = div()
            .flex()
            .justify_between()
            .child(
                div()
                    .min_w_0()
                    .flex()
                    .items_start()
                    .gap(px(8.))
                    .when(d.editing, |el| {
                        el.child(close_btn("inv-back", "arrow-left").on_click(cx.listener(|this, _, _, cx| {
                            if let Some(d) = this.invite.as_mut() {
                                d.editing = false;
                                d.uses_open = false;
                                cx.notify();
                            }
                        })))
                    })
                    .child(heading),
            )
            .child(close_btn("inv-close", "x").on_click(cx.listener(|this, _, window, cx| this.close_invite(window, cx))));

        let mut card = div()
            .id("inv-card")
            .w(px(460.))
            .pt(px(20.))
            .px(px(16.))
            .pb(px(16.))
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
            .child(header);

        if d.editing {
            card = card.child(self.render_invite_edit(d, cx));
        } else {
            // `.forward-search-wrap`, focused on open.
            let focused = d.search.read(cx).focus_handle(cx).is_focused(window);
            let search = div()
                .relative()
                .h(px(39.5))
                .pl(px(34.))
                .pr(px(12.))
                .flex()
                .items_center()
                .rounded(px(10.))
                // 25% black over the card, solid so the focus ring does not show through.
                .bg(rgb(0x171423))
                .border_1()
                .border_color(if focused { lavender } else { rgba(0xffffff14).into() })
                .when(focused, |el| el.shadow(vec![gpui::BoxShadow { color: lavender.opacity(0.32), offset: gpui::point(px(0.), px(0.)), blur_radius: px(0.), spread_radius: px(3.) }]))
                .child(div().absolute().left(px(12.)).top(px(11.75)).child(ui::icon("search", 14., muted)))
                .child(div().flex_1().child(d.search.clone()));

            // Friends you can still invite first, then those already here.
            let members: std::collections::HashSet<&str> = self.members.get(&d.server_id).into_iter().flatten().map(|m| m.id.as_str()).collect();
            let query = d.search.read(cx).text().trim().to_lowercase();
            let mut list = div().id("inv-list").max_h(px(340f32.min(f32::from(window.viewport_size().height) * 0.42))).overflow_y_scroll().mx(px(-4.)).pr(px(4.)).flex().flex_col();
            let empty = |text: AnyElement| div().p(px(18.)).flex().justify_center().text_center().text_size(px(12.)).line_height(px(18.)).text_color(muted).child(text);
            match &d.friends {
                None => list = list.child(empty(ui::icon("loader-2", 16., muted).into_any_element())),
                Some(friends) => {
                    let mut shown: Vec<&crate::model::Friend> = friends
                        .iter()
                        .filter(|f| query.is_empty() || f.name().to_lowercase().contains(&query) || f.username.to_lowercase().contains(&query))
                        .collect();
                    shown.sort_by_key(|f| members.contains(f.id.as_str()));
                    if shown.is_empty() {
                        list = list.child(empty(div().child(if friends.is_empty() { t("inviteModal.noFriends") } else { t("inviteModal.noMatch") }).into_any_element()));
                    }
                    for f in shown {
                        let member = members.contains(f.id.as_str());
                        let state = d.sent.get(&f.id).copied();
                        let disabled = member || link.is_empty() || matches!(state, Some(Sending::Sending | Sending::Sent));
                        let label: AnyElement = if member {
                            t("inviteModal.member").into_any_element()
                        } else {
                            match state {
                                Some(Sending::Sending) => ui::icon("loader-2", 14., gpui::white()).into_any_element(),
                                Some(Sending::Sent) => t("inviteModal.sent").into_any_element(),
                                Some(Sending::Failed) => t("common.retry").into_any_element(),
                                None => t("inviteModal.invite").into_any_element(),
                            }
                        };
                        let green: Hsla = rgb(0x3ba55d).into();
                        let id = f.id.clone();
                        list = list.child(
                            div()
                                .id(SharedString::from(format!("inv-{}", f.id)))
                                .flex_none()
                                .px(px(8.))
                                .py(px(7.))
                                .rounded(px(8.))
                                .hover(|s| s.bg(rgba(0xffffff0d)))
                                .flex()
                                .items_center()
                                .gap(px(12.))
                                .child(ui::avatar(self.picture(&f.avatar_url), &f.avatar, &f.color, f.name(), 36.))
                                .child(
                                    div()
                                        .flex_1()
                                        .min_w_0()
                                        .flex()
                                        .flex_col()
                                        .child(div().truncate().text_size(px(15.)).line_height(px(22.5)).font_weight(FontWeight::SEMIBOLD).text_color(gpui::white()).child(f.name().to_string()))
                                        .child(div().truncate().text_size(px(12.)).line_height(px(18.)).text_color(muted).child(f.username.clone())),
                                )
                                .child(
                                    div()
                                        .id(SharedString::from(format!("inv-send-{}", f.id)))
                                        .flex_none()
                                        .min_w(px(72.))
                                        .h(px(32.))
                                        .px(px(14.))
                                        .rounded(px(6.))
                                        .border_1()
                                        .border_color(if disabled { gpui::transparent_black() } else { green })
                                        .flex()
                                        .items_center()
                                        .justify_center()
                                        .text_size(px(13.))
                                        .line_height(px(19.5))
                                        .font_weight(FontWeight::SEMIBOLD)
                                        .text_color(if state == Some(Sending::Sent) { green } else if disabled { muted } else { gpui::white() })
                                        .child(label)
                                        .when(!disabled, |el| {
                                            el.cursor_pointer().hover(|s| s.bg(rgb(0x3ba55d))).on_click(cx.listener(move |this, _, _, cx| this.send_invite(id.clone(), cx)))
                                        }),
                                ),
                        );
                    }
                }
            }

            // `.invite-dialog-link-section`.
            let copied = d.copied;
            let field_text: AnyElement = if let Some(err) = &d.error {
                div().text_color(muted).child(err.clone()).into_any_element()
            } else if link.is_empty() {
                div().text_color(muted).child("…").into_any_element()
            } else {
                div().truncate().text_color(gpui::white()).child(link.clone()).into_any_element()
            };
            let green: Hsla = rgb(0x3ba55d).into();
            let copy_bg: Hsla = if copied { green } else { rgb(0x5865f2).into() };
            let link_row = div()
                .flex()
                .items_center()
                .gap(px(8.))
                .pl(px(12.))
                .pr(px(4.))
                .py(px(4.))
                .rounded(px(8.))
                .bg(rgba(0x00000040))
                .border_1()
                .border_color(if copied { green } else { rgba(0xffffff14).into() })
                .child(div().flex_1().min_w_0().text_size(px(14.)).line_height(px(21.)).child(field_text))
                .child(
                    div()
                        .id("inv-copy")
                        .flex_none()
                        .min_w(px(76.))
                        .h(px(32.))
                        .px(px(6.))
                        .rounded(px(6.))
                        .bg(copy_bg)
                        .flex()
                        .items_center()
                        .justify_center()
                        .text_size(px(13.))
                        .line_height(px(19.5))
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(gpui::white())
                        .when(link.is_empty(), |el| el.opacity(0.5))
                        .when(!link.is_empty(), |el| {
                            el.cursor_pointer().when(!copied, |el| el.hover(|s| s.bg(rgb(0x4752c4)))).on_click(cx.listener(|this, _, _, cx| this.copy_invite(cx)))
                        })
                        .child(if copied { t("inviteModal.copied") } else { t("inviteModal.copy") }),
                );
            let mut section = div()
                .pt(px(14.))
                .border_t_1()
                .border_color(rgba(0xffffff14))
                .flex()
                .flex_col()
                .gap(px(8.))
                .child(div().text_size(px(13.)).line_height(px(19.5)).font_weight(FontWeight::SEMIBOLD).text_color(label_ink).child(t("inviteModal.shareLink")))
                .child(link_row);
            if !link.is_empty() {
                section = section.child(self.render_invite_share(d, &link, window, cx));
            }
            if let Some((_, max, uses)) = d.invite {
                let left = (max - uses).max(0);
                section = section.child(
                    div()
                        .flex()
                        .flex_wrap()
                        .text_size(px(12.))
                        .line_height(px(18.))
                        .text_color(soft)
                        .child(format!("{} ", tc("inviteModal.usesLeft", left, &[])))
                        .child(
                            div()
                                .id("inv-edit")
                                .text_color(rgb(0x00a8fc))
                                .cursor_pointer()
                                .hover(|s| s.underline())
                                .child(t("inviteModal.edit"))
                                .on_click(cx.listener(move |this, _, _, cx| {
                                    if let Some(d) = this.invite.as_mut() {
                                        d.max_uses = max;
                                        d.editing = true;
                                        cx.notify();
                                    }
                                })),
                        ),
                );
            }
            card = card.child(search).child(list).child(section);
        }

        Some(
            div()
                .id("inv-backdrop")
                .absolute()
                .inset_0()
                .bg(rgba(0x000000bf))
                .flex()
                .items_center()
                .justify_center()
                .on_mouse_down(gpui::MouseButton::Left, cx.listener(|this, _, window, cx| this.close_invite(window, cx)))
                .child(card)
                .into_any_element(),
        )
    }

    /// ShareRow: WhatsApp, Telegram and the QR code (no share sheet on a desktop).
    fn render_invite_share(&self, d: &InviteDialog, link: &str, window: &Window, cx: &mut Context<Self>) -> AnyElement {
        let ink: Hsla = Theme::ink().into();
        let line: Hsla = Theme::line().into();
        let message = tv("share.message", &[("server", &d.server_name), ("link", link)]);
        let enc = |s: &str| url::form_urlencoded::byte_serialize(s.as_bytes()).collect::<String>().replace('+', "%20");
        let wa = format!("https://wa.me/?text={}", enc(&message));
        let tg = format!("https://t.me/share/url?url={}&text={}", enc(link), enc(message.replace(link, "").trim()));
        let pill = |id: &'static str, color: Hsla, border: Hsla| {
            div()
                .id(id)
                .flex()
                .items_center()
                .gap(px(6.))
                .px(px(12.))
                .py(px(7.))
                .rounded_full()
                .border_1()
                .border_color(border)
                .text_size(px(12.5))
                .line_height(px(18.75))
                .font_weight(FontWeight::BOLD)
                .text_color(color)
                .cursor_pointer()
                .hover(move |s| s.bg(ink.opacity(0.07)))
        };
        let wa_c: Hsla = rgb(0x25d366).into();
        let tg_c: Hsla = rgb(0x2aabee).into();
        let qr_on = d.qr.is_some();
        let row = div()
            .mt(px(10.))
            .flex()
            .flex_wrap()
            .gap(px(8.))
            .child(pill("inv-wa", wa_c, wa_c.opacity(0.45)).child(t("share.whatsapp")).on_click(move |_, _, cx| cx.open_url(&wa)))
            .child(pill("inv-tg", tg_c, tg_c.opacity(0.45)).child(t("share.telegram")).on_click(move |_, _, cx| cx.open_url(&tg)))
            .child(pill("inv-qr", ink, line).child(ui::icon("qr-code", 13., ink)).child(t("share.qr")).on_click({
                let link = link.to_string();
                cx.listener(move |this, _, window, cx| {
                    if let Some(d) = this.invite.as_mut() {
                        d.qr = if d.qr.is_some() { None } else { qr_picture(&link, 160., window.scale_factor()) };
                        cx.notify();
                    }
                })
            }));
        let _ = window;
        let mut out = div().flex().flex_col().child(row);
        if qr_on && let Some(img) = d.qr.clone() {
            // `.invite-qr` is the section's own child on the web: its 8px gap plus a 12px margin.
            out = out.child(
                div()
                    .mt(px(20.))
                    .flex()
                    .flex_col()
                    .items_center()
                    .gap(px(8.))
                    .child(div().size(px(180.)).p(px(10.)).rounded(px(14.)).bg(gpui::white()).child(gpui::img(gpui::ImageSource::Render(img)).size(px(160.))))
                    .child(div().text_size(px(12.)).line_height(px(18.)).text_color(Theme::muted()).child(t("share.qrHint"))),
            );
        }
        out.into_any_element()
    }

    /// `.invite-dialog-edit`: how many joins a new link allows, then Cancel / Generate a New Link.
    fn render_invite_edit(&self, d: &InviteDialog, cx: &mut Context<Self>) -> AnyElement {
        let lavender: Hsla = Theme::lavender().into();
        let label_ink: Hsla = rgb(0xe2def0).into();
        let select = div()
            .id("inv-uses")
            .relative()
            .h(px(36.))
            .px(px(12.))
            .rounded(px(10.))
            .bg(rgba(0x00000040))
            .border_1()
            .border_color(rgba(0xffffff14))
            .flex()
            .items_center()
            .justify_between()
            .text_size(px(13.))
            .text_color(gpui::white())
            .cursor_pointer()
            // A <select>: the browser adds 4px before the value and draws its arrow 8px in.
            .pl(px(16.))
            .pr(px(4.))
            .child(tc("inviteModal.usesOption", d.max_uses, &[]))
            .child(ui::icon("chevron-down", 14., gpui::white()))
            .on_click(cx.listener(|this, _, _, cx| {
                if let Some(d) = this.invite.as_mut() {
                    d.uses_open = !d.uses_open;
                    cx.notify();
                }
            }));
        let mut field = div().relative().child(select);
        if d.uses_open {
            let mut menu = div()
                .absolute()
                .top(px(40.))
                .left_0()
                .right_0()
                .p(px(4.))
                .rounded(px(10.))
                .bg(rgb(0x262238))
                .border_1()
                .border_color(rgba(0xffffff1a))
                .shadow(ui::card_shadow())
                .flex()
                .flex_col();
            for uses in USE_CHOICES {
                let on = uses == d.max_uses;
                menu = menu.child(
                    div()
                        .id(SharedString::from(format!("inv-uses-{uses}")))
                        .px(px(10.))
                        .py(px(6.))
                        .rounded(px(6.))
                        .text_size(px(13.))
                        .text_color(gpui::white())
                        .when(on, |el| el.bg(lavender.opacity(0.18)))
                        .hover(|s| s.bg(rgba(0xffffff14)))
                        .cursor_pointer()
                        .child(tc("inviteModal.usesOption", uses, &[]))
                        .on_click(cx.listener(move |this, _, _, cx| {
                            if let Some(d) = this.invite.as_mut() {
                                d.max_uses = uses;
                                d.uses_open = false;
                                cx.notify();
                            }
                        })),
                );
            }
            field = field.child(gpui::deferred(menu).with_priority(2));
        }
        let ink: Hsla = rgb(0x15121f).into();
        let generating = d.generating;
        let footer = div()
            .mt(px(8.))
            .flex()
            .items_center()
            .justify_end()
            .gap(px(10.))
            .child(
                div()
                    .id("inv-cancel")
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
                    .on_click(cx.listener(|this, _, _, cx| {
                        if let Some(d) = this.invite.as_mut() {
                            d.editing = false;
                            d.uses_open = false;
                            cx.notify();
                        }
                    })),
            )
            .child(
                div()
                    .id("inv-generate")
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
                    .text_color(ink)
                    .when(generating, |el| el.opacity(0.5))
                    .when(!generating, |el| {
                        el.cursor_pointer().hover(|s| s.bg(crate::theme::mix(Theme::lavender(), 0.82, gpui::black()))).on_click(cx.listener(|this, _, _, cx| {
                            let Some(d) = this.invite.as_mut() else { return };
                            d.generating = true;
                            d.uses_open = false;
                            let uses = d.max_uses;
                            this.load_invite(uses, false, cx);
                            cx.notify();
                        }))
                    })
                    .when(generating, |el| el.child(ui::icon("loader-2", 14., ink)))
                    .child(t("inviteModal.generate")),
            );
        div()
            .flex()
            .flex_col()
            .gap(px(8.))
            .child(div().text_size(px(13.)).line_height(px(19.5)).font_weight(FontWeight::SEMIBOLD).text_color(label_ink).child(t("inviteModal.maxUses")))
            .child(field)
            .child(footer)
            .into_any_element()
    }
}

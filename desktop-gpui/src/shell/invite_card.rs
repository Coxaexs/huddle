//! ServerInviteCard (components/server-invite-card.tsx): a Hoffle invite link in a message shows the
//! server it leads to, with Join Server (or Joined, which opens it).

use gpui::{AnyElement, Context, FontWeight, Hsla, SharedString, div, prelude::*, px, rgb};
use serde_json::{Value, json};

use super::Shell;
use crate::theme::{DISPLAY_FONT, Theme, mix};
use crate::ui;

/// INVITE_HOSTS: where /i/CODE is a Hoffle invite (and the host this app talks to).
const INVITE_HOSTS: [&str; 4] = ["hoffle.online", "www.hoffle.online", "chat.hoffle.online", "deeppixel.online"];

/// .invite-eyebrow: 11px bold uppercase, letter-spacing 0.06em (gpui has none), one line.
fn eyebrow_line(text: String, color: Hsla) -> gpui::Div {
    div().flex_1().min_w_0().overflow_hidden().whitespace_nowrap().text_ellipsis().text_size(px(11.)).line_height(px(16.5)).font_weight(FontWeight::BOLD).text_color(color).child(text.to_uppercase())
}

fn code_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_' || c == '-'
}

/// extractInviteCodes(): `…/hangout?invite=CODE` (or `?code=`, `?servercode=`, bare `?CODE`) and
/// `host/i/CODE` on Hoffle's own hosts, upper-cased, each once.
pub(super) fn invite_codes(text: &str, own_host: &str) -> Vec<String> {
    let mut codes: Vec<String> = Vec::new();
    let mut add = |code: &str| {
        let up = code.to_uppercase();
        if (4..=24).contains(&up.len()) && !codes.contains(&up) {
            codes.push(up);
        }
    };
    // /hangout?…CODE
    let mut from = 0;
    while let Some(p) = text[from..].find("/hangout?") {
        let rest = &text[from + p + 9..];
        let rest = ["servercode=", "code=", "invite="].iter().find_map(|k| rest.strip_prefix(k)).unwrap_or(rest);
        let len = rest.find(|c: char| !code_char(c)).unwrap_or(rest.len());
        if !rest[len..].starts_with(['=']) {
            add(&rest[..len]);
        }
        from += p + 9;
    }
    // host[/hangout]/i/CODE, the host not part of a longer one.
    let lower = text.to_lowercase();
    let hosts: Vec<&str> = INVITE_HOSTS.iter().copied().chain((!own_host.is_empty()).then_some(own_host)).collect();
    for host in hosts {
        let mut from = 0;
        while let Some(p) = lower[from..].find(host) {
            let at = from + p;
            from = at + host.len();
            let before = lower[..at].chars().next_back();
            if before.is_some_and(|c| c.is_alphanumeric() || c == '.' || c == '-' || c == '_') && !lower[..at].ends_with("://") {
                continue;
            }
            let rest = &text[from..];
            let rest = rest.strip_prefix("/hangout").unwrap_or(rest);
            if let Some(code) = rest.strip_prefix("/i/") {
                let len = code.find(|c: char| !code_char(c)).unwrap_or(code.len());
                add(&code[..len]);
            }
        }
    }
    codes
}

impl Shell {
    pub(super) fn own_host(&self) -> String {
        url::Url::parse(&self.client.absolute("")).ok()
            .and_then(|u| u.host_str().map(|h| match u.port() {
                Some(port) => format!("{h}:{port}"),
                None => h.to_string(),
            }))
            .map(|h| h.to_lowercase())
            .unwrap_or_default()
    }

    /// The invites a message links to, fetched once each.
    pub(super) fn render_invite_cards(&self, message: &crate::model::Message, width: f32, cx: &mut Context<Self>) -> Vec<AnyElement> {
        let codes = invite_codes(&message.text, &self.own_host());
        let mut out = Vec::new();
        for code in codes {
            match self.invites.borrow().get(&code).cloned() {
                Some(invite) => out.push(self.invite_card(&code, &invite, width, cx)),
                None => self.resolve_invite(code, cx),
            }
        }
        out
    }

    fn resolve_invite(&self, code: String, cx: &mut Context<Self>) {
        if !self.invites_loading.borrow_mut().insert(code.clone()) {
            return;
        }
        let client = self.client.clone();
        let path = format!("/api/invites/resolve?code={}", url::form_urlencoded::byte_serialize(code.as_bytes()).collect::<String>());
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.get_value(&path) }).await;
            this.update(cx, |this, cx| {
                let value = result.unwrap_or_else(|_| json!({ "code": code, "valid": false }));
                this.invites.borrow_mut().insert(code.clone(), value);
                this.invites_loading.borrow_mut().remove(&code);
                if let Some(list) = this.channel_id.as_ref().and_then(|c| this.messages.get(c)) {
                    this.list.splice(0..list.len(), list.len());
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    /// joinServerDirect(): join by code, then open the server (and its channel).
    fn join_by_code(&mut self, code: String, cx: &mut Context<Self>) {
        let client = self.client.clone();
        let c = code.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.settings_post("/api/servers/membership", json!({ "action": "join", "code": c })) }).await;
            this.update(cx, |this, cx| {
                match result {
                    Ok(v) => {
                        this.set_notice(if v["alreadyMember"] == true { "Switched to server.".to_string() } else { "Joined the server.".to_string() }, cx);
                        let server = v["serverId"].as_str().map(String::from);
                        let channel = v["channelId"].as_str().map(String::from);
                        this.load_servers(cx);
                        if let Some(server) = server {
                            match channel {
                                Some(channel) => this.open_server_channel(server, channel, cx),
                                None => this.open_server(server, cx),
                            }
                        }
                    }
                    Err(e) => this.set_notice(if e.to_string().is_empty() { "Could not join.".to_string() } else { e.to_string() }, cx),
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    fn invite_card(&self, code: &str, invite: &Value, width: f32, cx: &mut Context<Self>) -> AnyElement {
        let accent: Hsla = Theme::send().into();
        let muted: Hsla = Theme::quiet().into();
        let card_w = width.min(420.);
        let card = || {
            div()
                .relative()
                .mt(px(8.))
                .mb(px(4.))
                .w(px(card_w))
                .rounded(px(14.))
                .overflow_hidden()
                .bg(gpui::linear_gradient(180., gpui::linear_color_stop(mix(Theme::send(), 0.07, Theme::card()), 0.), gpui::linear_color_stop(Theme::card(), 1.)))
                .border_1()
                .border_color(accent.opacity(0.28))
                .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.42), offset: gpui::point(px(0.), px(6.)), blur_radius: px(20.), spread_radius: px(0.) }])
        };
        if invite["valid"] != true {
            return card()
                .px(px(14.))
                .py(px(12.))
                .border_color(Hsla::from(rgb(0xef4444)).opacity(0.2))
                .flex()
                .items_center()
                .gap(px(10.))
                .child(div().text_size(px(20.)).child("⚠️"))
                .child(div().flex().flex_col().child(div().font_weight(FontWeight::BOLD).text_size(px(14.)).child("Invalid Invite")).child(div().text_size(px(11.)).text_color(rgb(0x949ba4)).child(invite["error"].as_str().unwrap_or("This invite may be expired or invalid.").to_string())))
                .into_any_element();
        }
        let server = &invite["server"];
        let Some(server_id) = server["id"].as_str().map(String::from) else {
            // An account invite: the code to copy.
            let code_text = code.to_string();
            return card()
                .child(div().px(px(16.)).pt(px(12.)).child(eyebrow_line(invite["inviter"]["displayName"].as_str().map(|n| format!("{n} shared an account invite")).unwrap_or_else(|| "Account registration invite".into()), muted)))
                .child(
                    div()
                        .px(px(16.))
                        .pt(px(10.))
                        .pb(px(16.))
                        .flex()
                        .items_center()
                        .gap(px(12.))
                        .child(div().flex_none().size(px(56.)).rounded(px(16.)).bg(Theme::lavender()).flex().items_center().justify_center().text_size(px(22.)).child("✉️"))
                        .child(div().flex_1().min_w_0().flex().flex_col().gap(px(3.)).child(div().font_family(DISPLAY_FONT).text_size(px(16.)).font_weight(FontWeight::BOLD).child("Account Invite")).child(div().font_family(crate::theme::MONO_FONT).text_size(px(12.)).text_color(rgb(0x949ba4)).child(format!("Code: {code_text}"))))
                        .child(div().id(SharedString::from(format!("inv-copy-{code_text}"))).px(px(18.)).py(px(9.)).rounded(px(10.)).bg(accent).text_size(px(13.)).font_weight(FontWeight::SEMIBOLD).text_color(gpui::white()).cursor_pointer().child("Copy Code").on_click(move |_, _, cx| cx.write_to_clipboard(gpui::ClipboardItem::new_string(code_text.clone())))),
                )
                .into_any_element();
        };
        let member = self.servers.iter().any(|s| s.id == server_id);
        let name = server["name"].as_str().unwrap_or_default().to_string();
        let color = server["color"].as_str().and_then(crate::theme::css_color).unwrap_or(rgb(0x5865f2).into());
        let eyebrow = invite["inviter"]["displayName"].as_str().map(|n| format!("{n} invited you to join")).unwrap_or_else(|| "You've been invited to join a server".into());
        // shownCounts(): members from 10, online (from 3) only beside them.
        let members = server["memberCount"].as_i64().unwrap_or(0);
        let online = server["onlineCount"].as_i64().unwrap_or(0);
        let show_members = members >= 10;
        let show_online = show_members && online >= 3;
        let icon: AnyElement = match server["iconUrl"].as_str().filter(|u| !u.is_empty()) {
            Some(url) => gpui::img(self.client.absolute(url)).size(px(54.)).rounded(px(15.)).object_fit(gpui::ObjectFit::Cover).into_any_element(),
            None => {
                let glyph = server["icon"].as_str().filter(|i| i.chars().count() <= 4 && !i.is_empty()).map(String::from).unwrap_or_else(|| name.chars().next().map(|c| c.to_uppercase().to_string()).unwrap_or_default());
                div().child(glyph).into_any_element()
            }
        };
        let count = |dot: Hsla, n: i64, label: &str| div().flex().items_center().gap(px(5.)).child(div().size(px(8.)).rounded_full().bg(dot)).child(div().font_weight(FontWeight::BLACK).child(n.to_string())).child(label.to_string());
        let (cid, sid) = (code.to_string(), server_id.clone());
        let banner: AnyElement = match server["bannerUrl"].as_str().filter(|u| !u.is_empty()) {
            Some(url) => div().h(px(72.)).overflow_hidden().child(gpui::img(self.client.absolute(url)).w(px(card_w)).h(px(72.)).object_fit(gpui::ObjectFit::Cover)).into_any_element(),
            None => div().h(px(72.)).bg(gpui::linear_gradient(135., gpui::linear_color_stop(color.opacity(0.267), 0.), gpui::linear_color_stop(color.opacity(0.067), 1.))).into_any_element(),
        };
        card()
            .child(banner)
            // The banner fades out under the eyebrow (mask-image to transparent).
            .child(div().absolute().top(px(29.)).left_0().right_0().h(px(43.)).bg(gpui::linear_gradient(180., gpui::linear_color_stop(mix(Theme::send(), 0.07, Theme::card()).opacity(0.), 0.), gpui::linear_color_stop(mix(Theme::send(), 0.065, Theme::card()), 1.))))
            .child(div().relative().mt(px(-22.)).px(px(16.)).flex().items_center().gap(px(6.)).child(ui::icon("sparkles", 12., accent)).child(eyebrow_line(eyebrow, muted)))
            .child(
                div()
                    .pt(px(10.))
                    .px(px(16.))
                    .pb(px(16.))
                    .flex()
                    .items_center()
                    .gap(px(12.))
                    .child(
                        div()
                            .flex_none()
                            .size(px(56.))
                            .rounded(px(16.))
                            .bg(color)
                            .border_1()
                            .border_color(gpui::white().opacity(0.12))
                            .overflow_hidden()
                            .flex()
                            .items_center()
                            .justify_center()
                            .font_family(DISPLAY_FONT)
                            .text_size(px(22.))
                            .font_weight(FontWeight::BOLD)
                            .text_color(gpui::white())
                            .shadow(vec![
                                gpui::BoxShadow { color: Theme::card().into(), offset: gpui::point(px(0.), px(0.)), blur_radius: px(0.), spread_radius: px(2.) },
                                gpui::BoxShadow { color: accent.opacity(0.45), offset: gpui::point(px(0.), px(0.)), blur_radius: px(0.), spread_radius: px(3.) },
                            ])
                            .child(icon),
                    )
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .flex()
                            .flex_col()
                            .gap(px(3.))
                            .child(div().font_family(DISPLAY_FONT).text_size(px(16.)).line_height(px(20.)).font_weight(FontWeight::BOLD).text_color(rgb(0xf2f3f5)).overflow_hidden().whitespace_nowrap().text_ellipsis().child(name))
                            .when(show_members, |d| {
                                d.child(
                                    div()
                                        .flex()
                                        .items_center()
                                        .gap(px(12.))
                                        .text_size(px(12.))
                                        .line_height(px(18.))
                                        .font_weight(FontWeight::SEMIBOLD)
                                        .text_color(rgb(0x949ba4))
                                        .when(show_online, |d| d.child(count(rgb(0x23a55a).into(), online, "Online")))
                                        .child(count(rgb(0x80848e).into(), members, "Members")),
                                )
                            }),
                    )
                    .child(
                        div()
                            .id(SharedString::from(format!("inv-join-{code}")))
                            .flex_none()
                            .flex()
                            .items_center()
                            .gap(px(6.))
                            .px(px(18.))
                            .py(px(9.))
                            .rounded(px(10.))
                            .text_size(px(13.))
                            .line_height(px(19.5))
                            .font_weight(FontWeight::SEMIBOLD)
                            .cursor_pointer()
                            .when(member, |d| d.border_1().px(px(17.)).py(px(8.)).border_color(accent.opacity(0.4)).text_color(muted).child(ui::icon("check", 14., muted)).child("Joined"))
                            .when(!member, |d| d.bg(accent).text_color(gpui::white()).shadow(vec![gpui::BoxShadow { color: accent.opacity(0.4), offset: gpui::point(px(0.), px(2.)), blur_radius: px(10.), spread_radius: px(0.) }]).child("Join Server"))
                            .on_click(cx.listener(move |this, _, _, cx| {
                                if member {
                                    this.open_server(sid.clone(), cx);
                                } else {
                                    this.join_by_code(cid.clone(), cx);
                                }
                            })),
                    ),
            )
            .into_any_element()
    }
}

#[cfg(test)]
mod tests {
    use super::invite_codes;

    #[test]
    fn finds_codes() {
        assert_eq!(invite_codes("join https://chat.hoffle.online/i/mqlr6h23gm now", ""), vec!["MQLR6H23GM"]);
        assert_eq!(invite_codes("x.com/hangout?invite=ABCD1234 and hoffle.online/hangout/i/WXYZ", ""), vec!["ABCD1234", "WXYZ"]);
        assert!(invite_codes("evilhoffle.online/i/ABCDE", "").is_empty());
        assert_eq!(invite_codes("http://127.0.0.1:8756/i/ABCDE", "127.0.0.1:8756"), vec!["ABCDE"]);
    }
}

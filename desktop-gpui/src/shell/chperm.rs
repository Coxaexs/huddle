//! ChannelPermissionsDialog (components/channel-permissions-dialog.tsx): a channel's overwrites for
//! @everyone, roles and people: Private channel, the targets on the left, each flag's Deny / Default /
//! Allow on the right, adding a role or person, Save.

use gpui::{AnyElement, AppContext as _, Context, Entity, Focusable as _, FontWeight, Hsla, SharedString, Subscription, Window, div, prelude::*, px, rgb, rgba};
use serde_json::{Value, json};

use super::Shell;
use crate::i18n::{t, tv};
use crate::input::{InputEvent, Look, TextInput};
use crate::theme::Theme;
use crate::ui;

const VIEW: u64 = 1 << 30;
/// OVERWRITE_FLAGS with their i18n names; the last three are voice rooms' only.
const FLAGS: [(u64, &str); 9] = [(VIEW, "view"), (1 << 13, "send"), (1 << 17, "files"), (1 << 18, "react"), (1 << 20, "everyone"), (1 << 21, "manage"), (1 << 23, "connect"), (1 << 24, "speak"), (1 << 25, "video")];
const VOICE_ONLY: u64 = (1 << 23) | (1 << 24) | (1 << 25);

#[derive(Clone)]
struct Overwrite {
    kind: String,
    id: String,
    allow: u64,
    deny: u64,
}

impl Overwrite {
    fn key(&self) -> String {
        format!("{}:{}", self.kind, self.id)
    }
}

pub(super) struct ChPerm {
    channel: String,
    name: String,
    voice: bool,
    roles: Option<Vec<Value>>,
    members: Vec<Value>,
    draft: Vec<Overwrite>,
    selected: String,
    adding: bool,
    search: Entity<TextInput>,
    saving: bool,
    error: String,
    _sub: Subscription,
}

impl Shell {
    pub(super) fn open_channel_permissions(&mut self, channel_id: String, window: &mut Window, cx: &mut Context<Self>) {
        let Some(channel) = self.channel_by_id(&channel_id).cloned() else { return };
        let search = cx.new(|cx| TextInput::new(t("channelPerms.searchPlaceholder"), cx).look(Look { size: 14., line_height: 21., height: 21., color: Theme::ink().into(), placeholder: rgb(0x8b83a7).into() }));
        let sub = cx.subscribe_in(&search, window, |this, _, event, _, cx| {
            if matches!(event, InputEvent::Escape) {
                this.chperm = None;
            }
            cx.notify();
        });
        self.chperm = Some(ChPerm {
            channel: channel.id.clone(),
            name: channel.name.clone(),
            voice: channel.is_voice(),
            roles: None,
            members: Vec::new(),
            draft: Vec::new(),
            selected: "everyone:".into(),
            adding: false,
            search,
            saving: false,
            error: String::new(),
            _sub: sub,
        });
        let client = self.client.clone();
        let path = format!("/api/channels/{}/permissions", url::form_urlencoded::byte_serialize(channel.id.as_bytes()).collect::<String>());
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.get_value(&path) }).await;
            this.update(cx, |this, cx| {
                let Some(p) = this.chperm.as_mut() else { return };
                match result {
                    Ok(v) => {
                        p.draft = v["overwrites"]
                            .as_array()
                            .map(|a| a.iter().map(|o| Overwrite { kind: o["targetType"].as_str().unwrap_or_default().into(), id: o["targetId"].as_str().unwrap_or_default().into(), allow: o["allow"].as_u64().unwrap_or(0), deny: o["deny"].as_u64().unwrap_or(0) }).collect())
                            .unwrap_or_default();
                        p.roles = Some(v["roles"].as_array().cloned().unwrap_or_default());
                        p.members = v["members"].as_array().cloned().unwrap_or_default();
                    }
                    Err(e) => p.error = if e.to_string().is_empty() { t("channelPerms.loadFailed") } else { e.to_string() },
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    fn chperm_set(&mut self, key: &str, flag: u64, state: i8, cx: &mut Context<Self>) {
        let Some(p) = self.chperm.as_mut() else { return };
        let (kind, id) = key.split_once(':').unwrap_or(("everyone", ""));
        let mut row = p.draft.iter().find(|o| o.key() == key).cloned().unwrap_or(Overwrite { kind: kind.into(), id: id.into(), allow: 0, deny: 0 });
        row.allow = if state == 1 { row.allow | flag } else { row.allow & !flag };
        row.deny = if state == -1 { row.deny | flag } else { row.deny & !flag };
        p.draft.retain(|o| o.key() != key);
        p.draft.push(row);
        cx.notify();
    }

    fn chperm_save(&mut self, cx: &mut Context<Self>) {
        let Some(p) = self.chperm.as_mut() else { return };
        if p.roles.is_none() || p.saving {
            return;
        }
        p.saving = true;
        p.error.clear();
        let body = json!({ "overwrites": p.draft.iter().filter(|o| o.allow != 0 || o.deny != 0 || o.kind != "everyone").map(|o| json!({ "targetType": o.kind, "targetId": o.id, "allow": o.allow, "deny": o.deny })).collect::<Vec<_>>() });
        let path = format!("/api/channels/{}/permissions", url::form_urlencoded::byte_serialize(p.channel.as_bytes()).collect::<String>());
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.settings_put(&path, body) }).await;
            this.update(cx, |this, cx| {
                match result {
                    Ok(_) => {
                        this.chperm = None;
                        this.load_servers(cx);
                    }
                    Err(e) => {
                        if let Some(p) = this.chperm.as_mut() {
                            p.saving = false;
                            p.error = if e.to_string().is_empty() { t("channelPerms.saveFailed") } else { e.to_string() };
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

    pub(super) fn render_chperm(&self, window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let p = self.chperm.as_ref()?;
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let quiet: Hsla = rgb(0x8b83a7).into();
        let lavender: Hsla = Theme::lavender().into();
        let everyone = p.draft.iter().find(|o| o.kind == "everyone");
        let private = everyone.is_some_and(|o| o.deny & VIEW != 0);
        let someone_can_see = p.draft.iter().any(|o| o.kind != "everyone" && o.allow & VIEW != 0);
        let roles = p.roles.clone().unwrap_or_default();
        let role = |id: &str| roles.iter().find(|r| r["id"] == id).cloned();
        let member = |id: &str| p.members.iter().find(|m| m["id"] == id).cloned();
        let label = |o: &Overwrite| match o.kind.as_str() {
            "everyone" => "@everyone".to_string(),
            "role" => role(&o.id).and_then(|r| r["name"].as_str().map(String::from)).unwrap_or_else(|| t("channelPerms.unknownRole")),
            _ => member(&o.id)
                .map(|m| m["displayName"].as_str().filter(|n| !n.is_empty()).or(m["username"].as_str()).unwrap_or_default().to_string())
                .unwrap_or_else(|| t("channelPerms.unknownMember")),
        };
        let icon_of = |o: &Overwrite| -> AnyElement {
            match o.kind.as_str() {
                "everyone" => ui::icon("users", 15., ink).into_any_element(),
                "role" => ui::icon("shield", 15., role(&o.id).and_then(|r| r["color"].as_str().and_then(crate::theme::css_color)).unwrap_or(ink)).into_any_element(),
                _ => ui::icon("user", 15., ink).into_any_element(),
            }
        };
        let mut targets: Vec<Overwrite> = vec![Overwrite { kind: "everyone".into(), id: String::new(), allow: 0, deny: 0 }];
        targets.extend(p.draft.iter().filter(|o| o.kind != "everyone").cloned());
        let current = targets.iter().find(|o| o.key() == p.selected).cloned().unwrap_or_else(|| targets[0].clone());

        let header = div()
            .flex()
            .justify_between()
            .gap(px(12.))
            .child(
                div()
                    .min_w_0()
                    .child(div().text_size(px(16.)).line_height(px(24.)).font_weight(FontWeight::BOLD).text_color(gpui::white()).child(tv("channelPerms.title", &[("channel", &p.name)])))
                    .child(div().mt(px(2.)).text_size(px(12.)).line_height(px(18.)).text_color(rgb(0xa19bb6)).child(t("channelPerms.subtitle"))),
            )
            .child(div().id("cp-close").flex_none().size(px(24.)).p(px(4.)).rounded(px(6.)).cursor_pointer().hover(|s| s.bg(rgba(0xffffff14))).child(ui::icon("x", 16., quiet)).on_click(cx.listener(|this, _, _, cx| {
                this.chperm = None;
                cx.notify();
            })));

        let mut card = div()
            .id("cp-card")
            .w(px(760.))
            .max_h(px((f32::from(window.viewport_size().height) * 0.88).min(760.)))
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
            .child(header);

        if p.roles.is_none() && p.error.is_empty() {
            card = card.child(div().py(px(40.)).flex().justify_center().child(ui::icon("loader-circle", 18., muted)));
        }
        if p.roles.is_some() {
            card = card.child(
                div()
                    .id("cp-private")
                    .flex()
                    .items_center()
                    .gap(px(12.))
                    .px(px(14.))
                    .py(px(12.))
                    .rounded(px(12.))
                    .bg(lavender.opacity(0.1))
                    .border_1()
                    .border_color(lavender.opacity(0.25))
                    .cursor_pointer()
                    .child(div().flex_none().size(px(32.)).rounded(px(10.)).bg(lavender.opacity(0.22)).flex().items_center().justify_center().child(ui::icon("lock", 16., lavender)))
                    .child(div().flex_1().min_w_0().flex().flex_col().gap(px(2.)).child(div().text_size(px(14.)).line_height(px(21.)).font_weight(FontWeight::BOLD).text_color(ink).child(t("channelPerms.private"))).child(div().text_size(px(12.)).line_height(px(18.)).text_color(muted).child(t("channelPerms.privateHint"))))
                    // Chrome's checkbox at 22px (the input is 38 by 22).
                    .child(div().flex_none().w(px(38.)).flex().justify_center().child(div().size(px(22.)).rounded(px(3.)).when(private, |d| d.bg(lavender).flex().items_center().justify_center().child(ui::icon("check", 16., rgb(0x15121f)))).when(!private, |d| d.bg(rgb(0x3b3b3b)).border_1().border_color(rgb(0x858585)))))
                    .on_click(cx.listener(move |this, _, _, cx| this.chperm_set("everyone:", VIEW, if private { 0 } else { -1 }, cx))),
            );
            if private && !someone_can_see {
                card = card.child(div().text_size(px(12.)).text_color(rgb(0xf0b35a)).child(t("channelPerms.nobodyYet")));
            }

            // The targets.
            let list_max = f32::from(window.viewport_size().height) * 0.52;
            let mut left = div().id("cp-targets").w(px(220.)).flex_none().max_h(px(list_max)).overflow_y_scroll().flex().flex_col().gap(px(4.));
            for o in &targets {
                let key = o.key();
                let active = key == current.key();
                let k = key.clone();
                left = left.child(
                    div()
                        .id(SharedString::from(format!("cp-t-{key}")))
                        .flex()
                        .items_center()
                        .gap(px(8.))
                        .px(px(10.))
                        .py(px(8.))
                        .rounded(px(9.))
                        .text_size(px(13.))
                        .line_height(px(19.5))
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(ink)
                        .cursor_pointer()
                        .when(active, |d| d.bg(lavender.opacity(0.2)))
                        .when(!active, |d| d.hover(move |s| s.bg(ink.opacity(0.07))))
                        .child(icon_of(o))
                        .child(div().min_w_0().overflow_hidden().whitespace_nowrap().child(label(o)))
                        .on_click(cx.listener(move |this, _, _, cx| {
                            if let Some(p) = this.chperm.as_mut() {
                                p.selected = k.clone();
                            }
                            cx.notify();
                        })),
                );
            }
            left = left.child(
                div()
                    .id("cp-add")
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .px(px(10.))
                    .py(px(8.))
                    .rounded(px(9.))
                    .text_size(px(13.))
                    .line_height(px(19.5))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(lavender)
                    .cursor_pointer()
                    .hover(move |s| s.bg(ink.opacity(0.07)))
                    .child(ui::icon("plus", 14., lavender))
                    .child(t("channelPerms.add"))
                    .on_click(cx.listener(|this, _, window, cx| {
                        if let Some(p) = this.chperm.as_mut() {
                            p.adding = !p.adding;
                            if p.adding {
                                window.focus(&p.search.focus_handle(cx));
                            }
                        }
                        cx.notify();
                    })),
            );
            if p.adding {
                let listed: Vec<String> = p.draft.iter().map(Overwrite::key).collect();
                let q = p.search.read(cx).text().trim().to_lowercase();
                let mut picks = div().id("cp-picks").max_h(px(200.)).overflow_y_scroll().flex().flex_col();
                let mut any = false;
                let pick = |id: String, icon: AnyElement, text: String, sub: Option<String>, kind: &'static str, target: String| {
                    div()
                        .id(SharedString::from(id))
                        .flex()
                        .items_center()
                        .gap(px(8.))
                        .px(px(8.))
                        .py(px(7.))
                        .rounded(px(8.))
                        .text_size(px(13.))
                        .text_color(ink)
                        .cursor_pointer()
                        .hover(move |s| s.bg(ink.opacity(0.07)))
                        .child(icon)
                        .child(text)
                        .when_some(sub, |d, sub| d.child(div().text_color(muted).child(sub)))
                        .on_click(cx.listener(move |this, _, _, cx| {
                            if let Some(p) = this.chperm.as_mut() {
                                let row = Overwrite { kind: kind.into(), id: target.clone(), allow: 0, deny: 0 };
                                let private = p.draft.iter().any(|o| o.kind == "everyone" && o.deny & VIEW != 0);
                                if !p.draft.iter().any(|o| o.key() == row.key()) {
                                    // A new target in a private channel starts out able to see it.
                                    p.draft.push(Overwrite { allow: if private { VIEW } else { 0 }, ..row.clone() });
                                }
                                p.selected = row.key();
                                p.adding = false;
                                let search = p.search.clone();
                                search.update(cx, |s, cx| s.clear(cx));
                            }
                            cx.notify();
                        }))
                };
                for r in &roles {
                    let id = r["id"].as_str().unwrap_or_default().to_string();
                    let name = r["name"].as_str().unwrap_or_default().to_string();
                    if listed.contains(&format!("role:{id}")) || (!q.is_empty() && !name.to_lowercase().contains(&q)) {
                        continue;
                    }
                    any = true;
                    let color = r["color"].as_str().and_then(crate::theme::css_color).unwrap_or(ink);
                    picks = picks.child(pick(format!("cp-r-{id}"), ui::icon("shield", 14., color).into_any_element(), name, None, "role", id));
                }
                for m in p.members.iter().filter(|m| {
                    let id = m["id"].as_str().unwrap_or_default();
                    let hay = format!("{} {}", m["displayName"].as_str().unwrap_or_default(), m["username"].as_str().unwrap_or_default()).to_lowercase();
                    !listed.contains(&format!("member:{id}")) && (q.is_empty() || hay.contains(&q))
                }).take(30) {
                    let id = m["id"].as_str().unwrap_or_default().to_string();
                    let name = m["displayName"].as_str().filter(|n| !n.is_empty()).or(m["username"].as_str()).unwrap_or_default().to_string();
                    any = true;
                    picks = picks.child(pick(format!("cp-m-{id}"), ui::icon("user", 14., ink).into_any_element(), name, Some(format!("@{}", m["username"].as_str().unwrap_or_default())), "member", id));
                }
                if !any {
                    picks = picks.child(div().mx(px(8.)).my(px(4.)).text_size(px(12.)).text_color(muted).child(t("channelPerms.noMatches")));
                }
                left = left.child(
                    div()
                        .flex()
                        .flex_col()
                        .gap(px(6.))
                        .p(px(6.))
                        .rounded(px(10.))
                        .border_1()
                        .border_color(Theme::line())
                        .child(div().relative().h(px(39.5)).pl(px(34.)).pr(px(12.)).flex().items_center().rounded(px(10.)).bg(rgb(0x171423)).border_1().border_color(rgba(0xffffff14)).child(div().absolute().left(px(11.)).top(px(11.75)).child(ui::icon("search", 14., quiet))).child(div().flex_1().child(p.search.clone())))
                        .child(picks),
                );
            }

            // The flags of the selected target.
            let mut right = div().id("cp-flags").flex_1().min_w_0().max_h(px(list_max)).overflow_y_scroll().flex().flex_col().gap(px(2.)).pr(px(2.));
            let ckey = current.key();
            right = right.child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .px(px(4.))
                    .pt(px(2.))
                    .pb(px(8.))
                    .child(div().font_weight(FontWeight::BOLD).text_color(ink).child(label(&current)))
                    .when(current.kind != "everyone", |d| {
                        let k = ckey.clone();
                        d.child(div().id("cp-remove").text_size(px(12.)).font_weight(FontWeight::BOLD).text_color(rgb(0xef6b58)).cursor_pointer().child(t("channelPerms.remove")).on_click(cx.listener(move |this, _, _, cx| {
                            if let Some(p) = this.chperm.as_mut() {
                                p.draft.retain(|o| o.key() != k);
                                p.selected = "everyone:".into();
                            }
                            cx.notify();
                        })))
                    }),
            );
            let row_now = p.draft.iter().find(|o| o.key() == ckey).cloned();
            for (flag, name) in FLAGS.iter().filter(|(f, _)| p.voice || f & VOICE_ONLY == 0) {
                let state: i8 = match &row_now {
                    Some(r) if r.allow & flag != 0 => 1,
                    Some(r) if r.deny & flag != 0 => -1,
                    _ => 0,
                };
                let tri = |which: i8, icon: &'static str| {
                    let on = state == which;
                    let (bg, fg): (Hsla, Hsla) = match (which, on) {
                        (-1, true) => (rgb(0xe5484d).into(), gpui::white()),
                        (1, true) => (rgb(0x2fa55a).into(), gpui::white()),
                        (0, true) => (ink.opacity(0.18), ink),
                        _ => (gpui::transparent_black(), muted),
                    };
                    let (k, f) = (ckey.clone(), *flag);
                    div()
                        .id(SharedString::from(format!("cp-{name}-{which}")))
                        .w(px(32.))
                        .h(px(28.))
                        .bg(bg)
                        .when(which != -1, |d| d.border_l_1().border_color(Theme::line()))
                        .flex()
                        .items_center()
                        .justify_center()
                        .cursor_pointer()
                        .tooltip(ui::tooltip(t(match which {
                            -1 => "channelPerms.deny",
                            1 => "channelPerms.allow",
                            _ => "channelPerms.default",
                        })))
                        .child(ui::icon(icon, 13., fg))
                        .on_click(cx.listener(move |this, _, _, cx| this.chperm_set(&k, f, which, cx)))
                };
                right = right.child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(12.))
                        .px(px(6.))
                        .py(px(9.))
                        .border_t_1()
                        .border_color(Theme::line())
                        .child(
                            div()
                                .flex_1()
                                .min_w_0()
                                .flex()
                                .flex_col()
                                .gap(px(2.))
                                .text_size(px(13.))
                                .line_height(px(19.5))
                                .text_color(ink)
                                .child(t(&format!("channelPerms.flag.{name}")))
                                .child(div().text_size(px(11.5)).line_height(px(17.25)).text_color(muted).child(t(&format!("channelPerms.flag.{name}.hint")))),
                        )
                        .child(div().flex_none().flex().rounded(px(9.)).overflow_hidden().border_1().border_color(Theme::line()).child(tri(-1, "x")).child(tri(0, "minus")).child(tri(1, "check"))),
                );
            }
            card = card.child(div().flex().gap(px(14.)).min_h_0().child(left).child(right));
        }
        if !p.error.is_empty() {
            card = card.child(div().text_size(px(13.)).text_color(rgb(0xf87171)).child(p.error.clone()));
        }
        let can_save = p.roles.is_some() && !p.saving;
        let dark: Hsla = rgb(0x15121f).into();
        card = card.child(
            div()
                .flex()
                .items_center()
                .justify_end()
                .gap(px(10.))
                .child(div().id("cp-cancel").px(px(14.)).py(px(7.)).rounded(px(8.)).border_1().border_color(rgba(0xffffff1a)).text_size(px(13.)).line_height(px(19.5)).font_weight(FontWeight::MEDIUM).text_color(rgb(0xb8b0cf)).cursor_pointer().hover(|s| s.bg(rgba(0xffffff0f)).text_color(gpui::white())).child(t("common.cancel")).on_click(cx.listener(|this, _, _, cx| {
                    this.chperm = None;
                    cx.notify();
                })))
                .child(
                    div()
                        .id("cp-save")
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
                        .text_color(dark)
                        .when(!can_save, |d| d.opacity(0.5))
                        .when(can_save, |d| d.cursor_pointer().on_click(cx.listener(|this, _, _, cx| this.chperm_save(cx))))
                        .when(p.saving, |d| d.child(ui::icon("loader-circle", 14., dark)))
                        .child(t("channelPerms.save")),
                ),
        );
        Some(
            div()
                .id("cp-backdrop")
                .absolute()
                .inset_0()
                .bg(rgba(0x000000bf))
                .flex()
                .items_center()
                .justify_center()
                .on_mouse_down(gpui::MouseButton::Left, cx.listener(|this, _, _, cx| {
                    this.chperm = None;
                    cx.notify();
                }))
                .child(card)
                .into_any_element(),
        )
    }
}

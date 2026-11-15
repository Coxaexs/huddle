//! ServerSettingsDialog (components/server-settings-dialog.tsx and server-settings/*): the full-window
//! settings of the open server. The ESC button, the sidebar (the server's name, Expression, People,
//! Apps, Moderation, Community / Template, then Delete or Leave), and each tab's page; which tabs
//! show follows the viewer's permissions as isTabVisible does.

use gpui::{AnyElement, AppContext as _, Context, Entity, FontWeight, Hsla, SharedString, Subscription, Window, div, prelude::*, px, rgb, rgba};
use serde_json::{Value, json};

use super::Shell;
use super::context_menu::{Confirm, ConfirmAction};
use crate::i18n::{t, tv};
use crate::input::{InputEvent, Look, TextInput};
use crate::theme::{DISPLAY_FONT, Theme};
use crate::ui;

/// server-settings/constants.ts BANNER_COLORS: label and the two stops of its 135° gradient.
const BANNER_COLORS: [(&str, u32, u32); 10] = [
    ("Dark", 0x1e1f29, 0x111218),
    ("Soul", 0xff4081, 0xff80ab),
    ("Crimson", 0xf44336, 0xff7961),
    ("Amber", 0xff9800, 0xffc947),
    ("Gold", 0xffeb3b, 0xfff350),
    ("Purple", 0x9c27b0, 0xba68c8),
    ("Cyan", 0x00bcd4, 0x4dd0e1),
    ("Teal", 0x009688, 0x4db6ac),
    ("Green", 0x4caf50, 0x81c784),
    ("Charcoal", 0x37474f, 0x263238),
];

/// lib/permissions.ts bits the tabs depend on.
mod bits {
    pub const MANAGE_CHANNELS: u64 = 1 << 1;
    pub const MODERATE: u64 = 1 << 2;
    pub const MANAGE_SERVER: u64 = 1 << 3;
    pub const MANAGE_ROLES: u64 = 1 << 5;
    pub const VIEW_AUDIT_LOG: u64 = 1 << 6;
    pub const MANAGE_EMOJIS: u64 = 1 << 7;
    pub const CREATE_INVITES: u64 = 1 << 8;
    pub const KICK_MEMBERS: u64 = 1 << 11;
    pub const BAN_MEMBERS: u64 = 1 << 12;
}

pub(super) struct ServerSettings {
    server_id: String,
    pub(super) tab: &'static str,
    name: Entity<TextInput>,
    color: String,
    icon_url: String,
    banner_url: String,
    gradient: usize,
    notice: Option<String>,
    member_search: Entity<TextInput>,
    role_menu: Option<String>,
    role_search: Entity<TextInput>,
    role_emoji: Entity<TextInput>,
    /// The role open in the editor ("@everyone" for the server's defaults).
    active_role: Option<String>,
    pub(super) main_scroll: gpui::ScrollHandle,
    _subs: Vec<Subscription>,
}

/// lib/permissions.ts PERMISSION_INFO (tools: esbuild + node, resources/data/permissions.json):
/// flag, label, description, category.
static PERMISSIONS: std::sync::LazyLock<Vec<(u64, String, String, String)>> = std::sync::LazyLock::new(|| {
    crate::assets::ASSETS.iter().find(|(p, _)| *p == "data/permissions.json").and_then(|(_, b)| serde_json::from_slice(b).ok()).unwrap_or_default()
});

const EVERYONE: &str = "@everyone";

/// What the viewer may do here (the dialog's can* props, made effective as it makes them).
#[derive(Clone, Copy)]
struct Can {
    owner: bool,
    manage_server: bool,
    expressions: bool,
    members: bool,
    roles: bool,
    invites: bool,
    access: bool,
    moderate: bool,
    audit: bool,
    ban: bool,
}

impl ServerSettings {
    pub(super) fn server_id_pub(&self) -> String {
        self.server_id.clone()
    }
}

impl Shell {
    pub(super) fn set_active_role(&mut self, role: String) {
        if let Some(s) = self.server_settings.as_mut() {
            s.active_role = Some(role);
        }
    }

    fn server_can(&self) -> Can {
        let p = self.my_permissions();
        let has = |b: u64| p & b != 0;
        let owner = self.server().is_some_and(|s| s.owner_id.as_deref() == Some(self.me.id.as_str()));
        let manage_server = has(bits::MANAGE_SERVER);
        let moderate = has(bits::MODERATE);
        Can {
            owner,
            manage_server,
            expressions: has(bits::MANAGE_EMOJIS) || has(bits::MANAGE_CHANNELS) || manage_server || owner,
            members: manage_server || has(bits::MANAGE_ROLES) || moderate || has(bits::KICK_MEMBERS) || has(bits::BAN_MEMBERS) || owner,
            roles: has(bits::MANAGE_ROLES) || manage_server || owner,
            invites: self.can_invite() || has(bits::CREATE_INVITES) || manage_server || owner,
            access: manage_server || has(bits::MANAGE_ROLES) || owner,
            moderate: moderate || manage_server || owner,
            audit: has(bits::VIEW_AUDIT_LOG) || manage_server || owner,
            ban: has(bits::BAN_MEMBERS) || moderate || manage_server || owner,
        }
    }

    pub(super) fn open_server_settings(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(server) = self.server().cloned() else { return };
        let name = cx.new(|cx| {
            let mut i = TextInput::new("", cx).look(Look { size: 14., line_height: 21., height: 21., color: Theme::ink().into(), placeholder: Theme::muted().into() });
            i.set_text(server.name.clone(), cx);
            i
        });
        let subs = vec![cx.subscribe_in(&name, window, |this, input, event, _, cx| {
            if matches!(event, InputEvent::Changed) {
                let text = input.read(cx).text();
                if text.chars().count() > 50 {
                    let cut: String = text.chars().take(50).collect();
                    input.update(cx, |i, cx| i.set_text(cut, cx));
                }
            }
            if matches!(event, InputEvent::Escape) {
                this.server_settings = None;
            }
            cx.notify();
        })];
        let member_search = cx.new(|cx| TextInput::new("Search Members, Roles, or Invites", cx).look(Look { size: 14., line_height: 21., height: 21., color: Theme::ink().into(), placeholder: Theme::muted().into() }));
        let mut subs = subs;
        subs.push(cx.subscribe_in(&member_search, window, |this, _, event, _, cx| {
            if matches!(event, InputEvent::Escape) {
                this.server_settings = None;
            }
            cx.notify();
        }));
        let role_search = cx.new(|cx| TextInput::new("Search Roles", cx).look(Look { size: 14., line_height: 21., height: 21., color: Theme::ink().into(), placeholder: Theme::muted().into() }));
        let role_emoji = cx.new(|cx| TextInput::new(t("roleIcon.emoji"), cx).look(Look { size: 14., line_height: 21., height: 21., color: Theme::ink().into(), placeholder: Theme::muted().into() }));
        for input in [&role_search, &role_emoji] {
            subs.push(cx.subscribe_in(input, window, |this, _, event, _, cx| {
                match event {
                    InputEvent::Escape => this.server_settings = None,
                    InputEvent::Submit => this.save_role_emoji(cx),
                    _ => {}
                }
                cx.notify();
            }));
        }
        let active_role = server.roles.first().map(|r| r.id.clone());
        self.server_menu = false;
        self.server_settings = Some(ServerSettings {
            server_id: server.id.clone(),
            tab: "profile",
            name,
            color: if server.color.is_empty() { "#7b63e6".into() } else { server.color.clone() },
            icon_url: server.icon_url.clone().unwrap_or_default(),
            banner_url: server.banner_url.clone().unwrap_or_default(),
            gradient: 0,
            notice: None,
            member_search,
            role_menu: None,
            role_search,
            role_emoji,
            active_role,
            main_scroll: gpui::ScrollHandle::new(),
            _subs: subs,
        });
        cx.notify();
    }

    pub(super) fn server_settings_server(&self) -> Option<String> {
        self.server_settings.as_ref().map(|s| s.server_id.clone())
    }

    /// After Create Role: the newest role opens in the editor once the servers are back.
    pub(super) fn role_created(&mut self, name: String, cx: &mut Context<Self>) {
        if let Some(s) = self.server_settings.as_mut() {
            s.active_role = None;
            s.notice = Some(format!("Role \"{name}\" created."));
        }
        self.pending_new_role = true;
        cx.notify();
    }

    pub(super) fn close_server_settings(&mut self, cx: &mut Context<Self>) {
        self.server_settings = None;
        cx.notify();
    }

    fn server_notice(&mut self, text: String, cx: &mut Context<Self>) {
        if let Some(s) = self.server_settings.as_mut() {
            s.notice = Some(text);
        }
        cx.notify();
    }

    /// handleSaveProfile(): name, colour, icon and banner.
    fn save_server_profile(&mut self, cx: &mut Context<Self>) {
        let Some(s) = self.server_settings.as_ref() else { return };
        let path = format!("/api/servers/{}", url::form_urlencoded::byte_serialize(s.server_id.as_bytes()).collect::<String>());
        let body = json!({
            "name": s.name.read(cx).text(),
            "color": s.color,
            "iconUrl": if s.icon_url.is_empty() { Value::Null } else { json!(s.icon_url) },
            "bannerUrl": if s.banner_url.is_empty() { Value::Null } else { json!(s.banner_url) },
        });
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.settings_patch(&path, body) }).await;
            this.update(cx, |this, cx| match result {
                Ok(_) => {
                    this.load_servers(cx);
                    this.server_notice("Server profile saved successfully!".into(), cx);
                }
                Err(e) => this.server_notice(if e.to_string().is_empty() { "Failed to save server profile".into() } else { e.to_string() }, cx),
            })
            .ok();
        })
        .detach();
    }

    /// handleIconUpload / handleBannerUpload: kept once Save Changes is pressed.
    fn upload_server_image(&mut self, banner: bool, cx: &mut Context<Self>) {
        let picked = cx.prompt_for_paths(gpui::PathPromptOptions { files: true, directories: false, multiple: false, prompt: None });
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let Ok(Ok(Some(paths))) = picked.await else { return };
            let Some(path) = paths.into_iter().next() else { return };
            let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "image".into());
            let mime = match path.extension().map(|e| e.to_string_lossy().to_lowercase()).as_deref() {
                Some("png") => "image/png",
                Some("gif") => "image/gif",
                Some("webp") => "image/webp",
                _ => "image/jpeg",
            };
            let result = cx
                .background_executor()
                .spawn(async move {
                    let bytes = std::fs::read(&path)?;
                    client.upload_reply("file", &name, mime, &bytes)
                })
                .await;
            this.update(cx, |this, cx| match result.map(|v| v.get("url").and_then(Value::as_str).map(str::to_string)) {
                Ok(Some(url)) => {
                    if let Some(s) = this.server_settings.as_mut() {
                        if banner {
                            s.banner_url = url;
                        } else {
                            s.icon_url = url;
                        }
                    }
                    this.server_notice(if banner { "Server banner uploaded! Click 'Save Changes' to apply." } else { "Server icon uploaded! Click 'Save Changes' to apply." }.into(), cx);
                }
                Ok(None) => this.server_notice(if banner { "Banner upload failed" } else { "Icon upload failed" }.into(), cx),
                Err(e) => this.server_notice(e.to_string(), cx),
            })
            .ok();
        })
        .detach();
    }

    pub(super) fn render_server_settings(&self, window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let s = self.server_settings.as_ref()?;
        let server = self.servers.iter().find(|x| x.id == s.server_id)?;
        let can = self.server_can();
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();

        // The sidebar: groups of items, dividers, then Delete / Leave.
        let tab = s.tab;
        let header = |text: String| div().flex_none().pt(px(12.)).px(px(10.)).pb(px(6.)).text_size(px(11.)).line_height(px(16.5)).font_weight(FontWeight::EXTRA_BOLD).text_color(Theme::quiet()).whitespace_nowrap().child(text.to_uppercase());
        let item = |id: &'static str, label: String, cx: &mut Context<Self>| {
            let active = tab == id;
            div()
                .id(SharedString::from(format!("ss-tab-{id}")))
                .flex_none()
                .px(px(10.))
                .py(px(8.))
                .rounded(px(8.))
                .text_size(px(14.))
                .line_height(px(21.))
                .font_weight(if active { FontWeight::SEMIBOLD } else { FontWeight::MEDIUM })
                .text_color(if active { ink } else { muted })
                .when(active, |d| d.bg(Theme::lavender_soft()))
                .when(!active, |d| d.hover(|s| s.bg(gpui::white().opacity(0.06)).text_color(Theme::ink())))
                .cursor_pointer()
                .child(label)
                .on_click(cx.listener(move |this, _, _, cx| {
                    if let Some(s) = this.server_settings.as_mut() {
                        s.tab = id;
                        s.notice = None;
                    }
                    cx.notify();
                }))
        };
        // `.sidebar-divider` keeps its 8px margins but draws no line in this theme.
        let divider = || div().flex_none().my(px(8.)).h(px(0.));
        let mut side = div()
            .id("ss-sidebar")
            .w(px(240.))
            .h_full()
            .flex_none()
            .overflow_y_scroll()
            .bg(Theme::panel())
            .border_r_1()
            .border_color(Theme::line())
            .px(px(16.))
            .py(px(32.))
            .flex()
            .flex_col()
            .gap(px(2.))
            .child(header(server.name.clone()))
            .child(item("profile", t("serverSettings.tab.profile"), cx));
        if can.expressions {
            side = side
                .child(divider())
                .child(header(t("serverSettings.group.expression")))
                .child(item("emoji", t("serverSettings.tab.emoji"), cx))
                .child(item("stickers", t("serverSettings.tab.stickers"), cx))
                .child(item("soundboard", t("serverSettings.tab.soundboard"), cx));
        }
        if can.members || can.roles || can.invites || can.access || can.manage_server || can.owner {
            side = side.child(divider()).child(header(t("serverSettings.group.people")));
            if can.members {
                side = side.child(item("members", t("serverSettings.tab.members"), cx));
            }
            if can.roles {
                side = side.child(item("roles", t("serverSettings.tab.roles"), cx));
            }
            if can.invites {
                side = side.child(item("invites", t("serverSettings.tab.invites"), cx));
            }
            if can.access {
                side = side.child(item("access", t("serverSettings.tab.access"), cx));
            }
            if can.manage_server || can.owner {
                side = side.child(item("welcome", t("serverSettings.tab.welcome"), cx));
            }
        }
        if can.manage_server || can.owner {
            side = side.child(divider()).child(header(t("serverSettings.group.apps"))).child(item("integrations", t("serverSettings.tab.integrations"), cx));
        }
        if can.moderate || can.audit || can.ban {
            side = side.child(divider()).child(header(t("serverSettings.group.moderation")));
            if can.moderate {
                side = side.child(item("safety", t("serverSettings.tab.safety"), cx));
            }
            if can.audit {
                side = side.child(item("audit_log", t("serverSettings.tab.auditLog"), cx));
            }
            if can.ban {
                side = side.child(item("bans", t("serverSettings.tab.bans"), cx));
            }
            if can.moderate {
                side = side.child(item("automod", t("serverSettings.tab.automod"), cx));
            }
        }
        if can.manage_server || can.owner {
            side = side.child(divider()).child(item("community", "Enable Community".into(), cx)).child(item("template", t("serverSettings.tab.templates"), cx));
        }
        side = side.child(divider());
        let red: Hsla = rgb(0xf23f43).into();
        let (sid, sname) = (server.id.clone(), server.name.clone());
        if can.owner {
            if can.manage_server {
                side = side.child(
                    div()
                        .id("ss-delete")
                        .flex_none()
                        .px(px(10.))
                        .py(px(8.))
                        .rounded(px(8.))
                        .flex()
                        .items_center()
                        .justify_between()
                        .text_size(px(14.))
                        .line_height(px(21.))
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(red)
                        .cursor_pointer()
                        .hover(move |s| s.bg(red.opacity(0.1)))
                        .child(t("serverSettings.deleteServer"))
                        .child(ui::icon("trash-2", 16., red))
                        .on_click(cx.listener(move |this, _, _, cx| {
                            this.confirm = Some(Confirm {
                                title: format!("Delete '{sname}'?"),
                                text: "Are you sure you want to delete this server? This action cannot be undone.".into(),
                                ok: "Delete Server".into(),
                                cancel: t("common.cancel"),
                                action: ConfirmAction::DeleteServer(sid.clone()),
                            });
                            this.server_settings = None;
                            cx.notify();
                        })),
                );
            }
        } else {
            side = side.child(
                div()
                    .id("ss-leave")
                    .flex_none()
                    .px(px(10.))
                    .py(px(8.))
                    .rounded(px(8.))
                    .flex()
                    .items_center()
                    .gap(px(4.))
                    .text_size(px(14.))
                    .line_height(px(21.))
                    .font_weight(FontWeight::MEDIUM)
                    .text_color(red)
                    .cursor_pointer()
                    .hover(move |s| s.bg(red.opacity(0.1)))
                    .child(t("serverSettings.leaveServer"))
                    .child(ui::icon("log-out", 14., red))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.confirm = Some(Confirm {
                            title: format!("Leave {sname}?"),
                            text: "You will need a fresh invite to come back. Your messages stay.".into(),
                            ok: t("serverSettings.leaveServer"),
                            cancel: t("common.cancel"),
                            action: ConfirmAction::LeaveServer(sid.clone()),
                        });
                        this.server_settings = None;
                        cx.notify();
                    })),
            );
        }

        let page: AnyElement = match tab {
            "profile" => self.render_server_profile(s, server, can, window, cx),
            "members" => self.render_server_members(s, server, can, window, cx),
            "roles" => self.render_server_roles(s, server, can, window, cx),
            other => self.render_server_tab(other, s, server, can, window, cx),
        };
        let main = div()
            .id("ss-main")
            .flex_1()
            .h_full()
            .min_w_0()
            .overflow_y_scroll()
            .track_scroll(&s.main_scroll)
            .bg(Theme::chat_bg())
            .px(px(60.))
            .py(px(40.))
            .flex()
            .flex_col()
            .children(s.notice.clone().map(|n| div().flex_none().text_size(px(16.)).line_height(px(24.)).text_color(ink).child(n)))
            .child(page);

        // `.discord-esc-button`.
        let esc = div()
            .id("ss-esc")
            .absolute()
            .top(px(24.))
            .right(px(32.))
            .flex()
            .flex_col()
            .items_center()
            .gap(px(4.))
            .cursor_pointer()
            .child(div().size(px(36.)).rounded_full().border_2().border_color(muted).flex().items_center().justify_center().text_size(px(20.)).line_height(px(30.)).text_color(muted).child("×"))
            .child(div().text_size(px(11.)).line_height(px(16.5)).font_weight(FontWeight::BOLD).text_color(muted).child("ESC"))
            .on_click(cx.listener(|this, _, _, cx| this.close_server_settings(cx)));

        Some(
            div()
                .id("server-settings")
                .absolute()
                .inset_0()
                .bg(Theme::chat_bg())
                .text_color(ink)
                .flex()
                .on_mouse_down(gpui::MouseButton::Left, |_, _, cx| cx.stop_propagation())
                .on_scroll_wheel(|_, _, cx| cx.stop_propagation())
                .child(side)
                .child(main)
                .child(esc)
                .into_any_element(),
        )
    }

    /// ServerProfileTab: name, icon, banner (picture or one of ten gradients), traits, Save, and the
    /// live server card beside it.
    fn render_server_profile(&self, s: &ServerSettings, server: &crate::model::Server, can: Can, window: &Window, cx: &mut Context<Self>) -> AnyElement {
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let lavender: Hsla = Theme::lavender().into();
        let on_accent: Hsla = rgb(0x15121f).into();
        let scale = window.scale_factor();
        let label = |text: &str| div().text_size(px(12.)).line_height(px(18.)).font_weight(FontWeight::EXTRA_BOLD).text_color(muted).child(text.to_uppercase());
        let hint = |text: &str| div().text_size(px(13.)).line_height(px(19.5)).text_color(muted).child(text.to_string());
        let field = || div().flex().flex_col().gap(px(8.));
        let primary = |id: &'static str, text: &'static str| {
            div().id(id).h(px(38.25)).px(px(18.)).rounded(px(8.)).bg(lavender).flex().items_center().text_size(px(13.5)).font_weight(FontWeight::SEMIBOLD).text_color(on_accent).cursor_pointer().hover(|s| s.opacity(0.9)).child(text)
        };
        let secondary = |id: &'static str, text: &'static str| {
            div()
                .id(id)
                .h(px(38.25))
                .px(px(18.))
                .rounded(px(8.))
                .bg(Theme::card())
                .border_1()
                .border_color(Theme::line())
                .flex()
                .items_center()
                .text_size(px(13.5))
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(ink)
                .cursor_pointer()
                .child(text)
        };
        let main_w = f32::from(window.viewport_size().width) - 240. - 120.;
        let left_w = (main_w - 48. - 300.).max(260.);
        let sw = (left_w - 32.) / 5.;
        let mut swatches = div().flex().flex_wrap().gap(px(8.));
        for (n, (name, a, b)) in BANNER_COLORS.iter().enumerate() {
            let selected = s.gradient == n;
            swatches = swatches.child(
                div()
                    .id(SharedString::from(format!("ss-swatch-{n}")))
                    .w(px(sw))
                    .h(px(54.))
                    .rounded(px(8.))
                    .border_2()
                    .border_color(if selected { gpui::white() } else { gpui::transparent_black() })
                    .bg(gpui::linear_gradient(135., gpui::linear_color_stop(rgb(*a), 0.), gpui::linear_color_stop(rgb(*b), 1.)))
                    .cursor_pointer()
                    .tooltip(ui::tooltip(name.to_string()))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if let Some(s) = this.server_settings.as_mut() {
                            s.gradient = n;
                            s.banner_url.clear();
                        }
                        cx.notify();
                    })),
            );
        }
        let tw = (left_w - 20.) / 3.;
        let mut traits = div().flex().flex_wrap().gap(px(10.));
        for n in 0..5 {
            traits = traits.child(div().id(SharedString::from(format!("ss-trait-{n}"))).w(px(tw)).h(px(48.)).px(px(12.)).rounded(px(8.)).bg(Theme::panel()).border_1().border_color(Theme::line()).flex().items_center().child(ui::icon("smile", 20., ink)));
        }
        let mut left = div().w(px(left_w)).flex_none().flex().flex_col().gap(px(24.));
        if !can.manage_server {
            left = left.child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .text_size(px(13.))
                    .text_color(muted)
                    .child(ui::icon("info", 16., muted))
                    .child("Viewing server overview in read-only mode. You need the Manage Server permission to edit server details."),
            );
        }
        left = left
            .child(
                div()
                    .flex()
                    .flex_col()
                    .child(div().font_family(DISPLAY_FONT).text_size(px(26.)).line_height(px(39.)).font_weight(FontWeight::MEDIUM).text_color(ink).child("Server Profile"))
                    .child(div().mt(px(28.)).mb(px(12.)).text_size(px(13.5)).line_height(px(18.9)).text_color(muted).child("Customize how your server appears in invite links and, if enabled, in Server Discovery and Announcement Channel messages")),
            )
            .child(field().child(label("Name")).child(div().h(px(43.)).px(px(14.)).rounded(px(6.)).bg(Theme::paper()).border_1().border_color(Theme::line()).flex().items_center().child(s.name.clone())))
            .child(
                field()
                    .child(label("Server Icon (Photo)"))
                    .child(hint("Upload a custom image/photo for your server icon (minimum 512x512 recommended)."))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(12.))
                            .child(primary("ss-icon-up", "Upload Server Icon").on_click(cx.listener(|this, _, _, cx| this.upload_server_image(false, cx))))
                            .when(!s.icon_url.is_empty(), |d| {
                                d.child(secondary("ss-icon-rm", "Remove Icon").on_click(cx.listener(|this, _, _, cx| {
                                    if let Some(s) = this.server_settings.as_mut() {
                                        s.icon_url.clear();
                                    }
                                    cx.notify();
                                })))
                            }),
                    ),
            )
            .child(
                field()
                    .child(label("Server Banner Image"))
                    .child(hint("Upload a custom header banner image for your server sidebar."))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(12.))
                            .child(primary("ss-banner-up", "Upload Server Banner").on_click(cx.listener(|this, _, _, cx| this.upload_server_image(true, cx))))
                            .when(!s.banner_url.is_empty(), |d| {
                                d.child(secondary("ss-banner-rm", "Remove Banner").on_click(cx.listener(|this, _, _, cx| {
                                    if let Some(s) = this.server_settings.as_mut() {
                                        s.banner_url.clear();
                                    }
                                    cx.notify();
                                })))
                            }),
                    ),
            )
            .child(field().child(label("Or Pick Banner Gradient")).child(swatches))
            .child(field().child(label("Traits")).child(hint("Add up to 5 traits to show off your server's interests and personality.")).child(traits));
        if can.manage_server {
            left = left.child(div().flex().child(primary("ss-save", "Save Changes").on_click(cx.listener(|this, _, _, cx| this.save_server_profile(cx)))));
        }

        // `.server-card-preview`.
        let (a, b) = (BANNER_COLORS[s.gradient].1, BANNER_COLORS[s.gradient].2);
        let banner: AnyElement = if s.banner_url.is_empty() {
            div().h(px(100.)).bg(gpui::linear_gradient(135., gpui::linear_color_stop(rgb(a), 0.), gpui::linear_color_stop(rgb(b), 1.))).into_any_element()
        } else {
            div().h(px(100.)).overflow_hidden().child(gpui::img(self.client.absolute(&s.banner_url)).size_full().object_fit(gpui::ObjectFit::Cover)).into_any_element()
        };
        let name_text = s.name.read(cx).text();
        let color = crate::theme::css_color(&s.color).unwrap_or_else(|| rgb(0x7b63e6).into());
        let avatar: AnyElement = if s.icon_url.is_empty() {
            div().text_size(px(24.)).font_weight(FontWeight::EXTRA_BOLD).text_color(gpui::white()).child(if server.icon.is_empty() { name_text.chars().take(2).collect::<String>().to_uppercase() } else { server.icon.clone() }).into_any_element()
        } else {
            gpui::img(self.client.absolute(&s.icon_url)).size(px(56.)).object_fit(gpui::ObjectFit::Cover).into_any_element()
        };
        let members = self.members.get(&server.id).map(|m| m.len()).unwrap_or(0);
        let online = self.members.get(&server.id).map(|m| m.iter().filter(|m| self.presence_of(&m.id) != "offline").count()).unwrap_or(0);
        let _ = scale;
        let card = div()
            .w(px(300.))
            .flex_none()
            .rounded(px(12.))
            .overflow_hidden()
            .bg(Theme::panel())
            .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.4), offset: gpui::point(px(0.), px(12.)), blur_radius: px(30.), spread_radius: px(0.) }])
            .child(banner)
            .child(
                div()
                    .relative()
                    .p(px(16.))
                    .flex()
                    .flex_col()
                    .child(
                        div()
                            .absolute()
                            .left(px(16.))
                            .top(px(-32.))
                            .size(px(64.))
                            .rounded(px(16.))
                            .border(px(4.))
                            .border_color(Theme::panel())
                            .bg(color)
                            .overflow_hidden()
                            .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.3), offset: gpui::point(px(0.), px(4.)), blur_radius: px(12.), spread_radius: px(0.) }])
                            .flex()
                            .items_center()
                            .justify_center()
                            .child(avatar),
                    )
                    .child(div().mt(px(28.)).text_size(px(16.)).line_height(px(24.)).font_weight(FontWeight::BOLD).text_color(ink).child(name_text))
                    .child(
                        div()
                            .mt(px(6.))
                            .flex()
                            .items_center()
                            .gap(px(4.))
                            .text_size(px(12.))
                            .line_height(px(18.))
                            .text_color(rgb(0xb5bac1))
                            .child(div().size(px(8.)).rounded_full().bg(rgb(0x23a55a)))
                            .child(format!("{online} Online"))
                            .child(div().ml(px(6.)).size(px(8.)).rounded_full().bg(rgb(0x80848e)))
                            .child(format!("{} Members", if members > 0 { members } else { 12 })),
                    )
                    .child(div().mt(px(10.)).text_size(px(11.)).line_height(px(16.5)).text_color(muted).child("Est. Jun 2026")),
            );
        div().flex().items_start().gap(px(48.)).child(left).child(card).into_any_element()
    }

    /// moderate (kick or ban) once confirmed.
    pub(super) fn moderate_member(&mut self, server: String, member: String, name: String, action: &'static str, cx: &mut Context<Self>) {
        let path = format!("/api/members/{}", url::form_urlencoded::byte_serialize(member.as_bytes()).collect::<String>());
        let body = json!({ "serverId": server, "action": action });
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.settings_post(&path, body) }).await;
            this.update(cx, |this, cx| match result {
                Ok(_) => {
                    if let Some(list) = this.members.get_mut(&server) {
                        list.retain(|m| m.id != member);
                    }
                    this.server_notice(format!("{} {name}.", if action == "kick" { "Kicked" } else { "Banned" }), cx);
                    this.load_servers(cx);
                }
                Err(e) => this.server_notice(if e.to_string().is_empty() { format!("Could not {action} member.") } else { e.to_string() }, cx),
            })
            .ok();
        })
        .detach();
    }

    /// toggleMemberRole(): shown at once, then POST /api/roles/assign.
    fn toggle_member_role(&mut self, server: String, user: String, role: String, add: bool, cx: &mut Context<Self>) {
        if let Some(m) = self.members.get_mut(&server).and_then(|l| l.iter_mut().find(|m| m.id == user)) {
            let mut held: Vec<String> = m.role_ids.get(&server).and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect()).unwrap_or_default();
            held.retain(|r| r != &role);
            if add {
                held.push(role.clone());
            }
            if !m.role_ids.is_object() {
                m.role_ids = json!({});
            }
            m.role_ids[&server] = json!(held);
        }
        let body = json!({ "serverId": server, "userId": user, "roleId": role, "add": add });
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.settings_post("/api/roles/assign", body) }).await;
            this.update(cx, |this, cx| {
                if let Err(e) = result {
                    this.server_notice(e.to_string(), cx);
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    /// ServerMembersTab: search, then each member with where they came from, their roles (add /
    /// remove), and kick / ban — the grid's fourth column wraps under the first, as on the web.
    fn render_server_members(&self, s: &ServerSettings, server: &crate::model::Server, can: Can, window: &Window, cx: &mut Context<Self>) -> AnyElement {
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let grey: Hsla = rgb(0x949ba4).into();
        let query = s.member_search.read(cx).text().trim().to_lowercase();
        let mut roles = server.roles.clone();
        roles.sort_by_key(|r| -r.position);
        let held = |m: &crate::model::Member| -> Vec<String> { m.role_ids.get(&server.id).and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect()).unwrap_or_default() };
        let all = self.members.get(&server.id).cloned().unwrap_or_default();
        let shown: Vec<&crate::model::Member> = all
            .iter()
            .filter(|m| {
                query.is_empty()
                    || m.display_name.to_lowercase().contains(&query)
                    || m.username.to_lowercase().contains(&query)
                    || m.joined_via.as_ref().is_some_and(|j| j.code.to_lowercase().contains(&query) || j.creator_username.as_deref().unwrap_or("").to_lowercase().contains(&query) || j.creator_name.as_deref().unwrap_or("").to_lowercase().contains(&query))
                    || roles.iter().any(|r| held(m).contains(&r.id) && r.name.to_lowercase().contains(&query))
            })
            .collect();
        let main_w = f32::from(window.viewport_size().width) - 240. - 120.;
        let mid_w = (main_w - 32. - 280. - 140.).max(60.);
        let head = |text: &str, w: f32| div().w(px(w)).flex_none().text_size(px(11.)).line_height(px(16.5)).font_weight(FontWeight::EXTRA_BOLD).text_color(grey).child(text.to_string());
        let mut list = div().flex().flex_col().gap(px(4.));
        for m in shown.iter() {
            let owner = server.owner_id.as_deref() == Some(m.id.as_str());
            let mine = held(m);
            let member_roles: Vec<&crate::model::Role> = roles.iter().filter(|r| mine.contains(&r.id)).collect();
            let open_menu = s.role_menu.as_deref() == Some(m.id.as_str());
            let online = self.presence_of(&m.id) != "offline";
            let joined: AnyElement = match (&m.joined_via, owner) {
                (Some(j), _) => div()
                    .flex()
                    .items_center()
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(4.))
                            .h(px(20.5))
                            .px(px(6.))
                            .rounded(px(4.))
                            .border_1()
                            .border_color(rgba(0x5865f24d))
                            .bg(rgba(0x5865f226))
                            .font_family(crate::theme::MONO_FONT)
                            .text_size(px(11.))
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(rgb(0xa5b4fc))
                            .child(ui::icon("link", 12., rgb(0xa5b4fc)))
                            .child(j.code.clone()),
                    )
                    .children(j.creator_username.clone().or(j.creator_name.clone()).map(|by| div().text_size(px(11.)).text_color(grey).child(format!("by @{by}"))))
                    .into_any_element(),
                (None, true) => div().flex().items_center().gap(px(4.)).text_size(px(11.)).italic().text_color(rgb(0x80848e)).child(ui::icon("crown", 12., rgb(0x80848e))).child("Server Owner").into_any_element(),
                (None, false) => div().text_size(px(11.)).italic().text_color(rgb(0x80848e)).child("Direct / Default").into_any_element(),
            };
            let mut role_col = div().w(px(140.)).flex_none().flex().flex_wrap().items_center().gap(px(4.));
            for r in &member_roles {
                let color = crate::theme::css_color(&r.color);
                let (sid, uid, rid) = (server.id.clone(), m.id.clone(), r.id.clone());
                role_col = role_col.child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(6.))
                        .px(px(8.))
                        .py(px(3.))
                        .rounded(px(4.))
                        .bg(gpui::white().opacity(0.08))
                        .border_1()
                        .border_color(color.map(|c| c.opacity(0.4)).unwrap_or(gpui::transparent_black()))
                        .text_size(px(11.))
                        .font_weight(FontWeight::SEMIBOLD)
                        .child(div().size(px(8.)).rounded_full().bg(color.unwrap_or(rgb(0x99aab5).into())))
                        .child(div().text_color(color.unwrap_or(rgb(0xdbdee1).into())).child(r.name.clone()))
                        .when(can.roles, |d| {
                            d.child(
                                div()
                                    .id(SharedString::from(format!("rr-{}-{}", m.id, r.id)))
                                    .opacity(0.6)
                                    .hover(|s| s.opacity(1.))
                                    .cursor_pointer()
                                    .child(ui::icon("x", 12., color.unwrap_or(rgb(0xdbdee1).into())))
                                    .on_click(cx.listener(move |this, _, _, cx| this.toggle_member_role(sid.clone(), uid.clone(), rid.clone(), false, cx))),
                            )
                        }),
                );
            }
            if can.roles {
                let uid = m.id.clone();
                let mut add = div().relative().child(
                    div()
                        .id(SharedString::from(format!("ra-{}", m.id)))
                        .size(px(22.))
                        .rounded(px(4.))
                        .bg(gpui::white().opacity(0.06))
                        .border_1()
                        .border_dashed()
                        .border_color(gpui::white().opacity(0.2))
                        .flex()
                        .items_center()
                        .justify_center()
                        .cursor_pointer()
                        .hover(|s| s.bg(gpui::white().opacity(0.12)))
                        .tooltip(ui::tooltip("Add Role".to_string()))
                        .child(ui::icon("plus", 14., rgb(0xb5bac1)))
                        .on_click(cx.listener(move |this, _, _, cx| {
                            if let Some(s) = this.server_settings.as_mut() {
                                s.role_menu = if s.role_menu.as_deref() == Some(uid.as_str()) { None } else { Some(uid.clone()) };
                            }
                            cx.notify();
                        })),
                );
                if open_menu {
                    let missing: Vec<&crate::model::Role> = roles.iter().filter(|r| !mine.contains(&r.id)).collect();
                    let mut menu = div().absolute().top(px(22.)).left_0().min_w(px(160.)).p(px(6.)).rounded(px(8.)).bg(rgb(0x111214)).border_1().border_color(gpui::white().opacity(0.12)).shadow(ui::card_shadow()).flex().flex_col();
                    if missing.is_empty() {
                        menu = menu.child(div().px(px(8.)).py(px(6.)).text_size(px(11.)).text_color(grey).child("No more roles to add"));
                    }
                    for r in missing {
                        let color = crate::theme::css_color(&r.color);
                        let (sid, uid, rid) = (server.id.clone(), m.id.clone(), r.id.clone());
                        menu = menu.child(
                            div()
                                .id(SharedString::from(format!("rao-{}-{}", m.id, r.id)))
                                .flex()
                                .items_center()
                                .gap(px(8.))
                                .px(px(8.))
                                .py(px(6.))
                                .rounded(px(4.))
                                .text_size(px(12.))
                                .cursor_pointer()
                                .hover(|s| s.bg(Hsla::from(Theme::lavender()).opacity(0.15)))
                                .child(div().size(px(8.)).rounded_full().bg(color.unwrap_or(rgb(0x99aab5).into())))
                                .child(div().text_color(color.unwrap_or(rgb(0xdbdee1).into())).child(r.name.clone()))
                                .on_click(cx.listener(move |this, _, _, cx| {
                                    if let Some(s) = this.server_settings.as_mut() {
                                        s.role_menu = None;
                                    }
                                    this.toggle_member_role(sid.clone(), uid.clone(), rid.clone(), true, cx);
                                })),
                        );
                    }
                    add = add.child(gpui::deferred(menu).with_priority(3));
                }
                role_col = role_col.child(add);
            }
            let mut actions = div().w(px(280.)).flex().justify_end().items_center().gap(px(6.));
            if !owner && (can.members || can.ban) {
                let act = |id: String, icon: &'static str, tip: &'static str, danger: bool| {
                    div()
                        .id(SharedString::from(id))
                        .p(px(6.))
                        .rounded(px(4.))
                        .cursor_pointer()
                        .hover(move |s| if danger { s.bg(rgba(0xef444433)) } else { s.bg(gpui::white().opacity(0.08)) })
                        .tooltip(ui::tooltip(tip.to_string()))
                        .child(ui::icon(icon, 15., grey))
                };
                let (sid, uid, name) = (server.id.clone(), m.id.clone(), m.display_name_or_name());
                let server_name = server.name.clone();
                let (sid2, uid2, name2, server_name2) = (sid.clone(), uid.clone(), name.clone(), server_name.clone());
                actions = actions
                    .child(act(format!("kick-{}", m.id), "user-minus", "Kick Member", false).on_click(cx.listener(move |this, _, _, cx| {
                        this.confirm = Some(Confirm {
                            title: format!("Kick {name}?"),
                            text: format!("Are you sure you want to remove {name} from {server_name}? They will be able to rejoin with an invite."),
                            ok: "Kick Member".into(),
                            cancel: t("common.cancel"),
                            action: ConfirmAction::Moderate(sid.clone(), uid.clone(), name.clone(), "kick"),
                        });
                        cx.notify();
                    })))
                    .when(can.ban, |d| {
                        d.child(act(format!("ban-{}", m.id), "hammer", "Ban Member", true).on_click(cx.listener(move |this, _, _, cx| {
                            this.confirm = Some(Confirm {
                                title: format!("Ban {name2}?"),
                                text: format!("Are you sure you want to ban {name2} from {server_name2}? They will not be able to rejoin unless unbanned."),
                                ok: "Ban Member".into(),
                                cancel: t("common.cancel"),
                                action: ConfirmAction::Moderate(sid2.clone(), uid2.clone(), name2.clone(), "ban"),
                            });
                            cx.notify();
                        })))
                    });
            }
            let face = div()
                .relative()
                .flex_none()
                .child(ui::avatar(self.picture(&m.avatar_url), &m.avatar, &m.color, m.name(), 36.))
                .child(div().absolute().right(px(-1.)).bottom(px(-1.)).size(px(12.)).rounded_full().border_2().border_color(rgb(0x1e1f22)).bg(if online { rgb(0x3ba55d) } else { rgb(0x80848e) }));
            list = list.child(
                div()
                    .px(px(16.))
                    .py(px(10.))
                    .rounded(px(8.))
                    .bg(Theme::panel())
                    .flex()
                    .flex_col()
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .child(
                                div()
                                    .w(px(280.))
                                    .flex_none()
                                    .flex()
                                    .items_center()
                                    .gap(px(12.))
                                    .child(face)
                                    .child(
                                        div()
                                            .min_w_0()
                                            .flex()
                                            .flex_col()
                                            .child(div().flex().items_center().gap(px(4.)).text_size(px(14.)).line_height(px(21.)).font_weight(FontWeight::BOLD).text_color(rgb(0xf2f3f5)).child(m.display_name_or_name()).when(owner, |d| d.child(ui::icon("crown", 14., rgb(0xf59e0b)))))
                                            .child(div().text_size(px(11.)).line_height(px(16.5)).text_color(grey).child(format!("@{}", m.username))),
                                    ),
                            )
                            .child(div().w(px(mid_w)).flex_none().child(joined))
                            .child(role_col),
                    )
                    .child(actions),
            );
        }
        let _ = (ink, muted);
        div()
            .flex()
            .flex_col()
            .gap(px(24.))
            .child(div().font_family(DISPLAY_FONT).text_size(px(26.)).line_height(px(39.)).font_weight(FontWeight::MEDIUM).text_color(ink).child("Server Members"))
            .child(div().mt(px(-4.)).mb(px(12.)).text_size(px(13.5)).line_height(px(18.9)).text_color(muted).child(format!("{} {} in {}. Manage their server roles, view invite sources, and moderate members here.", shown.len(), if shown.len() == 1 { "member" } else { "members" }, server.name)))
            .child(div().relative().h(px(43.)).pl(px(36.)).pr(px(14.)).rounded(px(6.)).bg(Theme::paper()).border_1().border_color(Theme::line()).flex().items_center().child(div().absolute().left(px(12.)).top(px(14.)).opacity(0.6).child(ui::icon("search", 14., ink))).child(div().flex_1().child(s.member_search.clone())))
            .child(
                div()
                    .mt(px(-8.))
                    .px(px(16.))
                    .py(px(8.))
                    .border_b_1()
                    .border_color(Theme::divider())
                    .flex()
                    .flex_col()
                    .child(div().flex().child(head("MEMBER", 280.)).child(head("JOINED VIA", mid_w)).child(head("ROLES", 140.)))
                    .child(div().w(px(280.)).flex().justify_end().child(head("ACTIONS", 60.).flex().justify_end())),
            )
            .child(list.mt(px(-8.)))
            .into_any_element()
    }

    /// A role change that answers with the servers: reload them, then the notice.
    fn role_call(&mut self, method: &'static str, path: String, body: Value, notice: Option<String>, cx: &mut Context<Self>) {
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx
                .background_executor()
                .spawn(async move {
                    match method {
                        "POST" => client.settings_post(&path, body),
                        "DELETE" => client.settings_delete(&path, body),
                        _ => client.settings_patch(&path, body),
                    }
                })
                .await;
            this.update(cx, |this, cx| match result {
                Ok(v) => {
                    // The answer carries the servers; the newest role opens after Create Role.
                    if method == "POST"
                        && let Some(sid) = this.server_settings.as_ref().map(|s| s.server_id.clone())
                        && let Some(role) = v.get("servers").and_then(Value::as_array).and_then(|a| a.iter().find(|s| s["id"] == sid.as_str())).and_then(|s| s["roles"].as_array()).and_then(|r| r.last()).and_then(|r| r["id"].as_str())
                        && let Some(s) = this.server_settings.as_mut()
                    {
                        s.active_role = Some(role.to_string());
                    }
                    this.load_servers(cx);
                    if let Some(n) = notice {
                        this.server_notice(n, cx);
                    }
                }
                Err(e) => this.server_notice(e.to_string(), cx),
            })
            .ok();
        })
        .detach();
    }

    /// toggleRolePermission(): the flag flipped, shown at once (the next toggle builds on it).
    fn toggle_role_permission(&mut self, flag: u64, cx: &mut Context<Self>) {
        let Some(s) = self.server_settings.as_ref() else { return };
        let Some(role_id) = s.active_role.clone() else { return };
        let sid = s.server_id.clone();
        let Some(server) = self.servers.iter_mut().find(|x| x.id == sid) else { return };
        let (path, body) = if role_id == EVERYONE {
            server.everyone_permissions ^= flag;
            ("/api/roles/everyone".to_string(), json!({ "serverId": sid, "permissions": server.everyone_permissions }))
        } else {
            let Some(role) = server.roles.iter_mut().find(|r| r.id == role_id) else { return };
            role.permissions ^= flag;
            (format!("/api/roles/{}", url::form_urlencoded::byte_serialize(role_id.as_bytes()).collect::<String>()), json!({ "permissions": role.permissions }))
        };
        cx.notify();
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.settings_patch(&path, body) }).await;
            this.update(cx, |this, cx| {
                if let Err(e) = result {
                    this.server_notice(if e.to_string().is_empty() { "Could not update permissions".into() } else { e.to_string() }, cx);
                    this.load_servers(cx);
                }
            })
            .ok();
        })
        .detach();
    }

    fn save_role_emoji(&mut self, cx: &mut Context<Self>) {
        let Some(s) = self.server_settings.as_ref() else { return };
        let Some(role) = s.active_role.clone().filter(|r| r != EVERYONE) else { return };
        let emoji = s.role_emoji.read(cx).text().trim().to_string();
        if emoji.is_empty() {
            return;
        }
        let path = format!("/api/roles/{}", url::form_urlencoded::byte_serialize(role.as_bytes()).collect::<String>());
        self.role_call("PATCH", path, json!({ "icon": emoji }), Some("Role icon saved.".into()), cx);
    }

    fn upload_role_icon(&mut self, cx: &mut Context<Self>) {
        let Some(role) = self.server_settings.as_ref().and_then(|s| s.active_role.clone()).filter(|r| r != EVERYONE) else { return };
        let picked = cx.prompt_for_paths(gpui::PathPromptOptions { files: true, directories: false, multiple: false, prompt: None });
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let Ok(Ok(Some(paths))) = picked.await else { return };
            let Some(path) = paths.into_iter().next() else { return };
            let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "image".into());
            let mime = match path.extension().map(|e| e.to_string_lossy().to_lowercase()).as_deref() {
                Some("png") => "image/png",
                Some("gif") => "image/gif",
                Some("webp") => "image/webp",
                _ => "image/jpeg",
            };
            let result = cx.background_executor().spawn(async move { client.upload_field("image", &name, mime, &std::fs::read(&path)?) }).await;
            this.update(cx, |this, cx| match result {
                Ok(key) => {
                    let icon = format!("/hangout/api/uploads/{}", url::form_urlencoded::byte_serialize(key.as_bytes()).collect::<String>());
                    let path = format!("/api/roles/{}", url::form_urlencoded::byte_serialize(role.as_bytes()).collect::<String>());
                    this.role_call("PATCH", path, json!({ "icon": icon }), Some("Role icon saved.".into()), cx);
                }
                Err(e) => this.server_notice(if e.to_string().is_empty() { "That image did not upload.".into() } else { e.to_string() }, cx),
            })
            .ok();
        })
        .detach();
    }

    /// ServerRolesTab: Default Permissions (@everyone), search and Create Role, the roles, and the
    /// open role's icon and permissions.
    fn render_server_roles(&self, s: &ServerSettings, server: &crate::model::Server, can: Can, window: &Window, cx: &mut Context<Self>) -> AnyElement {
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let grey: Hsla = rgb(0x949ba4).into();
        let lavender: Hsla = Theme::lavender().into();
        let on_accent: Hsla = rgb(0x15121f).into();
        let query = s.role_search.read(cx).text().to_lowercase();
        let roles: Vec<&crate::model::Role> = server.roles.iter().filter(|r| r.name.to_lowercase().contains(&query)).collect();
        let members = self.members.get(&server.id).map(|m| m.len()).unwrap_or(0);
        let active = s.active_role.clone();
        let everyone = active.as_deref() == Some(EVERYONE);
        let _ = window;
        let mut page = div()
            .flex()
            .flex_col()
            .gap(px(24.))
            .child(div().font_family(DISPLAY_FONT).text_size(px(26.)).line_height(px(39.)).font_weight(FontWeight::MEDIUM).text_color(ink).child("Roles"))
            .child(div().mt(px(4.)).mb(px(12.)).text_size(px(13.5)).line_height(px(18.9)).text_color(muted).child("Use roles to group your server members and assign permissions."))
            .child(
                div()
                    .id("ss-everyone")
                    .px(px(20.))
                    .py(px(16.))
                    .rounded(px(8.))
                    .bg(Theme::panel())
                    .border_1()
                    .border_color(if everyone { lavender } else { gpui::transparent_black() })
                    .flex()
                    .items_center()
                    .justify_between()
                    .cursor_pointer()
                    .child(div().flex().flex_col().gap(px(6.)).child(div().text_size(px(14.)).line_height(px(21.)).font_weight(FontWeight::BOLD).text_color(ink).child("Default Permissions")).child(div().text_size(px(12.)).line_height(px(15.)).text_color(grey).child("@everyone · applies to all server members")))
                    .child(div().text_size(px(20.)).line_height(px(30.)).text_color(grey).child("›"))
                    .on_click(cx.listener(|this, _, _, cx| {
                        if let Some(s) = this.server_settings.as_mut() {
                            s.active_role = Some(EVERYONE.into());
                        }
                        cx.notify();
                    })),
            )
            .child(
                div()
                    .mt(px(10.))
                    .flex()
                    .items_center()
                    .gap(px(16.))
                    .child(div().flex_1().relative().h(px(43.)).pl(px(36.)).pr(px(14.)).rounded(px(6.)).bg(Theme::paper()).border_1().border_color(Theme::line()).flex().items_center().child(div().absolute().left(px(12.)).top(px(14.)).opacity(0.6).child(ui::icon("search", 14., ink))).child(div().flex_1().child(s.role_search.clone())))
                    .when(can.roles, |d| {
                        d.child(div().id("ss-create-role").h(px(38.25)).px(px(18.)).rounded(px(8.)).bg(lavender).flex().items_center().text_size(px(13.5)).font_weight(FontWeight::SEMIBOLD).text_color(on_accent).cursor_pointer().child("Create Role").on_click(cx.listener(|this, _, window, cx| {
                            this.open_prompt(super::channel_tools::PromptKind::CreateRole, "Create Role".into(), "Enter a name for the new role:".into(), String::new(), "e.g. Moderator", "Create Role", None, window, cx);
                        })))
                    }),
            )
            .child(div().pt(px(12.)).px(px(10.)).pb(px(4.)).flex().justify_between().text_size(px(11.)).line_height(px(16.5)).font_weight(FontWeight::EXTRA_BOLD).text_color(grey).child(format!("ROLES - {}", roles.len())).child("MEMBERS"));
        let mut list = div().flex().flex_col().gap(px(4.));
        for r in &roles {
            let selected = active.as_deref() == Some(r.id.as_str());
            let color = crate::theme::css_color(&r.color).unwrap_or(rgb(0x99aab5).into());
            let id = r.id.clone();
            let icon_el = r.icon.as_ref().filter(|i| !i.is_empty()).map(|i| {
                if i.starts_with('/') || i.starts_with("http") {
                    gpui::img(self.client.absolute(i)).size(px(16.)).into_any_element()
                } else {
                    div().text_size(px(14.)).child(i.clone()).into_any_element()
                }
            });
            let act = |id: String, icon: &'static str, tip: &'static str| div().id(SharedString::from(id)).p(px(6.)).rounded(px(4.)).cursor_pointer().hover(|s| s.bg(gpui::white().opacity(0.08))).tooltip(ui::tooltip(tip.to_string())).child(ui::icon(icon, 14., rgb(0xb5bac1)));
            list = list.child(
                div()
                    .id(SharedString::from(format!("ss-role-{}", r.id)))
                    .h(px(50.))
                    .px(px(16.))
                    .rounded(px(6.))
                    .bg(if selected { rgb(0x35373c) } else { rgb(0x1e1f22) })
                    .flex()
                    .items_center()
                    .cursor_pointer()
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(12.))
                            .child(ui::icon("grip-vertical", 14., rgb(0x6d6f78)))
                            .child(ui::icon("shield", 16., color))
                            .child(div().text_size(px(14.)).line_height(px(21.)).font_weight(FontWeight::BOLD).text_color(gpui::white()).child(r.name.clone()))
                            .children(icon_el),
                    )
                    .child(div().flex_1().flex().justify_center().child(div().flex().items_center().gap(px(4.)).text_size(px(16.)).line_height(px(24.)).text_color(ink).child(members.to_string()).child(ui::icon("users", 14., ink))))
                    .child(div().flex().items_center().gap(px(8.)).child(act(format!("ss-role-edit-{}", r.id), "pencil", "Edit Role")).child(act(format!("ss-role-more-{}", r.id), "ellipsis", "More")))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if let Some(s) = this.server_settings.as_mut() {
                            s.active_role = Some(id.clone());
                        }
                        cx.notify();
                    })),
            );
        }
        page = page.child(list);
        let active_role: Option<(String, String, u64, Option<String>)> = match active.as_deref() {
            Some(EVERYONE) => Some((EVERYONE.into(), "@everyone".into(), server.everyone_permissions, None)),
            Some(id) => server.roles.iter().find(|r| r.id == id).map(|r| (r.id.clone(), r.name.clone(), r.permissions, r.icon.clone())),
            None => None,
        };
        if let (Some((rid, rname, perms, ricon)), true) = (active_role, can.roles) {
            let mut editor = div().mt(px(24.)).flex().flex_col();
            if rid != EVERYONE {
                let has_icon = ricon.as_ref().is_some_and(|i| !i.is_empty());
                let emoji_ok = { let e = s.role_emoji.read(cx).text(); !e.trim().is_empty() && Some(e.trim().to_string()) != ricon };
                let current: AnyElement = match ricon.as_ref().filter(|i| !i.is_empty()) {
                    Some(i) if i.starts_with('/') || i.starts_with("http") => gpui::img(self.client.absolute(i)).size(px(28.)).into_any_element(),
                    Some(i) => div().text_size(px(22.)).child(i.clone()).into_any_element(),
                    None => div().text_size(px(22.)).line_height(px(22.)).child("—").into_any_element(),
                };
                let plain = |id: &'static str, text: String| div().id(id).h(px(38.25)).px(px(18.)).rounded(px(8.)).flex().items_center().text_size(px(13.5)).font_weight(FontWeight::SEMIBOLD).text_color(ink).cursor_pointer().child(text);
                editor = editor.child(
                    div()
                        .mt(px(12.))
                        .mb(px(20.))
                        .flex()
                        .flex_col()
                        .gap(px(8.))
                        .child(div().text_size(px(16.)).line_height(px(24.)).text_color(ink).child(t("roleIcon.title")))
                        .child(div().text_size(px(13.5)).line_height(px(18.9)).text_color(muted).child(t("roleIcon.desc")))
                        .child(
                            div()
                                .flex()
                                .flex_wrap()
                                .items_center()
                                .gap(px(8.))
                                .child(div().ml(px(4.)).size(px(28.)).flex().items_center().justify_center().child(current))
                                .child(div().w(px(120.)).h(px(43.)).px(px(14.)).rounded(px(6.)).bg(Theme::paper()).border_1().border_color(Theme::line()).flex().items_center().child(s.role_emoji.clone()))
                                .child(div().id("ss-role-emoji").h(px(38.25)).px(px(18.)).rounded(px(8.)).bg(lavender).flex().items_center().text_size(px(13.5)).font_weight(FontWeight::SEMIBOLD).text_color(on_accent).when(!emoji_ok, |d| d.opacity(0.5)).when(emoji_ok, |d| d.cursor_pointer().on_click(cx.listener(|this, _, _, cx| this.save_role_emoji(cx)))).child(t("roleIcon.save")))
                                .child(plain("ss-role-upload", t("roleIcon.upload")).on_click(cx.listener(|this, _, _, cx| this.upload_role_icon(cx))))
                                .when(has_icon, |d| {
                                    let rid = rid.clone();
                                    d.child(plain("ss-role-remove-icon", t("roleIcon.remove")).on_click(cx.listener(move |this, _, _, cx| {
                                        let path = format!("/api/roles/{}", url::form_urlencoded::byte_serialize(rid.as_bytes()).collect::<String>());
                                        this.role_call("PATCH", path, json!({ "icon": Value::Null }), Some("Role icon removed.".into()), cx);
                                    })))
                                }),
                        ),
                );
            }
            editor = editor.child(div().mb(px(8.)).text_size(px(16.)).line_height(px(24.)).font_weight(FontWeight::SEMIBOLD).text_color(rgb(0xf2f3f5)).child(format!("Edit Permissions for {rname}")));
            if rid == EVERYONE {
                editor = editor.child(div().mb(px(12.)).text_size(px(13.5)).line_height(px(18.9)).text_color(muted).child("Every member has these, whatever roles they hold."));
            }
            for (flag, label, desc, _) in PERMISSIONS.iter() {
                let on = perms & flag == *flag;
                let flag = *flag;
                editor = editor.child(
                    div()
                        .id(SharedString::from(format!("ss-perm-{flag}")))
                        .py(px(14.))
                        .border_b_1()
                        .border_color(Theme::divider())
                        .flex()
                        .items_center()
                        .justify_between()
                        .gap(px(16.))
                        .cursor_pointer()
                        .child(div().flex_1().flex().flex_col().gap(px(4.)).child(div().text_size(px(15.)).line_height(px(22.5)).font_weight(FontWeight::SEMIBOLD).text_color(rgb(0xf2f3f5)).child(label.clone())).child(div().text_size(px(13.)).line_height(px(19.5)).text_color(grey).child(desc.clone())))
                        // Chrome's dark checkbox in the #5865f2 accent.
                        .child(
                            div()
                                .flex_none()
                                .size(px(18.))
                                .child(
                                    div()
                                        .size(px(18.))
                                        .rounded(px(3.))
                                        .when(on, |d| d.bg(rgb(0x5865f2)).child(div().size_full().flex().items_center().justify_center().child(ui::icon("check", 14., gpui::white()))))
                                        .when(!on, |d| d.bg(rgb(0x3b3b3b)).border_1().border_color(rgb(0x858585))),
                                ),
                        )
                        .on_click(cx.listener(move |this, _, _, cx| this.toggle_role_permission(flag, cx))),
                );
            }
            page = page.child(editor);
        }
        page.into_any_element()
    }

    /// The tabs still to come in this app: what they are, and the way to them on the web.
    fn render_server_tab(&self, tab: &str, _s: &ServerSettings, _server: &crate::model::Server, _can: Can, _window: &Window, cx: &mut Context<Self>) -> AnyElement {
        let name = match tab {
            "emoji" => t("serverSettings.tab.emoji"),
            "stickers" => t("serverSettings.tab.stickers"),
            "soundboard" => t("serverSettings.tab.soundboard"),
            "members" => t("serverSettings.tab.members"),
            "roles" => t("serverSettings.tab.roles"),
            "invites" => t("serverSettings.tab.invites"),
            "access" => t("serverSettings.tab.access"),
            "welcome" => t("serverSettings.tab.welcome"),
            "integrations" => t("serverSettings.tab.integrations"),
            "safety" => t("serverSettings.tab.safety"),
            "audit_log" => t("serverSettings.tab.auditLog"),
            "bans" => t("serverSettings.tab.bans"),
            "automod" => t("serverSettings.tab.automod"),
            "community" => "Enable Community".into(),
            _ => t("serverSettings.tab.templates"),
        };
        let base = self.client.base().to_string();
        let _ = tv;
        let _ = rgba;
        div()
            .flex()
            .flex_col()
            .gap(px(12.))
            .child(div().font_family(DISPLAY_FONT).text_size(px(26.)).line_height(px(39.)).font_weight(FontWeight::MEDIUM).text_color(Theme::ink()).child(name))
            .child(div().text_size(px(13.5)).line_height(px(18.9)).text_color(Theme::muted()).child("This part of server settings is not in this app yet."))
            .child(div().flex().child(div().id("ss-web").h(px(38.25)).px(px(18.)).rounded(px(8.)).bg(Theme::lavender()).flex().items_center().text_size(px(13.5)).font_weight(FontWeight::SEMIBOLD).text_color(rgb(0x15121f)).cursor_pointer().child("Open on the web").on_click(move |_, _, cx| cx.open_url(&base))))
            .into_any_element()
    }
}

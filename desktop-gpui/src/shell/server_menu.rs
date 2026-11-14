//! The server menu under the sidebar's ••• (panels.tsx `.server-menu-dropdown`): server settings,
//! invite, rename and create channel for those allowed; Mark as Read; the notification level;
//! Leave Server (or Delete Server for its managers).

use gpui::{AnyElement, Context, FontWeight, Hsla, div, prelude::*, px, rgba};

use super::Shell;
use super::context_menu::{Confirm, ConfirmAction};
use crate::i18n::{t, tv};
use crate::model::permission;
use crate::theme::Theme;
use crate::ui;

impl Shell {
    /// myPermissions on the open server (everything for its owner and Hoffle admins).
    pub(super) fn my_permissions(&self) -> u64 {
        let Some(server) = self.server() else { return 0 };
        if self.me.is_admin || server.owner_id.as_deref() == Some(self.me.id.as_str()) {
            return u64::MAX;
        }
        let held: Vec<String> = self
            .members
            .get(&server.id)
            .and_then(|list| list.iter().find(|m| m.id == self.me.id))
            .and_then(|m| m.role_ids.get(&server.id))
            .and_then(|v| v.as_array())
            .map(|ids| ids.iter().filter_map(|i| i.as_str().map(str::to_string)).collect())
            .unwrap_or_default();
        let mut mask = server.everyone_permissions;
        for role in server.roles.iter().filter(|r| held.contains(&r.id)) {
            mask |= role.permissions;
        }
        if mask & permission::ADMINISTRATOR != 0 { u64::MAX } else { mask }
    }

    pub(super) fn toggle_server_menu(&mut self, cx: &mut Context<Self>) {
        // A press on ••• while open already closed it (the press landed outside the menu).
        if self.server_menu_closed.is_some_and(|at| at.elapsed() < std::time::Duration::from_millis(400)) {
            self.server_menu_closed = None;
            return;
        }
        self.server_menu = !self.server_menu;
        cx.notify();
    }

    /// markServerRead: every unread channel of the server, at once.
    fn mark_server_read(&mut self, cx: &mut Context<Self>) {
        let Some(server) = self.server() else { return };
        let ids: Vec<String> = server.channels.iter().map(|c| c.id.clone()).filter(|id| self.reads.get(id).is_some_and(|r| r.unread || r.count > 0)).collect();
        if ids.is_empty() {
            return;
        }
        for id in &ids {
            self.reads.remove(id);
        }
        let client = self.client.clone();
        cx.background_executor().spawn(async move { client.mark_read_many(&ids) }).detach();
        cx.notify();
    }

    /// setNotifyLevel for `server:<id>` ("all" is the default and is stored as no entry).
    fn set_notify_level(&mut self, key: String, level: &'static str, cx: &mut Context<Self>) {
        if level == "all" {
            self.channel_prefs.remove(&key);
        } else {
            self.channel_prefs.insert(key.clone(), level.to_string());
        }
        let client = self.client.clone();
        cx.background_executor().spawn(async move { client.set_channel_pref(&key, level) }).detach();
        cx.notify();
    }

    pub(super) fn load_channel_prefs(&mut self, cx: &mut Context<Self>) {
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let prefs = cx.background_executor().spawn(async move { client.channel_prefs() }).await;
            this.update(cx, |this, _| {
                if let Ok(prefs) = prefs {
                    this.channel_prefs = prefs;
                }
            })
            .ok();
        })
        .detach();
    }

    pub(super) fn leave_server(&mut self, server_id: String, cx: &mut Context<Self>) {
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.leave_server(&server_id) }).await;
            this.update(cx, |this, cx| match result {
                Ok(()) => {
                    this.set_notice("You left the server.", cx);
                    this.load_servers(cx);
                    this.open_home(cx);
                }
                Err(e) => this.set_notice(e.to_string(), cx),
            })
            .ok();
        })
        .detach();
    }

    pub(super) fn delete_server(&mut self, server_id: String, cx: &mut Context<Self>) {
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.delete_server(&server_id) }).await;
            this.update(cx, |this, cx| match result {
                Ok(()) => {
                    this.load_servers(cx);
                    this.open_home(cx);
                }
                Err(e) => this.set_notice(e.to_string(), cx),
            })
            .ok();
        })
        .detach();
    }

    pub(super) fn render_server_menu(&self, cx: &mut Context<Self>) -> Option<AnyElement> {
        if !self.server_menu || self.home {
            return None;
        }
        let server = self.server()?;
        let perms = self.my_permissions();
        let has = |bit: u64| perms & bit != 0;
        let (manage_channels, manage_server, manage_roles, manage_emojis, invites) = (has(1 << 1), has(1 << 3), has(1 << 5), has(1 << 7), has(1 << 8));
        let owner = server.owner_id.as_deref() == Some(self.me.id.as_str());
        let can_settings = owner || manage_server || manage_roles || manage_channels || manage_emojis || has(1 << 6);
        let item = |id: &'static str, icon: &'static str, size: f32, label: String, danger: bool| {
            let color: Hsla = if danger { Theme::coral().into() } else { Theme::ink().into() };
            div()
                .id(id)
                .px(px(12.))
                .py(px(8.))
                .rounded(px(8.))
                .flex()
                .items_center()
                .gap(px(8.))
                .text_size(px(13.5))
                .line_height(px(20.25))
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(color)
                .cursor_pointer()
                .hover(|s| s.bg(Theme::lavender_soft()).text_color(Theme::lavender()))
                .child(ui::icon(icon, size, color))
                .child(label)
        };
        let divider = || div().my(px(4.)).h(px(1.)).bg(rgba(0xffffff12));
        let mut menu = div()
            .id("server-menu")
            .absolute()
            .top(px(48.))
            .left(px(72.))
            .w(px(220.))
            .p(px(6.))
            .rounded(px(12.))
            .bg(Theme::paper())
            .border_1()
            .border_color(rgba(0xffffff12))
            .shadow(vec![
                gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.55), offset: gpui::point(px(0.), px(20.)), blur_radius: px(50.), spread_radius: px(0.) },
                gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.4), offset: gpui::point(px(0.), px(4.)), blur_radius: px(14.), spread_radius: px(0.) },
            ])
            .flex()
            .flex_col()
            .gap(px(2.))
            .on_mouse_down_out(cx.listener(|this, _, _, cx| {
                if this.server_menu {
                    this.server_menu = false;
                    this.server_menu_closed = Some(std::time::Instant::now());
                    cx.notify();
                }
            }));
        if can_settings {
            menu = menu.child(item("sm-settings", "settings", 16., t("sidebar.menu.serverSettings"), false));
        }
        if invites || manage_server {
            menu = menu.child(item("sm-invite", "user-plus", 16., t("sidebar.menu.createInvite"), false));
        }
        if manage_server {
            menu = menu.child(item("sm-rename", "pencil", 16., t("sidebar.menu.rename"), false));
        }
        if manage_channels {
            menu = menu.child(item("sm-channel", "plus", 16., t("sidebar.menu.createChannel"), false));
        }
        menu = menu
            .child(item("sm-read", "check-check", 16., t("sidebar.menu.markRead"), false).on_click(cx.listener(|this, _, _, cx| {
                this.server_menu = false;
                this.mark_server_read(cx);
            })))
            .child(divider())
            .child(
                div()
                    .px(px(12.))
                    .py(px(4.))
                    .text_size(px(10.))
                    .line_height(px(15.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(rgba(0xffffff66))
                    .child(t("sidebar.menu.notifications").to_uppercase()),
            );
        let key = format!("server:{}", server.id);
        let current = self.channel_prefs.get(&key).cloned().unwrap_or_else(|| "all".into());
        for (n, (level, label)) in [("all", "notify.all"), ("mentions", "notify.mentions"), ("nothing", "notify.nothing")].into_iter().enumerate() {
            let mark = if current == level { "●" } else { "○" };
            let key = key.clone();
            menu = menu.child(
                item(["sm-n-all", "sm-n-mentions", "sm-n-nothing"][n], "bell", 14., format!("{mark} {}", t(label)), false).on_click(cx.listener(move |this, _, _, cx| {
                    this.server_menu = false;
                    this.set_notify_level(key.clone(), level, cx);
                })),
            );
        }
        menu = menu.child(divider());
        let (id, name) = (server.id.clone(), server.name.clone());
        if !owner {
            let (id, name) = (id.clone(), name.clone());
            menu = menu.child(item("sm-leave", "log-out", 16., t("sidebar.menu.leave"), true).on_click(cx.listener(move |this, _, _, cx| {
                this.server_menu = false;
                this.confirm = Some(Confirm {
                    title: tv("sidebar.menu.leaveTitle", &[("name", &name)]),
                    text: t("sidebar.menu.leaveMessage"),
                    ok: t("sidebar.menu.leave"),
                    cancel: t("common.cancel"),
                    action: ConfirmAction::LeaveServer(id.clone()),
                });
                cx.notify();
            })));
        }
        if manage_server {
            menu = menu.child(item("sm-delete", "trash-2", 16., t("sidebar.menu.delete"), true).on_click(cx.listener(move |this, _, _, cx| {
                this.server_menu = false;
                this.confirm = Some(Confirm {
                    title: tv("sidebar.menu.deleteTitle", &[("name", &name)]),
                    text: t("sidebar.menu.deleteMessage"),
                    ok: t("sidebar.menu.delete"),
                    cancel: t("common.cancel"),
                    action: ConfirmAction::DeleteServer(id.clone()),
                });
                cx.notify();
            })));
        }
        Some(menu.into_any_element())
    }
}

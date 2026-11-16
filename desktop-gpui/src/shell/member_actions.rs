//! What the user menu does to people (use-shell-actions.ts): nicknames, server pictures, server
//! mute, moving and disconnecting voice seats, timeouts, kick / ban / unban, invite permission.

use gpui::{Context, Window};
use serde_json::{Value, json};

use super::Shell;
use super::channel_tools::PromptKind;
use super::context_menu::{Confirm, ConfirmAction};
use crate::i18n::t;

/// lib/permissions.ts bits the user menu depends on.
pub(super) mod bits {
    pub const MODERATE: u64 = 1 << 2;
    pub const MANAGE_SERVER: u64 = 1 << 3;
    pub const MANAGE_NICKNAMES: u64 = 1 << 10;
    pub const KICK_MEMBERS: u64 = 1 << 11;
}

/// lib/timeouts.ts TIMEOUT_CHOICES.
pub(super) const TIMEOUT_CHOICES: [(i64, &str); 6] = [(1, "60 seconds"), (5, "5 minutes"), (10, "10 minutes"), (60, "1 hour"), (60 * 24, "1 day"), (60 * 24 * 7, "1 week")];

/// activeUntil(): the end of a timeout still running.
pub(super) fn active_until(until: Option<&str>) -> Option<chrono::DateTime<chrono::Local>> {
    let end = chrono::DateTime::parse_from_rfc3339(until?).ok()?.with_timezone(&chrono::Local);
    (end > chrono::Local::now()).then_some(end)
}

/// toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).
pub(super) fn short_when(at: chrono::DateTime<chrono::Local>) -> String {
    at.format("%b %-d, %-I:%M %p").to_string()
}

fn enc(id: &str) -> String {
    url::form_urlencoded::byte_serialize(id.as_bytes()).collect()
}

fn error_text(e: anyhow::Error, fallback: &str) -> String {
    let text = e.to_string();
    if text.is_empty() { fallback.to_string() } else { text }
}

impl Shell {
    /// The open server, unless in DMs.
    fn menu_server(&self) -> Option<String> {
        if self.home { None } else { self.server_id.clone() }
    }

    fn update_member(&mut self, server: &str, user_id: &str, change: impl Fn(&mut crate::model::Member)) {
        if let Some(m) = self.members.get_mut(server).and_then(|list| list.iter_mut().find(|m| m.id == user_id)) {
            change(m);
        }
    }

    /// Who is banned here, so the menu can offer Unban (only managers may read the list).
    pub(super) fn load_banned(&mut self, cx: &mut Context<Self>) {
        let Some(server) = self.menu_server() else { return };
        if self.my_permissions() & bits::MANAGE_SERVER == 0 {
            self.banned_ids.clear();
            return;
        }
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let path = format!("/api/bans?serverId={}", enc(&server));
            let found = cx.background_executor().spawn(async move { client.get_value(&path) }).await;
            this.update(cx, |this, cx| {
                if let Ok(v) = found {
                    this.banned_ids = v["bans"].as_array().into_iter().flatten().filter_map(|b| b["userId"].as_str().map(String::from)).collect();
                    cx.notify();
                }
            })
            .ok();
        })
        .detach();
    }

    /// POST /api/members/{id} or PATCH it, then `done` with the reply (or the error shown).
    fn member_call(&mut self, user_id: &str, patch: bool, body: Value, fallback: &'static str, done: impl FnOnce(&mut Self, Value, &mut Context<Self>) + 'static, cx: &mut Context<Self>) {
        let client = self.client.clone();
        let path = format!("/api/members/{}", enc(user_id));
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { if patch { client.settings_patch(&path, body) } else { client.settings_post(&path, body) } }).await;
            this.update(cx, |this, cx| {
                match result {
                    Ok(v) => done(this, v, cx),
                    Err(e) => this.set_notice(error_text(e, fallback), cx),
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    /// editNickname(): yours, or theirs with Manage Nicknames.
    pub(super) fn edit_nickname(&mut self, user_id: String, window: &mut Window, cx: &mut Context<Self>) {
        let Some(server) = self.menu_server() else { return };
        let member = self.member(&user_id).cloned().unwrap_or_default();
        let account = member.global_name.clone().filter(|n| !n.is_empty()).unwrap_or_else(|| if member.display_name.is_empty() { member.username.clone() } else { member.display_name.clone() });
        let title = if user_id == self.me.id { "Change your nickname".to_string() } else { format!("Nickname for {account}") };
        self.open_prompt(
            PromptKind::Nickname(server, user_id),
            title,
            "Only shown in this server. Leave it empty to use the account name.".into(),
            member.nickname.clone().unwrap_or_default(),
            &account,
            "Save",
            Some(32),
            window,
            cx,
        );
    }

    pub(super) fn save_nickname(&mut self, server: String, user_id: String, value: String, cx: &mut Context<Self>) {
        let nickname = (!value.trim().is_empty()).then(|| value.trim().to_string());
        let body = json!({ "serverId": server, "nickname": nickname });
        self.member_call(&user_id.clone(), true, body, "Could not change that nickname.", move |this, _, _| this.update_member(&server, &user_id, |m| m.nickname = nickname.clone()), cx);
    }

    /// setServerAvatar(): pick a picture for this server only, or clear it (yours, or theirs as a
    /// moderator) to go back to the account picture.
    pub(super) fn set_server_avatar(&mut self, user_id: String, clear: bool, cx: &mut Context<Self>) {
        let Some(server) = self.menu_server() else { return };
        let picked = (!clear).then(|| cx.prompt_for_paths(gpui::PathPromptOptions { files: true, directories: false, multiple: false, prompt: None }));
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let mut key: Option<String> = None;
            if let Some(picked) = picked {
                let Ok(Ok(Some(paths))) = picked.await else { return };
                let Some(path) = paths.into_iter().next() else { return };
                let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "image".into());
                let mime = match path.extension().map(|e| e.to_string_lossy().to_lowercase()).as_deref() {
                    Some("png") => "image/png",
                    Some("gif") => "image/gif",
                    Some("webp") => "image/webp",
                    _ => "image/jpeg",
                };
                let c = client.clone();
                let uploaded = cx.background_executor().spawn(async move { c.upload_field("image", &name, mime, &std::fs::read(&path)?) }).await;
                match uploaded {
                    Ok(k) => key = Some(k),
                    Err(e) => {
                        this.update(cx, |this, cx| this.set_notice(error_text(e, "Could not change the server avatar."), cx)).ok();
                        return;
                    }
                }
            }
            this.update(cx, |this, cx| {
                let body = json!({ "serverId": server, "avatarKey": key });
                let (s, u) = (server.clone(), user_id.clone());
                this.member_call(
                    &user_id,
                    true,
                    body,
                    "Could not change the server avatar.",
                    move |this, v, cx| {
                        let url = v["avatarUrl"].as_str().map(String::from);
                        this.update_member(&s, &u, |m| m.server_avatar_url = url.clone());
                        this.set_notice(if clear { "Server avatar removed." } else { "Server avatar updated." }, cx);
                    },
                    cx,
                );
            })
            .ok();
        })
        .detach();
    }

    /// timeoutMember(): minutes, or 0 to lift it.
    pub(super) fn timeout_member(&mut self, user_id: String, minutes: i64, cx: &mut Context<Self>) {
        let Some(server) = self.menu_server() else { return };
        let body = json!({ "serverId": server, "action": "timeout", "minutes": minutes });
        let u = user_id.clone();
        self.member_call(
            &user_id,
            false,
            body,
            "Could not do that.",
            move |this, v, cx| {
                let until = v["timeoutUntil"].as_str().map(String::from);
                this.update_member(&server, &u, |m| m.timeout_until = until.clone());
                let text = match until.as_deref().and_then(|u| chrono::DateTime::parse_from_rfc3339(u).ok()) {
                    Some(at) => format!("Timed out until {}.", at.with_timezone(&chrono::Local).format("%b %-d, %Y, %-I:%M %p")),
                    None => "Timeout lifted.".into(),
                };
                this.set_notice(text, cx);
            },
            cx,
        );
    }

    /// The menu's Kick / Ban / Unban, behind the web's confirm.
    pub(super) fn confirm_moderation(&mut self, user_id: String, action: &'static str, cx: &mut Context<Self>) {
        let Some(server) = self.menu_server() else { return };
        let verb = match action {
            "ban" => "Ban",
            "unban" => "Unban",
            _ => "Kick",
        };
        self.confirm = Some(Confirm {
            title: format!("{verb} Member?"),
            text: if action == "unban" { "They will be able to read and post here again.".into() } else { format!("Are you sure you want to {action} this member from the server?") },
            ok: format!("{verb} Member"),
            cancel: t("common.cancel"),
            action: ConfirmAction::MenuModerate(server, user_id, action),
        });
        cx.notify();
    }

    pub(super) fn menu_moderate(&mut self, server: String, user_id: String, action: &'static str, cx: &mut Context<Self>) {
        let body = json!({ "serverId": server, "action": action });
        let u = user_id.clone();
        self.member_call(
            &user_id,
            false,
            body,
            "Could not do that.",
            move |this, _, cx| {
                match action {
                    "ban" => {
                        this.banned_ids.insert(u.clone());
                    }
                    "unban" => {
                        this.banned_ids.remove(&u);
                    }
                    _ => {}
                }
                this.set_notice(
                    match action {
                        "unban" => "Unbanned · they can post here again.",
                        "ban" => "Banned · roles cleared.",
                        _ => "Kicked · roles cleared.",
                    },
                    cx,
                );
            },
            cx,
        );
    }

    /// Mute on server: their microphone stops for everyone (saveVoicePref with serverMuted).
    pub(super) fn server_mute(&mut self, user_id: String, muted: bool, cx: &mut Context<Self>) {
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.settings_post("/api/voice/prefs", json!({ "targetId": user_id, "serverMuted": muted })) }).await;
            this.update(cx, |this, cx| {
                if let Err(e) = result {
                    this.set_notice(e.to_string(), cx);
                }
            })
            .ok();
        })
        .detach();
    }

    /// moveMember(): into another voice room here.
    pub(super) fn move_member(&mut self, user_id: String, channel_id: String, cx: &mut Context<Self>) {
        let name = self.channel_by_id(&channel_id).map(|c| c.name.clone());
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.settings_post("/api/voice/move", json!({ "userId": user_id, "channelId": channel_id })) }).await;
            this.update(cx, |this, cx| match result {
                Ok(_) => this.set_notice(name.map(|n| format!("Moved them to {n}.")).unwrap_or_else(|| "Moved them.".into()), cx),
                Err(e) => this.set_notice(error_text(e, "Could not move them."), cx),
            })
            .ok();
        })
        .detach();
    }

    /// disconnectMember(): your own seat here just hangs up; another seat (yours elsewhere, or
    /// theirs as a moderator) is dropped by the server.
    pub(super) fn disconnect_member(&mut self, user_id: String, channel_id: String, cx: &mut Context<Self>) {
        if user_id == self.me.id && self.call.as_ref().is_some_and(|c| c.channel_id == channel_id) {
            self.leave_voice(cx);
            return;
        }
        let me = user_id == self.me.id;
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.settings_post("/api/voice/disconnect", json!({ "userId": user_id, "channelId": channel_id })) }).await;
            this.update(cx, |this, cx| match result {
                Ok(_) => this.set_notice(if me { "Disconnected your other voice seat." } else { "Disconnected them from voice." }, cx),
                Err(e) => this.set_notice(error_text(e, "Could not disconnect them."), cx),
            })
            .ok();
        })
        .detach();
    }

    /// A Hoffle admin lets someone make invites anywhere, or takes it back.
    pub(super) fn toggle_invite_permission(&mut self, user_id: String, can_invite: bool, cx: &mut Context<Self>) {
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let id = user_id.clone();
            let result = cx.background_executor().spawn(async move { client.settings_post("/api/invites/permissions", json!({ "userId": id, "canInvite": can_invite })) }).await;
            this.update(cx, |this, cx| {
                if result.is_ok() {
                    for list in this.members.values_mut() {
                        for m in list.iter_mut().filter(|m| m.id == user_id) {
                            m.can_invite = can_invite;
                        }
                    }
                    cx.notify();
                }
            })
            .ok();
        })
        .detach();
    }
}

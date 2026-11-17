//! Slash commands (app/lib/commands.ts, use-shell-commands.ts): the list "/" offers, matched the way
//! matchCommands does, and runCommand, which sends each command where the web sends it.

use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

use gpui::{Context, FontWeight, Hsla, SharedString, div, prelude::*, px, rgb};
use serde::Deserialize;
use serde_json::{Value, json};

use super::Shell;
use super::context_menu::{Confirm, ConfirmAction};
use crate::i18n::t;
use crate::theme::Theme;

#[derive(Clone, Deserialize)]
pub(super) struct SlashCommand {
    pub name: String,
    #[serde(default)]
    pub args: Option<String>,
    pub description: String,
    pub group: String,
    #[serde(default)]
    pub voice: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Data {
    commands: Vec<SlashCommand>,
    aliases: HashMap<String, String>,
    music: HashSet<String>,
    voice_required_music: HashSet<String>,
    discord_only: HashSet<String>,
    lookup: HashSet<String>,
    dnd_link: HashSet<String>,
    roll: HashSet<String>,
    speech: HashSet<String>,
    fun: HashSet<String>,
    player: HashSet<String>,
}

/// From `tools/export-commands.mjs`.
static DATA: LazyLock<Data> = LazyLock::new(|| {
    crate::assets::ASSETS
        .iter()
        .find(|(p, _)| *p == "data/commands.json")
        .and_then(|(_, b)| serde_json::from_slice(b).ok())
        .expect("data/commands.json")
});

/// Companion stubs kept out of the bare "/" list until typed.
const SECONDARY_COMPANION_STUBS: [&str; 7] = ["inventory", "condition", "levelup", "rest", "deathsave", "gmview", "coinflip"];

/// matchCommands: the modules switched off take their commands with them; a bare "/" hides the
/// Discord-only ones and the companion stubs; otherwise exact name, then prefixes, then descriptions.
pub(super) fn match_commands(query: &str, extra: &[SlashCommand], disabled: &HashSet<String>) -> Vec<SlashCommand> {
    // A built-in name wins over a bot's, except the D&D stubs a connected D&D bot really does.
    let builtin: HashSet<&str> = DATA.commands.iter().map(|c| c.name.as_str()).collect();
    let extra_names: HashSet<&str> = extra.iter().map(|c| c.name.as_str()).collect();
    let replaced = |name: &str| DATA.dnd_link.contains(name) && extra_names.contains(name);
    let merged: Vec<&SlashCommand> = DATA
        .commands
        .iter()
        .filter(|c| !replaced(&c.name))
        .chain(extra.iter().filter(|c| !builtin.contains(c.name.as_str()) || replaced(&c.name)))
        .collect();
    let all = merged.into_iter().filter(|c| {
        if disabled.contains("dnd") && c.group == "D&D" {
            return false;
        }
        if (disabled.contains("music") || disabled.contains("music-bot"))
            && (c.group == "Music" || c.group == "Discord music" || c.name == "web" || c.name == "dj")
        {
            return false;
        }
        if disabled.contains("discord-music") && c.group == "Discord music" {
            return false;
        }
        !(disabled.contains("games") && c.name == "game")
    });
    let term = query.trim_start_matches('/').to_lowercase();
    let term = term.trim();
    if term.is_empty() {
        return all
            .filter(|c| c.group != "Discord music" && !(SECONDARY_COMPANION_STUBS.contains(&c.name.as_str()) && !extra_names.contains(c.name.as_str())))
            .cloned()
            .collect();
    }
    let mut found: Vec<SlashCommand> = all.filter(|c| c.name.starts_with(term) || c.description.to_lowercase().contains(term)).cloned().collect();
    let rank = |c: &SlashCommand| if c.name == term { 0 } else if c.name.starts_with(term) { 1 } else { 2 };
    found.sort_by_key(rank);
    found
}

/// findCommand: the command the box's first word names exactly.
pub(super) fn find_command(text: &str) -> Option<SlashCommand> {
    let first = text.split_whitespace().next()?.trim_start_matches('/').to_lowercase();
    if first.is_empty() {
        return None;
    }
    DATA.commands.iter().find(|c| c.name.to_lowercase() == first).cloned()
}

/// A command's description in the app's language (`command.<name>.desc`), else the list's own.
fn description(c: &SlashCommand) -> String {
    let key = format!("command.{}.desc", c.name);
    let text = t(&key);
    if text == key { c.description.clone() } else { text }
}

/// Math.random's stand-in: a number in 0..n, from the clock and a counter (good enough for a coin).
fn random_below(n: usize) -> usize {
    use std::hash::{BuildHasher, Hasher};
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let mut h = std::collections::hash_map::RandomState::new().build_hasher();
    h.write_u128(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0));
    h.write_u64(COUNTER.fetch_add(1, Ordering::Relaxed));
    (h.finish() % n.max(1) as u64) as usize
}

/// crypto.randomUUID's shape, for a whisper's id.
fn random_id() -> String {
    let hex: String = (0..32).map(|_| format!("{:x}", random_below(16))).collect();
    format!("{}-{}-4{}-{:x}{}-{}", &hex[0..8], &hex[8..12], &hex[13..16], 8 + random_below(4), &hex[17..20], &hex[20..32])
}

/// funCommandReply: /8ball, /choose and /rps.
fn fun_reply(name: &str, value: &str) -> String {
    struct Rng;
    impl Rng {
        fn random_range(&mut self, r: std::ops::Range<usize>) -> usize {
            r.start + random_below(r.end - r.start)
        }
    }
    let mut rng = Rng;
    if name == "8ball" {
        const BALL: [&str; 16] = [
            "It is certain.", "Without a doubt.", "Yes, definitely.", "You may rely on it.", "Most likely.", "Outlook good.", "Signs point to yes.",
            "Reply hazy, try again.", "Ask again later.", "Better not tell you now.", "Cannot predict now.", "Don't count on it.", "My reply is no.",
            "My sources say no.", "Outlook not so good.", "Very doubtful.",
        ];
        let answer = BALL[rng.random_range(0..BALL.len())];
        return if value.is_empty() { format!("🎱 {answer}") } else { format!("🎱 “{value}” — {answer}") };
    }
    if name == "choose" {
        let options: Vec<&str> = if value.contains('|') {
            value.split('|').collect()
        } else if value.contains(',') {
            value.split(',').collect()
        } else {
            let lower = value.to_lowercase();
            let mut parts = Vec::new();
            let mut start = 0;
            for (i, _) in lower.match_indices(" or ") {
                parts.push(&value[start..i]);
                start = i + 4;
            }
            parts.push(&value[start..]);
            parts
        };
        let options: Vec<&str> = options.into_iter().map(str::trim).filter(|o| !o.is_empty()).collect();
        if options.len() < 2 {
            return "Give me at least two things to choose from: /choose pizza, tacos, sushi".into();
        }
        return format!("🤔 I choose **{}**.", options[rng.random_range(0..options.len())]);
    }
    const RPS: [(&str, &str); 3] = [("rock", "🪨"), ("paper", "📄"), ("scissors", "✂️")];
    let (mine, mine_emoji) = RPS[rng.random_range(0..3)];
    let typed = value.trim().to_lowercase();
    let Some((theirs, theirs_emoji)) = RPS.iter().find(|(m, _)| !typed.is_empty() && m.starts_with(&typed)).copied() else {
        return format!("{mine_emoji} I throw {mine}. Your move next time: /rps rock, paper or scissors.");
    };
    let beats = |a: &str| match a {
        "rock" => "scissors",
        "paper" => "rock",
        _ => "paper",
    };
    let outcome = if theirs == mine { "It's a tie." } else if beats(theirs) == mine { "You win!" } else { "I win!" };
    format!("{theirs_emoji} {theirs} vs {mine_emoji} {mine}: {outcome}")
}

/// commandArgsHint: "<a|b>" for subcommands, else "<required> [optional]".
fn args_hint(options: Option<&Value>) -> Option<String> {
    let list = options?.as_array().filter(|l| !l.is_empty())?;
    let name = |o: &Value| o.get("name").and_then(Value::as_str).unwrap_or("").to_string();
    let subs: Vec<String> = list.iter().filter(|o| matches!(o.get("type").and_then(Value::as_i64), Some(1 | 2))).map(name).collect();
    if !subs.is_empty() {
        return Some(format!("<{}>", subs.join("|")));
    }
    Some(
        list.iter()
            .map(|o| if o.get("required").and_then(Value::as_bool).unwrap_or(false) { format!("<{}>", name(o)) } else { format!("[{}]", name(o)) })
            .collect::<Vec<_>>()
            .join(" "),
    )
}

/// formatClientDateTime for the replies that say when.
fn when(iso: &str) -> String {
    crate::model::parse_time(iso)
        .map(|at| at.with_timezone(&chrono::Local).format("%b %-d, %Y, %-I:%M %p").to_string())
        .unwrap_or_else(|| iso.to_string())
}

fn error_text(e: &anyhow::Error, fallback: &str) -> String {
    let text = e.to_string();
    if text.is_empty() { fallback.to_string() } else { text }
}

impl Shell {
    /// The modules whose commands are left out here (activeDisabledModules).
    pub(super) fn disabled_command_modules(&self) -> HashSet<String> {
        let mut out: HashSet<String> = self.me.disabled_modules.iter().cloned().collect();
        if let Some(server) = self.server().filter(|_| !self.home) {
            out.extend(server.disabled_modules.iter().cloned());
            if server.music_bot == Some(false) {
                out.insert("music-bot".into());
            }
        }
        if !self.me.is_admin {
            out.insert("discord-music".into());
        }
        out
    }

    /// Bot commands are per server: the menu reloads them for the channel (/api/commands).
    pub(super) fn load_bot_commands(&mut self, cx: &mut Context<Self>) {
        self.bot_commands.clear();
        let Some(channel) = self.channel_id.clone() else { return };
        let asked = channel.clone();
        self.command_call(cx, move |c| c.settings_get(&format!("/api/commands?channelId={channel}")), move |this, r, _| {
            if this.channel_id.as_deref() != Some(asked.as_str()) {
                return;
            }
            let list = r.ok().and_then(|v| v.get("commands").and_then(Value::as_array).cloned()).unwrap_or_default();
            this.bot_commands = list
                .iter()
                .filter_map(|c| {
                    let name = c.get("name")?.as_str()?.to_string();
                    let description = c.get("description").and_then(Value::as_str).filter(|d| !d.is_empty()).unwrap_or("From a connected bot").to_string();
                    Some(SlashCommand { name, args: args_hint(c.get("options")), description, group: "Bots".into(), voice: false })
                })
                .collect();
        });
    }

    /// The composer's / menu: what the first word matches, while the box is one line with no space.
    pub(super) fn slash_matches(&self, text: &str) -> Vec<SlashCommand> {
        if !text.starts_with('/') || text.contains('\n') {
            return Vec::new();
        }
        let first = text.split_whitespace().next().unwrap_or("/");
        match_commands(first, &self.bot_commands, &self.disabled_command_modules()).into_iter().filter(|c| c.name != "record" || self.features_record).collect()
    }

    pub(super) fn slash_active(&self, text: &str) -> bool {
        text.starts_with('/') && !text.contains(' ') && !text.contains('\n') && !self.slash_matches(text).is_empty()
    }

    /// After every change to the box: the menu's keys, and its highlight back at the top.
    pub(super) fn on_composer_changed(&mut self, cx: &mut Context<Self>) {
        let text = self.composer.read(cx).value();
        let active = self.slash_active(&text);
        self.slash_index = 0;
        self.composer.update(cx, |c, _| c.set_intercept(active));
        cx.notify();
    }

    pub(super) fn slash_move(&mut self, by: i32, cx: &mut Context<Self>) {
        let text = self.composer.read(cx).value();
        let n = self.slash_matches(&text).len() as i32;
        if n > 0 {
            self.slash_index = ((self.slash_index as i32 + by).rem_euclid(n)) as usize;
            // scrollIntoView({ block: "nearest" }): one block per command in the list.
            self.slash_scroll.scroll_to_item(self.slash_index);
            cx.notify();
        }
    }

    /// pickCommand: runs at once when it takes nothing and its full name was typed (or it was
    /// clicked); otherwise fills the box with it, and a space when it takes arguments.
    pub(super) fn pick_command(&mut self, index: usize, from_keyboard: bool, cx: &mut Context<Self>) {
        let text = self.composer.read(cx).value();
        let Some(command) = self.slash_matches(&text).into_iter().nth(index) else { return };
        let typed_fully = text.trim().to_lowercase() == format!("/{}", command.name);
        if command.args.is_none() && (!from_keyboard || typed_fully) {
            self.composer.update(cx, |c, cx| c.clear(cx));
            self.on_composer_changed(cx);
            self.run_command(format!("/{}", command.name), cx);
            return;
        }
        let fill = if command.args.is_some() { format!("/{} ", command.name) } else { format!("/{}", command.name) };
        self.composer.update(cx, |c, cx| c.set_value(fill, cx));
        self.on_composer_changed(cx);
    }

    /// A call to the server off the main thread; `done` gets the answer back on it.
    fn command_call(
        &self,
        cx: &mut Context<Self>,
        call: impl FnOnce(&crate::api::Client) -> anyhow::Result<Value> + Send + 'static,
        done: impl FnOnce(&mut Self, anyhow::Result<Value>, &mut Context<Self>) + 'static,
    ) {
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { call(&client) }).await;
            this.update(cx, |this, cx| {
                done(this, result, cx);
                cx.notify();
            })
            .ok();
        })
        .detach();
    }

    /// postBotMessage: a reply from a bot in this channel; the first one after a command carries
    /// who ran what.
    pub(super) fn post_bot_message(&mut self, text: impl Into<String>, options: Value, cx: &mut Context<Self>) {
        let Some(channel) = self.channel_id.clone() else { return };
        let invocation = self.pending_command.take();
        let mut body = json!({
            "channelId": channel,
            "content": text.into(),
            "asBot": true,
            "botName": options.get("author").and_then(Value::as_str).unwrap_or("Music + Watch"),
            "botAvatar": options.get("avatar").and_then(Value::as_str).unwrap_or("♫"),
        });
        for key in ["link", "actionLabel", "kind", "payload"] {
            if let Some(v) = options.get(key).filter(|v| !v.is_null()) {
                body[key] = v.clone();
            }
        }
        if let Some((text, by)) = invocation {
            body["commandText"] = json!(text);
            body["commandBy"] = json!(by);
        }
        self.command_call(cx, move |c| c.settings_post("/api/messages", body), |_, _, _| {});
    }

    /// An alert with one button (setDialogOptions type "alert").
    fn alert(&mut self, title: impl Into<String>, text: impl Into<String>, ok: &str, cx: &mut Context<Self>) {
        self.confirm = Some(Confirm { title: title.into(), text: text.into(), ok: ok.into(), cancel: String::new(), action: ConfirmAction::Alert });
        cx.notify();
    }

    /// The voice room music commands aim at: yours, else one that is playing, else the first.
    fn music_room(&self) -> Option<String> {
        if let Some(call) = &self.call {
            return Some(call.channel_id.clone());
        }
        let server = self.server()?;
        let voice: Vec<&crate::model::Channel> = server.channels.iter().filter(|c| c.is_voice()).collect();
        voice
            .iter()
            .find(|c| self.players.get(&c.id).and_then(|p| p.get("track")).is_some_and(|t| !t.is_null()))
            .or(voice.first())
            .map(|c| c.id.clone())
    }

    /// A slash command from the Living Room (its dice tray, spells): run in the call's room.
    pub(super) fn run_command_in_call(&mut self, raw: String, cx: &mut Context<Self>) {
        let Some(room) = self.call.as_ref().map(|c| c.channel_id.clone()) else { return };
        let was = self.channel_id.replace(room);
        self.run_command(raw, cx);
        self.channel_id = was;
    }

    /// runCommand.
    pub(super) fn run_command(&mut self, raw: String, cx: &mut Context<Self>) {
        let raw = raw.trim().to_string();
        let mut words = raw.split_whitespace();
        let bare = words.next().unwrap_or("").trim_start_matches('/').to_lowercase();
        let value = words.collect::<Vec<_>>().join(" ");
        let name = DATA.aliases.get(&bare).cloned().unwrap_or_else(|| bare.clone());
        let channel = self.channel_id.clone();
        self.pending_command = Some((raw.chars().take(200).collect(), self.me.name().to_string()));
        let voice_room = self.call.as_ref().map(|c| c.channel_id.clone());
        let notice = |this: &mut Self, text: String, cx: &mut Context<Self>| this.set_notice(text, cx);

        match name.as_str() {
            "w" => {
                let Some(channel) = channel else { return };
                match self.parse_whisper(&value) {
                    Ok((ids, text)) => {
                        let id = random_id();
                        self.hub.send(json!({ "t": "text-whisper", "channelId": channel, "toUserIds": ids, "text": text, "id": id }));
                    }
                    Err(e) => self.set_notice(e, cx),
                }
                return;
            }
            "markdown" => {
                self.set_notice("Markdown enabled! Use ```cpp for code blocks, **bold**, *italic*.", cx);
                return;
            }
            "game" => {
                self.set_notice("Games are not in this app yet. Open Hoffle in your browser to play.", cx);
                return;
            }
            "purge" => {
                self.pending_command = None;
                let Some(channel) = channel.filter(|_| !self.home) else {
                    self.set_notice("You can only purge messages in a server channel.", cx);
                    return;
                };
                let Some(count) = value.trim().parse::<i64>().ok().filter(|n| (1..=100).contains(n)) else {
                    self.set_notice("Try: /purge 25 (deletes between 1 and 100 recent messages)", cx);
                    return;
                };
                self.command_call(cx, move |c| c.settings_post("/api/messages/purge", json!({ "channelId": channel, "count": count })), |this, r, cx| match r {
                    Ok(v) => {
                        let n = v.get("deleted").and_then(Value::as_i64).unwrap_or(0);
                        this.set_notice(format!("Purged {n} message{}.", if n == 1 { "" } else { "s" }), cx);
                    }
                    Err(e) => this.set_notice(error_text(&e, "Could not purge messages."), cx),
                });
                return;
            }
            "poll" => {
                let mut parts = value.split('|').map(str::trim);
                let question = parts.next().unwrap_or("").to_string();
                let options: Vec<String> = parts.filter(|p| !p.is_empty()).map(str::to_string).collect();
                if question.is_empty() || options.len() < 2 {
                    self.set_notice("Try: /poll Pizza or burger? | Pizza | Burger", cx);
                    return;
                }
                self.command_call(cx, move |c| c.settings_post("/api/polls", json!({ "channelId": channel, "question": question, "options": options })), |this, r, cx| {
                    if let Err(e) = r {
                        this.set_notice(error_text(&e, "Could not create the poll."), cx);
                    }
                });
                return;
            }
            _ => {}
        }

        let gm_fallback = name == "ask_gm";
        if name == "ask" || gm_fallback {
            self.pending_command = None;
            if value.is_empty() {
                self.set_notice("Try: /ask how do spell slots work? (start with web: to force a web search)", cx);
                return;
            }
            let Some(channel) = channel else { return };
            self.set_notice("✦ Hoffle AI is thinking…", cx);
            let question = if gm_fallback { format!("noweb: As a D&D 5e Game Master: {value}") } else { value };
            self.command_call(cx, move |c| c.settings_post("/api/ai/ask", json!({ "channelId": channel, "question": question })), |this, r, cx| match r {
                Ok(_) => {
                    this.notice = None;
                }
                Err(e) => this.set_notice(error_text(&e, "The AI did not answer."), cx),
            });
            return;
        }
        if matches!(name.as_str(), "summarize" | "catchup" | "tldr") {
            self.pending_command = None;
            let Some(channel) = channel else { return };
            self.set_notice("✦ Reading the channel…", cx);
            self.command_call(cx, move |c| c.settings_post("/api/ai/summarize", json!({ "channelId": channel })), |this, r, cx| match r {
                Ok(v) => {
                    this.notice = None;
                    let count = v.get("count").and_then(Value::as_i64).unwrap_or(0);
                    let summary = v.get("summary").and_then(Value::as_str).unwrap_or("").to_string();
                    this.alert(format!("Catch-up · last {count} messages"), summary, "Got it", cx);
                }
                Err(e) => this.set_notice(error_text(&e, "The summary did not come back."), cx),
            });
            return;
        }
        let offset = -(chrono::Local::now().offset().local_minus_utc() / 60);
        if name == "remind" {
            self.pending_command = None;
            self.command_call(cx, move |c| c.settings_post("/api/reminders", json!({ "spec": value, "channelId": channel, "timezoneOffset": offset })), |this, r, cx| match r {
                Ok(v) => this.set_notice(format!("⏰ Reminder set for {}.", when(v.get("dueAt").and_then(Value::as_str).unwrap_or(""))), cx),
                Err(e) => this.set_notice(error_text(&e, "Try: /remind 20m take the pizza out"), cx),
            });
            return;
        }
        if name == "recap" {
            self.pending_command = None;
            let lower = value.trim().to_lowercase();
            let first = lower.split_whitespace().next().unwrap_or("");
            if matches!(first, "start" | "stop" | "end") {
                let start = first == "start";
                self.command_call(
                    cx,
                    move |c| c.settings_post("/api/recap", json!({ "channelId": channel, "voiceChannelId": voice_room, "action": if start { "start" } else { "stop" } })),
                    move |this, r, cx| match r {
                        Ok(_) => this.set_notice(
                            if start {
                                "📜 Session notes on. Captions people share in the call are kept, and the recap lands here when you /recap stop or everyone leaves."
                            } else {
                                "📜 Session notes stopped; the recap is on its way."
                            },
                            cx,
                        ),
                        Err(e) => this.set_notice(error_text(&e, "Session notes did not start."), cx),
                    },
                );
                return;
            }
            let weekly = first == "weekly";
            self.command_call(
                cx,
                move |c| c.settings_post("/api/recap", json!({ "channelId": channel, "action": if weekly { "weekly" } else { "now" } })),
                move |this, r, cx| match r {
                    Ok(v) => {
                        if weekly {
                            if v.get("weekly").and_then(Value::as_bool).unwrap_or(false) {
                                let next = when(v.get("nextAt").and_then(Value::as_str).unwrap_or(""));
                                this.set_notice(format!("📊 Weekly recap on: next one {next} in this channel. /recap weekly again turns it off."), cx);
                            } else {
                                this.set_notice("📊 Weekly recap turned off.", cx);
                            }
                        } else if !v.get("posted").and_then(Value::as_bool).unwrap_or(false) {
                            this.set_notice("Nothing to recap: no messages here in the last week.", cx);
                        }
                    }
                    Err(e) => this.set_notice(error_text(&e, "The recap did not work."), cx),
                },
            );
            return;
        }
        if name == "schedule" {
            self.pending_command = None;
            // Everything after "/schedule ", line breaks kept.
            let spec = raw.split_once(char::is_whitespace).map(|(_, rest)| rest.trim_start_matches([' ', '\t']).to_string()).unwrap_or_default();
            let lower = spec.to_lowercase();
            if spec.is_empty() || lower.starts_with("list") || lower.starts_with("cancel") {
                let cancel = lower.strip_prefix("cancel").and_then(|r| r.trim().split_whitespace().next()?.parse::<usize>().ok());
                self.command_call(cx, |c| c.settings_get("/api/scheduled"), move |this, r, cx| {
                    let list = match r {
                        Ok(v) => v.get("scheduled").and_then(Value::as_array).cloned().unwrap_or_default(),
                        Err(e) => return this.set_notice(error_text(&e, "Try: /schedule 20:00 Doors are open!"), cx),
                    };
                    if let Some(n) = cancel {
                        let Some(item) = n.checked_sub(1).and_then(|i| list.get(i)).cloned() else {
                            return this.set_notice("There is no scheduled message with that number. /schedule lists them.", cx);
                        };
                        let id = item.get("id").and_then(Value::as_str).unwrap_or("").to_string();
                        let text: String = item.get("text").and_then(Value::as_str).unwrap_or("").chars().take(60).collect();
                        this.command_call(
                            cx,
                            // Ids are UUIDs: nothing in them needs escaping.
                            move |c| c.settings_delete(&format!("/api/scheduled?id={id}"), Value::Null),
                            move |this, r, cx| match r {
                                Ok(_) => this.set_notice(format!("Cancelled: “{text}”"), cx),
                                Err(e) => this.set_notice(error_text(&e, "Try: /schedule 20:00 Doors are open!"), cx),
                            },
                        );
                        return;
                    }
                    let message = if list.is_empty() {
                        "Nothing scheduled. Try /schedule 20:00 Doors are open!".to_string()
                    } else {
                        let lines: Vec<String> = list
                            .iter()
                            .enumerate()
                            .map(|(i, item)| {
                                let due = when(item.get("dueAt").and_then(Value::as_str).unwrap_or(""));
                                let channel = item.get("channelName").and_then(Value::as_str).unwrap_or("?");
                                let text: String = item.get("text").and_then(Value::as_str).unwrap_or("").chars().take(120).collect();
                                format!("{}. {due} · #{channel}\n   {text}", i + 1)
                            })
                            .collect();
                        format!("{}\n\nCancel one with /schedule cancel <number>.", lines.join("\n\n"))
                    };
                    this.alert("Scheduled messages", message, "OK", cx);
                });
                return;
            }
            self.command_call(cx, move |c| c.settings_post("/api/scheduled", json!({ "spec": spec, "channelId": channel, "timezoneOffset": offset })), |this, r, cx| match r {
                Ok(v) => this.set_notice(format!("🕒 Scheduled for {}. /schedule lists or cancels it.", when(v.get("dueAt").and_then(Value::as_str).unwrap_or(""))), cx),
                Err(e) => this.set_notice(error_text(&e, "Try: /schedule 20:00 Doors are open!"), cx),
            });
            return;
        }
        if name == "record" {
            if !self.features_record {
                return notice(self, "Session recording is disabled on this Hoffle.".into(), cx);
            }
            if voice_room.is_none() {
                return notice(self, "Join the voice room you want to record first.".into(), cx);
            }
            return notice(self, "Recording is not in this app yet. Open Hoffle in your browser to record.".into(), cx);
        }
        let server_has_music = self.server().is_none_or(|s| s.music_bot != Some(false));
        if DATA.music.contains(&name) && (server_has_music || DATA.player.contains(&name)) {
            if DATA.voice_required_music.contains(&name) && voice_room.is_none() {
                return notice(self, format!("Join a voice channel first to use /{name}. Room info, settings, stats and Wrapped work from anywhere."), cx);
            }
            let Some(room) = self.music_room() else {
                return notice(self, "This server does not have a voice room yet.".into(), cx);
            };
            let body = json!({
                "command": format!("/{name} {value}").trim().to_string(),
                "voiceChannelId": room,
                "textChannelId": channel,
                "commandText": raw.chars().take(200).collect::<String>(),
                "commandBy": self.me.name(),
            });
            self.pending_command = None;
            self.command_call(cx, move |c| c.settings_post("/api/music/command", body), |this, r, cx| {
                if let Err(e) = r {
                    this.set_notice(error_text(&e, "That music command failed."), cx);
                }
            });
            return;
        }
        if name == "join" && voice_room.is_some() {
            self.post_bot_message("I'll hop into this voice room as soon as something plays. Use `/play <song>` or play a playlist from `/web`.", json!({}), cx);
            return;
        }
        if DATA.discord_only.contains(&name) {
            if !self.me.is_admin {
                return notice(self, "Only Hoffle admins can control the Discord music bot.".into(), cx);
            }
            let command = format!("/{name} {value}").trim().to_string();
            self.command_call(cx, move |c| c.settings_post("/api/integrations/musicwatch/command", json!({ "command": command })), |this, r, cx| {
                let text = match r {
                    Ok(v) => v.get("text").and_then(Value::as_str).unwrap_or("Done on Discord.").to_string(),
                    Err(e) => error_text(&e, "The Discord music bot could not do that."),
                };
                this.post_bot_message(text, json!({}), cx);
            });
            return;
        }
        if name == "watch" || name == "reels" {
            if voice_room.is_none() {
                self.post_bot_message("Join a Hoffle voice room first so everyone there gets the same activity.", json!({}), cx);
            } else {
                self.set_notice("Watch Together and Reels are not in this app yet. Open Hoffle in your browser for them.", cx);
            }
            return;
        }
        if name == "player" {
            return notice(self, "The music player is not in this app yet. Open Hoffle in your browser for it.".into(), cx);
        }
        if name == "web" || name == "dj" {
            self.open_music_dashboard(name == "dj", cx);
            return;
        }
        if DATA.roll.contains(&name) {
            let bot = if ["v", "vroll", "vtm", "gmv", "rouse"].contains(&name.as_str()) { json!({ "author": "Storyteller", "avatar": "🩸" }) } else { json!({ "author": "D&D Bot", "avatar": "⚔" }) };
            // runRollCommand: your dice from Settings → Dice & Tabletop (Solid Colour takes the theme's own).
            let dice = super::settings_dice::load_dice();
            let mut body = json!({
                "command": raw,
                "theme": super::settings_dice::inherit_dice_style(&dice.theme, &crate::theme::active_theme()),
                "themeColor": dice.color,
                "channelId": voice_room,
                "textChannelId": channel,
            });
            if dice.material != "auto" {
                body["material"] = json!(dice.material);
            }
            if dice.texture != "auto" {
                body["texture"] = json!(dice.texture);
            }
            self.command_call(cx, move |c| c.settings_post("/api/integrations/dnd/roll", body), move |this, r, cx| match r {
                Ok(v) => {
                    if let Some(error) = v.get("error").and_then(Value::as_str) {
                        return this.post_bot_message(error.to_string(), bot, cx);
                    }
                    // A /gmroll: this computer keeps the real card, for the roller's own copy.
                    if let (Some(seed), Some(card)) = (v.pointer("/roll/animationSeed").and_then(Value::as_str), v.get("secretCard").filter(|c| c.is_object())) {
                        super::dnd_rolls::remember_secret_roll(seed, card);
                    }
                    // Your own roll tumbles here at once (the hub's copy has the same seed).
                    if let Some(roll) = v.get("roll").filter(|r| r.is_object()).cloned() {
                        this.show_dice_roll(None, &roll, cx);
                    }
                    if v.get("posted").and_then(Value::as_bool).unwrap_or(false) {
                        this.pending_command = None;
                        return;
                    }
                    let mut options = v.get("bot").cloned().filter(|b| b.is_object()).unwrap_or(bot);
                    options["kind"] = v.get("kind").cloned().unwrap_or(Value::Null);
                    options["payload"] = v.get("payload").cloned().unwrap_or(Value::Null);
                    let text = v.get("text").and_then(Value::as_str).unwrap_or("The roll succeeded.").to_string();
                    this.post_bot_message(text, options, cx);
                }
                Err(e) => this.post_bot_message(error_text(&e, "The roll failed."), bot, cx),
            });
            return;
        }
        if DATA.lookup.contains(&name) {
            if value.is_empty() {
                return notice(self, format!("Try `/{name} {}`.", if name == "spell" { "fireball" } else { "goblin" }), cx);
            }
            let body = json!({ "kind": name, "query": value, "channelId": channel });
            self.command_call(cx, move |c| c.settings_post("/api/integrations/dnd/lookup", body), |this, r, cx| match r {
                Ok(v) => {
                    let link = v.get("link").cloned().unwrap_or(Value::Null);
                    let options = json!({
                        "author": "D&D Bot", "avatar": "⚔", "link": link,
                        "actionLabel": if link.is_null() { Value::Null } else { json!("Open on 5e.tools") },
                        "kind": v.get("kind").cloned().unwrap_or(Value::Null), "payload": v.get("payload").cloned().unwrap_or(Value::Null),
                    });
                    this.post_bot_message(v.get("text").and_then(Value::as_str).unwrap_or("").to_string(), options, cx);
                }
                Err(e) => this.post_bot_message(error_text(&e, "That lookup failed."), json!({ "author": "D&D Bot", "avatar": "⚔" }), cx),
            });
            return;
        }
        if DATA.dnd_link.contains(&name) {
            // A connected D&D bot does these for real; else the companion's link.
            self.run_bot_command(bare.clone(), value.clone(), Some(Box::new(|this: &mut Self, cx: &mut Context<Self>| {
                this.post_bot_message(
                    "Character sheets, inventory and the GM panel live in the D&D companion — open it in your browser.",
                    json!({ "author": "D&D Bot", "avatar": "⚔" }),
                    cx,
                );
            })), cx);
            return;
        }
        if name == "flip" || name == "coinflip" {
            let heads = random_below(2) == 0;
            self.post_bot_message(if heads { "Heads." } else { "Tails." }, json!({}), cx);
            return;
        }
        if DATA.fun.contains(&name) {
            self.post_bot_message(fun_reply(&name, &value), json!({}), cx);
            return;
        }
        if name == "shrug" {
            self.pending_command = None;
            self.composer.update(cx, |c, cx| c.set_value("¯\\_(ツ)_/¯", cx));
            self.send_composer(cx);
            return;
        }
        if DATA.speech.contains(&name) {
            return notice(self, "Text-to-speech is not in this app yet.".into(), cx);
        }
        if name == "help" {
            self.post_bot_message(
                "Type / in the box to see every command with its arguments. Music commands need you to be in a voice channel; a few still run on Discord and say so.",
                json!({}),
                cx,
            );
            return;
        }
        // Last: a command a connected bot registered.
        let unknown = bare.clone();
        self.run_bot_command(bare, value, Some(Box::new(move |this: &mut Self, cx: &mut Context<Self>| {
            this.set_notice(format!("I don't know /{unknown}. Type / to see what I do know."), cx);
        })), cx);
    }

    /// runBotSlashCommand: a bot-registered command; `otherwise` runs when no connected bot owns it.
    #[allow(clippy::type_complexity)]
    fn run_bot_command(&mut self, bare: String, value: String, otherwise: Option<Box<dyn FnOnce(&mut Self, &mut Context<Self>)>>, cx: &mut Context<Self>) {
        let Some(channel) = self.channel_id.clone() else {
            if let Some(f) = otherwise {
                f(self, cx);
            }
            return;
        };
        let name = bare.clone();
        self.command_call(cx, move |c| c.settings_post("/api/commands", json!({ "channelId": channel, "name": name, "args": value })), move |this, r, cx| {
            if let Ok(v) = r {
                if v.get("ok").and_then(Value::as_bool).unwrap_or(false) {
                    return;
                }
                match v.get("reason").and_then(Value::as_str) {
                    Some("usage") => {
                        let text = v.get("message").and_then(Value::as_str).map(str::to_string).unwrap_or_else(|| format!("Check the arguments for /{bare}."));
                        return this.set_notice(text, cx);
                    }
                    Some("offline") => return this.set_notice(format!("The bot that owns /{bare} is not connected right now."), cx),
                    _ => {}
                }
            }
            if let Some(f) = otherwise {
                f(this, cx);
            }
        });
    }

    /// openMusicDashboard: the bot's web page for this voice room, opened in the browser.
    pub(super) fn open_music_dashboard(&mut self, dj: bool, cx: &mut Context<Self>) {
        let label = if dj { "DJ booth" } else { "music dashboard" };
        let Some(room) = self.music_room() else {
            self.set_notice("This server does not have a voice room yet.", cx);
            return;
        };
        let body = if dj { json!({ "voiceChannelId": room, "page": "dj" }) } else { json!({ "voiceChannelId": room }) };
        self.command_call(cx, move |c| c.settings_post("/api/integrations/musicwatch/web-link", body), move |this, r, cx| match r {
            Ok(v) => {
                this.pending_command = None;
                if let Some(url) = v.get("url").and_then(Value::as_str) {
                    cx.open_url(url);
                }
            }
            Err(e) => this.set_notice(format!("Couldn't open the {label}: {e}"), cx),
        });
    }

    /// parseWhisper: "/w name message" or "/w sam,kit message", up to 8 people.
    fn parse_whisper(&self, args: &str) -> Result<(Vec<String>, String), String> {
        const USAGE: &str = "Use `/w name message`, or `/w sam,kit message` for a few people.";
        let words: Vec<&str> = args.split_whitespace().collect();
        let mut names: Vec<String> = Vec::new();
        let mut at = 0;
        while at < words.len() {
            let word = words[at];
            if at > 0 && !word.starts_with('@') && !words[at - 1].ends_with(',') && !word.starts_with(',') {
                break;
            }
            names.extend(word.split(',').map(|p| p.trim_start_matches('@').to_lowercase()).filter(|p| !p.is_empty()));
            at += 1;
        }
        let text = words[at..].join(" ");
        if names.is_empty() || text.is_empty() {
            return Err(USAGE.into());
        }
        let people: Vec<&crate::model::Member> = self
            .server_id
            .as_ref()
            .and_then(|s| self.members.get(s))
            .map(|m| m.iter().filter(|p| p.id != self.me.id).collect())
            .unwrap_or_default();
        let key = |v: &str| v.to_lowercase().split_whitespace().collect::<String>();
        let mut chosen: Vec<String> = Vec::new();
        for name in &names {
            let exact: Vec<&&crate::model::Member> = people.iter().filter(|p| p.username.to_lowercase() == *name || key(p.name()) == *name).collect();
            let pool: Vec<&&crate::model::Member> = if exact.is_empty() {
                people.iter().filter(|p| p.username.to_lowercase().starts_with(name.as_str()) || key(p.name()).starts_with(name.as_str())).collect()
            } else {
                exact
            };
            if pool.len() > 1 {
                return Err(format!("More than one person matches \"{name}\". Use their username."));
            }
            let Some(person) = pool.first() else { return Err(format!("Nobody called \"{name}\" here.")) };
            if !chosen.contains(&person.id) {
                chosen.push(person.id.clone());
            }
        }
        if chosen.len() > 8 {
            return Err("A whisper reaches at most 8 people.".into());
        }
        Ok((chosen, text))
    }

    /// The `.active-command-helper` over the box ("/play <song name or URL> — …") and the
    /// `.slash-menu` list, grouped, the highlighted row lit.
    pub(super) fn render_slash(&self, cx: &mut Context<Self>) -> Vec<gpui::AnyElement> {
        let text = self.composer.read(cx).value();
        let mut out = Vec::new();
        if !text.starts_with('/') {
            return out;
        }
        if let Some(command) = find_command(&text).filter(|c| c.name != "record" || self.features_record) {
            out.push(
                div()
                    .flex_none()
                    .mb(px(6.))
                    .px(px(14.))
                    .py(px(8.))
                    .rounded(px(8.))
                    .bg(rgb(0x1e1f22))
                    .border_1()
                    .border_color(gpui::rgba(0x5865f266))
                    .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.2), offset: gpui::point(px(0.), px(4.)), blur_radius: px(12.), spread_radius: px(0.) }])
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .text_size(px(13.))
                    .line_height(px(19.5))
                    .child(div().font_weight(FontWeight::BOLD).text_color(rgb(0x5865f2)).child(format!("/{}", command.name)))
                    .children(command.args.clone().map(|args| div().px(px(6.)).py(px(1.)).rounded(px(4.)).bg(gpui::rgba(0xffffff14)).italic().text_color(rgb(0xa3a6aa)).child(args)))
                    .child(div().text_color(rgb(0x949ba4)).child(format!("— {}", command.description)))
                    .into_any_element(),
            );
        }
        if !self.slash_active(&text) {
            return out;
        }
        let matches = self.slash_matches(&text);
        let in_voice = self.call.is_some();
        let lavender: Hsla = Theme::lavender().into();
        let mut list = div()
            .id("slash-menu")
            .flex_none()
            .max_h(px(320.))
            .mb(px(8.))
            .p(px(6.))
            .rounded(px(16.))
            .bg(rgb(0x202129))
            .border_1()
            .border_color(rgb(0x41434f))
            .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.35), offset: gpui::point(px(0.), px(24.)), blur_radius: px(60.), spread_radius: px(0.) }])
            .overflow_y_scroll()
            .track_scroll(&self.slash_scroll)
            .flex()
            .flex_col();
        let groups = |g: &str| match g {
            "Music" => t("commands.group.music"),
            "Discord music" => t("commands.group.discordMusic"),
            "Rooms" => t("commands.group.rooms"),
            "D&D" => t("commands.group.dnd"),
            "Hoffle" => t("commands.group.huddle"),
            "Bots" => t("commands.group.bots"),
            other => other.to_string(),
        };
        let mut last = String::new();
        for (index, command) in matches.iter().enumerate() {
            let mut block = div().flex_none().flex().flex_col();
            if command.group != last {
                last = command.group.clone();
                block = block.child(
                    div()
                        .pt(px(10.))
                        .px(px(12.))
                        .pb(px(4.))
                        .text_size(px(11.))
                        .line_height(px(16.5))
                        .font_weight(FontWeight::EXTRA_BOLD)
                        .text_color(Theme::muted())
                        .child(groups(&command.group).to_uppercase()),
                );
            }
            let active = index == self.slash_index;
            block = block.child(
                div()
                    .id(SharedString::from(format!("slash-{}", command.name)))
                    .px(px(12.))
                    .py(px(8.))
                    .rounded(px(10.))
                    .when(active, |d| d.bg(lavender.opacity(0.24)))
                    .flex()
                    .items_baseline()
                    .gap(px(10.))
                    .cursor_pointer()
                    .child(
                        div()
                            .flex_none()
                            .flex()
                            .items_baseline()
                            .text_size(px(16.))
                            .line_height(px(24.))
                            .font_weight(FontWeight::BOLD)
                            .text_color(gpui::white())
                            .child(format!("/{}", command.name))
                            .children(command.args.clone().map(|args| div().ml(px(6.)).text_size(px(12.)).line_height(px(18.)).text_color(lavender).child(args))),
                    )
                    .child(div().flex_1().min_w_0().text_size(px(13.)).line_height(px(19.5)).text_color(rgb(0xaaaeba)).child(description(command)))
                    .when(command.voice && !in_voice, |d| d.child(div().flex_none().text_size(px(11.)).line_height(px(16.5)).text_color(rgb(0xf2a37c)).child(t("commands.needsVoice"))))
                    .on_hover(cx.listener(move |this, hovered: &bool, _, cx| {
                        if *hovered && this.slash_index != index {
                            this.slash_index = index;
                            cx.notify();
                        }
                    }))
                    .on_mouse_down(gpui::MouseButton::Left, cx.listener(move |this, _, _, cx| {
                        cx.stop_propagation();
                        this.pick_command(index, false, cx);
                    })),
            );
            list = list.child(block);
        }
        out.push(list.into_any_element());
        out
    }
}

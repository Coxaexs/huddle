//! A forum channel's board (components/forum-board.tsx): each top-level message is a post card whose
//! replies live in the thread it opens. Tag filters, tags for the next post, the tag list editor for
//! people who manage the channel, and retagging a post.

use gpui::{AnyElement, AppContext as _, Context, Entity, FontWeight, Hsla, SharedString, Window, div, prelude::*, px, rgb};
use serde_json::{Value, json};

use super::Shell;
use crate::input::{Look, TextInput};
use crate::model::Message;
use crate::theme::Theme;
use crate::ui;

/// lib/forum-tags.ts limits.
const MAX_FORUM_TAGS: usize = 20;
const MAX_POST_TAGS: usize = 5;
const TAG_NAME_MAX: usize = 20;

#[derive(Default)]
pub(super) struct ForumState {
    /// The board's tag filter (any of them).
    pub(super) filter: Vec<String>,
    /// Tags picked for the next post, by channel.
    pub(super) draft: Option<(String, Vec<String>)>,
    /// The tag list being edited.
    editing_list: Option<Vec<TagRow>>,
    /// A post being retagged, and its picks.
    pub(super) editing_post: Option<(String, Vec<String>)>,
    saving: bool,
    error: String,
}

struct TagRow {
    id: String,
    emoji: Entity<TextInput>,
    name: Entity<TextInput>,
    moderated: bool,
}

/// postHeading(): the first line as the heading, the rest as the excerpt.
fn post_heading(post: &Message) -> (String, String) {
    let trim = |value: &str, limit: usize| {
        let collapsed = value.split_whitespace().collect::<Vec<_>>().join(" ");
        if collapsed.chars().count() > limit { format!("{}…", collapsed.chars().take(limit - 1).collect::<String>()) } else { collapsed }
    };
    let mut lines = post.text.split('\n');
    let first = lines.next().unwrap_or_default();
    if !first.trim().is_empty() {
        return (trim(first, 90), trim(&lines.collect::<Vec<_>>().join(" "), 160));
    }
    if let Some(file) = post.files.first() {
        return (file.name.clone(), "Shared a document".into());
    }
    if let Some(kind) = post.kind.as_ref().filter(|k| !k.is_empty()) {
        return (kind.clone(), "Rich post".into());
    }
    if post.image.is_some() || !post.images.is_empty() {
        return ("Image".into(), String::new());
    }
    ("Post".into(), String::new())
}

/// postDate(): "Oct 23".
fn post_date(created_at: &str) -> String {
    crate::model::parse_time(created_at).map(|d| d.with_timezone(&chrono::Local).format("%b %-d").to_string()).unwrap_or_default()
}

fn tag_label(tag: &Value) -> String {
    let name = tag["name"].as_str().unwrap_or_default();
    match tag["emoji"].as_str().filter(|e| !e.is_empty()) {
        Some(emoji) => format!("{emoji} {name}"),
        None => name.to_string(),
    }
}

fn post_tags(post: &Message) -> Vec<String> {
    post.payload.as_ref().and_then(|p| p["forumTags"].as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect()).unwrap_or_default()
}

/// `.forum-tag`: a pill; pressed ones are filled with the accent.
fn tag_pill(id: impl Into<SharedString>, label: String, on: bool, enabled: bool) -> gpui::Stateful<gpui::Div> {
    let lavender: Hsla = Theme::lavender().into();
    div()
        .id(id.into())
        .flex()
        .items_center()
        .gap(px(4.))
        .px(px(9.))
        .py(px(2.))
        .rounded_full()
        .border_1()
        .border_color(if on { lavender } else { Theme::line().into() })
        .bg(if on { lavender } else { Theme::panel().into() })
        .text_size(px(12.))
        .line_height(px(18.))
        .font_weight(FontWeight::BOLD)
        .text_color(if on { rgb(0x15121f).into() } else { Hsla::from(Theme::ink()) })
        .when(!enabled, |d| d.opacity(0.45))
        .when(enabled, |d| d.cursor_pointer().hover(move |s| s.border_color(lavender)))
        .child(label)
}

/// `.forum-edit-tags` / `.forum-tag-clear`: a quiet text button.
fn quiet_button(id: impl Into<SharedString>) -> gpui::Stateful<gpui::Div> {
    let ink: Hsla = Theme::ink().into();
    div()
        .id(id.into())
        .flex()
        .items_center()
        .gap(px(4.))
        .px(px(6.))
        .py(px(4.))
        .rounded(px(7.))
        .text_size(px(12.))
        .line_height(px(18.))
        .font_weight(FontWeight::BOLD)
        .text_color(Theme::muted())
        .cursor_pointer()
        .hover(move |s| s.text_color(ink).bg(Theme::panel()))
}

/// `.forum-new-post`.
fn accent_button(id: impl Into<SharedString>) -> gpui::Stateful<gpui::Div> {
    div()
        .id(id.into())
        .flex_none()
        .flex()
        .items_center()
        .gap(px(5.))
        .px(px(12.))
        .py(px(7.))
        .rounded(px(9.))
        .bg(Theme::lavender())
        .text_size(px(13.))
        .line_height(px(19.5))
        .font_weight(FontWeight::BOLD)
        .text_color(rgb(0x15121f))
        .cursor_pointer()
}

impl Shell {
    pub(super) fn is_forum(&self) -> bool {
        !self.home && self.channel().is_some_and(|c| c.kind == "forum")
    }

    fn forum_tags(&self) -> Vec<Value> {
        self.channel().map(|c| c.forum_tags.clone()).unwrap_or_default()
    }

    /// The tags the next post in this channel will wear.
    pub(super) fn forum_draft_tags(&self) -> Vec<String> {
        let channel = self.channel_id.clone().unwrap_or_default();
        let known: Vec<String> = self.forum_tags().iter().filter_map(|t| t["id"].as_str().map(String::from)).collect();
        self.forum.draft.as_ref().filter(|(c, _)| *c == channel).map(|(_, ids)| ids.iter().filter(|id| known.contains(id)).cloned().collect()).unwrap_or_default()
    }

    fn start_tag_list(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let rows = self.forum_tags().iter().map(|t| self.tag_row(t["id"].as_str().unwrap_or_default().to_string(), t["emoji"].as_str().unwrap_or_default(), t["name"].as_str().unwrap_or_default(), t["moderated"] == true, cx)).collect();
        self.forum.editing_list = Some(rows);
        self.forum.error.clear();
        let _ = window;
        cx.notify();
    }

    fn tag_row(&self, id: String, emoji: &str, name: &str, moderated: bool, cx: &mut Context<Self>) -> TagRow {
        let look = || Look { size: 13., line_height: 19.5, height: 19.5, color: Theme::ink().into(), placeholder: Hsla::from(Theme::ink()).opacity(0.5) };
        let (emoji, name) = (emoji.to_string(), name.chars().take(TAG_NAME_MAX).collect::<String>());
        let e = cx.new(|cx| {
            let mut i = TextInput::new("🏷️", cx).look(look()).centered();
            i.set_text(emoji, cx);
            i
        });
        let n = cx.new(|cx| {
            let mut i = TextInput::new("Tag name", cx).look(look());
            i.set_text(name, cx);
            i
        });
        TagRow { id, emoji: e, name: n, moderated }
    }

    fn save_tag_list(&mut self, cx: &mut Context<Self>) {
        let Some(rows) = self.forum.editing_list.as_ref() else { return };
        let Some(channel) = self.channel_id.clone() else { return };
        let tags: Vec<Value> = rows
            .iter()
            .filter_map(|r| {
                let name: String = r.name.read(cx).text().trim().chars().take(TAG_NAME_MAX).collect();
                (!name.is_empty()).then(|| {
                    let emoji = r.emoji.read(cx).text().trim().to_string();
                    let mut tag = json!({ "id": r.id, "name": name, "moderated": r.moderated });
                    if !emoji.is_empty() {
                        tag["emoji"] = json!(emoji);
                    }
                    tag
                })
            })
            .collect();
        self.forum.saving = true;
        self.forum.error.clear();
        let client = self.client.clone();
        let path = format!("/api/channels/{}", url::form_urlencoded::byte_serialize(channel.as_bytes()).collect::<String>());
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.settings_patch(&path, json!({ "forumTags": tags })) }).await;
            this.update(cx, |this, cx| {
                this.forum.saving = false;
                match result {
                    Ok(_) => {
                        this.forum.editing_list = None;
                        this.load_servers(cx);
                    }
                    Err(e) => this.forum.error = if e.to_string().is_empty() { "Could not save the tags.".into() } else { e.to_string() },
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    fn save_post_tags(&mut self, cx: &mut Context<Self>) {
        let Some((post, ids)) = self.forum.editing_post.clone() else { return };
        self.forum.saving = true;
        let client = self.client.clone();
        let path = format!("/api/messages/{}", url::form_urlencoded::byte_serialize(post.as_bytes()).collect::<String>());
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.settings_patch(&path, json!({ "tags": ids })) }).await;
            this.update(cx, |this, cx| {
                this.forum.saving = false;
                this.forum.editing_post = None;
                if let Err(e) = result {
                    this.status = Some(if e.to_string().is_empty() { "Could not change the tags.".to_string() } else { e.to_string() }.into());
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    /// ForumBoard.
    pub(super) fn render_forum_board(&self, window: &Window, cx: &mut Context<Self>) -> AnyElement {
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let lavender: Hsla = Theme::lavender().into();
        let channel = self.channel().cloned().unwrap_or_default();
        let tags = channel.forum_tags.clone();
        let tag_by_id = |id: &str| tags.iter().find(|t| t["id"] == id).cloned();
        let can_manage = self.has_permission(1 << 1);
        let can_moderate = can_manage || self.has_permission(crate::model::permission::MANAGE_MESSAGES);
        let can_post = !(channel.kind == "announcement" && !can_manage);
        let mut every: Vec<Message> = self.channel_id.as_ref().and_then(|c| self.messages.get(c)).cloned().unwrap_or_default().into_iter().filter(|m| !m.kind.as_deref().unwrap_or_default().starts_with("system-")).collect();
        every.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        let known = |id: &String| tags.iter().any(|t| t["id"] == id.as_str());
        let filter: Vec<String> = self.forum.filter.iter().filter(|id| known(id)).cloned().collect();
        let posts: Vec<&Message> = if filter.is_empty() { every.iter().collect() } else { every.iter().filter(|p| post_tags(p).iter().any(|id| filter.contains(id))).collect() };
        let draft = self.forum_draft_tags();
        let editing_list = self.forum.editing_list.is_some();

        let count = format!(
            "{}{} {} · each one opens its own thread",
            if filter.is_empty() { String::new() } else { format!("{} of ", posts.len()) },
            every.len(),
            if every.len() == 1 { "post" } else { "posts" }
        );
        let mut actions = div().flex().flex_none().items_center().gap(px(6.));
        if can_manage && !editing_list {
            actions = actions.child(quiet_button("forum-edit-tags").child(ui::icon("tag", 13., muted)).child(if tags.is_empty() { "Add tags" } else { "Edit tags" }).on_click(cx.listener(|this, _, window, cx| this.start_tag_list(window, cx))));
        }
        if can_post {
            actions = actions.child(accent_button("forum-new-post").child(ui::icon("plus", 14., rgb(0x15121f))).child("New post").on_click(cx.listener(|this, _, window, cx| {
                window.focus(&gpui::Focusable::focus_handle(this.composer.read(cx), cx));
            })));
        }
        let mut board = div()
            .id("forum-board")
            .flex_1()
            .min_h_0()
            .overflow_y_scroll()
            .px(px(20.))
            .pt(px(18.))
            .pb(px(8.))
            .flex()
            .flex_col()
            .child(
                div()
                    .flex_none()
                    .mb(px(16.))
                    .flex()
                    .items_start()
                    .justify_between()
                    .gap(px(12.))
                    .child(
                        div()
                            .min_w_0()
                            .child(div().flex().items_center().gap(px(7.)).text_size(px(17.)).line_height(px(25.5)).font_weight(FontWeight::BOLD).text_color(ink).child(ui::icon("message-square", 15., ink)).child(channel.name.clone()))
                            .child(div().mt(px(3.)).text_size(px(12.)).line_height(px(18.)).text_color(muted).child(count)),
                    )
                    .child(actions),
            );

        if let Some(rows) = self.forum.editing_list.as_ref() {
            let mut list = div().flex().flex_col().gap(px(6.));
            for (n, row) in rows.iter().enumerate() {
                let moderated = row.moderated;
                let field = |input: &Entity<TextInput>| div().h(px(32.)).px(px(8.)).rounded(px(8.)).bg(Theme::paper()).border_1().border_color(Theme::line()).flex().items_center().child(div().flex_1().min_w_0().child(input.clone()));
                list = list.child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(6.))
                        .child(field(&row.emoji).w(px(48.)).flex_none())
                        .child(field(&row.name).flex_1().min_w_0())
                        .child(
                            div()
                                .id(SharedString::from(format!("tag-mod-{n}")))
                                .flex()
                                .items_center()
                                .gap(px(6.))
                                .text_size(px(12.))
                                .text_color(muted)
                                .cursor_pointer()
                                .child(div().size(px(13.)).rounded(px(2.)).when(moderated, |d| d.bg(lavender).flex().items_center().justify_center().child(ui::icon("check", 10., rgb(0x15121f)))).when(!moderated, |d| d.bg(rgb(0x3b3b3b)).border_1().border_color(rgb(0x858585))))
                                .child("Moderated")
                                .on_click(cx.listener(move |this, _, _, cx| {
                                    if let Some(row) = this.forum.editing_list.as_mut().and_then(|r| r.get_mut(n)) {
                                        row.moderated = !row.moderated;
                                    }
                                    cx.notify();
                                })),
                        )
                        .child(quiet_button(SharedString::from(format!("tag-rm-{n}"))).child(ui::icon("x", 14., muted)).on_click(cx.listener(move |this, _, _, cx| {
                            if let Some(rows) = this.forum.editing_list.as_mut()
                                && n < rows.len()
                            {
                                rows.remove(n);
                            }
                            cx.notify();
                        }))),
                );
            }
            let full = rows.len() >= MAX_FORUM_TAGS;
            board = board.child(
                div()
                    .flex_none()
                    .mb(px(14.))
                    .p(px(12.))
                    .rounded(px(12.))
                    .bg(Theme::panel())
                    .border_1()
                    .border_color(Theme::line())
                    .flex()
                    .flex_col()
                    .gap(px(8.))
                    .child(div().text_size(px(12.)).line_height(px(18.)).text_color(muted).child(format!("Up to {MAX_FORUM_TAGS} tags; a post can wear {MAX_POST_TAGS}. Moderated tags can only be put on or taken off by moderators.")))
                    .when(!rows.is_empty(), |d| d.child(list))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(6.))
                            .child(quiet_button("tag-add").when(full, |d| d.opacity(0.45)).child(ui::icon("plus", 13., muted)).child("Add tag").when(!full, |d| {
                                d.on_click(cx.listener(|this, _, _, cx| {
                                    let id = format!("new{}{}", chrono::Utc::now().timestamp_millis(), this.forum.editing_list.as_ref().map_or(0, |r| r.len()));
                                    let row = this.tag_row(id, "", "", false, cx);
                                    if let Some(rows) = this.forum.editing_list.as_mut() {
                                        rows.push(row);
                                    }
                                    cx.notify();
                                }))
                            }))
                            .child(div().flex_1())
                            .child(quiet_button("tag-cancel").child("Cancel").on_click(cx.listener(|this, _, _, cx| {
                                this.forum.editing_list = None;
                                cx.notify();
                            })))
                            .child(accent_button("tag-save").child(if self.forum.saving { "Saving…" } else { "Save tags" }).on_click(cx.listener(|this, _, _, cx| this.save_tag_list(cx)))),
                    )
                    .when(!self.forum.error.is_empty(), |d| d.child(div().text_size(px(12.)).text_color(Theme::coral()).child(self.forum.error.clone()))),
            );
        }

        if !editing_list && !tags.is_empty() {
            let mut bar = div().flex_none().mb(px(12.)).flex().flex_wrap().items_center().gap(px(6.));
            for tag in &tags {
                let id = tag["id"].as_str().unwrap_or_default().to_string();
                let on = filter.contains(&id);
                bar = bar.child(tag_pill(SharedString::from(format!("ftag-{id}")), tag_label(tag), on, true).on_click(cx.listener(move |this, _, _, cx| {
                    if on {
                        this.forum.filter.retain(|f| *f != id);
                    } else {
                        this.forum.filter.push(id.clone());
                    }
                    cx.notify();
                })));
            }
            if !filter.is_empty() {
                bar = bar.child(quiet_button("ftag-clear").child("Show all").on_click(cx.listener(|this, _, _, cx| {
                    this.forum.filter.clear();
                    cx.notify();
                })));
            }
            board = board.child(bar);
        }
        let pickable: Vec<&Value> = tags.iter().filter(|t| can_moderate || t["moderated"] != true).collect();
        if !editing_list && can_post && !pickable.is_empty() {
            let mut bar = div().flex_none().mb(px(12.)).flex().flex_wrap().items_center().gap(px(6.)).child(div().mr(px(2.)).text_size(px(12.)).font_weight(FontWeight::BOLD).text_color(muted).child("Your next post:"));
            for tag in pickable {
                let id = tag["id"].as_str().unwrap_or_default().to_string();
                let on = draft.contains(&id);
                let enabled = on || draft.len() < MAX_POST_TAGS;
                let current = draft.clone();
                bar = bar.child(tag_pill(SharedString::from(format!("fdraft-{id}")), tag_label(tag), on, enabled).when(enabled, |d| {
                    d.on_click(cx.listener(move |this, _, _, cx| {
                        let Some(channel) = this.channel_id.clone() else { return };
                        let mut next = current.clone();
                        if on {
                            next.retain(|x| *x != id);
                        } else {
                            next.push(id.clone());
                        }
                        this.forum.draft = Some((channel, next));
                        cx.notify();
                    }))
                }));
            }
            board = board.child(bar);
        }

        if posts.is_empty() {
            let (title, text) = if filter.is_empty() {
                ("No posts yet", if can_post { "Write the first one below. Every post here starts its own thread, so replies stay together." } else { "Nothing has been posted here yet." })
            } else {
                ("No posts with these tags", "Pick other tags, or show all posts.")
            };
            board = board.child(
                div()
                    .flex()
                    .flex_col()
                    .items_center()
                    .gap(px(6.))
                    .py(px(48.))
                    .text_color(muted)
                    .child(ui::icon("message-square", 26., muted))
                    .child(div().text_size(px(15.)).font_weight(FontWeight::BOLD).text_color(ink).child(title))
                    .child(div().text_size(px(13.)).text_center().child(text)),
            );
            return board.into_any_element();
        }

        // repeat(auto-fill, minmax(260px, 1fr)), gap 12.
        let width = f32::from(self.chat_panel_width(window)) - 2. - 40.;
        let cols = ((width + 12.) / 272.).floor().max(1.) as usize;
        let card_w = (width - 12. * (cols as f32 - 1.)) / cols as f32;
        let mut grid = div().flex().flex_col().gap(px(12.));
        for row in posts.chunks(cols) {
            let mut line = div().flex().gap(px(12.));
            for post in row {
                let (title, excerpt) = post_heading(post);
                let replies = post.thread_count.unwrap_or(0);
                let wearing: Vec<Value> = post_tags(post).iter().filter_map(|id| tag_by_id(id)).collect();
                let may_retag = !tags.is_empty() && (can_moderate || post.user_id.as_deref() == Some(self.me.id.as_str()));
                let picture = post.avatar_url.as_ref().map(|u| self.client.absolute(u));
                let root = (*post).clone();
                let mut card = div()
                    .id(SharedString::from(format!("forum-card-{}", post.id)))
                    .flex_1()
                    .p(px(11.))
                    .rounded(px(12.))
                    .bg(Theme::paper())
                    .border_1()
                    .border_color(Theme::line())
                    .hover(move |s| s.border_color(lavender))
                    .cursor_pointer()
                    .flex()
                    .flex_col();
                // The body grows to the row's height so the foot sits at the bottom (`margin-top: auto`),
                // and nothing in it shrinks.
                let mut body = div()
                    .flex_1()
                    .flex()
                    .flex_col()
                    .gap(px(7.))
                    .child(
                        div()
                            .flex_none()
                            .flex()
                            .items_center()
                            .gap(px(7.))
                            .text_size(px(12.))
                            .line_height(px(18.))
                            .text_color(muted)
                            .child(ui::avatar(picture, &post.avatar, &post.color, &post.author, 26.))
                            .child(div().min_w_0().overflow_hidden().whitespace_nowrap().text_ellipsis().font_weight(FontWeight::BOLD).text_color(ink).child(post.author.clone()))
                            .child(div().flex_1())
                            .child(div().flex_none().child(post_date(&post.created_at))),
                    )
                    .child(div().flex_none().text_size(px(14.)).line_height(px(21.)).font_weight(FontWeight::BOLD).text_color(ink).line_clamp(2).overflow_hidden().child(title.clone()));
                if !wearing.is_empty() {
                    let mut chips = div().flex_none().mt(px(2.)).mb(px(6.)).flex().flex_wrap().gap(px(4.));
                    for tag in &wearing {
                        chips = chips.child(div().px(px(6.)).py(px(1.)).rounded_full().border_1().border_color(Theme::line()).bg(Theme::panel()).text_size(px(11.)).font_weight(FontWeight::BOLD).text_color(ink).child(tag_label(tag)));
                    }
                    body = body.child(chips);
                }
                if !excerpt.is_empty() {
                    body = body.child(div().flex_none().text_size(px(12.5)).line_height(px(18.125)).text_color(muted).line_clamp(3).overflow_hidden().child(excerpt));
                }
                if let Some(image) = post.image.as_ref().or(post.images.first()) {
                    body = body.child(div().flex_none().h(px(96.)).rounded(px(8.)).border_1().border_color(Theme::line()).overflow_hidden().child(gpui::img(super::links::proxied(&self.client.absolute(image))).size_full().object_fit(gpui::ObjectFit::Cover)));
                }
                let mut foot = div().flex_none().mt(px(7.)).pt(px(4.)).flex().items_center().gap(px(8.)).text_size(px(12.)).line_height(px(18.)).text_color(muted).child(
                    div().flex().items_center().gap(px(3.)).when(replies > 0, |d| d.text_color(lavender).font_weight(FontWeight::BOLD)).child(ui::icon("message-square", 13., if replies > 0 { lavender } else { muted })).child(replies.to_string()),
                );
                for reaction in post.reactions.iter().take(4) {
                    foot = foot.child(div().px(px(5.)).py(px(1.)).rounded(px(7.)).bg(Theme::lavender_soft()).child(format!("{} {}", reaction.emoji, reaction.count)));
                }
                card = card.child(body).child(foot).on_click(cx.listener(move |this, _, window, cx| this.open_thread(root.clone(), window, cx)));
                let pid = post.id.clone();
                let mut cell = div().w(px(card_w)).flex_none().flex().flex_col().child(card);
                let editing_this = self.forum.editing_post.as_ref().is_some_and(|(p, _)| *p == post.id);
                if may_retag && !editing_this {
                    let current = post_tags(post);
                    cell = cell.child(div().mt(px(4.)).flex().child(quiet_button(SharedString::from(format!("retag-{pid}"))).child(ui::icon("tag", 12., muted)).child("Tags").on_click(cx.listener(move |this, _, _, cx| {
                        this.forum.editing_post = Some((pid.clone(), current.clone()));
                        cx.notify();
                    }))));
                }
                if editing_this && let Some((_, picked)) = self.forum.editing_post.as_ref() {
                    let mut bar = div().flex().flex_wrap().gap(px(6.));
                    for tag in &tags {
                        let id = tag["id"].as_str().unwrap_or_default().to_string();
                        let on = picked.contains(&id);
                        let locked = tag["moderated"] == true && !can_moderate;
                        let enabled = !locked && (on || picked.len() < MAX_POST_TAGS);
                        bar = bar.child(tag_pill(SharedString::from(format!("pick-{id}")), tag_label(tag), on, enabled).when(enabled, |d| {
                            d.on_click(cx.listener(move |this, _, _, cx| {
                                if let Some((_, ids)) = this.forum.editing_post.as_mut() {
                                    if on {
                                        ids.retain(|x| *x != id);
                                    } else {
                                        ids.push(id.clone());
                                    }
                                }
                                cx.notify();
                            }))
                        }));
                    }
                    cell = cell.child(
                        div()
                            .mt(px(6.))
                            .p(px(12.))
                            .rounded(px(12.))
                            .bg(Theme::panel())
                            .border_1()
                            .border_color(Theme::line())
                            .flex()
                            .flex_col()
                            .gap(px(8.))
                            .child(bar)
                            .child(
                                div()
                                    .flex()
                                    .items_center()
                                    .gap(px(6.))
                                    .child(div().flex_1())
                                    .child(quiet_button("retag-cancel").child("Cancel").on_click(cx.listener(|this, _, _, cx| {
                                        this.forum.editing_post = None;
                                        cx.notify();
                                    })))
                                    .child(accent_button("retag-save").child(if self.forum.saving { "Saving…" } else { "Save" }).on_click(cx.listener(|this, _, _, cx| this.save_post_tags(cx)))),
                            ),
                    );
                }
                line = line.child(cell);
            }
            grid = grid.child(line);
        }
        board.child(grid).into_any_element()
    }
}

/// The payload a new post carries: the tags picked on the board.
pub(super) fn post_payload(tags: &[String]) -> Option<Value> {
    (!tags.is_empty()).then(|| json!({ "forumTags": tags }))
}

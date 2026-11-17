//! Server folders and arranging the rail (lib/server-folders.ts, rail.tsx RailFolder, menus.tsx
//! FolderMenuLayer, use-channel-server-actions.tsx): drag a server onto the middle of another to
//! make a folder (or into a folder), onto its top edge to move it there; a folder opens to show its
//! servers on a tinted strip, and its menu marks it read, renames it, colours it or ungroups it.
//! Folders are kept on the account (/api/servers/folders); which are open, on this computer.

use std::collections::HashSet;

use gpui::{AnyElement, Context, FontWeight, Hsla, SharedString, Window, div, prelude::*, px, rgb};
use serde::{Deserialize, Serialize};
use serde_json::json;

use super::Shell;
use crate::i18n::t;
use crate::model::Server;
use crate::theme::{Theme, mix};
use crate::ui;

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub(super) struct ServerFolder {
    pub id: String,
    pub name: String,
    pub color: String,
    pub server_ids: Vec<String>,
}

/// A server being dragged on the rail.
#[derive(Clone)]
pub(super) struct DraggedServer {
    pub id: String,
    pub face: Option<String>,
    pub label: String,
    pub color: Hsla,
}

impl gpui::Render for DraggedServer {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        div()
            .size(px(44.))
            .rounded(px(16.))
            .bg(self.color)
            .opacity(0.85)
            .flex()
            .items_center()
            .justify_center()
            .overflow_hidden()
            .text_size(px(15.))
            .font_weight(FontWeight::EXTRA_BOLD)
            .text_color(Theme::ink())
            .child(match &self.face {
                Some(url) => gpui::img(crate::ui::square(url.clone())).size(px(42.)).rounded(px(14.)).object_fit(gpui::ObjectFit::Cover).into_any_element(),
                None => self.label.clone().into_any_element(),
            })
    }
}

/// railEntries(): loose servers and folders, in server order; a folder left with one server shows
/// as that server.
pub(super) enum RailEntry<'a> {
    Server(&'a Server),
    Folder(ServerFolder, Vec<&'a Server>),
}

pub(super) fn rail_entries<'a>(servers: &'a [Server], folders: &[ServerFolder]) -> Vec<RailEntry<'a>> {
    let folder_of = |id: &str| folders.iter().find(|f| f.server_ids.iter().any(|s| s == id));
    let mut placed = HashSet::new();
    let mut out = Vec::new();
    for server in servers {
        let Some(folder) = folder_of(&server.id) else {
            out.push(RailEntry::Server(server));
            continue;
        };
        if !placed.insert(folder.id.clone()) {
            continue;
        }
        let inside: Vec<&Server> = servers.iter().filter(|s| folder_of(&s.id).is_some_and(|f| f.id == folder.id)).collect();
        if inside.len() == 1 {
            out.push(RailEntry::Server(inside[0]));
        } else {
            out.push(RailEntry::Folder(folder.clone(), inside));
        }
    }
    out
}

fn remove_from_folders(folders: &[ServerFolder], server: &str) -> Vec<ServerFolder> {
    folders
        .iter()
        .map(|f| ServerFolder { server_ids: f.server_ids.iter().filter(|s| *s != server).cloned().collect(), ..f.clone() })
        .filter(|f| !f.server_ids.is_empty())
        .collect()
}

fn move_to_folder(folders: &[ServerFolder], server: &str, folder: &str) -> Vec<ServerFolder> {
    remove_from_folders(folders, server)
        .into_iter()
        .map(|mut f| {
            if f.id == folder {
                f.server_ids.push(server.to_string());
            }
            f
        })
        .collect()
}

fn create_folder(folders: &[ServerFolder], target: &str, dragged: &str) -> Vec<ServerFolder> {
    let mut rest = remove_from_folders(&remove_from_folders(folders, target), dragged);
    rest.push(ServerFolder { id: super::commands::random_id(), name: String::new(), color: "#5865f2".into(), server_ids: vec![target.to_string(), dragged.to_string()] });
    rest
}

fn open_path() -> Option<std::path::PathBuf> {
    Some(dirs::config_dir()?.join("Hoffle Lite").join("open-folders.json"))
}

/// `huddle:open-folders`: the folders you left open, on this computer.
pub(super) fn load_open() -> HashSet<String> {
    // HOFFLE_DEV_FOLDERS_OPEN=<folder id> (tests): that folder open, the saved ones left alone.
    if let Ok(id) = std::env::var("HOFFLE_DEV_FOLDERS_OPEN") {
        return HashSet::from([id]);
    }
    open_path().and_then(|p| std::fs::read(p).ok()).and_then(|b| serde_json::from_slice::<Vec<String>>(&b).ok()).unwrap_or_default().into_iter().collect()
}

/// A drop target's hint: a line above it, or a ring to merge into it.
#[derive(Clone, PartialEq)]
pub(super) struct DropHint {
    pub id: String,
    pub merge: bool,
}

const FOLDER_COLOURS: [u32; 8] = [0x5865f2, 0x3ba55c, 0xfaa61a, 0xed4245, 0xeb459e, 0x9b59b6, 0x1abc9c, 0x747f8d];

impl Shell {
    pub(super) fn load_server_folders(&mut self, cx: &mut Context<Self>) {
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.get_value("/api/servers/folders") }).await;
            this.update(cx, |this, cx| {
                if let Ok(value) = result {
                    this.server_folders = serde_json::from_value(value["folders"].clone()).unwrap_or_default();
                    cx.notify();
                }
            })
            .ok();
        })
        .detach();
    }

    /// saveServerFolders(): shown at once, then PUT; on failure the account's folders again.
    fn save_server_folders(&mut self, next: Vec<ServerFolder>, cx: &mut Context<Self>) {
        self.server_folders = next.clone();
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.settings_put("/api/servers/folders", json!({ "folders": next })) }).await;
            if let Err(e) = result {
                this.update(cx, |this, cx| {
                    this.set_notice(e.to_string(), cx);
                    this.load_server_folders(cx);
                })
                .ok();
            }
        })
        .detach();
        cx.notify();
    }

    pub(super) fn toggle_folder_open(&mut self, id: &str, cx: &mut Context<Self>) {
        if !self.open_folders.remove(id) {
            self.open_folders.insert(id.to_string());
        }
        if let Some(path) = open_path() {
            let _ = std::fs::create_dir_all(path.parent().unwrap_or(&path));
            let list: Vec<&String> = self.open_folders.iter().collect();
            let _ = std::fs::write(path, serde_json::to_vec(&list).unwrap_or_default());
        }
        cx.notify();
    }

    pub(super) fn folder_id_of(&self, server: &str) -> Option<String> {
        self.server_folders.iter().find(|f| f.server_ids.iter().any(|s| s == server)).map(|f| f.id.clone())
    }

    /// The rail menu's "Remove from folder".
    pub(super) fn remove_server_from_folder(&mut self, server: &str, cx: &mut Context<Self>) {
        let next = remove_from_folders(&self.server_folders, server);
        self.save_server_folders(next, cx);
    }

    /// markAllRead(): every unread channel, servers and DMs alike.
    pub(super) fn mark_everything_read(&mut self, cx: &mut Context<Self>) {
        let ids: Vec<String> = self.reads.iter().filter(|(_, r)| r.unread || r.count > 0).map(|(id, _)| id.clone()).collect();
        if ids.is_empty() {
            return;
        }
        self.reads.clear();
        let client = self.client.clone();
        cx.background_executor()
            .spawn(async move {
                for chunk in ids.chunks(500) {
                    let _ = client.mark_read_many(chunk);
                }
            })
            .detach();
        cx.notify();
    }

    /// While a server is dragged over another: top quarter (or bottom) moves it before, the middle
    /// half merges (onDragOver).
    pub(super) fn server_drag_move(&mut self, target: &str, event: &gpui::DragMoveEvent<DraggedServer>, cx: &mut Context<Self>) {
        let dragged = event.drag(cx).id.clone();
        let b = event.bounds;
        let p = event.event.position;
        let inside = b.contains(&p);
        let hint = (inside && dragged != target).then(|| {
            let y = (f32::from(p.y) - f32::from(b.origin.y)) / f32::from(b.size.height).max(1.);
            DropHint { id: target.to_string(), merge: y > 0.25 && y < 0.75 }
        });
        let current = self.server_drop_hint.as_ref().filter(|h| h.id == target).cloned();
        if hint != current && (hint.is_some() || current.is_some()) {
            self.server_drop_hint = hint.or_else(|| self.server_drop_hint.clone().filter(|h| h.id != target));
            cx.notify();
        }
    }

    /// Over a folder: always a merge.
    pub(super) fn folder_drag_move(&mut self, folder: &ServerFolder, event: &gpui::DragMoveEvent<DraggedServer>, cx: &mut Context<Self>) {
        let dragged = event.drag(cx).id.clone();
        let inside = event.bounds.contains(&event.event.position) && !folder.server_ids.contains(&dragged);
        let current = self.server_drop_hint.as_ref().is_some_and(|h| h.id == folder.id);
        if inside != current {
            self.server_drop_hint = if inside { Some(DropHint { id: folder.id.clone(), merge: true }) } else { self.server_drop_hint.clone().filter(|h| h.id != folder.id) };
            cx.notify();
        }
    }

    /// onDrop on a server: merged into its folder (or a new one), or moved before it.
    pub(super) fn drop_server_on(&mut self, dragged: String, target: String, cx: &mut Context<Self>) {
        let merge = self.server_drop_hint.as_ref().is_some_and(|h| h.id == target && h.merge);
        self.server_drop_hint = None;
        if dragged == target {
            return;
        }
        let target_folder = self.folder_id_of(&target);
        if merge {
            let next = match &target_folder {
                Some(folder) => move_to_folder(&self.server_folders, &dragged, folder),
                None => create_folder(&self.server_folders, &target, &dragged),
            };
            self.save_server_folders(next, cx);
            if let Some(folder) = target_folder
                && !self.open_folders.contains(&folder)
            {
                self.toggle_folder_open(&folder, cx);
            }
            return;
        }
        if target_folder != self.folder_id_of(&dragged) {
            let next = match &target_folder {
                Some(folder) => move_to_folder(&self.server_folders, &dragged, folder),
                None => remove_from_folders(&self.server_folders, &dragged),
            };
            self.save_server_folders(next, cx);
        }
        self.reorder_servers(dragged, Some(target), cx);
    }

    pub(super) fn drop_server_on_folder(&mut self, dragged: String, folder: String, cx: &mut Context<Self>) {
        self.server_drop_hint = None;
        let next = move_to_folder(&self.server_folders, &dragged, &folder);
        self.save_server_folders(next, cx);
    }

    /// dropServer(): `dragged` before `before` (or last), every position renumbered.
    fn reorder_servers(&mut self, dragged: String, before: Option<String>, cx: &mut Context<Self>) {
        let Some(moved) = self.servers.iter().position(|s| s.id == dragged) else { return };
        let server = self.servers.remove(moved);
        let at = before.and_then(|b| self.servers.iter().position(|s| s.id == b)).unwrap_or(self.servers.len());
        self.servers.insert(at, server);
        let order: Vec<_> = self.servers.iter().enumerate().map(|(position, s)| json!({ "id": s.id, "position": position })).collect();
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.settings_post("/api/servers/reorder", json!({ "servers": order })) }).await;
            if let Err(e) = result {
                this.update(cx, |this, cx| this.set_notice(e.to_string(), cx)).ok();
            }
        })
        .detach();
        cx.notify();
    }

    /// RailFolder: closed, a 2×2 grid of its first four servers (active and unread pills, the
    /// mention total); open, the folder glyph on a tinted strip with its servers under it.
    pub(super) fn render_rail_folder(&self, folder: &ServerFolder, servers: &[&Server], drawn: Vec<AnyElement>, cx: &mut Context<Self>) -> AnyElement {
        let open = self.open_folders.contains(&folder.id);
        let color: Hsla = crate::theme::css_color(&folder.color).unwrap_or_else(|| rgb(0x5865f2).into());
        let active_id = if self.home { None } else { self.server_id.clone() };
        let contains_active = servers.iter().any(|s| Some(&s.id) == active_id.as_ref());
        let has_unread = servers.iter().any(|s| Some(&s.id) != active_id.as_ref() && s.channels.iter().any(|c| self.reads.get(&c.id).is_some_and(|r| r.unread)));
        let mentions: u32 = servers.iter().flat_map(|s| s.channels.iter()).map(|c| self.reads.get(&c.id).map_or(0, |r| r.mentions)).sum();
        let label = if folder.name.is_empty() { servers.iter().map(|s| s.name.as_str()).collect::<Vec<_>>().join(", ") } else { folder.name.clone() };
        let merge = self.server_drop_hint.as_ref().is_some_and(|h| h.id == folder.id && h.merge);
        let mut grid = div().flex().flex_wrap().w(px(35.)).gap(px(3.));
        for server in servers.iter().take(4) {
            let tint = crate::theme::css_color(&server.color).unwrap_or_else(|| Theme::lavender().into());
            grid = grid.child(
                div()
                    .size(px(16.))
                    .rounded_full()
                    .overflow_hidden()
                    .bg(tint)
                    .flex()
                    .items_center()
                    .justify_center()
                    .text_size(px(8.))
                    .font_weight(FontWeight::EXTRA_BOLD)
                    .text_color(gpui::white())
                    .child(match self.picture(&server.icon_url) {
                        Some(url) => gpui::img(crate::ui::square(url)).size(px(16.)).rounded_full().object_fit(gpui::ObjectFit::Cover).into_any_element(),
                        None => (if server.icon.trim().is_empty() { server.name.chars().next().map(|c| c.to_uppercase().to_string()).unwrap_or_default() } else { server.icon.clone() }).into_any_element(),
                    }),
            );
        }
        let (fid, fid2, f3) = (folder.id.clone(), folder.id.clone(), folder.clone());
        let mark = div()
            .id(SharedString::from(format!("folder-{}", folder.id)))
            .relative()
            .size(px(44.))
            .rounded(px(15.))
            .flex()
            .items_center()
            .justify_center()
            .cursor_pointer()
            .when(!open, |d| d.bg(mix(color, 0.3, rgb(0x2b2d31))))
            .hover(|s| s.rounded(px(12.)))
            .when(merge, |d| d.rounded(px(12.)).shadow(vec![gpui::BoxShadow { color: Theme::lavender().into(), offset: gpui::point(px(0.), px(0.)), blur_radius: px(0.), spread_radius: px(3.) }]))
            .tooltip(ui::tooltip(label))
            .child(if open { ui::icon("folder-filled", 20., color).into_any_element() } else { grid.into_any_element() })
            .when(!open && mentions > 0, |d| d.child(div().absolute().right(px(-2.)).bottom(px(-2.)).child(ui::rail_badge(mentions))))
            .on_click(cx.listener(move |this, _, _, cx| this.toggle_folder_open(&fid, cx)))
            .on_mouse_down(
                gpui::MouseButton::Right,
                cx.listener(move |this, e: &gpui::MouseDownEvent, _, cx| {
                    cx.stop_propagation();
                    this.folder_menu = Some((fid2.clone(), e.position));
                    cx.notify();
                }),
            )
            .on_drag_move::<DraggedServer>(cx.listener(move |this, e: &gpui::DragMoveEvent<DraggedServer>, _, cx| this.folder_drag_move(&f3, e, cx)))
            .on_drop({
                let id = folder.id.clone();
                cx.listener(move |this, d: &DraggedServer, _, cx| this.drop_server_on_folder(d.id.clone(), id.clone(), cx))
            });
        // `.rail-item` with its pill, unless open (then the servers carry their own).
        let item = div()
            .relative()
            .w(px(60.))
            .flex()
            .justify_center()
            .flex_none()
            .when(!open && (contains_active || has_unread), |d| {
                d.child(
                    div()
                        .absolute()
                        .left_0()
                        .top(px(if contains_active { 10. } else { 18. }))
                        .w(px(4.))
                        .h(px(if contains_active { 24. } else { 8. }))
                        .rounded_r(px(4.))
                        .bg(if contains_active { Theme::lavender() } else { Theme::ink() }),
                )
            })
            .child(mark);
        let mut column = div().relative().w(px(60.)).flex_none().flex().flex_col().items_center().gap(px(8.));
        if open {
            // `.rail-folder.is-open::before`: a 48px strip in the folder's colour, 18%.
            column = column.pb(px(6.)).child(div().absolute().top_0().bottom_0().left(px(6.)).w(px(48.)).rounded(px(16.)).bg(color.opacity(0.18)));
        }
        column = column.child(item);
        if open {
            column = column.children(drawn);
        }
        column.into_any_element()
    }

    /// FolderMenuLayer: name, Mark folder as read, Rename folder, Colour, Ungroup servers.
    pub(super) fn render_folder_menu(&self, window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let (id, at) = self.folder_menu.clone()?;
        let folder = self.server_folders.iter().find(|f| f.id == id)?.clone();
        let item = |key: &str, label: String| {
            div()
                .id(SharedString::from(format!("fm-{key}")))
                .p(px(8.))
                .rounded(px(8.))
                .text_size(px(13.))
                .line_height(px(19.5))
                .text_color(rgb(0xe6e7ee))
                .cursor_pointer()
                .hover(|s| s.bg(Hsla::from(Theme::lavender()).opacity(0.24)))
                .child(label)
        };
        let head = |content: AnyElement| div().mb(px(6.)).px(px(8.)).pt(px(6.)).pb(px(10.)).border_b_1().border_color(rgb(0x41434f)).child(content);
        let divider = || div().my(px(6.)).h(px(1.)).bg(rgb(0x41434f));
        let mut colours = div().flex().flex_wrap().gap(px(6.)).px(px(10.)).pt(px(4.)).pb(px(8.));
        for c in FOLDER_COLOURS {
            let hex = format!("#{c:06x}");
            let current = folder.color.eq_ignore_ascii_case(&hex);
            let fid = folder.id.clone();
            colours = colours.child(
                div()
                    .id(SharedString::from(format!("fm-colour-{c:06x}")))
                    .size(px(20.))
                    .rounded_full()
                    .bg(rgb(c))
                    .border_2()
                    .border_color(if current { gpui::white() } else { gpui::transparent_black() })
                    .cursor_pointer()
                    .on_click(cx.listener(move |this, _, _, cx| {
                        let next = this.server_folders.iter().map(|f| if f.id == fid { ServerFolder { color: hex.clone(), ..f.clone() } } else { f.clone() }).collect();
                        this.folder_menu = None;
                        this.save_server_folders(next, cx);
                    })),
            );
        }
        let (f1, f2, f3) = (folder.clone(), folder.clone(), folder.id.clone());
        let card = div()
            .flex()
            .flex_col()
            .child(head(div().text_size(px(16.)).line_height(px(24.)).font_weight(FontWeight::BOLD).child(if folder.name.is_empty() { t("folderMenu.defaultName") } else { folder.name.clone() }).into_any_element()))
            .child(item("read", t("folderMenu.markAsRead")).on_click(cx.listener(move |this, _, _, cx| {
                this.folder_menu = None;
                for id in &f1.server_ids {
                    this.mark_server_read_id(id, cx);
                }
            })))
            .child(item("rename", t("folderMenu.renameFolder")).on_click(cx.listener(move |this, _, window, cx| {
                this.folder_menu = None;
                this.open_prompt(
                    super::channel_tools::PromptKind::RenameFolder(f2.id.clone()),
                    t("folderMenu.folderNameTitle"),
                    t("folderMenu.folderNameHint"),
                    f2.name.clone(),
                    &t("folderMenu.folderNamePlaceholder"),
                    "Save",
                    Some(40),
                    window,
                    cx,
                );
            })))
            .child(divider())
            .child(head(div().text_size(px(12.)).text_color(Theme::muted()).child(t("folderMenu.colour")).into_any_element()))
            .child(colours)
            .child(divider())
            .child(item("ungroup", t("folderMenu.ungroup")).text_color(Theme::coral()).on_click(cx.listener(move |this, _, _, cx| {
                this.folder_menu = None;
                let next = this.server_folders.iter().filter(|f| f.id != f3).cloned().collect();
                this.save_server_folders(next, cx);
            })));
        let size = window.viewport_size();
        let left = f32::from(at.x).min(f32::from(size.width) - 240.);
        let top = f32::from(at.y).min(f32::from(size.height) - 260.);
        Some(
            div()
                .id("folder-menu")
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
                .on_mouse_down_out(cx.listener(move |this, _, _, cx| {
                    if this.folder_menu.as_ref().is_some_and(|(_, a)| *a == at) {
                        this.folder_menu = None;
                        cx.notify();
                    }
                }))
                .into_any_element(),
        )
    }

    /// The folder's new name from its prompt (empty: the servers' names).
    pub(super) fn save_folder_name(&mut self, id: String, value: String, cx: &mut Context<Self>) {
        let next = self.server_folders.iter().map(|f| if f.id == id { ServerFolder { name: value.trim().to_string(), ..f.clone() } } else { f.clone() }).collect();
        self.save_server_folders(next, cx);
    }
}

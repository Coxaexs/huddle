//! The far-left rail (app/components/chat/rail.tsx): Hoffle home with the DM badge, servers with
//! their active pill, unread pill, mention count and voice badge, add and explore, then up to four DMs.

use gpui::{AnyElement, Context, FontWeight, IntoElement, ObjectFit, SharedString, div, img, prelude::*, px, rgb};

use super::Shell;
use crate::i18n::t;
use crate::theme::{Theme, css_color};
use crate::ui::{self, icon, rail_badge};

/// Room left at the bottom for the user card, which overlaps the rail and the sidebar.
pub(super) const FOOTER_ROOM: f32 = 70.;

impl Shell {
    pub(super) fn render_rail(&self, cx: &mut Context<Self>) -> impl IntoElement {
        let dm_unread: u32 = self
            .dms
            .iter()
            .map(|d| self.reads.get(&d.channel_id).map_or(0, |r| r.count))
            .sum();

        let mut rail = div()
            .id("rail")
            .w(px(60.))
            .h_full()
            .flex_none()
            .flex()
            .flex_col()
            .items_center()
            .gap(px(13.))
            .pt(px(18.))
            .pb(px(FOOTER_ROOM))
            .bg(Theme::panel())
            .overflow_y_scroll();

        // Hoffle home (direct messages).
        let home = self.home;
        rail = rail.child(rail_item(
            home,
            false,
            div()
                .id("brand")
                .relative()
                .size(px(44.))
                .rounded(px(16.))
                .bg(Theme::lavender_soft())
                .border_1()
                .border_color(gpui::rgba(0xa78bfa4d))
                .flex()
                .items_center()
                .justify_center()
                .text_size(px(24.))
                .font_weight(FontWeight::EXTRA_BOLD)
                .text_color(Theme::lavender())
                .cursor_pointer()
                .hover(|s| s.bg(Theme::lavender_muted()))
                                .tooltip(ui::tooltip(t("rail.dms")))
                .on_click(cx.listener(|this, _, _, cx| this.open_home(cx)))
                .child("h")
                .when(dm_unread > 0 && !home, |d| d.child(div().absolute().right(px(-2.)).bottom(px(-2.)).child(rail_badge(dm_unread))))
                .into_any_element(),
        ));
        rail = rail.child(divider());

        for server in &self.servers {
            let active = !self.home && self.server_id.as_deref() == Some(&server.id);
            let unread = !active && server.channels.iter().any(|c| self.reads.get(&c.id).is_some_and(|r| r.unread));
            let mentions: u32 = server.channels.iter().map(|c| self.reads.get(&c.id).map_or(0, |r| r.mentions)).sum();
            let occupied: Vec<String> = server
                .channels
                .iter()
                .filter(|c| c.is_voice() && self.rooms.get(&c.id).is_some_and(|r| !r.is_empty()))
                .map(|c| {
                    let people: Vec<&str> = self.rooms[&c.id].iter().map(|p| p.name()).collect();
                    format!("🔊 {}: {}", c.name, people.join(", "))
                })
                .collect();
            let color = css_color(&server.color).unwrap_or(Theme::lavender().into());
            let id = server.id.clone();
            let face: AnyElement = match self.picture(&server.icon_url) {
                Some(url) => img(url).size(px(42.)).rounded(px(14.)).object_fit(ObjectFit::Cover).into_any_element(),
                None => div()
                    .text_size(px(15.))
                    .font_weight(FontWeight::EXTRA_BOLD)
                    .text_color(Theme::ink())
                    .child(if server.icon.trim().is_empty() { initials(&server.name) } else { server.icon.clone() })
                    .into_any_element(),
            };
            let title = if occupied.is_empty() { server.name.clone() } else { format!("{}\n{}", server.name, occupied.join("\n")) };
            let mark = div()
                .id(SharedString::from(format!("server-{}", server.id)))
                .relative()
                .size(px(44.))
                .rounded(px(16.))
                .border_1()
                .flex()
                .items_center()
                .justify_center()
                .cursor_pointer()
                .when(active, |d| d.bg(color).border_color(gpui::rgba(0xa78bfa73)))
                .when(!active, |d| d.bg(Theme::ink_faint()).border_color(gpui::transparent_black()).hover(|s| s.bg(Theme::lavender()).rounded(px(12.))))
                .tooltip(ui::tooltip(title))
                .child(face)
                .when(mentions > 0, |d| d.child(div().absolute().right(px(-2.)).bottom(px(-2.)).child(rail_badge(mentions))))
                .when(!occupied.is_empty(), |d| {
                    d.child(
                        div()
                            .absolute()
                            .left(px(-2.))
                            .top(px(28.))
                            .size(px(18.))
                            .rounded_full()
                            .bg(Theme::voice_badge())
                            .border_2()
                            .border_color(Theme::panel())
                            .flex()
                            .items_center()
                            .justify_center()
                            .child(icon("volume-2", 11., gpui::white())),
                    )
                })
                .on_click(cx.listener(move |this, _, _, cx| this.open_server(id.clone(), cx)));
            rail = rail.child(rail_item(active, unread, mark.into_any_element()));
        }

        rail = rail
            .child(rail_item(
                false,
                false,
                square_button("add-server", t("rail.createServer"))
                    .text_size(px(24.))
                    .font_weight(FontWeight::EXTRA_BOLD)
                    .text_color(Theme::muted())
                    .child("+")
                    .into_any_element(),
            ))
            .child(rail_item(
                false,
                false,
                square_button("explore", t("rail.explore"))
                    .child(icon("compass", 16., Theme::muted()))
                    .into_any_element(),
            ));

        let mut dms: Vec<_> = self.dms.iter().filter(|d| !d.hidden).collect();
        dms.sort_by(|a, b| b.pinned.cmp(&a.pinned).then(b.last_at.cmp(&a.last_at)));
        if !dms.is_empty() {
            rail = rail.child(divider());
        }
        for dm in dms.into_iter().take(4) {
            let count = self.reads.get(&dm.channel_id).map_or(0, |r| r.count);
            let status = self.presence_of(&dm.user.id);
            let in_call = self.rooms.get(&dm.channel_id).is_some_and(|r| !r.is_empty());
            let open = dm.channel_id.clone();
            let title = if count > 0 { format!("{} · {count} new", dm.user.name()) } else { dm.user.name().to_string() };
            rail = rail.child(rail_item(
                false,
                false,
                div()
                    .id(SharedString::from(format!("dm-{}", dm.channel_id)))
                    .relative()
                    .size(px(44.))
                    .cursor_pointer()
                    .tooltip(ui::tooltip(title))
                    .child(ui::avatar(self.picture(&dm.user.avatar_url), &dm.user.avatar, &dm.user.color, dm.user.name(), 44.))
                    .child(div().absolute().right_0().bottom_0().child(ui::rail_presence_dot(&status, 10., rgb(0x0f0d18))))
                    .when(in_call, |d| d.child(div().absolute().top_0().right_0().size(px(10.)).rounded_full().bg(Theme::mint())))
                    .when(count > 0, |d| d.child(div().absolute().right(px(-2.)).bottom(px(-2.)).child(rail_badge(count))))
                    .on_click(cx.listener(move |this, _, _, cx| this.open_dm(open.clone(), cx)))
                    .into_any_element(),
            ));
        }
        rail
    }

    /// "online", "idle", "dnd" or "offline", from the hub's presence and the member's chosen status.
    pub(super) fn presence_of(&self, user_id: &str) -> String {
        // Your own dot follows your own choice (presenceOf in use-shell-voice.ts); "online" until
        // the status picker is native.
        if user_id == self.me.id {
            return if self.connected { "online".into() } else { "offline".into() };
        }
        if !self.online.contains(user_id) {
            return "offline".into();
        }
        let chosen = self
            .members
            .values()
            .flat_map(|m| m.iter())
            .find(|m| m.id == user_id)
            .map(|m| m.status.clone())
            .unwrap_or_default();
        match chosen.as_str() {
            "idle" | "dnd" => chosen,
            "invisible" => "offline".into(),
            _ => "online".into(),
        }
    }
}

/// One rail slot: the 60px-wide row with the active pill (4×24) or the unread pill (4×8) at its edge.
fn rail_item(active: bool, unread: bool, child: AnyElement) -> impl IntoElement {
    div()
        .relative()
        .w(px(60.))
        .flex()
        .justify_center()
        .flex_none()
        .when(active || unread, |d| {
            d.child(
                div()
                    .absolute()
                    .left_0()
                    .top(px(if active { 10. } else { 18. }))
                    .w(px(4.))
                    .h(px(if active { 24. } else { 8. }))
                    .rounded_r(px(4.))
                    .bg(if active { Theme::lavender() } else { Theme::ink() }),
            )
        })
        .child(child)
}

fn divider() -> impl IntoElement {
    div().w(px(32.)).h(px(1.)).flex_none().bg(Theme::divider())
}

fn square_button(id: &'static str, title: String) -> gpui::Stateful<gpui::Div> {
    div()
        .id(id)
        .size(px(44.))
        .rounded(px(16.))
        .bg(Theme::ink_faint())
        .border_1()
        .border_color(gpui::transparent_black())
        .flex()
        .items_center()
        .justify_center()
        .cursor_pointer()
        .hover(|s| s.bg(Theme::lavender_soft()))
        .tooltip(ui::tooltip(title))
}

fn initials(name: &str) -> String {
    let letters: String = name.split_whitespace().filter_map(|w| w.chars().next()).take(2).collect::<String>().to_uppercase();
    if letters.is_empty() { "SV".into() } else { letters }
}

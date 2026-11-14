//! Settings in the Simple interface (app/components/settings/simple-home.tsx, easy.css): one page of
//! picture tiles instead of the sidebar; each tile opens the page it names, "Show everything" goes
//! back to the full interface.

use gpui::{AnyElement, Context, FontWeight, Hsla, Rgba, SharedString, Window, div, prelude::*, px, rgb};

use super::Shell;
use super::settings::{Settings, Tab};
use crate::i18n::{t, tv};
use crate::theme::Theme;
use crate::ui;

/// The looks offered on the page itself; the rest are under "More looks".
const QUICK_LOOKS: [&str; 4] = ["linen", "linen-dark", "cozy", "light"];

/// `.tone-*`: (background, icon) on light themes, then on cozy / legacy / dark ones.
fn tone(name: &str, dark: bool) -> (Rgba, Rgba) {
    let (light, night) = match name {
        "teal" => ((0xe1f5ee, 0x0f6e56), (0x085041, 0x9fe1cb)),
        "amber" => ((0xfaeeda, 0x854f0b), (0x633806, 0xfac775)),
        "blue" => ((0xe6f1fb, 0x185fa5), (0x0c447c, 0xb5d4f4)),
        "purple" => ((0xeeedfe, 0x534ab7), (0x3c3489, 0xcecbf6)),
        "green" => ((0xeaf3de, 0x3b6d11), (0x27500a, 0xc0dd97)),
        "coral" => ((0xfaece7, 0x993c1d), (0x712b13, 0xf5c4b3)),
        _ => ((0xfbeaf0, 0x993556), (0x72243e, 0xf4c0d1)),
    };
    let (bg, fg) = if dark { night } else { light };
    (rgb(bg), rgb(fg))
}

impl Shell {
    /// SimpleSettingsHome: Hoffy says hello, then the tiles, then Show everything and Log out.
    pub(super) fn render_simple_home(&self, _s: &Settings, width: f32, window: &mut Window, cx: &mut Context<Self>) -> AnyElement {
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let line: Hsla = Theme::line().into();
        let active = crate::theme::active_theme();
        let themes = crate::theme::all_themes();
        let base = themes.iter().find(|d| d.id == active).map(|d| if d.base_theme.is_empty() { d.id.clone() } else { d.base_theme.clone() }).unwrap_or_else(|| "cozy".into());
        let dark = matches!(base.as_str(), "cozy" | "legacy" | "dark");
        let tile_hover_border = crate::theme::mix(Theme::lavender(), 0.55, Theme::line());
        let tile_hover_bg = crate::theme::mix(Theme::lavender(), 0.06, Theme::panel());
        let tile = |id: String| {
            div()
                .id(SharedString::from(id))
                // Grid items stretch to their row's height.
                .flex_1()
                .flex()
                .flex_col()
                .items_start()
                .gap(px(6.))
                .min_h(px(140.))
                .p(px(16.))
                .rounded(px(14.))
                .border_1()
                .border_color(line)
                .bg(Theme::panel())
                .text_color(ink)
        };
        let art = |icon: &'static str, tone_name: &str| {
            let (bg, fg) = tone(tone_name, dark);
            div().flex_none().size(px(52.)).rounded(px(16.)).bg(bg).flex().items_center().justify_center().child(ui::icon(icon, 26., fg))
        };
        let strong = |text: String| div().mt(px(6.)).text_size(px(15.)).line_height(px(22.5)).font_weight(FontWeight::SEMIBOLD).child(text);
        let small = |text: String| div().text_size(px(12.5)).line_height(px(17.5)).text_color(muted).child(text);

        // `.simple-settings-grid`: repeat(auto-fill, minmax(190px, 1fr)) with 12px gaps; the looks
        // tile spans two columns (one when the window is 520px or narrower).
        let cols = (((width + 12.) / 202.).floor() as usize).max(1);
        let col_w = (width - 12. * (cols as f32 - 1.)) / cols as f32;
        let look_span = if f32::from(window.viewport_size().width) <= 520. { 1 } else { 2.min(cols) };

        let me = &self.me;
        let you = tile("simple-you".into())
            .cursor_pointer()
            .hover(|s| s.border_color(tile_hover_border).bg(tile_hover_bg))
            .child(div().mb(px(-2.)).child(ui::avatar_with(self.picture(&me.avatar_url), &me.avatar, &me.color, me.name(), 56., 24., FontWeight::NORMAL, ink)))
            .child(strong(t("simpleSettings.you")))
            .child(small(t("simpleSettings.youHint")))
            .on_click(cx.listener(|this, _, _, cx| this.settings_note("Editing your profile is not in this app yet.", cx)));

        // Four looks always fit in the tile's width, so no wrapping is needed.
        let mut looks = div().mt(px(4.)).flex().gap(px(8.));
        for id in QUICK_LOOKS {
            let Some(def) = themes.iter().find(|d| d.id == id) else { continue };
            let color = |key: &str| def.colors.get(key).and_then(|c| crate::theme::css_color(c)).unwrap_or(gpui::transparent_black());
            let on = active == id;
            let theme_id = id.to_string();
            looks = looks.child(
                div()
                    .id(SharedString::from(format!("simple-look-{id}")))
                    .flex()
                    .flex_col()
                    .items_center()
                    .gap(px(4.))
                    .p(px(4.))
                    .border_2()
                    .border_color(if on { Theme::lavender().into() } else { gpui::transparent_black() })
                    .rounded(px(12.))
                    .cursor_pointer()
                    .tooltip(ui::tooltip(def.name.clone()))
                    .child(
                        div()
                            .relative()
                            .w(px(64.))
                            .h(px(44.))
                            .rounded(px(9.))
                            .border_1()
                            .border_color(line)
                            .overflow_hidden()
                            .bg(color("paper"))
                            .child(div().absolute().left(px(22.)).top(px(8.)).w(px(32.)).h(px(26.)).rounded(px(4.)).bg(color("panel")))
                            .child(div().absolute().left(px(7.)).top(px(10.)).size(px(9.)).rounded_full().bg(color("lavender"))),
                    )
                    .child(div().text_size(px(12.)).line_height(px(18.)).child(def.name.clone()))
                    .on_click(cx.listener(move |this, _, window, cx| this.apply_theme(theme_id.clone(), window, cx))),
            );
        }
        let look = tile("simple-look".into())
            .child(art("palette", "pink"))
            .child(strong(t("simpleSettings.look")))
            .child(looks)
            .child(
                div()
                    .id("simple-more-looks")
                    // `margin-top: auto`: at the bottom of the tile.
                    .mt_auto()
                    .text_size(px(13.))
                    .line_height(px(19.5))
                    .text_color(Theme::lavender())
                    .cursor_pointer()
                    .child(t("simpleSettings.moreLooks"))
                    .on_click(cx.listener(|this, _, _, cx| this.settings_tab(Tab::Appearance, cx))),
            );

        let pages: [(Tab, &'static str, &'static str, &str, &str); 7] = [
            (Tab::Voice, "mic", "teal", "simpleSettings.sound", "simpleSettings.soundHint"),
            (Tab::Notifications, "bell", "amber", "simpleSettings.alerts", "simpleSettings.alertsHint"),
            (Tab::Language, "languages", "blue", "simpleSettings.language", "simpleSettings.languageHint"),
            (Tab::Accessibility, "eye", "purple", "simpleSettings.textSize", "simpleSettings.textSizeHint"),
            (Tab::Password, "shield-check", "green", "simpleSettings.account", "simpleSettings.accountHint"),
            (Tab::Privacy, "lock", "coral", "simpleSettings.privacy", "simpleSettings.privacyHint"),
            (Tab::Tutorial, "graduation-cap", "pink", "simpleSettings.tour", "simpleSettings.tourHint"),
        ];
        let mut items: Vec<(AnyElement, usize)> = vec![(you.into_any_element(), 1), (look.into_any_element(), look_span)];
        for (tab, icon, tone_name, title, hint) in pages {
            items.push((
                tile(format!("simple-tile-{title}"))
                    .cursor_pointer()
                    .hover(|s| s.border_color(tile_hover_border).bg(tile_hover_bg))
                    .child(art(icon, tone_name))
                    .child(strong(t(title)))
                    .child(small(t(hint)))
                    .on_click(cx.listener(move |this, _, _, cx| this.settings_tab(tab, cx)))
                    .into_any_element(),
                1,
            ));
        }
        // Grid auto-placement: an item that does not fit in what is left of a row starts the next.
        let mut grid = div().flex().flex_col().gap(px(12.));
        let mut row = div().flex().gap(px(12.));
        let mut used = 0;
        for (item, span) in items {
            if used + span > cols && used > 0 {
                grid = grid.child(row);
                row = div().flex().gap(px(12.));
                used = 0;
            }
            let w = col_w * span as f32 + 12. * (span as f32 - 1.);
            row = row.child(div().flex_none().w(px(w)).flex().flex_col().child(item));
            used += span;
        }
        grid = grid.child(row);

        let pill = |id: &'static str, icon: &'static str, label: String, color: Hsla| {
            div()
                .id(id)
                .flex()
                .items_center()
                .gap(px(6.))
                .px(px(14.))
                .py(px(8.))
                .rounded_full()
                .border_1()
                .border_color(line)
                .text_size(px(13.5))
                .line_height(px(20.25))
                .text_color(color)
                .cursor_pointer()
                .child(ui::icon(icon, 16., color))
                .child(label)
        };
        let name = if me.display_name.is_empty() { me.username.clone() } else { me.display_name.clone() };
        div()
            .w_full()
            .max_w(px(760.))
            .mx_auto()
            .pb(px(12.))
            .flex()
            .flex_col()
            .gap(px(20.))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(14.))
                    .child(div().flex_none().size(px(64.)).child(gpui::img("images/hoffy-happy-wave.svg").size(px(64.))))
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .child(div().text_size(px(20.)).line_height(px(30.)).font_weight(FontWeight::SEMIBOLD).text_color(ink).child(tv("simpleSettings.hi", &[("name", &name)])))
                            .child(div().mt(px(2.)).text_size(px(14.)).line_height(px(21.)).text_color(muted).child(t("simpleSettings.lead"))),
                    ),
            )
            .child(grid)
            .child(
                div()
                    .pt(px(8.))
                    .border_t_1()
                    .border_color(line)
                    .flex()
                    .flex_wrap()
                    .gap(px(10.))
                    .justify_between()
                    .child(pill("simple-everything", "layers", t("simpleSettings.everything"), Theme::lavender().into()).on_click(cx.listener(|this, _, _, cx| this.set_ui_mode("full", cx))))
                    .child(pill("simple-signout", "log-out", t("userSettings.logOut"), rgb(0xe5484d).into()).on_click(cx.listener(|this, _, _, cx| {
                        this.settings = None;
                        this.sign_out(cx);
                    }))),
            )
            .into_any_element()
    }
}

//! The composer's "More tools" popover (composer.tsx `.mobile-composer-menu-popover`) and the
//! Create a Poll dialog (components/poll-dialog.tsx).

use gpui::{AnyElement, AppContext as _, Context, Entity, Focusable as _, FontWeight, Hsla, SharedString, Subscription, Window, div, prelude::*, px, relative, rgb, rgba};
use serde_json::json;

use super::Shell;
use crate::i18n::t;
use crate::input::{InputEvent, Look, TextInput};
use crate::theme::Theme;
use crate::ui;

pub(super) struct PollDialog {
    question: Entity<TextInput>,
    options: Vec<Entity<TextInput>>,
    private: bool,
    _subs: Vec<Subscription>,
}

/// poll-dialog.tsx's Discord greys.
const CARD: u32 = 0x2b2d31;
const BAR: u32 = 0x1e1f22;
const BLURPLE: u32 = 0x5865f2;

impl Shell {
    /// `.mobile-composer-menu-popover`: above the composer, 8px from its right edge.
    pub(super) fn render_composer_menu(&self, cx: &mut Context<Self>) -> Option<AnyElement> {
        if !self.composer_menu {
            return None;
        }
        let ink: Hsla = rgb(0xdbdee1).into();
        let lavender: Hsla = Theme::lavender().into();
        let item = |id: &'static str, glyph: AnyElement, label: String| {
            div()
                .id(id)
                .flex()
                .items_center()
                .gap(px(10.))
                .px(px(12.))
                .py(px(9.))
                .rounded(px(8.))
                .text_size(px(13.5))
                .line_height(px(20.25))
                .font_weight(FontWeight::MEDIUM)
                .text_color(ink)
                .cursor_pointer()
                .hover(move |s| s.bg(lavender.opacity(0.2)).text_color(gpui::white()))
                .child(glyph)
                .child(label)
        };
        let has_channel = self.channel_id.is_some();
        let menu = div()
            .id("composer-menu")
            .absolute()
            .bottom(relative(1.))
            .mb(px(10.))
            .right(px(8.))
            .min_w(px(190.))
            .p(px(6.))
            .rounded(px(14.))
            .bg(Theme::panel())
            .border_1()
            .border_color(Theme::line())
            .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.55), offset: gpui::point(px(0.), px(16.)), blur_radius: px(40.), spread_radius: px(0.) }])
            .flex()
            .flex_col()
            .gap(px(3.))
            .on_mouse_down_out(cx.listener(|this, _, _, cx| {
                this.composer_menu = false;
                cx.notify();
            }))
            .child(item("cm-format", ui::icon("type", 18., lavender).into_any_element(), t("composer.textFormatting")).on_click(cx.listener(|this, _, window, cx| {
                this.composer_menu = false;
                this.format_open = !this.format_open;
                window.focus(&this.composer.focus_handle(cx));
                cx.notify();
            })))
            .child(item("cm-poll", ui::icon("vote", 18., lavender).into_any_element(), t("composer.createPoll")).on_click(cx.listener(|this, _, window, cx| {
                this.composer_menu = false;
                this.open_poll_dialog(window, cx);
            })))
            .child(item("cm-games", ui::icon("gamepad-2", 18., lavender).into_any_element(), t("composer.playGames")).when(!has_channel, |d| d.opacity(0.45)).on_click(cx.listener(|this, _, _, cx| {
                this.composer_menu = false;
                this.games_open = !this.games_open;
                cx.notify();
            })))
            .child(
                item(
                    "cm-slash",
                    div().w(px(18.)).h(px(18.)).flex().items_center().justify_center().font_family(crate::theme::MONO_FONT).text_size(px(15.)).font_weight(FontWeight::BOLD).text_color(lavender).child("/").into_any_element(),
                    t("composer.slashCommands"),
                )
                    .on_click(cx.listener(|this, _, window, cx| {
                        this.composer_menu = false;
                        this.composer.update(cx, |c, cx| c.set_value("/", cx));
                        window.focus(&this.composer.focus_handle(cx));
                        this.on_composer_changed(cx);
                        cx.notify();
                    })),
            );
        Some(gpui::deferred(menu).with_priority(2).into_any_element())
    }

    pub(super) fn open_poll_dialog(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let look = || Look { size: 14., line_height: 21., height: 21., color: rgb(0xf2f3f5).into(), placeholder: Hsla::from(rgb(0xf2f3f5)).opacity(0.5) };
        let question = cx.new(|cx| TextInput::new("Ask a question (e.g., What game should we play tonight?)", cx).look(look()));
        let options = (1..=2).map(|n| cx.new(|cx| TextInput::new(format!("Option {n}"), cx).look(look()))).collect::<Vec<_>>();
        let mut subs = vec![self.poll_sub(&question, window, cx)];
        for o in &options {
            subs.push(self.poll_sub(o, window, cx));
        }
        window.focus(&question.focus_handle(cx));
        self.poll_dialog = Some(PollDialog { question, options, private: false, _subs: subs });
        cx.notify();
    }

    fn poll_sub(&self, input: &Entity<TextInput>, window: &mut Window, cx: &mut Context<Self>) -> Subscription {
        cx.subscribe_in(input, window, |this, _, event, _, cx| {
            match event {
                InputEvent::Escape => this.poll_dialog = None,
                InputEvent::Submit => this.submit_poll(cx),
                InputEvent::Changed => {}
            }
            cx.notify();
        })
    }

    fn poll_values(&self, cx: &Context<Self>) -> Option<(String, Vec<String>, bool)> {
        let d = self.poll_dialog.as_ref()?;
        let question = d.question.read(cx).text().trim().to_string();
        let options: Vec<String> = d.options.iter().map(|o| o.read(cx).text().trim().to_string()).filter(|o| !o.is_empty()).collect();
        Some((question, options, d.private))
    }

    fn submit_poll(&mut self, cx: &mut Context<Self>) {
        let Some((question, options, private)) = self.poll_values(cx) else { return };
        if question.is_empty() || options.len() < 2 {
            return;
        }
        let Some(channel) = self.channel_id.clone() else { return };
        self.poll_dialog = None;
        let client = self.client.clone();
        cx.spawn(async move |this, cx| {
            let result = cx.background_executor().spawn(async move { client.settings_post("/api/polls", json!({ "channelId": channel, "question": question, "options": options, "isPrivate": private })) }).await;
            this.update(cx, |this, cx| {
                if let Err(e) = result {
                    this.status = Some(if e.to_string().is_empty() { "Failed to create poll".to_string() } else { e.to_string() }.into());
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
        cx.notify();
    }

    pub(super) fn render_poll_dialog(&self, window: &Window, cx: &mut Context<Self>) -> Option<AnyElement> {
        let d = self.poll_dialog.as_ref()?;
        let label_color: Hsla = rgb(0xb5bac1).into();
        let label = |text: &str| div().text_size(px(12.)).line_height(px(18.)).font_weight(FontWeight::BOLD).text_color(label_color).child(text.to_uppercase());
        let field = |input: &Entity<TextInput>| {
            let focused = input.focus_handle(cx).is_focused(window);
            div()
                .h(px(43.))
                .px(px(12.))
                .rounded(px(6.))
                .bg(rgb(BAR))
                .border_1()
                .border_color(if focused { rgb(BLURPLE).into() } else { Hsla::from(gpui::white()).opacity(0.1) })
                .flex()
                .items_center()
                .child(div().flex_1().min_w_0().child(input.clone()))
        };
        let mut options = div().flex().flex_col().gap(px(8.));
        let many = d.options.len() > 2;
        for (n, input) in d.options.iter().enumerate() {
            options = options.child(
                div().flex().items_center().gap(px(8.)).child(field(input).flex_1()).when(many, |r| {
                    r.child(
                        div()
                            .id(SharedString::from(format!("poll-rm-{n}")))
                            .flex_none()
                            .p(px(6.))
                            .rounded(px(6.))
                            .cursor_pointer()
                            .hover(|s| s.bg(gpui::white().opacity(0.08)))
                            .child(ui::icon("trash-2", 16., rgb(0x949ba4)))
                            .on_click(cx.listener(move |this, _, _, cx| {
                                if let Some(d) = this.poll_dialog.as_mut()
                                    && d.options.len() > 2
                                {
                                    d.options.remove(n);
                                }
                                cx.notify();
                            })),
                    )
                }),
            );
        }
        let private = d.private;
        let ok = self.poll_values(cx).is_some_and(|(q, o, _)| !q.is_empty() && o.len() >= 2);
        let footer_button = |id: &'static str, text: &'static str, primary: bool| {
            div()
                .id(id)
                .px(px(18.))
                .py(px(9.))
                .rounded(px(4.))
                .bg(if primary { Theme::lavender() } else { Theme::card() })
                .text_size(px(13.5))
                .line_height(px(20.25))
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(if primary { rgb(0x15121f).into() } else { Hsla::from(Theme::ink()) })
                .cursor_pointer()
                .child(text)
        };
        let card = div()
            .id("poll-dialog")
            .w(px(520.))
            .rounded(px(12.))
            .bg(rgb(CARD))
            .border_1()
            .border_color(Hsla::from(gpui::white()).opacity(0.1))
            .overflow_hidden()
            .on_mouse_down(gpui::MouseButton::Left, |_, _, cx| cx.stop_propagation())
            .child(
                div()
                    .px(px(20.))
                    .py(px(16.))
                    .bg(rgb(BAR))
                    .flex()
                    .items_center()
                    .justify_between()
                    .child(div().flex().items_center().gap(px(8.)).child(ui::icon("vote", 20., rgb(0x7c86ff))).child(div().text_size(px(16.)).line_height(px(24.)).font_weight(FontWeight::SEMIBOLD).text_color(rgb(0xf2f3f5)).child("Create a Poll")))
                    .child(div().id("poll-close").cursor_pointer().child(ui::icon("x", 18., rgb(0x949ba4))).on_click(cx.listener(|this, _, _, cx| {
                        this.poll_dialog = None;
                        cx.notify();
                    }))),
            )
            .child(
                div()
                    .p(px(20.))
                    .flex()
                    .flex_col()
                    .gap(px(16.))
                    .child(div().flex().flex_col().gap(px(8.)).child(label("Poll Question")).child(field(&d.question)))
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .gap(px(8.))
                            .child(label("Options (Minimum 2)"))
                            .child(options)
                            .when(d.options.len() < 10, |g| {
                                g.child(
                                    div().flex().child(
                                        div()
                                            .id("poll-add")
                                            .mt(px(4.))
                                            .flex()
                                            .items_center()
                                            .gap(px(6.))
                                            .px(px(13.))
                                            .py(px(8.))
                                            .rounded(px(6.))
                                            .border_1()
                                            .border_dashed()
                                            .border_color(Hsla::from(gpui::white()).opacity(0.2))
                                            .bg(Hsla::from(gpui::white()).opacity(0.08))
                                            .text_size(px(13.))
                                            .line_height(px(19.5))
                                            .font_weight(FontWeight::SEMIBOLD)
                                            .text_color(rgb(0xdbdee1))
                                            .cursor_pointer()
                                            .child(ui::icon("plus", 16., rgb(0xdbdee1)))
                                            .child("Add Option")
                                            .on_click(cx.listener(|this, _, window, cx| {
                                                let n = this.poll_dialog.as_ref().map_or(0, |d| d.options.len()) + 1;
                                                let look = Look { size: 14., line_height: 21., height: 21., color: rgb(0xf2f3f5).into(), placeholder: Hsla::from(rgb(0xf2f3f5)).opacity(0.5) };
                                                let input = cx.new(|cx| TextInput::new(format!("Option {n}"), cx).look(look));
                                                let sub = this.poll_sub(&input, window, cx);
                                                if let Some(d) = this.poll_dialog.as_mut() {
                                                    d.options.push(input);
                                                    d._subs.push(sub);
                                                }
                                                cx.notify();
                                            })),
                                    ),
                                )
                            }),
                    )
                    .child(
                        div()
                            .mt(px(8.))
                            .pt(px(12.))
                            .border_t_1()
                            .border_color(Hsla::from(gpui::white()).opacity(0.1))
                            .flex()
                            .flex_col()
                            .gap(px(8.))
                            .child(
                                div()
                                    .id("poll-private")
                                    .flex()
                                    .items_center()
                                    .gap(px(8.))
                                    .cursor_pointer()
                                    .text_size(px(12.))
                                    .line_height(px(16.))
                                    .font_weight(FontWeight::BOLD)
                                    .text_color(rgb(0xd1d5dc))
                                    .child(
                                        div()
                                            .size(px(16.))
                                            .rounded(px(3.))
                                            .when(private, |c| c.bg(rgb(0x6366f1)).flex().items_center().justify_center().child(ui::icon("check", 12., gpui::white())))
                                            .when(!private, |c| c.bg(rgb(0x3b3b3b)).border_1().border_color(rgb(0x858585))),
                                    )
                                    .child(div().flex().items_center().gap(px(4.)).child(ui::icon("lock", 12., rgb(0xd1d5dc))).child("PRIVATE MODE (ANONYMOUS VOTING, HIDE VOTER NAMES)"))
                                    .on_click(cx.listener(|this, _, _, cx| {
                                        if let Some(d) = this.poll_dialog.as_mut() {
                                            d.private = !d.private;
                                        }
                                        cx.notify();
                                    })),
                            )
                            .child(div().pl(px(24.)).text_size(px(11.)).line_height(px(16.5)).text_color(rgb(0x99a1af)).child(if private {
                                "Voters' identities will be hidden. Only total votes will be shown."
                            } else {
                                "Public Mode (Default): Everyone can see who voted for each option."
                            })),
                    ),
            )
            .child(
                div()
                    .px(px(20.))
                    .py(px(14.))
                    .bg(rgb(BAR))
                    .flex()
                    .justify_end()
                    .gap(px(12.))
                    .child(footer_button("poll-cancel", "Cancel", false).on_click(cx.listener(|this, _, _, cx| {
                        this.poll_dialog = None;
                        cx.notify();
                    })))
                    .child(footer_button("poll-post", "Post Poll", true).when(ok, |b| b.on_click(cx.listener(|this, _, _, cx| this.submit_poll(cx))))),
            );
        Some(
            div()
                .id("poll-backdrop")
                .absolute()
                .inset_0()
                .p(px(20.))
                .bg(rgba(0x000000bf))
                .flex()
                .items_center()
                .justify_center()
                .on_mouse_down(gpui::MouseButton::Left, cx.listener(|this, _, _, cx| {
                    this.poll_dialog = None;
                    cx.notify();
                }))
                .child(card)
                .into_any_element(),
        )
    }
}

/// The gradient presets (`[c=from]…[/c=to]`).
const GRADIENTS: [(&str, &str, &str); 6] = [("Sunset", "red", "yellow"), ("Ocean", "cyan", "navy"), ("Candy", "pink", "purple"), ("Lime", "lime", "teal"), ("Fire", "yellow", "red"), ("Grape", "purple", "blue")];
const SWATCHES: [&str; 15] = ["red", "orange", "yellow", "lime", "green", "teal", "cyan", "blue", "navy", "purple", "pink", "brown", "gray", "black", "white"];
const HIGHLIGHTS: [&str; 6] = ["yellow", "green", "blue", "pink", "orange", "purple"];

impl Shell {
    fn wrap_composer(&mut self, open: String, close: String, window: &mut Window, cx: &mut Context<Self>) {
        self.composer.update(cx, |c, cx| c.wrap_selection(&open, &close, cx));
        self.format_open = false;
        window.focus(&self.composer.focus_handle(cx));
        self.on_composer_changed(cx);
        cx.notify();
    }

    /// TextStyleMenu: above the composer, the width of it, scrolling past 380px.
    pub(super) fn render_format_menu(&self, cx: &mut Context<Self>) -> Option<AnyElement> {
        if !self.format_open {
            return None;
        }
        let ink: Hsla = Theme::ink().into();
        let muted: Hsla = Theme::muted().into();
        let heading = |text: &str, first: bool| {
            div().mx(px(2.)).mt(px(if first { 0. } else { 8. })).mb(px(6.)).text_size(px(11.)).line_height(px(16.5)).font_weight(FontWeight::BOLD).text_color(muted).child(text.to_uppercase())
        };
        let row = || div().flex().flex_wrap().items_center().gap(px(4.));
        let key = std::cell::Cell::new(0usize);
        let button = |content: AnyElement, open: String, close: String| {
            key.set(key.get() + 1);
            div()
                .id(SharedString::from(format!("fmt-{}", key.get())))
                .h(px(30.))
                .min_w(px(30.))
                .px(px(8.))
                .rounded(px(7.))
                .border_1()
                .border_color(gpui::transparent_black())
                .bg(ink.opacity(0.06))
                .flex()
                .items_center()
                .justify_center()
                .text_size(px(13.))
                .line_height(px(13.))
                .text_color(ink)
                .cursor_pointer()
                .hover(move |s| s.bg(ink.opacity(0.12)))
                .child(content)
                .on_click(cx.listener(move |this, _, window, cx| this.wrap_composer(open.clone(), close.clone(), window, cx)))
        };
        let tag = |name: &str, arg: Option<&str>| (arg.map_or(format!("[{name}]"), |a| format!("[{name}={a}]")), format!("[/{name}]"));
        let text = |s: &str| div().child(s.to_string()).into_any_element();

        let mut style = row();
        for (content, (open, close)) in [
            (div().font_weight(FontWeight::BOLD).child("B").into_any_element(), ("**".to_string(), "**".to_string())),
            (div().italic().child("I").into_any_element(), ("*".into(), "*".into())),
            (div().underline().child("U").into_any_element(), ("__".into(), "__".into())),
            (div().line_through().child("S").into_any_element(), ("~~".into(), "~~".into())),
            (text("▒"), ("||".into(), "||".into())),
            (div().font_family(crate::theme::MONO_FONT).child("</>").into_any_element(), ("`".into(), "`".into())),
            (div().text_size(px(10.8)).child("-#").into_any_element(), ("-# ".into(), String::new())),
            (div().flex().items_start().child("x").child(div().text_size(px(10.8)).mt(px(-4.)).child("2")).into_any_element(), tag("sup", None)),
            (div().flex().items_end().child("x").child(div().text_size(px(10.8)).mb(px(-4.)).child("2")).into_any_element(), tag("sub", None)),
        ] {
            style = style.child(button(content, open, close));
        }

        let swatch = |id: String, color: Hsla, open: String, close: String| {
            div()
                .id(SharedString::from(id))
                .size(px(24.))
                .rounded_full()
                .border_2()
                .border_color(ink.opacity(0.18))
                .bg(color)
                .cursor_pointer()
                .on_click(cx.listener(move |this, _, window, cx| this.wrap_composer(open.clone(), close.clone(), window, cx)))
        };
        let color_of = |name: &str, hl: bool| -> Hsla { rgb(crate::markdown::resolve_color(name, hl).unwrap_or(0x888888)).into() };
        let mut colours = row();
        for name in SWATCHES {
            let (open, close) = tag("c", Some(name));
            colours = colours.child(swatch(format!("sw-{name}"), color_of(name, false), open, close));
        }
        // The custom colour: the conic swatch and the colour it holds (Chrome's picker is not here).
        colours = colours.child(
            div().size(px(24.)).rounded_full().border_2().border_color(ink.opacity(0.18)).overflow_hidden().flex().child(div().flex_1().bg(rgb(0xff4d4d))).child(div().flex_1().bg(rgb(0xffe14d))).child(div().flex_1().bg(rgb(0x3ddc84))).child(div().flex_1().bg(rgb(0x3ea6ff))).child(div().flex_1().bg(rgb(0xff4dd8))),
        );
        let (open, close) = tag("c", Some("#3e7bfa"));
        colours = colours.child(button(div().font_weight(FontWeight::BOLD).text_color(rgb(0x3e7bfa)).child("#3e7bfa").into_any_element(), open, close));

        let mut gradients = row();
        for (name, from, to) in GRADIENTS {
            let (a, b) = (crate::markdown::resolve_color(from, false).unwrap_or(0), crate::markdown::resolve_color(to, false).unwrap_or(0));
            let letters: Vec<char> = name.chars().collect();
            let n = letters.len().max(2) - 1;
            let mut word = div().flex().font_weight(FontWeight::BOLD);
            for (i, ch) in letters.iter().enumerate() {
                word = word.child(div().text_color(crate::rich::lerp_color(a, b, i as f32 / n as f32)).child(ch.to_string()));
            }
            gradients = gradients.child(button(word.into_any_element(), format!("[c={from}]"), format!("[/c={to}]")));
        }

        let mut highlights = row();
        for name in HIGHLIGHTS {
            let (open, close) = tag("a", Some(name));
            highlights = highlights.child(swatch(format!("hl-{name}"), color_of(name, true), open, close));
        }

        // `.text-style-fonts`: two equal columns.
        let mut fonts = div().flex().flex_col().gap(px(4.));
        for pair in crate::markdown::TEXT_FONTS.chunks(2) {
            let mut line = div().flex().gap(px(4.));
            for (id, name, face) in pair {
                let (open, close) = tag("f", Some(id));
                line = line.child(button(div().font_family(*face).child(*name).into_any_element(), open, close).flex_1().min_w_0().justify_start().overflow_hidden());
            }
            fonts = fonts.child(line);
        }

        let mut sizes = row();
        for (name, factor) in crate::markdown::TEXT_SIZES {
            let (open, close) = tag("size", Some(name));
            sizes = sizes.child(button(div().text_size(px(13. * factor)).child(name).into_any_element(), open, close));
        }

        let mut effects = row();
        for (id, name) in crate::markdown::TEXT_EFFECTS.iter().filter(|(id, _)| *id != "sup" && *id != "sub") {
            let (open, close) = tag(id, None);
            let label: AnyElement = if *id == "rainbow" {
                let letters: Vec<char> = name.chars().collect();
                let mut word = div().flex();
                for (i, ch) in letters.iter().enumerate() {
                    word = word.child(div().text_color(crate::rich::rainbow_color(i as f32 / (letters.len() - 1) as f32)).child(ch.to_string()));
                }
                word.into_any_element()
            } else if *id == "caps" {
                text(&name.to_uppercase())
            } else {
                text(name)
            };
            effects = effects.child(button(label, open, close));
        }

        let code = |s: &str| div().px(px(3.)).rounded(px(3.)).bg(ink.opacity(0.08)).font_family(crate::theme::MONO_FONT).text_size(px(10.5)).child(s.to_string());
        let hint = div()
            .mx(px(2.))
            .mt(px(10.))
            .flex()
            .flex_wrap()
            .items_center()
            .gap(px(4.))
            .text_size(px(11.))
            .line_height(px(15.4))
            .text_color(muted)
            .child("Or type them:")
            .child(code("[c=red]hi[/c]"))
            .child(code("[f=comic]hi[/f]"))
            .child(code("[c=pink]hi[/c=blue]"))
            .child(code("[wave]hi[/wave]"))
            .child("— Messenger Plus! style.");

        Some(
            div()
                .id("text-style-menu")
                .mb(px(8.))
                .max_h(px(380.))
                .overflow_y_scroll()
                .px(px(12.))
                .py(px(10.))
                .rounded(px(16.))
                .border_1()
                .border_color(ink.opacity(0.12))
                .bg(Theme::panel())
                .shadow(vec![gpui::BoxShadow { color: gpui::hsla(0., 0., 0., 0.35), offset: gpui::point(px(0.), px(24.)), blur_radius: px(60.), spread_radius: px(0.) }])
                .text_size(px(13.))
                .line_height(px(19.5))
                .child(heading("Style", true))
                .child(style)
                .child(heading("Colour", false))
                .child(colours)
                .child(heading("Gradient", false))
                .child(gradients)
                .child(heading("Highlight", false))
                .child(highlights)
                .child(heading("Font", false))
                .child(fonts)
                .child(heading("Size", false))
                .child(sizes)
                .child(heading("Effects", false))
                .child(effects)
                .child(hint)
                .into_any_element(),
        )
    }
}

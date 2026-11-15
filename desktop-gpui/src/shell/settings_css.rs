//! Settings → Custom CSS (app/components/settings/custom-css-tab.tsx): the switch, six presets, the
//! editor, copy / clear / save. There is no CSS engine here: the colour variables in `:root` (and
//! --ui-corners) are what this app applies, and the page says so.

use std::sync::LazyLock;

use gpui::{AnyElement, ClipboardItem, Context, FontWeight, Hsla, SharedString, div, prelude::*, px, rgb};

use super::Shell;
use super::settings::Settings;

#[derive(serde::Deserialize)]
struct Preset {
    name: String,
    desc: String,
    css: String,
}

/// From `tools/export-css-presets.mjs`.
static PRESETS: LazyLock<Vec<Preset>> = LazyLock::new(|| {
    crate::assets::ASSETS.iter().find(|(p, _)| *p == "data/css-presets.json").and_then(|(_, b)| serde_json::from_slice(b).ok()).unwrap_or_default()
});

impl Shell {
    /// handleSaveClientUiCss: saved, applied, and the editor showing it.
    fn save_client_css(&mut self, css: String, enabled: bool, window: &mut gpui::Window, cx: &mut Context<Self>) {
        crate::theme::set_client_css(&css, enabled);
        if let Some(s) = self.settings.as_ref() {
            let editor = s.css_editor.clone();
            if editor.read(cx).value() != css {
                editor.update(cx, |e, cx| e.set_value(css, cx));
            }
        }
        window.refresh();
        cx.notify();
    }

    pub(super) fn render_css_page(&self, s: &Settings, cx: &mut Context<Self>) -> Vec<AnyElement> {
        let client = crate::theme::load_client_css();
        let white: Hsla = gpui::white().into();
        let line: Hsla = gpui::white().opacity(0.1).into();
        let grey4 = rgb(0x9ca3af);
        let grey3 = rgb(0xd1d5db);
        let enabled = client.enabled;
        let toggle = div()
            .id("css-enabled")
            .relative()
            .flex_none()
            .w(px(44.))
            .h(px(24.))
            .rounded(px(24.))
            .bg(if enabled { crate::theme::Theme::lavender().into() } else { white.opacity(0.15) })
            .cursor_pointer()
            .child(div().absolute().top(px(3.)).left(px(if enabled { 23. } else { 3. })).size(px(18.)).rounded_full().bg(gpui::white()))
            .on_click(cx.listener(move |this, _, window, cx| {
                let css = crate::theme::load_client_css().css;
                this.save_client_css(css, !enabled, window, cx);
            }));
        let mut presets = div().flex().flex_col().gap(px(8.));
        let mut row = div().flex().gap(px(8.));
        for (n, preset) in PRESETS.iter().enumerate() {
            let css = preset.css.clone();
            row = row.child(
                div()
                    .id(SharedString::from(format!("css-preset-{n}")))
                    .group(SharedString::from(format!("css-preset-{n}")))
                    .flex_none()
                    .w(px(238.))
                    .p(px(10.))
                    .rounded(px(8.))
                    .bg(white.opacity(0.05))
                    .hover(|s| s.bg(gpui::white().opacity(0.1)))
                    .border_1()
                    .border_color(line)
                    .cursor_pointer()
                    .child(
                        div()
                            .text_size(px(12.))
                            .line_height(px(16.))
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(white)
                            .group_hover(SharedString::from(format!("css-preset-{n}")), |s| s.text_color(rgb(0xa5b4fc)))
                            .child(format!("✨ {}", preset.name)),
                    )
                    .child(div().mt(px(4.)).h(px(33.)).overflow_hidden().text_size(px(11.)).line_height(px(16.5)).text_color(grey4).child(preset.desc.clone()))
                    .on_click(cx.listener(move |this, _, window, cx| this.save_client_css(css.clone(), true, window, cx))),
            );
            if n % 3 == 2 {
                presets = presets.child(row);
                row = div().flex().gap(px(8.));
            }
        }
        if PRESETS.len() % 3 != 0 {
            presets = presets.child(row);
        }
        let small_button = |id: &'static str, label: &'static str, color: Hsla, bg: Hsla, border: Hsla| {
            div().id(id).px(px(10.)).py(px(4.)).rounded(px(4.)).bg(bg).border_1().border_color(border).text_size(px(12.)).line_height(px(16.)).text_color(color).cursor_pointer().child(label)
        };
        let rose = rgb(0xfb7185);
        let code = |text: &str| div().font_family(crate::theme::MONO_FONT).text_size(px(11.)).text_color(rgb(0xa5b4fc)).child(text.to_string());
        vec![
            div()
                .flex_none()
                .p(px(20.))
                .rounded(px(12.))
                .bg(white.opacity(0.05))
                .border_1()
                .border_color(line)
                .flex()
                .flex_col()
                .gap(px(16.))
                .child(
                    div()
                        .pb(px(12.))
                        .border_b_1()
                        .border_color(line)
                        .flex()
                        .items_center()
                        .justify_between()
                        .child(
                            div()
                                .flex()
                                .flex_col()
                                .child(div().text_size(px(16.)).line_height(px(24.)).font_weight(FontWeight::BOLD).text_color(white).child("Enable Client UI Custom CSS"))
                                .child(div().mt(px(2.)).text_size(px(12.)).line_height(px(16.)).text_color(grey4).child("Injects your personal custom CSS rules across your entire client interface (client-side only).")),
                        )
                        .child(toggle),
                )
                .child(
                    div()
                        .flex()
                        .flex_col()
                        .child(div().mb(px(8.)).text_size(px(12.)).line_height(px(16.)).font_weight(FontWeight::SEMIBOLD).text_color(grey3).child("Quick Presets:"))
                        .child(presets),
                )
                .child(
                    div()
                        .pt(px(8.))
                        .flex()
                        .flex_col()
                        .child(
                            div()
                                .mb(px(8.))
                                .flex()
                                .items_center()
                                .justify_between()
                                .child(div().text_size(px(12.)).line_height(px(16.)).font_weight(FontWeight::SEMIBOLD).text_color(grey3).child("CSS Code Editor:"))
                                .child(
                                    div()
                                        .flex()
                                        .gap(px(8.))
                                        .child(small_button("css-copy", "Copy CSS", grey3.into(), white.opacity(0.05), line).on_click(cx.listener(|this, _, _, cx| {
                                            cx.write_to_clipboard(ClipboardItem::new_string(crate::theme::load_client_css().css));
                                            this.settings_note("CSS copied to clipboard!", cx);
                                        })))
                                        .child(
                                            small_button("css-clear", "Clear CSS", rose.into(), Hsla::from(rgb(0xf43f5e)).opacity(0.1), Hsla::from(rgb(0xf43f5e)).opacity(0.2))
                                                .on_click(cx.listener(|this, _, window, cx| this.save_client_css(String::new(), false, window, cx))),
                                        ),
                                ),
                        )
                        .child(
                            div()
                                .w_full()
                                .min_h(px(220.))
                                .p(px(12.))
                                .rounded(px(8.))
                                .bg(gpui::black().opacity(0.4))
                                .border_1()
                                .border_color(line)
                                .font_family(crate::theme::MONO_FONT)
                                .child(s.css_editor.clone()),
                        )
                        .child(
                            div()
                                .mt(px(12.))
                                .flex()
                                .items_center()
                                .justify_between()
                                .child(
                                    div()
                                        .flex()
                                        .flex_wrap()
                                        .items_center()
                                        .gap(px(4.))
                                        .text_size(px(11.))
                                        .line_height(px(16.5))
                                        .text_color(grey4)
                                        .child("Target selectors:")
                                        .child(code(".sidebar"))
                                        .child(",")
                                        .child(code(".chat-panel"))
                                        .child(",")
                                        .child(code(".message"))
                                        .child(",")
                                        .child(code(".composer"))
                                        .child(",")
                                        .child(code(".member-panel")),
                                )
                                .child(
                                    div()
                                        .id("css-save")
                                        .px(px(16.))
                                        .h(px(42.))
                                        .rounded(px(10.))
                                        .bg(crate::theme::Theme::lavender())
                                        .flex()
                                        .items_center()
                                        .text_size(px(12.))
                                        .line_height(px(16.))
                                        .font_weight(FontWeight::EXTRA_BOLD)
                                        .text_color(rgb(0x15121f))
                                        .cursor_pointer()
                                        .child("Save & Apply")
                                        .on_click(cx.listener(|this, _, window, cx| {
                                            let css = crate::theme::load_client_css().css;
                                            this.save_client_css(css, true, window, cx);
                                        })),
                                ),
                        )
                        // This app has no CSS engine: say what of it applies here.
                        .child(div().mt(px(10.)).text_size(px(11.)).line_height(px(16.5)).text_color(grey4).child("In this app, only the colour variables in :root (and --ui-corners) apply; the rest of the CSS takes effect on the web.")),
                ),
        ]
        .into_iter()
        .map(|e| e.into_any_element())
        .collect()
    }
}

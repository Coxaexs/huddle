//! Hoffle Lite, drawn natively with GPUI instead of a web view.

mod api;
mod assets;
mod i18n;
mod images;
mod input;
mod login;
mod markdown;
mod model;
mod realtime;
mod rich;
mod shell;
mod theme;
mod ui;
mod voice;

use gpui::{
    App, Application, Bounds, Context, Entity, FocusHandle, Focusable, KeyBinding, Menu, MenuItem,
    Render, Subscription, TitlebarOptions, Window, WindowBounds, WindowOptions, actions, div,
    point, prelude::*, px, size,
};

use api::{Client, DEFAULT_BASE};
use login::{LoginEvent, LoginView};
use model::User;
use shell::{Shell, ShellEvent};
use theme::Theme;

actions!(hoffle, [Quit, Minimize]);

/// `HOFFLE_DEBUG=1` traces what the app is doing on stderr.
pub fn trace(message: impl std::fmt::Display) {
    use std::sync::OnceLock;
    static ON: OnceLock<bool> = OnceLock::new();
    if *ON.get_or_init(|| std::env::var_os("HOFFLE_DEBUG").is_some()) {
        eprintln!("[{}] {message}", chrono::Local::now().format("%H:%M:%S%.3f"));
    }
}

enum Screen {
    Starting,
    Login(Entity<LoginView>),
    Main(Entity<Shell>),
}

struct Root {
    screen: Screen,
    focus: FocusHandle,
    _sub: Option<Subscription>,
}

impl Root {
    fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let saved = api::store::load();
        // HOFFLE_URL points the app at another Hoffle (a test copy); HOFFLE_SESSION signs in with a
        // cookie value directly, for development.
        let base = std::env::var("HOFFLE_URL")
            .ok()
            .or_else(|| (!saved.base.is_empty()).then(|| saved.base.clone()))
            .unwrap_or_else(|| DEFAULT_BASE.to_string());
        let token = std::env::var("HOFFLE_SESSION").ok().or(saved.token.clone());
        let mut root = Self { screen: Screen::Starting, focus: cx.focus_handle(), _sub: None };
        match token {
            Some(token) => {
                let client = Client::new(&base, Some(token));
                cx.spawn_in(window, async move |this, cx| {
                    let check = client.clone();
                    let user = cx.background_executor().spawn(async move { check.session() }).await;
                    crate::trace(format!("session check: {:?}", user.as_ref().map(|u| u.as_ref().map(|u| u.username.clone()))));
                    this.update_in(cx, |this, window, cx| match user {
                        Ok(Some(user)) => this.show_shell(client, user, window, cx),
                        // Expired, or the server could not be reached: ask again.
                        _ => this.show_login(base, saved.username, window, cx),
                    })
                    .ok();
                })
                .detach();
            }
            None => root.show_login(base, saved.username, window, cx),
        }
        root
    }

    fn show_login(&mut self, base: String, username: Option<String>, window: &mut Window, cx: &mut Context<Self>) {
        images::set_client(None);
        let view = cx.new(|cx| LoginView::new(base, username, window, cx));
        self._sub = Some(cx.subscribe_in(&view, window, |this, _, event, window, cx| match event {
            LoginEvent::SignedIn(client, user) => this.show_shell(client.clone(), user.clone(), window, cx),
        }));
        self.screen = Screen::Login(view);
        cx.notify();
    }

    fn show_shell(&mut self, client: Client, user: User, window: &mut Window, cx: &mut Context<Self>) {
        let base = client.base().to_string();
        let username = Some(user.username.clone());
        images::set_client(Some(client.clone()));
        let view = cx.new(|cx| Shell::new(client, user, window, cx));
        self._sub = Some(cx.subscribe_in(&view, window, move |this, _, event, window, cx| match event {
            ShellEvent::SignedOut => this.show_login(base.clone(), username.clone(), window, cx),
        }));
        self.screen = Screen::Main(view);
        cx.notify();
    }
}

impl Focusable for Root {
    fn focus_handle(&self, _: &App) -> FocusHandle {
        self.focus.clone()
    }
}

impl Render for Root {
    fn render(&mut self, _window: &mut Window, _cx: &mut Context<Self>) -> impl IntoElement {
        let body = match &self.screen {
            Screen::Starting => div()
                .size_full()
                .flex()
                .items_center()
                .justify_center()
                .text_color(Theme::muted())
                .child("Opening Hoffle…")
                .into_any_element(),
            Screen::Login(view) => view.clone().into_any_element(),
            Screen::Main(view) => view.clone().into_any_element(),
        };
        div()
            .size_full()
            .bg(Theme::paper())
            .text_color(Theme::ink())
            .font_family(theme::UI_FONT)
            .text_size(px(14.))
            // The title bar is see-through: this strip lets the window be dragged by its top edge.
            .child(
                div()
                    .id("titlebar")
                    .absolute()
                    .top_0()
                    .left_0()
                    .right_0()
                    .h(px(14.))
                    .on_mouse_down(gpui::MouseButton::Left, |_, window, _| window.start_window_move()),
            )
            .child(body)
    }
}

fn main() {
    Application::new().with_assets(assets::Assets).with_http_client(std::sync::Arc::new(images::Fetcher::new())).run(|cx: &mut App| {
        assets::load_fonts(cx);
        input::bind_keys(cx);
        cx.bind_keys([
            KeyBinding::new("cmd-q", Quit, None),
            KeyBinding::new("cmd-m", Minimize, None),
        ]);
        cx.on_action(|_: &Quit, cx| cx.quit());
        cx.on_action(|_: &Minimize, cx| {
            if let Some(window) = cx.active_window() {
                window.update(cx, |_, window, _| window.minimize_window()).ok();
            }
        });
        cx.set_menus(vec![
            Menu { name: "Hoffle".into(), items: vec![MenuItem::action("Quit Hoffle", Quit)] },
            Menu { name: "Window".into(), items: vec![MenuItem::action("Minimize", Minimize)] },
        ]);

        let bounds = Bounds::centered(None, size(px(1180.), px(760.)), cx);
        let window = cx
            .open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(bounds)),
                    titlebar: Some(TitlebarOptions {
                        title: Some("Hoffle".into()),
                        appears_transparent: true,
                        traffic_light_position: Some(point(px(14.), px(14.))),
                    }),
                    window_min_size: Some(size(px(760.), px(480.))),
                    app_id: Some("online.hoffle.gpui".into()),
                    // Test runs (GPUI_SNAPSHOT) render offscreen for screenshots: keep them off the screen.
                    show: std::env::var_os("GPUI_SNAPSHOT").is_none(),
                    focus: std::env::var_os("GPUI_SNAPSHOT").is_none(),
                    ..Default::default()
                },
                |window, cx| cx.new(|cx| Root::new(window, cx)),
            )
            .unwrap();
        window
            .update(cx, |_, _, cx| {
                // Test runs (screenshots) open without taking focus from whatever is in front.
                if std::env::var_os("GPUI_SNAPSHOT").is_none() {
                    cx.activate(true);
                }
            })
            .ok();
    });
}

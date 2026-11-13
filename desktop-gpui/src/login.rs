//! Sign in: username and password, then a code when two-factor is on. Passkeys and sign-up stay in
//! the web app for now; the link at the bottom opens it.

use gpui::{
    Context, Entity, EventEmitter, FocusHandle, Focusable, IntoElement, MouseButton, Render,
    SharedString, Subscription, Window, div, prelude::*, px,
};

use crate::api::{self, Client, LoginOutcome};
use crate::input::{InputEvent, TextInput};
use crate::model::User;
use crate::theme::Theme;

pub enum LoginEvent {
    SignedIn(Client, User),
}

pub struct LoginView {
    base: String,
    username: Entity<TextInput>,
    password: Entity<TextInput>,
    code: Entity<TextInput>,
    ticket: Option<String>,
    client: Option<Client>,
    busy: bool,
    error: Option<SharedString>,
    focus: FocusHandle,
    _subs: Vec<Subscription>,
}

impl EventEmitter<LoginEvent> for LoginView {}

impl LoginView {
    pub fn new(base: String, username: Option<String>, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let user_input = cx.new(|cx| {
            let mut input = TextInput::new("Username", cx);
            if let Some(name) = &username {
                input.set_text(name.clone(), cx);
            }
            input
        });
        let password = cx.new(|cx| TextInput::new("Password", cx).masked());
        let code = cx.new(|cx| TextInput::new("6-digit code or a recovery code", cx));
        let subs = vec![
            cx.subscribe_in(&user_input, window, |this, _, event, window, cx| {
                if let InputEvent::Submit = event {
                    window.focus(&this.password.focus_handle(cx));
                }
            }),
            cx.subscribe_in(&password, window, |this, _, event, window, cx| {
                if let InputEvent::Submit = event {
                    this.submit(window, cx);
                }
            }),
            cx.subscribe_in(&code, window, |this, _, event, window, cx| {
                if let InputEvent::Submit = event {
                    this.submit(window, cx);
                }
            }),
        ];
        let focus_target = if username.is_some() { &password } else { &user_input };
        window.focus(&focus_target.focus_handle(cx));
        Self {
            base,
            username: user_input,
            password,
            code,
            ticket: None,
            client: None,
            busy: false,
            error: None,
            focus: cx.focus_handle(),
            _subs: subs,
        }
    }

    fn submit(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }
        self.error = None;
        let username = self.username.read(cx).text().trim().to_string();
        let password = self.password.read(cx).text();
        let code = self.code.read(cx).text().trim().to_string();
        if self.ticket.is_none() && (username.is_empty() || password.is_empty()) {
            self.error = Some("Enter your username and password.".into());
            cx.notify();
            return;
        }
        let client = self.client.clone().unwrap_or_else(|| Client::new(&self.base, None));
        self.client = Some(client.clone());
        let ticket = self.ticket.clone();
        self.busy = true;
        cx.notify();
        let _ = window;
        cx.spawn(async move |this, cx| {
            let worker = client.clone();
            let name = username.clone();
            let result = cx
                .background_executor()
                .spawn(async move {
                    match ticket {
                        Some(ticket) => worker.second_factor(&ticket, &code).map(LoginOutcome::SignedIn),
                        None => worker.login(&name, &password),
                    }
                })
                .await;
            this.update(cx, |this, cx| {
                this.busy = false;
                match result {
                    Ok(LoginOutcome::SignedIn(user)) => {
                        api::store::save(&api::store::Saved {
                            base: client.base().to_string(),
                            token: client.token(),
                            username: Some(user.username.clone()),
                        });
                        cx.emit(LoginEvent::SignedIn(client, user));
                    }
                    Ok(LoginOutcome::SecondFactor { ticket }) => {
                        this.ticket = Some(ticket);
                    }
                    Err(err) => this.error = Some(err.to_string().into()),
                }
                cx.notify();
            })
            .ok();
        })
        .detach();
    }
}

impl Focusable for LoginView {
    fn focus_handle(&self, _: &gpui::App) -> FocusHandle {
        self.focus.clone()
    }
}

impl Render for LoginView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        // The code step needs its field focused once it appears.
        if self.ticket.is_some() && !self.code.focus_handle(cx).contains_focused(window, cx) && !self.busy {
            window.focus(&self.code.focus_handle(cx));
        }
        let second_step = self.ticket.is_some();
        let base = self.base.clone();
        let label = |text: &'static str| div().text_size(px(12.)).text_color(Theme::muted()).mb_1().child(text);

        let mut card = div()
            .w(px(380.))
            .p_8()
            .rounded(px(Theme::radius()))
            .bg(Theme::panel())
            .border_1()
            .border_color(Theme::line())
            .flex()
            .flex_col()
            .gap_3()
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap_2()
                    .child(div().text_size(px(26.)).child("🦋"))
                    .child(div().text_size(px(22.)).font_weight(gpui::FontWeight::BOLD).child("Hoffle")),
            )
            .child(div().text_color(Theme::muted()).text_size(px(13.)).child(if second_step {
                "Two-factor is on for this account. Enter the code from your authenticator app."
            } else {
                "Welcome back. Sign in to pick up where you left off."
            }));

        if second_step {
            card = card.child(div().child(label("Code")).child(self.code.clone()));
        } else {
            card = card
                .child(div().child(label("Username")).child(self.username.clone()))
                .child(div().child(label("Password")).child(self.password.clone()));
        }
        if let Some(error) = &self.error {
            card = card.child(div().text_size(px(13.)).text_color(Theme::coral()).child(error.clone()));
        }
        card = card.child(
            div()
                .id("sign-in")
                .mt_1()
                .h(px(40.))
                .rounded(px(10.))
                .flex()
                .items_center()
                .justify_center()
                .bg(if self.busy { Theme::lavender_muted() } else { Theme::lavender() })
                .text_color(Theme::paper())
                .font_weight(gpui::FontWeight::SEMIBOLD)
                .cursor_pointer()
                .hover(|s| s.opacity(0.9))
                .child(if self.busy { "Signing in…" } else if second_step { "Verify" } else { "Sign in" })
                .on_mouse_up(MouseButton::Left, cx.listener(|this, _, window, cx| this.submit(window, cx))),
        );
        card = card.child(
            div()
                .id("web")
                .text_size(px(12.))
                .text_color(Theme::muted())
                .cursor_pointer()
                .hover(|s| s.text_color(Theme::lavender()))
                .child("New here, or signing in with a passkey? Open Hoffle in your browser.")
                .on_click(move |_, _, cx| cx.open_url(&base)),
        );

        div()
            .size_full()
            .bg(Theme::paper())
            .text_color(Theme::ink())
            .flex()
            .items_center()
            .justify_center()
            .child(card)
    }
}

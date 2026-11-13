//! A multi-line text field (the composer's and the message editor's `<textarea>`): wraps to its width,
//! grows up to `max_lines` and then scrolls to keep the caret in view, Enter submits and Shift-Enter
//! starts a new line, with IME, selection across wrapped rows, word moves and the clipboard.

use std::ops::Range;

use gpui::{
    App, Bounds, ClipboardItem, Context, CursorStyle, ElementId, ElementInputHandler, Entity,
    EntityInputHandler, EventEmitter, FocusHandle, Focusable, GlobalElementId, KeyBinding, LayoutId,
    MouseButton, MouseDownEvent, MouseMoveEvent, MouseUpEvent, PaintQuad, Pixels, Point, SharedString,
    Style, TextAlign, TextRun, UTF16Selection, UnderlineStyle, Window, WrappedLine, actions, div, fill,
    point, prelude::*, px, relative, size,
};
use unicode_segmentation::*;

use crate::theme::Theme;

actions!(
    text_area,
    [Backspace, Delete, Left, Right, Up, Down, SelectLeft, SelectRight, SelectUp, SelectDown, SelectAll,
     LineStart, LineEnd, WordLeft, WordRight, DeleteWordLeft, Paste, Cut, Copy, Submit, Newline, Escape,
     ShowCharacterPalette]
);

pub fn bind_keys(cx: &mut App) {
    let ctx = Some("TextArea");
    cx.bind_keys([
        KeyBinding::new("backspace", Backspace, ctx),
        KeyBinding::new("delete", Delete, ctx),
        KeyBinding::new("left", Left, ctx),
        KeyBinding::new("right", Right, ctx),
        KeyBinding::new("up", Up, ctx),
        KeyBinding::new("down", Down, ctx),
        KeyBinding::new("shift-left", SelectLeft, ctx),
        KeyBinding::new("shift-right", SelectRight, ctx),
        KeyBinding::new("shift-up", SelectUp, ctx),
        KeyBinding::new("shift-down", SelectDown, ctx),
        KeyBinding::new("alt-left", WordLeft, ctx),
        KeyBinding::new("alt-right", WordRight, ctx),
        KeyBinding::new("alt-backspace", DeleteWordLeft, ctx),
        KeyBinding::new("cmd-left", LineStart, ctx),
        KeyBinding::new("cmd-right", LineEnd, ctx),
        KeyBinding::new("home", LineStart, ctx),
        KeyBinding::new("end", LineEnd, ctx),
        KeyBinding::new("cmd-a", SelectAll, ctx),
        KeyBinding::new("cmd-v", Paste, ctx),
        KeyBinding::new("cmd-c", Copy, ctx),
        KeyBinding::new("cmd-x", Cut, ctx),
        KeyBinding::new("enter", Submit, ctx),
        KeyBinding::new("shift-enter", Newline, ctx),
        KeyBinding::new("escape", Escape, ctx),
        KeyBinding::new("ctrl-cmd-space", ShowCharacterPalette, ctx),
    ]);
}

pub enum AreaEvent {
    Submit,
    Changed,
    Escape,
}

pub struct TextArea {
    focus_handle: FocusHandle,
    content: SharedString,
    placeholder: SharedString,
    selected_range: Range<usize>,
    selection_reversed: bool,
    marked_range: Option<Range<usize>>,
    /// Text size and line height.
    size: f32,
    line_height: f32,
    max_lines: usize,
    /// A cap in px (the composer's 40vh, the editor's 60% of the window), on top of `max_lines`.
    max_height: Option<f32>,
    min_height: f32,
    placeholder_color: Option<gpui::Hsla>,
    /// The x the caret keeps while moving up and down through rows.
    goal_x: Option<Pixels>,
    scroll_y: Pixels,
    last: Option<Shaped>,
    is_selecting: bool,
}

/// One hard line of text with where it starts and how it wrapped.
struct HardLine {
    start: usize,
    line: WrappedLine,
    /// Top of the line, before scrolling, inside the text box.
    top: Pixels,
}

struct Shaped {
    lines: Vec<HardLine>,
    bounds: Bounds<Pixels>,
    line_height: Pixels,
}

impl Shaped {
    fn line_for_index(&self, index: usize) -> Option<&HardLine> {
        self.lines.iter().rev().find(|l| l.start <= index)
    }

    /// Caret position (top-left of the caret) inside the text box, unscrolled.
    fn position(&self, index: usize) -> Point<Pixels> {
        match self.line_for_index(index) {
            Some(l) => {
                let local = l.line.position_for_index(index - l.start, self.line_height).unwrap_or(point(px(0.), px(0.)));
                point(local.x, l.top + local.y)
            }
            None => point(px(0.), px(0.)),
        }
    }

    /// Closest text index to a point inside the text box (unscrolled).
    fn index_at(&self, p: Point<Pixels>) -> usize {
        let Some(l) = self.lines.iter().rev().find(|l| l.top <= p.y).or(self.lines.first()) else { return 0 };
        let local = point(p.x.max(px(0.)), (p.y - l.top).max(px(0.)));
        let ix = match l.line.closest_index_for_position(local, self.line_height) {
            Ok(i) | Err(i) => i,
        };
        l.start + ix.min(l.line.len())
    }

    fn height(&self) -> Pixels {
        self.lines.last().map_or(self.line_height, |l| l.top + l.line.size(self.line_height).height)
    }
}

impl EventEmitter<AreaEvent> for TextArea {}

impl TextArea {
    pub fn new(placeholder: impl Into<SharedString>, cx: &mut Context<Self>) -> Self {
        Self {
            focus_handle: cx.focus_handle(),
            content: "".into(),
            placeholder: placeholder.into(),
            selected_range: 0..0,
            selection_reversed: false,
            marked_range: None,
            size: 14.,
            line_height: 20.3,
            max_lines: 1000,
            max_height: None,
            min_height: 0.,
            placeholder_color: None,
            goal_x: None,
            scroll_y: px(0.),
            last: None,
            is_selecting: false,
        }
    }

    /// Text size and line height (the composer: 14/20.3; the message editor: 16/24).
    pub fn text(mut self, size: f32, line_height: f32) -> Self {
        self.size = size;
        self.line_height = line_height;
        self
    }

    pub fn max_lines(mut self, lines: usize) -> Self {
        self.max_lines = lines;
        self
    }

    pub fn set_max_height(&mut self, height: f32) {
        self.max_height = Some(height);
    }

    /// The composer's placeholder is `--faint`, dimmer than muted text.
    pub fn placeholder_color(mut self, color: impl Into<gpui::Hsla>) -> Self {
        self.placeholder_color = Some(color.into());
        self
    }

    pub fn min_height(mut self, height: f32) -> Self {
        self.min_height = height;
        self
    }

    pub fn value(&self) -> String {
        self.content.to_string()
    }

    pub fn is_empty(&self) -> bool {
        self.content.is_empty()
    }

    pub fn set_value(&mut self, text: impl Into<SharedString>, cx: &mut Context<Self>) {
        self.content = text.into();
        let end = self.content.len();
        self.selected_range = end..end;
        self.marked_range = None;
        self.goal_x = None;
        cx.notify();
    }

    pub fn set_placeholder(&mut self, text: impl Into<SharedString>, cx: &mut Context<Self>) {
        self.placeholder = text.into();
        cx.notify();
    }

    pub fn clear(&mut self, cx: &mut Context<Self>) {
        self.set_value("", cx);
        self.scroll_y = px(0.);
    }

    fn cursor(&self) -> usize {
        if self.selection_reversed { self.selected_range.start } else { self.selected_range.end }
    }

    fn move_to(&mut self, offset: usize, cx: &mut Context<Self>) {
        self.selected_range = offset..offset;
        self.selection_reversed = false;
        cx.notify();
    }

    fn select_to(&mut self, offset: usize, cx: &mut Context<Self>) {
        if self.selection_reversed {
            self.selected_range.start = offset
        } else {
            self.selected_range.end = offset
        };
        if self.selected_range.end < self.selected_range.start {
            self.selection_reversed = !self.selection_reversed;
            self.selected_range = self.selected_range.end..self.selected_range.start;
        }
        cx.notify()
    }

    fn previous_boundary(&self, offset: usize) -> usize {
        self.content.grapheme_indices(true).rev().find_map(|(i, _)| (i < offset).then_some(i)).unwrap_or(0)
    }

    fn next_boundary(&self, offset: usize) -> usize {
        self.content.grapheme_indices(true).find_map(|(i, _)| (i > offset).then_some(i)).unwrap_or(self.content.len())
    }

    fn previous_word(&self, offset: usize) -> usize {
        self.content
            .split_word_bound_indices()
            .rev()
            .find_map(|(i, w)| (i < offset && !w.trim().is_empty()).then_some(i))
            .unwrap_or(0)
    }

    fn next_word(&self, offset: usize) -> usize {
        self.content
            .split_word_bound_indices()
            .find_map(|(i, w)| (i + w.len() > offset && !w.trim().is_empty()).then_some(i + w.len()))
            .unwrap_or(self.content.len())
    }

    /// The index one visual row above (-1) or below (+1) the caret, keeping the goal x.
    fn vertical(&mut self, rows: f32) -> Option<usize> {
        let shaped = self.last.as_ref()?;
        let here = shaped.position(self.cursor());
        let x = *self.goal_x.get_or_insert(here.x);
        let y = here.y + shaped.line_height * rows + shaped.line_height / 2.;
        if y < px(0.) {
            return Some(0);
        }
        if y > shaped.height() {
            return Some(self.content.len());
        }
        Some(shaped.index_at(point(x, y)))
    }

    fn left(&mut self, _: &Left, _: &mut Window, cx: &mut Context<Self>) {
        self.goal_x = None;
        let to = if self.selected_range.is_empty() { self.previous_boundary(self.cursor()) } else { self.selected_range.start };
        self.move_to(to, cx);
    }
    fn right(&mut self, _: &Right, _: &mut Window, cx: &mut Context<Self>) {
        self.goal_x = None;
        let to = if self.selected_range.is_empty() { self.next_boundary(self.cursor()) } else { self.selected_range.end };
        self.move_to(to, cx);
    }
    fn up(&mut self, _: &Up, _: &mut Window, cx: &mut Context<Self>) {
        if let Some(to) = self.vertical(-1.) {
            let goal = self.goal_x;
            self.move_to(to, cx);
            self.goal_x = goal;
        }
    }
    fn down(&mut self, _: &Down, _: &mut Window, cx: &mut Context<Self>) {
        if let Some(to) = self.vertical(1.) {
            let goal = self.goal_x;
            self.move_to(to, cx);
            self.goal_x = goal;
        }
    }
    fn select_left(&mut self, _: &SelectLeft, _: &mut Window, cx: &mut Context<Self>) {
        self.select_to(self.previous_boundary(self.cursor()), cx);
    }
    fn select_right(&mut self, _: &SelectRight, _: &mut Window, cx: &mut Context<Self>) {
        self.select_to(self.next_boundary(self.cursor()), cx);
    }
    fn select_up(&mut self, _: &SelectUp, _: &mut Window, cx: &mut Context<Self>) {
        if let Some(to) = self.vertical(-1.) {
            self.select_to(to, cx);
        }
    }
    fn select_down(&mut self, _: &SelectDown, _: &mut Window, cx: &mut Context<Self>) {
        if let Some(to) = self.vertical(1.) {
            self.select_to(to, cx);
        }
    }
    fn select_all(&mut self, _: &SelectAll, _: &mut Window, cx: &mut Context<Self>) {
        self.selected_range = 0..self.content.len();
        self.selection_reversed = false;
        cx.notify();
    }
    fn line_start(&mut self, _: &LineStart, _: &mut Window, cx: &mut Context<Self>) {
        let start = self.content[..self.cursor()].rfind('\n').map_or(0, |i| i + 1);
        self.move_to(start, cx);
    }
    fn line_end(&mut self, _: &LineEnd, _: &mut Window, cx: &mut Context<Self>) {
        let from = self.cursor();
        let end = self.content[from..].find('\n').map_or(self.content.len(), |i| from + i);
        self.move_to(end, cx);
    }
    fn word_left(&mut self, _: &WordLeft, _: &mut Window, cx: &mut Context<Self>) {
        self.move_to(self.previous_word(self.cursor()), cx);
    }
    fn word_right(&mut self, _: &WordRight, _: &mut Window, cx: &mut Context<Self>) {
        self.move_to(self.next_word(self.cursor()), cx);
    }
    fn backspace(&mut self, _: &Backspace, window: &mut Window, cx: &mut Context<Self>) {
        if self.selected_range.is_empty() {
            self.select_to(self.previous_boundary(self.cursor()), cx)
        }
        self.replace_text_in_range(None, "", window, cx)
    }
    fn delete(&mut self, _: &Delete, window: &mut Window, cx: &mut Context<Self>) {
        if self.selected_range.is_empty() {
            self.select_to(self.next_boundary(self.cursor()), cx)
        }
        self.replace_text_in_range(None, "", window, cx)
    }
    fn delete_word_left(&mut self, _: &DeleteWordLeft, window: &mut Window, cx: &mut Context<Self>) {
        if self.selected_range.is_empty() {
            self.select_to(self.previous_word(self.cursor()), cx)
        }
        self.replace_text_in_range(None, "", window, cx)
    }
    fn paste(&mut self, _: &Paste, window: &mut Window, cx: &mut Context<Self>) {
        if let Some(text) = cx.read_from_clipboard().and_then(|item| item.text()) {
            self.replace_text_in_range(None, &text, window, cx);
        }
    }
    fn copy(&mut self, _: &Copy, _: &mut Window, cx: &mut Context<Self>) {
        if !self.selected_range.is_empty() {
            cx.write_to_clipboard(ClipboardItem::new_string(self.content[self.selected_range.clone()].to_string()));
        }
    }
    fn cut(&mut self, _: &Cut, window: &mut Window, cx: &mut Context<Self>) {
        if !self.selected_range.is_empty() {
            cx.write_to_clipboard(ClipboardItem::new_string(self.content[self.selected_range.clone()].to_string()));
            self.replace_text_in_range(None, "", window, cx)
        }
    }
    fn submit(&mut self, _: &Submit, _: &mut Window, cx: &mut Context<Self>) {
        cx.emit(AreaEvent::Submit);
    }
    fn newline(&mut self, _: &Newline, window: &mut Window, cx: &mut Context<Self>) {
        self.replace_text_in_range(None, "\n", window, cx);
    }
    fn escape(&mut self, _: &Escape, _: &mut Window, cx: &mut Context<Self>) {
        cx.emit(AreaEvent::Escape);
    }
    fn show_character_palette(&mut self, _: &ShowCharacterPalette, window: &mut Window, _: &mut Context<Self>) {
        window.show_character_palette();
    }

    fn index_for_mouse(&self, position: Point<Pixels>) -> usize {
        let Some(shaped) = self.last.as_ref() else { return 0 };
        let local = point(position.x - shaped.bounds.left(), position.y - shaped.bounds.top() + self.scroll_y);
        shaped.index_at(local)
    }

    fn on_mouse_down(&mut self, event: &MouseDownEvent, window: &mut Window, cx: &mut Context<Self>) {
        self.is_selecting = true;
        self.goal_x = None;
        window.focus(&self.focus_handle);
        let at = self.index_for_mouse(event.position);
        if event.modifiers.shift { self.select_to(at, cx) } else { self.move_to(at, cx) }
    }
    fn on_mouse_up(&mut self, _: &MouseUpEvent, _: &mut Window, _: &mut Context<Self>) {
        self.is_selecting = false;
    }
    fn on_mouse_move(&mut self, event: &MouseMoveEvent, _: &mut Window, cx: &mut Context<Self>) {
        if self.is_selecting {
            let at = self.index_for_mouse(event.position);
            self.select_to(at, cx);
        }
    }

    fn utf16_to_utf8(&self, offset: usize) -> usize {
        let (mut u8o, mut u16o) = (0, 0);
        for ch in self.content.chars() {
            if u16o >= offset {
                break;
            }
            u16o += ch.len_utf16();
            u8o += ch.len_utf8();
        }
        u8o
    }
    fn utf8_to_utf16(&self, offset: usize) -> usize {
        let (mut u16o, mut u8o) = (0, 0);
        for ch in self.content.chars() {
            if u8o >= offset {
                break;
            }
            u8o += ch.len_utf8();
            u16o += ch.len_utf16();
        }
        u16o
    }
    fn range_to_utf16(&self, r: &Range<usize>) -> Range<usize> {
        self.utf8_to_utf16(r.start)..self.utf8_to_utf16(r.end)
    }
    fn range_from_utf16(&self, r: &Range<usize>) -> Range<usize> {
        self.utf16_to_utf8(r.start)..self.utf16_to_utf8(r.end)
    }
}

impl EntityInputHandler for TextArea {
    fn text_for_range(&mut self, range_utf16: Range<usize>, actual: &mut Option<Range<usize>>, _: &mut Window, _: &mut Context<Self>) -> Option<String> {
        let range = self.range_from_utf16(&range_utf16);
        actual.replace(self.range_to_utf16(&range));
        Some(self.content[range].to_string())
    }
    fn selected_text_range(&mut self, _: bool, _: &mut Window, _: &mut Context<Self>) -> Option<UTF16Selection> {
        Some(UTF16Selection { range: self.range_to_utf16(&self.selected_range), reversed: self.selection_reversed })
    }
    fn marked_text_range(&self, _: &mut Window, _: &mut Context<Self>) -> Option<Range<usize>> {
        self.marked_range.as_ref().map(|r| self.range_to_utf16(r))
    }
    fn unmark_text(&mut self, _: &mut Window, _: &mut Context<Self>) {
        self.marked_range = None;
    }
    fn replace_text_in_range(&mut self, range_utf16: Option<Range<usize>>, new_text: &str, _: &mut Window, cx: &mut Context<Self>) {
        let range = range_utf16.as_ref().map(|r| self.range_from_utf16(r)).or(self.marked_range.clone()).unwrap_or(self.selected_range.clone());
        self.content = (self.content[..range.start].to_owned() + new_text + &self.content[range.end..]).into();
        let at = range.start + new_text.len();
        self.selected_range = at..at;
        self.selection_reversed = false;
        self.marked_range = None;
        self.goal_x = None;
        cx.emit(AreaEvent::Changed);
        cx.notify();
    }
    fn replace_and_mark_text_in_range(&mut self, range_utf16: Option<Range<usize>>, new_text: &str, new_selected: Option<Range<usize>>, _: &mut Window, cx: &mut Context<Self>) {
        let range = range_utf16.as_ref().map(|r| self.range_from_utf16(r)).or(self.marked_range.clone()).unwrap_or(self.selected_range.clone());
        self.content = (self.content[..range.start].to_owned() + new_text + &self.content[range.end..]).into();
        self.marked_range = (!new_text.is_empty()).then(|| range.start..range.start + new_text.len());
        self.selected_range = new_selected
            .as_ref()
            .map(|r| self.range_from_utf16(r))
            .map(|r| r.start + range.start..r.end + range.start)
            .unwrap_or_else(|| range.start + new_text.len()..range.start + new_text.len());
        cx.notify();
    }
    fn bounds_for_range(&mut self, range_utf16: Range<usize>, _: Bounds<Pixels>, _: &mut Window, _: &mut Context<Self>) -> Option<Bounds<Pixels>> {
        let shaped = self.last.as_ref()?;
        let range = self.range_from_utf16(&range_utf16);
        let a = shaped.position(range.start);
        let b = shaped.position(range.end);
        let origin = shaped.bounds.origin - point(px(0.), self.scroll_y);
        Some(Bounds::from_corners(origin + a, origin + point(b.x, b.y + shaped.line_height)))
    }
    fn character_index_for_point(&mut self, p: Point<Pixels>, _: &mut Window, _: &mut Context<Self>) -> Option<usize> {
        Some(self.utf8_to_utf16(self.index_for_mouse(p)))
    }
}

struct AreaElement {
    area: Entity<TextArea>,
}

struct Prepaint {
    shaped: Option<Shaped>,
    quads: Vec<PaintQuad>,
    caret: Option<PaintQuad>,
    placeholder: bool,
}

impl IntoElement for AreaElement {
    type Element = Self;
    fn into_element(self) -> Self {
        self
    }
}

fn shape(area: &TextArea, width: Pixels, window: &mut Window) -> (Vec<HardLine>, bool) {
    let style = window.text_style();
    let (text, color, placeholder) = if area.content.is_empty() {
        (area.placeholder.clone(), area.placeholder_color.unwrap_or(Theme::muted().into()), true)
    } else {
        (area.content.clone(), style.color, false)
    };
    let line_height = px(area.line_height);
    let mut lines = Vec::new();
    let mut start = 0;
    let mut top = px(0.);
    for hard in text.split('\n') {
        let mut run = TextRun { len: hard.len(), font: style.font(), color, background_color: None, underline: None, strikethrough: None };
        if let Some(marked) = area.marked_range.as_ref().filter(|_| !placeholder)
            && marked.start >= start
            && marked.end <= start + hard.len()
        {
            run.underline = Some(UnderlineStyle { color: Some(color), thickness: px(1.), wavy: false });
        }
        let shaped = window
            .text_system()
            .shape_text(SharedString::from(hard.to_string()), px(area.size), &[run], Some(width), None)
            .ok()
            .and_then(|mut v| (!v.is_empty()).then(|| v.remove(0)));
        if let Some(line) = shaped {
            let height = line.size(line_height).height;
            lines.push(HardLine { start, line, top });
            top += height;
        }
        start += hard.len() + 1;
    }
    (lines, placeholder)
}

impl Element for AreaElement {
    type RequestLayoutState = ();
    type PrepaintState = Prepaint;

    fn id(&self) -> Option<ElementId> {
        None
    }
    fn source_location(&self) -> Option<&'static core::panic::Location<'static>> {
        None
    }

    fn request_layout(&mut self, _: Option<&GlobalElementId>, _: Option<&gpui::InspectorElementId>, window: &mut Window, cx: &mut App) -> (LayoutId, ()) {
        let area = self.area.clone();
        let mut style = Style::default();
        style.size.width = relative(1.).into();
        let id = window.request_measured_layout(style, move |known, available, window, cx| {
            let width = known.width.unwrap_or(match available.width {
                gpui::AvailableSpace::Definite(w) => w,
                _ => px(400.),
            });
            let a = area.read(cx);
            let (lines, _) = shape(a, width, window);
            let lh = px(a.line_height);
            let height = lines.last().map_or(lh, |l| l.top + l.line.size(lh).height);
            let max = (lh * a.max_lines as f32).min(px(a.max_height.unwrap_or(f32::MAX)));
            size(width, height.min(max).max(px(a.min_height)))
        });
        let _ = cx;
        (id, ())
    }

    fn prepaint(&mut self, _: Option<&GlobalElementId>, _: Option<&gpui::InspectorElementId>, bounds: Bounds<Pixels>, _: &mut (), window: &mut Window, cx: &mut App) -> Prepaint {
        let (lines, placeholder) = shape(self.area.read(cx), bounds.size.width, window);
        let area = self.area.read(cx);
        let lh = px(area.line_height);
        let shaped = Shaped { lines, bounds, line_height: lh };
        let cursor = area.cursor();
        let selected = area.selected_range.clone();
        // Keep the caret on screen.
        let caret_at = if placeholder { point(px(0.), px(0.)) } else { shaped.position(cursor) };
        let mut scroll = area.scroll_y;
        if caret_at.y - scroll + lh > bounds.size.height {
            scroll = caret_at.y + lh - bounds.size.height;
        }
        if caret_at.y < scroll {
            scroll = caret_at.y;
        }
        scroll = scroll.max(px(0.)).min((shaped.height() - bounds.size.height).max(px(0.)));
        let origin = bounds.origin - point(px(0.), scroll);
        let mut quads = Vec::new();
        let caret = if selected.is_empty() || placeholder {
            Some(fill(Bounds::new(origin + caret_at, size(px(2.), lh)), Theme::lavender()))
        } else {
            // One rectangle per visual row the selection crosses.
            let (a, b) = (shaped.position(selected.start), shaped.position(selected.end));
            let mut y = a.y;
            while y <= b.y {
                let x0 = if y == a.y { a.x } else { px(0.) };
                let x1 = if y == b.y { b.x } else { bounds.size.width };
                if x1 > x0 {
                    quads.push(fill(Bounds::from_corners(origin + point(x0, y), origin + point(x1, y + lh)), Theme::lavender_muted()));
                }
                y += lh;
            }
            None
        };
        self.area.update(cx, |a, _| a.scroll_y = scroll);
        Prepaint { shaped: Some(shaped), quads, caret, placeholder }
    }

    fn paint(&mut self, _: Option<&GlobalElementId>, _: Option<&gpui::InspectorElementId>, bounds: Bounds<Pixels>, _: &mut (), prepaint: &mut Prepaint, window: &mut Window, cx: &mut App) {
        let focus = self.area.read(cx).focus_handle.clone();
        window.handle_input(&focus, ElementInputHandler::new(bounds, self.area.clone()), cx);
        let scroll = self.area.read(cx).scroll_y;
        let shaped = prepaint.shaped.take().unwrap();
        window.with_content_mask(Some(gpui::ContentMask { bounds }), |window| {
            for quad in prepaint.quads.drain(..) {
                window.paint_quad(quad);
            }
            for l in &shaped.lines {
                let origin = point(bounds.left(), bounds.top() + l.top - scroll);
                let _ = l.line.paint(origin, shaped.line_height, TextAlign::Left, Some(bounds), window, cx);
            }
            if focus.is_focused(window)
                && let Some(caret) = prepaint.caret.take()
            {
                window.paint_quad(caret);
            }
        });
        let _ = prepaint.placeholder;
        self.area.update(cx, |a, _| a.last = Some(shaped));
    }
}

impl Render for TextArea {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .w_full()
            .key_context("TextArea")
            .track_focus(&self.focus_handle(cx))
            .cursor(CursorStyle::IBeam)
            .on_action(cx.listener(Self::backspace))
            .on_action(cx.listener(Self::delete))
            .on_action(cx.listener(Self::left))
            .on_action(cx.listener(Self::right))
            .on_action(cx.listener(Self::up))
            .on_action(cx.listener(Self::down))
            .on_action(cx.listener(Self::select_left))
            .on_action(cx.listener(Self::select_right))
            .on_action(cx.listener(Self::select_up))
            .on_action(cx.listener(Self::select_down))
            .on_action(cx.listener(Self::select_all))
            .on_action(cx.listener(Self::line_start))
            .on_action(cx.listener(Self::line_end))
            .on_action(cx.listener(Self::word_left))
            .on_action(cx.listener(Self::word_right))
            .on_action(cx.listener(Self::delete_word_left))
            .on_action(cx.listener(Self::paste))
            .on_action(cx.listener(Self::copy))
            .on_action(cx.listener(Self::cut))
            .on_action(cx.listener(Self::submit))
            .on_action(cx.listener(Self::newline))
            .on_action(cx.listener(Self::escape))
            .on_action(cx.listener(Self::show_character_palette))
            .on_mouse_down(MouseButton::Left, cx.listener(Self::on_mouse_down))
            .on_mouse_up(MouseButton::Left, cx.listener(Self::on_mouse_up))
            .on_mouse_up_out(MouseButton::Left, cx.listener(Self::on_mouse_up))
            .on_mouse_move(cx.listener(Self::on_mouse_move))
            .text_size(px(self.size))
            .line_height(px(self.line_height))
            .text_color(Theme::ink())
            .child(AreaElement { area: cx.entity() })
    }
}

impl Focusable for TextArea {
    fn focus_handle(&self, _: &App) -> FocusHandle {
        self.focus_handle.clone()
    }
}

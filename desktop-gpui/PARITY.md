# 1:1 parity with the web app

The target is the web app as it renders in Chrome at the same window size, Full mode and Simple mode,
Cozy theme first. Every screen is checked side by side against a live capture
(`tools/refshot.sh <name>`, references in `reference/`): same positions (within 2–3 px), same fonts,
colours, icons, wording and behaviour. Values come from the live page's computed styles, structure and
behaviour from the components named below.

Status: ✅ matches the reference · 🟡 native but not yet 1:1 · ⬜ not started

## Main screen (Full mode), `app/components/chat/shell/*`

| Area | Web source | Status |
| --- | --- | --- |
| Fonts (Instrument Sans, Fraunces at Chrome's optical size, JetBrains Mono), Lucide icons | globals.css, lucide-react 1.27 | ✅ |
| Rail: home + DM badge, servers, active/unread pills, mention badge, voice badge, add, explore, 4 DMs with presence | chat/rail.tsx | ✅ (folders, drag to reorder, right-click menu ⬜) |
| Sidebar header: eyebrow, Fraunces name, ••• | panels.tsx | ✅ (server menu ⬜) |
| Channel list: label, events chip, rows by kind, selected, unread pill, mention count, categories fold | panels.tsx, chat-shell-renderers.tsx | ✅ (banner header, kind picker, drag, channel menu ⬜) |
| Voice rooms in the list: LIVE, seats with timers, bot bars, mute/deafen, speaking ring | chat-shell-renderers.tsx | ✅ (stream hover card, drag to move ⬜) |
| User card: avatar, presence, name, status, mic/headphones/settings | panels.tsx `.discord-user-footer` | 🟡 (device menus, status picker, settings ⬜) |
| Header: kind icon, Fraunces name, topic, 7 tools | chat-header.tsx | 🟡 (tools open nothing yet) |
| Messages: grouping rules, day dividers, command lines, bot tags, `text-wrap: pretty`, 1px rhythm | message-row.tsx, message-list.tsx | ✅ |
| Markdown, mentions, spoilers, links | message-body.tsx | 🟡 (custom emoji, embeds, link unfurls ⬜) |
| Now-playing card | now-playing.tsx | ✅ (live progress bar ⬜) |
| Other cards: dnd, ai, system-pin, music-stats, lyricsnow, polls, games, files, voice messages | dnd-card.tsx, music-cards.tsx, game-card.tsx, message-file-card.tsx, voice-message.tsx | ⬜ |
| Hover toolbar (quick reactions, react, reply, more), context menus | message-row.tsx, message-context-menu.tsx, menus.tsx | ⬜ |
| Composer: +, multi-line, chevron, emoji, GIF, voice message / send | composer.tsx, emoji-picker.tsx, gif-picker.tsx | 🟡 (looks right; single line, pickers, upload, slash commands ⬜) |
| Members panel: search, online/offline groups, statuses | panels.tsx | ✅ (name plates, role groups, search ⬜) |
| Cosmetics: name plates, name fonts and effects, avatar frames, profile effects | cosmetics*.tsx, profile-fx-*.ts | ⬜ |

## Other screens

| Area | Web source | Status |
| --- | --- | --- |
| Sign-in, two-factor | auth-gate.tsx | 🟡 (passkeys, sign-up ⬜) |
| Simple mode | panels.tsx SimpleRooms, easy.css | ⬜ |
| DMs home, friends, requests | friends-view.tsx, requests-tab.tsx | ⬜ |
| Voice stage (the room view), tiles, bottom bar, soundboard | voice-stage*, voice-stage/* | ⬜ (joining works from the list) |
| Screen share and camera, watching streams | voice-stage, floating-screen-preview.tsx | ⬜ |
| Profile cards, user menu | user-profile-card.tsx, user-menu.tsx | ⬜ |
| Settings (all tabs), server settings | settings-dialog.tsx, settings/*, server-settings* | ⬜ |
| Threads, pins, saved, mentions, search, achievements panels | side-panels.tsx, achievements-panel.tsx | ⬜ |
| Events, forums, polls | events-panel.tsx, forum-board.tsx | ⬜ |
| Music player, DJ booth, widgets | music-player.tsx, widgets/* | ⬜ |
| Living room / club / tabletop / meadow / board hall (3D) | living-room*.ts, club-*.ts, tabletop-*.ts | ⬜ |
| Battlemap, dice, games, PDF viewer | battlemap.tsx, dice-*.ts, rota-board.tsx, pdf/* | ⬜ |
| Themes (all built-in), retro skins (MSN, Winamp, TeamSpeak) | lib/themes.ts, msn-chrome.tsx, retro-chrome.tsx | ⬜ |
| Notifications, tray, global hotkeys, updates | desktop shells | ⬜ |

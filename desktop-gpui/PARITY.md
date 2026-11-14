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
| Fonts (Instrument Sans, Fraunces at Chrome's optical size, JetBrains Mono, Nunito), Lucide icons | globals.css, lucide-react 1.27 | ✅ |
| UI strings in all 7 languages, resolved like lib/i18n.ts (`tools/export-i18n.mjs`) | lib/i18n.ts, lib/i18n-catalog | ✅ (strings not yet ported stay English) |
| Hoffy mascot, every face × pose (`tools/export-hoffy.mjs`) | lib/hoffy-svg.ts | ✅ (idle/wave motion ⬜) |
| Rail: home + DM badge, servers, active/unread pills, mention badge, voice badge, add, explore, 4 DMs with presence | chat/rail.tsx | ✅ (folders, drag to reorder, right-click menu ⬜) |
| Sidebar header: eyebrow, Fraunces name, ••• | panels.tsx | ✅ (server menu ⬜) |
| Channel list: label, events chip, rows by kind, selected, unread pill, mention count, categories fold | panels.tsx, chat-shell-renderers.tsx | ✅ (banner header, kind picker, drag, channel menu ⬜) |
| Voice rooms in the list: LIVE, seats with timers, bot bars, mute/deafen, speaking ring | chat-shell-renderers.tsx | ✅ (stream hover card, drag to move ⬜) |
| User card: avatar, presence, name, custom status or presence, mic/headphones/settings | user-footer.tsx | 🟡 (device menus, status picker, settings ⬜) |
| Header: kind icon, Fraunces name, topic, 7 tools | chat-header.tsx | 🟡 (tools open nothing yet) |
| Messages: grouping rules, day dividers, command lines, bot tags, `text-wrap: pretty`, 1px rhythm | message-row.tsx, message-list.tsx | ✅ |
| Markdown, mentions, spoilers, links, inline code, italics | message-body.tsx | ✅ |
| Links: picture links shown as the picture (proxied, 320 max), Tenor/Giphy pages as their GIF, YouTube card (thumbnail, play opens YouTube), preview cards from /api/unfurl (3 at most) | message-body.tsx, link-preview.tsx, lib/unfurl.ts | 🟡 (in-app players for YouTube/Spotify/SoundCloud…, message-link cards, invite cards ⬜) |
| Now-playing card | now-playing.tsx | ✅ (live progress bar ⬜) |
| Lyrics card (lines with times, source link), /ask answer card | lyrics-now.tsx, ai-answer-card.tsx | ✅ (live karaoke highlighting, timing nudge, follow-up chat ⬜) |
| D&D roll card (total, dice with natural 20/1, details, Roll again) | dnd-card.tsx | ✅ (spell/monster/item lookups, V5 and Rouse rolls, secret rolls, Roll again runs nothing yet ⬜) |
| Other cards: system-pin, music-stats, polls, games, voice messages | dnd-card.tsx, music-cards.tsx, game-card.tsx, message-file-card.tsx, voice-message.tsx | ⬜ |
| Hover card + toolbar (your quick reactions as outline icons, server emoji, add reaction, reply, edit), reaction pills, reply bar, `#channel` chips | message-row.tsx, message-reactions.tsx, outline-emoji.tsx | ✅ (shift-held extra actions, who-reacted popover ⬜) |
| Emoji picker: reactions (floating beside the button, toolbar kept up, Shift adds to quick reactions) and the composer's; search, category rail, Favorites (Alt stars, kept on this computer), server emoji, the web's 656 emoji, preview footer | emoji-picker.tsx, overlays.tsx, composer.tsx (`tools/export-emoji.py`) | ✅ ("Add to Quick Reactions" mode, upload button, hover scale ⬜) |
| Editing in place (Enter saves, Esc cancels, focus ring), deleting with the confirm dialog (Shift skips) | message-row.tsx, message-parts.tsx | ✅ (moderators deleting others' messages ⬜) |
| Message context menu: every item in Full mode, Pin greyed without MANAGE_MESSAGES, edit, delete/report confirms, copy text/link/ID with the notice bar, pin, bookmark with its toast, translate under the message, Esc and click-away close | message-context-menu.tsx, message-row.tsx, toast.tsx, message-translation.tsx | ✅ (Forward, Create Thread and Speak open nothing yet; bot menus; Simple mode's short list ⬜) |
| Custom `:emoji:` inline in text (the server's images, 1.35em, painted into the text's own slot), standard `:shortcode:` → emoji (`tools/export-shortcodes.mjs`) | message-body.tsx, lib/emoji-shortcodes.ts | ✅ |
| Author line: role colour (top role), role icon, DISCORD / NEWS / BOT tags, reply line (bold author, 340px snippet) | message-row.tsx, role-icon.tsx | ✅ (owner crown, pride badges, TTS tag ⬜) |
| Composer: multi-line textarea (Shift-Enter, grows to 40vh), reply bar, + (pick files: staged thumbnails / file tiles with ×, pictures shrunk like shrinkImage, uploaded then sent in one message), emoji picker, send/mic | composer.tsx, use-shell-messaging.ts, shrink-image.ts | 🟡 (ALT text, send original, files over 40 MB, drag and drop, paste, slash commands, voice messages ⬜) |
| GIF / sticker picker: Hoffy and gang stickers (searchable), Klipy GIFs and stickers, server stickers; picking sends the link | gif-picker.tsx, lib/hoffy-stickers.ts | ✅ (sticker upload/removal, emoji tab inside it, animated Hoffy SVGs ⬜) |
| Pictures in messages (column width up to 480, height by shape up to 380, filled, 10px corners) and file cards (type badge, description, Download/Open) | message-row.tsx, message-file-card.tsx, upload-sniff.ts | ✅ (galleries of several pictures, inline video/audio players, spoiler files, lightbox ⬜) |
| Unread bar: a channel with unread messages opens on the first one (centred, NEW line), "N new messages since … · Mark as read" stuck on top until the newest shows | message-list.tsx, use-shell-history.ts | ✅ |
| Members panel: search, online/offline groups, statuses | panels.tsx | ✅ (name plates, role groups, search ⬜) |
| Name fonts (29, fetched like loadNameFont) and name effects (25, CSS painted as SVG, first frame) | lib/profile-style.ts, app/profile-style.css, cosmetics-mz.css | ✅ (hover/live animation ⬜) |
| Avatar decorations (36, the web's own SVG via `tools/export-cosmetics.mjs`) | cosmetics.tsx | ✅ (ring-style decorations, flap/glow animation ⬜) |
| Nameplates (42: CSS backgrounds via `cssbg.rs` + art, `tools/extract-nameplates.py`) | cosmetics*.css, cosmetics.tsx | ✅ in the member list (user card, profile card ⬜) |
| Profile effects, voice rings, join flourishes, pride badges | cosmetics.tsx, profile-fx-*.ts | ⬜ |

## Other screens

| Area | Web source | Status |
| --- | --- | --- |
| Sign-in, two-factor | auth-gate.tsx | 🟡 (passkeys, sign-up ⬜) |
| Simple mode | panels.tsx SimpleRooms, easy.css | ⬜ |
| DMs home: sidebar (search, friends, DM rows), friends view (tabs, search, counts, Hoffy empty states) | panels.tsx, friends-view.tsx | ✅ (add-friend form submit, accept/ignore/block actions, active-now panel ⬜) |
| DM conversation: header (Chrome's flex-shrink reproduced), start banner, NEW line, participants panel, day labels in the system locale | chat-header.tsx, message-list.tsx, app/lib/chat/format.ts | ✅ (calls from the header, pin/close actions ⬜) |
| Voice stage: opens (and joins) from the room, header (speaker, name, "· N in call", grid/table/map, chat toggle), avatar tiles (glow, caption with seat time, green speaking pulse), control bar (mic, deafen, leave work), the room's own chat (system lines, messages, composer), joined room card and "voice connected · region" bar in the sidebar | voice-stage.tsx, voice-stage/*, voice-chat-panel.tsx, mini-voice-bar.tsx | 🟡 (table and map views, soundboard, seat picker, device settings, camera/screen buttons, pop-out, fullscreen, games ⬜) |
| Screen share and camera, watching streams | voice-stage, floating-screen-preview.tsx | ⬜ |
| Profile card (from message names/avatars and member rows): tinted by the member's colour, banner, avatar + presence + decoration, status bubble, name + member tag (Owner/Admin/Mod/role), @username • pronouns, tagline, bio (3-line clamp), roles, mutual servers/friends, private note (saves on Enter/blur), member since, friend/DM/Mention/Block, self tiles | user-profile-card.tsx, profile-look.ts, cosmetics.css | 🟡 (styled cards (theme/finish/pattern/edge), profile frames and effects, badges shelf, achievements, social links, Spotify/activity, role editing ⬜) |
| User menu (right-click on a member row, name or avatar): name, @username, time in voice, Message, Block/Unblock, Mute for me (works in calls), their volume (saved; the call itself has no per-person volume) | user-menu.tsx | 🟡 (nickname, server avatar, pin DM, moderation: server mute, move, timeout, kick, ban, invites ⬜) |
| Settings (all tabs), server settings | settings-dialog.tsx, settings/*, server-settings* | ⬜ |
| Pins, saved, mentions (All/Unread) popovers; search strip with filter pills; jumping to a message (pages back until loaded, centred, blue flash) | side-panels.tsx, use-shell-history.ts | ✅ (Unpin needs the pin permission; DM header tools ⬜) |
| Threads, achievements, find users, follow channel, header "More" menu | thread panel, achievements-panel.tsx | ⬜ |
| Events, forums, polls | events-panel.tsx, forum-board.tsx | ⬜ |
| Music player, DJ booth, widgets | music-player.tsx, widgets/* | ⬜ |
| Living room / club / tabletop / meadow / board hall (3D) | living-room*.ts, club-*.ts, tabletop-*.ts | ⬜ |
| Battlemap, dice, games, PDF viewer | battlemap.tsx, dice-*.ts, rota-board.tsx, pdf/* | ⬜ |
| Themes (all built-in), retro skins (MSN, Winamp, TeamSpeak) | lib/themes.ts, msn-chrome.tsx, retro-chrome.tsx | ⬜ |
| Notifications, tray, global hotkeys, updates | desktop shells | ⬜ |

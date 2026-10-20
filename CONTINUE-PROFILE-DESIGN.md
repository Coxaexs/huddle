# Continue: profile style (names, card themes, voice) and cosmetics

Untracked handoff note. Read this before touching profile styles again.

## State (2026-10-13 ~10:40)

- **LOCAL `main` = `e56218d`** in the desktop repo: `2ec85e8` (the redo) + `e56218d` (follow-up: name animation setting, own join flourish, liquid, light theme, route tests), fast-forwarded from the venues commit 378eda4. `main` is checked out in **`~/huddle-profile-v2`** (this directory). **Not pushed. Deployed to hoffle.online at 10:44.**
- `~/huddle-venues` belongs to the venues session (now on `venues-polish`, with its own uncommitted board-hall work); leave it alone.
- Server copy of the same work: `~/huddle-profile`, branch `profile-style` (`b6abf12` on top of the old first pass `d89ec24` and `1cb8239 baseline`). Don't push that branch: its base is a snapshot of someone else's WIP.
- Checks on `e56218d` (server sandbox `~/ps-merge-check`): `tsc --noEmit` clean, `vitest run` 940/940 (104 files).
- `SCHEMA_VERSION` goes 13 → 14 (adds `users.profile_style TEXT NOT NULL DEFAULT '{}'`). If another branch also bumps to 14, renumber one of them.

## What it is

One JSON column `profile_style`; every value is an id from the catalogs in `lib/profile-style.ts` or a `#rrggbb` colour (`normalizeProfileStyle`, tests in `test/profile-style.test.ts`).

| Area | Options |
| --- | --- |
| Display name | 27 fonts (Google Fonts, all Latin Extended, loaded per family on demand) × 23 effects with 0–3 colours |
| Card theme | primary/accent colours, auto dark/light text, 8 finishes, 14 patterns, 5 edges, tilt/float/still, 8 open animations |
| Voice | 14 speaking auras, ring colour, themed tile, 13 join flourishes |
| Editor | Name / Card / Voice studios + Looks gallery (16 presets), HSV colour picker, "From avatar", "Surprise me" |

Files:
- `lib/profile-style.ts` catalog, types, looks, validation, colour helpers
- `app/lib/profile-style.ts` registry (voice tiles look styles up by user id), font loader, `nameLook`, `cardLook` (+ contrast-safe `--pt-btn`), `useCardPointer`, `voiceTileLook`, `colorsFromImage`
- `app/components/profile-style-parts.tsx` `StyledName`, `CardBackdrop` / `CardChrome`, `VoiceAura` (speaking aura + join flourish)
- `app/components/settings/style-studio.tsx` the four studios and `ColorField`
- `app/components/settings/accessibility-tab.tsx` "Animate name effects" (hover / always / never → `html[data-name-motion]`, localStorage `huddle_name_motion`)
- Tests: `test/profile-style.test.ts` (validation), `test/profile-style-route.test.ts` (PATCH route with a fake D1), `test/accessibility-tab.test.tsx`
- `app/profile-style.css` all visuals (names → cards → voice → editor)
- Wired into: message-row, member list (panels), user-footer, user-profile-card (popover), profile-card (modal), profile-preview-card, voice-stage/stage-body (stage + film tiles), chat-shell sidebar voice list, profile-tab rail.

Behaviour worth knowing:
- Names animate always on cards/voice (`.pn-live`), but in chat and the member list they rest on frame 0 and only play while the row is hovered. Off under reduced motion, `html[data-motion=reduced]`, and Accessibility → Display Name Styles (`data-display-name-styles=off` strips them).
- Cards without any style stay still (no surprise tilt). A themed card defaults to tilt.
- The centred popover now uses `translate: -50% -50%` instead of `transform` (tilt and entrance own `transform`).
- Join flourishes play for people who join after you opened the stage, and for anyone (you too) whose seat is under 6 s old on the hub clock (`serverNow`) when it opens. Each seat (`connectionId:joinedAt`) plays once per page load.

## Deployed (2026-10-13 10:44 CEST)

`~/ps-work/profile-style.patch` (= `git diff 378eda4 e56218d`, 25 files) was applied with a plain `git apply` to the server's live `~/huddle` (uncommitted there, like the other sessions' WIP) and shipped with `scripts/deploy.sh`, which also synced the Oracle standby. Backup of the 18 pre-existing files it touched: server `~/wip-backup-profile-20261013T104121.tgz`.

- Checks after deploy: local and public `/hangout/` 200, served CSS has the new classes, `users.profile_style` exists (migration ran, SCHEMA_VERSION 14), no service errors after the swap.
- In the live tree tsc was clean and vitest 939/940: `lib/mic-worklet.test.ts` timed out under load (6 s) and passes on its own.
- Rollback: `scripts/deploy.sh --rollback` (previous build), and for the source `tar xzf ~/wip-backup-profile-20261013T104121.tgz -C ~/huddle` plus deleting the 7 new files (`lib/profile-style.ts`, `app/lib/profile-style.ts`, `app/profile-style.css`, `app/components/profile-style-parts.tsx`, `app/components/settings/style-studio.tsx`, `test/profile-style*.test.ts`).
- The service also crash-looped for ~15 s at 10:42:08 ("No such module __vite_rsc_assets_manifest.js"), before this deploy started; systemd restarted it at 10:42:22. Cause not found (looks like something touching `dist/` in place).

## Cosmetics, second wave (2026-10-13 evening)

`main` = `a5ff097`: `fa1cbd5` (snapshot of the profile-effects session's server WIP: ronin/symbiote/warp/bats/blood effects, so main matches what is live) + `a5ff097` (new cosmetics).

- `app/components/cosmetics-extra.tsx` + `app/cosmetics-extra.css` (`cx-` classes). The maps are merged into the registries in `cosmetics.tsx` with `Object.assign`; catalog entries in `settings/constants.ts`.
- 20 nameplates (`NAMEPLATE_FIT_WHOLE` lists the ones drawn around one subject: they use `preserveAspectRatio="xMaxYMid meet"` so a 44px row doesn't crop them), 14 avatar decorations, 9 profile frames (`EdgeFade` mask feathers ground/water pieces), 7 effects (3 particle specs, 4 scenes).
- Rule learned: a CSS animation on an SVG element replaces its `transform` attribute, so mirrored/positioned parts need the animation on a child group.
- Test: `test/cosmetics-extra.test.ts` (every new piece is in its picker, ids unique and savable, no id is both a scene and a particle effect).
- Harness: `cosm` scene, `what=plates|decos|frames|effects&ids=a,b`.
- Deployed 2026-10-13 ~21:10 via `~/ps-work/cosmetics.patch` (= `git diff fa1cbd5 a5ff097`); backup of the 3 touched files `~/wip-backup-cosmetics-20261013T210939.tgz`. Live tree: tsc clean, vitest 944/944.

## Visual harness (server)

`~/ps-work/harness`: `./build.sh` (esbuild of `entry.tsx` against `~/ps-merge-check`, an rsync of this checkout, copies `app/profile-style.css` to `ps.css`), static server `python3 -m http.server 8811` from that dir, then:

```sh
node shoot.mjs <scene> ../out/x.png '<query>' W H waitMs [selector]
node shoot.mjs frames voice ../out/jf 'what=joins&arm=200' 1200 700 1.6 6
```

Scenes: `editor` (`click=.pe-tile-style|.pe-tile-card|.pe-tile-voice|.pe-looks-btn` opens a studio), `popover`, `modal`, `chat`, `gallery` (`what=effects|fonts|looks`, `live=0`, `size=16`, `name=` URL-encoded), `voice` (`what=rings|joins`). `theme=light|msn|...` picks an app theme. `style=` is base64 JSON of a ProfileStyle; `python3 looks.py <ids>` prints them from this checkout's catalog. Screenshots from this pass: `~/ps-work/out`.

## Done in the follow-up (e56218d)

- Accessibility setting for name animation in chat (hover / always / never).
- Your own join flourish; no replays on re-layout; no avatar remount after a flourish.
- Liquid redesigned; Wave/Jelly fall back to a gradient on names with `[c=...]` markup.
- Studios checked and fixed on the light theme, at phone width (400px), and under MSN (themed popover renders fine there).
- Real route test for saving a style.

## Still open (nice to have)

- Per-letter Wave/Jelly *on* markup names (would need splitting StyledText segments into letters).
- Styled names in reply previews, DM list and mentions (they show plain there).
- A join flourish preview in the sidebar voice list (only stage and film tiles play them).
- End-to-end check in a running Hoffle (only harness renders + unit/route tests so far).

# Keep going: venues (tabletop first)

Untracked notes for the next session. Written 2026-10-13 after the first tabletop pass.

## Where things are

- Checkout: `~/huddle-venues` (git worktree of `~/huddle`, on `main`; branch `venues-polish` points at the same commit).
  Keep worktrees **out of** the tool's worktrees folder inside `~/huddle`: anything there was wiped ~3 minutes after creation, twice.
- `main` = origin/main f2caf58 + `29a58a0` (snapshot of the server's uncommitted venue WIP, incl. other sessions' admin/api work)
  + `5156522`, `378eda4` (tabletop). **Not pushed, not deployed.** The server `~/huddle` still has that WIP uncommitted on f2caf58.
- Desktop has no node. Checks run on the server sandbox `~/venues-sandbox` (node_modules symlinked to `~/huddle`):
  - sync: `rsync -rlc app lib coxaexs@192.168.1.198:venues-sandbox/` from `~/huddle-venues`
  - `PATH=$PWD/node_modules/node/bin:$PATH npx tsc --noEmit -p .` and `npx vitest run` (927 pass)
- Screenshot harness: `~/venues-sandbox/.harness` on the server.
  `bash ~/venues-sandbox/.harness/shots.sh OUTDIR LIST` (LIST lines are `name|query`; see `baseline.txt`, `tt.txt`).
  Query params: `venue` (lounge/tabletop/boardhall/meadow), `theme`, `cam=px,py,pz,tx,ty,tz`, `noceil`, `night=0|1`,
  `ms` (keep animating), tabletop: `people` (tents, GM screen, turn marker), `dice`, `tokens` (ogre + PC token), `hidden` (GM roll);
  boardhall: `game` (4 players, houses). It waits for GLB props to load. Only one swiftshader browser at a time.
  Baseline shots of all four venues: `~/venues-shots/baseline` on the server.

## Tabletop: done

- Map sunk in a raised wooden rail with a brass inlay; candles on brass dishes, tankards and dice pouches stand on the rail
  between seats, so the play area is clear for dice and character tokens.
- New battle map ("The Sunken Keep": flagged rooms, doors, pillars, stair, river + bridge, road, wood, labels, compass).
- Painted minis: `miniFigure()` in `tabletop-extras.ts` (fighter, wizard, rogue, cleric, beast, dragon). Used for a tiered
  stand on the sideboard, a lit glass cabinet on the west wall, and the live **monster token** (was a black capsule).
- Name tents now stand on the table as folded cards (name both sides) instead of floating flat 16 cm up.
- Hidden GM rolls land in a strip behind the screen (`behindScreen()` now returns at/radius/spacing/squash;
  `TableDice.roll` takes `squash`). Before, they could land on the rim or in front of the screen.
- Real bookcases (the spines were buried inside the frame box), spindle-back chairs, dark dome pendants,
  four wall sconces, a picture light over the sideboard; spot toned down so the map is legible.
- Screen shows a themed "Roll for initiative" card when idle: `BuiltRoom.idleScreen` + `blankScreen()` in `living-room.tsx`
  (any venue can set `idleScreen` now).

## Tabletop: still to do

- [ ] Check hidden rolls from above (`hidden=1`, overhead cam) for every GM seat: dice should stay between screen and rail.
- [ ] Map is still hot in the middle under the spot; try a softer falloff or a slightly darker paper.
- [ ] "YOUR TURN" on a tent is tiny/clipped at the bottom of the card; maybe a gold border/glow on the tent instead.
- [ ] PC tokens (`createCharacterToken`, non-monster) are still capsules: could use `miniFigure` by class.
- [ ] Vampire room: walls lit now but still very dark; cyberpunk/matrix fine.
- [ ] Perf check on a real GPU: 7 lights (spot with shadows, 6 point lights) + more meshes than before.

## Round 2 (2026-10-13): board hall, meadow, living room done

Branch `venues-polish` 6091b67..0ded64b (on top of the tabletop). Handed to the server via a self-deleting `~/run_this.sh`
(files staged in server `~/venues-live-check`). Local `main` NOT updated: it is checked out in `~/huddle-profile-v2`
(another session) and already has that session's commit 2ec85e8 on top of the tabletop.

- Board hall: pawns sharing a tile stand on staggered corners; carpet runner round the board; pilasters with sconces
  and framed space posters on every wall; bunting; DeepPixel title card on the screen when idle.
- Meadow: pond fades from deep to clear over a sandy shore, reeds/cattails, lily flowers, fish-rise ripples;
  blade grass (off the paths) and flower patches; layered sprite fire with embers and smoke, teepee firewood,
  sawn log-seat ends; clouds low over the hills and a sun; visible stars (screen-sized points) and a cratered moon;
  cabin door swung back, open firebox with its own fire, window frames behind the glass; idle screen card.
- Living room: sprite flames on the logs (cyberpunk keeps its wireframe holo-fire); mug steam no longer draws
  its square (that was the "translucent rectangle"); dim themed picture on the TV when idle.
- `flameTexture()` now lives in `living-room-scene.ts`.

## Still to do

- Tabletop list above.
- Board hall: posters and pilasters are the same in every theme; vampire/matrix could get their own.
- Meadow: perf check on a weak GPU (1600 tufts + 260 flowers + 90 reeds instanced, a few more sprites).
- Living room: vampire theme is still very dark away from the fire.
- Round 2 checks: tsc clean and vitest 940/940 on the live tree + these files; user ran run_this.sh and deployed 10:58.

/**
 * The board hall: the room's DeepPixel game as a giant board on the floor.
 *
 * The board is drawn from the game's own spaces (names, colours, prices), so
 * whatever map the game is on is what you walk on. Pawns the size of a person
 * hop from tile to tile as players move, houses and hotels go up on the
 * streets, owners' colours are laid along the tiles they own, and two big dice
 * tumble in the middle on every roll. All of it follows the live game; see
 * app/lib/board-game.ts for the watcher that feeds it.
 */
import * as THREE from "three";
import type { RoomTheme } from "../hooks/use-living-room";
import { BOARD_HALL, FLOOR_BOARD_SIZE } from "../lib/living-room";
import { boardOf, spaceGlyph, tileSpot, travelDirection, type BoardGameState, type BoardPlayer, type BoardSpace } from "../lib/board-game";
import type { DiceRollEvent } from "@/lib/protocol";
import { playDiceRollSound } from "../lib/dice-sounds";
import { TableDice } from "./tabletop-dice";
import { LOOKS, box, canvasTexture, cushion, floorMaterial, glowTexture, mat, plant, plasterOver, tagSeat, wallTexture, woodMaterial, type BuiltRoom } from "./living-room-scene";
import { mergeStatics } from "./living-room-fx";
import { dress, fabric } from "./room-surfaces";
import { ThingKit } from "./room-things";
import { playFanfare } from "./living-room-sounds";

const BOARD_Y = 0.012;
const TEXTURE_SIZE = 2048;
const PAWN_HEIGHT = 1.05;
const HOP_SECONDS = 0.2;
/** The /roll dice are table-sized; on a floor board they are thrown this many times bigger. */
const DICE_SCALE = 4;
const FALLBACK_COLOURS = ["#EF4444", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316"];

/** Lighter or darker version of a hex colour, for tile tints. */
const shade = (colour: string, amount: number) => `#${new THREE.Color(colour).offsetHSL(0, 0, amount).getHexString()}`;

/** Draws the whole board, tiles and middle, onto one canvas: canvas up is north. */
function drawBoard(ctx: CanvasRenderingContext2D, board: BoardSpace[]) {
  const px = TEXTURE_SIZE / FLOOR_BOARD_SIZE;
  const S = TEXTURE_SIZE;
  // Board base and the middle.
  ctx.fillStyle = "#16301f";
  ctx.fillRect(0, 0, S, S);
  const middle = ctx.createRadialGradient(S / 2, S / 2, 40, S / 2, S / 2, S * 0.5);
  middle.addColorStop(0, "#2a5a3a");
  middle.addColorStop(1, "#17331f");
  ctx.fillStyle = middle;
  ctx.fillRect(0, 0, S, S);
  const first = tileSpot(0, board.length);
  const inner = (FLOOR_BOARD_SIZE / 2 - first.depth) * px;
  // A faint grid of pixels across the middle: it is DeepPixel, after all.
  ctx.fillStyle = "rgba(255,255,255,0.035)";
  for (let y = S / 2 - inner; y < S / 2 + inner; y += 32) {
    for (let x = S / 2 - inner; x < S / 2 + inner; x += 32) if (((x + y) / 32) % 2 === 0) ctx.fillRect(x, y, 32, 32);
  }
  // The name across the middle, diagonally like the real thing.
  ctx.save();
  ctx.translate(S / 2, S / 2);
  ctx.rotate(-Math.PI / 4);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 210px system-ui, sans-serif";
  ctx.lineWidth = 18;
  ctx.strokeStyle = "#0d1f14";
  ctx.strokeText("DEEPPIXEL", 0, 0);
  const title = ctx.createLinearGradient(-600, 0, 600, 0);
  title.addColorStop(0, "#ffd166");
  title.addColorStop(0.5, "#fff3c4");
  title.addColorStop(1, "#ffb347");
  ctx.fillStyle = title;
  ctx.fillText("DEEPPIXEL", 0, 0);
  ctx.font = "600 54px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,243,196,0.75)";
  ctx.fillText("live from the board hall", 0, 150);
  ctx.restore();
  // Card piles drawn on the board: Surprise and Treasure.
  const pile = (cx: number, cy: number, label: string, colour: string, glyph: string) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(-150, -95, 310, 200);
    ctx.fillStyle = colour;
    ctx.strokeStyle = "#fff8e1";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.roundRect(-160, -105, 310, 200, 18);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fff8e1";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "800 46px system-ui, sans-serif";
    ctx.fillText(label, -5, 40);
    ctx.font = "80px system-ui, sans-serif";
    ctx.fillText(glyph, -5, -35);
    ctx.restore();
  };
  pile(S / 2 - inner * 0.45, S / 2 - inner * 0.45, "SURPRISE", "#e8590c", "?");
  pile(S / 2 + inner * 0.45, S / 2 + inner * 0.45, "TREASURE", "#1971c2", "💰");

  // The tiles.
  board.forEach((space, index) => {
    const spot = tileSpot(index, board.length);
    const w = spot.width * px;
    const d = spot.depth * px;
    ctx.save();
    ctx.translate((spot.x + FLOOR_BOARD_SIZE / 2) * px, (spot.z + FLOOR_BOARD_SIZE / 2) * px);
    // Text reads from outside the board, its top towards the middle.
    ctx.rotate((spot.edge * Math.PI) / 2);
    const x0 = -w / 2;
    const y0 = -d / 2;
    ctx.fillStyle = spot.corner ? "#f3ead2" : "#efe6cc";
    ctx.fillRect(x0, y0, w, d);
    ctx.strokeStyle = "#1c2a20";
    ctx.lineWidth = 5;
    ctx.strokeRect(x0, y0, w, d);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#1d1a14";
    const fit = (text: string, size: number, weight: number, y: number, maxWidth = w - 18) => {
      let s = size;
      ctx.font = `${weight} ${s}px system-ui, sans-serif`;
      while (ctx.measureText(text).width > maxWidth && s > 14) {
        s -= 2;
        ctx.font = `${weight} ${s}px system-ui, sans-serif`;
      }
      ctx.fillText(text, 0, y);
    };
    if (spot.corner) {
      ctx.save();
      // The jail's words sit on the visitors' strip, clear of the cell.
      if (space.type === "jail") ctx.translate(w * 0.16, d * 0.16);
      ctx.rotate(Math.PI / 4);
      const tint = space.type === "go" ? "#c92a2a" : space.type === "go_to_jail" ? "#1864ab" : space.type === "jail" ? "#e67700" : "#2b8a3e";
      ctx.fillStyle = tint;
      ctx.font = "120px system-ui, sans-serif";
      ctx.fillText(spaceGlyph(space), 0, -40);
      const words = space.name.split(" / ");
      words.forEach((word, i) => fit(word.toUpperCase(), 44, 900, 60 + i * 50, w * 1.1));
      ctx.restore();
      if (space.type === "jail") {
        // The cell itself: the corner towards the middle of the board (up, and the way play runs: left), behind bars.
        ctx.fillStyle = "rgba(230,119,0,0.18)";
        ctx.fillRect(x0, y0, w * 0.58, d * 0.58);
        ctx.strokeStyle = "#5c3d00";
        ctx.lineWidth = 6;
        ctx.strokeRect(x0, y0, w * 0.58, d * 0.58);
        for (let i = 1; i < 5; i++) {
          ctx.beginPath();
          ctx.moveTo(x0 + (w * 0.58 * i) / 5, y0);
          ctx.lineTo(x0 + (w * 0.58 * i) / 5, y0 + d * 0.58);
          ctx.stroke();
        }
      }
      ctx.restore();
      return;
    }
    const band = d * 0.24;
    if (space.type === "property" && space.color) {
      ctx.fillStyle = space.color;
      ctx.fillRect(x0, y0, w, band);
      ctx.strokeRect(x0, y0, w, band);
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      ctx.fillRect(x0, y0, w, band * 0.3);
      ctx.fillStyle = "#1d1a14";
      const words = space.name.split(" ");
      if (words.length > 1 && space.name.length > 9) {
        fit(words.slice(0, Math.ceil(words.length / 2)).join(" ").toUpperCase(), 40, 800, y0 + band + 52);
        fit(words.slice(Math.ceil(words.length / 2)).join(" ").toUpperCase(), 40, 800, y0 + band + 96);
      } else fit(space.name.toUpperCase(), 40, 800, y0 + band + 62);
    } else {
      ctx.font = "92px system-ui, sans-serif";
      ctx.fillStyle = space.type === "chance" ? "#e8590c" : space.type === "community_chest" ? "#1971c2" : "#495057";
      ctx.fillText(spaceGlyph(space), 0, 6);
      ctx.fillStyle = "#1d1a14";
      fit(space.name.toUpperCase(), 34, 800, y0 + 50);
    }
    if (space.price) fit(`$${space.price}`, 36, 700, d / 2 - 34);
    ctx.restore();
  });
  // A frame round the outside.
  ctx.strokeStyle = "#0d1f14";
  ctx.lineWidth = 16;
  ctx.strokeRect(8, 8, S - 16, S - 16);
}

function labelTexture(text: string, colour: string) {
  const texture = canvasTexture(512, 128, (ctx) => {
    ctx.font = "700 54px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const width = Math.min(500, ctx.measureText(text).width + 60);
    ctx.fillStyle = "rgba(10,10,14,0.72)";
    ctx.beginPath();
    ctx.roundRect(256 - width / 2, 22, width, 84, 42);
    ctx.fill();
    ctx.strokeStyle = colour;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, 256, 66, 460);
  });
  return texture;
}

interface Pawn {
  id: string;
  group: THREE.Group;
  label: THREE.Sprite;
  key: string;
  /** Tile it stands on (or is hopping to). */
  tile: number;
  /** Spots still to hop to, one tile at a time. */
  queue: THREE.Vector3[];
  hopStart: number;
  hopSeconds: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  shown: THREE.Vector3;
}

/** Everything on the board that follows the game. */
export class FloorBoard {
  readonly group = new THREE.Group();
  private readonly boardMaterial: THREE.MeshStandardMaterial;
  private boardKey = "";
  private boardTexture: THREE.CanvasTexture | null = null;
  private board: BoardSpace[] = boardOf(null);
  private pawns = new Map<string, Pawn>();
  private estate = new THREE.Group();
  private estateKey = "";
  private readonly houseGeometry: THREE.BufferGeometry;
  private readonly hotelGeometry: THREE.BufferGeometry;
  private readonly houseMaterial = mat("#2f9e44", 0.55);
  private readonly hotelMaterial = mat("#c92a2a", 0.5);
  private readonly diceRoot = new THREE.Group();
  private readonly dice: TableDice;
  private diceKey = "";
  private readonly turnRing: THREE.Mesh;
  private readonly turnArrow: THREE.Mesh;
  private readonly turnLight: THREE.SpotLight;
  private currentId: string | null = null;
  private game: BoardGameState | null = null;
  private readonly scoreCanvas = document.createElement("canvas");
  readonly scoreTexture: THREE.CanvasTexture;
  private now = 0;

  constructor() {
    this.boardMaterial = mat("#ffffff", 0.82);
    const surface = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_BOARD_SIZE, FLOOR_BOARD_SIZE), this.boardMaterial);
    surface.rotation.x = -Math.PI / 2;
    surface.position.y = BOARD_Y;
    surface.receiveShadow = true;
    surface.userData.floor = true;
    this.group.add(surface, this.estate);
    this.drawBoard();

    // A house is a box with a pitched roof; a hotel is a longer, taller one.
    const house = new THREE.BoxGeometry(0.26, 0.2, 0.26);
    house.translate(0, 0.1, 0);
    const roof = new THREE.ConeGeometry(0.22, 0.16, 4);
    roof.rotateY(Math.PI / 4);
    roof.translate(0, 0.28, 0);
    this.houseGeometry = mergeGeometries([house, roof]);
    const hotel = new THREE.BoxGeometry(0.62, 0.34, 0.3);
    hotel.translate(0, 0.17, 0);
    const hotelRoof = new THREE.ConeGeometry(0.4, 0.2, 4);
    hotelRoof.rotateY(Math.PI / 4);
    hotelRoof.scale(1.1, 1, 0.55);
    hotelRoof.translate(0, 0.44, 0);
    this.hotelGeometry = mergeGeometries([hotel, hotelRoof]);

    // The same dice as /roll, thrown from the roller's pawn into the middle of the board.
    this.diceRoot.scale.setScalar(DICE_SCALE);
    this.group.add(this.diceRoot);
    this.dice = new TableDice(this.diceRoot, { surfaceY: BOARD_Y / DICE_SCALE, centre: { x: 0, z: 0 }, radius: 0.5 });

    // Whose turn it is: a glowing ring at their pawn's feet, an arrow over its head and a spotlight.
    this.turnRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 40), new THREE.MeshBasicMaterial({ color: "#ffd166", transparent: true, opacity: 0.85, toneMapped: false, side: THREE.DoubleSide }));
    this.turnRing.rotation.x = -Math.PI / 2;
    this.turnArrow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 4), new THREE.MeshBasicMaterial({ color: "#ffd166", toneMapped: false }));
    this.turnArrow.rotation.x = Math.PI;
    this.turnLight = new THREE.SpotLight("#fff1cf", 0, 9, Math.PI / 9, 0.5, 1.2);
    this.turnLight.position.set(0, 6, 0);
    this.group.add(this.turnRing, this.turnArrow, this.turnLight, this.turnLight.target);
    this.turnRing.visible = this.turnArrow.visible = false;

    this.scoreCanvas.width = 1024;
    this.scoreCanvas.height = 640;
    this.scoreTexture = new THREE.CanvasTexture(this.scoreCanvas);
    this.scoreTexture.colorSpace = THREE.SRGBColorSpace;
    this.drawScores();
  }

  private drawBoard() {
    const key = this.board.map((space) => `${space.name}|${space.color ?? ""}|${space.price ?? ""}`).join(",");
    if (key === this.boardKey) return;
    this.boardKey = key;
    this.boardTexture?.dispose();
    const texture = canvasTexture(TEXTURE_SIZE, TEXTURE_SIZE, (ctx) => drawBoard(ctx, this.board));
    texture.anisotropy = 8;
    this.boardTexture = texture;
    this.boardMaterial.map = texture;
    this.boardMaterial.needsUpdate = true;
  }

  /** Where a pawn stands on its tile: players sharing a tile spread out over it. */
  private standOn(tile: number, slot: number, of: number, jailed: boolean): THREE.Vector3 {
    const spot = tileSpot(tile, this.board.length);
    const along = { x: -spot.inZ, z: spot.inX };
    let cx = spot.x;
    let cz = spot.z;
    let reach = spot.corner ? spot.width * 0.55 : spot.width * 0.7;
    if (spot.corner && this.board[tile]?.type === "jail") {
      // Prisoners stand in the cell, visitors on the outer edge.
      const inward = jailed ? 0.25 : -0.3;
      cx += spot.inX * spot.depth * inward - (jailed ? along.x * spot.depth * 0.2 : 0);
      cz += spot.inZ * spot.depth * inward - (jailed ? along.z * spot.depth * 0.2 : 0);
      reach *= 0.6;
    } else if (!spot.corner) {
      // Clear of the colour band and the houses on it.
      cx -= spot.inX * spot.depth * 0.08;
      cz -= spot.inZ * spot.depth * 0.08;
    }
    if (of <= 1) return new THREE.Vector3(cx, BOARD_Y, cz);
    // Up to four: staggered corners of the tile, so no pawn hides behind another from any side.
    const STAGGER: Record<number, Array<[number, number]>> = {
      2: [[-0.5, -0.5], [0.5, 0.5]],
      3: [[-0.5, -0.5], [0.5, -0.3], [-0.1, 0.5]],
      4: [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]],
    };
    const place = STAGGER[of]?.[slot];
    if (place) {
      const u = place[0] * reach;
      const v = place[1] * spot.depth * 0.5;
      return new THREE.Vector3(cx + along.x * u - spot.inX * v, BOARD_Y, cz + along.z * u - spot.inZ * v);
    }
    // More: a small grid across the tile.
    const cols = 3;
    const row = Math.floor(slot / cols);
    const col = slot % cols;
    const rows = Math.ceil(of / cols);
    const u = (col / (cols - 1) - 0.5) * reach;
    const v = rows === 1 ? 0 : (row / (rows - 1) - 0.5) * spot.depth * 0.5;
    return new THREE.Vector3(cx + along.x * u - spot.inX * v, BOARD_Y, cz + along.z * u - spot.inZ * v);
  }

  private makePawn(player: BoardPlayer, colour: string): Pawn {
    const group = new THREE.Group();
    const body = mat(colour, 0.35, { metalness: 0.25 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.14, 28), body);
    base.position.y = 0.07;
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, 0.18, 28), body);
    skirt.position.y = 0.23;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.2, 0.45, 24), body);
    stem.position.y = 0.54;
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.045, 10, 28), body);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.78;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 24, 18), body);
    head.position.y = 0.93;
    for (const part of [base, skirt, stem, collar, head]) { part.castShadow = true; part.receiveShadow = true; }
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(player.name || "Player", colour), transparent: true, depthWrite: false }));
    label.scale.set(1.5, 0.375, 1);
    label.position.y = PAWN_HEIGHT + 0.42;
    label.renderOrder = 5;
    group.add(base, skirt, stem, collar, head, label);
    const tile = player.position ?? 0;
    const at = this.standOn(tile, 0, 1, Boolean(player.inJail));
    group.position.copy(at);
    return { id: player.id, group, label, key: `${player.name}|${colour}`, tile, queue: [], hopStart: -10, hopSeconds: HOP_SECONDS, from: at.clone(), to: at.clone(), shown: at.clone() };
  }

  setGame(game: BoardGameState | null) {
    this.game = game;
    this.board = boardOf(game);
    this.drawBoard();
    const count = this.board.length;
    const players = (game?.players ?? []).filter((player) => !player.isBankrupt);
    const colourOf = (player: BoardPlayer, index: number) => player.color || FALLBACK_COLOURS[index % FALLBACK_COLOURS.length];
    const playing = game && game.state !== "lobby";

    // Pawns: one per player still in, hopping tile by tile to wherever the game put them.
    const seen = new Set<string>();
    const byTile = new Map<number, BoardPlayer[]>();
    if (playing) for (const player of players) {
      const tile = ((player.position ?? 0) % count + count) % count;
      byTile.set(tile, [...(byTile.get(tile) ?? []), player]);
    }
    if (playing) players.forEach((player, index) => {
      const colour = colourOf(player, game.players.indexOf(player) >= 0 ? game.players.indexOf(player) : index);
      let pawn = this.pawns.get(player.id);
      if (pawn && pawn.key !== `${player.name}|${colour}`) { this.dropPawn(pawn); pawn = undefined; }
      if (!pawn) {
        pawn = this.makePawn(player, colour);
        this.pawns.set(player.id, pawn);
        this.group.add(pawn.group);
      }
      seen.add(player.id);
      const tile = ((player.position ?? 0) % count + count) % count;
      const mates = byTile.get(tile) ?? [player];
      const goal = this.standOn(tile, mates.indexOf(player), mates.length, Boolean(player.inJail));
      if (tile !== pawn.tile) {
        // Forward a few tiles: hop along the way. Further (to jail, a card's jump): one big leap.
        const ahead = (tile - pawn.tile + count) % count;
        const hops: THREE.Vector3[] = [];
        if (ahead > 0 && ahead <= 12 && !player.inJail) for (let i = 1; i < ahead; i++) hops.push(this.standOn((pawn.tile + i) % count, 0, 1, false));
        pawn.queue = [...hops, goal];
        pawn.tile = tile;
      } else {
        // Same tile, but someone arrived or left: shuffle over.
        const last = pawn.queue[pawn.queue.length - 1] ?? pawn.to;
        if (last.distanceToSquared(goal) > 1e-4) pawn.queue.push(goal);
      }
    });
    for (const [id, pawn] of this.pawns) if (!seen.has(id)) this.dropPawn(pawn);

    const current = playing ? game.players[game.currentPlayerIndex ?? 0] : null;
    this.currentId = current && !current.isBankrupt ? current.id : null;

    this.buildEstate(game, colourOf);

    // A new roll: throw the dice from the roller's pawn. The roll's own id says it is new; rolls made
    // without one (the server's) are told apart by where everyone stands.
    const values = game?.lastDiceRoll;
    const rollKey = values && values.length >= 2
      ? game?.rollId ? `id:${game.rollId}` : `${values[0]},${values[1]}|${game?.currentPlayerIndex}|${players.map((p) => p.position).join(",")}`
      : "";
    if (rollKey && rollKey !== this.diceKey && values!.slice(0, 2).every((v) => v >= 1 && v <= 6)) {
      const first = !this.diceKey;
      this.diceKey = rollKey;
      if (!first) this.throwDice(values!.slice(0, 2), current, rollKey);
    }
    this.drawScores();
  }

  private throwDice(values: number[], roller: BoardPlayer | null, seed: string) {
    const index = roller ? this.game?.players.indexOf(roller) ?? 0 : 0;
    const roll: DiceRollEvent = {
      expression: "2d6",
      dice: [{ sides: 6, sign: 1, rolls: values.map((value) => ({ value, kept: true })) }],
      modifier: 0,
      total: values.reduce((sum, value) => sum + value, 0),
      roller: { id: roller?.id ?? "", displayName: roller?.name ?? "" },
      rollType: "normal",
      animationSeed: seed,
      themeColor: roller ? roller.color || FALLBACK_COLOURS[index % FALLBACK_COLOURS.length] : "#7c3aed",
      material: "plastic",
    };
    // From about chest height over the roller's pawn, towards the middle.
    const pawn = roller ? this.pawns.get(roller.id) : null;
    const at = pawn ? pawn.group.position : new THREE.Vector3(0, 0, FLOOR_BOARD_SIZE / 2);
    const from = new THREE.Vector3(at.x * 0.8, 1.4, at.z * 0.8).divideScalar(DICE_SCALE);
    void this.dice.roll(roll, from, { label: null });
    void playDiceRollSound({ theme: "default", diceCount: values.length, material: "plastic" });
  }

  tileCount() {
    return this.board.length;
  }

  /** True while dice are rolling or resting on the board, so the room draws at full rate. */
  busy() {
    return this.dice.busy();
  }

  /** For the pawn's-eye camera: where my pawn is and which way play runs from its tile. */
  pawnView(playerId: string): { position: THREE.Vector3; dir: { x: number; z: number } } | null {
    const pawn = this.pawns.get(playerId);
    if (!pawn) return null;
    return { position: pawn.group.position, dir: travelDirection(tileSpot(pawn.tile, this.board.length).edge) };
  }

  private dropPawn(pawn: Pawn) {
    this.group.remove(pawn.group);
    pawn.group.traverse((part) => {
      const mesh = part as THREE.Mesh;
      mesh.geometry?.dispose();
      const material = mesh.material as THREE.Material | undefined;
      if (material) {
        (material as THREE.SpriteMaterial).map?.dispose();
        material.dispose();
      }
    });
    this.pawns.delete(pawn.id);
  }

  /** Owners' colours along their tiles, and the houses and hotels on them. */
  private buildEstate(game: BoardGameState | null, colourOf: (player: BoardPlayer, index: number) => string) {
    const properties = game && game.state !== "lobby" ? game.properties ?? [] : [];
    const owned = properties.filter((property) => property.ownerId);
    const key = owned.map((p) => `${p.spaceIndex}:${p.ownerId}:${p.houses ?? 0}:${p.mortgaged ? 1 : 0}`).join(",");
    if (key === this.estateKey) return;
    this.estateKey = key;
    for (const child of [...this.estate.children]) {
      this.estate.remove(child);
      const mesh = child as THREE.Mesh;
      if (mesh.geometry !== this.houseGeometry && mesh.geometry !== this.hotelGeometry) mesh.geometry?.dispose();
      if (mesh.material !== this.houseMaterial && mesh.material !== this.hotelMaterial) (mesh.material as THREE.Material)?.dispose();
    }
    const count = this.board.length;
    for (const property of owned) {
      if (property.spaceIndex < 0 || property.spaceIndex >= count) continue;
      const ownerIndex = game!.players.findIndex((player) => player.id === property.ownerId);
      const owner = game!.players[ownerIndex];
      if (!owner) continue;
      const spot = tileSpot(property.spaceIndex, count);
      const along = { x: -spot.inZ, z: spot.inX };
      const colour = colourOf(owner, ownerIndex);
      // A strip in the owner's colour on the frame just outside the tile.
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(spot.inX ? 0.16 : spot.width * 0.86, 0.035, spot.inX ? spot.width * 0.86 : 0.16),
        new THREE.MeshStandardMaterial({ color: colour, roughness: 0.4, emissive: colour, emissiveIntensity: 0.25, transparent: property.mortgaged, opacity: property.mortgaged ? 0.35 : 1 }),
      );
      strip.position.set(spot.x - spot.inX * (spot.depth / 2 + 0.17), BOARD_Y + 0.018, spot.z - spot.inZ * (spot.depth / 2 + 0.17));
      strip.receiveShadow = true;
      this.estate.add(strip);
      const houses = Math.max(0, Math.min(5, property.houses ?? 0));
      const bandAt = { x: spot.x + spot.inX * (spot.depth / 2 - spot.depth * 0.12), z: spot.z + spot.inZ * (spot.depth / 2 - spot.depth * 0.12) };
      if (houses === 5) {
        const hotel = new THREE.Mesh(this.hotelGeometry, this.hotelMaterial);
        hotel.position.set(bandAt.x, BOARD_Y, bandAt.z);
        hotel.rotation.y = spot.inX ? Math.PI / 2 : 0;
        hotel.castShadow = true;
        this.estate.add(hotel);
      } else {
        for (let i = 0; i < houses; i++) {
          const offset = (i - (houses - 1) / 2) * 0.29;
          const house = new THREE.Mesh(this.houseGeometry, this.houseMaterial);
          house.position.set(bandAt.x + along.x * offset, BOARD_Y, bandAt.z + along.z * offset);
          house.castShadow = true;
          this.estate.add(house);
        }
      }
    }
  }

  /** The scoreboards on the walls: players, cash and where they are. */
  private drawScores() {
    const ctx = this.scoreCanvas.getContext("2d")!;
    const W = this.scoreCanvas.width;
    const H = this.scoreCanvas.height;
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#14261b");
    bg.addColorStop(1, "#0a140e");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, W - 10, H - 10);
    ctx.fillStyle = "#ffd166";
    ctx.font = "900 58px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("DEEPPIXEL", 40, 78);
    const game = this.game;
    ctx.font = "600 30px system-ui, sans-serif";
    ctx.fillStyle = "#cfe8d6";
    ctx.textAlign = "right";
    ctx.fillText(!game ? "No game yet" : game.state === "lobby" ? "In the lobby" : game.state === "playing" ? "Playing" : String(game.state || ""), W - 40, 74);
    ctx.textAlign = "left";
    if (!game || !game.players.length) {
      ctx.fillStyle = "#e9f5ec";
      ctx.font = "500 38px system-ui, sans-serif";
      ctx.fillText("Press Play at the top of the hall", 40, 200);
      ctx.fillText("to open the game for the room.", 40, 252);
      ctx.fillStyle = "#9fc2aa";
      ctx.font = "400 30px system-ui, sans-serif";
      ctx.fillText("Your pawn walks the board as you play.", 40, 330);
      this.scoreTexture.needsUpdate = true;
      return;
    }
    const rows = game.players.slice(0, 8);
    const rowH = Math.min(64, (H - 130) / rows.length);
    rows.forEach((player, i) => {
      const y = 120 + i * rowH;
      const isTurn = game.state !== "lobby" && i === (game.currentPlayerIndex ?? 0);
      if (isTurn) {
        ctx.fillStyle = "rgba(255,209,102,0.16)";
        ctx.fillRect(24, y, W - 48, rowH - 6);
      }
      ctx.fillStyle = player.color || FALLBACK_COLOURS[i % FALLBACK_COLOURS.length];
      ctx.beginPath();
      ctx.arc(60, y + rowH / 2 - 3, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = player.isBankrupt ? "#6f8577" : "#f3fbf5";
      ctx.font = `${isTurn ? 800 : 600} 34px system-ui, sans-serif`;
      ctx.fillText(`${isTurn ? "▶ " : ""}${player.name}${player.inJail ? "  ⛓" : ""}${player.isBankrupt ? "  (out)" : ""}`.slice(0, 26), 92, y + rowH / 2 + 9);
      ctx.textAlign = "right";
      ctx.fillStyle = "#ffd166";
      ctx.fillText(`$${Math.round(player.money ?? 0).toLocaleString()}`, W - 300, y + rowH / 2 + 9);
      ctx.fillStyle = "#9fc2aa";
      ctx.font = "500 26px system-ui, sans-serif";
      const where = this.board[((player.position ?? 0) % this.board.length + this.board.length) % this.board.length]?.name ?? "";
      ctx.fillText(where.slice(0, 16), W - 40, y + rowH / 2 + 8);
      ctx.textAlign = "left";
    });
    this.scoreTexture.needsUpdate = true;
  }

  /** Where a player's pawn is headed: the tile it will stand on, for walking over to it. */
  pawnTile(playerId: string): { x: number; z: number; tile: number } | null {
    const pawn = this.pawns.get(playerId);
    if (!pawn) return null;
    const spot = tileSpot(pawn.tile, this.board.length);
    // Stand just outside the board edge of the tile, facing in, so the pawn stays in view.
    return { x: spot.x - spot.inX * (spot.depth / 2 + 0.6), z: spot.z - spot.inZ * (spot.depth / 2 + 0.6), tile: pawn.tile };
  }

  update(t: number) {
    this.now = t;
    for (const pawn of this.pawns.values()) {
      let k = Math.min(1, (t - pawn.hopStart) / pawn.hopSeconds);
      if (k >= 1 && pawn.queue.length) {
        // Next hop: from where it landed to the next spot; a long leap takes longer.
        pawn.from.copy(pawn.to);
        pawn.to.copy(pawn.queue.shift()!);
        pawn.hopStart = t;
        pawn.hopSeconds = pawn.from.distanceTo(pawn.to) > 3 ? 0.7 : HOP_SECONDS;
        k = 0;
      }
      pawn.shown.lerpVectors(pawn.from, pawn.to, k);
      const lift = Math.sin(Math.PI * k) * (pawn.hopSeconds > HOP_SECONDS ? 1.8 : 0.45);
      pawn.group.position.set(pawn.shown.x, pawn.shown.y + lift, pawn.shown.z);
      // Pawns idle with a slow sway; the one whose turn it is bobs.
      const turn = pawn.id === this.currentId;
      pawn.group.rotation.y = Math.sin(t * 0.6 + pawn.tile) * 0.15;
      if (turn && k >= 1) pawn.group.position.y += Math.abs(Math.sin(t * 2.4)) * 0.05;
    }
    const current = this.currentId ? this.pawns.get(this.currentId) : null;
    this.turnRing.visible = this.turnArrow.visible = Boolean(current);
    this.turnLight.intensity = current ? 28 : 0;
    if (current) {
      const p = current.group.position;
      this.turnRing.position.set(p.x, BOARD_Y + 0.02, p.z);
      (this.turnRing.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(t * 4) * 0.25;
      this.turnArrow.position.set(p.x, p.y + PAWN_HEIGHT + 0.95 + Math.sin(t * 3) * 0.08, p.z);
      this.turnArrow.rotation.y = t * 1.5;
      this.turnLight.position.set(p.x, 6, p.z);
      this.turnLight.target.position.set(p.x, 0, p.z);
    }
    this.dice.update();
  }

  dispose() {
    for (const pawn of [...this.pawns.values()]) this.dropPawn(pawn);
    this.boardTexture?.dispose();
    this.scoreTexture.dispose();
    this.houseGeometry.dispose();
    this.hotelGeometry.dispose();
    this.dice.dispose();
  }
}

/** Joins a few non-indexed-compatible geometries into one (positions and normals only). */
function mergeGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((part) => (part.index ? part.toNonIndexed() : part));
  const positions: number[] = [];
  const normals: number[] = [];
  for (const part of flat) {
    positions.push(...(part.getAttribute("position").array as ArrayLike<number> as number[]));
    normals.push(...(part.getAttribute("normal").array as ArrayLike<number> as number[]));
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  for (const part of [...parts, ...flat]) part.dispose();
  return merged;
}

export function buildBoardHall(theme: RoomTheme): BuiltRoom & { board: FloorBoard } {
  const look = LOOKS[theme];
  const root = new THREE.Group();
  const ceiling = new THREE.Group();
  root.add(ceiling);
  const half = BOARD_HALL.halfX;
  const W = half * 2;
  const H = BOARD_HALL.height;
  const glow = glowTexture();
  const addGlow = (colour: string, size: number, at: THREE.Vector3, opacity = 0.5, parent: THREE.Object3D = root) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: colour, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    sprite.scale.setScalar(size);
    sprite.position.copy(at);
    parent.add(sprite);
    return sprite;
  };

  // Floor: the theme's planks, with a dark border round the board.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, W), floorMaterial(look, W, W));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.userData.floor = true;
  root.add(floor);
  const border = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_BOARD_SIZE + 0.7, FLOOR_BOARD_SIZE + 0.7), mat("#0d1f14", 0.6));
  border.rotation.x = -Math.PI / 2;
  border.position.y = 0.006;
  border.receiveShadow = true;
  border.userData.floor = true;
  root.add(border);

  const board = new FloorBoard();
  board.group.userData.keep = true; // the game moves on it: never baked
  root.add(board.group);

  // Walls with the theme's paper, wainscot and a rail.
  const wallMaterial = plasterOver(mat("#ffffff", 0.95, { map: wallTexture(look) }), [8, 2]);
  const wainscot = woodMaterial(look.wainscot, 0.6, [8, 0.6]);
  const trim = mat(look.trim, 0.5);
  for (const [x, z, ry] of [[0, -half, 0], [0, half, Math.PI], [-half, 0, Math.PI / 2], [half, 0, -Math.PI / 2]] as const) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMaterial);
    wall.position.set(x, H / 2, z);
    wall.rotation.y = ry;
    wall.receiveShadow = true;
    root.add(wall);
    const inward = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
    const lower = new THREE.Mesh(new THREE.PlaneGeometry(W, 1.1), wainscot);
    lower.position.set(x + inward.x * 0.012, 0.55, z + inward.z * 0.012);
    lower.rotation.y = ry;
    root.add(lower);
    const rail = box(W, 0.06, 0.05, trim, false);
    rail.position.set(x + inward.x * 0.03, 1.12, z + inward.z * 0.03);
    rail.rotation.y = ry;
    root.add(rail);
  }
  const ceilingPlane = new THREE.Mesh(new THREE.PlaneGeometry(W, W), dress(mat(look.ceiling, 1), "plaster", { repeat: [8, 8], bump: 0.4, rough: false, detail: false }));
  ceilingPlane.rotation.x = Math.PI / 2;
  ceilingPlane.position.y = H;
  ceiling.add(ceilingPlane);
  for (let x = -half + 2; x < half; x += 4) {
    const beam = box(0.24, 0.3, W, woodMaterial(look.beam, 0.75, [0.4, 5]), false);
    beam.position.set(x, H - 0.15, 0);
    ceiling.add(beam);
  }

  // A carpet runner framing the board, inside the benches.
  const runner = canvasTexture(512, 128, (ctx) => {
    ctx.fillStyle = look.rug[0];
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = look.rug[1];
    ctx.fillRect(0, 10, 512, 8);
    ctx.fillRect(0, 110, 512, 8);
    ctx.fillStyle = look.rug[2];
    for (let x = 32; x < 512; x += 64) {
      ctx.beginPath(); ctx.moveTo(x, 34); ctx.lineTo(x + 26, 64); ctx.lineTo(x, 94); ctx.lineTo(x - 26, 64); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = look.rug[1];
    for (let x = 32; x < 512; x += 64) { ctx.beginPath(); ctx.arc(x, 64, 7, 0, Math.PI * 2); ctx.fill(); }
  });
  const RUN_IN = FLOOR_BOARD_SIZE / 2 + 0.75;
  const RUN_W = 0.95;
  for (let side = 0; side < 4; side++) {
    const length = 2 * (RUN_IN + RUN_W);
    const map = runner.clone();
    map.wrapS = THREE.RepeatWrapping;
    map.repeat.set(length / (RUN_W * 4), 1);
    map.needsUpdate = true;
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(length, RUN_W), mat("#ffffff", 0.95, { map }));
    strip.rotation.set(-Math.PI / 2, 0, (side * Math.PI) / 2);
    const out = RUN_IN + RUN_W / 2;
    strip.position.set(side === 1 ? -out : side === 3 ? out : 0, 0.004 + side * 0.0005, side === 0 ? out : side === 2 ? -out : 0);
    strip.receiveShadow = true;
    strip.userData.floor = true;
    root.add(strip);
  }

  // Pilasters along every wall, a sconce glow on each, and framed posters of the board between them.
  const pilaster = mat(look.trim, 0.55);
  const posterSpaces = [
    { title: "GO", sub: "Collect $200 as you pass", band: "#2f9e44", glyph: "➜" },
    { title: "JAIL", sub: "Just visiting", band: "#f08c00", glyph: "⛓" },
    { title: "VACATION", sub: "Free parking", band: "#1971c2", glyph: "☀" },
    { title: "GO TO PRISON", sub: "Do not pass GO", band: "#c92a2a", glyph: "👮" },
    { title: "SURPRISE", sub: "Take a card", band: "#f76707", glyph: "?" },
    { title: "TREASURE", sub: "Take a card", band: "#1c7ed6", glyph: "💰" },
    { title: "AIRPORTS", sub: "Four to collect", band: "#495057", glyph: "✈" },
    { title: "UTILITIES", sub: "Power and water", band: "#fab005", glyph: "⚡" },
  ];
  const posterTexture = (p: (typeof posterSpaces)[number]) => canvasTexture(320, 440, (ctx) => {
    ctx.fillStyle = "#f4ecd8";
    ctx.fillRect(0, 0, 320, 440);
    ctx.fillStyle = p.band;
    ctx.fillRect(0, 0, 320, 92);
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 40px system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(p.title, 160, 48, 296);
    ctx.font = "150px system-ui, sans-serif";
    ctx.fillStyle = p.band;
    ctx.fillText(p.glyph, 160, 230);
    ctx.fillStyle = "#3a3a3a";
    ctx.font = "italic 26px Georgia, serif";
    ctx.fillText(p.sub, 160, 370, 296);
    ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 314, 434);
  });
  let posterIndex = 0;
  for (const [x, z, ry] of [[0, -half, 0], [0, half, Math.PI], [-half, 0, Math.PI / 2], [half, 0, -Math.PI / 2]] as const) {
    const inward = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
    const along = new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry));
    const at = (u: number, out: number, y: number) => new THREE.Vector3(x, y, z).addScaledVector(along, u).addScaledVector(inward, out);
    for (const u of [-10.9, -7.3, -3.7, 3.7, 7.3, 10.9]) {
      const column = box(0.42, H, 0.14, pilaster, false);
      column.position.copy(at(u, 0.07, H / 2));
      column.rotation.y = ry;
      const capital = box(0.6, 0.22, 0.24, pilaster, false);
      capital.position.copy(at(u, 0.12, H - 0.75));
      capital.rotation.y = ry;
      const foot = box(0.56, 0.32, 0.22, pilaster, false);
      foot.position.copy(at(u, 0.11, 0.16));
      foot.rotation.y = ry;
      root.add(column, capital, foot);
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.06, 0.16, 14, 1, true), new THREE.MeshStandardMaterial({ color: look.lamp, emissive: look.lamp, emissiveIntensity: 0.9, side: THREE.DoubleSide }));
      cup.position.copy(at(u, 0.26, 2.55));
      root.add(cup);
      addGlow(look.lamp, 1.3, at(u, 0.3, 2.7), 0.3);
    }
    for (const u of [-9.1, -5.5, 5.5, 9.1]) {
      const p = posterSpaces[posterIndex++ % posterSpaces.length];
      const poster = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 2.0), new THREE.MeshStandardMaterial({ map: posterTexture(p), roughness: 0.8 }));
      poster.position.copy(at(u, 0.06, 2.65));
      poster.rotation.y = ry;
      const posterFrame = box(1.6, 2.15, 0.05, mat(look.woodDark, 0.5), false);
      posterFrame.position.copy(at(u, 0.03, 2.65));
      posterFrame.rotation.y = ry;
      root.add(posterFrame, poster);
    }
  }

  // Bunting in the players' colours, wall to wall between the chandeliers.
  const flag = new THREE.Shape();
  flag.moveTo(-0.17, 0); flag.lineTo(0.17, 0); flag.lineTo(0, -0.34); flag.closePath();
  const FLAGS_PER_LINE = 44;
  const flags = new THREE.InstancedMesh(new THREE.ShapeGeometry(flag), new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide }), FLAGS_PER_LINE * 2);
  const place = new THREE.Object3D();
  let flagIndex = 0;
  for (const [ax, az, bx, bz] of [[-half + 0.2, -1.8, half - 0.2, -1.8], [-half + 0.2, 1.8, half - 0.2, 1.8]] as const) {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= FLAGS_PER_LINE; i++) {
      const k = i / FLAGS_PER_LINE;
      points.push(new THREE.Vector3(ax + (bx - ax) * k, H - 0.4 - Math.sin(Math.PI * k) * 0.9, az + (bz - az) * k));
    }
    ceiling.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: "#3a2a14" })));
    const heading = Math.atan2(bx - ax, bz - az);
    for (let i = 0; i < FLAGS_PER_LINE; i++) {
      const p = points[i].clone().lerp(points[i + 1], 0.5);
      place.position.copy(p);
      place.rotation.set(0, heading - Math.PI / 2, 0);
      place.updateMatrix();
      flags.setMatrixAt(flagIndex, place.matrix);
      flags.setColorAt(flagIndex, new THREE.Color(FALLBACK_COLOURS[flagIndex % FALLBACK_COLOURS.length]));
      flagIndex++;
    }
  }
  flags.instanceMatrix.needsUpdate = true;
  if (flags.instanceColor) flags.instanceColor.needsUpdate = true;
  ceiling.add(flags);

  // The screen on the north wall (shares and the music bot play here); until then, a title card.
  const idleScreen = canvasTexture(1280, 720, (ctx) => {
    const g = ctx.createRadialGradient(640, 330, 60, 640, 360, 760);
    g.addColorStop(0, "#1f5a35"); g.addColorStop(1, "#0b2414");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1280, 720);
    ctx.strokeStyle = "#ffd166"; ctx.lineWidth = 8;
    ctx.strokeRect(28, 28, 1224, 664);
    // Two dice, mid-tumble.
    const die = (cx: number, cy: number, turn: number, pips: Array<[number, number]>) => {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(turn);
      ctx.fillStyle = "#fbf7ee"; ctx.strokeStyle = "#0b2414"; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.roundRect(-70, -70, 140, 140, 22); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#c92a2a";
      for (const [px, py] of pips) { ctx.beginPath(); ctx.arc(px * 38, py * 38, 13, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    };
    die(540, 230, -0.25, [[-1, -1], [0, 0], [1, 1]]);
    die(740, 250, 0.2, [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffd166"; ctx.font = "900 120px system-ui, sans-serif";
    ctx.fillText("DEEPPIXEL", 640, 440);
    ctx.fillStyle = "#e9f5ec"; ctx.font = "500 40px system-ui, sans-serif";
    ctx.fillText("Press Play at the top of the hall to start a game", 640, 540);
    ctx.fillStyle = "#9fc2aa"; ctx.font = "400 30px system-ui, sans-serif";
    ctx.fillText("Your pawn walks the board as you play", 640, 600);
  });
  const screenMaterial = new THREE.MeshBasicMaterial({ map: idleScreen, toneMapped: false });
  const SW = 5.4;
  const SH = SW * 9 / 16;
  const frame = box(SW + 0.2, SH + 0.2, 0.08, mat(look.woodDark, 0.5), false);
  frame.position.set(0, BOARD_HALL.tv.height, -half + 0.05);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), screenMaterial);
  screen.position.set(0, BOARD_HALL.tv.height, -half + 0.1);
  root.add(frame, screen);

  // Scoreboards on the east and west walls.
  for (const side of [-1, 1]) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.625), new THREE.MeshBasicMaterial({ map: board.scoreTexture, toneMapped: false }));
    sign.position.set(side * (half - 0.08), 2.8, 0);
    sign.rotation.y = -side * Math.PI / 2;
    const signFrame = box(0.06, 2.8, 4.4, mat(look.woodDark, 0.5), false);
    signFrame.position.set(side * (half - 0.04), 2.8, 0);
    root.add(signFrame, sign);
  }

  // A banner over the south entrance.
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.2), new THREE.MeshBasicMaterial({
    map: canvasTexture(1024, 205, (ctx) => {
      ctx.fillStyle = "#0d1f14";
      ctx.fillRect(0, 0, 1024, 205);
      ctx.strokeStyle = "#ffd166";
      ctx.lineWidth = 10;
      ctx.strokeRect(8, 8, 1008, 189);
      ctx.fillStyle = "#ffd166";
      ctx.font = "900 110px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("BOARD HALL", 512, 108);
    }),
    toneMapped: false,
  }));
  banner.position.set(0, 3.6, half - 0.08);
  banner.rotation.y = Math.PI;
  root.add(banner);

  // Benches along the four sides, a cushion per seat.
  const benchWood = woodMaterial(look.wood, 0.5, [1.5, 0.5]);
  const pad = fabric(look.sofaCushion, { repeat: [1.5, 1.5] });
  for (const seat of BOARD_HALL.seats) {
    const group = new THREE.Group();
    const plank = box(1.5, 0.08, 0.5, benchWood);
    plank.position.y = 0.38;
    const back = box(1.5, 0.5, 0.07, benchWood);
    back.position.set(0, 0.7, 0.27);
    for (const lx of [-0.65, 0.65]) {
      const leg = box(0.08, 0.38, 0.42, woodMaterial(look.woodDark, 0.55));
      leg.position.set(lx, 0.19, 0);
      group.add(leg);
    }
    const seatPad = cushion(0.7, 0.08, 0.42, pad, 0.04);
    seatPad.position.y = 0.46;
    group.add(plank, back, seatPad);
    group.position.set(seat.x, 0, seat.z);
    group.rotation.y = -seat.facing;
    tagSeat(group, seat.id);
    root.add(group);
  }

  // Plants in the corners and a pair of lamps by each bench row.
  for (const [x, z] of [[half - 0.8, half - 0.8], [-half + 0.8, half - 0.8], [half - 0.8, -half + 0.8], [-half + 0.8, -half + 0.8]] as const) {
    const p = plant(look, 1.6, theme === "matrix" ? "#1d6b35" : theme === "cyberpunk" ? "#2fbf8f" : "#4f8f4f");
    p.position.set(x, 0, z);
    root.add(p);
  }

  // Chandeliers: glowing rings over the board.
  const bulbs: THREE.Mesh[] = [];
  for (const [x, z] of [[-4, -4], [4, -4], [-4, 4], [4, 4]] as const) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.04, 8, 32), mat("#b08a3e", 0.3, { metalness: 0.8 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, H - 1.1, z);
    const chain = box(0.02, 1, 0.02, mat("#3a2a14", 0.6), false);
    chain.position.set(x, H - 0.55, z);
    ceiling.add(ring, chain);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: look.lamp, toneMapped: false }));
      bulb.position.set(x + Math.cos(a) * 0.7, H - 1.03, z + Math.sin(a) * 0.7);
      ceiling.add(bulb);
      bulbs.push(bulb);
    }
    addGlow(look.lamp, 1.6, new THREE.Vector3(x, H - 1.05, z), 0.35, ceiling);
    const light = new THREE.PointLight(look.lamp, 14, 14, 1.6);
    light.position.set(x, H - 1.3, z);
    root.add(light);
  }

  // Key light from above for crisp pawn shadows on the board.
  const sun = new THREE.DirectionalLight("#fff4df", 1.5);
  sun.position.set(4, 14, 6);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -9;
  sun.shadow.camera.right = 9;
  sun.shadow.camera.top = 9;
  sun.shadow.camera.bottom = -9;
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 30;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  root.add(sun, sun.target);
  root.add(new THREE.HemisphereLight(look.hemi[0], look.hemi[1], look.hemi[2] * 1.4));

  // A trophy on a pedestal by the north wall: touched, it bursts into confetti for the whole hall.
  const kit = new ThingKit(root);
  const gold = mat("#e2b53e", 0.3, { metalness: 0.7, emissive: "#3a2a08", emissiveIntensity: 0.6 });
  const trophy = new THREE.Group();
  const plinth = box(0.5, 1.0, 0.5, woodMaterial(look.woodDark, 0.5), false);
  plinth.position.y = 0.5;
  const cup = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.09, 0.01], [0.04, 0.05], [0.03, 0.15], [0.06, 0.2], [0.16, 0.3], [0.17, 0.46], [0.15, 0.46]].map(([x, y]) => new THREE.Vector2(x, y)), 28), Object.assign(gold.clone(), { side: THREE.DoubleSide }));
  cup.position.y = 1.0;
  for (const side of [-1, 1]) {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 6, 16, Math.PI), gold);
    handle.position.set(side * 0.16, 1.36, 0);
    handle.rotation.z = side * -Math.PI / 2;
    trophy.add(handle);
  }
  trophy.add(plinth, cup);
  trophy.position.set(half - 1.6, 0, -half + 0.6);
  root.add(kit.tag(trophy, "trophy"));
  const confetti = ["#ff4b6e", "#ffd24b", "#4bd6ff", "#7dff6a", "#c77dff"];
  kit.things.trophy = (since) => {
    if (since === 0) for (const colour of confetti) kit.floatUp("star", new THREE.Vector3(half - 1.6, 1.6, -half + 0.6), 6, colour);
    cup.rotation.y = since * 6 * Math.max(0, 1 - since / 1.5);
    return since < 1.6;
  };
  kit.settle();

  // What never moves, baked into a few meshes.
  mergeStatics(root, [ceiling]);

  let lastT = 0;
  const update = (t: number, dt = t - lastT) => {
    lastT = t;
    kit.update(t, Math.max(0, Math.min(0.1, dt)));
    board.update(t);
    for (let i = 0; i < bulbs.length; i++) bulbs[i].scale.setScalar(0.9 + Math.sin(t * 1.3 + i) * 0.1);
  };

  return {
    root,
    ceiling,
    screenMaterial,
    idleScreen,
    board,
    background: new THREE.Color(look.background),
    fog: new THREE.Fog(look.fog, 22, 44),
    exposure: look.exposure,
    update,
    dispose: () => { board.dispose(); glow.dispose(); kit.dispose(); },
    things: kit.api({ label: (id) => (id === "trophy" ? "Celebrate!" : null), sounds: { trophy: playFanfare } }),
  };
}

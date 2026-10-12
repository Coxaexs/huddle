/**
 * The cinema's projection booth: a staff-only room behind the back wall, up on the walkway's level, reached
 * through a door in the left aisle. It has a projector throwing a real beam through its window onto the
 * screen, a mixing desk, monitors that mirror the screen, a rack of film reels and an ON AIR lamp over the
 * door. Who may walk in is decided by the floor plan (CINEMA.annex in app/lib/living-room.ts); this file only
 * draws it, and cuts the door and windows out of the hall's back wall.
 */
import * as THREE from "three";
import { CINEMA } from "../lib/living-room";
import { box, canvasTexture, mat, type Look } from "./living-room-scene";

export interface Booth {
  /** A film (or share) is on the screen: ON AIR lights, the reels turn, the beam shows. */
  setLive: (live: boolean) => void;
  update: (t: number, dt: number) => void;
  dispose: () => void;
}

interface Hole { x0: number; x1: number; y0: number; y1: number }

const HEIGHT = 3.2;

export function buildBooth(opts: {
  root: THREE.Group;
  ceiling: THREE.Group;
  look: Look;
  /** Height of the walkway the booth stands on. */
  floorY: number;
  hallHeight: number;
  /** The screen's centre height and width, and its material (the monitors mirror it). */
  screen: { y: number; width: number; material: THREE.MeshBasicMaterial };
  /** The hall's wall material, for the pieces of the back wall around the openings. */
  wallMaterial: THREE.Material;
  glow: THREE.Texture;
}): Booth {
  const { root, ceiling, look, floorY, hallHeight, screen, wallMaterial, glow } = opts;
  const a = CINEMA.annex!;
  const width = a.x1 - a.x0;
  const depth = a.z1 - a.z0;
  const cx = (a.x0 + a.x1) / 2;
  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => { disposables.push(item); return item; };
  const accent = look.fairy[0];
  const neon = (colour: string) => track(new THREE.MeshBasicMaterial({ color: colour, toneMapped: false }));
  const addGlow = (colour: string, size: number, at: THREE.Vector3, opacity: number) => {
    const sprite = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glow, color: colour, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false })));
    sprite.scale.setScalar(size);
    sprite.position.copy(at);
    root.add(sprite);
    return sprite;
  };

  /* ---------- the hall's back wall, with a door and two windows cut out ---------- */
  const holes: Hole[] = [
    { x0: a.doorX - a.doorHalf, x1: a.doorX + a.doorHalf, y0: floorY, y1: floorY + 2.4 },
    { x0: -0.6, x1: 0.6, y0: floorY + 1.1, y1: floorY + 1.8 }, // the projector's
    { x0: 1.8, x1: 3.6, y0: floorY + 0.9, y1: floorY + 1.9 }, // to watch the room through
  ];
  const insideWall = track(mat("#241c2e", 1));
  const wallPiece = (x0: number, x1: number, y0: number, y1: number) => {
    const geometry = track(new THREE.PlaneGeometry(x1 - x0, y1 - y0));
    // One face for the hall, one for the booth, so the wall is solid from both sides.
    const hall = new THREE.Mesh(geometry, wallMaterial);
    hall.position.set((x0 + x1) / 2, (y0 + y1) / 2, a.z0);
    hall.rotation.y = Math.PI;
    hall.receiveShadow = true;
    const inner = new THREE.Mesh(geometry, insideWall);
    inner.position.set((x0 + x1) / 2, (y0 + y1) / 2, a.z0 + 0.02);
    root.add(hall, inner);
  };
  const xs = [...new Set([-CINEMA.halfX, CINEMA.halfX, ...holes.flatMap((h) => [h.x0, h.x1])])].sort((p, q) => p - q);
  for (let i = 0; i < xs.length - 1; i++) {
    const [xa, xb] = [xs[i], xs[i + 1]];
    const cuts = holes.filter((h) => h.x0 <= xa + 1e-6 && h.x1 >= xb - 1e-6).sort((p, q) => p.y0 - q.y0);
    let y = 0;
    for (const cut of cuts) {
      if (cut.y0 > y) wallPiece(xa, xb, y, cut.y0);
      y = cut.y1;
    }
    if (y < hallHeight) wallPiece(xa, xb, y, hallHeight);
  }
  // Glass in the windows, and a dark frame round every opening.
  const glass = track(new THREE.MeshStandardMaterial({ color: "#9fb4ff", roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.1, depthWrite: false }));
  const trim = track(mat(look.woodDark, 0.5));
  for (const [i, hole] of holes.entries()) {
    const w = hole.x1 - hole.x0;
    const h = hole.y1 - hole.y0;
    if (i > 0) {
      const pane = new THREE.Mesh(track(new THREE.PlaneGeometry(w, h)), glass);
      pane.position.set((hole.x0 + hole.x1) / 2, (hole.y0 + hole.y1) / 2, a.z0 - 0.01);
      pane.rotation.y = Math.PI;
      root.add(pane);
    }
    for (const [bw, bh, bx, by] of [[w + 0.16, 0.08, 0, h / 2 + 0.04], [w + 0.16, 0.08, 0, -h / 2 - 0.04], [0.08, h, -w / 2 - 0.04, 0], [0.08, h, w / 2 + 0.04, 0]] as const) {
      if (i === 0 && by < 0) continue; // the door has no sill
      const bar = box(bw, bh, 0.16, trim, false);
      bar.position.set((hole.x0 + hole.x1) / 2 + bx, (hole.y0 + hole.y1) / 2 + by, a.z0 - 0.04);
      root.add(bar);
    }
  }

  /* ---------- over the door: what it is, and whether the projector is running ---------- */
  const door = holes[0];
  const doorX = (door.x0 + door.x1) / 2;
  const label = (text: string, w: number, h: number, colour: string, fontPx: number) => track(canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = "#0a0710";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = colour;
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = colour;
    ctx.font = `bold ${fontPx}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, h / 2 + 2);
  }));
  const staffTexture = label("PROJECTION · STAFF ONLY", 512, 96, accent, 33);
  const staff = new THREE.Mesh(track(new THREE.PlaneGeometry(1.7, 0.32)), track(new THREE.MeshBasicMaterial({ map: staffTexture, toneMapped: false })));
  staff.position.set(doorX, door.y1 + 0.38, a.z0 - 0.13);
  staff.rotation.y = Math.PI;
  const onAirOff = label("ON AIR", 256, 96, "#5a1010", 52);
  const onAirOn = label("ON AIR", 256, 96, "#ff3b3b", 52);
  const onAirMaterial = track(new THREE.MeshBasicMaterial({ map: onAirOff, toneMapped: false }));
  const onAir = new THREE.Mesh(track(new THREE.PlaneGeometry(0.8, 0.3)), onAirMaterial);
  onAir.position.set(doorX, door.y1 + 0.78, a.z0 - 0.13);
  onAir.rotation.y = Math.PI;
  root.add(staff, onAir);
  const onAirGlow = addGlow("#ff3b3b", 1.8, new THREE.Vector3(doorX, door.y1 + 0.78, a.z0 - 0.3), 0);
  // A strip of coloured light up both sides of the door, so it reads from the far seats.
  for (const side of [-1, 1]) {
    const strip = new THREE.Mesh(track(new THREE.BoxGeometry(0.03, 2.4, 0.03)), neon(accent));
    strip.position.set(doorX + side * (a.doorHalf + 0.12), door.y0 + 1.2, a.z0 - 0.14);
    root.add(strip);
  }
  addGlow(accent, 1.4, new THREE.Vector3(doorX, door.y0 + 1.2, a.z0 - 0.4), 0.18);

  /* ---------- the room ---------- */
  const floorBlock = box(width, floorY, depth, track(mat("#2b2234", 0.9)), false);
  floorBlock.position.set(cx, floorY / 2, (a.z0 + a.z1) / 2);
  floorBlock.userData.floor = true;
  root.add(floorBlock);
  const wallFoam = track(mat("#2a2036", 1));
  const walls: Array<[number, number, number, number]> = [
    [width, cx, a.z1, Math.PI], // far wall, facing the hall
    [depth, a.x0, (a.z0 + a.z1) / 2, Math.PI / 2],
    [depth, a.x1, (a.z0 + a.z1) / 2, -Math.PI / 2],
  ];
  for (const [w, x, z, ry] of walls) {
    const wall = new THREE.Mesh(track(new THREE.PlaneGeometry(w, HEIGHT)), wallFoam);
    wall.position.set(x, floorY + HEIGHT / 2, z);
    wall.rotation.y = ry;
    root.add(wall);
    // Acoustic foam, in a quilt of slightly different squares.
    const sideways = Math.abs(ry) === Math.PI / 2;
    for (let col = 0; col < Math.floor(w / 0.8); col++) {
      for (let row = 0; row < 3; row++) {
        if (row === 0 && col % 2 === 1) continue;
        const tone = 0.7 + ((col * 5 + row * 3) % 4) * 0.12;
        const foam = box(0.6, 0.6, 0.06, track(mat(new THREE.Color("#241b2e").multiplyScalar(tone).getStyle(), 1)), false);
        const along = -w / 2 + 0.6 + col * 0.8;
        const inward = 0.04; // the wall faces into the room; the foam sits just off it
        foam.position.set(
          sideways ? x + Math.sign(Math.sin(ry)) * inward : x + along,
          floorY + 1.0 + row * 0.7,
          sideways ? z + along : z - inward,
        );
        foam.rotation.y = ry;
        root.add(foam);
      }
    }
  }
  const roof = new THREE.Mesh(track(new THREE.PlaneGeometry(width, depth)), insideWall);
  roof.rotation.x = Math.PI / 2;
  roof.position.set(cx, floorY + HEIGHT, (a.z0 + a.z1) / 2);
  ceiling.add(roof);
  // A low strip of colour along the foot of the far wall.
  const baseStrip = new THREE.Mesh(track(new THREE.BoxGeometry(width - 0.2, 0.04, 0.04)), neon(accent));
  baseStrip.position.set(cx, floorY + 0.06, a.z1 - 0.08);
  root.add(baseStrip);

  /* ---------- the projector, and the beam it throws on the screen ---------- */
  const projectorX = 0;
  const projectorZ = a.z0 + 1.2;
  const lensY = floorY + 1.45;
  const metal = track(mat("#4a4656", 0.4, { metalness: 0.5 }));
  const pedestal = box(0.5, 1.05, 0.5, track(mat("#2a2433", 0.6)), false);
  pedestal.position.set(projectorX, floorY + 0.525, projectorZ);
  const body = box(0.85, 0.5, 1.5, metal, false);
  body.position.set(projectorX, lensY - 0.05, projectorZ - 0.1);
  const housing = new THREE.Mesh(track(new THREE.CylinderGeometry(0.17, 0.2, 0.55, 20)), metal);
  housing.rotation.x = Math.PI / 2;
  housing.position.set(projectorX, lensY - 0.05, a.z0 + 0.35);
  const lensGlass = new THREE.Mesh(track(new THREE.CircleGeometry(0.15, 20)), neon("#cfe0ff"));
  lensGlass.rotation.y = Math.PI;
  lensGlass.position.set(projectorX, lensY - 0.05, a.z0 + 0.07);
  root.add(pedestal, body, housing, lensGlass);
  // Two film reels on the top, turning while it runs.
  const reels: THREE.Group[] = [];
  const reelDisc = track(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 28));
  const reelMat = track(mat("#d9d4c8", 0.4, { metalness: 0.5 }));
  const holeMat = track(mat("#0c0a10", 0.8));
  const holeGeometry = track(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 12));
  for (const [i, z] of [-0.25, 0.3].entries()) {
    const reel = new THREE.Group();
    reel.add(new THREE.Mesh(reelDisc, reelMat));
    for (let k = 0; k < 5; k++) {
      const cut = new THREE.Mesh(holeGeometry, holeMat);
      cut.position.set(Math.cos((k / 5) * Math.PI * 2) * 0.2, 0, Math.sin((k / 5) * Math.PI * 2) * 0.2);
      reel.add(cut);
    }
    reel.rotation.z = Math.PI / 2; // lying on its side: it turns about the x axis
    reel.position.set(projectorX + (i ? 0.1 : -0.1), lensY + 0.45 + i * 0.12, projectorZ - 0.1 + z);
    reel.scale.setScalar(i ? 0.8 : 1);
    root.add(reel);
    reels.push(reel);
  }
  // The beam: a faint cone from the lens to the screen, brightening when something is playing.
  const from = new THREE.Vector3(projectorX, lensY - 0.05, a.z0 + 0.1);
  const to = new THREE.Vector3(0, screen.y, -CINEMA.halfZ + 0.2);
  const run = to.clone().sub(from);
  const beamMaterial = track(new THREE.MeshBasicMaterial({ color: "#cfe0ff", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const beam = new THREE.Mesh(track(new THREE.CylinderGeometry(screen.width * 0.58, 0.12, run.length(), 32, 1, true)), beamMaterial);
  beam.position.copy(from).add(to).multiplyScalar(0.5);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), run.clone().normalize());
  beam.renderOrder = 3;
  root.add(beam);

  /* ---------- the desk: faders, buttons and level meters ---------- */
  const deskZ = a.z1 - 0.75;
  const desk = box(6.2, 0.95, 0.9, track(mat("#2a2433", 0.6)), false);
  desk.position.set(cx, floorY + 0.475, deskZ);
  root.add(desk);
  const panel = new THREE.Group();
  panel.position.set(cx, floorY + 1.0, deskZ);
  panel.rotation.x = -0.32;
  root.add(panel);
  const panelTop = box(6.0, 0.06, 0.84, metal, false);
  panel.add(panelTop);
  const slot = track(new THREE.BoxGeometry(0.03, 0.01, 0.4));
  const slotMat = track(mat("#07060a", 1));
  const knobGeometry = track(new THREE.BoxGeometry(0.1, 0.05, 0.06));
  const knobs: Array<{ mesh: THREE.Mesh; base: number; phase: number }> = [];
  const faderColours = [accent, look.fairy[1] ?? accent, look.lamp];
  for (let i = 0; i < 18; i++) {
    const x = -2.7 + i * 0.2;
    const lane = new THREE.Mesh(slot, slotMat);
    lane.position.set(x, 0.035, 0.12);
    panel.add(lane);
    const knob = new THREE.Mesh(knobGeometry, track(new THREE.MeshBasicMaterial({ color: faderColours[i % faderColours.length], toneMapped: false })));
    const base = -0.1 + ((i * 37) % 10) / 25;
    knob.position.set(x, 0.06, 0.12 + base);
    panel.add(knob);
    knobs.push({ mesh: knob, base, phase: i * 1.3 });
  }
  const buttonGeometry = track(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 14));
  const buttons: THREE.MeshBasicMaterial[] = [];
  for (let i = 0; i < 14; i++) {
    const colour = ["#ff4b4b", "#ffd24b", "#4bff8a", accent][i % 4];
    const material = track(new THREE.MeshBasicMaterial({ color: colour, toneMapped: false, transparent: true, opacity: 0.8 }));
    const button = new THREE.Mesh(buttonGeometry, material);
    button.position.set(-2.6 + i * 0.2, 0.05, -0.28);
    panel.add(button);
    buttons.push(material);
  }
  // Level meters: two columns of bars that bounce while the film runs.
  const meterGeometry = track(new THREE.BoxGeometry(0.07, 0.03, 0.05));
  const meters: Array<{ material: THREE.MeshBasicMaterial; level: number }> = [];
  for (const [col, x] of [2.2, 2.45].entries()) {
    for (let row = 0; row < 10; row++) {
      const colour = row < 6 ? "#38ff7a" : row < 8 ? "#ffd24b" : "#ff3b3b";
      const material = track(new THREE.MeshBasicMaterial({ color: colour, toneMapped: false, transparent: true, opacity: 0.1 }));
      const bar = new THREE.Mesh(meterGeometry, material);
      bar.position.set(x + col * 0.0, 0.05, -0.3 + row * 0.055);
      bar.position.x = 2.55 + col * 0.12;
      panel.add(bar);
      meters.push({ material, level: row / 10 });
    }
  }
  // Monitors on the far wall mirror whatever is on the screen.
  const monitorMaterial = track(new THREE.MeshBasicMaterial({ color: "#0f0c16", toneMapped: false }));
  const bezel = track(mat("#0d0b12", 0.5));
  for (const [i, x] of [-2.1, 0, 2.1].entries()) {
    const set = new THREE.Group();
    set.add(box(1.7, 1.0, 0.07, bezel, false));
    const face = new THREE.Mesh(track(new THREE.PlaneGeometry(1.56, 0.878)), monitorMaterial);
    face.position.z = -0.04;
    face.rotation.y = Math.PI;
    set.add(face);
    set.position.set(cx + x, floorY + 2.15, a.z1 - 0.2);
    set.rotation.y = (i - 1) * -0.18;
    root.add(set);
  }
  let mirrored: THREE.Texture | null | undefined;

  /* ---------- decoration: film reels on a rack, a neon sign, a stool ---------- */
  const rack = box(0.3, 0.06, 2.6, trim, false);
  rack.position.set(a.x0 + 0.2, floorY + 1.7, a.z0 + 1.9);
  root.add(rack);
  const canGeometry = track(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 20));
  const canColours = ["#b9402f", "#d6a64a", "#5d7fb5", "#6a9a6e", "#8a5aa8"];
  for (let i = 0; i < 6; i++) {
    const can = new THREE.Mesh(canGeometry, track(mat(canColours[i % canColours.length], 0.5, { metalness: 0.4 })));
    can.rotation.z = Math.PI / 2;
    can.position.set(a.x0 + 0.2, floorY + 1.95, a.z0 + 0.8 + i * 0.4);
    root.add(can);
  }
  const sign = new THREE.Mesh(
    track(new THREE.PlaneGeometry(2.4, 0.6)),
    track(new THREE.MeshBasicMaterial({
      toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      map: track(canvasTexture(512, 128, (ctx) => {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, 512, 128);
        ctx.font = "bold 78px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = accent;
        ctx.shadowBlur = 18;
        ctx.fillStyle = accent;
        ctx.fillText("ACTION!", 256, 68);
      })),
    })),
  );
  sign.position.set(a.x1 - 0.05, floorY + 2.4, a.z0 + 1.7);
  sign.rotation.y = -Math.PI / 2;
  root.add(sign);
  const stool = new THREE.Mesh(track(new THREE.CylinderGeometry(0.26, 0.26, 0.08, 20)), track(mat(look.sofaCushion, 0.8)));
  stool.position.set(cx + 0.9, floorY + 0.62, deskZ - 0.95);
  const stoolLeg = new THREE.Mesh(track(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8)), metal);
  stoolLeg.position.set(cx + 0.9, floorY + 0.3, deskZ - 0.95);
  root.add(stool, stoolLeg);

  // Low, moody light: one lamp over the desk. The hall's own lights are not turned down for this.
  const lamp = new THREE.PointLight(look.lamp, 16, 9, 1.4);
  lamp.position.set(cx, floorY + 2.7, a.z0 + depth * 0.5);
  const projectorLamp = new THREE.PointLight(accent, 5, 5, 1.6);
  projectorLamp.position.set(projectorX, floorY + 2.4, a.z0 + 0.8);
  root.add(lamp, projectorLamp);
  const deskGlow = addGlow(look.lamp, 2.2, new THREE.Vector3(cx, floorY + 1.6, deskZ - 0.5), 0.12);

  /* ---------- running ---------- */
  let live = false;
  let level = 0; // 0..1: how far the show is "on", eased
  return {
    setLive(on) {
      live = on;
      onAirMaterial.map = on ? onAirOn : onAirOff;
      onAirMaterial.needsUpdate = true;
    },
    update(t, dt) {
      level += ((live ? 1 : 0) - level) * Math.min(1, dt * 3);
      onAirGlow.material.opacity = level * (0.6 + Math.sin(t * 3) * 0.08);
      beamMaterial.opacity = 0.012 + level * (0.055 + Math.sin(t * 24) * 0.004);
      for (const [i, reel] of reels.entries()) reel.rotation.x += dt * (i ? 5.4 : 4.1) * level;
      for (const knob of knobs) knob.mesh.position.z = 0.12 + knob.base + (live ? Math.sin(t * 1.4 + knob.phase) * 0.05 * level : 0);
      for (const [i, button] of buttons.entries()) button.opacity = live ? 0.55 + 0.45 * (Math.sin(t * 4 + i * 0.9) > 0 ? 1 : 0.2) : 0.35;
      const energy = level * (0.55 + 0.35 * Math.sin(t * 6.1) * Math.sin(t * 2.3 + 1));
      for (const [i, meter] of meters.entries()) {
        const wobble = i < 10 ? 0 : 0.12 * Math.sin(t * 5.3);
        meter.material.opacity = energy + wobble > meter.level ? 0.95 : 0.1;
      }
      deskGlow.material.opacity = 0.1 + level * 0.06;
      // Mirror the screen onto the monitors; a texture swap needs the material told.
      const map = screen.material.map;
      if (map !== mirrored) { monitorMaterial.map = map; monitorMaterial.needsUpdate = true; mirrored = map; }
      monitorMaterial.color.copy(screen.material.color);
    },
    dispose: () => { for (const item of disposables) item.dispose(); },
  };
}

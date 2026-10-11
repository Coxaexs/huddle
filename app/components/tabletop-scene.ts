/**
 * The tabletop room: a round table with a battle map on it and ten chairs, a
 * pendant lamp over it, shelves of books and a wall screen. Dice are thrown
 * onto the map (see tabletop-dice.ts).
 */
import * as THREE from "three";
import type { RoomTheme } from "../hooks/use-living-room";
import { TABLETOP, TABLE_CENTRE, TABLE_RADIUS } from "../lib/living-room";
import { addPropList, TABLETOP_PROPS } from "./living-room-props";
import { LOOKS, box, canvasTexture, candle, floorTexture, glowTexture, mat, plant, seeded, tagSeat, wallTexture, type BuiltRoom } from "./living-room-scene";

/** Height of the map the dice land on. */
export const TABLE_SURFACE_Y = 0.82;

/** A parchment battle map: a grid, a few rooms, a river and some marks. */
function mapTexture(theme: RoomTheme) {
  const night = theme === "matrix" || theme === "cyberpunk";
  return canvasTexture(1024, 1024, (ctx) => {
    const size = 1024;
    const g = ctx.createRadialGradient(size / 2, size / 2, 80, size / 2, size / 2, size / 2);
    if (theme === "matrix") { g.addColorStop(0, "#04210f"); g.addColorStop(1, "#010a05"); }
    else if (theme === "cyberpunk") { g.addColorStop(0, "#1b0f40"); g.addColorStop(1, "#08041a"); }
    else if (theme === "vampire") { g.addColorStop(0, "#c9a98a"); g.addColorStop(1, "#7a5a45"); }
    else { g.addColorStop(0, "#ecd9a8"); g.addColorStop(1, "#c9a96b"); }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const ink = night ? (theme === "matrix" ? "#00e060" : "#00f0ff") : "#4a3322";
    // Grid.
    ctx.strokeStyle = night ? `${ink}55` : "rgba(74,51,34,0.28)";
    ctx.lineWidth = 2;
    for (let i = 0; i <= 16; i++) {
      ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(size, i * 64); ctx.stroke();
    }
    // A river.
    ctx.strokeStyle = night ? "#0a5" : "rgba(70,120,170,0.7)";
    ctx.lineWidth = 34;
    ctx.beginPath(); ctx.moveTo(-20, 700); ctx.bezierCurveTo(250, 560, 420, 860, 640, 700); ctx.bezierCurveTo(780, 600, 900, 700, 1050, 560); ctx.stroke();
    // Rooms and corridors.
    ctx.strokeStyle = ink;
    ctx.lineWidth = 7;
    ctx.fillStyle = night ? `${ink}22` : "rgba(74,51,34,0.12)";
    for (const [x, y, w, h] of [[170, 150, 260, 200], [560, 120, 300, 230], [250, 380, 190, 140], [620, 430, 230, 150]]) {
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    }
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(430, 250); ctx.lineTo(560, 230); ctx.moveTo(340, 350); ctx.lineTo(340, 380); ctx.moveTo(740, 350); ctx.lineTo(740, 430); ctx.stroke();
    // An X marks the spot, and a compass.
    ctx.lineWidth = 12;
    ctx.strokeStyle = night ? "#ff2fb4" : "#9c2b22";
    ctx.beginPath(); ctx.moveTo(700, 480); ctx.lineTo(760, 540); ctx.moveTo(760, 480); ctx.lineTo(700, 540); ctx.stroke();
    ctx.fillStyle = ink;
    ctx.font = "700 52px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("N", 900, 860);
    ctx.lineWidth = 6; ctx.strokeStyle = ink;
    ctx.beginPath(); ctx.moveTo(900, 960); ctx.lineTo(900, 880); ctx.stroke();
  });
}

export function buildTabletop(theme: RoomTheme): BuiltRoom {
  const look = LOOKS[theme];
  const root = new THREE.Group();
  const ceiling = new THREE.Group();
  root.add(ceiling);
  const W = TABLETOP.halfX * 2;
  const D = TABLETOP.halfZ * 2;
  const H = TABLETOP.height;
  const glow = glowTexture();
  const addGlow = (colour: string, size: number, at: THREE.Vector3, opacity = 0.5, parent: THREE.Object3D = root) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: colour, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    sprite.scale.setScalar(size);
    sprite.position.copy(at);
    parent.add(sprite);
    return sprite;
  };
  const flickers: Array<{ mesh: THREE.Object3D; phase: number }> = [];
  const rand = seeded(11);

  // Floor and a round rug under the table.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat("#ffffff", 0.75, { map: floorTexture(look) }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.userData.floor = true;
  root.add(floor);
  const rug = new THREE.Mesh(new THREE.CircleGeometry(3.1, 64), mat(look.rug[2], 1));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(TABLE_CENTRE.x, 0.006, TABLE_CENTRE.z);
  rug.receiveShadow = true;
  rug.userData.floor = true;
  const rugRing = new THREE.Mesh(new THREE.RingGeometry(2.78, 2.9, 64), mat(look.rug[1], 1));
  rugRing.rotation.x = -Math.PI / 2;
  rugRing.position.set(TABLE_CENTRE.x, 0.008, TABLE_CENTRE.z);
  rugRing.userData.floor = true;
  root.add(rug, rugRing);

  // Walls, with a wainscot and a crown.
  const wallMaterial = mat("#ffffff", 0.95, { map: wallTexture(look) });
  const wainscot = mat(look.wainscot, 0.7);
  const trim = mat(look.trim, 0.5);
  for (const [width, x, z, ry] of [[W, 0, -TABLETOP.halfZ, 0], [W, 0, TABLETOP.halfZ, Math.PI], [D, -TABLETOP.halfX, 0, Math.PI / 2], [D, TABLETOP.halfX, 0, -Math.PI / 2]] as const) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(width, H), wallMaterial);
    wall.position.set(x, H / 2, z);
    wall.rotation.y = ry;
    wall.receiveShadow = true;
    root.add(wall);
    const inward = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
    const lower = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.95), wainscot);
    lower.position.set(x + inward.x * 0.012, 0.475, z + inward.z * 0.012);
    lower.rotation.y = ry;
    root.add(lower);
    const rail = box(width, 0.05, 0.04, trim, false);
    rail.position.set(x + inward.x * 0.03, 0.96, z + inward.z * 0.03);
    rail.rotation.y = ry;
    root.add(rail);
    const crown = box(width, 0.1, 0.06, trim, false);
    crown.position.set(x + inward.x * 0.03, H - 0.05, z + inward.z * 0.03);
    crown.rotation.y = ry;
    ceiling.add(crown);
  }
  const ceilingPlane = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat(look.ceiling, 1));
  ceilingPlane.rotation.x = Math.PI / 2;
  ceilingPlane.position.y = H;
  ceiling.add(ceilingPlane);

  // The table: wooden rim, the map set into it, a stout column and feet.
  const woodMat = mat(look.wood, 0.45);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_RADIUS, TABLE_RADIUS, 0.08, 64), woodMat);
  rim.position.set(TABLE_CENTRE.x, TABLE_SURFACE_Y - 0.05, TABLE_CENTRE.z);
  rim.castShadow = true;
  rim.receiveShadow = true;
  const surface = new THREE.Mesh(new THREE.CircleGeometry(TABLE_RADIUS - 0.17, 64), mat("#ffffff", 0.85, { map: mapTexture(theme) }));
  surface.rotation.x = -Math.PI / 2;
  surface.position.set(TABLE_CENTRE.x, TABLE_SURFACE_Y - 0.008, TABLE_CENTRE.z);
  surface.receiveShadow = true;
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, TABLE_SURFACE_Y - 0.1, 24), mat(look.woodDark, 0.6));
  column.position.set(TABLE_CENTRE.x, (TABLE_SURFACE_Y - 0.1) / 2, TABLE_CENTRE.z);
  column.castShadow = true;
  root.add(rim, surface, column);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const foot = box(0.12, 0.1, 0.8, mat(look.woodDark, 0.6));
    foot.position.set(TABLE_CENTRE.x + Math.sin(a) * 0.45, 0.05, TABLE_CENTRE.z + Math.cos(a) * 0.45);
    foot.rotation.y = a;
    root.add(foot);
  }

  // On the table: figurines on the map, candles and tankards at the edge.
  const minis: Array<[number, number, string]> = [[-0.55, -0.35, look.pillows[0]], [-0.3, 0.1, look.pillows[1]], [0.25, -0.5, look.pillows[2]], [0.6, 0.2, look.pillows[3]], [0.05, 0.55, "#c0392b"]];
  for (const [dx, dz, colour] of minis) {
    const mini = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.015, 16), mat("#2a2a2a", 0.6));
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.11, 14), mat(colour, 0.6));
    body.position.y = 0.075;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), mat("#e8c9a0", 0.7));
    head.position.y = 0.15;
    mini.add(base, body, head);
    mini.position.set(TABLE_CENTRE.x + dx, TABLE_SURFACE_Y + 0.008, TABLE_CENTRE.z + dz);
    mini.traverse((part) => { part.castShadow = true; });
    root.add(mini);
  }
  for (const a of [0.4, 2.5, 4.4]) {
    const c = candle(0.12, theme === "vampire" ? "#2a0a10" : "#f5e6c8");
    c.position.set(TABLE_CENTRE.x + Math.sin(a) * 1.28, TABLE_SURFACE_Y + 0.006, TABLE_CENTRE.z + Math.cos(a) * 1.28);
    root.add(c);
    flickers.push({ mesh: c.userData.flame, phase: a * 3 });
    addGlow(look.lamp, 0.5, new THREE.Vector3(c.position.x, c.position.y + 0.2, c.position.z), 0.5);
  }
  for (let i = 0; i < 5; i++) {
    const a = 0.9 + i * 1.25;
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.1, 14), mat(i % 2 ? "#b08a5a" : "#8a8f98", 0.5, { metalness: 0.3 }));
    mug.position.set(TABLE_CENTRE.x + Math.sin(a) * 1.3, TABLE_SURFACE_Y + 0.05, TABLE_CENTRE.z + Math.cos(a) * 1.3);
    mug.castShadow = true;
    root.add(mug);
  }

  // Ten chairs, each clickable to sit in.
  for (const seat of TABLETOP.seats) {
    const chair = new THREE.Group();
    const wood = mat(look.woodDark, 0.6);
    const seatPad = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.07, 20), mat(look.sofaCushion, 0.9));
    seatPad.position.y = 0.4;
    const back = box(0.5, 0.52, 0.06, mat(look.sofa, 0.85));
    back.position.set(0, 0.72, 0.27);
    for (const [lx, lz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
      const leg = box(0.05, 0.4, 0.05, wood);
      leg.position.set(lx, 0.2, lz);
      chair.add(leg);
    }
    seatPad.castShadow = true;
    chair.add(seatPad, back);
    chair.position.set(seat.x, 0, seat.z);
    chair.rotation.y = -seat.facing;
    tagSeat(chair, seat.id);
    root.add(chair);
  }

  // Pendant lamp over the table.
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.4, 28, 1, true), new THREE.MeshStandardMaterial({ color: look.lamp, emissive: look.lamp, emissiveIntensity: 0.6, side: THREE.DoubleSide, roughness: 0.8 }));
  shade.position.set(TABLE_CENTRE.x, H - 0.85, TABLE_CENTRE.z);
  const cord = box(0.015, 0.7, 0.015, mat("#222", 0.8), false);
  cord.position.set(TABLE_CENTRE.x, H - 0.35, TABLE_CENTRE.z);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), new THREE.MeshBasicMaterial({ color: "#fff4d8", toneMapped: false }));
  bulb.position.set(TABLE_CENTRE.x, H - 0.92, TABLE_CENTRE.z);
  ceiling.add(shade, cord, bulb);
  addGlow(look.lamp, 1.6, new THREE.Vector3(TABLE_CENTRE.x, H - 0.95, TABLE_CENTRE.z), 0.55, ceiling);
  const pendant = new THREE.PointLight(look.lamp, 22, 9, 1.5);
  pendant.position.set(TABLE_CENTRE.x, H - 1.0, TABLE_CENTRE.z);
  pendant.castShadow = true;
  pendant.shadow.mapSize.set(1024, 1024);
  pendant.shadow.bias = -0.002;
  pendant.shadow.radius = 4;
  root.add(pendant);
  root.add(new THREE.HemisphereLight(look.hemi[0], look.hemi[1], look.hemi[2] * 0.9));

  // The wall screen, for what the room is watching or listening to.
  const screenMaterial = new THREE.MeshBasicMaterial({ color: "#0f0c16", toneMapped: false });
  const SW = 2.6;
  const SHt = 1.46;
  const frame = box(SW + 0.16, SHt + 0.16, 0.06, mat(look.woodDark, 0.5), false);
  frame.position.set(TABLETOP.tv.x, TABLETOP.tv.height, -TABLETOP.halfZ + 0.05);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SW, SHt), screenMaterial);
  screen.position.set(TABLETOP.tv.x, TABLETOP.tv.height, -TABLETOP.halfZ + 0.09);
  root.add(frame, screen);
  const sideboard = box(2.8, 0.7, 0.45, mat(look.wood, 0.55));
  sideboard.position.set(0, 0.35, -TABLETOP.halfZ + 0.26);
  root.add(sideboard);

  // Bookshelf on the west wall: a painted run of spines in a frame.
  const spines = canvasTexture(512, 512, (ctx) => {
    ctx.fillStyle = "#1a0f08";
    ctx.fillRect(0, 0, 512, 512);
    const colours = [...look.pillows, look.rug[0], look.rug[1], look.rug[2], "#d9cba0"];
    for (let row = 0; row < 5; row++) {
      let x = 8;
      while (x < 500) {
        const w = 14 + Math.floor(rand() * 20);
        const h = 70 + Math.floor(rand() * 26);
        ctx.fillStyle = colours[Math.floor(rand() * colours.length)];
        ctx.fillRect(x, row * 100 + 96 - h, w, h);
        x += w + 2;
      }
      ctx.fillStyle = "#4a2f1c";
      ctx.fillRect(0, row * 100 + 96, 512, 6);
    }
  });
  const shelf = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 2.2), new THREE.MeshStandardMaterial({ map: spines, roughness: 0.9 }));
  shelf.position.set(-TABLETOP.halfX + 0.06, 1.2, -1.2);
  shelf.rotation.y = Math.PI / 2;
  const shelfFrame = box(0.12, 2.3, 3.1, mat(look.woodDark, 0.6), false);
  shelfFrame.position.set(-TABLETOP.halfX + 0.04, 1.2, -1.2);
  root.add(shelfFrame, shelf);

  // Plants in the south corners, and string lights along the north wall.
  for (const [x, z, s] of [[TABLETOP.halfX - 0.5, TABLETOP.halfZ - 0.5, 1.4], [-TABLETOP.halfX + 0.5, TABLETOP.halfZ - 0.5, 1.2]] as const) {
    const p = plant(look, s, theme === "vampire" ? "#2f3d2a" : theme === "matrix" ? "#1d6b35" : theme === "cyberpunk" ? "#2fbf8f" : "#4f8f4f");
    p.position.set(x, 0, z);
    root.add(p);
  }
  const bulbs: THREE.Mesh[] = [];
  for (let i = 0; i < 32; i++) {
    const t = i / 31;
    const p = new THREE.Vector3(-TABLETOP.halfX + 0.4 + t * (W - 0.8), H - 0.25 - Math.sin(t * Math.PI * 4) ** 2 * 0.15, -TABLETOP.halfZ + 0.05);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: look.fairy[i % look.fairy.length], toneMapped: false }));
    b.position.copy(p);
    b.userData.phase = i * 0.7;
    bulbs.push(b);
    root.add(b);
    if (i % 3 === 0) addGlow(look.fairy[i % look.fairy.length], 0.3, p, 0.45);
  }

  const stopProps = addPropList(root, TABLETOP_PROPS[theme], addGlow);
  let lit = 0;
  const update = (t: number) => {
    for (const { mesh, phase } of flickers) {
      mesh.scale.y = 0.85 + Math.sin(t * 9 + phase) * 0.14 + Math.sin(t * 23 + phase * 2) * 0.07;
    }
    for (const b of bulbs) b.scale.setScalar(0.75 + Math.sin(t * 1.4 + (b.userData.phase as number)) * 0.25);
    lit = t;
    pendant.intensity = 22 * (1 + Math.sin(lit * 3.1) * 0.015);
  };

  return {
    root,
    ceiling,
    screenMaterial,
    background: new THREE.Color(look.background),
    fog: new THREE.Fog(look.fog, 12, 26),
    exposure: look.exposure,
    update,
    dispose: () => { stopProps(); glow.dispose(); },
  };
}

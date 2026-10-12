/**
 * The meadow: a small open world to wander in. Rolling grass, a pond with a
 * jetty, a campfire ringed with logs, a cabin, a picnic table, a lookout bench
 * on the hill and an open-air screen by the fire.
 *
 * Built to be cheap: the ground is one 96x96 grid with vertex colours, trees
 * and rocks and grass tufts are instanced (a handful of draw calls for all of
 * them), one shadowed sun, and fog hides the far edge. It follows the clock:
 * by day a blue sky, at night a moon, stars, fireflies and the fire.
 */
import * as THREE from "three";
import type { RoomTheme } from "../hooks/use-living-room";
import {
  CABIN, CABIN_DOOR_HALF, CABIN_FLOOR_Y, CAMPFIRE, JETTY, LOOKOUT, MEADOW, MEADOW_HALF, MEADOW_TREES, PICNIC, POND, WATER_Y, inCabin, meadowHeight,
} from "../lib/living-room";
import { LOOKS, box, canvasTexture, cushion, floorTexture, glowTexture, isNight, mat, plant, seeded, tagSeat, type BuiltRoom, type Look } from "./living-room-scene";

const GROUND_EXTENT = MEADOW_HALF + 20;

/** Ground colour by height and place: sand by the water, dirt paths, grass, rock up high. */
function groundColour(x: number, z: number, h: number, rand: () => number, night: boolean, out: THREE.Color) {
  const pond = Math.hypot(x - POND.x, z - POND.z);
  const grass = new THREE.Color(night ? "#36593a" : "#5d9a46").offsetHSL((rand() - 0.5) * 0.03, 0, (rand() - 0.5) * 0.06);
  out.copy(grass);
  // Darker in the hollows, lighter on the tops.
  out.offsetHSL(0, 0, Math.max(-0.08, Math.min(0.08, h * 0.03)));
  // Bare rock on the lookout hill's top; the rim at the world's edge stays green so it fades into the haze.
  if (h > 2.4 && Math.max(Math.abs(x), Math.abs(z)) < MEADOW_HALF - 2) out.lerp(new THREE.Color(night ? "#4a4a44" : "#8d8a7a"), Math.min(0.6, (h - 2.4) / 2));
  else if (Math.max(Math.abs(x), Math.abs(z)) > MEADOW_HALF) out.lerp(new THREE.Color(night ? "#253d28" : "#4e8a3e"), 0.5);
  if (pond < POND.radius + 1.6) out.lerp(new THREE.Color(night ? "#6b6248" : "#d8c48e"), Math.max(0, 1 - (pond - POND.radius + 0.6) / 2.2));
  // Paths: from the south to the fire, the fire to the cabin, the fire to the jetty, and up the hill.
  const onPath = (ax: number, az: number, bx: number, bz: number) => {
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
  };
  const path = Math.min(
    onPath(0, MEADOW_HALF, CAMPFIRE.x, CAMPFIRE.z + 2.6),
    onPath(CAMPFIRE.x - 2.4, CAMPFIRE.z - 1, CABIN.x + 1, CABIN.z + CABIN.d / 2 + 1),
    onPath(CAMPFIRE.x - 2.4, CAMPFIRE.z + 1, JETTY.x1 + 0.2, JETTY.z),
    onPath(CAMPFIRE.x + 2.4, CAMPFIRE.z - 1, LOOKOUT.x - 1, LOOKOUT.z + 1.5),
    onPath(CAMPFIRE.x + 2.4, CAMPFIRE.z + 1, PICNIC.x - 1.5, PICNIC.z),
  );
  if (path < 0.9) out.lerp(new THREE.Color(night ? "#4d3f2c" : "#a7865a"), (1 - path / 0.9) * 0.85);
  const fire = Math.hypot(x - CAMPFIRE.x, z - CAMPFIRE.z);
  if (fire < 1.5) out.lerp(new THREE.Color("#3a2c22"), 1 - fire / 1.5);
}

function skyDome(night: boolean) {
  const texture = canvasTexture(16, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    if (night) { g.addColorStop(0, "#050a1e"); g.addColorStop(0.55, "#101c3a"); g.addColorStop(1, "#2b3352"); }
    else { g.addColorStop(0, "#3d7fd6"); g.addColorStop(0.55, "#8cc0ef"); g.addColorStop(1, "#dcecf5"); }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 256);
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(110, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2 + 0.2), new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, fog: false, depthWrite: false }));
  dome.renderOrder = -1;
  return dome;
}

export function buildMeadow(theme: RoomTheme, night = isNight()): BuiltRoom {
  const look = LOOKS[theme];
  const root = new THREE.Group();
  const ceiling = new THREE.Group();
  root.add(ceiling);
  const rand = seeded(23);
  const glow = glowTexture();
  // Smoke and clouds: a soft round puff that fades to transparent (the glow texture is for additive light).
  const puffTexture = canvasTexture(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.5, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
  const animated: Array<(t: number) => void> = [];
  const disposables: Array<{ dispose: () => void }> = [glow, puffTexture];

  root.add(skyDome(night));

  // Ground: one grid, heights from the shared terrain function so feet meet it.
  const segments = 96;
  const ground = new THREE.PlaneGeometry(GROUND_EXTENT * 2, GROUND_EXTENT * 2, segments, segments);
  ground.rotateX(-Math.PI / 2);
  const positions = ground.getAttribute("position");
  const colours = new Float32Array(positions.count * 3);
  const colour = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const h = meadowHeight(x, z);
    positions.setY(i, h);
    groundColour(x, z, h, rand, night, colour);
    colours.set([colour.r, colour.g, colour.b], i * 3);
  }
  ground.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  ground.computeVertexNormals();
  const groundMesh = new THREE.Mesh(ground, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  groundMesh.receiveShadow = true;
  groundMesh.userData.floor = true;
  root.add(groundMesh);

  // The pond.
  const waterMaterial = new THREE.MeshStandardMaterial({ color: night ? "#244a6e" : "#3f86b5", roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.86 });
  const water = new THREE.Mesh(new THREE.CircleGeometry(POND.radius + 1.4, 48), waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.set(POND.x, WATER_Y, POND.z);
  water.userData.floor = true;
  root.add(water);
  // Lily pads.
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2;
    const r = 1 + rand() * (POND.radius - 1.5);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.25 + rand() * 0.15, 12, 0.3, Math.PI * 1.85), mat("#3f7d3a", 0.7));
    pad.rotation.x = -Math.PI / 2;
    pad.rotation.z = rand() * 6;
    pad.position.set(POND.x + Math.cos(a) * r, WATER_Y + 0.01, POND.z + Math.sin(a) * r);
    root.add(pad);
  }

  // The jetty: planks on posts out over the water.
  const plank = mat("#8a6440", 0.85);
  const deckY = WATER_Y + 0.3;
  const deck = box(JETTY.x1 - JETTY.x0 + 0.6, 0.08, 1.3, plank);
  deck.position.set((JETTY.x0 + JETTY.x1 + 0.6) / 2, deckY, JETTY.z);
  deck.userData.floor = true;
  root.add(deck);
  for (let x = JETTY.x0 + 0.1; x <= JETTY.x1 + 0.5; x += 1.1) {
    for (const dz of [-0.6, 0.6]) {
      const post = box(0.12, 1.2, 0.12, mat("#5a4028", 0.9));
      post.position.set(x, deckY - 0.5, JETTY.z + dz);
      root.add(post);
    }
  }
  for (const seat of MEADOW.seats.filter((s) => s.id.startsWith("jetty"))) {
    const spot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 12), mat(look.sofaCushion, 0.9));
    spot.position.set(seat.x, deckY + 0.07, seat.z);
    tagSeat(spot, seat.id);
    root.add(spot);
  }

  // Campfire: a ring of stones, logs, flames and a warm light.
  const fireY = meadowHeight(CAMPFIRE.x, CAMPFIRE.z);
  const stone = mat("#7c7a74", 0.95);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), stone);
    rock.position.set(CAMPFIRE.x + Math.cos(a) * 0.62, fireY + 0.08, CAMPFIRE.z + Math.sin(a) * 0.62);
    rock.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    rock.castShadow = true;
    root.add(rock);
  }
  for (let i = 0; i < 4; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.9, 8), mat("#4a3020", 0.9));
    log.rotation.z = Math.PI / 2 - 0.5;
    log.rotation.y = (i / 4) * Math.PI * 2;
    log.position.set(CAMPFIRE.x, fireY + 0.2, CAMPFIRE.z);
    root.add(log);
  }
  const flames: THREE.Mesh[] = [];
  for (const [colour, r, h, y] of [[look.fire[1], 0.34, 0.9, 0.5], [look.fire[0], 0.2, 0.65, 0.42], ["#fff3c4", 0.09, 0.4, 0.32]] as const) {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(r, h, 10, 1, true), new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false }));
    flame.position.set(CAMPFIRE.x, fireY + y, CAMPFIRE.z);
    flames.push(flame);
    root.add(flame);
  }
  const fireGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: look.fireLight, transparent: true, opacity: night ? 0.75 : 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  fireGlow.scale.setScalar(night ? 4.5 : 2.2);
  fireGlow.position.set(CAMPFIRE.x, fireY + 0.6, CAMPFIRE.z);
  root.add(fireGlow);
  const fireLight = new THREE.PointLight(look.fireLight, night ? 26 : 6, 14, 1.6);
  fireLight.position.set(CAMPFIRE.x, fireY + 1, CAMPFIRE.z);
  root.add(fireLight);
  animated.push((t) => {
    flames.forEach((flame, i) => {
      flame.scale.set(1 + Math.sin(t * 7 + i) * 0.08, 0.85 + Math.sin(t * 11 + i * 2) * 0.18 + Math.sin(t * 23 + i) * 0.06, 1 + Math.cos(t * 6 + i) * 0.08);
      flame.rotation.y = t * (0.8 + i * 0.4);
    });
    fireLight.intensity = (night ? 26 : 6) * (0.85 + Math.sin(t * 9) * 0.08 + Math.sin(t * 21) * 0.05);
  });

  // Log seats round the fire.
  const bark = mat("#5b3d26", 0.95);
  for (const seat of MEADOW.seats.filter((s) => s.id.startsWith("fire-"))) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 1.05, 10), bark);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = -seat.facing;
    log.position.set(seat.x, (seat.y ?? 0) + 0.2, seat.z);
    log.castShadow = true;
    log.receiveShadow = true;
    // The cut ends, lighter.
    tagSeat(log, seat.id);
    root.add(log);
  }

  // Home: the cabin, walk-in, with a fire, a couch and a Blåhaj. Its roof lifts off when you are inside.
  const home = buildCabin(look, night, glow, animated);
  root.add(home.group);
  const roof = home.roof;
  const shark = home.shark;
  const cabinY = CABIN_FLOOR_Y;
  // Smoke from the chimney: a few soft puffs.
  const puffs: THREE.Sprite[] = [];
  for (let i = 0; i < 5; i++) {
    const puff = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture, color: night ? "#6a6f80" : "#e8ecef", transparent: true, opacity: 0.4, depthWrite: false }));
    root.add(puff);
    puffs.push(puff);
  }
  animated.push((t) => {
    puffs.forEach((puff, i) => {
      const k = ((t * 0.18 + i / puffs.length) % 1);
      puff.position.set(CABIN.x + Math.sin(t * 0.4 + i) * 0.3 + k * 1.2, cabinY + 4.6 + k * 3, CABIN.z - CABIN.d / 2 + 0.3);
      puff.scale.setScalar(0.6 + k * 1.8);
      puff.material.opacity = 0.45 * (1 - k);
    });
  });

  // Picnic table and its benches.
  const picnicY = meadowHeight(PICNIC.x, PICNIC.z);
  const tableWood = mat("#9a7048", 0.8);
  const top = box(2.4, 0.07, 0.8, tableWood);
  top.position.set(PICNIC.x, picnicY + 0.74, PICNIC.z);
  root.add(top);
  for (const dx of [-1, 1]) {
    const legs = box(0.08, 0.74, 1.6, tableWood);
    legs.position.set(PICNIC.x + dx, picnicY + 0.37, PICNIC.z);
    root.add(legs);
  }
  for (const dz of [-0.75, 0.75]) {
    const bench = box(2.4, 0.06, 0.3, tableWood);
    bench.position.set(PICNIC.x, picnicY + 0.44, PICNIC.z + dz);
    root.add(bench);
  }
  for (const seat of MEADOW.seats.filter((s) => s.id.startsWith("picnic"))) {
    const hit = box(0.75, 0.08, 0.32, new THREE.MeshBasicMaterial({ visible: false }), false);
    hit.position.set(seat.x, (seat.y ?? 0) + 0.48, seat.z);
    tagSeat(hit, seat.id);
    root.add(hit);
  }
  // A checked cloth and a basket on the table.
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), new THREE.MeshStandardMaterial({
    map: canvasTexture(64, 64, (ctx) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { ctx.fillStyle = (x + y) % 2 ? "#d63a3a" : "#f6efe4"; ctx.fillRect(x * 8, y * 8, 8, 8); } }),
    roughness: 0.9,
  }));
  cloth.rotation.x = -Math.PI / 2;
  cloth.position.set(PICNIC.x, picnicY + 0.78, PICNIC.z);
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.22, 12), mat("#b8894e", 0.9));
  basket.position.set(PICNIC.x + 0.3, picnicY + 0.89, PICNIC.z);
  root.add(cloth, basket);

  // The lookout: a bench on the hill and a lamp post.
  const lookY = meadowHeight(LOOKOUT.x, LOOKOUT.z + 0.6);
  const lookoutBench = new THREE.Group();
  const lookSeat = box(1.9, 0.08, 0.45, tableWood);
  lookSeat.position.y = 0.42;
  const lookBack = box(1.9, 0.45, 0.06, tableWood);
  lookBack.position.set(0, 0.72, -0.22);
  lookoutBench.add(lookSeat, lookBack);
  for (const lx of [-0.8, 0.8]) {
    const leg = box(0.08, 0.42, 0.4, mat("#3b3b3b", 0.6, { metalness: 0.5 }));
    leg.position.set(lx, 0.21, 0);
    lookoutBench.add(leg);
  }
  lookoutBench.position.set(LOOKOUT.x, lookY, LOOKOUT.z + 0.6);
  lookoutBench.rotation.y = -MEADOW.seats.find((s) => s.id === "lookout-1")!.facing + Math.PI;
  for (const seat of MEADOW.seats.filter((s) => s.id.startsWith("lookout"))) tagSeat(lookoutBench, seat.id);
  // Each half of the bench is its own seat.
  lookoutBench.children.forEach((part) => { part.userData.seat = part.position.x < 0 ? "lookout-1" : "lookout-2"; });
  root.add(lookoutBench);
  const lamp = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3, 8), mat("#2c2c2c", 0.5, { metalness: 0.6 }));
  pole.position.y = 1.5;
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), new THREE.MeshBasicMaterial({ color: night ? "#ffe2a0" : "#f2efe6", toneMapped: false }));
  lantern.position.y = 3.05;
  lamp.add(pole, lantern);
  lamp.position.set(LOOKOUT.x + 1.6, meadowHeight(LOOKOUT.x + 1.6, LOOKOUT.z), LOOKOUT.z);
  root.add(lamp);
  if (night) {
    const lampLight = new THREE.PointLight("#ffd58a", 8, 9, 1.8);
    lampLight.position.set(lamp.position.x, lamp.position.y + 2.9, lamp.position.z);
    const lampGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: "#ffd58a", transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    lampGlow.scale.setScalar(1.6);
    lampGlow.position.copy(lampLight.position);
    root.add(lampLight, lampGlow);
  }

  // The open-air screen by the fire, on two posts.
  const screenMaterial = new THREE.MeshBasicMaterial({ color: "#0f0c16", toneMapped: false, side: THREE.DoubleSide });
  const SW = 4.2;
  const SH = SW * 9 / 16;
  const screenY = meadowHeight(MEADOW.tv.x, MEADOW.tv.z);
  const screenBack = box(SW + 0.2, SH + 0.2, 0.08, mat("#2a2a2a", 0.7));
  screenBack.position.set(MEADOW.tv.x, screenY + MEADOW.tv.height, MEADOW.tv.z - 0.05);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), screenMaterial);
  screen.position.set(MEADOW.tv.x, screenY + MEADOW.tv.height, MEADOW.tv.z);
  root.add(screenBack, screen);
  for (const dx of [-SW / 2 - 0.05, SW / 2 + 0.05]) {
    const post = box(0.14, MEADOW.tv.height + SH / 2 + 0.6, 0.14, mat("#5a4028", 0.9));
    post.position.set(MEADOW.tv.x + dx, screenY + (MEADOW.tv.height + SH / 2 + 0.6) / 2 - 0.5, MEADOW.tv.z - 0.1);
    root.add(post);
  }

  // Trees: two kinds (pines and round broadleaves), all instanced.
  const pines = MEADOW_TREES.filter((tree) => tree.kind === 0);
  const broad = MEADOW_TREES.filter((tree) => tree.kind === 1);
  const trunkGeometry = new THREE.CylinderGeometry(0.14, 0.22, 1.6, 7);
  trunkGeometry.translate(0, 0.8, 0);
  const trunks = new THREE.InstancedMesh(trunkGeometry, mat("#5b3d26", 0.95), MEADOW_TREES.length);
  const pineGeometry = new THREE.ConeGeometry(1.2, 3.2, 8);
  pineGeometry.translate(0, 2.9, 0);
  const pineTops = new THREE.InstancedMesh(pineGeometry, mat(night ? "#1f3a26" : "#2f6b3a", 0.9), pines.length * 2);
  const broadGeometry = new THREE.IcosahedronGeometry(1.4, 1);
  broadGeometry.translate(0, 2.8, 0);
  const broadTops = new THREE.InstancedMesh(broadGeometry, mat(night ? "#2a4a26" : "#4f8f3a", 0.9, { flatShading: true }), broad.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const at = new THREE.Vector3();
  MEADOW_TREES.forEach((tree, i) => {
    at.set(tree.x, meadowHeight(tree.x, tree.z) - 0.05, tree.z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (tree.x * 13.1 + tree.z) % 6.28);
    scale.setScalar(tree.scale);
    trunks.setMatrixAt(i, m.compose(at, q, scale));
  });
  pines.forEach((tree, i) => {
    at.set(tree.x, meadowHeight(tree.x, tree.z) - 0.05, tree.z);
    scale.setScalar(tree.scale);
    pineTops.setMatrixAt(i * 2, m.compose(at, q, scale));
    at.y += 1.3 * tree.scale;
    scale.setScalar(tree.scale * 0.72);
    pineTops.setMatrixAt(i * 2 + 1, m.compose(at, q, scale));
  });
  broad.forEach((tree, i) => {
    at.set(tree.x, meadowHeight(tree.x, tree.z) - 0.05, tree.z);
    scale.set(tree.scale, tree.scale * 0.9, tree.scale);
    broadTops.setMatrixAt(i, m.compose(at, q, scale));
  });
  for (const mesh of [trunks, pineTops, broadTops]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }

  // Rocks and grass tufts and flowers, scattered.
  const rockMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.4, 0), mat("#8a877e", 0.95, { flatShading: true }), 28);
  for (let i = 0; i < 28; i++) {
    const x = (rand() * 2 - 1) * MEADOW_HALF;
    const z = (rand() * 2 - 1) * MEADOW_HALF;
    if (Math.hypot(x - CAMPFIRE.x, z - CAMPFIRE.z) < 4 || Math.hypot(x - POND.x, z - POND.z) < POND.radius || Math.hypot(x - CABIN.x, z - CABIN.z) < 6) { rockMesh.setMatrixAt(i, m.makeScale(0, 0, 0)); continue; }
    const s = 0.4 + rand() * 1.1;
    at.set(x, meadowHeight(x, z) + 0.05, z);
    q.setFromEuler(new THREE.Euler(rand() * 3, rand() * 3, rand() * 3));
    rockMesh.setMatrixAt(i, m.compose(at, q, scale.set(s, s * 0.6, s)));
  }
  rockMesh.castShadow = true;
  rockMesh.receiveShadow = true;
  root.add(rockMesh);
  const tuftGeometry = new THREE.ConeGeometry(0.08, 0.35, 4);
  tuftGeometry.translate(0, 0.17, 0);
  const TUFTS = 700;
  const tufts = new THREE.InstancedMesh(tuftGeometry, new THREE.MeshStandardMaterial({ roughness: 1 }), TUFTS);
  const flowerColours = ["#f7f1e3", "#ffd43b", "#ff8787", "#b197fc"];
  for (let i = 0; i < TUFTS; i++) {
    const x = (rand() * 2 - 1) * (MEADOW_HALF + 4);
    const z = (rand() * 2 - 1) * (MEADOW_HALF + 4);
    const h = meadowHeight(x, z);
    // Not in the water, and not through the cabin's floor or porch.
    const tooWet = Math.hypot(x - POND.x, z - POND.z) < POND.radius + 1.6
      || (Math.abs(x - CABIN.x) < CABIN.w / 2 + 0.5 && Math.abs(z - CABIN.z) < CABIN.d / 2 + 1.8);
    const flower = rand() < 0.18;
    const s = tooWet || Math.hypot(x - CAMPFIRE.x, z - CAMPFIRE.z) < 3 ? 0 : flower ? 0.6 : 0.7 + rand() * 0.8;
    at.set(x, h, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6);
    tufts.setMatrixAt(i, m.compose(at, q, scale.set(s, s * (flower ? 0.8 : 1), s)));
    tufts.setColorAt(i, colour.set(flower ? flowerColours[i % flowerColours.length] : night ? "#2f5530" : "#6fae4f").offsetHSL(0, 0, (rand() - 0.5) * 0.08));
  }
  root.add(tufts);

  // Clouds by day, stars and fireflies at night.
  if (!night) {
    const clouds: THREE.Sprite[] = [];
    for (let i = 0; i < 9; i++) {
      const cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture, color: "#ffffff", transparent: true, opacity: 0.75, depthWrite: false, fog: false }));
      cloud.scale.set(18 + rand() * 14, 6 + rand() * 4, 1);
      cloud.position.set((rand() * 2 - 1) * 70, 30 + rand() * 14, (rand() * 2 - 1) * 70);
      clouds.push(cloud);
      root.add(cloud);
    }
    animated.push((t) => { clouds.forEach((cloud, i) => { cloud.position.x = ((cloud.position.x + 70 + 0.004 * (1 + i % 3)) % 140) - 70; }); void t; });
  } else {
    const starPositions = new Float32Array(500 * 3);
    for (let i = 0; i < 500; i++) {
      const a = rand() * Math.PI * 2;
      const e = 0.15 + rand() * 1.3;
      starPositions.set([Math.cos(a) * Math.cos(e) * 100, Math.sin(e) * 100, Math.sin(a) * Math.cos(e) * 100], i * 3);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    root.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: "#ffffff", size: 0.5, fog: false, transparent: true, opacity: 0.85 })));
    const moon = new THREE.Mesh(new THREE.SphereGeometry(4, 20, 16), new THREE.MeshBasicMaterial({ color: "#f3f0e0", fog: false }));
    moon.position.set(-50, 60, -60);
    root.add(moon);
    const flies: THREE.Sprite[] = [];
    for (let i = 0; i < 40; i++) {
      const fly = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: "#d8ff7a", transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      fly.scale.setScalar(0.18);
      fly.userData.home = new THREE.Vector3((rand() * 2 - 1) * 16, 0, (rand() * 2 - 1) * 16);
      fly.userData.phase = rand() * 10;
      flies.push(fly);
      root.add(fly);
    }
    animated.push((t) => {
      for (const fly of flies) {
        const home = fly.userData.home as THREE.Vector3;
        const p = fly.userData.phase as number;
        const x = home.x + Math.sin(t * 0.3 + p) * 1.5;
        const z = home.z + Math.cos(t * 0.23 + p * 2) * 1.5;
        fly.position.set(x, meadowHeight(x, z) + 0.6 + Math.sin(t * 0.7 + p) * 0.4, z);
        fly.material.opacity = 0.3 + Math.max(0, Math.sin(t * 2 + p * 3)) * 0.7;
      }
    });
  }

  // Light: the sun (or moon) with shadows over the middle of the world, and the sky's fill.
  const sun = new THREE.DirectionalLight(night ? "#a9bcff" : "#fff1d6", night ? 1.1 : 2.2);
  sun.position.set(18, 30, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  for (const key of ["left", "bottom"] as const) sun.shadow.camera[key] = -28;
  for (const key of ["right", "top"] as const) sun.shadow.camera[key] = 28;
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  root.add(sun, sun.target);
  root.add(new THREE.HemisphereLight(night ? "#4a5f9a" : "#bfe1ff", night ? "#16220f" : "#4a5a2a", night ? 1.1 : 0.9));

  // Water shimmers a little.
  animated.push((t) => { waterMaterial.opacity = 0.84 + Math.sin(t * 0.8) * 0.03; water.position.y = WATER_Y + Math.sin(t * 0.6) * 0.008; });

  for (const object of [trunkGeometry, pineGeometry, broadGeometry, tuftGeometry]) disposables.push(object);

  return {
    root,
    ceiling,
    screenMaterial,
    background: new THREE.Color(night ? "#0a1124" : "#a9d2f0"),
    fog: new THREE.Fog(night ? "#0d1428" : "#c9e2f2", 26, 70),
    exposure: night ? 1.3 : 1.0,
    shark,
    update: (t) => { for (const step of animated) step(t); },
    // Walking into the house takes its roof off from above (from your own eyes it is the ceiling).
    viewer: (x, z, view) => { roof.visible = !(inCabin(x, z) && view !== "eyes"); },
    dispose: () => { for (const item of disposables) item.dispose(); },
  };
}

/**
 * The cabin: log walls with a door gap in the south wall, a plank floor, a
 * stone fireplace on the north wall, a couch facing it (Blåhaj included), an
 * armchair, a rug, shelves and a lamp, and a porch with two benches outside.
 */
function buildCabin(look: Look, night: boolean, glow: THREE.Texture, animated: Array<(t: number) => void>) {
  const group = new THREE.Group();
  group.position.set(CABIN.x, 0, CABIN.z);
  const W = CABIN.w;
  const D = CABIN.d;
  const H = 2.6;
  const F = CABIN_FLOOR_Y;
  const logs = mat("#7a5233", 0.9);
  const darkLogs = mat("#6a4529", 0.9);
  const logGeometry = (length: number) => new THREE.CylinderGeometry(0.15, 0.15, length, 9);
  const addLog = (length: number, x: number, y: number, z: number, alongX: boolean, i: number) => {
    const log = new THREE.Mesh(logGeometry(length), i % 2 ? darkLogs : logs);
    log.rotation.set(alongX ? 0 : Math.PI / 2, 0, alongX ? Math.PI / 2 : 0);
    log.position.set(x, y, z);
    log.castShadow = true;
    log.receiveShadow = true;
    group.add(log);
  };
  // Footing under the floor, then the walls, log by log.
  const footing = box(W + 0.3, F, D + 0.3, mat("#6e6a62", 0.95));
  footing.position.y = F / 2 - 0.02;
  group.add(footing);
  const doorTop = 2.1;
  let i = 0;
  for (let y = F + 0.15; y < F + H; y += 0.29, i++) {
    addLog(W + 0.3, 0, y, -D / 2, true, i);
    addLog(D + 0.3, -W / 2, y, 0, false, i + 1);
    addLog(D + 0.3, W / 2, y, 0, false, i + 1);
    if (y - F > doorTop) addLog(W + 0.3, 0, y, D / 2, true, i);
    else {
      const side = W / 2 - CABIN_DOOR_HALF;
      addLog(side + 0.15, -W / 2 + side / 2 - 0.07, y, D / 2, true, i);
      addLog(side + 0.15, W / 2 - side / 2 + 0.07, y, D / 2, true, i);
    }
  }
  // The floor, walkable.
  const planks = floorTexture(look);
  planks.wrapS = planks.wrapT = THREE.RepeatWrapping;
  planks.repeat.set(2, 1.5);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.2, D - 0.2), mat("#ffffff", 0.75, { map: planks }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = F + 0.005;
  floor.receiveShadow = true;
  floor.userData.floor = true;
  group.add(floor);
  // The door stands open, swung in against the wall.
  const door = box(1.2, doorTop - 0.05, 0.07, mat("#4a2e1a", 0.7));
  door.geometry.translate(0.6, 0, 0);
  door.position.set(-CABIN_DOOR_HALF, F + doorTop / 2, D / 2 - 0.05);
  door.rotation.y = -1.45;
  group.add(door);
  const lintel = box(CABIN_DOOR_HALF * 2 + 0.3, 0.16, 0.36, mat("#5a3a22", 0.8));
  lintel.position.set(0, F + doorTop + 0.05, D / 2);
  group.add(lintel);
  // Windows that glow at night.
  const windowMaterial = new THREE.MeshBasicMaterial({ color: night ? "#ffcf7a" : "#bcd8ea", toneMapped: false, side: THREE.DoubleSide });
  const frameMaterial = mat("#3b2716", 0.8);
  for (const [x, z, ry] of [[-2, D / 2 + 0.16, 0], [2, D / 2 + 0.16, 0], [-W / 2 - 0.16, -0.6, Math.PI / 2], [W / 2 + 0.16, -0.6, Math.PI / 2]] as const) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.75), windowMaterial);
    pane.position.set(x, F + 1.45, z);
    pane.rotation.y = ry;
    const frame = box(1.05, 0.9, 0.06, frameMaterial, false);
    frame.position.copy(pane.position);
    frame.rotation.y = ry;
    frame.position.addScaledVector(new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry)), -0.02);
    group.add(frame, pane);
  }

  // The roof: two pitched slopes, gable ends and the chimney. Lifted off from above when you are inside.
  const roof = new THREE.Group();
  const roofMaterial = mat("#5a2f24", 0.8, { side: THREE.DoubleSide });
  const pitch = 1.5;
  const half = D / 2 + 0.5;
  const slope = Math.hypot(half, pitch);
  for (const side of [-1, 1]) {
    const plane = new THREE.Mesh(new THREE.BoxGeometry(W + 0.9, 0.08, slope + 0.1), roofMaterial);
    plane.position.set(0, F + H + pitch / 2, side * half / 2);
    plane.rotation.x = side * Math.atan2(pitch, half);
    plane.castShadow = true;
    plane.receiveShadow = true;
    roof.add(plane);
  }
  const gable = new THREE.Shape();
  gable.moveTo(-D / 2, 0);
  gable.lineTo(0, pitch * (D / 2) / half);
  gable.lineTo(D / 2, 0);
  gable.lineTo(-D / 2, 0);
  for (const side of [-1, 1]) {
    const end = new THREE.Mesh(new THREE.ShapeGeometry(gable), mat("#6a4529", 0.9, { side: THREE.DoubleSide }));
    end.rotation.y = Math.PI / 2;
    end.position.set(side * W / 2, F + H - 0.05, 0);
    roof.add(end);
  }
  const chimney = box(0.9, 2.2, 0.7, mat("#7c7a74", 0.95));
  chimney.position.set(0, F + H + 0.9, -D / 2 + 0.3);
  roof.add(chimney);
  group.add(roof);

  // Inside: the fireplace on the north wall.
  const stone = mat("#8a867c", 0.95);
  const hearth = box(2.2, 1.4, 0.6, stone);
  hearth.position.set(0, F + 0.7, -D / 2 + 0.3);
  const opening = box(1.1, 0.75, 0.2, mat("#1a1210", 1), false);
  opening.position.set(0, F + 0.45, -D / 2 + 0.52);
  const mantel = box(2.4, 0.1, 0.4, mat(look.wood, 0.6));
  mantel.position.set(0, F + 1.45, -D / 2 + 0.4);
  group.add(hearth, opening, mantel);
  const flames: THREE.Mesh[] = [];
  for (const [colour, r, h, y] of [[look.fire[1], 0.22, 0.55, 0.32], [look.fire[0], 0.13, 0.4, 0.27]] as const) {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(r, h, 10, 1, true), new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false }));
    flame.position.set(0, F + y, -D / 2 + 0.55);
    flames.push(flame);
    group.add(flame);
  }
  const fireGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: look.fireLight, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
  fireGlow.scale.setScalar(1.6);
  fireGlow.position.set(0, F + 0.45, -D / 2 + 0.7);
  group.add(fireGlow);
  const fireLight = new THREE.PointLight(look.fireLight, 9, 7, 1.6);
  fireLight.position.set(0, F + 0.8, -D / 2 + 1.1);
  const roomLight = new THREE.PointLight(look.lamp, night ? 8 : 5, 8, 1.6);
  roomLight.position.set(0.5, F + 2.2, 0.5);
  group.add(fireLight, roomLight);
  animated.push((t) => {
    flames.forEach((flame, i) => { flame.scale.y = 0.85 + Math.sin(t * 9 + i * 2) * 0.15; flame.rotation.y = t * (1 + i); });
    fireLight.intensity = 9 * (0.88 + Math.sin(t * 8) * 0.07 + Math.sin(t * 19) * 0.05);
  });
  // Candles on the mantel.
  for (const x of [-0.9, 0.9]) {
    const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 10), mat("#f5ecd8", 0.6));
    wax.position.set(x, F + 1.59, -D / 2 + 0.4);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), new THREE.MeshBasicMaterial({ color: "#ffcf70" }));
    flame.position.set(x, F + 1.71, -D / 2 + 0.4);
    group.add(wax, flame);
  }

  // A rug, the couch facing the fire, and the armchair.
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1.3, 40), mat(look.rug[0], 1));
  rug.rotation.x = -Math.PI / 2;
  rug.scale.set(1.3, 0.8, 1);
  rug.position.set(0, F + 0.01, -0.5);
  rug.receiveShadow = true;
  rug.userData.floor = true;
  group.add(rug);
  const fabric = mat(look.sofa, 0.9);
  const cushionFabric = mat(look.sofaCushion, 0.9);
  const couch = new THREE.Group();
  const base = cushion(2.7, 0.32, 0.9, fabric, 0.08);
  base.position.set(0, 0.24, 0.05);
  const back = cushion(2.7, 0.62, 0.24, fabric, 0.1);
  back.position.set(0, 0.62, 0.42);
  back.rotation.x = -0.12;
  couch.add(base, back);
  for (const side of [-1, 1]) {
    const arm = cushion(0.24, 0.5, 0.9, fabric, 0.1);
    arm.position.set(side * 1.23, 0.45, 0.05);
    couch.add(arm);
  }
  couch.position.set(0, F, 1.2);
  group.add(couch);
  for (const seat of MEADOW.seats.filter((s) => s.id.startsWith("home-couch"))) {
    const pad = cushion(0.76, 0.14, 0.7, cushionFabric, 0.06);
    pad.position.set(seat.x - CABIN.x, F + 0.46, seat.z - CABIN.z + 0.4);
    tagSeat(pad, seat.id);
    group.add(pad);
  }
  const armSeat = MEADOW.seatIndex.get("home-arm")!;
  const chair = new THREE.Group();
  const chairBase = cushion(0.85, 0.32, 0.85, fabric, 0.08);
  chairBase.position.y = 0.24;
  const chairBack = cushion(0.85, 0.6, 0.22, fabric, 0.1);
  chairBack.position.set(0, 0.62, 0.36);
  const chairPad = cushion(0.66, 0.14, 0.62, cushionFabric, 0.06);
  chairPad.position.set(0, 0.46, 0);
  chair.add(chairBase, chairBack, chairPad);
  chair.position.set(armSeat.x - CABIN.x - 0.15, F, armSeat.z - CABIN.z);
  chair.rotation.y = -armSeat.facing;
  tagSeat(chair, armSeat.id);
  group.add(chair);
  for (const seat of MEADOW.seats.filter((s) => s.id.startsWith("home-fire"))) {
    const pouf = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.14, 18), mat(look.pillows[1] ?? "#c86b4c", 1));
    pouf.position.set(seat.x - CABIN.x, F + 0.07, seat.z - CABIN.z);
    tagSeat(pouf, seat.id);
    group.add(pouf);
  }

  // Shelves on the west wall, a side table with a lamp in the east corner, a plant.
  const shelf = new THREE.Group();
  const shelfWood = mat(look.woodDark, 0.6);
  const frame = box(0.35, 2, 1.4, shelfWood);
  frame.position.y = 1;
  shelf.add(frame);
  const bookColours = [...look.pillows, look.rug[0], look.rug[1], "#d9cba0", "#2a3a2e"];
  for (let row = 0; row < 4; row++) {
    let z = -0.6;
    let k = row * 3;
    while (z < 0.6) {
      const width = 0.05 + ((k * 37) % 5) * 0.012;
      const book = box(0.24, 0.3 - ((k * 13) % 4) * 0.03, width, mat(bookColours[k % bookColours.length], 0.8), false);
      book.position.set(0.1, 0.32 + row * 0.46 + book.geometry.parameters.height / 2, z + width / 2);
      shelf.add(book);
      z += width + 0.012;
      k++;
    }
  }
  shelf.position.set(-W / 2 + 0.35, F, -D / 2 + 1.35);
  group.add(shelf);
  const table = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 20), mat(look.wood, 0.5));
  table.position.set(W / 2 - 0.65, F + 0.62, -D / 2 + 0.75);
  const tableLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.6, 10), shelfWood);
  tableLeg.position.set(W / 2 - 0.65, F + 0.3, -D / 2 + 0.75);
  const lampShade = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.25, 18, 1, true), new THREE.MeshStandardMaterial({ color: look.lamp, emissive: look.lamp, emissiveIntensity: 0.7, side: THREE.DoubleSide }));
  lampShade.position.set(W / 2 - 0.65, F + 1.05, -D / 2 + 0.75);
  const lampStem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 6), mat("#2a2a2a", 0.5));
  lampStem.position.set(W / 2 - 0.65, F + 0.82, -D / 2 + 0.75);
  group.add(table, tableLeg, lampShade, lampStem);
  const lampGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: look.lamp, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
  lampGlow.scale.setScalar(0.9);
  lampGlow.position.set(W / 2 - 0.65, F + 1.0, -D / 2 + 0.75);
  group.add(lampGlow);
  const pot = plant(look, 1.2);
  pot.position.set(W / 2 - 0.5, F, D / 2 - 0.55);
  group.add(pot);

  // Blåhaj on the couch, as at the living room: click it to hear it squeak.
  const shark = new THREE.Group();
  const sharkSkin = mat(look.shark, 1);
  const sharkBody = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), sharkSkin);
  sharkBody.scale.set(2.2, 0.9, 0.9);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), mat("#f3f1ec", 1));
  belly.scale.set(2.0, 0.6, 0.8);
  belly.position.y = -0.05;
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 8), sharkSkin);
  fin.position.set(0, 0.17, 0);
  const tailFin = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 8), sharkSkin);
  tailFin.rotation.z = Math.PI / 2;
  tailFin.position.set(0.38, 0.02, 0);
  shark.add(sharkBody, belly, fin, tailFin);
  shark.position.set(1.05, 0.68, 0.85 + 0.4);
  shark.rotation.y = 0.4;
  shark.traverse((part) => { part.userData.blahaj = true; part.castShadow = true; });
  // The room bobs the shark's own height (0.68 above its floor), so it sits on a holder at floor level.
  const sharkHolder = new THREE.Group();
  sharkHolder.position.y = F;
  sharkHolder.add(shark);
  group.add(sharkHolder);

  // The porch outside: a deck and two benches either side of the door.
  const deck = box(W + 0.4, 0.1, 1.4, mat("#8a6440", 0.85));
  deck.position.set(0, F - 0.05, D / 2 + 0.85);
  deck.userData.floor = true;
  group.add(deck);
  for (const seat of MEADOW.seats.filter((s) => s.id.startsWith("porch"))) {
    const bench = new THREE.Group();
    const top = box(1.2, 0.07, 0.42, mat("#8a6440", 0.8));
    top.position.y = 0.42;
    const backRest = box(1.2, 0.4, 0.06, mat("#8a6440", 0.8));
    backRest.position.set(0, 0.7, -0.2);
    bench.add(top, backRest);
    bench.position.set(seat.x - CABIN.x, F - 0.02, seat.z - CABIN.z);
    tagSeat(bench, seat.id);
    group.add(bench);
  }
  return { group, roof, shark };
}

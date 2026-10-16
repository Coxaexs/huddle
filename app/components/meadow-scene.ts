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
import { LOOKS, box, canvasTexture, cushion, floorMaterial, flameTexture, glowTexture, isNight, mat, plant, seeded, tagSeat, type BuiltRoom, type Look } from "./living-room-scene";
import { dress } from "./room-surfaces";
import { ThingKit } from "./room-things";
import { playIgnite, playDouse, playPops, playSizzle, playSkips } from "./living-room-sounds";

const GROUND_EXTENT = MEADOW_HALF + 20;

const smoothstep = (edge0: number, edge1: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** How far a point is from the nearest path: south to the fire, the fire to the cabin, the jetty, the hill and the picnic table. */
function pathDistance(x: number, z: number) {
  const onPath = (ax: number, az: number, bx: number, bz: number) => {
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
  };
  return Math.min(
    onPath(0, MEADOW_HALF, CAMPFIRE.x, CAMPFIRE.z + 2.6),
    onPath(CAMPFIRE.x - 2.4, CAMPFIRE.z - 1, CABIN.x + 1, CABIN.z + CABIN.d / 2 + 1),
    onPath(CAMPFIRE.x - 2.4, CAMPFIRE.z + 1, JETTY.x1 + 0.2, JETTY.z),
    onPath(CAMPFIRE.x + 2.4, CAMPFIRE.z - 1, LOOKOUT.x - 1, LOOKOUT.z + 1.5),
    onPath(CAMPFIRE.x + 2.4, CAMPFIRE.z + 1, PICNIC.x - 1.5, PICNIC.z),
  );
}

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
  // A sandy shore round the pond, darker and wet at the water's edge, the bed under the water.
  if (pond < POND.radius + 2.4) {
    out.lerp(new THREE.Color(night ? "#6b6248" : "#d9c38a"), smoothstep(POND.radius + 2.4, POND.radius + 0.6, pond) * 0.9);
    if (h < WATER_Y + 0.12) out.lerp(new THREE.Color(night ? "#3b3526" : "#8f7a52"), smoothstep(WATER_Y + 0.12, WATER_Y - 0.3, h) * 0.8);
  }
  const path = pathDistance(x, z);
  if (path < 0.9) out.lerp(new THREE.Color(night ? "#4d3f2c" : "#a7865a"), (1 - path / 0.9) * 0.85);
  const fire = Math.hypot(x - CAMPFIRE.x, z - CAMPFIRE.z);
  if (fire < 1.5) out.lerp(new THREE.Color("#3a2c22"), 1 - fire / 1.5);
}

/**
 * A fire: flame sprites in layers that lick and flicker, embers drifting up,
 * and (outdoors) a column of smoke. `size` is about the flames' height in metres.
 */
function buildFire(look: Look, flame: THREE.Texture, glow: THREE.Texture, puff: THREE.Texture, size: number, smoke: boolean, night: boolean) {
  const group = new THREE.Group();
  const tongues: Array<{ sprite: THREE.Sprite; w: number; h: number; phase: number; x: number; z: number; base: number }> = [];
  const layers: Array<[string, number, number, number]> = [
    [look.fire[1], 0.7, 1.1, 0.8], [look.fire[1], 0.46, 0.85, 0.7], [look.fire[1], 0.42, 0.78, 0.7],
    [look.fire[0], 0.48, 0.72, 0.85], [look.fire[0], 0.32, 0.55, 0.8], ["#fff6d8", 0.22, 0.36, 0.9],
  ];
  layers.forEach(([colour, w, h, opacity], i) => {
    // The outer tongues are solid colour shaped by the flame (they show against a bright day); the inner ones add light.
    const solid = i < 3;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial(solid
      ? { alphaMap: flame, color: colour, transparent: true, opacity, depthWrite: false }
      : { map: flame, color: colour, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    sprite.center.set(0.5, 0.04);
    const a = i * 2.1;
    const off = i === 0 || i >= 3 ? 0 : 0.12 * size;
    tongues.push({ sprite, w: w * size, h: h * size, phase: i * 1.7, x: Math.cos(a) * off, z: Math.sin(a) * off, base: opacity });
    group.add(sprite);
  });
  // Coals glowing under the flames.
  const coals = new THREE.Mesh(new THREE.CircleGeometry(0.32 * size, 18), new THREE.MeshBasicMaterial({ color: look.fire[1], toneMapped: false }));
  coals.rotation.x = -Math.PI / 2;
  coals.position.y = 0.02;
  group.add(coals);
  const embers: Array<{ sprite: THREE.Sprite; phase: number; speed: number; drift: number }> = [];
  for (let i = 0; i < (smoke ? 14 : 6); i++) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: look.fire[0], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sprite.scale.setScalar(0.06 * Math.max(1, size));
    embers.push({ sprite, phase: i / (smoke ? 14 : 6), speed: 0.25 + (i % 5) * 0.06, drift: (i % 2 ? 1 : -1) * (0.2 + (i % 3) * 0.1) });
    group.add(sprite);
  }
  const puffs: THREE.Sprite[] = [];
  if (smoke) for (let i = 0; i < 7; i++) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, color: night ? "#5d6272" : "#cfd3d6", transparent: true, opacity: 0, depthWrite: false }));
    puffs.push(sprite);
    group.add(sprite);
  }
  const update = (t: number) => {
    for (const tongue of tongues) {
      const lick = 0.82 + Math.sin(t * 9 + tongue.phase) * 0.12 + Math.sin(t * 17.3 + tongue.phase * 2) * 0.08;
      tongue.sprite.scale.set(tongue.w * (0.92 + Math.sin(t * 6.1 + tongue.phase) * 0.08), tongue.h * lick, 1);
      tongue.sprite.position.set(tongue.x + Math.sin(t * 4.3 + tongue.phase) * 0.03 * size, 0, tongue.z);
      tongue.sprite.material.opacity = tongue.base * (0.85 + Math.sin(t * 13 + tongue.phase) * 0.15);
    }
    for (const ember of embers) {
      const k = (t * ember.speed + ember.phase) % 1;
      ember.sprite.position.set(Math.sin(k * 6 + ember.phase * 9) * 0.25 * size + ember.drift * k, 0.3 * size + k * 2.2 * size, Math.cos(k * 5 + ember.phase * 7) * 0.2 * size);
      ember.sprite.material.opacity = (1 - k) * (0.6 + Math.sin(t * 20 + ember.phase * 30) * 0.4);
    }
    puffs.forEach((p, i) => {
      const k = (t * 0.09 + i / puffs.length) % 1;
      p.position.set(Math.sin(t * 0.3 + i) * 0.2 + k * 0.9, 1.1 * size + k * 4.5, Math.cos(t * 0.25 + i) * 0.15);
      p.scale.setScalar(0.5 + k * 2.4);
      p.material.opacity = 0.32 * Math.sin(Math.PI * Math.min(1, k * 1.4));
    });
  };
  return { group, update };
}

/** A grass tuft: five bent blades round a point, dark at the root and light at the tips. */
function tuftGeometry() {
  const positions: number[] = [];
  const shades: number[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + i * 0.4;
    const lean = 0.08 + (i % 3) * 0.05;
    const h = 0.26 + (i % 2) * 0.12;
    const w = 0.035;
    const cx = Math.cos(a), cz = Math.sin(a);
    const px = -cz * w, pz = cx * w;
    positions.push(cx * 0.03 + px, 0, cz * 0.03 + pz, cx * 0.03 - px, 0, cz * 0.03 - pz, cx * (0.03 + lean), h, cz * (0.03 + lean));
    shades.push(0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 1.1, 1.1, 1.1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(shades, 3));
  geometry.computeVertexNormals();
  return geometry;
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
  const flame = flameTexture();
  const disposables: Array<{ dispose: () => void }> = [glow, puffTexture, flame];
  // Scratch objects for placing instances.
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const at = new THREE.Vector3();

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
  // The grass under the vertex colours: real blades and soil in close-up, every 2 m (the colours do the large scale).
  const groundMesh = new THREE.Mesh(ground, dress(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), "grass", { repeat: [GROUND_EXTENT, GROUND_EXTENT], bump: 0.5, rough: false }));
  groundMesh.receiveShadow = true;
  groundMesh.userData.floor = true;
  root.add(groundMesh);

  // The pond: deep in the middle, clear over the sand at the edge, so the shore has no hard line.
  const WATER_R = POND.radius + 1.4;
  const waterMap = canvasTexture(256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    const [deep, mid, shallow] = night ? ["rgba(14,34,62,0.94)", "rgba(28,62,96,0.85)", "rgba(60,96,120,0)"] : ["rgba(24,78,122,0.95)", "rgba(52,128,168,0.86)", "rgba(120,190,200,0)"];
    g.addColorStop(0, deep);
    g.addColorStop(0.55, deep);
    g.addColorStop(0.78, mid);
    g.addColorStop(0.9, shallow.replace(/[\d.]+\)$/, "0.35)"));
    g.addColorStop(1, shallow);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  });
  const waterMaterial = new THREE.MeshStandardMaterial({ map: waterMap, roughness: 0.08, metalness: 0.25, transparent: true, depthWrite: false });
  const water = new THREE.Mesh(new THREE.CircleGeometry(WATER_R, 64), waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.set(POND.x, WATER_Y, POND.z);
  water.userData.floor = true;
  root.add(water);
  // Lily pads, a few in flower.
  const padMaterial = mat("#3f7d3a", 0.7);
  for (let i = 0; i < 11; i++) {
    const a = rand() * Math.PI * 2;
    const r = 1 + rand() * (POND.radius - 1.5);
    const size = 0.25 + rand() * 0.15;
    const pad = new THREE.Mesh(new THREE.CircleGeometry(size, 12, 0.3, Math.PI * 1.85), padMaterial);
    pad.rotation.x = -Math.PI / 2;
    pad.rotation.z = rand() * 6;
    pad.position.set(POND.x + Math.cos(a) * r, WATER_Y + 0.01, POND.z + Math.sin(a) * r);
    root.add(pad);
    if (i % 3 === 0) {
      const bloom = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.08, 7, 1, true), mat(i % 2 ? "#f7d6e6" : "#fbf7ef", 0.6, { side: THREE.DoubleSide }));
      bloom.rotation.x = Math.PI;
      bloom.position.set(pad.position.x + 0.05, WATER_Y + 0.05, pad.position.z);
      const heart = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), mat("#ffd43b", 0.6));
      heart.position.set(bloom.position.x, WATER_Y + 0.05, bloom.position.z);
      root.add(bloom, heart);
    }
  }
  // Rings where a fish rises, now and then.
  const ripples = [0, 1, 2].map((i) => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40), new THREE.MeshBasicMaterial({ color: night ? "#9fb4d8" : "#e6f4fa", transparent: true, opacity: 0, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.userData.phase = i / 3;
    root.add(ring);
    return ring;
  });
  animated.push((t) => {
    ripples.forEach((ring, i) => {
      const cycle = t / 4.5 + (ring.userData.phase as number);
      const k = cycle % 1;
      const n = Math.floor(cycle) * 3 + i;
      // Somewhere new each time, well inside the pond.
      const a = (n * 2.39996) % (Math.PI * 2);
      const r = 1.2 + ((n * 0.618) % 1) * (POND.radius - 2.4);
      ring.position.set(POND.x + Math.cos(a) * r, WATER_Y + 0.012, POND.z + Math.sin(a) * r);
      ring.scale.setScalar(0.08 + k * 0.9);
      (ring.material as THREE.MeshBasicMaterial).opacity = k < 0.6 ? 0.5 * (1 - k / 0.6) : 0;
    });
  });
  // Reeds and cattails in clumps round the shore, leaving the jetty side open.
  const REEDS = 90;
  const reedGeometry = new THREE.CylinderGeometry(0.012, 0.018, 1.2, 4);
  reedGeometry.translate(0, 0.6, 0);
  const reeds = new THREE.InstancedMesh(reedGeometry, mat(night ? "#3d5a32" : "#6e8f45", 0.9), REEDS);
  const headGeometry = new THREE.CapsuleGeometry(0.035, 0.16, 3, 6);
  const heads = new THREE.InstancedMesh(headGeometry, mat("#5a3a22", 0.9), REEDS);
  const clumps = [2.0, 2.5, 3.1, 3.7, 4.3, 4.9, 5.6];
  for (let i = 0; i < REEDS; i++) {
    const a = clumps[i % clumps.length] + (rand() - 0.5) * 0.35;
    const r = POND.radius + 0.1 + rand() * 0.9;
    const x = POND.x + Math.cos(a) * r;
    const z = POND.z + Math.sin(a) * r;
    const tall = 0.7 + rand() * 0.7;
    at.set(x, Math.max(meadowHeight(x, z), WATER_Y - 0.25), z);
    q.setFromEuler(new THREE.Euler((rand() - 0.5) * 0.25, rand() * 6, (rand() - 0.5) * 0.25));
    reeds.setMatrixAt(i, m.compose(at, q, scale.set(1, tall, 1)));
    const top = new THREE.Vector3(0, 1.2 * tall * 0.88, 0).applyQuaternion(q).add(at);
    heads.setMatrixAt(i, m.compose(top, q, scale.setScalar(i % 3 ? 1 : 0)));
  }
  reeds.castShadow = true;
  root.add(reeds, heads);
  disposables.push(reedGeometry, headGeometry);

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
  // The firewood, stacked in a cone, charred where it burns.
  const charred = mat("#2a1d14", 0.95);
  for (let i = 0; i < 6; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.75, 8), i % 2 ? charred : mat("#4a3020", 0.9));
    const a = (i / 6) * Math.PI * 2;
    log.position.set(CAMPFIRE.x + Math.cos(a) * 0.24, fireY + 0.3, CAMPFIRE.z + Math.sin(a) * 0.24);
    log.lookAt(CAMPFIRE.x, fireY + 0.72, CAMPFIRE.z);
    log.rotateX(Math.PI / 2);
    log.castShadow = true;
    root.add(log);
  }
  const campfire = buildFire(look, flame, glow, puffTexture, 1.35, true, night);
  campfire.group.position.set(CAMPFIRE.x, fireY + 0.08, CAMPFIRE.z);
  root.add(campfire.group);
  animated.push(campfire.update);
  const fireGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: look.fireLight, transparent: true, opacity: night ? 0.75 : 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  fireGlow.scale.setScalar(night ? 4.5 : 2.2);
  fireGlow.position.set(CAMPFIRE.x, fireY + 0.6, CAMPFIRE.z);
  root.add(fireGlow);
  const fireLight = new THREE.PointLight(look.fireLight, night ? 26 : 6, 14, 1.6);
  fireLight.position.set(CAMPFIRE.x, fireY + 1, CAMPFIRE.z);
  root.add(fireLight);
  // The campfire is everyone's to put out or light; anyone can throw a log on or toast a marshmallow,
  // and from the jetty skip a stone over the pond.
  const kit = new ThingKit(root);
  const fireAt = new THREE.Vector3(CAMPFIRE.x, fireY + 0.5, CAMPFIRE.z);
  let flare = 0;
  const fireHit = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.4, 12), new THREE.MeshBasicMaterial({ visible: false }));
  fireHit.position.set(CAMPFIRE.x, fireY + 0.6, CAMPFIRE.z);
  root.add(kit.tag(fireHit, "campfire"));
  kit.onSwitch("campfire", (k) => {
    campfire.group.visible = k > 0.02;
    // Dying, the flames sink; catching, they leap.
    const height = k < 1 ? 0.3 + 0.7 * k + Math.sin(k * Math.PI) * 0.3 : 1;
    campfire.group.scale.set(0.6 + 0.4 * k, height, 0.6 + 0.4 * k);
  }, 0.8);
  animated.push((t) => {
    const k = kit.level("campfire");
    flare = Math.max(0, flare - 0.012);
    fireGlow.material.opacity = k * (night ? 0.75 : 0.35) * (0.9 + Math.sin(t * 7.7) * 0.1) * (1 + flare * 0.8);
    fireLight.intensity = k * (night ? 26 : 6) * (0.85 + Math.sin(t * 9) * 0.08 + Math.sin(t * 21) * 0.05) * (1 + flare * 1.6);
    if (flare > 0 && k > 0.99) campfire.group.scale.setScalar(1 + flare * 0.45);
  });
  // A log thrown on: it drops onto the fire, which flares up in a shower of sparks.
  const thrown = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.8, 9), dress(mat("#7a5638", 0.95), "bark", { repeat: [1, 1], bump: 1.2 }));
  thrown.visible = false;
  root.add(thrown);
  kit.things.log = (since) => {
    const k = Math.min(1, since / 0.45);
    thrown.visible = since < 1.2;
    thrown.position.set(CAMPFIRE.x + 0.9 * (1 - k), fireY + 0.25 + Math.sin(k * Math.PI) * 0.7, CAMPFIRE.z + 0.2);
    thrown.rotation.set(0.3, 0, Math.PI / 2 + k * 2.5);
    if (since >= 0.45 && since - 0.45 < 0.05 && flare < 0.5) {
      flare = 1;
      kit.floatUp("spark", fireAt, 18, look.fire[0]);
      playPops(10);
    }
    return since < 1.2;
  };
  // A marshmallow on a stick, held over the fire: white, golden, toasted, gone (eaten).
  const stick = new THREE.Group();
  const twig = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 1.1, 6), mat("#6b4a2a", 0.9));
  twig.rotation.z = Math.PI / 2;
  twig.position.x = 0.55;
  const marshmallowMaterial = mat("#fbf6ec", 0.8);
  const marshmallow = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 12), marshmallowMaterial);
  marshmallow.rotation.z = Math.PI / 2;
  stick.add(twig, marshmallow);
  stick.visible = false;
  root.add(stick);
  const toast = [new THREE.Color("#fbf6ec"), new THREE.Color("#e8b25a"), new THREE.Color("#8a5326")];
  kit.things.marshmallow = (since) => {
    if (since === 0) stick.rotation.set(0, Math.random() * Math.PI * 2, -0.35);
    stick.visible = since < 5.5;
    stick.position.set(CAMPFIRE.x, fireY + 0.75 + Math.sin(since * 2) * 0.03, CAMPFIRE.z);
    const k = Math.min(1, since / 5);
    marshmallowMaterial.color.copy(k < 0.5 ? toast[0].clone().lerp(toast[1], k * 2) : toast[1].clone().lerp(toast[2], (k - 0.5) * 2));
    if (since >= 5 && since - 5 < 0.05) kit.floatUp("star", fireAt.clone().setY(fireY + 1.0), 3, "#ffe08a");
    return since < 5.5;
  };
  // A stone skipped from the end of the jetty: hops across the water, each leaving a ring.
  const pebble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.05, 0), mat("#8a8a86", 0.7));
  pebble.scale.y = 0.4;
  pebble.visible = false;
  root.add(pebble);
  const rings = Array.from({ length: 5 }, () => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32), new THREE.MeshBasicMaterial({ color: "#e8f4ff", transparent: true, opacity: 0, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    root.add(ring);
    return ring;
  });
  const HOPS = 4;
  const hopAt: number[] = [];
  { let at = 0.35; let gap = 0.42; for (let i = 0; i <= HOPS; i++) { hopAt.push(at); at += gap; gap *= 0.72; } }
  const skipFrom = new THREE.Vector3(JETTY.x0 - 0.2, WATER_Y + 1.1, JETTY.z);
  let skipSide = 0;
  kit.things.stone = (since) => {
    if (since === 0) skipSide = (Math.random() - 0.5) * 0.6;
    const end = hopAt[HOPS] + 0.3;
    pebble.visible = since < hopAt[HOPS];
    // Distance along the throw: fast at first, slowing with each touch.
    const along = (time: number) => 6.5 * (1 - Math.exp(-time * 1.1));
    const x = skipFrom.x - along(since);
    const z = skipFrom.z + along(since) * skipSide;
    let y = WATER_Y + 0.02;
    if (since < hopAt[0]) y = skipFrom.y + (WATER_Y - skipFrom.y) * (since / hopAt[0]);
    else for (let i = 0; i < HOPS; i++) {
      if (since >= hopAt[i] && since < hopAt[i + 1]) {
        const k = (since - hopAt[i]) / (hopAt[i + 1] - hopAt[i]);
        y = WATER_Y + 0.02 + Math.sin(k * Math.PI) * 0.4 * Math.pow(0.65, i);
      }
    }
    pebble.position.set(x, y, z);
    pebble.rotation.y = since * 30;
    rings.forEach((ring, i) => {
      const age = since - hopAt[i];
      ring.visible = age > 0 && age < 1.6;
      if (!ring.visible) return;
      if (age < 0.05) ring.position.set(skipFrom.x - along(hopAt[i]), WATER_Y + 0.015, skipFrom.z + along(hopAt[i]) * skipSide);
      ring.scale.setScalar(0.1 + age * 0.55);
      ring.material.opacity = 0.5 * (1 - age / 1.6);
    });
    return since < end + 1.6;
  };
  // A bucket of water by the ring puts the fire out; a bag of marshmallows on the log beside it.
  const bucket = new THREE.Group();
  const pail = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.28, 16, 1, true), mat("#7d8790", 0.4, { metalness: 0.7, side: THREE.DoubleSide }));
  pail.position.y = 0.14;
  const inPail = new THREE.Mesh(new THREE.CircleGeometry(0.15, 16), mat("#3a6a8a", 0.1));
  inPail.rotation.x = -Math.PI / 2;
  inPail.position.y = 0.24;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.008, 6, 20, Math.PI), mat("#5d646a", 0.4, { metalness: 0.7 }));
  handle.position.y = 0.28;
  bucket.add(pail, inPail, handle);
  bucket.position.set(CAMPFIRE.x + 1.05, meadowHeight(CAMPFIRE.x + 1.05, CAMPFIRE.z - 0.75), CAMPFIRE.z - 0.75);
  root.add(kit.tag(bucket, "bucket"));
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.1), mat("#f2efe6", 0.9));
  bag.position.set(CAMPFIRE.x - 1.0, meadowHeight(CAMPFIRE.x - 1.0, CAMPFIRE.z + 0.8) + 0.13, CAMPFIRE.z + 0.8);
  bag.rotation.y = 0.5;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.08), mat("#e8508a", 0.8));
  label.position.set(0, 0.02, 0.051);
  bag.add(label);
  root.add(kit.tag(bag, "marshmallow"));

  // Clicking the pond (not the shore) throws: an invisible disc just over the water.
  const pondHit = new THREE.Mesh(new THREE.CircleGeometry(POND.radius * 0.8, 24), new THREE.MeshBasicMaterial({ visible: false }));
  pondHit.rotation.x = -Math.PI / 2;
  pondHit.position.set(POND.x, WATER_Y + 0.05, POND.z);
  root.add(kit.tag(pondHit, "stone"));

  // Log seats round the fire.
  const bark = dress(mat("#7a5638", 0.95), "bark", { repeat: [2, 1], bump: 1.4 });
  // The sawn ends: pale wood with rings.
  const endGrain = mat("#ffffff", 0.9, {
    map: canvasTexture(128, 128, (ctx) => {
      ctx.fillStyle = "#c8a06a";
      ctx.fillRect(0, 0, 128, 128);
      ctx.strokeStyle = "rgba(110,70,35,0.55)";
      for (let r = 6; r < 64; r += 7 + (r % 3)) { ctx.lineWidth = 1.5 + (r % 2); ctx.beginPath(); ctx.arc(64, 64, r, 0, Math.PI * 2); ctx.stroke(); }
      ctx.strokeStyle = "#4a3020"; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(64, 64, 60, 0, Math.PI * 2); ctx.stroke();
    }),
  });
  for (const seat of MEADOW.seats.filter((s) => s.id.startsWith("fire-"))) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 1.05, 14), [bark, endGrain, endGrain]);
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
  const home = buildCabin(look, night, glow, flame, puffTexture, animated);
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

  // The open-air screen by the fire, on two posts, with a card on it until someone shares.
  const idleScreen = canvasTexture(1024, 576, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 576);
    g.addColorStop(0, night ? "#0b1430" : "#1d3b2a");
    g.addColorStop(1, night ? "#04070f" : "#0c1a12");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1024, 576);
    // Hills and a few pines along the bottom, and the moon or the sun.
    ctx.fillStyle = night ? "#0e1d1a" : "#2f5a37";
    ctx.beginPath(); ctx.moveTo(0, 470);
    for (let x = 0; x <= 1024; x += 32) ctx.lineTo(x, 450 + Math.sin(x * 0.012) * 26 + Math.sin(x * 0.031) * 10);
    ctx.lineTo(1024, 576); ctx.lineTo(0, 576); ctx.fill();
    for (const x of [90, 140, 860, 920, 960]) {
      ctx.beginPath(); ctx.moveTo(x, 330 + (x % 3) * 12); ctx.lineTo(x + 30, 450); ctx.lineTo(x - 30, 450); ctx.fill();
    }
    ctx.fillStyle = night ? "#f3f0e0" : "#ffd98a";
    ctx.beginPath(); ctx.arc(820, 120, 46, 0, Math.PI * 2); ctx.fill();
    if (night) { ctx.fillStyle = "#0b1430"; ctx.beginPath(); ctx.arc(842, 104, 42, 0, Math.PI * 2); ctx.fill(); }
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#f6eedc"; ctx.font = "700 64px Georgia, serif";
    ctx.fillText("Pictures by the fire", 512, 250);
    ctx.fillStyle = night ? "#c6d2f0" : "#cfe6c8"; ctx.font = "italic 32px Georgia, serif";
    ctx.fillText("Share your screen to show it here", 512, 320);
  });
  const screenMaterial = new THREE.MeshBasicMaterial({ map: idleScreen, toneMapped: false });
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
  // Grass: tufts of blades, thickest in the middle of the world, never on a path, in the water or in the cabin.
  const tuftShape = tuftGeometry();
  const TUFTS = 1600;
  const tufts = new THREE.InstancedMesh(tuftShape, new THREE.MeshStandardMaterial({ roughness: 1, vertexColors: true, side: THREE.DoubleSide }), TUFTS);
  const stemGeometry = new THREE.CylinderGeometry(0.008, 0.01, 0.3, 3);
  stemGeometry.translate(0, 0.15, 0);
  const bloomGeometry = new THREE.IcosahedronGeometry(0.036, 0);
  bloomGeometry.scale(1, 0.45, 1);
  bloomGeometry.translate(0, 0.31, 0);
  const FLOWERS = 260;
  const stems = new THREE.InstancedMesh(stemGeometry, mat(night ? "#2f5530" : "#4f8a3a", 1), FLOWERS);
  const blooms = new THREE.InstancedMesh(bloomGeometry, new THREE.MeshStandardMaterial({ roughness: 0.7 }), FLOWERS);
  const flowerColours = ["#f7f1e3", "#ffd43b", "#ff8787", "#b197fc", "#ffa94d"];
  const bare = (x: number, z: number) => Math.hypot(x - POND.x, z - POND.z) < POND.radius + 1.6
    || (Math.abs(x - CABIN.x) < CABIN.w / 2 + 0.5 && Math.abs(z - CABIN.z) < CABIN.d / 2 + 1.8)
    || Math.hypot(x - CAMPFIRE.x, z - CAMPFIRE.z) < 3
    || Math.abs(x - PICNIC.x) < 1.6 && Math.abs(z - PICNIC.z) < 1.2
    || pathDistance(x, z) < 0.75;
  const spread = (k: number) => Math.sign(k) * Math.pow(Math.abs(k), 1.35) * (MEADOW_HALF + 4);
  for (let i = 0; i < TUFTS; i++) {
    const x = spread(rand() * 2 - 1);
    const z = spread(rand() * 2 - 1);
    const s = bare(x, z) ? 0 : 0.7 + rand() * 0.9;
    at.set(x, meadowHeight(x, z) - 0.02, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6);
    tufts.setMatrixAt(i, m.compose(at, q, scale.set(s, s * (0.8 + rand() * 0.5), s)));
    tufts.setColorAt(i, colour.set(night ? "#2f5530" : "#6fae4f").offsetHSL((rand() - 0.5) * 0.04, 0, (rand() - 0.5) * 0.1));
  }
  for (let i = 0; i < FLOWERS; i++) {
    // Flowers grow in patches.
    const patch = Math.floor(i / 20);
    const px = spread(((patch * 0.618 + 0.13) % 1) * 2 - 1) * 0.8;
    const pz = spread(((patch * 0.414 + 0.71) % 1) * 2 - 1) * 0.8;
    const x = px + (rand() - 0.5) * 3;
    const z = pz + (rand() - 0.5) * 3;
    const s = bare(x, z) ? 0 : 0.8 + rand() * 0.6;
    at.set(x, meadowHeight(x, z) - 0.01, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6);
    m.compose(at, q, scale.setScalar(s));
    stems.setMatrixAt(i, m);
    blooms.setMatrixAt(i, m);
    blooms.setColorAt(i, colour.set(flowerColours[patch % flowerColours.length]).offsetHSL(0, 0, night ? -0.35 : 0));
  }
  root.add(tufts, stems, blooms);
  disposables.push(stemGeometry, bloomGeometry);

  // Clouds by day, stars and fireflies at night.
  // Where the sun (or moon) is: the light comes from there too.
  const SUN_AT = night ? new THREE.Vector3(-0.55, 0.36, -0.75).normalize() : new THREE.Vector3(18, 30, 12).normalize();
  if (!night) {
    // Clouds in a ring low over the hills, where you see them when you look out, each a few puffs.
    const clouds: THREE.Group[] = [];
    for (let i = 0; i < 16; i++) {
      const cloud = new THREE.Group();
      const a = (i / 16) * Math.PI * 2 + rand() * 0.3;
      const r = 82 + rand() * 18;
      cloud.position.set(Math.cos(a) * r, 13 + rand() * 16, Math.sin(a) * r);
      const puffs = 3 + Math.floor(rand() * 3);
      for (let k = 0; k < puffs; k++) {
        const bit = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture, color: k === 0 ? "#ffffff" : "#eef3f7", transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
        const w = 9 + rand() * 9;
        bit.scale.set(w, w * (0.5 + rand() * 0.2), 1);
        bit.position.set((k - (puffs - 1) / 2) * 6 + (rand() - 0.5) * 3, (rand() - 0.3) * 3, 0);
        cloud.add(bit);
      }
      cloud.lookAt(0, cloud.position.y, 0);
      cloud.userData.a = a;
      cloud.userData.r = r;
      clouds.push(cloud);
      root.add(cloud);
    }
    animated.push((t) => {
      clouds.forEach((cloud) => {
        const a = (cloud.userData.a as number) + t * 0.0025;
        cloud.position.x = Math.cos(a) * (cloud.userData.r as number);
        cloud.position.z = Math.sin(a) * (cloud.userData.r as number);
      });
    });
    const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: "#fff8e0", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    sunDisc.scale.setScalar(14);
    const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: "#ffe9b0", transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    sunHalo.scale.setScalar(55);
    sunDisc.position.copy(SUN_AT).multiplyScalar(100);
    sunHalo.position.copy(sunDisc.position);
    root.add(sunHalo, sunDisc);
  } else {
    // Stars: a fixed size on screen (at a hundred metres a world-sized point is too small to see), brighter and fainter.
    const STARS = 900;
    const starPositions = new Float32Array(STARS * 3);
    const starColours = new Float32Array(STARS * 3);
    for (let i = 0; i < STARS; i++) {
      const a = rand() * Math.PI * 2;
      const e = Math.asin(0.06 + rand() * 0.94);
      starPositions.set([Math.cos(a) * Math.cos(e) * 100, Math.sin(e) * 100, Math.sin(a) * Math.cos(e) * 100], i * 3);
      const b = 0.35 + Math.pow(rand(), 3) * 0.65;
      starColours.set([b, b, b * (0.9 + rand() * 0.2)], i * 3);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    starGeometry.setAttribute("color", new THREE.BufferAttribute(starColours, 3));
    root.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false, transparent: true, depthWrite: false })));
    disposables.push(starGeometry);
    // The moon, low over the cabin, with a halo.
    const moonMap = canvasTexture(128, 128, (ctx) => {
      ctx.fillStyle = "#f3f0e0";
      ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = "rgba(160,160,150,0.35)";
      for (const [x, y, r] of [[40, 50, 14], [80, 36, 9], [76, 80, 18], [36, 92, 8], [98, 62, 6]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
    });
    const moon = new THREE.Mesh(new THREE.SphereGeometry(3, 24, 18), new THREE.MeshBasicMaterial({ map: moonMap, fog: false }));
    moon.position.copy(SUN_AT).multiplyScalar(100);
    moon.lookAt(0, 0, 0);
    const moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: "#b8c6ff", transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    moonHalo.scale.setScalar(30);
    moonHalo.position.copy(moon.position);
    root.add(moonHalo, moon);
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
  sun.position.copy(SUN_AT).multiplyScalar(36);
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
  animated.push((t) => { waterMaterial.opacity = 0.96 + Math.sin(t * 0.8) * 0.04; water.position.y = WATER_Y + Math.sin(t * 0.6) * 0.008; });

  for (const object of [trunkGeometry, pineGeometry, broadGeometry, tuftShape]) disposables.push(object);

  return {
    root,
    ceiling,
    screenMaterial,
    idleScreen,
    background: new THREE.Color(night ? "#0a1124" : "#a9d2f0"),
    fog: new THREE.Fog(night ? "#0d1428" : "#c9e2f2", 26, 70),
    exposure: night ? 1.3 : 1.0,
    shark,
    update: (t, dt) => { kit.update(t, dt); for (const step of animated) step(t); },
    things: kit.api({
      label: (id) => id === "campfire" ? (kit.wanted("campfire") ? "Throw on a log" : "Light the fire")
        : id === "bucket" ? (kit.wanted("campfire") ? "Put the fire out" : null)
          : id === "stone" ? "Skip a stone" : id === "marshmallow" ? (kit.wanted("campfire") ? "Toast a marshmallow" : null) : null,
      // The fire, lit, takes a log; unlit, it is lit. The bucket only ever puts it out.
      route: (id) => id === "campfire" ? (kit.wanted("campfire") ? { moment: "log" } : { switch: "campfire", on: true })
        : id === "bucket" ? (kit.wanted("campfire") ? { switch: "campfire", on: false } : null)
          : id === "marshmallow" ? (kit.wanted("campfire") ? { moment: "marshmallow" } : null) : undefined,
      sounds: { marshmallow: playSizzle, stone: () => playSkips(HOPS) },
      switched: (id, on) => { if (id === "campfire") { if (on) { playIgnite(); flare = 1; } else playDouse(); } },
    }),
    // Walking into the house takes its roof off from above (from your own eyes it is the ceiling).
    viewer: (x, z, view) => { roof.visible = !(inCabin(x, z) && view !== "eyes"); },
    dispose: () => { kit.dispose(); for (const item of disposables) item.dispose(); },
  };
}

/**
 * The cabin: log walls with a door gap in the south wall, a plank floor, a
 * stone fireplace on the north wall, a couch facing it (Blåhaj included), an
 * armchair, a rug, shelves and a lamp, and a porch with two benches outside.
 */
function buildCabin(look: Look, night: boolean, glow: THREE.Texture, flame: THREE.Texture, puff: THREE.Texture, animated: Array<(t: number) => void>) {
  const group = new THREE.Group();
  group.position.set(CABIN.x, 0, CABIN.z);
  const W = CABIN.w;
  const D = CABIN.d;
  const H = 2.6;
  const F = CABIN_FLOOR_Y;
  const logs = dress(mat("#8a6040", 0.9), "bark", { repeat: [3, 1], bump: 1.2 });
  const darkLogs = dress(mat("#78502f", 0.9), "bark", { repeat: [3, 1], bump: 1.2 });
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
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.2, D - 0.2), floorMaterial(look, W - 0.2, D - 0.2));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = F + 0.005;
  floor.receiveShadow = true;
  floor.userData.floor = true;
  group.add(floor);
  // The door stands open, swung in most of the way back against the wall (clear of the couch).
  const door = box(1.2, doorTop - 0.05, 0.07, mat("#4a2e1a", 0.7));
  door.geometry.translate(0.6, 0, 0);
  door.position.set(-CABIN_DOOR_HALF, F + doorTop / 2, D / 2 - 0.2);
  door.rotation.y = Math.PI - 0.35;
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
    frame.position.addScaledVector(new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry)), -0.05);
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
  // Stone pillars and a lintel round an open firebox, sooty inside.
  const stone = mat("#8a867c", 0.95);
  const soot = mat("#1a1210", 1);
  const DEEP = 0.6;
  for (const side of [-1, 1]) {
    const pillar = box(0.55, 1.4, DEEP, stone);
    pillar.position.set(side * 0.825, F + 0.7, -D / 2 + DEEP / 2);
    group.add(pillar);
  }
  const lintelStone = box(1.1, 0.65, DEEP, stone);
  lintelStone.position.set(0, F + 1.075, -D / 2 + DEEP / 2);
  const fireback = box(1.1, 0.75, 0.06, soot, false);
  // In front of the wall's logs, which bulge into the room.
  fireback.position.set(0, F + 0.375, -D / 2 + 0.2);
  const bed = box(1.1, 0.04, DEEP, soot, false);
  bed.position.set(0, F + 0.02, -D / 2 + DEEP / 2);
  const mantel = box(2.4, 0.1, 0.4, mat(look.wood, 0.6));
  mantel.position.set(0, F + 1.45, -D / 2 + 0.4);
  group.add(lintelStone, fireback, bed, mantel);
  for (let k = 0; k < 3; k++) {
    const firewood = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.7, 8), mat(k % 2 ? "#2a1d14" : "#4a3020", 0.9));
    firewood.rotation.set(0, 0, Math.PI / 2);
    firewood.rotation.y = (k - 1) * 0.35;
    firewood.position.set(0, F + 0.09 + (k === 1 ? 0.08 : 0), -D / 2 + 0.4);
    group.add(firewood);
  }
  const hearthFire = buildFire(look, flame, glow, puff, 0.68, false, night);
  hearthFire.group.position.set(0, F + 0.08, -D / 2 + 0.42);
  group.add(hearthFire.group);
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
    hearthFire.update(t);
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

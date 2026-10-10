"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Armchair, Eye, Flame, Glasses, Map as MapIcon, Smartphone, View, X } from "lucide-react";
import type { VoiceParticipant } from "@/lib/protocol";
import type { LivingRoom } from "../hooks/use-living-room";
import {
  LOUNGE_EMOTES, LOUNGE_SEATS, NOOK, ROOM_HALF_X, ROOM_HALF_Z, headingTo, seatById, stepTo, wrapHeading,
  type LoungePose,
} from "../lib/living-room";

type CameraView = "overhead" | "eyes";

interface Props {
  room: LivingRoom;
  participants: VoiceParticipant[];
  connectionId: string | null;
  speaking: Set<string>;
  /** Live screen shares; the first one plays on the TV above the fireplace. */
  screens: Array<{ stream: MediaStream; name: string }>;
  onClose: () => void;
}

const EYE_SEATED = 1.1;
const EYE_STANDING = 1.6;
const WALK_SPEED = 1.6; // m/s

/** Warm by evening, blue at night, bright by day: the window follows the viewer's own clock. */
function skyColour(date = new Date()): THREE.Color {
  const h = date.getHours() + date.getMinutes() / 60;
  const stops: Array<[number, string]> = [
    [0, "#0b1030"], [5, "#1b1f4a"], [6.5, "#f3a37a"], [8, "#9fd3ff"], [17, "#8cc8ff"],
    [19, "#f08a5d"], [20.5, "#3a2a5e"], [22, "#0e1238"], [24, "#0b1030"],
  ];
  for (let i = 1; i < stops.length; i++) {
    const [h1, c1] = stops[i];
    const [h0, c0] = stops[i - 1];
    if (h <= h1) return new THREE.Color(c0).lerp(new THREE.Color(c1), (h - h0) / (h1 - h0));
  }
  return new THREE.Color(stops[0][1]);
}
const isNight = (date = new Date()) => date.getHours() >= 20 || date.getHours() < 6;

function labelTexture(text: string, colour = "#ffffff", background = "rgba(20,16,30,0.72)"): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = "600 40px system-ui, sans-serif";
  ctx.font = font;
  const width = Math.min(512, Math.ceil(ctx.measureText(text).width) + 40);
  canvas.width = width;
  canvas.height = 64;
  ctx.font = font;
  ctx.fillStyle = background;
  ctx.beginPath();
  ctx.roundRect(0, 0, width, 64, 30);
  ctx.fill();
  ctx.fillStyle = colour;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(text, width / 2, 34, width - 24);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function emojiTexture(emoji: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "96px system-ui, 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, 64, 72);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A face: the profile picture when it loads, the avatar letter on the user's colour until then. */
function faceTexture(person: VoiceParticipant): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = person.color || "#ffd67c";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "#1b1530";
  ctx.font = "600 130px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText((person.avatar || person.displayName || "?").slice(0, 2), 128, 140);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (person.avatarUrl) {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, 256, 256);
      ctx.clip();
      ctx.drawImage(image, 0, 0, 256, 256);
      ctx.restore();
      texture.needsUpdate = true;
    };
    image.src = person.avatarUrl;
  }
  return texture;
}

interface Body {
  group: THREE.Group;
  torso: THREE.Mesh;
  head: THREE.Mesh;
  ring: THREE.Mesh;
  label: THREE.Sprite;
  mute: THREE.Sprite;
  shown: { x: number; z: number; facing: number; lift: number };
  key: string;
}

function makeBody(person: VoiceParticipant): Body {
  const group = new THREE.Group();
  const colour = new THREE.Color(person.color || "#ffd67c");
  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.2, 0.5, 6, 16),
    new THREE.MeshStandardMaterial({ color: colour, roughness: 0.75 }),
  );
  torso.position.y = 0.6;
  torso.castShadow = true;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 32, 20),
    new THREE.MeshStandardMaterial({ map: faceTexture(person), roughness: 0.6 }),
  );
  // The picture faces forward (-Z in the body's frame).
  head.rotation.y = Math.PI / 2;
  head.position.y = 1.18;
  head.castShadow = true;
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshStandardMaterial({ color: colour.clone().multiplyScalar(0.8) }));
  nose.position.set(0, 1.18, -0.19);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.3, 0.38, 40),
    new THREE.MeshBasicMaterial({ color: "#7dffb0", transparent: true, opacity: 0, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(person.displayName || person.username), depthTest: false }));
  const aspect = (label.material.map!.image as HTMLCanvasElement).width / 64;
  label.scale.set(0.16 * aspect, 0.16, 1);
  label.position.y = 1.55;
  label.renderOrder = 10;
  const mute = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture("🔇"), depthTest: false }));
  mute.scale.set(0.18, 0.18, 1);
  mute.position.set(0.24, 1.38, 0);
  mute.visible = false;
  group.add(torso, head, nose, ring, label, mute);
  return { group, torso, head, ring, label, mute, shown: { x: 0, z: 0, facing: 0, lift: 0 }, key: `${person.displayName}|${person.avatarUrl}|${person.color}` };
}

function disposeTree(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of materials) {
      (material as THREE.MeshStandardMaterial).map?.dispose();
      material.dispose();
    }
  });
}

const box = (w: number, h: number, d: number, colour: string, rough = 0.85) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: colour, roughness: rough }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

/** The furniture. Everything clickable to sit on carries userData.seat. */
function buildRoom(scene: THREE.Scene) {
  const W = ROOM_HALF_X * 2;
  const D = ROOM_HALF_Z * 2;
  const H = 2.7;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: "#8a6446", roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.userData.floor = true;
  scene.add(floor);
  // Floorboards: thin darker lines.
  for (let x = -ROOM_HALF_X + 0.25; x < ROOM_HALF_X; x += 0.25) {
    const line = box(0.008, 0.001, D, "#6e4e36");
    line.position.set(x, 0.001, 0);
    line.castShadow = false;
    scene.add(line);
  }
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1.7, 48), new THREE.MeshStandardMaterial({ color: "#b4566a", roughness: 1 }));
  rug.rotation.x = -Math.PI / 2;
  rug.scale.set(1.25, 0.85, 1);
  rug.position.set(0, 0.004, -0.4);
  rug.receiveShadow = true;
  rug.userData.floor = true;
  const rugInner = new THREE.Mesh(new THREE.RingGeometry(1.35, 1.45, 48), new THREE.MeshStandardMaterial({ color: "#f2d29b" }));
  rugInner.rotation.x = -Math.PI / 2;
  rugInner.scale.set(1.25, 0.85, 1);
  rugInner.position.set(0, 0.006, -0.4);
  scene.add(rug, rugInner);

  const wallMaterial = new THREE.MeshStandardMaterial({ color: "#e9dcc8", roughness: 0.95, side: THREE.BackSide });
  const walls = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), wallMaterial);
  walls.position.y = H / 2;
  walls.receiveShadow = true;
  // Floor is its own mesh; hide the box's floor face by pushing it a hair below.
  walls.position.y = H / 2 - 0.002;
  walls.userData.wall = true;
  scene.add(walls);
  const skirting = new THREE.MeshStandardMaterial({ color: "#f7f1e7" });
  for (const [w, x, z, ry] of [[W, 0, -ROOM_HALF_Z + 0.01, 0], [W, 0, ROOM_HALF_Z - 0.01, 0], [D, -ROOM_HALF_X + 0.01, 0, Math.PI / 2], [D, ROOM_HALF_X - 0.01, 0, Math.PI / 2]] as const) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, 0.02), skirting);
    strip.position.set(x, 0.05, z);
    strip.rotation.y = ry;
    scene.add(strip);
  }

  // Fireplace on the north wall, with a TV above it.
  const hearth = new THREE.Group();
  const surround = box(2, 1.1, 0.5, "#c9b9a6");
  surround.position.set(0, 0.55, -ROOM_HALF_Z + 0.25);
  const mantel = box(2.2, 0.08, 0.6, "#5b3d2a");
  mantel.position.set(0, 1.14, -ROOM_HALF_Z + 0.28);
  const firebox = box(1.0, 0.65, 0.3, "#1a1210");
  firebox.position.set(0, 0.36, -ROOM_HALF_Z + 0.37);
  const logs = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 10), new THREE.MeshStandardMaterial({ color: "#4a2e1c" }));
    log.rotation.z = Math.PI / 2;
    log.rotation.y = (i - 1) * 0.35;
    log.position.set(0, 0.1 + (i === 1 ? 0.07 : 0), -ROOM_HALF_Z + 0.5);
    logs.add(log);
  }
  const flames: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.07 + Math.random() * 0.05, 0.3 + Math.random() * 0.15, 8),
      new THREE.MeshBasicMaterial({ color: i % 2 ? "#ffb347" : "#ff6a1f", transparent: true, opacity: 0.85 }),
    );
    flame.position.set(-0.24 + i * 0.12, 0.28, -ROOM_HALF_Z + 0.5);
    flame.userData.phase = Math.random() * 10;
    flames.push(flame);
    logs.add(flame);
  }
  const fireLight = new THREE.PointLight("#ff8a3d", 2.2, 7, 1.6);
  fireLight.position.set(0, 0.5, -ROOM_HALF_Z + 0.8);
  fireLight.castShadow = true;
  fireLight.shadow.mapSize.set(512, 512);
  hearth.add(surround, mantel, firebox, logs, fireLight);
  // Candles and a little plant on the mantel.
  for (const x of [-0.85, -0.7]) {
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 12), new THREE.MeshStandardMaterial({ color: "#fff4dc" }));
    candle.position.set(x, 1.26, -ROOM_HALF_Z + 0.3);
    const wick = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: "#ffcf70" }));
    wick.position.set(x, 1.36, -ROOM_HALF_Z + 0.3);
    wick.userData.phase = Math.random() * 10;
    flames.push(wick);
    hearth.add(candle, wick);
  }
  scene.add(hearth);

  const tvFrame = box(1.9, 1.1, 0.06, "#111");
  tvFrame.position.set(0, 1.85, -ROOM_HALF_Z + 0.05);
  const screenMaterial = new THREE.MeshBasicMaterial({ color: "#16131f" });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.0125), screenMaterial);
  screen.position.set(0, 1.85, -ROOM_HALF_Z + 0.085);
  scene.add(tvFrame, screen);

  // The couch, facing the fire.
  const couch = new THREE.Group();
  const fabric = "#4f6d7a";
  const base = box(2.4, 0.42, 0.85, fabric);
  base.position.set(0, 0.21, 0.95);
  const back = box(2.4, 0.5, 0.2, fabric);
  back.position.set(0, 0.6, 1.3);
  const armL = box(0.2, 0.3, 0.85, fabric);
  armL.position.set(-1.2, 0.55, 0.95);
  const armR = armL.clone();
  armR.position.x = 1.2;
  couch.add(base, back, armL, armR);
  for (const seat of LOUNGE_SEATS.filter((s) => s.id.startsWith("couch"))) {
    const cushion = box(0.74, 0.1, 0.62, "#5f8191");
    cushion.position.set(seat.x, 0.47, seat.z + 0.12);
    cushion.userData.seat = seat.id;
    const pillow = box(0.45, 0.32, 0.12, "#e7c46b");
    pillow.position.set(seat.x, 0.68, 1.15);
    pillow.rotation.x = -0.25;
    pillow.userData.seat = seat.id;
    couch.add(cushion, pillow);
  }
  scene.add(couch);
  // A blanket draped over the left arm, for soul.
  const blanket = box(0.5, 0.04, 0.9, "#c96f4a");
  blanket.position.set(-1.2, 0.71, 0.95);
  scene.add(blanket);

  for (const seat of LOUNGE_SEATS.filter((s) => s.id.startsWith("arm"))) {
    const chair = new THREE.Group();
    const seatBox = box(0.8, 0.42, 0.8, "#8e5a3c");
    seatBox.position.y = 0.21;
    const backBox = box(0.8, 0.55, 0.18, "#8e5a3c");
    backBox.position.set(0, 0.62, 0.36);
    const a1 = box(0.14, 0.25, 0.8, "#7a4b31");
    a1.position.set(-0.37, 0.52, 0);
    const a2 = a1.clone();
    a2.position.x = 0.37;
    for (const part of [seatBox, backBox, a1, a2]) part.userData.seat = seat.id;
    chair.add(seatBox, backBox, a1, a2);
    chair.position.set(seat.x, 0, seat.z);
    chair.rotation.y = -seat.facing;
    scene.add(chair);
  }
  for (const seat of LOUNGE_SEATS.filter((s) => s.id.startsWith("bean"))) {
    const bean = new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 16), new THREE.MeshStandardMaterial({ color: seat.id === "bean-1" ? "#7c5cc4" : "#4fae8a", roughness: 1 }));
    bean.scale.set(1, 0.55, 1);
    bean.position.set(seat.x, 0.2, seat.z);
    bean.castShadow = true;
    bean.userData.seat = seat.id;
    scene.add(bean);
  }

  const table = box(1.0, 0.06, 0.55, "#6b4a33");
  table.position.set(0, 0.42, -0.45);
  for (const [x, z] of [[-0.45, -0.68], [0.45, -0.68], [-0.45, -0.22], [0.45, -0.22]]) {
    const leg = box(0.05, 0.4, 0.05, "#5a3d2a");
    leg.position.set(x, 0.2, z);
    scene.add(leg);
  }
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 16), new THREE.MeshStandardMaterial({ color: "#f5f0e6" }));
  mug.position.set(0.25, 0.5, -0.4);
  const popcorn = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.14, 16), new THREE.MeshStandardMaterial({ color: "#d9443a" }));
  popcorn.position.set(-0.2, 0.52, -0.48);
  const kernels = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#fff3c4", roughness: 1 }));
  kernels.position.set(-0.2, 0.59, -0.48);
  scene.add(table, mug, popcorn, kernels);

  // Window on the east wall with the sky behind it, and the reading nook below.
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), new THREE.MeshBasicMaterial({ color: skyColour() }));
  sky.position.set(ROOM_HALF_X - 0.005, 1.55, 1.6);
  sky.rotation.y = -Math.PI / 2;
  const stars = new THREE.Group();
  for (let i = 0; i < 24; i++) {
    const star = new THREE.Mesh(new THREE.CircleGeometry(0.008 + Math.random() * 0.008, 6), new THREE.MeshBasicMaterial({ color: "#fffbe0" }));
    star.position.set(ROOM_HALF_X - 0.01, 1.0 + Math.random() * 1.1, 0.85 + Math.random() * 1.5);
    star.rotation.y = -Math.PI / 2;
    stars.add(star);
  }
  stars.visible = isNight();
  const frame = new THREE.MeshStandardMaterial({ color: "#f7f1e7" });
  for (const [h, w, y, z] of [[0.06, 1.7, 2.17, 1.6], [0.06, 1.7, 0.93, 1.6], [1.3, 0.06, 1.55, 0.78], [1.3, 0.06, 1.55, 2.42], [1.2, 0.04, 1.55, 1.6], [0.04, 1.6, 1.55, 1.6]] as const) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, w), frame);
    bar.position.set(ROOM_HALF_X - 0.03, y, z);
    scene.add(bar);
  }
  const moonOrSun = new THREE.Mesh(new THREE.CircleGeometry(0.09, 24), new THREE.MeshBasicMaterial({ color: isNight() ? "#f4f1d0" : "#fff2a8" }));
  moonOrSun.position.set(ROOM_HALF_X - 0.008, 1.9, 2.1);
  moonOrSun.rotation.y = -Math.PI / 2;
  scene.add(sky, stars, moonOrSun);
  const bench = box(1.0, 0.4, 1.6, "#d8c9b4");
  bench.position.set(3.45, 0.2, 1.95);
  const cushionA = box(0.9, 0.08, 1.5, "#93b7a0");
  cushionA.position.set(3.45, 0.44, 1.95);
  for (const part of [bench, cushionA]) part.userData.seat = "nook-1";
  scene.add(bench, cushionA);
  const pouf = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.4, 20), new THREE.MeshStandardMaterial({ color: "#d1a35c", roughness: 1 }));
  pouf.position.set(2.75, 0.2, 2.45);
  pouf.userData.seat = "nook-2";
  pouf.castShadow = true;
  scene.add(pouf);
  // The nook's soft boundary on the floor, so people can see where it is quiet.
  const nookMark = new THREE.Mesh(new THREE.RingGeometry(NOOK.radius - 0.03, NOOK.radius, 48), new THREE.MeshBasicMaterial({ color: "#f2d29b", transparent: true, opacity: 0.35 }));
  nookMark.rotation.x = -Math.PI / 2;
  nookMark.position.set(NOOK.x, 0.007, NOOK.z);
  scene.add(nookMark);

  // A floor lamp, a bookshelf and some plants.
  const lampPole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 8), new THREE.MeshStandardMaterial({ color: "#2b2b2b" }));
  lampPole.position.set(-1.65, 0.75, 1.45);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.3, 24, 1, true), new THREE.MeshStandardMaterial({ color: "#fbe7c2", emissive: "#ffcc77", emissiveIntensity: 0.6, side: THREE.DoubleSide }));
  shade.position.set(-1.65, 1.55, 1.45);
  const lampLight = new THREE.PointLight("#ffd29a", 1.4, 5, 1.8);
  lampLight.position.set(-1.65, 1.45, 1.45);
  scene.add(lampPole, shade, lampLight);

  const shelf = box(0.35, 1.9, 1.4, "#6b4a33");
  shelf.position.set(-ROOM_HALF_X + 0.18, 0.95, -1.4);
  scene.add(shelf);
  const bookColours = ["#c94f4f", "#4f7cc9", "#e3b448", "#5aa36b", "#8d5bc1", "#e07b39", "#2f4858"];
  for (let row = 0; row < 4; row++) {
    let z = -2.0;
    while (z < -0.8) {
      const w = 0.04 + Math.random() * 0.05;
      const h = 0.22 + Math.random() * 0.12;
      const book = box(0.24, h, w, bookColours[Math.floor(Math.random() * bookColours.length)]);
      book.position.set(-ROOM_HALF_X + 0.33, 0.1 + row * 0.45 + h / 2, z + w / 2);
      book.castShadow = false;
      scene.add(book);
      z += w + 0.005;
    }
  }
  const plant = (x: number, z: number, scale = 1) => {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * scale, 0.14 * scale, 0.35 * scale, 16), new THREE.MeshStandardMaterial({ color: "#c46a43" }));
    pot.position.set(x, 0.175 * scale, z);
    scene.add(pot);
    for (let i = 0; i < 7; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.16 * scale, 10, 8), new THREE.MeshStandardMaterial({ color: i % 2 ? "#3f8f4f" : "#57a862", roughness: 0.9 }));
      leaf.scale.set(0.6, 1.4, 0.6);
      const a = (i / 7) * Math.PI * 2;
      leaf.position.set(x + Math.cos(a) * 0.12 * scale, (0.5 + (i % 3) * 0.12) * scale, z + Math.sin(a) * 0.12 * scale);
      leaf.rotation.set(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5);
      leaf.castShadow = true;
      scene.add(leaf);
    }
  };
  plant(ROOM_HALF_X - 0.4, -ROOM_HALF_Z + 0.4, 1.4);
  plant(-ROOM_HALF_X + 0.45, ROOM_HALF_Z - 0.45, 1.2);
  plant(1.45, -ROOM_HALF_Z + 0.35, 0.8);

  // A string of fairy lights along the top of the north wall.
  const fairy: THREE.Mesh[] = [];
  for (let i = 0; i < 28; i++) {
    const t = i / 27;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: ["#ffd27a", "#ff9ec7", "#9ee7ff", "#c6ff9e"][i % 4] }));
    bulb.position.set(-ROOM_HALF_X + 0.2 + t * (W - 0.4), 2.45 - Math.sin(t * Math.PI * 4) ** 2 * 0.12, -ROOM_HALF_Z + 0.04);
    bulb.userData.phase = i;
    fairy.push(bulb);
    scene.add(bulb);
  }

  // Blåhaj lives on the couch. Clicking it squeaks.
  const shark = new THREE.Group();
  const sharkBody = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshStandardMaterial({ color: "#5a8fb8", roughness: 1 }));
  sharkBody.scale.set(2.2, 0.9, 0.9);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), new THREE.MeshStandardMaterial({ color: "#f3f1ec", roughness: 1 }));
  belly.scale.set(2.0, 0.6, 0.8);
  belly.position.y = -0.05;
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 8), sharkBody.material);
  fin.position.set(0, 0.17, 0);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 8), sharkBody.material);
  tail.rotation.z = Math.PI / 2;
  tail.position.set(0.38, 0.02, 0);
  shark.add(sharkBody, belly, fin, tail);
  shark.position.set(1.0, 0.62, 1.0);
  shark.rotation.y = 0.4;
  shark.traverse((part) => { part.userData.blahaj = true; });
  scene.add(shark);

  return { screen, screenMaterial, flames, fireLight, sky, stars, fairy, shark };
}

/** A soft procedural fire crackle, only ever made in the viewer's own browser. */
function startCrackle(): () => void {
  const context = new AudioContext();
  const length = context.sampleRate * 4;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let brown = 0;
  for (let i = 0; i < length; i++) {
    brown = (brown + (Math.random() * 2 - 1) * 0.02) * 0.995;
    data[i] = brown * 0.6;
    if (Math.random() < 0.0009) {
      const pop = Math.floor(context.sampleRate * (0.002 + Math.random() * 0.01));
      const loud = 0.2 + Math.random() * 0.5;
      for (let j = 0; j < pop && i + j < length; j++) data[i + j] += (Math.random() * 2 - 1) * loud * (1 - j / pop);
    }
  }
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 3200;
  const gain = context.createGain();
  gain.gain.value = 0.18;
  source.connect(filter).connect(gain).connect(context.destination);
  source.start();
  return () => { source.stop(); void context.close(); };
}

function squeak() {
  try {
    const context = new AudioContext();
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(900, context.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1500, context.currentTime + 0.08);
    osc.frequency.exponentialRampToValueAtTime(700, context.currentTime + 0.22);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.25);
    osc.connect(gain).connect(context.destination);
    osc.start();
    osc.stop(context.currentTime + 0.3);
    osc.onended = () => void context.close();
  } catch { /* No sound, still cute. */ }
}

type XrNavigator = Navigator & { xr?: { isSessionSupported: (mode: string) => Promise<boolean>; requestSession: (mode: string, init?: object) => Promise<XRSession> } };
type OrientationEventCtor = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> };

export function LivingRoomView({ room, participants, connectionId, speaking, screens, onClose }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<CameraView>("overhead");
  const [crackle, setCrackle] = useState(false);
  const [gyro, setGyro] = useState(false);
  const [xr, setXr] = useState<{ vr: boolean; ar: boolean }>({ vr: false, ar: false });
  const [hint, setHint] = useState<string | null>("Click the floor to walk, a seat to sit. WASD / arrows walk, Q/E turn.");
  const [xrError, setXrError] = useState<string | null>(null);

  // Everything the render loop reads lives in one ref, refreshed every React render.
  const live = useRef({ room, participants, connectionId, speaking, screens, view, gyro });
  live.current = { room, participants, connectionId, speaking, screens, view, gyro };
  const xrStart = useRef<((mode: "immersive-vr" | "immersive-ar") => void) | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setHint(null), 9000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const nav = navigator as XrNavigator;
    if (!nav.xr) return;
    void Promise.all([
      nav.xr.isSessionSupported("immersive-vr").catch(() => false),
      nav.xr.isSessionSupported("immersive-ar").catch(() => false),
    ]).then(([vr, ar]) => setXr({ vr, ar }));
  }, []);

  useEffect(() => {
    if (!crackle) return;
    let stop: (() => void) | null = null;
    try { stop = startCrackle(); } catch { setCrackle(false); }
    return () => stop?.();
  }, [crackle]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.xr.enabled = true;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const background = new THREE.Color("#120e1c");
    scene.background = background;
    scene.fog = new THREE.Fog("#120e1c", 9, 18);
    const night = isNight();
    scene.add(new THREE.HemisphereLight(night ? "#8f8ac4" : "#fff4e0", "#3a2a22", night ? 0.55 : 1.1));
    const sun = new THREE.DirectionalLight(night ? "#9fb0ff" : "#fff1d6", night ? 0.35 : 1.3);
    sun.position.set(6, 5, 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5 });
    scene.add(sun);

    // The house: in AR it is shrunk to a dollhouse in front of you.
    const house = new THREE.Group();
    scene.add(house);
    const parts = buildRoom(house as unknown as THREE.Scene);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 50);
    // In XR the headset drives the camera; this rig carries it to your spot.
    const rig = new THREE.Group();
    rig.add(camera);
    scene.add(rig);

    const bodies = new Map<string, Body>();
    const bubbles = new Map<number, THREE.Sprite>();
    let video: HTMLVideoElement | null = null;
    let videoTexture: THREE.VideoTexture | null = null;
    let videoStream: MediaStream | null = null;

    // Overhead orbit.
    const orbit = { yaw: 0.0, pitch: 0.95, distance: 7.2 };
    // First-person look offset, added to body heading.
    const look = { yaw: 0, pitch: -0.08 };
    const gyroPose = { yaw: 0, pitch: 0, base: null as number | null };
    let xrMode: "immersive-vr" | "immersive-ar" | null = null;

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount;
      if (!w || !h || renderer.xr.isPresenting) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let drag: { x: number; y: number; moved: boolean } | null = null;
    let walkTarget: { x: number; z: number } | null = null;
    const keys = new Set<string>();

    // Frames come faster than React re-renders, so walking builds on the last
    // pose this tab asked for rather than the last one React has shown.
    let local: { pose: LoungePose; at: number } | null = null;
    const myPose = (): LoungePose | null => {
      const { room: r, connectionId: id } = live.current;
      if (local && performance.now() - local.at < 400) return local.pose;
      local = null;
      return id ? r.poses.get(id) ?? null : null;
    };
    const moveTo = (pose: LoungePose) => {
      local = { pose, at: performance.now() };
      live.current.room.move(pose);
    };

    const pick = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(house.children, true);
      for (const hit of hits) {
        let object: THREE.Object3D | null = hit.object;
        while (object && !object.userData.seat && !object.userData.blahaj && !object.userData.floor) object = object.parent;
        if (!object) continue;
        if (object.userData.blahaj) {
          squeak();
          parts.shark.userData.hop = performance.now();
          return;
        }
        if (object.userData.seat) {
          local = null;
          live.current.room.sit(object.userData.seat);
          walkTarget = null;
          return;
        }
        if (object.userData.floor) {
          walkTarget = { x: hit.point.x / house.scale.x, z: hit.point.z / house.scale.z };
          return;
        }
      }
    };

    const onDown = (event: PointerEvent) => {
      drag = { x: event.clientX, y: event.clientY, moved: false };
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
      if (!drag) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (!drag.moved) return;
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (live.current.view === "overhead") {
        orbit.yaw -= dx * 0.006;
        orbit.pitch = Math.max(0.25, Math.min(1.45, orbit.pitch + dy * 0.004));
      } else {
        // Dragging in first person turns your body, so everyone sees you look over.
        const pose = myPose();
        if (pose) moveTo({ ...pose, facing: wrapHeading(pose.facing - dx * 0.005) });
        look.pitch = Math.max(-1.1, Math.min(0.9, look.pitch - dy * 0.004));
      }
    };
    const onUp = (event: PointerEvent) => {
      if (drag && !drag.moved) pick(event.clientX, event.clientY);
      drag = null;
    };
    const onWheel = (event: WheelEvent) => {
      if (live.current.view !== "overhead") return;
      event.preventDefault();
      orbit.distance = Math.max(3, Math.min(11, orbit.distance + event.deltaY * 0.005));
    };
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const key = event.key.toLowerCase();
      if (!["w", "a", "s", "d", "q", "e", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) return;
      if (event.type === "keydown") { keys.add(key); walkTarget = null; } else keys.delete(key);
    };
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.alpha == null || event.beta == null) return;
      const yaw = THREE.MathUtils.degToRad(event.alpha);
      if (gyroPose.base == null) gyroPose.base = yaw;
      gyroPose.yaw = wrapHeading(yaw - gyroPose.base);
      // Phone held upright is beta ≈ 90°.
      gyroPose.pitch = THREE.MathUtils.degToRad(event.beta - 90);
    };
    const canvas = renderer.domElement;
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("deviceorientation", onOrientation);

    xrStart.current = (mode) => {
      const nav = navigator as XrNavigator;
      if (!nav.xr) return;
      void nav.xr.requestSession(mode, { optionalFeatures: ["local-floor"] }).then(async (session) => {
        xrMode = mode;
        renderer.xr.setReferenceSpaceType("local-floor");
        await renderer.xr.setSession(session);
        if (mode === "immersive-ar") {
          scene.background = null;
          scene.fog = null;
          house.scale.setScalar(0.1);
          house.position.set(0, 0.75, -0.7);
          rig.position.set(0, 0, 0);
          rig.rotation.set(0, 0, 0);
        }
        session.addEventListener("end", () => {
          xrMode = null;
          scene.background = background;
          scene.fog = new THREE.Fog("#120e1c", 9, 18);
          house.scale.setScalar(1);
          house.position.set(0, 0, 0);
          resize();
        });
      }).catch((error: unknown) => setXrError(error instanceof Error ? error.message : "Couldn't start XR"));
    };

    // VR: point a controller and pull the trigger to walk there or sit down.
    const controllerRay = new THREE.Raycaster();
    const controllers = [0, 1].map((index) => {
      const controller = renderer.xr.getController(index);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -4)]),
        new THREE.LineBasicMaterial({ color: "#ffd27a" }),
      );
      controller.add(line);
      controller.addEventListener("select", () => {
        if (xrMode !== "immersive-vr") return;
        const origin = new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);
        const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(controller.matrixWorld));
        controllerRay.set(origin, direction);
        for (const hit of controllerRay.intersectObjects(house.children, true)) {
          let object: THREE.Object3D | null = hit.object;
          while (object && !object.userData.seat && !object.userData.floor && !object.userData.blahaj) object = object.parent;
          if (!object) continue;
          if (object.userData.blahaj) { squeak(); parts.shark.userData.hop = performance.now(); return; }
          if (object.userData.seat) { live.current.room.sit(object.userData.seat); return; }
          const pose = myPose();
          if (pose) live.current.room.move({ ...stepTo(pose, { x: hit.point.x, z: hit.point.z }), facing: pose.facing });
          return;
        }
      });
      rig.add(controller);
      return controller;
    });

    const clock = new THREE.Clock();
    let lastXrHeading = 0;
    const target = new THREE.Vector3();

    const syncBodies = () => {
      const { room: r, participants: people, speaking: talk } = live.current;
      const seen = new Set<string>();
      for (const person of people) {
        if (person.bot || person.recorder) continue;
        const pose = r.poses.get(person.connectionId);
        if (!pose) continue;
        seen.add(person.connectionId);
        let body = bodies.get(person.connectionId);
        const key = `${person.displayName}|${person.avatarUrl}|${person.color}`;
        if (body && body.key !== key) {
          house.remove(body.group);
          disposeTree(body.group);
          body = undefined;
        }
        if (!body) {
          body = makeBody(person);
          body.shown = { x: pose.x, z: pose.z, facing: pose.facing, lift: 0 };
          bodies.set(person.connectionId, body);
          house.add(body.group);
        }
        const isSelf = person.connectionId === live.current.connectionId;
        const talking = talk.has(isSelf ? "self" : person.connectionId);
        (body.ring.material as THREE.MeshBasicMaterial).opacity += ((talking ? 0.9 : 0) - (body.ring.material as THREE.MeshBasicMaterial).opacity) * 0.25;
        body.mute.visible = person.muted || Boolean(person.serverMuted) || person.deafened;
        // Your own body hides in first person and VR so it never blocks your eyes.
        const firstPerson = isSelf && (live.current.view === "eyes" || xrMode === "immersive-vr");
        body.group.visible = !firstPerson;
        const sitting = Boolean(pose.seat);
        const seatHeight = seatById(pose.seat)?.height ?? 0;
        const s = body.shown;
        s.x += (pose.x - s.x) * 0.18;
        s.z += (pose.z - s.z) * 0.18;
        s.facing += wrapHeading(pose.facing - s.facing) * 0.2;
        s.lift += ((sitting ? seatHeight - 0.3 : 0) - s.lift) * 0.2;
        body.group.position.set(s.x, s.lift, s.z);
        body.group.rotation.y = -s.facing;
        const bob = talking ? Math.sin(clock.elapsedTime * 14) * 0.015 : 0;
        body.head.position.y = 1.18 + bob;
        body.torso.scale.y = sitting ? 0.75 : 1;
      }
      for (const [id, body] of bodies) {
        if (seen.has(id)) continue;
        house.remove(body.group);
        disposeTree(body.group);
        bodies.delete(id);
      }
      // Emote bubbles rise from their sender and fade.
      const now = Date.now();
      const active = new Set<number>();
      for (const emote of r.emotes) {
        const age = (now - emote.at) / 3000;
        if (age >= 1) continue;
        active.add(emote.id);
        let sprite = bubbles.get(emote.id);
        if (!sprite) {
          sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(emote.emoji), transparent: true, depthTest: false }));
          sprite.renderOrder = 11;
          bubbles.set(emote.id, sprite);
          house.add(sprite);
        }
        const body = bodies.get(emote.connectionId);
        const base = body ? body.group.position : new THREE.Vector3();
        sprite.position.set(base.x + Math.sin(emote.id) * 0.15, base.y + 1.6 + age * 0.9, base.z);
        sprite.scale.setScalar(0.35 + Math.min(age * 3, 1) * 0.15);
        sprite.material.opacity = 1 - age ** 3;
      }
      for (const [id, sprite] of bubbles) {
        if (active.has(id)) continue;
        house.remove(sprite);
        sprite.material.map?.dispose();
        sprite.material.dispose();
        bubbles.delete(id);
      }
    };

    const syncTv = () => {
      const stream = live.current.screens[0]?.stream ?? null;
      if (stream === videoStream) return;
      videoStream = stream;
      if (video) { video.pause(); video.srcObject = null; }
      videoTexture?.dispose();
      videoTexture = null;
      if (!stream) {
        parts.screenMaterial.map = null;
        parts.screenMaterial.color.set("#16131f");
        parts.screenMaterial.needsUpdate = true;
        return;
      }
      video = document.createElement("video");
      video.muted = true; // Sound comes through the call, spatialised; this is picture only.
      video.playsInline = true;
      video.srcObject = new MediaStream(stream.getVideoTracks());
      void video.play().catch(() => undefined);
      videoTexture = new THREE.VideoTexture(video);
      videoTexture.colorSpace = THREE.SRGBColorSpace;
      parts.screenMaterial.map = videoTexture;
      parts.screenMaterial.color.set("#ffffff");
      parts.screenMaterial.needsUpdate = true;
    };

    const walk = (dt: number) => {
      const pose = myPose();
      if (!pose) return;
      let facing = pose.facing;
      let forward = 0;
      let strafe = 0;
      if (keys.has("w") || keys.has("arrowup")) forward += 1;
      if (keys.has("s") || keys.has("arrowdown")) forward -= 1;
      if (keys.has("a")) strafe -= 1;
      if (keys.has("d")) strafe += 1;
      if (keys.has("q") || keys.has("arrowleft")) facing -= dt * 2;
      if (keys.has("e") || keys.has("arrowright")) facing += dt * 2;
      // Overhead, keys move relative to the camera, not your body.
      const basis = live.current.view === "overhead" ? -orbit.yaw : facing;
      let next: LoungePose | null = null;
      if (forward || strafe) {
        const step = WALK_SPEED * dt;
        const fx = Math.sin(basis) * forward + Math.cos(basis) * strafe;
        const fz = -Math.cos(basis) * forward + Math.sin(basis) * strafe;
        const to = { x: pose.x + fx * step, z: pose.z + fz * step };
        next = { ...stepTo(pose, to), facing: live.current.view === "overhead" ? headingTo(pose, to) : facing };
      } else if (walkTarget) {
        const dx = walkTarget.x - pose.x;
        const dz = walkTarget.z - pose.z;
        const distance = Math.hypot(dx, dz);
        if (distance < 0.05) walkTarget = null;
        else {
          const step = Math.min(distance, WALK_SPEED * dt);
          const to = { x: pose.x + (dx / distance) * step, z: pose.z + (dz / distance) * step };
          const moved = stepTo(pose, to);
          if (moved.x === pose.x && moved.z === pose.z) walkTarget = null;
          next = { ...moved, facing: headingTo(pose, walkTarget ?? to) };
        }
      } else if (facing !== pose.facing) {
        next = { ...pose, facing: wrapHeading(facing) };
      }
      if (next) moveTo({ ...next, facing: wrapHeading(next.facing) });
    };

    const placeCamera = () => {
      const pose = myPose();
      if (xrMode === "immersive-ar") return;
      if (xrMode === "immersive-vr") {
        if (!pose) return;
        rig.position.set(pose.x, pose.seat ? EYE_SEATED - EYE_STANDING : 0, pose.z);
        // The headset's own turning becomes your heading, so others see where you look.
        const xrCamera = renderer.xr.getCamera();
        const euler = new THREE.Euler().setFromQuaternion(xrCamera.quaternion, "YXZ");
        const heading = wrapHeading(-euler.y);
        if (Math.abs(wrapHeading(heading - lastXrHeading)) > 0.08) {
          lastXrHeading = heading;
          live.current.room.move({ ...pose, facing: heading });
        }
        return;
      }
      rig.position.set(0, 0, 0);
      rig.rotation.set(0, 0, 0);
      if (live.current.view === "eyes" && pose) {
        const eye = pose.seat ? EYE_SEATED : EYE_STANDING;
        const yaw = pose.facing + (live.current.gyro ? -gyroPose.yaw : 0);
        const pitch = live.current.gyro ? gyroPose.pitch : look.pitch;
        camera.position.set(pose.x, eye, pose.z);
        target.set(pose.x + Math.sin(yaw) * Math.cos(pitch), eye + Math.sin(pitch), pose.z - Math.cos(yaw) * Math.cos(pitch));
        camera.lookAt(target);
        return;
      }
      const centre = pose ? new THREE.Vector3(pose.x * 0.35, 0.6, pose.z * 0.35 - 0.2) : new THREE.Vector3(0, 0.6, -0.2);
      const yaw = orbit.yaw + (live.current.gyro ? -gyroPose.yaw : 0);
      camera.position.set(
        centre.x + Math.sin(yaw) * Math.cos(orbit.pitch) * orbit.distance,
        centre.y + Math.sin(orbit.pitch) * orbit.distance,
        centre.z + Math.cos(yaw) * Math.cos(orbit.pitch) * orbit.distance,
      );
      camera.lookAt(centre);
    };

    let skyTick = 0;
    renderer.setAnimationLoop(() => {
      const dt = Math.min(clock.getDelta(), 0.1);
      const t = clock.elapsedTime;
      if (!xrMode || xrMode === "immersive-vr") walk(dt);
      syncBodies();
      syncTv();
      for (const flame of parts.flames) {
        const phase = flame.userData.phase as number;
        flame.scale.y = 0.8 + Math.sin(t * 9 + phase) * 0.15 + Math.sin(t * 23 + phase * 2) * 0.08;
        flame.scale.x = 0.9 + Math.sin(t * 7 + phase) * 0.1;
      }
      parts.fireLight.intensity = 2 + Math.sin(t * 11) * 0.25 + Math.sin(t * 27) * 0.15;
      for (const bulb of parts.fairy) {
        (bulb.material as THREE.MeshBasicMaterial).color.offsetHSL(0, 0, Math.sin(t * 2 + (bulb.userData.phase as number)) * 0.002);
      }
      const hop = parts.shark.userData.hop as number | undefined;
      const since = hop ? (performance.now() - hop) / 1000 : 1;
      parts.shark.position.y = 0.62 + (since < 0.5 ? Math.sin(since * Math.PI * 2) * 0.12 : 0);
      parts.shark.rotation.z = Math.sin(t * 0.8) * 0.03;
      if (t - skyTick > 30) {
        skyTick = t;
        (parts.sky.material as THREE.MeshBasicMaterial).color.copy(skyColour());
        parts.stars.visible = isNight();
      }
      placeCamera();
      renderer.render(scene, camera);
    });

    return () => {
      renderer.setAnimationLoop(null);
      void renderer.xr.getSession()?.end().catch(() => undefined);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("deviceorientation", onOrientation);
      if (video) { video.pause(); video.srcObject = null; }
      videoTexture?.dispose();
      disposeTree(scene);
      renderer.dispose();
      mount.removeChild(canvas);
      xrStart.current = null;
      for (const controller of controllers) rig.remove(controller);
    };
  }, []);

  const toggleGyro = async () => {
    if (gyro) { setGyro(false); return; }
    const ctor = (typeof DeviceOrientationEvent !== "undefined" ? DeviceOrientationEvent : null) as OrientationEventCtor | null;
    if (!ctor) { setXrError("This device has no motion sensor."); return; }
    try {
      if (ctor.requestPermission && (await ctor.requestPermission()) !== "granted") return;
      setGyro(true);
      setView("eyes");
    } catch { setXrError("Motion sensor permission was refused."); }
  };

  const me = connectionId ? room.poses.get(connectionId) : null;
  const seatName = me?.seat ? seatById(me.seat)?.label : null;
  const tvShowing = screens[0]?.name;

  return (
    <div className="living-room" role="region" aria-label="Living room">
      <style>{LIVING_ROOM_CSS}</style>
      <div ref={mountRef} className="living-room-canvas" />
      <div className="living-room-top">
        <div className="living-room-title">
          <Armchair size={16} />
          <span>Living Room</span>
          {seatName && <small>· on the {seatName.toLowerCase()}</small>}
          {tvShowing && <small>· TV: {tvShowing}</small>}
        </div>
        <div className="living-room-tools">
          <button type="button" className={view === "overhead" ? "active" : ""} onClick={() => setView("overhead")} title="Overhead view" aria-label="Overhead view"><MapIcon size={16} /></button>
          <button type="button" className={view === "eyes" ? "active" : ""} onClick={() => setView("eyes")} title="Through your eyes" aria-label="First-person view"><Eye size={16} /></button>
          <button type="button" className={gyro ? "active" : ""} onClick={() => void toggleGyro()} title="Look around by moving your phone" aria-label="Motion look"><Smartphone size={16} /></button>
          <button type="button" className={crackle ? "active" : ""} onClick={() => setCrackle((on) => !on)} title="Fire crackle (only you hear it)" aria-label="Fire sound"><Flame size={16} /></button>
          {xr.vr && <button type="button" onClick={() => xrStart.current?.("immersive-vr")} title="Enter VR" aria-label="Enter VR"><Glasses size={16} /> VR</button>}
          {xr.ar && <button type="button" onClick={() => xrStart.current?.("immersive-ar")} title="Put the room on your table" aria-label="View in AR"><View size={16} /> AR</button>}
          <button type="button" onClick={onClose} title="Back to tiles" aria-label="Close living room"><X size={16} /></button>
        </div>
      </div>
      {(hint || xrError) && (
        <div className="living-room-hint" onClick={() => { setHint(null); setXrError(null); }}>{xrError ?? hint}</div>
      )}
      <div className="living-room-emotes" role="toolbar" aria-label="Emotes">
        {LOUNGE_EMOTES.map((emoji) => (
          <button key={emoji} type="button" onClick={() => room.emote(emoji)} aria-label={`Emote ${emoji}`}>{emoji}</button>
        ))}
        {me?.seat && (
          <button type="button" className="living-room-stand" onClick={() => me && room.move({ ...stepTo(me, { x: me.x, z: me.z - 0.55 }), facing: me.facing })}>Stand up</button>
        )}
      </div>
    </div>
  );
}

const LIVING_ROOM_CSS = `
.voice-stage-bottom-bar { position: relative; z-index: 6; }
.living-room { position: absolute; inset: 0; z-index: 5; background: #120e1c; overflow: hidden; border-radius: inherit; }
.living-room-canvas { position: absolute; inset: 0; touch-action: none; }
.living-room-canvas canvas { width: 100% !important; height: 100% !important; display: block; cursor: pointer; }
.living-room-top { position: absolute; top: 10px; left: 10px; right: 10px; display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; pointer-events: none; }
.living-room-title, .living-room-tools { pointer-events: auto; display: flex; align-items: center; gap: 6px; background: rgba(18, 14, 28, 0.72); backdrop-filter: blur(8px); color: #fff4e3; border: 1px solid rgba(255, 220, 170, 0.18); border-radius: 999px; padding: 6px 12px; font-size: 14px; font-weight: 600; }
.living-room-title small { font-weight: 400; opacity: 0.75; }
.living-room-tools { padding: 4px; }
.living-room-tools button { display: inline-flex; align-items: center; gap: 4px; min-width: 32px; height: 32px; justify-content: center; padding: 0 8px; border-radius: 999px; color: inherit; background: transparent; font-size: 12px; font-weight: 600; }
.living-room-tools button:hover { background: rgba(255, 220, 170, 0.12); }
.living-room-tools button.active { background: #ffd27a; color: #1b1530; }
.living-room-hint { position: absolute; top: 58px; left: 50%; transform: translateX(-50%); max-width: calc(100% - 32px); background: rgba(18, 14, 28, 0.8); color: #fff4e3; padding: 6px 14px; border-radius: 12px; font-size: 13px; cursor: pointer; text-align: center; }
.living-room-emotes { position: absolute; left: 50%; bottom: 84px; transform: translateX(-50%); display: flex; gap: 4px; align-items: center; background: rgba(18, 14, 28, 0.72); backdrop-filter: blur(8px); border: 1px solid rgba(255, 220, 170, 0.18); border-radius: 999px; padding: 4px 6px; max-width: calc(100% - 32px); overflow-x: auto; }
.living-room-emotes button { font-size: 20px; width: 36px; height: 36px; border-radius: 999px; transition: transform 0.12s; flex: none; }
.living-room-emotes button:hover { transform: scale(1.2); background: rgba(255, 220, 170, 0.12); }
.living-room-emotes .living-room-stand { font-size: 12px; width: auto; padding: 0 12px; color: #fff4e3; font-weight: 600; }
.living-room-emotes .living-room-stand:hover { transform: none; }
`;

import * as THREE from "three";
import type { DiceRollEvent } from "@/lib/protocol";

function seeded(seed: string) {
  let value = 2166136261;
  for (const character of seed) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function geometry(sides: number): THREE.BufferGeometry {
  if (sides === 4) return new THREE.TetrahedronGeometry(0.72);
  if (sides === 6) return new THREE.BoxGeometry(1.05, 1.05, 1.05);
  if (sides === 8) return new THREE.OctahedronGeometry(0.75);
  if (sides === 12) return new THREE.DodecahedronGeometry(0.72);
  if (sides === 20) return new THREE.IcosahedronGeometry(0.76);
  if (sides === 10 || sides === 100) {
    return new THREE.CylinderGeometry(0.15, 0.75, 1.15, 10, 1);
  }
  return new THREE.IcosahedronGeometry(0.74, 1);
}

function valueSprite(
  value: string,
  discarded: boolean,
  tone: "normal" | "critical" | "failure" = "normal",
): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext("2d")!;
  context.fillStyle = discarded ? "rgba(28,28,32,.72)" : "rgba(15,12,18,.86)";
  context.beginPath();
  context.roundRect(8, 8, 240, 112, 28);
  context.fill();
  context.strokeStyle = discarded
    ? "#9d9294"
    : tone === "critical"
      ? "#75f0a6"
      : tone === "failure"
        ? "#ff697b"
        : "#ffe2a5";
  context.lineWidth = 6;
  context.stroke();
  context.fillStyle = discarded
    ? "#c0b7b8"
    : tone === "critical"
      ? "#d8ffe7"
      : tone === "failure"
        ? "#ffe1e5"
        : "#fff5db";
  context.font = "800 62px system-ui";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(value, 128, 65);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    }),
  );
  sprite.scale.set(1.15, 0.58, 1);
  return sprite;
}

export interface DiceOverlay {
  canvas: HTMLCanvasElement;
  play: (roll: DiceRollEvent) => void;
  render: (now: number) => boolean;
  dispose: () => void;
}

/** Lazy-loaded Three.js dice layer composited into the production canvas. */
export function createDiceOverlay(width: number, height: number): DiceOverlay {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
  camera.position.set(0, 1.5, 11);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xfff0d1, 0x29182f, 2.6));
  const key = new THREE.DirectionalLight(0xffbd73, 3.5);
  key.position.set(-4, 7, 6);
  scene.add(key);
  const group = new THREE.Group();
  scene.add(group);
  let activeUntil = 0;
  let settleAt = 0;
  let rollSeed = "";

  const clear = () => {
    for (const child of [...group.children]) {
      group.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const material = child.material as THREE.Material;
        material.dispose();
      }
      if (child instanceof THREE.Sprite) {
        const material = child.material as THREE.SpriteMaterial;
        material.map?.dispose();
        material.dispose();
      }
    }
  };

  const play = (roll: DiceRollEvent) => {
    clear();
    rollSeed = roll.animationSeed;
    const random = seeded(roll.animationSeed);
    const visual: Array<{
      sides: number;
      value: string;
      kept: boolean;
      tone: "normal" | "critical" | "failure";
    }> = [];
    for (const term of roll.dice) {
      for (const entry of term.rolls) {
        if (term.sides === 100) {
          const normalized = entry.value === 100 ? 0 : entry.value;
          visual.push({
            sides: 10,
            value: String(Math.floor(normalized / 10) * 10).padStart(2, "0"),
            kept: entry.kept,
            tone: "normal",
          });
          visual.push({
            sides: 10,
            value: String(normalized % 10),
            kept: entry.kept,
            tone: "normal",
          });
        } else {
          visual.push({
            sides: term.sides,
            value: String(entry.value),
            kept: entry.kept,
            tone:
              term.sides === 20 && entry.value === 20
                ? "critical"
                : term.sides === 20 && entry.value === 1
                  ? "failure"
                  : "normal",
          });
        }
      }
    }
    const shown = visual.slice(0, 16);
    shown.forEach((die, index) => {
      const material = new THREE.MeshStandardMaterial({
        color: die.kept ? 0x8f2438 : 0x58525d,
        roughness: 0.36,
        metalness: 0.14,
        transparent: !die.kept,
        opacity: die.kept ? 1 : 0.55,
      });
      const mesh = new THREE.Mesh(geometry(die.sides), material);
      const spacing = Math.min(1.7, 10 / Math.max(1, shown.length));
      mesh.position.set(
        (index - (shown.length - 1) / 2) * spacing,
        (random() - 0.5) * 1.7,
        (random() - 0.5) * 1.4,
      );
      mesh.rotation.set(random() * 5, random() * 5, random() * 5);
      mesh.userData.spin = new THREE.Vector3(
        1.5 + random() * 2.5,
        1.5 + random() * 3,
        1 + random() * 2,
      );
      group.add(mesh);
      const label = valueSprite(die.value, !die.kept, die.tone);
      label.position.copy(mesh.position);
      label.position.z += 1.05;
      label.userData.die = mesh;
      group.add(label);
    });
    const natural = visual.some(
      (die) => die.kept && die.sides === 20 && die.value === "20",
    )
      ? "NAT 20 · "
      : visual.some(
            (die) => die.kept && die.sides === 20 && die.value === "1",
          )
        ? "NAT 1 · "
        : "";
    const total = valueSprite(
      `${natural}${roll.rollType === "advantage" ? "ADV · " : roll.rollType === "disadvantage" ? "DIS · " : roll.rollType === "critical-damage" ? "CRITICAL · " : ""}TOTAL ${roll.total}`,
      false,
      natural === "NAT 20 · "
        ? "critical"
        : natural === "NAT 1 · "
          ? "failure"
          : "normal",
    );
    total.scale.set(4.7, 0.9, 1);
    total.position.set(0, -3.2, 1.8);
    group.add(total);
    settleAt = performance.now() + 1_800;
    activeUntil = performance.now() + 5_500;
  };

  const render = (now: number) => {
    if (now >= activeUntil || !rollSeed) return false;
    const speed = now < settleAt ? 0.018 : 0.0018;
    for (const child of group.children) {
      if (child instanceof THREE.Mesh) {
        const spin = child.userData.spin as THREE.Vector3;
        child.rotation.x += spin.x * speed;
        child.rotation.y += spin.y * speed;
        child.rotation.z += spin.z * speed;
      } else if (child instanceof THREE.Sprite && child.userData.die) {
        child.position.copy((child.userData.die as THREE.Mesh).position);
        child.position.z += 1.05;
      }
    }
    renderer.render(scene, camera);
    return true;
  };

  return {
    canvas: renderer.domElement,
    play,
    render,
    dispose: () => {
      clear();
      renderer.dispose();
    },
  };
}

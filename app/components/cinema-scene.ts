/**
 * The cinema: a tiered hall with 150 seats facing a big screen. The seats are
 * two instanced meshes (all 150 in two draw calls), so a full house costs next
 * to nothing to draw; people are the part that is limited, see living-room.tsx.
 */
import * as THREE from "three";
import type { RoomTheme } from "../hooks/use-living-room";
import { CINEMA, CINEMA_FIRST_ROW_Z, CINEMA_RISE, CINEMA_ROWS, CINEMA_ROW_PITCH } from "../lib/living-room";
import { LOOKS, box, codeRain, glowTexture, mat, wallTexture, type BuiltRoom } from "./living-room-scene";

export function buildCinema(theme: RoomTheme): BuiltRoom {
  const look = LOOKS[theme];
  const root = new THREE.Group();
  const ceiling = new THREE.Group();
  root.add(ceiling);
  const W = CINEMA.halfX * 2;
  const D = CINEMA.halfZ * 2;
  const H = CINEMA.height;
  const dark = (colour: string, by: number) => new THREE.Color(colour).multiplyScalar(by).getStyle();
  const glow = glowTexture();
  const addGlow = (colour: string, size: number, at: THREE.Vector3, opacity = 0.5, parent: THREE.Object3D = root) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: colour, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    sprite.scale.setScalar(size);
    sprite.position.copy(at);
    parent.add(sprite);
    return sprite;
  };

  // Floor: carpet on the stage, then ten steps up to the back walkway.
  const carpet = mat(dark(look.rug[0], 0.5), 1);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), carpet);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.userData.floor = true;
  root.add(floor);
  const stepWidth = W - 0.6;
  const striplight = new THREE.MeshBasicMaterial({ color: look.fairy[0], toneMapped: false });
  for (let row = 1; row < CINEMA_ROWS; row++) {
    const z = CINEMA_FIRST_ROW_Z + row * CINEMA_ROW_PITCH;
    const top = row * CINEMA_RISE;
    const step = box(stepWidth, top, CINEMA_ROW_PITCH, carpet, false);
    step.position.set(0, top / 2, z);
    step.userData.floor = true;
    root.add(step);
    // A thin light along each riser, so the steps read in the dark.
    const strip = new THREE.Mesh(new THREE.BoxGeometry(stepWidth, 0.03, 0.02), striplight);
    strip.position.set(0, top - 0.12, z - CINEMA_ROW_PITCH / 2 + 0.01);
    root.add(strip);
  }
  const backZ = CINEMA_FIRST_ROW_Z + (CINEMA_ROWS - 1) * CINEMA_ROW_PITCH + CINEMA_ROW_PITCH / 2;
  const backTop = (CINEMA_ROWS - 1) * CINEMA_RISE;
  const platform = box(stepWidth, backTop, CINEMA.halfZ - backZ, carpet, false);
  platform.position.set(0, backTop / 2, (backZ + CINEMA.halfZ) / 2);
  platform.userData.floor = true;
  root.add(platform);

  // Walls: dark panelling; the matrix hall has code running down its sides.
  const code = look.wallPattern === "code" ? codeRain(512, 256, 40) : null;
  const wallMaterial = mat("#6a6a6a", 0.95, { map: wallTexture(look), ...(code ? { emissive: "#ffffff", emissiveMap: code.texture, emissiveIntensity: 0.5 } : {}) });
  const walls: Array<[number, number, number, number]> = [
    [W, 0, -CINEMA.halfZ, 0], [W, 0, CINEMA.halfZ, Math.PI], [D, -CINEMA.halfX, 0, Math.PI / 2], [D, CINEMA.halfX, 0, -Math.PI / 2],
  ];
  for (const [width, x, z, ry] of walls) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(width, H), wallMaterial);
    wall.position.set(x, H / 2, z);
    wall.rotation.y = ry;
    wall.receiveShadow = true;
    root.add(wall);
  }
  const ceilingPlane = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat(dark(look.ceiling, 0.5), 1));
  ceilingPlane.rotation.x = Math.PI / 2;
  ceilingPlane.position.y = H;
  ceiling.add(ceilingPlane);

  // The screen, in a frame between two curtains.
  const screenMaterial = new THREE.MeshBasicMaterial({ color: "#0f0c16", toneMapped: false });
  const SW = 8;
  const SH = 4.5;
  const SY = CINEMA.tv.height;
  const frame = box(SW + 0.3, SH + 0.3, 0.12, mat(look.woodDark, 0.5), false);
  frame.position.set(0, SY, -CINEMA.halfZ + 0.08);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), screenMaterial);
  screen.position.set(0, SY, -CINEMA.halfZ + 0.15);
  root.add(frame, screen);
  addGlow("#9fb4ff", 11, new THREE.Vector3(0, SY, -CINEMA.halfZ + 1.2), 0.1);
  const curtain = mat(look.rug[0], 1);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      // Pleats: slim tall boxes, alternately forward.
      const pleat = box(0.4, H - 0.4, 0.2, curtain, false);
      pleat.position.set(side * (SW / 2 + 0.9 + i * 0.38), (H - 0.4) / 2 + 0.2, -CINEMA.halfZ + 0.2 + (i % 2) * 0.12);
      root.add(pleat);
    }
  }
  const stage = box(W - 1.2, 0.25, 1.3, mat(look.woodDark, 0.6), false);
  stage.position.set(0, 0.125, -CINEMA.halfZ + 0.75);
  root.add(stage);

  // Sconces down both side walls.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const z = -5.5 + i * 2.6;
      const y = Math.min(2.7, Math.max(0, (z - CINEMA_FIRST_ROW_Z) / CINEMA_ROW_PITCH * CINEMA_RISE)) + 2.0;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshBasicMaterial({ color: look.lamp, toneMapped: false }));
      lamp.position.set(side * (CINEMA.halfX - 0.25), y, z);
      root.add(lamp);
      addGlow(look.lamp, 1.1, lamp.position, 0.45);
    }
  }

  // Seats: every one of the 150, two draw calls.
  const seats = CINEMA.seats;
  const base = new THREE.InstancedMesh(new THREE.BoxGeometry(0.58, 0.14, 0.52), mat(dark(look.rug[0], 1.15), 0.9), seats.length);
  const back = new THREE.InstancedMesh(new THREE.BoxGeometry(0.58, 0.74, 0.1), mat(dark(look.rug[0], 0.8), 0.9), seats.length);
  const place = new THREE.Matrix4();
  seats.forEach((seat, i) => {
    place.makeTranslation(seat.x, (seat.y ?? 0) + 0.38, seat.z);
    base.setMatrixAt(i, place);
    place.makeTranslation(seat.x, (seat.y ?? 0) + 0.72, seat.z + 0.28);
    back.setMatrixAt(i, place);
  });
  for (const mesh of [base, back]) {
    mesh.userData.seatIds = seats.map((seat) => seat.id);
    mesh.castShadow = false;
    mesh.computeBoundingSphere();
    root.add(mesh);
  }

  // Row numbers at both ends of every row, so friends can say "row 4".
  for (let row = 0; row < CINEMA_ROWS; row++) {
    const canvas = document.createElement("canvas");
    canvas.width = 128; canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(20,12,16,0.7)"; ctx.beginPath(); ctx.roundRect(0, 0, 128, 64, 24); ctx.fill();
    ctx.fillStyle = "#fff4e3"; ctx.font = "700 36px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(`Row ${row + 1}`, 64, 34);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    for (const side of [-1, 1]) {
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
      tag.scale.set(0.5, 0.25, 1);
      tag.position.set(side * (CINEMA.halfX - 0.5), row * CINEMA_RISE + 0.75, CINEMA_FIRST_ROW_Z + row * CINEMA_ROW_PITCH);
      root.add(tag);
    }
  }

  // Projector booth on the back wall.
  const booth = box(0.7, 0.5, 0.9, mat("#222", 0.6), false);
  booth.position.set(0, backTop + 2.9, CINEMA.halfZ - 0.6);
  ceiling.add(booth);
  addGlow("#bcd0ff", 0.8, new THREE.Vector3(0, backTop + 2.9, CINEMA.halfZ - 1.1), 0.5, ceiling);

  // Light: a soft wash, a warm pool over the stage and a cool one from the screen.
  root.add(new THREE.HemisphereLight(look.hemi[0], look.hemi[1], look.hemi[2] * 1.5));
  const stageLight = new THREE.PointLight(look.lamp, 14, 14, 1.6);
  stageLight.position.set(0, 4.5, -5.5);
  const hallLight = new THREE.PointLight(look.fireLight, 10, 16, 1.6);
  hallLight.position.set(0, 5.2, 1);
  const backLight = new THREE.PointLight(look.lamp, 8, 12, 1.6);
  backLight.position.set(0, backTop + 4.5, 6);
  root.add(stageLight, hallLight, backLight);

  let codeNext = 0;
  const update = (t: number) => {
    if (code && t > codeNext) { codeNext = t + 0.08; code.step(); }
  };

  return {
    root,
    ceiling,
    screenMaterial,
    background: new THREE.Color(look.background),
    fog: new THREE.Fog(look.fog, 16, 34),
    exposure: look.exposure,
    update,
    dispose: () => glow.dispose(),
  };
}

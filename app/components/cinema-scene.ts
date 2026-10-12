/**
 * The cinema: a tiered hall with 150 seats facing a big screen. The seats are
 * two instanced meshes (all 150 in two draw calls), so a full house costs next
 * to nothing to draw; people are the part that is limited, see living-room.tsx.
 * Enhanced: better materials, atmospheric lighting, curtain details, projector booth,
 * aisle lighting, emergency exit signs, acoustic panels, side wall sconces, carpet pattern.
 * Light level controllable (0-100%), auto-dims when video plays.
 */
import "../lib/canvas-polyfill";
import * as THREE from "three";
import type { RoomTheme } from "../hooks/use-living-room";
import { CINEMA, CINEMA_FIRST_ROW_Z, CINEMA_RISE, CINEMA_ROWS, CINEMA_ROW_PITCH } from "../lib/living-room";
import { buildBooth } from "./cinema-booth";
import { LOOKS, box, canvasTexture, codeRain, glowTexture, mat, wallTexture, type BuiltRoom } from "./living-room-scene";

export interface CinemaLights {
  /** 0..1 overall brightness */
  level: number;
  /** Auto-dim when screen is active */
  autoDim: boolean;
  /** Current screen state (set by living-room) */
  screenActive: boolean;
  /** Set light level (0..1) */
  setLevel: (level: number) => void;
  /** Toggle auto-dim */
  setAutoDim: (on: boolean) => void;
  /** Notify screen started/stopped */
  setScreenActive: (active: boolean) => void;
  /** Update call - call each frame */
  update: (t: number) => void;
}

function createCinemaLights(
  root: THREE.Object3D,
  ceiling: THREE.Group,
  look: (typeof LOOKS)[RoomTheme],
  H: number,
  W: number,
  D: number,
  backTop: number,
  sconceMats: THREE.MeshStandardMaterial[] = [],
  sconceLamps: THREE.MeshBasicMaterial[] = [],
  glowSprites: THREE.Sprite[] = [],
  stripMat?: THREE.MeshBasicMaterial,
): CinemaLights {
  const lights: THREE.Light[] = [];
  let level = 1;
  let autoDim = true;
  let screenActive = false;
  let targetLevel = 1;
  let transitionSpeed = 2.5; // per second

  const hemi = new THREE.HemisphereLight(look.hemi[0], look.hemi[1], look.hemi[2] * 1.5);
  root.add(hemi);
  lights.push(hemi);

  const stageLight = new THREE.PointLight(look.lamp, 18, 14, 1.6);
  stageLight.position.set(0, 4.5, -5.5);
  stageLight.castShadow = true;
  stageLight.shadow.mapSize.set(1024, 1024);
  stageLight.shadow.bias = 0.0005;
  stageLight.shadow.normalBias = 0;
  stageLight.shadow.radius = 1;
  root.add(stageLight);
  lights.push(stageLight);

  const hallLight = new THREE.PointLight(look.fireLight, 12, 16, 1.6);
  hallLight.position.set(0, 5.2, 1);
  root.add(hallLight);
  lights.push(hallLight);

  const backLight = new THREE.PointLight(look.lamp, 10, 12, 1.6);
  backLight.position.set(0, backTop + 4.5, 6);
  root.add(backLight);
  lights.push(backLight);

  const screenWash = new THREE.SpotLight("#9fb4ff", 20, 20, Math.PI / 6, 0.5, 1);
  screenWash.position.set(0, CINEMA.tv.height + 1, -CINEMA.halfZ + 0.5);
  screenWash.target.position.set(0, CINEMA.tv.height, -CINEMA.halfZ + 2);
  root.add(screenWash, screenWash.target);
  lights.push(screenWash);

  // Sconce lights
  const sconceLights: THREE.PointLight[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const z = -6.0 + i * 2.2;
      const y = Math.min(2.7, Math.max(0, (z - CINEMA_FIRST_ROW_Z) / CINEMA_ROW_PITCH * CINEMA_RISE)) + 2.0;
      const sl = new THREE.PointLight(look.lamp, 3, 5, 1.5);
      sl.position.set(side * (CINEMA.halfX - 0.2), y + 0.35, z);
      root.add(sl);
      sconceLights.push(sl);
      lights.push(sl);
    }
  }

  // Recessed ceiling lights
  const ceilingLights: THREE.PointLight[] = [];
  for (let x = -W/2 + 1.5; x < W/2; x += 3) {
    for (let z = -D/2 + 1.5; z < D/2; z += 4) {
      const cl = new THREE.PointLight("#fff8e8", 2, 4, 1.5);
      cl.position.set(x, H - 0.2, z);
      ceiling.add(cl);
      ceilingLights.push(cl);
      lights.push(cl);
    }
  }

  function applyLevel(l: number) {
    level = l;
    const baseHemi = look.hemi[2] * 1.5;
    hemi.intensity = baseHemi * l;
    stageLight.intensity = 18 * l;
    hallLight.intensity = 12 * l;
    backLight.intensity = 10 * l;
    screenWash.intensity = screenActive ? 0 : 20 * l; // screen wash off when video plays
    for (const sl of sconceLights) sl.intensity = 3 * l;
    for (const cl of ceilingLights) cl.intensity = 2 * l;
    for (const sm of sconceMats) sm.emissiveIntensity = 0.5 * l;
    for (const slm of sconceLamps) {
      slm.transparent = true;
      slm.opacity = l;
    }
    for (const sp of glowSprites) {
      const baseOp = (sp.userData.baseOpacity as number) || 0.45;
      sp.material.opacity = baseOp * l;
    }
    if (stripMat) {
      stripMat.transparent = true;
      stripMat.opacity = Math.max(0.02, 0.9 * l);
    }
  }

  applyLevel(1);

  return {
    get level() { return level; },
    get autoDim() { return autoDim; },
    get screenActive() { return screenActive; },
    setLevel(l: number) { targetLevel = Math.max(0, Math.min(1, l)); },
    setAutoDim(on: boolean) { autoDim = on; },
    setScreenActive(active: boolean) {
      screenActive = active;
      if (autoDim) {
        // When movie/video starts, turn off all cinema lights completely (0)
        targetLevel = active ? 0 : 1;
      }
      screenWash.intensity = active ? 0 : 20 * level;
    },
    update(dt: number) {
      if (Math.abs(level - targetLevel) > 0.001) {
        level += (targetLevel - level) * Math.min(1, dt * transitionSpeed);
        applyLevel(level);
      }
    },
  };
}

export function buildCinema(theme: RoomTheme): BuiltRoom & { cinemaLights: CinemaLights } {
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

  // Floor: carpet with pattern on the stage, then ten steps up to the back walkway
  const carpetTex = canvasTexture(512, 512, (ctx) => {
    const base = dark(look.rug[0], 0.6);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 512, 512);
    // Subtle pattern
    ctx.fillStyle = dark(look.rug[0], 0.75);
    for (let y = 0; y < 512; y += 64) {
      for (let x = 0; x < 512; x += 64) {
        ctx.beginPath();
        ctx.arc(x + 32, y + 32, 12, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Aisle runners
    ctx.fillStyle = dark(look.rug[0], 0.5);
    ctx.fillRect(240, 0, 32, 512);
    ctx.fillRect(512 - 272, 0, 32, 512);
  }, [W / 3, D / 3]);
  
  const carpet = mat("#ffffff", 1, { map: carpetTex });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), carpet);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.userData.floor = true;
  root.add(floor);

  const stepWidth = W - 0.6;
  const striplight = new THREE.MeshBasicMaterial({ color: look.fairy[0], toneMapped: false });
  const stepMat = mat(dark(look.rug[0], 0.7), 1, { map: carpetTex });
  for (let row = 1; row < CINEMA_ROWS; row++) {
    const z = CINEMA_FIRST_ROW_Z + row * CINEMA_ROW_PITCH;
    const top = row * CINEMA_RISE;
    const step = box(stepWidth, top, CINEMA_ROW_PITCH, stepMat, false);
    step.position.set(0, top / 2, z);
    step.userData.floor = true;
    root.add(step);
    // A thin light along each riser, so the steps read in the dark
    const strip = new THREE.Mesh(new THREE.BoxGeometry(stepWidth, 0.03, 0.02), striplight);
    strip.position.set(0, top - 0.12, z - CINEMA_ROW_PITCH / 2 + 0.01);
    root.add(strip);
    // Step edge glow
    addGlow(look.fairy[0], 0.15, new THREE.Vector3(0, top - 0.05, z - CINEMA_ROW_PITCH / 2), 0.3);
  }
  const backZ = CINEMA_FIRST_ROW_Z + (CINEMA_ROWS - 1) * CINEMA_ROW_PITCH + CINEMA_ROW_PITCH / 2;
  const backTop = (CINEMA_ROWS - 1) * CINEMA_RISE;
  const platform = box(stepWidth, backTop, CINEMA.halfZ - backZ, stepMat, false);
  platform.position.set(0, backTop / 2, (backZ + CINEMA.halfZ) / 2);
  platform.userData.floor = true;
  root.add(platform);

  // Aisle carpet runners
  const aisleMat = mat(dark(look.rug[1], 0.5), 1);
  const aisle1 = new THREE.Mesh(new THREE.PlaneGeometry(1.2, D), aisleMat);
  aisle1.rotation.x = -Math.PI / 2;
  aisle1.position.set(-W / 4, 0.01, 0);
  aisle1.userData.floor = true;
  root.add(aisle1);
  const aisle2 = aisle1.clone();
  aisle2.position.set(W / 4, 0.01, 0);
  root.add(aisle2);

  // Walls: dark panelling; the matrix hall has code running down its sides
  const code = look.wallPattern === "code" ? codeRain(512, 256, 40) : null;
  const wallMaterial = mat("#ffffff", 0.95, { map: wallTexture(look), ...(code ? { emissive: "#ffffff", emissiveMap: code.texture, emissiveIntensity: 0.5 } : {}) });
  const walls: Array<[number, number, number, number]> = [
    [W, 0, -CINEMA.halfZ, 0], [W, 0, CINEMA.halfZ, Math.PI], [D, -CINEMA.halfX, 0, Math.PI / 2], [D, CINEMA.halfX, 0, -Math.PI / 2],
  ];
  for (const [width, x, z, ry] of walls) {
    if (z === CINEMA.halfZ) continue; // the back wall is the booth's: it has a door and windows cut out of it
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(width, H), wallMaterial);
    wall.position.set(x, H / 2, z);
    wall.rotation.y = ry;
    wall.receiveShadow = true;
    root.add(wall);
    // Acoustic panels on side walls
    if (Math.abs(ry) === Math.PI / 2) {
      const panelMat = mat(dark(look.rug[0], 0.4), 0.9);
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 4; col++) {
          const panel = box(2.0, 1.5, 0.08, panelMat, false);
          panel.position.set(x + Math.sign(x) * 0.06, 2.0 + row * 2.5, -width/2 + 1.5 + col * (width/4));
          panel.rotation.y = ry;
          root.add(panel);
        }
      }
    }
  }
  // Ceiling with recessed lighting
  const ceilingPlane = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat(dark(look.ceiling, 0.3), 1));
  ceilingPlane.rotation.x = Math.PI / 2;
  ceilingPlane.position.y = H;
  ceiling.add(ceilingPlane);

  // The screen, in a frame between two curtains
  const screenMaterial = new THREE.MeshBasicMaterial({ color: "#0f0c16", toneMapped: false });
  const SW = 8;
  const SH = 4.5;
  const SY = CINEMA.tv.height;
  const frame = box(SW + 0.3, SH + 0.3, 0.12, mat(look.woodDark, 0.5), false);
  frame.position.set(0, SY, -CINEMA.halfZ + 0.08);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), screenMaterial);
  screen.position.set(0, SY, -CINEMA.halfZ + 0.15);
  root.add(frame, screen);
  // The screen's soft spill, as a flat panel on the wall: a camera-facing sprite floating in the hall gets sliced
  // by the speakers and curtains when seen from a side seat, leaving a hard-edged dark wedge across the screen.
  const spill = new THREE.Mesh(
    new THREE.PlaneGeometry(SW * 1.45, SH * 1.6),
    new THREE.MeshBasicMaterial({ map: glow, color: "#9fb4ff", transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  spill.position.set(0, SY, -CINEMA.halfZ + 0.16);
  root.add(spill);

  // Curtains with pleats and tiebacks
  const curtain = mat(look.rug[0], 1);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const pleat = box(0.35, H - 0.4, 0.18, curtain, false);
      pleat.position.set(side * (SW / 2 + 0.6 + i * 0.4), (H - 0.4) / 2 + 0.2, -CINEMA.halfZ + 0.2 + (i % 2) * 0.1);
      root.add(pleat);
    }
    // Tieback
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 8, 16), mat("#c9a45c", 0.5, { metalness: 0.8 }));
    tie.position.set(side * (SW / 2 + 1.5), 1.5, -CINEMA.halfZ + 0.3);
    tie.rotation.x = Math.PI / 2;
    root.add(tie);
  }

  // Stage with steps
  const stage = box(W - 1.2, 0.25, 1.3, mat(look.woodDark, 0.6), false);
  stage.position.set(0, 0.125, -CINEMA.halfZ + 0.75);
  root.add(stage);
  // Stage steps
  for (const side of [-1, 1]) {
    const step = box(1.0, 0.2, 0.6, mat(look.woodDark, 0.6), false);
    step.position.set(side * (W/2 - 1.0), 0.1, -CINEMA.halfZ + 0.4);
    root.add(step);
  }

  // Sconces down both side walls - more elaborate
  const sconceMats: THREE.MeshStandardMaterial[] = [];
  const sconceLamps: THREE.MeshBasicMaterial[] = [];
  const cinemaGlows: THREE.Sprite[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const z = -6.0 + i * 2.2;
      const y = Math.min(2.7, Math.max(0, (z - CINEMA_FIRST_ROW_Z) / CINEMA_ROW_PITCH * CINEMA_RISE)) + 2.0;
      // Sconce base
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.2, 8), mat(look.woodDark, 0.6));
      base.position.set(side * (CINEMA.halfX - 0.2), y, z);
      root.add(base);
      // Lamp shade
      const shadeMat = new THREE.MeshStandardMaterial({ color: look.lamp, emissive: look.lamp, emissiveIntensity: 0.5, side: THREE.DoubleSide, roughness: 0.6 });
      sconceMats.push(shadeMat);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.25, 16, 1, true), shadeMat);
      shade.position.set(side * (CINEMA.halfX - 0.2), y + 0.25, z);
      root.add(shade);
      const lampMat = new THREE.MeshBasicMaterial({ color: look.lamp, toneMapped: false });
      sconceLamps.push(lampMat);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), lampMat);
      lamp.position.set(side * (CINEMA.halfX - 0.2), y + 0.35, z);
      root.add(lamp);
      const sg = addGlow(look.lamp, 1.1, new THREE.Vector3(side * (CINEMA.halfX - 0.2), y + 0.4, z), 0.45);
      cinemaGlows.push(sg);
    }
  }

  // Seats: every one of the 150, two draw calls (base + back)
  const seats = CINEMA.seats;
  const seatBaseMat = mat(dark(look.rug[0], 1.15), 0.9);
  const seatBackMat = mat(dark(look.rug[0], 0.8), 0.9);
  const base = new THREE.InstancedMesh(new THREE.BoxGeometry(0.58, 0.14, 0.52), seatBaseMat, seats.length);
  const back = new THREE.InstancedMesh(new THREE.BoxGeometry(0.58, 0.74, 0.1), seatBackMat, seats.length);
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

  // Armrests between seats (instanced)
  const armrestMat = mat(dark(look.woodDark, 0.8), 0.8);
  const armrestGeom = new THREE.BoxGeometry(0.06, 0.12, 0.45);
  const seatsPerRow = 15;
  const armrestCount = seats.length - seatsPerRow; // No armrest at row ends
  const armrests = new THREE.InstancedMesh(armrestGeom, armrestMat, armrestCount);
  let armIdx = 0;
  for (let row = 0; row < CINEMA_ROWS; row++) {
    const rowSeats = seats.slice(row * seatsPerRow, (row + 1) * seatsPerRow);
    for (let i = 0; i < rowSeats.length - 1; i++) {
      const s1 = rowSeats[i];
      const s2 = rowSeats[i + 1];
      const midX = (s1.x + s2.x) / 2;
      const midY = ((s1.y ?? 0) + (s2.y ?? 0)) / 2 + 0.42;
      const midZ = (s1.z + s2.z) / 2;
      place.makeTranslation(midX, midY, midZ);
      armrests.setMatrixAt(armIdx++, place);
    }
  }
  armrests.computeBoundingSphere();
  root.add(armrests);

  // Row numbers at both ends of every row
  for (let row = 0; row < CINEMA_ROWS; row++) {
    const canvas = document.createElement("canvas");
    canvas.width = 128; canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(20,12,16,0.7)"; ctx.beginPath(); ctx.roundRect(0, 0, 128, 64, 24); ctx.fill();
    ctx.fillStyle = "#fff4e3"; ctx.font = "700 36px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("Row " + (row + 1), 64, 34);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    for (const side of [-1, 1]) {
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
      tag.scale.set(0.5, 0.25, 1);
      tag.position.set(side * (CINEMA.halfX - 0.5), row * CINEMA_RISE + 0.75, CINEMA_FIRST_ROW_Z + row * CINEMA_ROW_PITCH);
      root.add(tag);
    }
  }

  // Emergency exit signs
  const exitMat = new THREE.MeshBasicMaterial({ color: "#ff3333", toneMapped: false, transparent: true, opacity: 0.9 });
  for (const side of [-1, 1]) {
    for (const z of [-CINEMA.halfZ + 1, backZ - 1]) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.4), exitMat);
      sign.position.set(side * (CINEMA.halfX - 0.3), 2.2, z);
      sign.rotation.y = side === -1 ? -Math.PI / 2 : Math.PI / 2;
      root.add(sign);
      addGlow("#ff3333", 0.6, new THREE.Vector3(side * (CINEMA.halfX - 0.5), 2.2, z), 0.4);
    }
  }

  // Sound system speakers on stage left/right
  for (const side of [-1, 1]) {
    const speaker = box(0.8, 1.8, 0.5, mat("#1a1a1a", 0.3), false);
    speaker.position.set(side * (W/2 - 1.0), 1.0, -CINEMA.halfZ + 1.5);
    root.add(speaker);
    // Speaker cones
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(new THREE.CircleGeometry(0.25 - i * 0.05, 32), new THREE.MeshBasicMaterial({ color: "#333", toneMapped: false }));
      cone.position.set(side * (W/2 - 1.05), 0.5 + i * 0.5, -CINEMA.halfZ + 1.55);
      root.add(cone);
    }
  }

  // Subwoofer
  const sub = box(1.2, 0.6, 1.2, mat("#111", 0.3), false);
  sub.position.set(0, 0.3, -CINEMA.halfZ + 0.5);
  root.add(sub);

  // Create controllable lights
  const cinemaLights = createCinemaLights(root, ceiling, look, H, W, D, backTop, sconceMats, sconceLamps, cinemaGlows, striplight);

  // The projection booth behind the back wall, which runs whenever the screen is playing something.
  const booth = buildBooth({ root, ceiling, look, floorY: backTop, hallHeight: H, screen: { y: SY, width: SW, material: screenMaterial }, wallMaterial, glow });
  const setScreenActive = cinemaLights.setScreenActive;
  cinemaLights.setScreenActive = (active: boolean) => { setScreenActive(active); booth.setLive(active); };

  let codeNext = 0;
  const update = (t: number, dt: number = 1/60) => {
    if (code && t > codeNext) { codeNext = t + 0.08; code.step(); }
    cinemaLights.update(dt);
    booth.update(t, dt);
  };

  return {
    root,
    ceiling,
    screenMaterial,
    background: new THREE.Color(look.background),
    fog: new THREE.Fog(look.fog, 16, 34),
    exposure: look.exposure,
    update,
    dispose: () => { glow.dispose(); booth.dispose(); },
    cinemaLights,
  };
}
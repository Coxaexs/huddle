/**
 * Looks and speed for the Living Room: merging the furniture that never moves
 * into a few meshes, dust drifting in the light, the shaft of light through
 * the window, soft contact shadows under the furniture, and a reflection probe
 * that lets the room's own colours bounce off its surfaces.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/* ---------- merging what never moves ---------- */

function materialKey(material: THREE.MeshStandardMaterial): string | null {
  if (!material.isMeshStandardMaterial || material.transparent || !material.visible || material.wireframe) return null;
  const tex = (t: THREE.Texture | null) => (t ? t.uuid : "-");
  return [
    material.type, material.color.getHexString(), material.roughness, material.metalness,
    material.emissive.getHexString(), material.emissiveIntensity, tex(material.map), tex(material.emissiveMap),
    tex(material.alphaMap), material.side, material.flatShading, material.vertexColors, material.userData.surface ?? "",
    (material as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial ? `phys:${(material as THREE.MeshPhysicalMaterial).sheen}:${(material as THREE.MeshPhysicalMaterial).sheenColor.getHexString()}` : "",
  ].join("|");
}

/**
 * Bakes every untagged, opaque, standard-material mesh under `root` into one
 * mesh per look (colour, roughness, texture...). A room of 600 boxes draws in
 * a few dozen calls, and each shadow map pass gets as cheap. Anything carrying
 * userData (seats, things you can touch, animated parts) is left alone, as are
 * meshes under a group that does. `buckets` are groups whose meshes must stay
 * in them (the ceiling, hidden from overhead).
 */
export function mergeStatics(root: THREE.Object3D, buckets: THREE.Object3D[] = []): { before: number; after: number } {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const relative = new THREE.Matrix4();
  const sets = new Map<string, { material: THREE.Material; bucket: THREE.Object3D; cast: boolean; receive: boolean; parts: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }>();
  let before = 0;
  const visit = (object: THREE.Object3D, bucket: THREE.Object3D) => {
    for (const child of object.children) {
      if (Object.keys(child.userData).length) continue;
      const into = buckets.includes(child) ? child : bucket;
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh && !Array.isArray(mesh.material) && !mesh.morphTargetInfluences) {
        before++;
        const key = materialKey(mesh.material as THREE.MeshStandardMaterial);
        const geometry = mesh.geometry;
        relative.multiplyMatrices(inverse, mesh.matrixWorld);
        // A mirrored mesh would turn inside out once its winding is baked in.
        if (key && geometry.attributes.position && geometry.attributes.normal && geometry.attributes.uv && relative.determinant() > 0) {
          const id = `${into.uuid}|${mesh.castShadow}|${mesh.receiveShadow}|${key}`;
          let set = sets.get(id);
          if (!set) sets.set(id, (set = { material: mesh.material as THREE.Material, bucket: into, cast: mesh.castShadow, receive: mesh.receiveShadow, parts: [], meshes: [] }));
          let part = geometry.index ? geometry.toNonIndexed() : geometry.clone();
          for (const name of Object.keys(part.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") part.deleteAttribute(name);
          part.clearGroups();
          part = part.applyMatrix4(relative);
          set.parts.push(part);
          set.meshes.push(mesh);
        }
      }
      if (child.children.length) visit(child, into);
    }
  };
  visit(root, root);
  let after = before;
  const bucketInverse = new THREE.Matrix4();
  for (const set of sets.values()) {
    if (set.meshes.length < 2) continue;
    const merged = mergeGeometries(set.parts, false);
    if (!merged) continue;
    // The parts are in root space; a bucket below root needs its own.
    if (set.bucket !== root) {
      bucketInverse.multiplyMatrices(inverse, set.bucket.matrixWorld).invert();
      merged.applyMatrix4(bucketInverse);
    }
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, set.material);
    mesh.castShadow = set.cast;
    mesh.receiveShadow = set.receive;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    for (const old of set.meshes) {
      old.removeFromParent();
      old.geometry.dispose();
    }
    for (const part of set.parts) part.dispose();
    set.bucket.add(mesh);
    after -= set.meshes.length - 1;
  }
  // Groups the merge emptied.
  const empties: THREE.Object3D[] = [];
  root.traverse((object) => { if (object !== root && !buckets.includes(object) && (object as THREE.Group).isGroup && !object.children.length && !Object.keys(object.userData).length) empties.push(object); });
  for (const empty of empties) empty.removeFromParent();
  return { before, after };
}

/* ---------- dust in the light ---------- */

/** Boxes (min, max) where dust drifts, and how many motes each holds. */
export type MoteCloud = { min: [number, number, number]; max: [number, number, number]; count: number };

/** Dust motes drifting in the light: one draw call, moved on the GPU. */
export function moteField(clouds: MoteCloud[], colour: string, seed = 1) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const total = clouds.reduce((sum, c) => sum + c.count, 0);
  const positions = new Float32Array(total * 3);
  const seeds = new Float32Array(total);
  let i = 0;
  for (const cloud of clouds) {
    for (let n = 0; n < cloud.count; n++, i++) {
      for (let axis = 0; axis < 3; axis++) positions[i * 3 + axis] = cloud.min[axis] + rand() * (cloud.max[axis] - cloud.min[axis]);
      seeds[i] = rand();
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("seed", new THREE.BufferAttribute(seeds, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 400 }, uColour: { value: new THREE.Color(colour) }, uOpacity: { value: 0.6 } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uScale;
      attribute float seed;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * 0.11 + seed * 31.0) * 0.22;
        p.y += sin(uTime * 0.07 + seed * 17.0) * 0.16 + sin(uTime * 0.31 + seed * 9.0) * 0.03;
        p.z += cos(uTime * 0.09 + seed * 23.0) * 0.22;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = 0.007 + 0.009 * fract(seed * 7.13);
        gl_PointSize = max(1.0, size * uScale / -mv.z);
        // Twinkling as they turn in the light; gone right in front of the eye.
        vAlpha = (0.45 + 0.55 * sin(uTime * (0.6 + seed) + seed * 40.0)) * smoothstep(0.25, 0.9, -mv.z);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColour;
      uniform float uOpacity;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vAlpha * uOpacity;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColour, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.raycast = () => undefined;
  const size = new THREE.Vector2();
  points.onBeforeRender = (renderer) => {
    renderer.getDrawingBufferSize(size);
    material.uniforms.uScale.value = size.y / 2;
  };
  return { points, update: (t: number) => { material.uniforms.uTime.value = t; }, material };
}

/* ---------- light through the window ---------- */

/**
 * A shaft of light through a window: the window's rectangle swept along the
 * light's direction, brightest at the glass and where it is seen face on, so
 * its edges stay soft. `corners` are the window's four corners in order.
 */
export function lightShaft(corners: THREE.Vector3[], direction: THREE.Vector3, length: number, colour: string, opacity: number) {
  const far = corners.map((c) => c.clone().addScaledVector(direction, length));
  const positions: number[] = [];
  const along: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    const c = far[(i + 1) % 4];
    const d = far[i];
    for (const [p, k] of [[a, 0], [b, 0], [c, 1], [a, 0], [c, 1], [d, 1]] as const) {
      positions.push(p.x, p.y, p.z);
      along.push(k);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("along", new THREE.Float32BufferAttribute(along, 1));
  geometry.computeVertexNormals();
  const material = new THREE.ShaderMaterial({
    uniforms: { uColour: { value: new THREE.Color(colour) }, uOpacity: { value: opacity }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float along;
      varying float vAlong;
      varying float vFacing;
      varying vec3 vWorld;
      void main() {
        vAlong = along;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vec3 n = normalize(mat3(modelMatrix) * normal);
        vFacing = abs(dot(n, normalize(cameraPosition - world.xyz)));
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColour;
      uniform float uOpacity;
      uniform float uTime;
      varying float vAlong;
      varying float vFacing;
      varying vec3 vWorld;
      void main() {
        float fade = pow(1.0 - vAlong, 1.6) * smoothstep(0.0, 0.08, vAlong + 0.02);
        // Faint streaks, slowly shifting, like light through old glass.
        float streak = 0.82 + 0.18 * sin(vWorld.z * 7.0 + vWorld.y * 3.0 + uTime * 0.25);
        float a = uOpacity * fade * pow(vFacing, 1.5) * streak;
        gl_FragColor = vec4(uColour, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 3;
  mesh.raycast = () => undefined;
  return { mesh, material };
}

/* ---------- soft shadows under the furniture ---------- */

function shadowTexture(round: boolean) {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = Math.abs((x + 0.5) / size * 2 - 1);
      const v = Math.abs((y + 0.5) / size * 2 - 1);
      // A rounded square for sofas and tables, a circle for poufs.
      const d = round ? Math.hypot(u, v) : Math.pow(u ** 5 + v ** 5, 1 / 5);
      const a = Math.max(0, Math.min(1, (1 - d) / 0.45));
      const level = Math.round(a * a * (3 - 2 * a) * 255);
      const i = (y * size + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = level;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

/** A soft dark patch on the floor: x, z, width, depth, turn (radians), round. */
export type Contact = [number, number, number, number, number, boolean];

/** The darkening where furniture meets the floor (ambient occlusion, faked): two draw calls for the lot. */
export function contactShadows(spots: Contact[], y: number, strength: number): THREE.Group {
  const group = new THREE.Group();
  for (const round of [false, true]) {
    const mine = spots.filter((spot) => spot[5] === round);
    if (!mine.length) continue;
    const quads = mine.map(([x, z, w, d, turn]) => {
      const quad = new THREE.PlaneGeometry(w, d);
      quad.rotateX(-Math.PI / 2);
      quad.rotateY(turn);
      quad.translate(x, y, z);
      return quad;
    });
    const geometry = mergeGeometries(quads, false)!;
    for (const quad of quads) quad.dispose();
    const material = new THREE.MeshBasicMaterial({ color: "#000000", alphaMap: shadowTexture(round), transparent: true, opacity: strength, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 1;
    mesh.raycast = () => undefined;
    group.add(mesh);
  }
  return group;
}

/* ---------- light bouncing round the room ---------- */

/**
 * A reflection probe: the room photographed from its middle into a cube, then
 * blurred into an environment map, so every surface picks up a little of the
 * fire's orange and the walls' colour. Taken again whenever the lights change.
 */
export class RoomProbe {
  private cube = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType, generateMipmaps: false });
  private camera: THREE.CubeCamera;
  private pmrem: THREE.PMREMGenerator;
  private env: THREE.WebGLRenderTarget | null = null;
  private due = 0;

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, at: THREE.Vector3, private intensity: number) {
    this.camera = new THREE.CubeCamera(0.05, 30, this.cube);
    this.camera.position.copy(at);
    this.pmrem = new THREE.PMREMGenerator(renderer);
  }

  /** Takes the picture in `ms` (or sooner if one is already due sooner). */
  request(ms: number) {
    const at = performance.now() + ms;
    if (!this.due || at < this.due) this.due = at;
  }

  /** Call once a frame with what should not be in the picture (people, their names); takes it when due. */
  tick(hide: () => THREE.Object3D[]) {
    if (!this.due || performance.now() < this.due) return false;
    this.due = 0;
    const shown = hide().filter((object) => object.visible);
    for (const object of shown) object.visible = false;
    this.scene.environment = null;
    this.camera.update(this.renderer, this.scene);
    for (const object of shown) object.visible = true;
    const next = this.pmrem.fromCubemap(this.cube.texture);
    this.env?.dispose();
    this.env = next;
    this.scene.environment = next.texture;
    this.scene.environmentIntensity = this.intensity;
    return true;
  }

  dispose() {
    if (this.env && this.scene.environment === this.env.texture) this.scene.environment = null;
    this.env?.dispose();
    this.cube.dispose();
    this.pmrem.dispose();
  }
}

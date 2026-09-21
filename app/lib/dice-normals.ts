import normalsData from "@/public/assets/themes/default/default.json";

export type DieType = "d4" | "d6" | "d8" | "d10" | "d12" | "d20" | "d100";

export interface QuaternionLike {
  x: number;
  y: number;
  z: number;
  w: number;
}

// Map from dieType -> faceValue -> [nx, ny, nz]
const FACE_NORMALS: Record<string, Record<number, [number, number, number]>> = {};

// Initialize face normals dynamically from default.json so it is always 100% accurate
(function initNormals() {
  try {
    const data = normalsData as any;
    for (const [dieType, map] of Object.entries(data.colliderFaceMap || {})) {
      const mesh = data.meshes.find((m: any) => m.name === `${dieType}_collider`);
      if (!mesh) continue;
      FACE_NORMALS[dieType] = {};

      for (const [faceIdStr, val] of Object.entries(map as Record<string, number>)) {
        const fid = parseInt(faceIdStr, 10);
        const i0 = mesh.indices[fid * 3];
        const i1 = mesh.indices[fid * 3 + 1];
        const i2 = mesh.indices[fid * 3 + 2];
        const v0 = [mesh.positions[i0 * 3], mesh.positions[i0 * 3 + 1], mesh.positions[i0 * 3 + 2]];
        const v1 = [mesh.positions[i1 * 3], mesh.positions[i1 * 3 + 1], mesh.positions[i1 * 3 + 2]];
        const v2 = [mesh.positions[i2 * 3], mesh.positions[i2 * 3 + 1], mesh.positions[i2 * 3 + 2]];

        const e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
        const e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
        const nx = e1[1] * e2[2] - e1[2] * e2[1];
        const ny = e1[2] * e2[0] - e1[0] * e2[2];
        const nz = e1[0] * e2[1] - e1[1] * e2[0];
        const len = Math.hypot(nx, ny, nz) || 1;
        FACE_NORMALS[dieType][val] = [nx / len, ny / len, nz / len];
      }
    }
  } catch (e) {
    console.error("Failed to initialize dice face normals:", e);
  }
})();

function normalize(v: [number, number, number]): [number, number, number] {
  const len = Math.hypot(...v);
  return len > 0 ? [v[0] / len, v[1] / len, v[2] / len] : [0, 1, 0];
}

function cross(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Compute shortest-arc rotation quaternion from vector `from` to vector `to`. */
function rotationBetween(
  from: [number, number, number],
  to: [number, number, number],
): QuaternionLike {
  const f = normalize(from);
  const t = normalize(to);
  const d = dot(f, t);

  if (d >= 0.999999) {
    return { x: 0, y: 0, z: 0, w: 1 };
  }
  if (d <= -0.999999) {
    let axis = cross([1, 0, 0], f);
    if (Math.hypot(...axis) < 0.001) axis = cross([0, 1, 0], f);
    const na = normalize(axis);
    return { x: na[0], y: na[1], z: na[2], w: 0 };
  }

  const c = cross(f, t);
  const q = [c[0], c[1], c[2], 1 + d];
  const len = Math.hypot(...q);
  return { x: q[0] / len, y: q[1] / len, z: q[2] / len, w: q[3] / len };
}

/** Multiply two quaternions: q1 * q2 */
function multiplyQuaternions(q1: QuaternionLike, q2: QuaternionLike): QuaternionLike {
  return {
    x: q1.w * q2.x + q1.x * q2.w + q1.y * q2.z - q1.z * q2.y,
    y: q1.w * q2.y - q1.x * q2.z + q1.y * q2.w + q1.z * q2.x,
    z: q1.w * q2.z + q1.x * q2.y - q1.y * q2.x + q1.z * q2.w,
    w: q1.w * q2.w - q1.x * q2.x - q1.y * q2.y - q1.z * q2.z,
  };
}

/**
 * Calculates the exact quaternion orientation needed for a die to display `targetValue` facing up.
 * Preserves the die's natural resting yaw (heading on table) if `currentQuat` is provided.
 */
export function getRotationForValue(
  dieType: string,
  targetValue: number,
  currentQuat?: QuaternionLike,
): QuaternionLike | null {
  const normalizedType = dieType.startsWith("d") ? dieType : `d${dieType}`;
  const normals = FACE_NORMALS[normalizedType];
  if (!normals) return null;

  // Handle d10 vs d100 special value representation (0 -> 10, etc.)
  let lookupVal = targetValue;
  if (normalizedType === "d10" && targetValue === 10 && !normals[10] && normals[0]) {
    lookupVal = 0;
  }
  if (normalizedType === "d100" && targetValue === 100 && !normals[100] && normals[0]) {
    lookupVal = 0;
  }

  const normal = normals[lookupVal] || normals[targetValue];
  if (!normal) return null;

  // For d4, default collider faces down when landed on table
  const targetUp: [number, number, number] = normalizedType === "d4" ? [0, -1, 0] : [0, 1, 0];

  // Base rotation from model face normal to world up
  const baseRotation = rotationBetween(normal, targetUp);

  // If current rotation is known, extract yaw around the Y axis and apply to preserve natural resting heading
  if (currentQuat) {
    const yaw = Math.atan2(
      2 * (currentQuat.w * currentQuat.y + currentQuat.x * currentQuat.z),
      1 - 2 * (currentQuat.y * currentQuat.y + currentQuat.z * currentQuat.z),
    );
    const halfYaw = yaw / 2;
    const yawQuat: QuaternionLike = {
      x: 0,
      y: Math.sin(halfYaw),
      z: 0,
      w: Math.cos(halfYaw),
    };
    return multiplyQuaternions(yawQuat, baseRotation);
  }

  return baseRotation;
}

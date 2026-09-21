import { describe, it, expect } from "vitest";
import { getRotationForValue, type QuaternionLike } from "@/app/lib/dice-normals";

function rotateVector(v: [number, number, number], q: QuaternionLike): [number, number, number] {
  // v' = q * v * q^-1
  const vx = v[0], vy = v[1], vz = v[2];
  const qx = q.x, qy = q.y, qz = q.z, qw = q.w;

  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);

  // v' = v + qw * t + cross(q.xyz, t)
  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx),
  ];
}

describe("dice-normals getRotationForValue", () => {
  it("computes orientation for every face of d20", () => {
    for (let val = 1; val <= 20; val++) {
      const q = getRotationForValue("d20", val);
      expect(q).not.toBeNull();
      if (!q) continue;

      // Quaternion length must be ~1
      const len = Math.hypot(q.x, q.y, q.z, q.w);
      expect(len).toBeCloseTo(1, 4);
    }
  });

  it("computes orientation for every face of d6", () => {
    for (let val = 1; val <= 6; val++) {
      const q = getRotationForValue("d6", val);
      expect(q).not.toBeNull();
      if (!q) continue;

      const len = Math.hypot(q.x, q.y, q.z, q.w);
      expect(len).toBeCloseTo(1, 4);
    }
  });

  it("computes orientation for d4, d8, d10, d12, and d100", () => {
    for (const [die, count] of [
      ["d4", 4],
      ["d8", 8],
      ["d10", 10],
      ["d12", 12],
    ] as const) {
      for (let val = 1; val <= count; val++) {
        const q = getRotationForValue(die, val);
        expect(q).not.toBeNull();
      }
    }
  });

  it("preserves heading (yaw) when currentQuat is provided", () => {
    // Arbitrary current quaternion
    const currentQuat: QuaternionLike = { x: 0.1, y: 0.7, z: 0.1, w: 0.7 };
    const q = getRotationForValue("d20", 20, currentQuat);
    expect(q).not.toBeNull();
    if (q) {
      const len = Math.hypot(q.x, q.y, q.z, q.w);
      expect(len).toBeCloseTo(1, 4);
    }
  });
});

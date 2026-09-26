import { describe, expect, it } from "vitest";
import { poseFromFaceMatrix } from "../app/lib/webcam-head-tracking";

/** Column-major 4×4 from a row-major 3×3 rotation. */
function matrix(r: number[][]): number[] {
  const m = new Array(16).fill(0);
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) m[col * 4 + row] = r[row][col];
  m[15] = 1;
  return m;
}
const rotY = (a: number) => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
const rotX = (a: number) => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
const rotZ = (a: number) => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];

describe("webcam head pose", () => {
  it("reads a face looking straight at the camera as neutral", () => {
    const pose = poseFromFaceMatrix(matrix(rotY(0)))!;
    expect(pose.yaw).toBeCloseTo(0);
    expect(pose.pitch).toBeCloseTo(0);
    expect(pose.roll).toBeCloseTo(0);
  });
  it("separates yaw, pitch and roll", () => {
    expect(poseFromFaceMatrix(matrix(rotY(0.5)))!.yaw).toBeCloseTo(0.5);
    // Rotating about camera X by -a tips the nose upwards (+Y).
    expect(poseFromFaceMatrix(matrix(rotX(-0.3)))!.pitch).toBeCloseTo(0.3);
    expect(Math.abs(poseFromFaceMatrix(matrix(rotZ(0.2)))!.roll)).toBeCloseTo(0.2);
    expect(poseFromFaceMatrix(matrix(rotZ(0.2)))!.yaw).toBeCloseTo(0);
  });
  it("rejects missing or broken matrices", () => {
    expect(poseFromFaceMatrix([])).toBeNull();
    expect(poseFromFaceMatrix(new Array(16).fill(NaN))).toBeNull();
  });
});

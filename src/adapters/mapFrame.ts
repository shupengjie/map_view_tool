/**
 * **Single source of truth** for converting between the map (vehicle/world) frame and the
 * Three.js scene frame. All map-frame positions / orientations in this codebase should pass
 * through one of the helpers below or through `<MapFrameGroup>` (which is built on top of them).
 *
 * Frames (both right-handed):
 *   Map frame (vehicle/world, Z-up):   X = 前 forward, Y = 左 left, Z = 上 up.
 *   Three.js scene frame (Y-up):       X = 前 forward, Y = 上 up,   Z = 右 right.
 *
 * Basis change M → S (rotation that takes a vector in M and returns the same physical vector in S):
 *   M.X (1, 0, 0)  → S.X (1, 0, 0)        (前)
 *   M.Y (0, 1, 0)  → S.−Z (0, 0, −1)      (左 → −Z right-handed)
 *   M.Z (0, 0, 1)  → S.Y (0, 1, 0)        (上)
 * Equivalent matrix R_x(−π/2) ⇒ quaternion `MAP_TO_SCENE_QUAT = (-√2/2, 0, 0, √2/2)`.
 *
 * Authoring tip — to place an R3F subtree at a map-frame pose and keep authoring children in MAP
 * coords (so a child at `[1, 0, 0]` lives at 前 = +1m), use `<MapFrameGroup>`. The component
 * internally calls `mapToScenePoint` + `mapToSceneQuaternion`. Do NOT roll your own conjugation —
 * it almost always produces the subtle bug where local axes silently track the scene frame.
 */

import { Quaternion } from "three";

/** Basis-change rotation: applied to a map-frame vector, yields its scene-frame components. */
export const MAP_TO_SCENE_QUAT = new Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);

/** Inverse of `MAP_TO_SCENE_QUAT`. Use for scene-frame → map-frame derivations. */
export const SCENE_TO_MAP_QUAT = new Quaternion(Math.SQRT1_2, 0, 0, Math.SQRT1_2);

/** Mutable triple — compatible with R3F `position={[x, y, z]}`. */
export type SceneVec3 = [number, number, number];

/** Mutable quaternion tuple — `[qx, qy, qz, qw]`, compatible with R3F `quaternion={...}`. */
export type SceneQuat = [number, number, number, number];

/**
 * Convert a map-frame point to scene-frame Cartesian coordinates.
 *
 * Accepts either the `{x, y, z}` object form used throughout map JSON parsing, or a tuple
 * `[x, y, z]` (handy when the value already lives in an array).
 */
export function mapToScenePoint(p: { readonly x: number; readonly y: number; readonly z: number }): SceneVec3;
export function mapToScenePoint(p: readonly [number, number, number]): SceneVec3;
export function mapToScenePoint(
  p: { readonly x: number; readonly y: number; readonly z: number } | readonly [number, number, number],
): SceneVec3 {
  if (Array.isArray(p)) {
    return [p[0], p[2], -p[1]];
  }
  const o = p as { x: number; y: number; z: number };
  return [o.x, o.z, -o.y];
}

/**
 * Inverse of `mapToScenePoint`. Use when you already hold a scene-frame triple and need to
 * surface it to the user as map-frame values (e.g. inspector readouts).
 */
export function sceneToMapPoint(p: readonly [number, number, number]): SceneVec3 {
  return [p[0], -p[2], p[1]];
}

/**
 * Convert a map-frame direction to scene frame, then normalise. Returns `(0, 1, 0)` (scene-up)
 * for near-zero input so callers can safely chain it into matrix bases.
 */
export function mapToSceneDirection(d: { readonly x: number; readonly y: number; readonly z: number }): SceneVec3;
export function mapToSceneDirection(d: readonly [number, number, number]): SceneVec3;
export function mapToSceneDirection(
  d: { readonly x: number; readonly y: number; readonly z: number } | readonly [number, number, number],
): SceneVec3 {
  const x = Array.isArray(d) ? d[0] : (d as { x: number }).x;
  const y = Array.isArray(d) ? d[1] : (d as { y: number }).y;
  const z = Array.isArray(d) ? d[2] : (d as { z: number }).z;
  const tx = x;
  const ty = z;
  const tz = -y;
  const len = Math.hypot(tx, ty, tz);
  if (len < 1e-10) {
    return [0, 1, 0];
  }
  return [tx / len, ty / len, tz / len];
}

/**
 * Convert a unit quaternion expressed in the **map frame** into the scene-frame quaternion you
 * should hand to an R3F `<group quaternion={...}>` so the group's local basis coincides with the
 * map frame after rotation:
 *
 *   group-local `(1, 0, 0)` → map +X (前)
 *   group-local `(0, 1, 0)` → map +Y (左)
 *   group-local `(0, 0, 1)` → map +Z (上)
 *
 * Math: `q_scene = MAP_TO_SCENE_QUAT · q_map` (quaternion composition; **not** the conjugation
 * `M · q · M⁻¹`). The conjugation form re-expresses the *rotation* in the scene frame but leaves
 * the local basis scene-aligned — that was the historical foot-gun behind the pin-axes bug, so
 * we no longer expose it.
 *
 * Caller must provide a unit-norm quaternion; this helper does NOT re-normalise.
 */
export function mapToSceneQuaternion(q: {
  readonly qx: number;
  readonly qy: number;
  readonly qz: number;
  readonly qw: number;
}): SceneQuat;
export function mapToSceneQuaternion(q: readonly [number, number, number, number]): SceneQuat;
export function mapToSceneQuaternion(
  q:
    | { readonly qx: number; readonly qy: number; readonly qz: number; readonly qw: number }
    | readonly [number, number, number, number],
): SceneQuat {
  const qx = Array.isArray(q) ? q[0] : (q as { qx: number }).qx;
  const qy = Array.isArray(q) ? q[1] : (q as { qy: number }).qy;
  const qz = Array.isArray(q) ? q[2] : (q as { qz: number }).qz;
  const qw = Array.isArray(q) ? q[3] : (q as { qw: number }).qw;
  const out = new Quaternion(qx, qy, qz, qw);
  out.premultiply(MAP_TO_SCENE_QUAT);
  return [out.x, out.y, out.z, out.w];
}

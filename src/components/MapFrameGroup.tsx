/**
 * `<MapFrameGroup>` — the canonical way to place an R3F subtree at a **map-frame** pose, so
 * children can be authored entirely in map coordinates.
 *
 * Why this exists: Three.js exposes a Y-up scene (`X 前, Y 上, Z 右`), while everything in our
 * data model (map JSON, layer data, pins, trajectories, …) is in vehicle/world frame
 * (`X 前, Y 左, Z 上`). Manually applying `mapToScenePoint` + a quaternion conjugation per call-site
 * was error-prone — the local basis silently stayed scene-aligned, producing pins whose green axis
 * pointed up when the user meant 左. By going through this wrapper, children authored at
 * `[1, 0, 0]`, `[0, 1, 0]`, `[0, 0, 1]` land at 前/左/上 respectively, with the pose applied.
 *
 * Caller invariants:
 *   - `mapPosition` is `[X 前, Y 左, Z 上]` in meters (defaults to origin).
 *   - `mapQuaternion` is a unit-norm `[qx, qy, qz, qw]` in map frame (defaults to identity).
 *     Normality is the caller's responsibility (no silent re-normalisation).
 *
 * Anything that controls the transform (`position`, `rotation`, `quaternion`, `matrix`) is
 * intentionally NOT accepted — those would defeat the purpose. Use the map-frame props above.
 */

import { mapToScenePoint, mapToSceneQuaternion } from "@/adapters/mapFrame";
import type { SceneQuat, SceneVec3 } from "@/adapters/mapFrame";
import { forwardRef, useMemo, type ReactNode } from "react";
import type { Group } from "three";

const IDENTITY_POSITION: SceneVec3 = [0, 0, 0];
const IDENTITY_QUATERNION: SceneQuat = [0, 0, 0, 1];

export interface MapFrameGroupProps {
  /** Position in MAP frame `[X 前, Y 左, Z 上]` (meters). Omit for origin. */
  readonly mapPosition?: readonly [number, number, number];
  /** Unit quaternion in MAP frame `[qx, qy, qz, qw]`. Omit for identity. */
  readonly mapQuaternion?: readonly [number, number, number, number];
  /** R3F `<group>` pass-throughs (transform-controlling props are intentionally excluded). */
  readonly visible?: boolean;
  readonly name?: string;
  readonly userData?: Record<string, unknown>;
  readonly renderOrder?: number;
  readonly children?: ReactNode;
}

export const MapFrameGroup = forwardRef<Group, MapFrameGroupProps>(function MapFrameGroup(
  { mapPosition, mapQuaternion, visible, name, userData, renderOrder, children },
  ref,
) {
  const scenePosition = useMemo<SceneVec3>(() => {
    if (!mapPosition) {
      return IDENTITY_POSITION;
    }
    return mapToScenePoint({ x: mapPosition[0], y: mapPosition[1], z: mapPosition[2] });
  }, [mapPosition]);

  const sceneQuaternion = useMemo<SceneQuat>(() => {
    if (!mapQuaternion) {
      return IDENTITY_QUATERNION;
    }
    return mapToSceneQuaternion({
      qx: mapQuaternion[0],
      qy: mapQuaternion[1],
      qz: mapQuaternion[2],
      qw: mapQuaternion[3],
    });
  }, [mapQuaternion]);

  return (
    <group
      ref={ref}
      position={scenePosition}
      quaternion={sceneQuaternion}
      visible={visible}
      name={name}
      userData={userData}
      renderOrder={renderOrder}
    >
      {children}
    </group>
  );
});

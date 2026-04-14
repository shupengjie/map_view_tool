/**
 * Raycast pick for viewport distance tool: nearest mesh hit, else intersection with ground plane y=0.
 * When the ray is parallel to that plane, `intersectPlane` fails and this returns null (caller skips the click).
 * Hits under the background grid or map-frame axes (userData.nodeId on ancestor) are skipped.
 */

import { MAP_FRAME_AXES_NODE_ID, SCENE_BACKGROUND_GRID_NODE_ID } from "@/scene/constants";
import { Plane, Raycaster, Vector3 } from "three";
import type { Object3D, Scene } from "three";

const GROUND_PLANE = new Plane(new Vector3(0, 1, 0), 0);
const _planeHit = new Vector3();

const IGNORE_PICK_NODE_IDS = new Set<string>([SCENE_BACKGROUND_GRID_NODE_ID, MAP_FRAME_AXES_NODE_ID]);

/** True if this object or any ancestor is the background grid or map axes subtree (see Viewport3D group userData). */
export function isViewportBackdropPickObject(object: Object3D): boolean {
  let o: Object3D | null = object;
  while (o) {
    const id = o.userData?.nodeId;
    if (typeof id === "string" && IGNORE_PICK_NODE_IDS.has(id)) {
      return true;
    }
    o = o.parent;
  }
  return false;
}

export function pickMeasurePointWorld(raycaster: Raycaster, scene: Scene): Vector3 | null {
  const hits = raycaster.intersectObject(scene, true);
  for (const h of hits) {
    if (isViewportBackdropPickObject(h.object)) {
      continue;
    }
    const p = h.point;
    return new Vector3(p.x, p.y, p.z);
  }
  if (raycaster.ray.intersectPlane(GROUND_PLANE, _planeHit)) {
    return _planeHit.clone();
  }
  return null;
}

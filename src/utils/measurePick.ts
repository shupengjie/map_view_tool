/**
 * Raycast pick for viewport distance tool: nearest visible geometry hit, else intersection with ground plane y=0.
 * Selection often disables `raycast` on purely visual meshes (lines, point clouds, etc.); for measuring we temporarily
 * restore each object's class default `raycast` so all visible scene content is hittable except grid/axes.
 * When the ray is parallel to the ground plane, `intersectPlane` fails and this returns null (caller skips the click).
 */

import { MAP_FRAME_AXES_NODE_ID, SCENE_BACKGROUND_GRID_NODE_ID } from "@/scene/constants";
import { Object3D, Plane, Raycaster, Vector3 } from "three";
import type { Scene } from "three";

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

function isMeasureToolDecorationObject(object: Object3D): boolean {
  let o: Object3D | null = object;
  while (o) {
    if (o.userData?.viewportMeasureOverlay === true) {
      return true;
    }
    o = o.parent;
  }
  return false;
}

type RaycastFn = Object3D["raycast"];

function withFullSceneRaycast(scene: Scene, run: () => void): void {
  const restored: { o: Object3D; r: RaycastFn }[] = [];
  scene.traverseVisible((obj) => {
    if (isViewportBackdropPickObject(obj) || isMeasureToolDecorationObject(obj)) {
      return;
    }
    const Ctor = obj.constructor as typeof Object3D;
    const protoRaycast = Ctor.prototype.raycast as RaycastFn | undefined;
    if (typeof protoRaycast !== "function") {
      return;
    }
    if (obj.raycast === protoRaycast) {
      return;
    }
    restored.push({ o: obj, r: obj.raycast });
    obj.raycast = protoRaycast.bind(obj) as RaycastFn;
  });
  try {
    run();
  } finally {
    for (let i = restored.length - 1; i >= 0; i--) {
      const { o, r } = restored[i]!;
      o.raycast = r;
    }
  }
}

export function pickMeasurePointWorld(raycaster: Raycaster, scene: Scene): Vector3 | null {
  let hits: ReturnType<Raycaster["intersectObject"]> = [];
  withFullSceneRaycast(scene, () => {
    hits = raycaster.intersectObject(scene, true);
  });
  for (const h of hits) {
    if (isViewportBackdropPickObject(h.object) || isMeasureToolDecorationObject(h.object)) {
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

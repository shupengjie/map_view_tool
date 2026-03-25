/**
 * When `cameraFocusRequest` is set (scene tree selection), moves orbit target + camera to frame that node.
 */

import { useEditorStore } from "@/store/useEditorStore";
import { useThree } from "@react-three/fiber";
import { Box3, Vector3 } from "three";
import type { Object3D } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useEffect, type MutableRefObject } from "react";

function computeFocusCenter(scene: Object3D, nodeId: string): Vector3 | null {
  const box = new Box3();
  let hasBox = false;
  const loose: Vector3[] = [];

  scene.traverse((obj) => {
    // Keep behavior consistent with the viewport: hidden objects shouldn't be focus targets.
    if (obj.visible === false) {
      return;
    }
    if (obj.userData?.nodeId !== nodeId) {
      return;
    }
    const b = new Box3().setFromObject(obj);
    if (!b.isEmpty()) {
      if (!hasBox) {
        box.copy(b);
        hasBox = true;
      } else {
        box.union(b);
      }
    } else {
      const p = new Vector3();
      obj.getWorldPosition(p);
      loose.push(p);
    }
  });

  if (hasBox) {
    for (const p of loose) {
      box.expandByPoint(p);
    }
    return box.getCenter(new Vector3());
  }
  if (loose.length > 0) {
    const acc = new Vector3();
    for (const p of loose) {
      acc.add(p);
    }
    return acc.multiplyScalar(1 / loose.length);
  }
  return null;
}

export function CameraFocusSync({ controlsRef }: { readonly controlsRef: MutableRefObject<OrbitControlsImpl | null> }) {
  const cameraFocusRequest = useEditorStore((s) => s.cameraFocusRequest);
  const clearCameraFocusRequest = useEditorStore((s) => s.clearCameraFocusRequest);
  const { scene, camera } = useThree();

  useEffect(() => {
    if (!cameraFocusRequest) {
      return;
    }
    const ctrl = controlsRef.current;
    if (!ctrl) {
      clearCameraFocusRequest();
      return;
    }

    const center = computeFocusCenter(scene, cameraFocusRequest);
    clearCameraFocusRequest();
    if (!center) {
      return;
    }

    const prevTarget = ctrl.target.clone();
    const offset = camera.position.clone().sub(prevTarget);
    let dist = offset.length();
    if (dist < 1e-6) {
      dist = 12;
      offset.set(1, 0.85, 1).normalize().multiplyScalar(dist);
    } else {
      dist = Math.min(Math.max(dist, 4), 120);
      offset.normalize().multiplyScalar(dist);
    }

    ctrl.target.copy(center);
    camera.position.copy(center.clone().add(offset));
    ctrl.update();
  }, [cameraFocusRequest, scene, camera, controlsRef, clearCameraFocusRequest]);

  return null;
}

/**
 * Camera + orbit-controls rig used inside the R3F `<Canvas>`.
 * Bundles `OrbitControls` (with adaptive zoom + altitude clamp) and the scene-tree → camera focus
 * sync helper so the consumer just drops one `<ViewportRig />` into the canvas.
 */

import { CameraFocusSync } from "@/components/CameraFocusSync";
import { OrbitControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef, type MutableRefObject } from "react";
import { MOUSE } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

const MAX_ORBIT_DISTANCE = 200;
const MAX_CAMERA_Y = 465;

/**
 * Wheel zoom speed scales ~linearly with camera–target distance; max zoom out via maxDistance; max altitude via Y clamp.
 * Middle-button drag rotates (not dolly); wheel zooms. In measure mode, left click is captured before controls see pointerdown.
 */
function OrbitControlsAdaptive({
  controlsRef,
}: {
  readonly controlsRef: MutableRefObject<OrbitControlsImpl | null>;
}) {
  useFrame(() => {
    const c = controlsRef.current;
    if (!c) {
      return;
    }
    const d = c.object.position.distanceTo(c.target);
    c.zoomSpeed = Math.min(4.2, Math.max(0.42, 0.38 + d * 0.072));
    if (c.object.position.y > MAX_CAMERA_Y) {
      c.object.position.y = MAX_CAMERA_Y;
      c.update();
    }
  });
  return (
    <OrbitControls
      ref={(instance) => {
        controlsRef.current = instance;
      }}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      enableZoom
      mouseButtons={{
        LEFT: MOUSE.ROTATE,
        MIDDLE: MOUSE.ROTATE,
        RIGHT: MOUSE.PAN,
      }}
      minDistance={1.2}
      maxDistance={MAX_ORBIT_DISTANCE}
      minPolarAngle={0.08}
      maxPolarAngle={Math.PI * 0.499}
    />
  );
}

export function ViewportRig() {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  return (
    <>
      <OrbitControlsAdaptive controlsRef={controlsRef} />
      <CameraFocusSync controlsRef={controlsRef} />
    </>
  );
}

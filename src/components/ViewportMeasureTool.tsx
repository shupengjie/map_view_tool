/**
 * 3D viewport distance tool: two left-clicks define segment; empty hits fall back to y=0 plane.
 * While active, left-click is captured for placing points; middle-drag rotates, wheel zooms, right-drag pans (OrbitControls).
 */

import { useEditorStore } from "@/store/useEditorStore";
import type { Vec3 } from "@/scene/types";
import { pickMeasurePointWorld } from "@/utils/measurePick";
import { Html, Line } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, Raycaster, Vector2, Vector3 } from "three";

function vec3FromTuple(t: Vec3): Vector3 {
  return new Vector3(t[0], t[1], t[2]);
}

function midpoint(a: Vec3, b: Vec3): Vector3 {
  return new Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
}

function distanceMeters(a: Vec3, b: Vec3): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

const DISTANCE_FMT = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function MeasurePreviewLine({ from, getTo }: { from: Vec3; getTo: () => Vector3 | null }) {
  const geomRef = useRef<BufferGeometry>(null);
  const arr = useMemo(() => new Float32Array(6), []);

  useFrame(() => {
    const g = geomRef.current;
    if (!g) {
      return;
    }
    const pos = g.getAttribute("position") as BufferAttribute | undefined;
    if (!pos) {
      return;
    }
    const to = getTo();
    arr[0] = from[0];
    arr[1] = from[1];
    arr[2] = from[2];
    if (to) {
      arr[3] = to.x;
      arr[4] = to.y;
      arr[5] = to.z;
    } else {
      arr[3] = from[0];
      arr[4] = from[1];
      arr[5] = from[2];
    }
    pos.needsUpdate = true;
  });

  return (
    <lineSegments frustumCulled={false} renderOrder={1001}>
      <bufferGeometry ref={geomRef}>
        <bufferAttribute attach="attributes-position" count={2} array={arr} itemSize={3} />
      </bufferGeometry>
      <lineBasicMaterial color="#f5d547" depthTest={false} transparent opacity={0.82} />
    </lineSegments>
  );
}

function MeasureToolActiveInner() {
  const pointA = useEditorStore((s) => s.measurePointA);
  const pointB = useEditorStore((s) => s.measurePointB);
  const addMeasurePoint = useEditorStore((s) => s.addMeasurePoint);
  const setMeasureToolActive = useEditorStore((s) => s.setMeasureToolActive);

  const { camera, gl, scene, pointer } = useThree();
  const raycaster = useMemo(() => new Raycaster(), []);
  const previewRef = useRef<Vector3 | null>(null);

  useFrame(() => {
    if (!pointA || pointB) {
      previewRef.current = null;
      return;
    }
    raycaster.setFromCamera(pointer, camera);
    previewRef.current = pickMeasurePointWorld(raycaster, scene);
  });

  useEffect(() => {
    const el = gl.domElement;
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) {
        return;
      }
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(new Vector2(x, y), camera);
      const p = pickMeasurePointWorld(raycaster, scene);
      if (!p) {
        return;
      }
      addMeasurePoint([p.x, p.y, p.z]);
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };
    el.addEventListener("pointerdown", onPointerDown, true);
    return () => el.removeEventListener("pointerdown", onPointerDown, true);
  }, [gl, camera, scene, raycaster, addMeasurePoint]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMeasureToolActive(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setMeasureToolActive]);

  const getPreview = () => previewRef.current;

  return (
    <group>
      {pointA && !pointB ? <MeasurePreviewLine from={pointA} getTo={getPreview} /> : null}
      {pointA && pointB ? (
        <Line
          points={[pointA, pointB]}
          color="#7bed4b"
          lineWidth={2.5}
          depthTest={false}
          renderOrder={1000}
        />
      ) : null}
      {pointA ? (
        <mesh position={vec3FromTuple(pointA)} renderOrder={1002}>
          <sphereGeometry args={[0.14, 14, 14]} />
          <meshBasicMaterial color="#00d4ff" depthTest={false} />
        </mesh>
      ) : null}
      {pointB ? (
        <mesh position={vec3FromTuple(pointB)} renderOrder={1002}>
          <sphereGeometry args={[0.14, 14, 14]} />
          <meshBasicMaterial color="#7bed4b" depthTest={false} />
        </mesh>
      ) : null}
      {pointA && pointB ? (
        <Html position={midpoint(pointA, pointB)} center style={{ pointerEvents: "none" }}>
          <div
            className="viewport-measure-label"
            aria-live="polite"
            role="status"
          >
            {DISTANCE_FMT.format(distanceMeters(pointA, pointB))} m
          </div>
        </Html>
      ) : null}
    </group>
  );
}

export function MeasureToolScene() {
  const measureToolActive = useEditorStore((s) => s.measureToolActive);
  if (!measureToolActive) {
    return null;
  }
  return <MeasureToolActiveInner />;
}

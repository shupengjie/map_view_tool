/**
 * 3D viewport measure tools:
 * - distance: two left-clicks define segment
 * - angle: three left-clicks define two rays (A-B and C-B), angle range [0, 180]
 * Empty hits fall back to y=0 plane. While active, left-click is captured for placing points.
 */

import { useEditorStore } from "@/store/useEditorStore";
import type { Vec3 } from "@/scene/types";
import { pickMeasurePointWorld } from "@/utils/measurePick";
import { Html, Line } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, MathUtils, Raycaster, Vector2, Vector3 } from "three";
import type { Group } from "three";

function midpoint(a: Vec3, b: Vec3): Vector3 {
  return new Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
}

function distanceMeters(a: Vec3, b: Vec3): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function angleDegrees(a: Vec3, b: Vec3, c: Vec3): number {
  const bax = a[0] - b[0];
  const bay = a[1] - b[1];
  const baz = a[2] - b[2];
  const bcx = c[0] - b[0];
  const bcy = c[1] - b[1];
  const bcz = c[2] - b[2];
  const baLen = Math.sqrt(bax * bax + bay * bay + baz * baz);
  const bcLen = Math.sqrt(bcx * bcx + bcy * bcy + bcz * bcz);
  if (baLen < 1e-6 || bcLen < 1e-6) {
    return 0;
  }
  const dot = bax * bcx + bay * bcy + baz * bcz;
  const cos = MathUtils.clamp(dot / (baLen * bcLen), -1, 1);
  return (Math.acos(cos) * 180) / Math.PI;
}

const DISTANCE_FMT = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const ANGLE_FMT = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Same idea as axis tick labels: scale with camera distance so on-screen size stays roughly constant. */
const MEASURE_MARKER_DIST_REF = 40;
const MEASURE_MARKER_BASE_RADIUS = 0.14;
/** Match Viewport3D low-poly small spheres to limit triangle count. */
const MEASURE_MARKER_SPHERE_SEGS = 6;

function MeasurePointMarker({ position, color }: { position: Vec3; color: string }) {
  const groupRef = useRef<Group>(null);
  const wp = useMemo(() => new Vector3(), []);

  useFrame((state) => {
    const g = groupRef.current;
    if (!g) {
      return;
    }
    g.getWorldPosition(wp);
    const d = Math.max(state.camera.position.distanceTo(wp), 0.2);
    const s = d / MEASURE_MARKER_DIST_REF;
    g.scale.setScalar(s);
  });

  return (
    <group ref={groupRef} position={position} renderOrder={1002} userData={{ viewportMeasureOverlay: true }}>
      <mesh renderOrder={1002}>
        <sphereGeometry args={[MEASURE_MARKER_BASE_RADIUS, MEASURE_MARKER_SPHERE_SEGS, MEASURE_MARKER_SPHERE_SEGS]} />
        <meshBasicMaterial color={color} depthTest={false} />
      </mesh>
    </group>
  );
}

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
    <lineSegments frustumCulled={false} renderOrder={1001} userData={{ viewportMeasureOverlay: true }}>
      <bufferGeometry ref={geomRef}>
        <bufferAttribute attach="attributes-position" count={2} array={arr} itemSize={3} />
      </bufferGeometry>
      <lineBasicMaterial color="#f5d547" depthTest={false} transparent opacity={0.82} />
    </lineSegments>
  );
}

function useMeasurePointerCapture(onPicked: (p: Vec3) => void) {
  const { camera, gl, scene, pointer } = useThree();
  const raycaster = useMemo(() => new Raycaster(), []);

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
      onPicked([p.x, p.y, p.z]);
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };
    el.addEventListener("pointerdown", onPointerDown, true);
    return () => el.removeEventListener("pointerdown", onPointerDown, true);
  }, [gl, camera, scene, raycaster, onPicked]);

  return { camera, scene, pointer, raycaster };
}

function DistanceMeasureToolActiveInner() {
  const pointA = useEditorStore((s) => s.measureDistancePointA);
  const pointB = useEditorStore((s) => s.measureDistancePointB);
  const addMeasurePoint = useEditorStore((s) => s.addMeasureDistancePoint);
  const setMeasureToolActive = useEditorStore((s) => s.setMeasureDistanceToolActive);
  const previewRef = useRef<Vector3 | null>(null);
  const { camera, scene, pointer, raycaster } = useMeasurePointerCapture(addMeasurePoint);

  useFrame(() => {
    if (!pointA || pointB) {
      previewRef.current = null;
      return;
    }
    raycaster.setFromCamera(pointer, camera);
    previewRef.current = pickMeasurePointWorld(raycaster, scene);
  });

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
        <group userData={{ viewportMeasureOverlay: true }}>
          <Line
            points={[pointA, pointB]}
            color="#7bed4b"
            lineWidth={2.5}
            depthTest={false}
            renderOrder={1000}
          />
        </group>
      ) : null}
      {pointA ? <MeasurePointMarker position={pointA} color="#00d4ff" /> : null}
      {pointB ? <MeasurePointMarker position={pointB} color="#7bed4b" /> : null}
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

function AngleMeasureToolActiveInner() {
  const pointA = useEditorStore((s) => s.measureAnglePointA);
  const pointB = useEditorStore((s) => s.measureAnglePointB);
  const pointC = useEditorStore((s) => s.measureAnglePointC);
  const addMeasurePoint = useEditorStore((s) => s.addMeasureAnglePoint);
  const setMeasureToolActive = useEditorStore((s) => s.setMeasureAngleToolActive);
  const previewRef = useRef<Vector3 | null>(null);
  const { camera, scene, pointer, raycaster } = useMeasurePointerCapture(addMeasurePoint);

  useFrame(() => {
    if (!pointA || pointC) {
      previewRef.current = null;
      return;
    }
    raycaster.setFromCamera(pointer, camera);
    previewRef.current = pickMeasurePointWorld(raycaster, scene);
  });

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

  const angleLabel = pointA && pointB && pointC ? `${ANGLE_FMT.format(angleDegrees(pointA, pointB, pointC))}\u00B0` : null;

  return (
    <group>
      {pointA && !pointB ? <MeasurePreviewLine from={pointA} getTo={getPreview} /> : null}
      {pointA && pointB ? (
        <group userData={{ viewportMeasureOverlay: true }}>
          <Line
            points={[pointA, pointB]}
            color="#7bed4b"
            lineWidth={2.5}
            depthTest={false}
            renderOrder={1000}
          />
        </group>
      ) : null}
      {pointB && !pointC ? <MeasurePreviewLine from={pointB} getTo={getPreview} /> : null}
      {pointB && pointC ? (
        <group userData={{ viewportMeasureOverlay: true }}>
          <Line
            points={[pointB, pointC]}
            color="#f39c12"
            lineWidth={2.5}
            depthTest={false}
            renderOrder={1000}
          />
        </group>
      ) : null}
      {pointA ? <MeasurePointMarker position={pointA} color="#00d4ff" /> : null}
      {pointB ? <MeasurePointMarker position={pointB} color="#f5d547" /> : null}
      {pointC ? <MeasurePointMarker position={pointC} color="#7bed4b" /> : null}
      {pointB && angleLabel ? (
        <Html position={pointB} center style={{ pointerEvents: "none" }}>
          <div
            className="viewport-measure-label"
            aria-live="polite"
            role="status"
          >
            {angleLabel}
          </div>
        </Html>
      ) : null}
    </group>
  );
}

export function MeasureToolScene() {
  const measureDistanceToolActive = useEditorStore((s) => s.measureDistanceToolActive);
  const measureAngleToolActive = useEditorStore((s) => s.measureAngleToolActive);
  if (measureDistanceToolActive) {
    return <DistanceMeasureToolActiveInner />;
  }
  if (measureAngleToolActive) {
    return <AngleMeasureToolActiveInner />;
  }
  return null;
}

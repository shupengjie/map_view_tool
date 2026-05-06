/**
 * Map-frame axes at origin (Json Map View「地图坐标轴」节点同款): RGB axes, ticks, meter labels.
 * Scene Y-up; colors match GizmoViewport axis order: X 前, Y 上, Z 右.
 */

import { Billboard, Line, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { Group, Vector3 } from "three";

/** Same order as GizmoViewport `axisColors`: X 前, Y 上, Z 右 — keep in sync with top-right gizmo. */
export const GIZMO_VIEWPORT_AXIS_COLORS = ["#ff4b4b", "#7bed4b", "#4ba3ff"] as const;

/** Matches `Grid` fadeDistance in Json Map View so ground axes span the visible grid region. */
export const MAP_FRAME_SCENE_GRID_FADE_DISTANCE = 420;

/** Vertical extent of the Y axis (m), scene Y-up. */
const MAP_FRAME_Y_HALF_EXTENT = 50;

/** ~3× previous default axis stroke (AxesHelper / linewidth 1). */
const MAP_FRAME_AXIS_LINE_WIDTH = 3;

/** Major tick spacing along each axis (meters). */
const MAP_FRAME_TICK_SPACING = 5;

/** Short tick length, perpendicular to the axis (meters). */
const MAP_FRAME_TICK_LENGTH = 0.55;

const MAP_FRAME_TICK_LINE_WIDTH = 1.25;
const MAP_FRAME_TICK_COLOR = "#909090";
const MAP_FRAME_TICK_LABEL_COLOR = "#b4b4b4";

function buildXAxisTickSegments(half: number, spacing: number, tickLen: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  const n = Math.floor(half / spacing);
  for (let i = -n; i <= n; i += 1) {
    const x = i * spacing;
    out.push([x, 0, -tickLen / 2], [x, 0, tickLen / 2]);
  }
  return out;
}

function buildZAxisTickSegments(half: number, spacing: number, tickLen: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  const n = Math.floor(half / spacing);
  for (let i = -n; i <= n; i += 1) {
    const z = i * spacing;
    out.push([-tickLen / 2, 0, z], [tickLen / 2, 0, z]);
  }
  return out;
}

function buildYAxisTickSegments(yHalf: number, spacing: number, tickLen: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  const n = Math.floor(yHalf / spacing);
  for (let i = -n; i <= n; i += 1) {
    const y = i * spacing;
    out.push([-tickLen / 2, y, 0], [tickLen / 2, y, 0]);
  }
  return out;
}

function stripRaycastFromSubtree(root: Group | null) {
  root?.traverse((o) => {
    o.raycast = () => {};
  });
}

/** Keeps tick label apparent size on screen roughly constant: scale ∝ distance to camera. */
const AXIS_TICK_LABEL_DIST_REF = 40;

function AxisTickLabel({ position, text }: { position: [number, number, number]; text: string }) {
  const groupRef = useRef<Group>(null);
  const wp = useMemo(() => new Vector3(), []);

  useFrame((state) => {
    const g = groupRef.current;
    if (!g) {
      return;
    }
    const cam = state.camera;
    g.getWorldPosition(wp);
    const d = Math.max(cam.position.distanceTo(wp), 0.2);
    const s = d / AXIS_TICK_LABEL_DIST_REF;
    g.scale.setScalar(s);
  });

  return (
    <group ref={groupRef} position={position}>
      <Billboard follow>
        <Text
          fontSize={0.38}
          color={MAP_FRAME_TICK_LABEL_COLOR}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.032}
          outlineColor="#141414"
        >
          {text}
        </Text>
      </Billboard>
    </group>
  );
}

/**
 * Full-span map-frame axes at origin: X/Z along ground to ±grid fade; Y from -50m to +50m.
 * Not raycastable (does not participate in viewport selection).
 */
export function MapFrameAxesR3f() {
  const groupRef = useRef<Group>(null);
  const half = MAP_FRAME_SCENE_GRID_FADE_DISTANCE;
  const yh = MAP_FRAME_Y_HALF_EXTENT;
  const [cx, cy, cz] = GIZMO_VIEWPORT_AXIS_COLORS;
  const lw = MAP_FRAME_AXIS_LINE_WIDTH;

  useLayoutEffect(() => {
    stripRaycastFromSubtree(groupRef.current);
    const id = requestAnimationFrame(() => stripRaycastFromSubtree(groupRef.current));
    return () => cancelAnimationFrame(id);
  }, []);

  const xSeg = useMemo(
    () =>
      [
        [-half, 0, 0],
        [half, 0, 0],
      ] as [number, number, number][],
    [half],
  );
  const ySeg = useMemo(
    () =>
      [
        [0, -yh, 0],
        [0, yh, 0],
      ] as [number, number, number][],
    [yh],
  );
  const zSeg = useMemo(
    () =>
      [
        [0, 0, -half],
        [0, 0, half],
      ] as [number, number, number][],
    [half],
  );

  const tl = MAP_FRAME_TICK_LENGTH;
  const ts = MAP_FRAME_TICK_SPACING;
  const xTicks = useMemo(() => buildXAxisTickSegments(half, ts, tl), [half, ts, tl]);
  const zTicks = useMemo(() => buildZAxisTickSegments(half, ts, tl), [half, ts, tl]);
  const yTicks = useMemo(() => buildYAxisTickSegments(yh, ts, tl), [yh, ts, tl]);

  const xTickLabels = useMemo(() => {
    const n = Math.floor(half / ts);
    const rows: { key: string; text: string; pos: [number, number, number] }[] = [];
    const off = tl / 2 + 0.42;
    for (let i = -n; i <= n; i += 1) {
      const x = i * ts;
      rows.push({
        key: `x${x}`,
        text: String(x),
        pos: [x, 0.14, off],
      });
    }
    return rows;
  }, [half, ts, tl]);

  const zTickLabels = useMemo(() => {
    const n = Math.floor(half / ts);
    const rows: { key: string; text: string; pos: [number, number, number] }[] = [];
    const off = tl / 2 + 0.42;
    for (let i = -n; i <= n; i += 1) {
      const z = i * ts;
      rows.push({
        key: `z${z}`,
        text: String(z),
        pos: [off, 0.14, z],
      });
    }
    return rows;
  }, [half, ts, tl]);

  const yTickLabels = useMemo(() => {
    const n = Math.floor(yh / ts);
    const rows: { key: string; text: string; pos: [number, number, number] }[] = [];
    const off = tl / 2 + 0.42;
    for (let i = -n; i <= n; i += 1) {
      const y = i * ts;
      rows.push({
        key: `y${y}`,
        text: String(y),
        pos: [off, y, 0.14],
      });
    }
    return rows;
  }, [yh, ts, tl]);

  return (
    <group ref={groupRef}>
      <Line points={xSeg} color={cx} lineWidth={lw} depthTest depthWrite={false} transparent opacity={0.95} />
      <Line points={ySeg} color={cy} lineWidth={lw} depthTest depthWrite={false} transparent opacity={0.95} />
      <Line points={zSeg} color={cz} lineWidth={lw} depthTest depthWrite={false} transparent opacity={0.95} />
      <Line
        segments
        points={xTicks}
        color={MAP_FRAME_TICK_COLOR}
        lineWidth={MAP_FRAME_TICK_LINE_WIDTH}
        depthTest
        depthWrite={false}
        transparent
        opacity={0.92}
      />
      <Line
        segments
        points={yTicks}
        color={MAP_FRAME_TICK_COLOR}
        lineWidth={MAP_FRAME_TICK_LINE_WIDTH}
        depthTest
        depthWrite={false}
        transparent
        opacity={0.92}
      />
      <Line
        segments
        points={zTicks}
        color={MAP_FRAME_TICK_COLOR}
        lineWidth={MAP_FRAME_TICK_LINE_WIDTH}
        depthTest
        depthWrite={false}
        transparent
        opacity={0.92}
      />
      {xTickLabels.map(({ key, text, pos }) => (
        <AxisTickLabel key={key} position={pos} text={text} />
      ))}
      {zTickLabels.map(({ key, text, pos }) => (
        <AxisTickLabel key={key} position={pos} text={text} />
      ))}
      {yTickLabels.map(({ key, text, pos }) => (
        <AxisTickLabel key={key} position={pos} text={text} />
      ))}
    </group>
  );
}

/**
 * Center panel: WebGL viewport (React Three Fiber) with orbit controls and infinite grid.
 * Meshes carry `userData.nodeId` for picking; canvas background click clears selection.
 */

import { CameraFocusSync } from "@/components/CameraFocusSync";
import { useEditorStore } from "@/store/useEditorStore";
import { buildArrowPolygonFillGeometry } from "@/scene/arrowPolygonFill";
import type { SceneNode, Vec3 } from "@/scene/types";
import { Canvas, type ThreeEvent, useFrame } from "@react-three/fiber";
import { Billboard, Edges, GizmoHelper, GizmoViewport, Grid, Line, OrbitControls, Text } from "@react-three/drei";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { DoubleSide, Vector3 } from "three";
import type { Group } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Vector3Tuple } from "three";

function vec3Or(a: readonly [number, number, number] | undefined, d: Vector3Tuple): Vector3Tuple {
  if (!a) {
    return d;
  }
  return [a[0], a[1], a[2]];
}

function asVec3List(value: unknown): Vec3[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (v): v is Vec3 =>
      Array.isArray(v) &&
      v.length === 3 &&
      typeof v[0] === "number" &&
      typeof v[1] === "number" &&
      typeof v[2] === "number",
  );
}

const LINE_HOVER_COLOR = "#7aaeff";
const MIN_HIT_WIDTH = 8;
const HIT_SCALE = 6;
const SELECT_BASE_COLOR = "#00d4ff";

interface PickableLineProps {
  readonly nodeId: string;
  readonly points: readonly Vec3[];
  readonly color: string;
  readonly lineWidth: number;
  readonly isSelected: boolean;
  readonly selectedPulse: number;
  readonly disabled: boolean;
  readonly onSelect: (e: ThreeEvent<MouseEvent>) => void;
}

/**
 * Two-layer line picking:
 * - visible line keeps intended styling
 * - transparent fat line improves hit test area, with distance-adaptive width
 */
function PickableLine({ nodeId, points, color, lineWidth, isSelected, selectedPulse, disabled, onSelect }: PickableLineProps) {
  const [hovered, setHovered] = useState(false);
  const hitWidth = Math.max(lineWidth * HIT_SCALE, MIN_HIT_WIDTH);

  const selectedEdgeColor = selectedPulse > 0.5 ? "#ffea00" : "#ff3b9a";
  const visibleColor = isSelected ? SELECT_BASE_COLOR : hovered ? LINE_HOVER_COLOR : color;
  const visibleWidth = hovered && !isSelected ? lineWidth * 1.25 : lineWidth;

  return (
    <>
      <Line
        userData={{ nodeId }}
        points={points}
        color={visibleColor}
        lineWidth={visibleWidth}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (disabled) {
            return;
          }
          setHovered(true);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          if (disabled) {
            return;
          }
          setHovered(false);
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) {
            return;
          }
          onSelect(e);
        }}
      />
      {isSelected ? (
        <Line
          userData={{ nodeId }}
          points={points}
          color={selectedEdgeColor}
          lineWidth={Math.max(visibleWidth * (1.6 + selectedPulse * 0.6), visibleWidth + 1.5)}
          transparent
          opacity={0.78 + selectedPulse * 0.22}
          depthTest={false}
          renderOrder={998}
        />
      ) : null}
      <Line
        userData={{ nodeId }}
        points={points}
        color="#ffffff"
        lineWidth={hitWidth}
        transparent
        opacity={0.001}
        depthTest={false}
        renderOrder={999}
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (disabled) {
            return;
          }
          setHovered(true);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          if (disabled) {
            return;
          }
          setHovered(false);
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) {
            return;
          }
          onSelect(e);
        }}
      />
    </>
  );
}

interface SceneNodeViewProps {
  readonly node: SceneNode;
  readonly ancestorHidden?: boolean;
}

interface SceneNodeViewContentProps {
  readonly node: SceneNode;
  readonly isSelected: boolean;
  readonly selectedPulse: number;
  readonly ancestorHidden: boolean;
}

/**
 * Same order as GizmoViewport `axisColors`: X 前, Y 上, Z 右 — keep in sync with top-right gizmo.
 */
const GIZMO_VIEWPORT_AXIS_COLORS = ["#ff4b4b", "#7bed4b", "#4ba3ff"] as const;

/** Matches `Grid` fadeDistance so ground axes span the visible grid region. */
const SCENE_GRID_FADE_DISTANCE = 420;

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
  for (let i = -n; i <= n; i++) {
    const x = i * spacing;
    out.push([x, 0, -tickLen / 2], [x, 0, tickLen / 2]);
  }
  return out;
}

function buildZAxisTickSegments(half: number, spacing: number, tickLen: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  const n = Math.floor(half / spacing);
  for (let i = -n; i <= n; i++) {
    const z = i * spacing;
    out.push([-tickLen / 2, 0, z], [tickLen / 2, 0, z]);
  }
  return out;
}

function buildYAxisTickSegments(yHalf: number, spacing: number, tickLen: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  const n = Math.floor(yHalf / spacing);
  for (let i = -n; i <= n; i++) {
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

/**
 * Keeps tick label apparent size on screen roughly constant: scale ∝ distance to camera
 * (counteracts perspective shrink when zooming out / raising the camera).
 */
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
 * Infinite ground grid; visibility follows scene-tree eye (default on).
 */
function SceneBackgroundGridNodeView({ node, ancestorHidden }: Pick<SceneNodeViewContentProps, "node" | "ancestorHidden">) {
  const hidden = useEditorStore((s) => s.hiddenNodeIds.has(node.id));
  const nodeHidden = ancestorHidden || hidden;
  const visible = !nodeHidden;
  const groupRef = useRef<Group>(null);

  useLayoutEffect(() => {
    stripRaycastFromSubtree(groupRef.current);
    const id = requestAnimationFrame(() => stripRaycastFromSubtree(groupRef.current));
    return () => cancelAnimationFrame(id);
  }, [visible]);

  return (
    <group ref={groupRef} visible={visible}>
      <Grid
        infiniteGrid
        fadeDistance={SCENE_GRID_FADE_DISTANCE}
        fadeStrength={1.25}
        cellSize={1}
        cellThickness={0.55}
        cellColor="#424242"
        sectionSize={10}
        sectionThickness={1.05}
        sectionColor="#4f6fa8"
        position={[0, 0, 0]}
      />
      {node.children.map((c) => (
        <SceneNodeView key={c.id} node={c} ancestorHidden={nodeHidden} />
      ))}
    </group>
  );
}

/**
 * Full-span map-frame axes at origin: X/Z along ground to ±grid fade; Y from -50m to +50m.
 * Not raycastable (does not participate in viewport selection).
 */
function MapFrameAxesNodeView({ node, ancestorHidden }: Pick<SceneNodeViewContentProps, "node" | "ancestorHidden">) {
  const hidden = useEditorStore((s) => s.hiddenNodeIds.has(node.id));
  const nodeHidden = ancestorHidden || hidden;
  const visible = !nodeHidden;
  const groupRef = useRef<Group>(null);
  const half = SCENE_GRID_FADE_DISTANCE;
  const yh = MAP_FRAME_Y_HALF_EXTENT;
  const [cx, cy, cz] = GIZMO_VIEWPORT_AXIS_COLORS;
  const lw = MAP_FRAME_AXIS_LINE_WIDTH;

  useLayoutEffect(() => {
    stripRaycastFromSubtree(groupRef.current);
    const id = requestAnimationFrame(() => stripRaycastFromSubtree(groupRef.current));
    return () => cancelAnimationFrame(id);
  }, [visible]);

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
    for (let i = -n; i <= n; i++) {
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
    for (let i = -n; i <= n; i++) {
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
    for (let i = -n; i <= n; i++) {
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
    <group ref={groupRef} visible={visible}>
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
      {node.children.map((c) => (
        <SceneNodeView key={c.id} node={c} ancestorHidden={nodeHidden} />
      ))}
    </group>
  );
}

function SceneNodeViewContentRouter(props: SceneNodeViewContentProps) {
  if (props.node.type === "sceneBackgroundGrid") {
    return <SceneBackgroundGridNodeView node={props.node} ancestorHidden={props.ancestorHidden} />;
  }
  if (props.node.type === "mapFrameAxes") {
    return <MapFrameAxesNodeView node={props.node} ancestorHidden={props.ancestorHidden} />;
  }
  return <SceneNodeViewContentMain {...props} />;
}

/**
 * Recursively mounts groups and pickable placeholder meshes for the logical scene graph.
 */
function SceneNodeViewContentMain({ node, isSelected, selectedPulse, ancestorHidden }: SceneNodeViewContentProps) {
  const setSelectedNodeId = useEditorStore((s) => s.setSelectedNodeId);
  const hidden = useEditorStore((s) => s.hiddenNodeIds.has(node.id));
  const activeRegionFilterId = useEditorStore((s) => s.activeRegionFilterId);

  const position = useMemo(() => vec3Or(node.transform?.position, [0, 0, 0]), [node.transform?.position]);
  const scale = useMemo(() => vec3Or(node.transform?.scale, [1, 1, 1]), [node.transform?.scale]);
  const rotation = useMemo(() => vec3Or(node.transform?.rotation, [0, 0, 0]), [node.transform?.rotation]);

  const isMesh = node.type === "mesh";
  const isPolyline = node.type === "polyline";
  const isParkingSlot = node.type === "parkingSlot";
  const isPillar = node.type === "pillar";
  const isVolumeGeometry = isPillar || isMesh;
  const pts = node.polylinePoints;
  const rectRole = node.payload?.role as "bump" | "crossWalk" | undefined;
  const isLaneLine = node.payload?.role === "laneLine";
  const isRoadBoundaryLine = node.payload?.role === "roadBoundaryLine";
  const isRoadBoundaryRefTrajectory = node.payload?.role === "roadBoundaryRefTrajectory";
  const isTumTrajectory = node.payload?.role === "tumTrajectory";
  const isMapTrajectory = node.payload?.role === "mapTrajectory";
  const payload = node.payload as Record<string, unknown> | undefined;
  const centerScene = payload?.centerScene as Vector3Tuple | undefined;
  const leftBoundaryPointsRaw = payload?.leftBoundaryPoints;
  const rightBoundaryPointsRaw = payload?.rightBoundaryPoints;
  const mergedLeftBoundaryPoints = useMemo(() => asVec3List(leftBoundaryPointsRaw), [leftBoundaryPointsRaw]);
  const mergedRightBoundaryPoints = useMemo(() => asVec3List(rightBoundaryPointsRaw), [rightBoundaryPointsRaw]);
  const hasMergedRoadBoundary =
    isRoadBoundaryLine && (mergedLeftBoundaryPoints.length >= 2 || mergedRightBoundaryPoints.length >= 2);
  const regionIdVal = payload?.regionID;
  const hiddenByRegionFilter =
    activeRegionFilterId !== null &&
    typeof regionIdVal === "number" &&
    regionIdVal !== activeRegionFilterId;

  const disabledByRegion = hiddenByRegionFilter;
  const nodeHidden = ancestorHidden || hidden;
  const nodeDisabled = nodeHidden || disabledByRegion;

  const quadFillGeo = useMemo(() => {
    if (
      !pts ||
      pts.length < 3 ||
      isLaneLine ||
      isRoadBoundaryLine ||
      isRoadBoundaryRefTrajectory ||
      isTumTrajectory ||
      isMapTrajectory
    ) {
      return null;
    }
    if (isPolyline || isParkingSlot) {
      return buildArrowPolygonFillGeometry(pts);
    }
    return null;
  }, [
    pts,
    isLaneLine,
    isRoadBoundaryLine,
    isRoadBoundaryRefTrajectory,
    isParkingSlot,
    isPolyline,
    isTumTrajectory,
    isMapTrajectory,
  ]);

  useEffect(() => {
    return () => {
      quadFillGeo?.dispose();
    };
  }, [quadFillGeo]);

  const onMeshClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      // Even if we keep objects mounted for perf, hidden nodes must not be selectable.
      if (nodeDisabled) {
        return;
      }
      setSelectedNodeId(node.id);
    },
    [nodeDisabled, node.id, setSelectedNodeId],
  );

  const selectedEdgeColor = selectedPulse > 0.5 ? "#ffea00" : "#ff3b9a";

  const visible = !nodeDisabled;

  const parkingSlotEdgeSegments = useMemo(() => {
    if (!pts || pts.length < 4) {
      return [];
    }
    return [
      [pts[0]!, pts[1]!],
      [pts[1]!, pts[2]!],
      [pts[2]!, pts[3]!],
      [pts[3]!, pts[0]!],
    ] as const;
  }, [pts]);

  return (
    <group
      userData={{ nodeId: node.id }}
      position={position}
      scale={scale}
      rotation={rotation}
      visible={visible}
    >
      {isPolyline && hasMergedRoadBoundary ? (
        <>
          {mergedLeftBoundaryPoints.length >= 2 ? (
            <PickableLine
              nodeId={node.id}
              points={mergedLeftBoundaryPoints}
              color={String(payload?.roadLinkColor ?? "#cccccc")}
              lineWidth={isSelected ? 3 : 1.5}
              isSelected={isSelected}
              selectedPulse={selectedPulse}
              onSelect={onMeshClick}
              disabled={nodeDisabled}
            />
          ) : null}
          {mergedRightBoundaryPoints.length >= 2 ? (
            <PickableLine
              nodeId={node.id}
              points={mergedRightBoundaryPoints}
              color={String(payload?.roadLinkColor ?? "#cccccc")}
              lineWidth={isSelected ? 3 : 1.5}
              isSelected={isSelected}
              selectedPulse={selectedPulse}
              onSelect={onMeshClick}
              disabled={nodeDisabled}
            />
          ) : null}
        </>
      ) : null}
      {isPolyline && isRoadBoundaryLine && !hasMergedRoadBoundary && pts && pts.length >= 2 ? (
        <PickableLine
          nodeId={node.id}
          points={pts}
          color={String(payload?.roadLinkColor ?? "#cccccc")}
          lineWidth={isSelected ? 3 : 1.5}
          isSelected={isSelected}
          selectedPulse={selectedPulse}
          onSelect={onMeshClick}
          disabled={nodeDisabled}
        />
      ) : null}
      {isPolyline && isLaneLine && pts && pts.length >= 2 ? (
        <PickableLine
          nodeId={node.id}
          points={pts}
          color="#ffffff"
          lineWidth={isSelected ? 3 : 1.5}
          isSelected={isSelected}
          selectedPulse={selectedPulse}
          onSelect={onMeshClick}
          disabled={nodeDisabled}
        />
      ) : null}
      {isPolyline && isTumTrajectory && pts && pts.length >= 2 ? (
        <PickableLine
          nodeId={node.id}
          points={pts}
          color={String(payload?.color ?? "#e74c3c")}
          lineWidth={isSelected ? 3.5 : 2.25}
          isSelected={isSelected}
          selectedPulse={selectedPulse}
          onSelect={onMeshClick}
          disabled={nodeDisabled}
        />
      ) : null}
      {isPolyline && isMapTrajectory && pts && pts.length >= 2 ? (
        <PickableLine
          nodeId={node.id}
          points={pts}
          color={String(payload?.color ?? "#e67e22")}
          lineWidth={isSelected ? 3.25 : 2.1}
          isSelected={isSelected}
          selectedPulse={selectedPulse}
          onSelect={onMeshClick}
          disabled={nodeDisabled}
        />
      ) : null}
      {isPolyline && isRoadBoundaryRefTrajectory && pts && pts.length >= 2 ? (
        <PickableLine
          nodeId={node.id}
          points={pts}
          color={String(payload?.roadLinkColor ?? "#cccccc")}
          lineWidth={isSelected ? 9 : 4.5}
          isSelected={isSelected}
          selectedPulse={selectedPulse}
          onSelect={onMeshClick}
          disabled={nodeDisabled}
        />
      ) : null}
      {isPolyline && !isLaneLine && quadFillGeo ? (
        <mesh userData={{ nodeId: node.id }} geometry={quadFillGeo} onClick={onMeshClick}>
          <meshStandardMaterial
            color={
              isSelected
                ? SELECT_BASE_COLOR
                : rectRole === "bump"
                  ? "#6ec96e"
                  : rectRole === "crossWalk"
                    ? "#d0d8f0"
                    : "#e8a028"
            }
            metalness={0.08}
            roughness={0.55}
            emissive={
              isSelected ? selectedEdgeColor : rectRole === "bump" ? "#0a2a0a" : rectRole === "crossWalk" ? "#202830" : "#2a1a05"
            }
            emissiveIntensity={
              isSelected ? 0.45 + selectedPulse * 0.4 : rectRole === "bump" ? 0.1 : rectRole === "crossWalk" ? 0.06 : 0.12
            }
            side={DoubleSide}
          />
        </mesh>
      ) : null}
      {isParkingSlot && quadFillGeo && pts && pts.length >= 4 ? (
        <>
          <mesh
            userData={{ nodeId: node.id }}
            geometry={quadFillGeo}
            onClick={onMeshClick}
            renderOrder={0}
          >
            <meshStandardMaterial
              color={isSelected ? SELECT_BASE_COLOR : "#5a9fd4"}
              metalness={0.06}
              roughness={0.5}
              transparent
              opacity={0.2}
              depthWrite={false}
              side={DoubleSide}
            />
          </mesh>
          {parkingSlotEdgeSegments.map((seg, i) => (
            <PickableLine
              key={i}
              nodeId={node.id}
              points={seg as unknown as Vec3[]}
              color="#ffffff"
              lineWidth={isSelected ? 2.5 : 2}
              isSelected={isSelected}
              selectedPulse={selectedPulse}
              onSelect={onMeshClick}
              disabled={nodeDisabled}
            />
          ))}
          {centerScene ? (
            <group position={centerScene}>
              <Billboard follow>
                <Text
                  userData={{ nodeId: node.id }}
                  fontSize={0.42}
                  color="#f0f4f8"
                  anchorX="center"
                  anchorY="middle"
                  outlineWidth={0.035}
                  outlineColor="#0a0a0c"
                  onClick={onMeshClick}
                >
                  {String(payload?.id ?? "")}
                </Text>
              </Billboard>
            </group>
          ) : null}
        </>
      ) : null}
      {isPillar &&
      payload &&
      typeof payload.length === "number" &&
      typeof payload.width === "number" &&
      typeof payload.height === "number" ? (
        <mesh
          userData={{ nodeId: node.id }}
          position={[0, payload.height * 0.5, 0]}
          onClick={onMeshClick}
        >
          <boxGeometry args={[payload.length, payload.height, payload.width]} />
          <meshStandardMaterial
            color={isSelected ? SELECT_BASE_COLOR : "#8a9aac"}
            metalness={0.08}
            roughness={0.52}
            transparent
            opacity={0.9}
            depthWrite={false}
            side={DoubleSide}
            emissive={isSelected ? selectedEdgeColor : "#000000"}
            emissiveIntensity={isSelected ? 0.45 + selectedPulse * 0.35 : 0}
          />
          {isSelected && isVolumeGeometry ? (
            <Edges scale={1.03} threshold={8} color={selectedEdgeColor} />
          ) : null}
        </mesh>
      ) : null}
      {isMesh ? (
        <mesh userData={{ nodeId: node.id }} onClick={onMeshClick}>
          <boxGeometry args={[0.7, 0.7, 0.7]} />
          <meshStandardMaterial
            color={isSelected ? SELECT_BASE_COLOR : "#a8a8a8"}
            metalness={0.12}
            roughness={0.65}
            emissive={isSelected ? selectedEdgeColor : "#1a1a1a"}
            emissiveIntensity={isSelected ? 0.35 + selectedPulse * 0.35 : 1}
          />
          {isSelected && isVolumeGeometry ? (
            <Edges scale={1.05} threshold={8} color={selectedEdgeColor} />
          ) : null}
        </mesh>
      ) : null}
      {node.children.map((c) => (
        <SceneNodeView key={c.id} node={c} ancestorHidden={nodeHidden} />
      ))}
    </group>
  );
}

function SceneNodeViewAnimated({ node, ancestorHidden }: SceneNodeViewProps) {
  const [selectedPulse, setSelectedPulse] = useState(0);

  useFrame((state) => {
    const p = (Math.sin(state.clock.elapsedTime * 8) + 1) * 0.5;
    setSelectedPulse(p);
  });

  return (
    <SceneNodeViewContentRouter
      node={node}
      isSelected
      selectedPulse={selectedPulse}
      ancestorHidden={ancestorHidden ?? false}
    />
  );
}

function SceneNodeView({ node, ancestorHidden = false }: SceneNodeViewProps) {
  const selectedId = useEditorStore((s) => s.selectedNodeId);
  const isSelected = selectedId === node.id;

  if (!isSelected) {
    return (
      <SceneNodeViewContentRouter node={node} isSelected={false} selectedPulse={0} ancestorHidden={ancestorHidden} />
    );
  }

  return <SceneNodeViewAnimated node={node} ancestorHidden={ancestorHidden} />;
}

function SceneContent() {
  const root = useEditorStore((s) => s.sceneGraphRoot);

  if (!root) {
    return null;
  }
  return (
    <>
      <color attach="background" args={["#222226"]} />
      {/* Brighter, multi-source lighting so placeholder meshes read clearly */}
      <hemisphereLight args={["#e8eef8", "#2a2a2a", 0.72]} />
      <ambientLight intensity={0.58} />
      <directionalLight position={[14, 26, 18]} intensity={1.65} color="#ffffff" />
      <directionalLight position={[-16, 12, -12]} intensity={0.52} color="#c8d8ff" />
      <directionalLight position={[0, 8, -22]} intensity={0.38} color="#ffe8d0" />
      {/* Infinite grid is rendered under scene root as `sceneBackgroundGrid` (see SceneBackgroundGridNodeView). */}
      {/* Gizmo follows mapJsonPointToThree: scene X=file x(前), Y=file z(上), Z=-file y(右) */}
      <GizmoHelper alignment="top-right" margin={[72, 72]}>
        <GizmoViewport
          labels={["前", "上", "右"]}
          axisColors={[...GIZMO_VIEWPORT_AXIS_COLORS]}
          labelColor="#e8e8e8"
        />
      </GizmoHelper>
      <SceneNodeView node={root} />
    </>
  );
}

const MAX_ORBIT_DISTANCE = 200;
const MAX_CAMERA_Y = 465;

/** Wheel zoom speed scales ~linearly with camera–target distance; max zoom out via maxDistance; max altitude via Y clamp. */
function OrbitControlsAdaptive({ controlsRef }: { readonly controlsRef: MutableRefObject<OrbitControlsImpl | null> }) {
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
      minDistance={1.2}
      maxDistance={MAX_ORBIT_DISTANCE}
      minPolarAngle={0.08}
      maxPolarAngle={Math.PI * 0.499}
    />
  );
}

function ViewportRig() {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  return (
    <>
      <OrbitControlsAdaptive controlsRef={controlsRef} />
      <CameraFocusSync controlsRef={controlsRef} />
    </>
  );
}

export function Viewport3D() {
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const hasDoc = useEditorStore((s) => s.sceneGraphRoot !== null);

  return (
    <div className="viewport-wrap" style={{ flex: "1 1 auto", minHeight: 0 }}>
      {hasDoc ? (
        <Canvas
          camera={{ position: [12, 10, 14], fov: 50, near: 0.1, far: 500 }}
          gl={{ antialias: true, alpha: false }}
          onPointerMissed={() => clearSelection()}
        >
          <ViewportRig />
          <SceneContent />
        </Canvas>
      ) : (
        <div className="inspector-empty" style={{ padding: 24 }}>
          加载 JSON 后，此处显示 3D 预览（占位几何体）。
        </div>
      )}
    </div>
  );
}

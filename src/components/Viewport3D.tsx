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
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { DoubleSide } from "three";
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
  readonly onSelect: (e: ThreeEvent<MouseEvent>) => void;
}

/**
 * Two-layer line picking:
 * - visible line keeps intended styling
 * - transparent fat line improves hit test area, with distance-adaptive width
 */
function PickableLine({ nodeId, points, color, lineWidth, isSelected, selectedPulse, onSelect }: PickableLineProps) {
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
          setHovered(true);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
        }}
        onClick={onSelect}
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
          setHovered(true);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
        }}
        onClick={onSelect}
      />
    </>
  );
}

interface SceneNodeViewProps {
  readonly node: SceneNode;
}

/**
 * Recursively mounts groups and pickable placeholder meshes for the logical scene graph.
 */
function SceneNodeView({ node }: SceneNodeViewProps) {
  const setSelectedNodeId = useEditorStore((s) => s.setSelectedNodeId);
  const selectedId = useEditorStore((s) => s.selectedNodeId);
  const hidden = useEditorStore((s) => s.hiddenNodeIds.has(node.id));
  const activeRegionFilterId = useEditorStore((s) => s.activeRegionFilterId);

  const position = useMemo(() => vec3Or(node.transform?.position, [0, 0, 0]), [node.transform?.position]);
  const scale = useMemo(() => vec3Or(node.transform?.scale, [1, 1, 1]), [node.transform?.scale]);
  const rotation = useMemo(() => vec3Or(node.transform?.rotation, [0, 0, 0]), [node.transform?.rotation]);

  const onMeshClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      setSelectedNodeId(node.id);
    },
    [node.id, setSelectedNodeId],
  );

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
  const isSelected = selectedId === node.id;
  const [selectedPulse, setSelectedPulse] = useState(0);
  const payload = node.payload as Record<string, unknown> | undefined;
  const centerScene = payload?.centerScene as Vector3Tuple | undefined;
  const mergedLeftBoundaryPoints = asVec3List(payload?.leftBoundaryPoints);
  const mergedRightBoundaryPoints = asVec3List(payload?.rightBoundaryPoints);
  const hasMergedRoadBoundary =
    isRoadBoundaryLine && (mergedLeftBoundaryPoints.length >= 2 || mergedRightBoundaryPoints.length >= 2);
  const regionIdVal = payload?.regionID;
  const hiddenByRegionFilter =
    activeRegionFilterId !== null &&
    typeof regionIdVal === "number" &&
    regionIdVal !== activeRegionFilterId;

  const quadFillGeo = useMemo(() => {
    if (!pts || pts.length < 3 || isLaneLine || isRoadBoundaryLine || isRoadBoundaryRefTrajectory || isTumTrajectory) {
      return null;
    }
    if (isPolyline || isParkingSlot) {
      return buildArrowPolygonFillGeometry(pts);
    }
    return null;
  }, [pts, isLaneLine, isRoadBoundaryLine, isRoadBoundaryRefTrajectory, isParkingSlot, isPolyline, isTumTrajectory]);

  useEffect(() => {
    return () => {
      quadFillGeo?.dispose();
    };
  }, [quadFillGeo]);

  useFrame((state) => {
    if (!isSelected) {
      if (selectedPulse !== 0) {
        setSelectedPulse(0);
      }
      return;
    }
    const p = (Math.sin(state.clock.elapsedTime * 8) + 1) * 0.5;
    setSelectedPulse(p);
  });

  const selectedEdgeColor = selectedPulse > 0.5 ? "#ffea00" : "#ff3b9a";

  if (hidden || hiddenByRegionFilter) {
    return null;
  }

  return (
    <group userData={{ nodeId: node.id }} position={position} scale={scale} rotation={rotation}>
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
          {[0, 1, 2, 3].map((i) => (
            <PickableLine
              key={i}
              nodeId={node.id}
              points={[pts[i]!, pts[(i + 1) % 4]!]}
              color="#ffffff"
              lineWidth={isSelected ? 2.5 : 2}
              isSelected={isSelected}
              selectedPulse={selectedPulse}
              onSelect={onMeshClick}
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
        <SceneNodeView key={c.id} node={c} />
      ))}
    </group>
  );
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
      {/* Infinite grid only (no solid plane); large fade for “endless” feel */}
      <Grid
        infiniteGrid
        fadeDistance={420}
        fadeStrength={1.25}
        cellSize={1}
        cellThickness={0.55}
        cellColor="#424242"
        sectionSize={10}
        sectionThickness={1.05}
        sectionColor="#4f6fa8"
        position={[0, 0, 0]}
      />
      {/* Gizmo follows mapJsonPointToThree: scene X=file x(前), Y=file z(上), Z=-file y(右) */}
      <GizmoHelper alignment="top-right" margin={[72, 72]}>
        <GizmoViewport
          labels={["前", "上", "右"]}
          axisColors={["#ff4b4b", "#7bed4b", "#4ba3ff"]}
          labelColor="#e8e8e8"
        />
      </GizmoHelper>
      <SceneNodeView node={root} />
    </>
  );
}

const MAX_ORBIT_DISTANCE = 200;
const MAX_CAMERA_Y = 155;

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

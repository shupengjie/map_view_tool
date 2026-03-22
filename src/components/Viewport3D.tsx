/**
 * Center panel: WebGL viewport (React Three Fiber) with orbit controls and infinite grid.
 * Meshes carry `userData.nodeId` for picking; canvas background click clears selection.
 */

import { CameraFocusSync } from "@/components/CameraFocusSync";
import { useEditorStore } from "@/store/useEditorStore";
import { buildArrowPolygonFillGeometry } from "@/scene/arrowPolygonFill";
import type { SceneNode } from "@/scene/types";
import { Canvas, type ThreeEvent, useFrame } from "@react-three/fiber";
import { Billboard, GizmoHelper, GizmoViewport, Grid, Line, OrbitControls, Text } from "@react-three/drei";
import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { DoubleSide } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Vector3Tuple } from "three";

function vec3Or(a: readonly [number, number, number] | undefined, d: Vector3Tuple): Vector3Tuple {
  if (!a) {
    return d;
  }
  return [a[0], a[1], a[2]];
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
  const pts = node.polylinePoints;
  const rectRole = node.payload?.role as "bump" | "crossWalk" | undefined;
  const isLaneLine = node.payload?.role === "laneLine";
  const isRoadBoundaryLine = node.payload?.role === "roadBoundaryLine";
  const isTumTrajectory = node.payload?.role === "tumTrajectory";
  const isSelected = selectedId === node.id;
  const payload = node.payload as Record<string, unknown> | undefined;
  const centerScene = payload?.centerScene as Vector3Tuple | undefined;
  const regionIdVal = payload?.regionID;
  const hiddenByRegionFilter =
    activeRegionFilterId !== null &&
    typeof regionIdVal === "number" &&
    regionIdVal !== activeRegionFilterId;

  const quadFillGeo = useMemo(() => {
    if (!pts || pts.length < 3 || isLaneLine || isRoadBoundaryLine || isTumTrajectory) {
      return null;
    }
    if (isPolyline || isParkingSlot) {
      return buildArrowPolygonFillGeometry(pts);
    }
    return null;
  }, [pts, isLaneLine, isRoadBoundaryLine, isParkingSlot, isPolyline, isTumTrajectory]);

  useEffect(() => {
    return () => {
      quadFillGeo?.dispose();
    };
  }, [quadFillGeo]);

  if (hidden || hiddenByRegionFilter) {
    return null;
  }

  return (
    <group userData={{ nodeId: node.id }} position={position} scale={scale} rotation={rotation}>
      {isPolyline && isRoadBoundaryLine && pts && pts.length >= 2 ? (
        <Line
          userData={{ nodeId: node.id }}
          points={pts}
          color={isSelected ? "#478cbf" : String(payload?.roadLinkColor ?? "#cccccc")}
          lineWidth={isSelected ? 3 : 1.5}
          onClick={onMeshClick}
        />
      ) : null}
      {isPolyline && isLaneLine && pts && pts.length >= 2 ? (
        <Line
          userData={{ nodeId: node.id }}
          points={pts}
          color={isSelected ? "#478cbf" : "#ffffff"}
          lineWidth={isSelected ? 3 : 1.5}
          onClick={onMeshClick}
        />
      ) : null}
      {isPolyline && isTumTrajectory && pts && pts.length >= 2 ? (
        <Line
          userData={{ nodeId: node.id }}
          points={pts}
          color={isSelected ? "#478cbf" : String(payload?.color ?? "#e74c3c")}
          lineWidth={isSelected ? 3.5 : 2.25}
          onClick={onMeshClick}
        />
      ) : null}
      {isPolyline && !isLaneLine && quadFillGeo ? (
        <mesh userData={{ nodeId: node.id }} geometry={quadFillGeo} onClick={onMeshClick}>
          <meshStandardMaterial
            color={
              isSelected
                ? "#478cbf"
                : rectRole === "bump"
                  ? "#6ec96e"
                  : rectRole === "crossWalk"
                    ? "#d0d8f0"
                    : "#e8a028"
            }
            metalness={0.08}
            roughness={0.55}
            emissive={
              isSelected ? "#1a3a55" : rectRole === "bump" ? "#0a2a0a" : rectRole === "crossWalk" ? "#202830" : "#2a1a05"
            }
            emissiveIntensity={
              isSelected ? 0.25 : rectRole === "bump" ? 0.1 : rectRole === "crossWalk" ? 0.06 : 0.12
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
              color={isSelected ? "#478cbf" : "#5a9fd4"}
              metalness={0.06}
              roughness={0.5}
              transparent
              opacity={0.2}
              depthWrite={false}
              side={DoubleSide}
            />
          </mesh>
          {[0, 1, 2, 3].map((i) => (
            <Line
              key={i}
              userData={{ nodeId: node.id }}
              points={[pts[i]!, pts[(i + 1) % 4]!]}
              color={isSelected ? "#478cbf" : "#ffffff"}
              lineWidth={isSelected ? 2.5 : 2}
              onClick={onMeshClick}
              renderOrder={2}
              depthTest
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
            color={isSelected ? "#478cbf" : "#8a9aac"}
            metalness={0.08}
            roughness={0.52}
            transparent
            opacity={0.9}
            depthWrite={false}
            side={DoubleSide}
          />
        </mesh>
      ) : null}
      {isMesh ? (
        <mesh userData={{ nodeId: node.id }} onClick={onMeshClick}>
          <boxGeometry args={[0.7, 0.7, 0.7]} />
          <meshStandardMaterial
            color={isSelected ? "#478cbf" : "#a8a8a8"}
            metalness={0.12}
            roughness={0.65}
            emissive={isSelected ? "#1a3a55" : "#1a1a1a"}
          />
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
      {/* Gizmo matches JSON axes via mapJsonPointToThree: scene X=file x(前), Y=file z(上), Z=file y(左) */}
      <GizmoHelper alignment="top-right" margin={[72, 72]}>
        <GizmoViewport
          labels={["X", "Z", "-Y"]}
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

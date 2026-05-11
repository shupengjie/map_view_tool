/**
 * Renders one user-placed pin as a small positive-direction RGB triad authored in the **map frame**.
 * All map↔scene coordinate conversion goes through `<MapFrameGroup>` (which uses
 * `@/adapters/mapFrame` internally) — see that module for the frame convention. With the group
 * doing the basis change, the three axis lines below stay in map-frame local coords:
 *
 *   Red   → pin's X axis (map 前)
 *   Green → pin's Z axis (map 上)
 *   Blue  → pin's Y axis (map 左)
 *
 * Color order mirrors the top-right `GizmoViewport` (R=前, G=上, B=左/横向), so the pin reads
 * naturally against the world gizmo regardless of orientation.
 */

import { MapFrameGroup } from "@/components/MapFrameGroup";
import { GIZMO_VIEWPORT_AXIS_COLORS } from "@/components/MapFrameAxes";
import {
  VIEWPORT_SMALL_SPHERE_H_SEGS,
  VIEWPORT_SMALL_SPHERE_W_SEGS,
} from "@/components/viewport/viewportShared";
import type { SceneNode } from "@/scene/types";
import { useEditorStore } from "@/store/useEditorStore";
import { Line } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useCallback, useMemo } from "react";
import type { Vector3Tuple } from "three";

/** Visible length of each positive-direction pin axis (meters). */
const PIN_AXES_LENGTH = 1.25;
const PIN_AXES_LINE_WIDTH = 2.8;
const PIN_AXES_SELECTED_LINE_WIDTH = 4.6;
/** Invisible sphere collider radius for picking a pin (centered on its origin). */
const PIN_HIT_SPHERE_RADIUS = 0.35;

function asVec3Tuple(value: unknown, fallback: Vector3Tuple): Vector3Tuple {
  if (
    Array.isArray(value) &&
    value.length === 3 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    typeof value[2] === "number"
  ) {
    return [value[0], value[1], value[2]];
  }
  return fallback;
}

function asQuatTuple(value: unknown): [number, number, number, number] {
  if (
    Array.isArray(value) &&
    value.length === 4 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    typeof value[2] === "number" &&
    typeof value[3] === "number"
  ) {
    return [value[0], value[1], value[2], value[3]];
  }
  return [0, 0, 0, 1];
}

export function PinAxesNodeView({
  node,
  ancestorHidden,
  isSelected,
  selectedPulse,
}: {
  node: SceneNode;
  ancestorHidden: boolean;
  isSelected: boolean;
  selectedPulse: number;
}) {
  const setSelectedNodeId = useEditorStore((s) => s.setSelectedNodeId);
  const hidden = useEditorStore((s) => s.hiddenNodeIds.has(node.id));
  const nodeHidden = ancestorHidden || hidden;
  const visible = !nodeHidden;

  const payload = node.payload as Record<string, unknown> | undefined;
  const mapPosition = useMemo(() => asVec3Tuple(payload?.position, [0, 0, 0]), [payload?.position]);
  const mapQuaternion = useMemo(() => asQuatTuple(payload?.orientation), [payload?.orientation]);

  const [cx, cy, cz] = GIZMO_VIEWPORT_AXIS_COLORS;
  const lw = isSelected ? PIN_AXES_SELECTED_LINE_WIDTH : PIN_AXES_LINE_WIDTH;
  const selectedEdgeColor = selectedPulse > 0.5 ? "#ffea00" : "#ff3b9a";

  const onSelect = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (nodeHidden) {
        return;
      }
      setSelectedNodeId(node.id);
    },
    [nodeHidden, node.id, setSelectedNodeId],
  );

  // Children below are authored in MAP-frame local coords (see `<MapFrameGroup>`):
  //   X 前 axis (red)   → local +X
  //   Z 上 axis (green) → local +Z   (green follows the top-right gizmo's vertical axis)
  //   Y 左 axis (blue)  → local +Y   (blue takes the horizontal axis; +Y is map 左)
  const redLine = useMemo<Vector3Tuple[]>(() => [[0, 0, 0], [PIN_AXES_LENGTH, 0, 0]], []);
  const greenLine = useMemo<Vector3Tuple[]>(() => [[0, 0, 0], [0, 0, PIN_AXES_LENGTH]], []);
  const blueLine = useMemo<Vector3Tuple[]>(() => [[0, 0, 0], [0, PIN_AXES_LENGTH, 0]], []);

  return (
    <MapFrameGroup
      userData={{ nodeId: node.id }}
      mapPosition={mapPosition}
      mapQuaternion={mapQuaternion}
      visible={visible}
    >
      <Line userData={{ nodeId: node.id }} points={redLine} color={cx} lineWidth={lw} />
      <Line userData={{ nodeId: node.id }} points={greenLine} color={cy} lineWidth={lw} />
      <Line userData={{ nodeId: node.id }} points={blueLine} color={cz} lineWidth={lw} />
      {isSelected ? (
        <>
          <Line
            userData={{ nodeId: node.id }}
            points={redLine}
            color={selectedEdgeColor}
            lineWidth={lw + 2}
            transparent
            opacity={0.55 + selectedPulse * 0.35}
            depthTest={false}
            renderOrder={998}
          />
          <Line
            userData={{ nodeId: node.id }}
            points={greenLine}
            color={selectedEdgeColor}
            lineWidth={lw + 2}
            transparent
            opacity={0.55 + selectedPulse * 0.35}
            depthTest={false}
            renderOrder={998}
          />
          <Line
            userData={{ nodeId: node.id }}
            points={blueLine}
            color={selectedEdgeColor}
            lineWidth={lw + 2}
            transparent
            opacity={0.55 + selectedPulse * 0.35}
            depthTest={false}
            renderOrder={998}
          />
        </>
      ) : null}
      <mesh userData={{ nodeId: node.id }} onClick={onSelect}>
        <sphereGeometry
          args={[PIN_HIT_SPHERE_RADIUS, VIEWPORT_SMALL_SPHERE_W_SEGS, VIEWPORT_SMALL_SPHERE_H_SEGS]}
        />
        <meshBasicMaterial transparent opacity={0.001} depthWrite={false} depthTest={false} />
      </mesh>
    </MapFrameGroup>
  );
}

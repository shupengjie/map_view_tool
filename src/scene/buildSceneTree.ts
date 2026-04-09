/**
 * Combines all loaded JSON-derived trees under one scene root node.
 * Each file becomes a `type: "json"` child with its parsed subtree as descendants.
 * Optional TUM trajectories are grouped under a dedicated `轨迹` node.
 */

import {
  jsonDocumentWrapperId,
  MAP_FRAME_AXES_NODE_ID,
  SCENE_BACKGROUND_GRID_NODE_ID,
  SCENE_ROOT_ID,
  TRAJECTORY_ROOT_ID,
} from "@/scene/constants";
import type { SceneNode, Vec3 } from "@/scene/types";
import { isJsonMapFileName } from "@/utils/jsonMapFile";
import { isLayerDataJsonFileName } from "@/utils/layerDataFile";

/** Minimal slice needed to assemble the combined scene (avoids importing the store here). */
export interface DocumentSceneSlice {
  readonly id: string;
  readonly fileName: string;
  /** Parsed JSON subtree only (no application scene root wrapper). */
  readonly root: SceneNode;
}

/** One loaded TUM file → one polyline child under the trajectory root. */
export interface TumTrajectorySceneSlice {
  readonly id: string;
  readonly fileName: string;
  readonly color: string;
  readonly pointsScene: readonly Vec3[];
}

export function tumTrajectoryToSceneNode(t: TumTrajectorySceneSlice): SceneNode {
  return {
    id: `tum-traj-${t.id}`,
    name: t.fileName,
    type: "polyline",
    polylinePoints: t.pointsScene,
    children: [],
    payload: {
      role: "tumTrajectory",
      fileName: t.fileName,
      color: t.color,
      pointCount: t.pointsScene.length,
    },
  };
}

/**
 * Place each JSON file's content on a coarse XZ grid so multiple large maps stay separated in 3D.
 */
function jsonFileGridPosition(index: number, total: number): Vec3 {
  const cols = Math.ceil(Math.sqrt(Math.max(total, 1)));
  const row = Math.floor(index / cols);
  const col = index % cols;
  const spacing = 20;
  const offset = ((cols - 1) * spacing) / 2;
  return [col * spacing - offset, 0, row * spacing - offset] as const;
}

/** Same map frame as json_map: layer_data overlays it and must share one grid cell, not an adjacent slot. */
function isMapOverlayPairFile(fileName: string): boolean {
  return isJsonMapFileName(fileName) || isLayerDataJsonFileName(fileName);
}

/**
 * One grid slot per visual "map": json_map + layer_data for the same site share the same slot index.
 * Other JSON files keep one slot each, in load order.
 */
function gridSlotIndexPerDocument(documents: readonly DocumentSceneSlice[]): { slots: number[]; slotCount: number } {
  const slots: number[] = [];
  let nextSlot = 0;
  let mapOverlaySlot: number | null = null;
  for (const d of documents) {
    if (isMapOverlayPairFile(d.fileName)) {
      if (mapOverlaySlot === null) {
        mapOverlaySlot = nextSlot;
        nextSlot += 1;
      }
      slots.push(mapOverlaySlot);
    } else {
      slots.push(nextSlot);
      nextSlot += 1;
    }
  }
  return { slots, slotCount: nextSlot };
}

/**
 * Builds the single scene root whose children are one `json` node per loaded file,
 * plus an optional `轨迹` group for TUM polylines.
 */
export function buildSceneGraphRoot(
  documents: readonly DocumentSceneSlice[],
  tumTrajectories: readonly TumTrajectorySceneSlice[] = [],
): SceneNode {
  const { slots, slotCount } = gridSlotIndexPerDocument(documents);
  const jsonChildren: SceneNode[] = documents.map((d, index) => ({
    id: jsonDocumentWrapperId(d.id),
    name: d.fileName,
    type: "json",
    transform: {
      position: jsonFileGridPosition(slots[index]!, slotCount),
    },
    children: [d.root],
    payload: {
      role: "jsonFile",
      documentId: d.id,
      fileName: d.fileName,
    },
  }));

  const backgroundGridNode: SceneNode = {
    id: SCENE_BACKGROUND_GRID_NODE_ID,
    name: "背景网格",
    type: "sceneBackgroundGrid",
    children: [],
  };

  const mapFrameAxesNode: SceneNode = {
    id: MAP_FRAME_AXES_NODE_ID,
    name: "地图坐标轴",
    type: "mapFrameAxes",
    children: [],
  };

  const children: SceneNode[] = [backgroundGridNode, mapFrameAxesNode, ...jsonChildren];
  if (tumTrajectories.length > 0) {
    children.push({
      id: TRAJECTORY_ROOT_ID,
      name: "轨迹",
      type: "group",
      children: tumTrajectories.map(tumTrajectoryToSceneNode),
      payload: { role: "trajectoryRoot" },
    });
  }

  return {
    id: SCENE_ROOT_ID,
    name: "场景",
    type: "root",
    children,
    payload: { role: "sceneRoot" },
  };
}

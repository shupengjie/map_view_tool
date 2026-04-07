/**
 * Layer export JSON (`all_boundary_pts`, `all_lane_line_pts`, `center_nodes`) → scene graph.
 * `center_nodes[].out_nodes_idx` / `in_nodes_idx` refer to indices in the `center_nodes` array, not `id` fields.
 */

import { mapJsonPointToThree } from "@/adapters/mapJsonToScene";
import type { SceneNode, Vec3 } from "@/scene/types";

function newId(): string {
  return crypto.randomUUID();
}

function parseXYZPoint(raw: unknown): Vec3 | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const p = raw as Record<string, unknown>;
  if (typeof p.x !== "number" || typeof p.y !== "number" || typeof p.z !== "number") {
    return null;
  }
  return mapJsonPointToThree({ x: p.x, y: p.y, z: p.z });
}

/** Parses `{x,y,z}[]` into scene points; requires at least `minCount` valid entries (for point clouds or polylines). */
function parseXYZPointArray(raw: unknown, minCount: number): Vec3[] | null {
  if (!Array.isArray(raw) || raw.length < minCount) {
    return null;
  }
  const out: Vec3[] = [];
  for (const item of raw) {
    const pt = parseXYZPoint(item);
    if (pt) {
      out.push(pt);
    }
  }
  return out.length >= minCount ? out : null;
}

export function isLayerDataJsonRoot(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const o = value as Record<string, unknown>;
  return (
    Array.isArray(o.all_boundary_pts) ||
    Array.isArray(o.all_lane_line_pts) ||
    Array.isArray(o.center_nodes)
  );
}

export function parseLayerDataJsonToScene(parsed: Record<string, unknown>, documentName: string): SceneNode {
  const children: SceneNode[] = [];

  const boundaryPts = parseXYZPointArray(parsed.all_boundary_pts, 1);
  if (boundaryPts && boundaryPts.length > 0) {
    children.push({
      id: newId(),
      name: "all_boundary_pts",
      type: "polyline",
      children: [],
      polylinePoints: boundaryPts,
      payload: { role: "layerDataBoundaryPointCloud", pointCloudColor: "#4a9eff", source: "layerData" },
    });
  }

  const lanePts = parseXYZPointArray(parsed.all_lane_line_pts, 1);
  if (lanePts && lanePts.length > 0) {
    children.push({
      id: newId(),
      name: "all_lane_line_pts",
      type: "polyline",
      children: [],
      polylinePoints: lanePts,
      payload: { role: "layerDataLanePointCloud", pointCloudColor: "#f5a623", source: "layerData" },
    });
  }

  const centerRaw = parsed.center_nodes;
  if (Array.isArray(centerRaw) && centerRaw.length > 0) {
    const idxToPos: (Vec3 | null)[] = [];
    for (let i = 0; i < centerRaw.length; i++) {
      const item = centerRaw[i];
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        idxToPos.push(null);
        continue;
      }
      const n = item as Record<string, unknown>;
      const pts = n.pts;
      idxToPos.push(parseXYZPoint(pts));
    }

    const edgeNodes: SceneNode[] = [];
    for (let i = 0; i < centerRaw.length; i++) {
      const a = idxToPos[i];
      if (!a) {
        continue;
      }
      const item = centerRaw[i];
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        continue;
      }
      const n = item as Record<string, unknown>;
      const outs = n.out_nodes_idx;
      if (!Array.isArray(outs)) {
        continue;
      }
      for (const idx of outs) {
        if (typeof idx !== "number" || idx < 0 || idx >= idxToPos.length) {
          continue;
        }
        const b = idxToPos[idx];
        if (!b) {
          continue;
        }
        const fromId = typeof n.id === "number" ? n.id : i;
        const toItem = centerRaw[idx];
        const toId =
          toItem !== null && typeof toItem === "object" && !Array.isArray(toItem) && typeof (toItem as Record<string, unknown>).id === "number"
            ? ((toItem as Record<string, unknown>).id as number)
            : idx;
        edgeNodes.push({
          id: newId(),
          name: `center_edge ${fromId}→${toId}`,
          type: "polyline",
          children: [],
          polylinePoints: [a, b],
          payload: { role: "layerDataGraphEdge", fromId, toId },
        });
      }
    }

    const centerMeshes: SceneNode[] = [];
    for (let i = 0; i < idxToPos.length; i++) {
      const pos = idxToPos[i];
      if (!pos) {
        continue;
      }
      const item = centerRaw[i];
      const nid =
        item !== null && typeof item === "object" && !Array.isArray(item) && typeof (item as Record<string, unknown>).id === "number"
          ? ((item as Record<string, unknown>).id as number)
          : i;
      centerMeshes.push({
        id: newId(),
        name: `center_node ${nid}`,
        type: "mesh",
        transform: { position: pos },
        children: [],
        payload: { role: "layerDataCenterNode", id: nid },
      });
    }

    if (edgeNodes.length > 0) {
      children.push({
        id: newId(),
        name: "center_graph_edges",
        type: "group",
        children: edgeNodes,
        payload: { role: "layer", layer: "layerDataGraph" },
      });
    }
    if (centerMeshes.length > 0) {
      children.push({
        id: newId(),
        name: "center_nodes",
        type: "group",
        children: centerMeshes,
        payload: { role: "layer", layer: "layerDataCenters" },
      });
    }
  }

  return {
    id: newId(),
    name: documentName,
    type: "group",
    children,
    payload: { role: "layerDataDocument" },
  };
}

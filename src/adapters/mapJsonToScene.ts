/**
 * Parking / HD map JSON: parses selected layers into a scene graph.
 * Skipped keys (no tree nodes, no geometry): header, trajectories, parkingSlotsOptimize, mapId, timestampNs.
 * Implemented layers: `arrows` (filled polygon), `laneLines` (white polyline), `bumps` / `crossWalks` (endPt quads),
 * `parkingSlots` (centered quads + edges + id label), `pillars` (bottom-centered boxes),
 * `road_links` (per-link color + 道路边界线 left/right polylines).
 *
 * Coordinate mapping: JSON {x,y,z} with x=前, y=左, z=上 (vehicle / map frame).
 * Three.js Y-up scene: X=file x, Y=file z, Z=file y (ground plane XZ, elevation from file z on Y).
 */

import type { SceneNode, Vec3 } from "@/scene/types";
import { roadLinkLineColorHex } from "@/utils/roadLinkColors";
import { Euler, Matrix4, Vector3 } from "three";

function newId(): string {
  return crypto.randomUUID();
}

/** Keys never expanded into generic or map-specific scene content (per product rules). */
export const MAP_JSON_SKIPPED_KEYS = [
  "header",
  "trajectories",
  "parkingSlotsOptimize",
  "mapId",
  "timestampNs",
] as const;

export function isMapJsonRoot(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const o = value as Record<string, unknown>;
  return (
    Array.isArray(o.arrows) ||
    Array.isArray(o.bumps) ||
    Array.isArray(o.crossWalks) ||
    Array.isArray(o.laneLines) ||
    Array.isArray(o.parkingSlots) ||
    Array.isArray(o.pillars) ||
    Array.isArray(o.road_links) ||
    Array.isArray(o.regionList)
  );
}

/**
 * Single point from map file → Three.js scene (Y-up): ground plane XZ, Y = elevation from file z.
 */
export function mapJsonPointToThree(p: { x: number; y: number; z: number }): Vec3 {
  return [p.x, p.z, p.y] as const;
}

/**
 * Direction vectors use the same axis permutation as positions (file x,y,z → scene x,z,y), then unit length.
 */
export function mapJsonDirectionToThree(d: { x: number; y: number; z: number }): Vec3 {
  const tx = d.x;
  const ty = d.z;
  const tz = d.y;
  const len = Math.hypot(tx, ty, tz);
  if (len < 1e-10) {
    return [0, 1, 0];
  }
  return [tx / len, ty / len, tz / len] as const;
}

/**
 * Pillar footprint: `length` along horizontal `direction`, `width` along `length × up` (map plane).
 * Euler XYZ (radians) aligns local box (+X length, +Y height, +Z width) with the map axes.
 */
export function computePillarRotation(direction: { x: number; y: number; z: number }): Vec3 {
  const up = new Vector3(0, 1, 0);
  const L = new Vector3(...mapJsonDirectionToThree(direction));
  L.y = 0;
  if (L.lengthSq() < 1e-12) {
    L.set(1, 0, 0);
  } else {
    L.normalize();
  }
  const widthDir = new Vector3().crossVectors(L, up).normalize();
  const mat = new Matrix4();
  mat.makeBasis(L, up, widthDir);
  const e = new Euler().setFromRotationMatrix(mat);
  return [e.x, e.y, e.z] as const;
}

/**
 * End-point rectangle (bump, crossWalk, etc.): `endPt` is the center of the **end** short edge; long side runs from
 * `endPt - length * L` to `endPt` along unit long direction `L`; wide direction `W` is half-width offset.
 * Returns four corners (closed polygon order for triangulation).
 */
export function computeBumpQuadVertices(
  endPt: { x: number; y: number; z: number },
  halfWidth: number,
  length: number,
  longDirection: { x: number; y: number; z: number },
  wideDirection: { x: number; y: number; z: number },
): Vec3[] | null {
  if (!(length > 0) || !(halfWidth > 0)) {
    return null;
  }
  const L = mapJsonDirectionToThree(longDirection);
  const W = mapJsonDirectionToThree(wideDirection);
  const E = mapJsonPointToThree(endPt);
  const S: Vec3 = [E[0] - L[0] * length, E[1] - L[1] * length, E[2] - L[2] * length];
  const hw = halfWidth;
  const pSm: Vec3 = [S[0] - W[0] * hw, S[1] - W[1] * hw, S[2] - W[2] * hw];
  const pSp: Vec3 = [S[0] + W[0] * hw, S[1] + W[1] * hw, S[2] + W[2] * hw];
  const pEp: Vec3 = [E[0] + W[0] * hw, E[1] + W[1] * hw, E[2] + W[2] * hw];
  const pEm: Vec3 = [E[0] - W[0] * hw, E[1] - W[1] * hw, E[2] - W[2] * hw];
  return [pSm, pSp, pEp, pEm];
}

/**
 * Parking slot centered at `center`; half-extents along unit `longDirection` and `wideDirection`.
 */
export function computeParkingSlotQuadVertices(
  center: { x: number; y: number; z: number },
  length: number,
  width: number,
  longDirection: { x: number; y: number; z: number },
  wideDirection: { x: number; y: number; z: number },
): Vec3[] | null {
  if (!(length > 0) || !(width > 0)) {
    return null;
  }
  const L = mapJsonDirectionToThree(longDirection);
  const W = mapJsonDirectionToThree(wideDirection);
  const C = mapJsonPointToThree(center);
  const hl = length * 0.5;
  const hw = width * 0.5;
  const pPp: Vec3 = [
    C[0] + L[0] * hl + W[0] * hw,
    C[1] + L[1] * hl + W[1] * hw,
    C[2] + L[2] * hl + W[2] * hw,
  ];
  const pPm: Vec3 = [
    C[0] + L[0] * hl - W[0] * hw,
    C[1] + L[1] * hl - W[1] * hw,
    C[2] + L[2] * hl - W[2] * hw,
  ];
  const pMm: Vec3 = [
    C[0] - L[0] * hl - W[0] * hw,
    C[1] - L[1] * hl - W[1] * hw,
    C[2] - L[2] * hl - W[2] * hw,
  ];
  const pMp: Vec3 = [
    C[0] - L[0] * hl + W[0] * hw,
    C[1] - L[1] * hl + W[1] * hw,
    C[2] - L[2] * hl + W[2] * hw,
  ];
  return [pPp, pPm, pMm, pMp];
}

interface RawArrow {
  readonly arrowType?: unknown;
  readonly id?: unknown;
  readonly link_id?: unknown;
  readonly regionID?: unknown;
  readonly points?: unknown;
}

interface RawLaneLine {
  readonly id?: unknown;
  readonly lineType?: unknown;
  readonly link_id?: unknown;
  readonly regionID?: unknown;
  readonly points?: unknown;
}

interface RawParkingSlot {
  readonly center?: unknown;
  readonly id?: unknown;
  readonly isOccupancy?: unknown;
  readonly length?: unknown;
  readonly width?: unknown;
  readonly link_id?: unknown;
  readonly longDirection?: unknown;
  readonly psType?: unknown;
  readonly regionID?: unknown;
  readonly wideDirection?: unknown;
}

interface RawPillar {
  readonly center?: unknown;
  readonly direction?: unknown;
  readonly height?: unknown;
  readonly id?: unknown;
  readonly length?: unknown;
  readonly width?: unknown;
  readonly link_id?: unknown;
  readonly regionID?: unknown;
}

interface RawRoadBoundary {
  readonly id?: unknown;
  readonly line_type?: unknown;
  readonly link_id?: unknown;
  readonly last_linked_RoadBoundary_ids?: unknown;
  readonly next_linked_RoadBoundary_ids?: unknown;
  readonly road_boundary_left_points?: unknown;
  readonly road_boundary_right_points?: unknown;
}

interface RawRoadLink {
  readonly id?: unknown;
  readonly last_linked_roadlink_ids?: unknown;
  readonly next_linked_roadlink_ids?: unknown;
  readonly road_boundarys_data?: unknown;
}

/** Same JSON shape for bumps and crossWalks. */
interface RawEndPtRect {
  readonly endPt?: unknown;
  readonly halfWidth?: unknown;
  readonly id?: unknown;
  readonly length?: unknown;
  readonly link_id?: unknown;
  readonly regionID?: unknown;
  readonly longDirection?: unknown;
  readonly wideDirection?: unknown;
}

function parseEndPtRectLayer(
  raw: unknown,
  payloadRole: "bump" | "crossWalk",
  namePrefix: string,
): SceneNode[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [];
  }
  const nodes: SceneNode[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (item === null || typeof item !== "object") {
      continue;
    }
    const b = item as RawEndPtRect;
    const ep = b.endPt;
    const hw = b.halfWidth;
    const len = b.length;
    const ld = b.longDirection;
    const wd = b.wideDirection;
    if (
      ep === null ||
      typeof ep !== "object" ||
      typeof hw !== "number" ||
      typeof len !== "number" ||
      ld === null ||
      typeof ld !== "object" ||
      wd === null ||
      typeof wd !== "object"
    ) {
      continue;
    }
    const e = ep as Record<string, unknown>;
    const ldir = ld as Record<string, unknown>;
    const wdir = wd as Record<string, unknown>;
    if (
      typeof e.x !== "number" ||
      typeof e.y !== "number" ||
      typeof e.z !== "number" ||
      typeof ldir.x !== "number" ||
      typeof ldir.y !== "number" ||
      typeof ldir.z !== "number" ||
      typeof wdir.x !== "number" ||
      typeof wdir.y !== "number" ||
      typeof wdir.z !== "number"
    ) {
      continue;
    }

    const quad = computeBumpQuadVertices(
      { x: e.x, y: e.y, z: e.z },
      hw,
      len,
      { x: ldir.x, y: ldir.y, z: ldir.z },
      { x: wdir.x, y: wdir.y, z: wdir.z },
    );
    if (!quad) {
      continue;
    }

    const sourceId = typeof b.id === "number" ? b.id : i;
    const width = hw * 2;
    nodes.push({
      id: newId(),
      name: `${namePrefix} ${sourceId}`,
      type: "polyline",
      children: [],
      polylinePoints: quad,
      payload: {
        role: payloadRole,
        id: sourceId,
        length: len,
        width,
        link_id: b.link_id,
        regionID: b.regionID,
      },
    });
  }
  return nodes;
}

function parseArrowPoints(raw: unknown): Vec3[] | null {
  if (!Array.isArray(raw) || raw.length < 2) {
    return null;
  }
  const out: Vec3[] = [];
  for (const pt of raw) {
    if (pt === null || typeof pt !== "object") {
      continue;
    }
    const p = pt as Record<string, unknown>;
    if (typeof p.x !== "number" || typeof p.y !== "number" || typeof p.z !== "number") {
      continue;
    }
    out.push(mapJsonPointToThree({ x: p.x, y: p.y, z: p.z }));
  }
  return out.length >= 2 ? out : null;
}

function parseParkingSlotsLayer(raw: unknown): SceneNode[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [];
  }
  const nodes: SceneNode[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (item === null || typeof item !== "object") {
      continue;
    }
    const s = item as RawParkingSlot;
    const ctr = s.center;
    const len = s.length;
    const wid = s.width;
    const ld = s.longDirection;
    const wd = s.wideDirection;
    if (
      ctr === null ||
      typeof ctr !== "object" ||
      typeof len !== "number" ||
      typeof wid !== "number" ||
      ld === null ||
      typeof ld !== "object" ||
      wd === null ||
      typeof wd !== "object"
    ) {
      continue;
    }
    const c = ctr as Record<string, unknown>;
    const ldir = ld as Record<string, unknown>;
    const wdir = wd as Record<string, unknown>;
    if (
      typeof c.x !== "number" ||
      typeof c.y !== "number" ||
      typeof c.z !== "number" ||
      typeof ldir.x !== "number" ||
      typeof ldir.y !== "number" ||
      typeof ldir.z !== "number" ||
      typeof wdir.x !== "number" ||
      typeof wdir.y !== "number" ||
      typeof wdir.z !== "number"
    ) {
      continue;
    }

    const quad = computeParkingSlotQuadVertices(
      { x: c.x, y: c.y, z: c.z },
      len,
      wid,
      { x: ldir.x, y: ldir.y, z: ldir.z },
      { x: wdir.x, y: wdir.y, z: wdir.z },
    );
    if (!quad) {
      continue;
    }

    const Cscene = mapJsonPointToThree({ x: c.x, y: c.y, z: c.z });
    const sourceId = typeof s.id === "number" ? s.id : i;
    nodes.push({
      id: newId(),
      name: `parkingSlot ${sourceId}`,
      type: "parkingSlot",
      children: [],
      polylinePoints: quad,
      payload: {
        role: "parkingSlot",
        centerScene: [Cscene[0], Cscene[1], Cscene[2]],
        id: sourceId,
        isOccupancy: s.isOccupancy,
        length: len,
        width: wid,
        psType: s.psType,
        regionID: s.regionID,
        link_id: s.link_id,
      },
    });
  }
  return nodes;
}

function parsePillarsLayer(raw: unknown): SceneNode[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [];
  }
  const nodes: SceneNode[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (item === null || typeof item !== "object") {
      continue;
    }
    const p = item as RawPillar;
    const ctr = p.center;
    const dir = p.direction;
    const len = p.length;
    const wid = p.width;
    const h = p.height;
    if (
      ctr === null ||
      typeof ctr !== "object" ||
      dir === null ||
      typeof dir !== "object" ||
      typeof len !== "number" ||
      typeof wid !== "number" ||
      typeof h !== "number" ||
      !(len > 0) ||
      !(wid > 0) ||
      !(h > 0)
    ) {
      continue;
    }
    const c = ctr as Record<string, unknown>;
    const d = dir as Record<string, unknown>;
    if (
      typeof c.x !== "number" ||
      typeof c.y !== "number" ||
      typeof c.z !== "number" ||
      typeof d.x !== "number" ||
      typeof d.y !== "number" ||
      typeof d.z !== "number"
    ) {
      continue;
    }

    const bottom = mapJsonPointToThree({ x: c.x, y: c.y, z: c.z });
    const rotation = computePillarRotation({ x: d.x, y: d.y, z: d.z });
    const sourceId = typeof p.id === "number" ? p.id : i;
    nodes.push({
      id: newId(),
      name: `pillar ${sourceId}`,
      type: "pillar",
      children: [],
      transform: {
        position: bottom,
        rotation,
      },
      payload: {
        role: "pillar",
        id: sourceId,
        length: len,
        width: wid,
        height: h,
        regionID: p.regionID,
        link_id: p.link_id,
      },
    });
  }
  return nodes;
}

function parseRoadLinksLayer(raw: unknown): SceneNode[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [];
  }
  const nodes: SceneNode[] = [];
  for (let ri = 0; ri < raw.length; ri++) {
    const item = raw[ri];
    if (item === null || typeof item !== "object") {
      continue;
    }
    const rl = item as RawRoadLink;
    const colorHex = roadLinkLineColorHex(ri);
    const boundaryChildren: SceneNode[] = [];
    const rbData = rl.road_boundarys_data;
    if (Array.isArray(rbData)) {
      for (let bi = 0; bi < rbData.length; bi++) {
        const b = rbData[bi];
        if (b === null || typeof b !== "object") {
          continue;
        }
        const bd = b as RawRoadBoundary;
        const leftPts = parseArrowPoints(bd.road_boundary_left_points);
        const rightPts = parseArrowPoints(bd.road_boundary_right_points);
        const boundaryId = typeof bd.id === "number" ? bd.id : bi;
        const basePayload = {
          role: "roadBoundaryLine" as const,
          roadLinkColor: colorHex,
          id: bd.id,
          line_type: bd.line_type,
          link_id: bd.link_id,
          last_linked_RoadBoundary_ids: bd.last_linked_RoadBoundary_ids,
          next_linked_RoadBoundary_ids: bd.next_linked_RoadBoundary_ids,
        };
        if (leftPts && leftPts.length >= 2) {
          boundaryChildren.push({
            id: newId(),
            name: `左边界 ${boundaryId}`,
            type: "polyline",
            children: [],
            polylinePoints: leftPts,
            payload: { ...basePayload, side: "left" as const },
          });
        }
        if (rightPts && rightPts.length >= 2) {
          boundaryChildren.push({
            id: newId(),
            name: `右边界 ${boundaryId}`,
            type: "polyline",
            children: [],
            polylinePoints: rightPts,
            payload: { ...basePayload, side: "right" as const },
          });
        }
      }
    }
    const roadLinkId = typeof rl.id === "number" ? rl.id : ri;
    const roadBoundaryNode: SceneNode = {
      id: newId(),
      name: "道路边界线",
      type: "group",
      children: boundaryChildren,
      payload: { role: "roadBoundaryRoot", roadLinkColor: colorHex },
    };
    nodes.push({
      id: newId(),
      name: `roadLink ${roadLinkId}`,
      type: "group",
      children: [roadBoundaryNode],
      payload: {
        role: "roadLink",
        id: rl.id,
        last_linked_roadlink_ids: rl.last_linked_roadlink_ids,
        next_linked_roadlink_ids: rl.next_linked_roadlink_ids,
        roadLinkColor: colorHex,
      },
    });
  }
  return nodes;
}

/**
 * Builds the file-local subtree for a map JSON root object (`arrows`, `bumps`, `crossWalks`, …).
 */
export function parseMapJsonToSceneNodes(parsed: Record<string, unknown>, documentName: string): SceneNode {
  const children: SceneNode[] = [];

  const arrowsRaw = parsed.arrows;
  if (Array.isArray(arrowsRaw) && arrowsRaw.length > 0) {
    const arrowNodes: SceneNode[] = [];
    for (let i = 0; i < arrowsRaw.length; i++) {
      const item = arrowsRaw[i];
      if (item === null || typeof item !== "object") {
        continue;
      }
      const a = item as RawArrow;
      const points = parseArrowPoints(a.points);
      if (!points) {
        continue;
      }

      const sourceId = typeof a.id === "number" ? a.id : i;
      const arrowType = a.arrowType;
      const linkId = a.link_id;
      const regionID = a.regionID;

      arrowNodes.push({
        id: newId(),
        name: `arrow ${sourceId}`,
        type: "polyline",
        children: [],
        polylinePoints: points,
        payload: {
          role: "arrow",
          arrowType,
          id: sourceId,
          link_id: linkId,
          regionID,
        },
      });
    }

    if (arrowNodes.length > 0) {
      children.push({
        id: newId(),
        name: "arrows",
        type: "group",
        children: arrowNodes,
        payload: { role: "layer", layer: "arrows" },
      });
    }
  }

  const bumpNodes = parseEndPtRectLayer(parsed.bumps, "bump", "bump");
  if (bumpNodes.length > 0) {
    children.push({
      id: newId(),
      name: "bumps",
      type: "group",
      children: bumpNodes,
      payload: { role: "layer", layer: "bumps" },
    });
  }

  const crossWalkNodes = parseEndPtRectLayer(parsed.crossWalks, "crossWalk", "crossWalk");
  if (crossWalkNodes.length > 0) {
    children.push({
      id: newId(),
      name: "crossWalks",
      type: "group",
      children: crossWalkNodes,
      payload: { role: "layer", layer: "crossWalks" },
    });
  }

  const laneLinesRaw = parsed.laneLines;
  if (Array.isArray(laneLinesRaw) && laneLinesRaw.length > 0) {
    const laneLineNodes: SceneNode[] = [];
    for (let i = 0; i < laneLinesRaw.length; i++) {
      const item = laneLinesRaw[i];
      if (item === null || typeof item !== "object") {
        continue;
      }
      const ln = item as RawLaneLine;
      const linePts = parseArrowPoints(ln.points);
      if (!linePts || linePts.length < 2) {
        continue;
      }
      const sourceId = typeof ln.id === "number" ? ln.id : i;
      laneLineNodes.push({
        id: newId(),
        name: `laneLine ${sourceId}`,
        type: "polyline",
        children: [],
        polylinePoints: linePts,
        payload: {
          role: "laneLine",
          id: sourceId,
          lineType: ln.lineType,
          link_id: ln.link_id,
          regionID: ln.regionID,
        },
      });
    }
    if (laneLineNodes.length > 0) {
      children.push({
        id: newId(),
        name: "laneLines",
        type: "group",
        children: laneLineNodes,
        payload: { role: "layer", layer: "laneLines" },
      });
    }
  }

  const parkingSlotNodes = parseParkingSlotsLayer(parsed.parkingSlots);
  if (parkingSlotNodes.length > 0) {
    children.push({
      id: newId(),
      name: "parkingSlots",
      type: "group",
      children: parkingSlotNodes,
      payload: { role: "layer", layer: "parkingSlots" },
    });
  }

  const pillarNodes = parsePillarsLayer(parsed.pillars);
  if (pillarNodes.length > 0) {
    children.push({
      id: newId(),
      name: "pillars",
      type: "group",
      children: pillarNodes,
      payload: { role: "layer", layer: "pillars" },
    });
  }

  const roadLinkNodes = parseRoadLinksLayer(parsed.road_links);
  if (roadLinkNodes.length > 0) {
    children.push({
      id: newId(),
      name: "road_links",
      type: "group",
      children: roadLinkNodes,
      payload: { role: "layer", layer: "road_links" },
    });
  }

  return {
    id: newId(),
    name: documentName || "map",
    type: "group",
    children,
    payload: {
      format: "mapJson",
      skippedKeys: [...MAP_JSON_SKIPPED_KEYS],
    },
  };
}

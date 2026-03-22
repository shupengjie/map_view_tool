/**
 * regionList extraction and regionID → scene node id index (for map documents).
 */

import type { SceneNode } from "@/scene/types";

export interface MapRegionItem {
  readonly name: string;
  readonly id: number;
  readonly fromRegionHeight: number;
  readonly toRegionHeight: number;
  readonly fromRegionID: number;
  readonly toRegionID: number;
}

export function extractRegionListFromParsedMap(parsed: Record<string, unknown>): MapRegionItem[] {
  const rl = parsed.regionList;
  if (!Array.isArray(rl)) {
    return [];
  }
  const out: MapRegionItem[] = [];
  for (const item of rl) {
    if (item === null || typeof item !== "object") {
      continue;
    }
    const o = item as Record<string, unknown>;
    if (typeof o.id !== "number") {
      continue;
    }
    out.push({
      id: o.id,
      name: typeof o.name === "string" ? o.name : String(o.name ?? ""),
      fromRegionHeight: typeof o.fromRegionHeight === "number" ? o.fromRegionHeight : 0,
      toRegionHeight: typeof o.toRegionHeight === "number" ? o.toRegionHeight : 0,
      fromRegionID: typeof o.fromRegionID === "number" ? o.fromRegionID : 0,
      toRegionID: typeof o.toRegionID === "number" ? o.toRegionID : 0,
    });
  }
  return out;
}

/** Walks the file-local scene root; collects every node whose `payload.regionID` is a number. */
export function buildRegionIdToNodeIdsMap(root: SceneNode): ReadonlyMap<number, readonly string[]> {
  const acc = new Map<number, string[]>();
  function walk(n: SceneNode): void {
    const p = n.payload;
    if (p && typeof p === "object" && "regionID" in p) {
      const rid = (p as { regionID: unknown }).regionID;
      if (typeof rid === "number") {
        let list = acc.get(rid);
        if (!list) {
          list = [];
          acc.set(rid, list);
        }
        list.push(n.id);
      }
    }
    for (const c of n.children) {
      walk(c);
    }
  }
  walk(root);
  return new Map(
    [...acc.entries()].map(([k, v]) => [k, Object.freeze([...v]) as readonly string[]]),
  );
}

/**
 * JSON → internal `SceneNode` graph (placeholder strategy).
 *
 * Replace or extend `jsonValueToNodes` when the real file format is specified.
 * Current behavior: visualize structure with `group` containers and `mesh` leaf cubes,
 * with bounded breadth/depth so accidental megabytes of JSON do not freeze the tab.
 */

import { isMapJsonRoot, parseMapJsonToSceneNodes } from "@/adapters/mapJsonToScene";
import type { SceneNode, Vec3 } from "@/scene/types";

const MAX_DEPTH = 6;
const MAX_CHILDREN_PER_NODE = 48;

function newId(): string {
  return crypto.randomUUID();
}

function clampChildrenCount(n: number): number {
  return Math.min(n, MAX_CHILDREN_PER_NODE);
}

/**
 * Lay out children on a simple grid in the XZ plane so siblings remain visible.
 */
function gridPosition(index: number, total: number): Vec3 {
  const cols = Math.ceil(Math.sqrt(Math.max(total, 1)));
  const row = Math.floor(index / cols);
  const col = index % cols;
  const spacing = 1.25;
  const offset = ((cols - 1) * spacing) / 2;
  return [col * spacing - offset, 0, row * spacing] as const;
}

/**
 * Recursively maps JSON values to scene nodes. Depth and child count are capped.
 */
function jsonValueToNodes(
  value: unknown,
  label: string,
  path: string,
  depth: number,
  childIndex: number,
  siblingCount: number,
): SceneNode {
  const id = newId();
  const baseTransform = {
    position: gridPosition(childIndex, siblingCount),
  };

  if (depth >= MAX_DEPTH) {
    return {
      id,
      name: label,
      type: "mesh",
      transform: baseTransform,
      children: [],
      payload: {
        truncated: true,
        path,
        preview: summarizeValue(value),
      },
    };
  }

  if (value === null || typeof value !== "object") {
    return {
      id,
      name: `${label}: ${summarizeValue(value)}`,
      type: "mesh",
      transform: baseTransform,
      children: [],
      payload: { path, value },
    };
  }

  if (Array.isArray(value)) {
    const n = clampChildrenCount(value.length);
    const children: SceneNode[] = [];
    for (let i = 0; i < n; i++) {
      children.push(
        jsonValueToNodes(value[i]!, `[${i}]`, `${path}[${i}]`, depth + 1, i, n),
      );
    }
    const truncated = value.length > n;
    return {
      id,
      name: `${label} [${value.length}]`,
      type: "group",
      transform: baseTransform,
      children,
      payload: truncated ? { path, truncatedArray: true, shown: n, total: value.length } : { path },
    };
  }

  const entries = Object.entries(value as Record<string, unknown>);
  const n = clampChildrenCount(entries.length);
  const children: SceneNode[] = [];
  for (let i = 0; i < n; i++) {
    const [k, v] = entries[i]!;
    children.push(jsonValueToNodes(v, k, `${path}.${k}`, depth + 1, i, n));
  }
  const truncated = entries.length > n;
  return {
    id,
    name: label,
    type: "group",
    transform: baseTransform,
    children,
    payload: truncated
      ? { path, truncatedObject: true, shown: n, total: entries.length }
      : { path },
  };
}

function summarizeValue(value: unknown): string {
  if (value === null) {
    return "null";
  }
  const t = typeof value;
  if (t === "string") {
    const s = value as string;
    return s.length > 40 ? `${s.slice(0, 37)}…` : s;
  }
  if (t === "number" || t === "boolean" || t === "bigint") {
    return String(value);
  }
  if (t === "undefined") {
    return "undefined";
  }
  return "[object]";
}

export interface JsonToSceneOptions {
  /** Root node display name, usually the file base name. */
  readonly documentName: string;
}

/**
 * Builds the **file-local** scene subtree from parsed JSON (no application scene root).
 * The store wraps each result in a `type: "json"` node under the global `场景` root.
 * Map JSON (detected by presence of `arrows` array) uses `mapJsonToScene.ts` rules; otherwise generic tree.
 */
export function parseJsonFileToSceneNodes(parsed: unknown, options: JsonToSceneOptions): SceneNode {
  if (isMapJsonRoot(parsed)) {
    return parseMapJsonToSceneNodes(parsed, options.documentName);
  }
  return jsonValueToNodes(parsed, options.documentName, "$", 0, 0, 1);
}

/**
 * Parses JSON text into a file-local scene subtree.
 * Throws `SyntaxError` if the text is not valid JSON.
 */
export function jsonTextToSceneNodes(jsonText: string, options: JsonToSceneOptions): SceneNode {
  return parseJsonFileToSceneNodes(JSON.parse(jsonText), options);
}

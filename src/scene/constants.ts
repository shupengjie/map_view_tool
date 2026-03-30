/**
 * Stable ids and helpers for the global scene graph (single scene root + per-file JSON nodes).
 */

/** Fixed id for the unique application scene root shown in the scene tree. */
export const SCENE_ROOT_ID = "scene-root";

/** Single group under the scene root holding all loaded TUM trajectory polylines. */
export const TRAJECTORY_ROOT_ID = "scene-trajectory-root";

/** Fixed id for the map-aligned axes helper at scene origin (under scene root). */
export const MAP_FRAME_AXES_NODE_ID = "scene-map-frame-axes";

/** Fixed id for the infinite ground grid (under scene root). */
export const SCENE_BACKGROUND_GRID_NODE_ID = "scene-background-grid";

/** Wrapper node id for a loaded JSON document (one per file). */
export function jsonDocumentWrapperId(documentId: string): string {
  return `json-doc-${documentId}`;
}

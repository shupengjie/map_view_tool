/**
 * Stable ids and helpers for the global scene graph (single scene root + per-file JSON nodes).
 */

/** Fixed id for the unique application scene root shown in the scene tree. */
export const SCENE_ROOT_ID = "scene-root";

/** Single group under the scene root holding all loaded TUM trajectory polylines. */
export const TRAJECTORY_ROOT_ID = "scene-trajectory-root";

/** Wrapper node id for a loaded JSON document (one per file). */
export function jsonDocumentWrapperId(documentId: string): string {
  return `json-doc-${documentId}`;
}

/**
 * Internal scene graph model. This is the contract between JSON adapters and the UI / Three.js view.
 * When your real JSON schema is defined, extend `payload` and map fields in `adapters/jsonToScene.ts`
 * without changing this file unless you need new node kinds.
 */

/** Three-component vector in scene space (right-handed, Y-up), units arbitrary until schema is fixed. */
export type Vec3 = readonly [number, number, number];

/**
 * Local transform relative to parent. Rotation is Euler in radians (XYZ order) when present.
 */
export interface NodeTransform {
  readonly position?: Vec3;
  readonly rotation?: Vec3;
  readonly scale?: Vec3;
}

/**
 * High-level node classification for tree UI and picking behavior.
 * - `root`: unique application scene root (only one)
 * - `json`: one loaded JSON file as a subtree container
 * - `group`: organizational node, no own render mesh (children only)
 * - `mesh`: drawable placeholder or future real mesh
 * - `polyline`: connected line segments in order (`polylinePoints`), e.g. map arrows
 * - `parkingSlot`: parking space quad (`polylinePoints` = corners) + edges + label at center
 * - `pillar`: vertical box; `transform.position` = bottom center, `transform.rotation` = base orientation
 * - `mapFrameAxes`: world-origin axes aligned with map/scene frame; viewport-only, not pickable
 * - `sceneBackgroundGrid`: infinite XZ reference grid; viewport-only, not pickable
 */
export type SceneNodeType =
  | "root"
  | "json"
  | "group"
  | "mesh"
  | "polyline"
  | "parkingSlot"
  | "pillar"
  | "mapFrameAxes"
  | "sceneBackgroundGrid";

/**
 * One node in the logical scene tree. Mirrors a subset of what Godot would show in the scene dock.
 */
export interface SceneNode {
  /** Stable unique id; written to Three `userData.nodeId` for ray picking. */
  readonly id: string;
  /** Tree label (file name, JSON key, or synthesized). */
  readonly name: string;
  readonly type: SceneNodeType;
  readonly transform?: NodeTransform;
  readonly children: readonly SceneNode[];
  /**
   * When `type` is `polyline` or `parkingSlot`, vertex positions in scene space (Y-up).
   * For `parkingSlot`, four corners of the slot quad. Not shown in the inspector — use `payload`.
   */
  readonly polylinePoints?: readonly Vec3[];
  /**
   * Inspector-facing data. Populate from JSON as needed; unknown keys are fine during iteration.
   * Document here how each key maps from the source file when the format stabilizes.
   */
  readonly payload?: Readonly<Record<string, unknown>>;
}

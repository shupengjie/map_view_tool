import { jsonDocumentWrapperId } from "@/scene/constants";
import type { SceneNode } from "@/scene/types";

/**
 * Depth-first search for a node by id. Typical cost is O(n) in node count — fine for editor-sized graphs.
 */
export function findNodeById(root: SceneNode, id: string): SceneNode | null {
  if (root.id === id) {
    return root;
  }
  for (const child of root.children) {
    const hit = findNodeById(child, id);
    if (hit) {
      return hit;
    }
  }
  return null;
}

/** Path from `root` to `targetId` (inclusive), or null. Used to expand scene tree ancestors. */
export function findPathToNodeId(root: SceneNode, targetId: string): string[] | null {
  if (root.id === targetId) {
    return [root.id];
  }
  for (const child of root.children) {
    const sub = findPathToNodeId(child, targetId);
    if (sub) {
      return [root.id, ...sub];
    }
  }
  return null;
}

/**
 * Flatten the tree in preorder for optional list views or debugging.
 */
export function flattenScenePreorder(root: SceneNode): SceneNode[] {
  const out: SceneNode[] = [];
  const walk = (n: SceneNode) => {
    out.push(n);
    for (const c of n.children) {
      walk(c);
    }
  };
  walk(root);
  return out;
}

/** Whether `targetId` appears in the subtree rooted at `root` (including `root` itself). */
export function subtreeContainsNodeId(root: SceneNode, targetId: string): boolean {
  if (root.id === targetId) {
    return true;
  }
  for (const c of root.children) {
    if (subtreeContainsNodeId(c, targetId)) {
      return true;
    }
  }
  return false;
}

/**
 * If the selected node lies under a loaded JSON file subtree, returns that document's id.
 * Returns null for the scene root or selections outside any JSON subtree.
 */
export function findDocumentIdForSelectedNode(
  sceneRoot: SceneNode,
  documents: readonly { id: string }[],
  selectedId: string | null,
): string | null {
  if (!selectedId) {
    return null;
  }
  for (const d of documents) {
    const wrap = findNodeById(sceneRoot, jsonDocumentWrapperId(d.id));
    if (wrap && subtreeContainsNodeId(wrap, selectedId)) {
      return d.id;
    }
  }
  return null;
}

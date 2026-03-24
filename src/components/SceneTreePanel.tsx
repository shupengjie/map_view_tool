/**
 * Left-top panel: hierarchical scene tree for the combined scene (场景根 → JSON 节点 → 内容).
 * Click row sets global selection (same id as Three.js `userData.nodeId` on meshes).
 * Non-root rows include a right-aligned eye control for 3D viewport visibility.
 */

import { TreeVisibilityEye } from "@/components/TreeVisibilityEye";
import { SCENE_ROOT_ID } from "@/scene/constants";
import { findPathToNodeId } from "@/scene/graphUtils";
import type { SceneNode } from "@/scene/types";
import { useEditorStore } from "@/store/useEditorStore";
import { useCallback, useEffect, useState } from "react";

function toggleSetId(prev: Set<string>, id: string): Set<string> {
  const next = new Set(prev);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

/** Matches Viewport3D: when filter is on, only nodes with matching `payload.regionID` render; no regionID → always shown. */
function isHiddenByRegionFilter(node: SceneNode, activeRegionFilterId: number | null): boolean {
  if (activeRegionFilterId === null) {
    return false;
  }
  const pr = node.payload?.regionID;
  return typeof pr === "number" && pr !== activeRegionFilterId;
}

interface TreeRowsProps {
  readonly node: SceneNode;
  readonly depth: number;
  readonly expanded: Set<string>;
  readonly onToggle: (id: string) => void;
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly hiddenNodeIds: ReadonlySet<string>;
  readonly activeRegionFilterId: number | null;
  readonly onToggleViewportVisibility: (id: string) => void;
}

function TreeRows({
  node,
  depth,
  expanded,
  onToggle,
  selectedId,
  onSelect,
  hiddenNodeIds,
  activeRegionFilterId,
  onToggleViewportVisibility,
}: TreeRowsProps) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);
  const pad = depth * 14;
  const isSceneRoot = node.id === SCENE_ROOT_ID;
  const hiddenInView = hiddenNodeIds.has(node.id);
  const hiddenByRegion = isHiddenByRegionFilter(node, activeRegionFilterId);
  const dimInTree = hiddenInView || hiddenByRegion;
  const viewportVisible = !hiddenInView;

  return (
    <>
      <div
        role="treeitem"
        data-tree-node-id={node.id}
        aria-expanded={hasChildren ? isOpen : undefined}
        className={`tree-row ${selectedId === node.id ? "tree-row-selected" : ""} ${dimInTree ? "tree-row-viewport-hidden" : ""}`}
        style={{ paddingLeft: 6 + pad }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(node.id);
          if (hasChildren) {
            onToggle(node.id);
          }
        }}
      >
        <span className="tree-chevron">{hasChildren ? (isOpen ? "▼" : "▶") : "·"}</span>
        <span className="tree-row-label">
          [{node.type}] {node.name}
        </span>
        {!isSceneRoot ? (
          <TreeVisibilityEye
            visible={viewportVisible}
            onToggle={() => onToggleViewportVisibility(node.id)}
          />
        ) : (
          <span className="tree-eye-placeholder" aria-hidden />
        )}
      </div>
      {hasChildren && isOpen
        ? node.children.map((c) => (
            <TreeRows
              key={c.id}
              node={c}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              selectedId={selectedId}
              onSelect={onSelect}
              hiddenNodeIds={hiddenNodeIds}
              activeRegionFilterId={activeRegionFilterId}
              onToggleViewportVisibility={onToggleViewportVisibility}
            />
          ))
        : null}
    </>
  );
}

export function SceneTreePanel() {
  const root = useEditorStore((s) => s.sceneGraphRoot);
  const selectedId = useEditorStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useEditorStore((s) => s.setSelectedNodeId);
  const hiddenNodeIds = useEditorStore((s) => s.hiddenNodeIds);
  const activeRegionFilterId = useEditorStore((s) => s.activeRegionFilterId);
  const toggleViewportVisibility = useEditorStore((s) => s.toggleViewportVisibility);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const selectFromTree = useCallback(
    (id: string) => {
      setSelectedNodeId(id, true);
    },
    [setSelectedNodeId],
  );

  const onToggle = useCallback((id: string) => {
    setExpanded((prev) => toggleSetId(prev, id));
  }, []);

  const collapseAll = useCallback(() => {
    if (!root) {
      return;
    }
    // Keep only scene root expanded so all descendants collapse in one action.
    setExpanded(new Set([root.id]));
  }, [root]);

  useEffect(() => {
    if (root) {
      setExpanded(new Set([root.id, ...root.children.map((c) => c.id)]));
    } else {
      setExpanded(new Set());
    }
  }, [root]);

  useEffect(() => {
    if (!root || !selectedId) {
      return;
    }
    const path = findPathToNodeId(root, selectedId);
    if (!path) {
      return;
    }
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const id of path) {
        next.add(id);
      }
      return next;
    });
  }, [root, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    const t = window.setTimeout(() => {
      const sel =
        typeof CSS !== "undefined" && typeof CSS.escape === "function"
          ? `[data-tree-node-id="${CSS.escape(selectedId)}"]`
          : `[data-tree-node-id="${selectedId}"]`;
      document.querySelector(sel)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 0);
    return () => clearTimeout(t);
  }, [selectedId, expanded]);

  return !root ? (
    <div className="inspector-empty">尚未加载场景。使用工具栏加载 JSON 或 TUM 轨迹。</div>
  ) : (
    <div className="tree-panel-wrap">
      <div className="tree-toolbar">
        <button
          type="button"
          className="tree-toolbar-btn"
          onClick={collapseAll}
          title="一键折叠场景树"
          aria-label="一键折叠场景树"
        >
          <svg className="tree-toolbar-icon" width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M1 2.5h10v1H1zM1 5.5h10v1H1zM1 8.5h10v1H1z" fill="currentColor" />
            <path d="M8 1l3 3H9v7H8V4H5z" fill="currentColor" />
          </svg>
          <span>一键折叠</span>
        </button>
      </div>
      <div role="tree" className="tree-scroll">
        <TreeRows
          node={root}
          depth={0}
          expanded={expanded}
          onToggle={onToggle}
          selectedId={selectedId}
          onSelect={selectFromTree}
          hiddenNodeIds={hiddenNodeIds}
          activeRegionFilterId={activeRegionFilterId}
          onToggleViewportVisibility={toggleViewportVisibility}
        />
      </div>
    </div>
  );
}

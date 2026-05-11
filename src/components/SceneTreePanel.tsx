/**
 * Left-top panel: hierarchical scene tree for the combined scene (场景根 → JSON 节点 → 内容).
 *
 * Row layout — three independent buttons, none nested inside another:
 *   [chevron]  [node-body]  ([trash])  [eye]
 *
 * Click semantics:
 *   - chevron        → expand/collapse only.
 *   - node-body      → select (highlight + property panel). Camera focus only when the node is a
 *                       leaf AND visible (own toggle, region filter, and inherited from ancestors).
 *   - trash (pins)   → remove that pin (last pin gone → 图钉 root group also goes).
 *   - eye            → toggle viewport visibility only.
 *
 * Clicks on the row's dead space (indent, gaps) do nothing on purpose; the three buttons are the
 * sole interactive surfaces.
 */

import { TreeTrashButton } from "@/components/TreeTrashButton";
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

/** Coerce a payload field that should hold a pin id. Returns null if the value is missing or non-finite. */
function pinIdFromNode(node: SceneNode): number | null {
  if (node.type !== "pinAxes") {
    return null;
  }
  const raw = node.payload?.pinId;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

interface TreeRowsProps {
  readonly node: SceneNode;
  readonly depth: number;
  readonly expanded: Set<string>;
  readonly onToggle: (id: string) => void;
  readonly selectedId: string | null;
  readonly onSelect: (id: string, focus: boolean) => void;
  readonly hiddenNodeIds: ReadonlySet<string>;
  readonly activeRegionFilterId: number | null;
  readonly onToggleViewportVisibility: (id: string) => void;
  readonly onRemovePin: (pinId: number) => void;
  /**
   * True iff some ancestor is currently hidden in the viewport (own eye-off OR region-filter mismatch).
   * Used together with the row's own state to decide whether camera focus should run on select.
   */
  readonly ancestorHidden: boolean;
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
  onRemovePin,
  ancestorHidden,
}: TreeRowsProps) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);
  const pad = depth * 14;
  const isSceneRoot = node.id === SCENE_ROOT_ID;
  const hiddenInView = hiddenNodeIds.has(node.id);
  const hiddenByRegion = isHiddenByRegionFilter(node, activeRegionFilterId);
  const dimInTree = hiddenInView || hiddenByRegion;
  const viewportVisible = !hiddenInView;
  // Effective visibility includes inherited ancestor state: an item under a hidden parent is not
  // actually drawn, so focusing the camera on it would land in empty space.
  const effectivelyHidden = ancestorHidden || dimInTree;
  const canFocus = !hasChildren && !effectivelyHidden;
  const isSelected = selectedId === node.id;
  const pinId = pinIdFromNode(node);

  return (
    <>
      <div
        role="treeitem"
        data-tree-node-id={node.id}
        aria-expanded={hasChildren ? isOpen : undefined}
        aria-selected={isSelected}
        className={`tree-row ${isSelected ? "tree-row-selected" : ""} ${dimInTree ? "tree-row-viewport-hidden" : ""}`}
        style={{ paddingLeft: 6 + pad }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="tree-chevron-btn"
            aria-expanded={isOpen}
            aria-label={isOpen ? "折叠子节点" : "展开子节点"}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
          >
            <span className="tree-chevron" aria-hidden>
              {isOpen ? "▼" : "▶"}
            </span>
          </button>
        ) : (
          <span className="tree-chevron tree-chevron-leaf" aria-hidden>
            ·
          </span>
        )}
        <button
          type="button"
          className="tree-row-body-btn"
          aria-pressed={isSelected}
          title={node.name}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(node.id, canFocus);
          }}
        >
          <span className="tree-row-label">
            [{node.type}] {node.name}
          </span>
        </button>
        {pinId !== null ? (
          <TreeTrashButton
            title={`删除该图钉（图钉${pinId}）`}
            onConfirm={() => onRemovePin(pinId)}
          />
        ) : null}
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
              onRemovePin={onRemovePin}
              ancestorHidden={effectivelyHidden}
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
  const removePin = useEditorStore((s) => s.removePin);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const selectFromTree = useCallback(
    (id: string, focus: boolean) => {
      // `setSelectedNodeId(id, fromTree)` doubles as "request camera focus" when fromTree=true;
      // group nodes and hidden nodes pass focus=false so only highlight + inspector update.
      setSelectedNodeId(id, focus);
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
      // Only expand ancestors so the selected row is visible; do not re-expand the selected node
      // (user may have just collapsed it — previously that was undone here and felt like a double toggle).
      for (let i = 0; i < path.length - 1; i++) {
        next.add(path[i]!);
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
          onRemovePin={removePin}
          ancestorHidden={false}
        />
      </div>
    </div>
  );
}

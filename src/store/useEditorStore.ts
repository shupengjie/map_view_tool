/**
 * Global editor state: loaded JSON documents, active document, and selected scene node.
 * Keeps React panels and the R3F canvas in sync without prop drilling.
 */

import { parseJsonFileToSceneNodes } from "@/adapters/jsonToScene";
import { buildSceneGraphRoot } from "@/scene/buildSceneTree";
import type { TumTrajectorySceneSlice } from "@/scene/buildSceneTree";
import { findNodeById, subtreeContainsNodeId } from "@/scene/graphUtils";
import type { MapRegionItem } from "@/scene/regionMap";
import { buildRegionIdToNodeIdsMap, extractRegionListFromParsedMap } from "@/scene/regionMap";
import type { SceneNode, Vec3 } from "@/scene/types";
import { isJsonMapFileName } from "@/utils/jsonMapFile";
import { parseTumTrajectoryFile } from "@/utils/tumTrajectory";
import { create } from "zustand";

/** Fingerprint for de-duplication: same local file pick usually has stable name, size, lastModified. */
export function fileFingerprint(file: File): string {
  return `${file.name}\0${file.size}\0${file.lastModified}`;
}

/** One user-loaded JSON file and its derived scene graph. */
export interface LoadedJsonDocument {
  readonly id: string;
  readonly fileName: string;
  readonly byteSize: number;
  readonly loadedAt: number;
  readonly fileFingerprint: string;
  /** Raw parsed value for inspector / future tools. */
  readonly raw: unknown;
  readonly root: SceneNode;
  /** From `regionList` when present (map JSON). */
  readonly regionList?: readonly MapRegionItem[];
  /** payload.regionID → scene node ids; built at load, used internally for region filter. */
  readonly regionIdToNodeIds?: ReadonlyMap<number, readonly string[]>;
}

/** Local TUM trajectory file (`timestamp x y z qx qy qz qw` per line); rendered as one polyline under `轨迹`. */
export interface LoadedTumTrajectory {
  readonly id: string;
  readonly fileName: string;
  readonly color: string;
  readonly loadedAt: number;
  readonly pointsScene: readonly Vec3[];
}

const TUM_COLOR_PALETTE = [
  "#e74c3c",
  "#3498db",
  "#2ecc71",
  "#f39c12",
  "#9b59b6",
  "#1abc9c",
  "#e67e22",
  "#34495e",
  "#d35400",
  "#16a085",
] as const;

function tumColorAt(index: number): string {
  return TUM_COLOR_PALETTE[index % TUM_COLOR_PALETTE.length]!;
}

function tumToSceneSlice(t: LoadedTumTrajectory): TumTrajectorySceneSlice {
  return {
    id: t.id,
    fileName: t.fileName,
    color: t.color,
    pointsScene: t.pointsScene,
  };
}

function buildSceneRootFromSlices(
  documents: readonly LoadedJsonDocument[],
  tumTrajectories: readonly LoadedTumTrajectory[],
): SceneNode | null {
  if (documents.length === 0 && tumTrajectories.length === 0) {
    return null;
  }
  return buildSceneGraphRoot(
    documents.map((d) => ({ id: d.id, fileName: d.fileName, root: d.root })),
    tumTrajectories.map(tumToSceneSlice),
  );
}

export interface EditorState {
  readonly documents: readonly LoadedJsonDocument[];
  /** TUM pose files; each becomes a colored polyline under the scene `轨迹` node. */
  readonly tumTrajectories: readonly LoadedTumTrajectory[];
  /**
   * Single scene root (`场景`) whose children are `type: "json"` nodes — one per loaded file.
   * Rebuilt whenever documents change.
   */
  readonly sceneGraphRoot: SceneNode | null;
  readonly activeDocumentId: string | null;
  /** Selected node id within the active document tree; `null` if none. */
  readonly selectedNodeId: string | null;
  /**
   * Last user-visible load problem (e.g. invalid JSON). Cleared on successful load.
   * Check the browser console for per-file details.
   */
  readonly loadError: string | null;
  /**
   * Second (or further) `*json_map.json` load blocked; user dismisses via floating bar 「确认」.
   */
  readonly jsonMapDuplicateNoticeOpen: boolean;
  /**
   * Node ids whose entire subtrees are omitted from the 3D viewport (scene tree still lists them).
   */
  readonly hiddenNodeIds: ReadonlySet<string>;
  /**
   * When set, viewport only draws nodes with matching `payload.regionID`;
   * nodes without `regionID` are always drawn. Toggle off by clicking the same 「筛选」 again.
   */
  readonly activeRegionFilterId: number | null;
  /** When set, the viewport will move the orbit target to this node (scene tree selection only). */
  readonly cameraFocusRequest: string | null;

  /** Read multiple local files, parse JSON, append documents, optionally activate the first new one. */
  loadLocalJsonFiles: (files: FileList | File[]) => Promise<void>;
  /** Parse TUM trajectory `.txt` files; duplicate `file.name` is rejected. */
  loadLocalTumFiles: (files: FileList | File[]) => Promise<void>;
  removeDocument: (documentId: string) => void;
  /** Remove one TUM trajectory by its id (scene node id is `tum-traj-${id}`). */
  removeTumTrajectory: (tumId: string) => void;
  /** Toggle hiding `nodeId` subtree in the 3D view (does not remove data). */
  toggleViewportVisibility: (nodeId: string) => void;
  setActiveDocumentId: (id: string | null) => void;
  /** `fromTree`: when true, request camera focus on the node’s 3D bounds. */
  setSelectedNodeId: (id: string | null, fromTree?: boolean) => void;
  clearCameraFocusRequest: () => void;
  clearSelection: () => void;
  clearLoadError: () => void;
  dismissJsonMapDuplicateNotice: () => void;
  toggleRegionFilter: (regionId: number) => void;
}

function newDocId(): string {
  return crypto.randomUUID();
}

function enrichLoadedDocument(
  id: string,
  fileName: string,
  byteSize: number,
  loadedAt: number,
  fp: string,
  raw: unknown,
  root: SceneNode,
): LoadedJsonDocument {
  let regionList: readonly MapRegionItem[] | undefined;
  let regionIdToNodeIds: ReadonlyMap<number, readonly string[]> | undefined;
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    const rec = raw as Record<string, unknown>;
    if (Array.isArray(rec.regionList)) {
      regionList = extractRegionListFromParsedMap(rec);
      regionIdToNodeIds = buildRegionIdToNodeIdsMap(root);
    }
  }
  return {
    id,
    fileName,
    byteSize,
    loadedAt,
    fileFingerprint: fp,
    raw,
    root,
    regionList,
    regionIdToNodeIds,
  };
}

function pruneHiddenIdsForGraph(hidden: Set<string>, sceneRoot: SceneNode | null): Set<string> {
  if (!sceneRoot || hidden.size === 0) {
    return hidden;
  }
  const next = new Set<string>();
  for (const id of hidden) {
    if (findNodeById(sceneRoot, id)) {
      next.add(id);
    }
  }
  return next;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  documents: [],
  tumTrajectories: [],
  sceneGraphRoot: null,
  activeDocumentId: null,
  selectedNodeId: null,
  loadError: null,
  jsonMapDuplicateNoticeOpen: false,
  hiddenNodeIds: new Set<string>(),
  activeRegionFilterId: null,
  cameraFocusRequest: null,

  loadLocalJsonFiles: async (files) => {
    const list = Array.from(files).filter((f) => /\.json$/i.test(f.name) || f.type === "application/json");
    if (list.length === 0) {
      set({
        loadError: "未识别到 JSON 文件（需扩展名 .json 或 MIME 为 application/json）。",
      });
      return;
    }

    const newDocs: LoadedJsonDocument[] = [];
    const skippedDuplicate: string[] = [];
    const seenInBatch = new Set<string>();
    const existingFp = new Set(get().documents.map((d) => d.fileFingerprint));
    const jsonMapAlreadyLoaded = get().documents.some((d) => isJsonMapFileName(d.fileName));
    let jsonMapTakenInBatch = false;
    let skippedJsonMapConflict = false;
    let parseFailureCount = 0;

    for (const file of list) {
      const fp = fileFingerprint(file);
      if (existingFp.has(fp) || seenInBatch.has(fp)) {
        skippedDuplicate.push(file.name);
        continue;
      }
      seenInBatch.add(fp);

      if (isJsonMapFileName(file.name)) {
        if (jsonMapAlreadyLoaded || jsonMapTakenInBatch) {
          skippedJsonMapConflict = true;
          continue;
        }
      }

      let raw: unknown;
      try {
        const text = await file.text();
        raw = JSON.parse(text) as unknown;
      } catch (err) {
        parseFailureCount += 1;
        console.error(`[json-map-view] Skip invalid JSON: ${file.name}`, err);
        continue;
      }
      const baseName = file.name.replace(/\.json$/i, "");
      const root = parseJsonFileToSceneNodes(raw, { documentName: baseName || "document" });
      const docId = newDocId();
      newDocs.push(
        enrichLoadedDocument(docId, file.name, file.size, Date.now(), fp, raw, root),
      );
      existingFp.add(fp);
      if (isJsonMapFileName(file.name)) {
        jsonMapTakenInBatch = true;
      }
    }

    set((s) => {
      const noticeOpen = skippedJsonMapConflict ? true : s.jsonMapDuplicateNoticeOpen;

      if (newDocs.length === 0) {
        if (skippedDuplicate.length > 0) {
          return {
            loadError: `以下文件与已加载文件相同（名称+大小+修改时间），已跳过：${skippedDuplicate.join("、")}`,
            jsonMapDuplicateNoticeOpen: noticeOpen,
          };
        }
        const onlyJsonMapBlocked =
          skippedJsonMapConflict && parseFailureCount === 0 && skippedDuplicate.length === 0;
        return {
          loadError: onlyJsonMapBlocked
            ? null
            : `未能加载任何文档（共 ${list.length} 个文件）。请确认内容为合法 JSON，详情见控制台。`,
          jsonMapDuplicateNoticeOpen: noticeOpen,
        };
      }

      const documents = [...s.documents, ...newDocs];
      const activeDocumentId = s.activeDocumentId ?? newDocs[0]!.id;
      const sceneGraphRoot = buildSceneRootFromSlices(documents, s.tumTrajectories);
      const dupNote =
        skippedDuplicate.length > 0
          ? `（已跳过重复文件：${skippedDuplicate.join("、")}）`
          : "";
      return {
        documents,
        sceneGraphRoot,
        activeDocumentId,
        selectedNodeId: null,
        loadError: dupNote ? `已加载 ${newDocs.length} 个文件。${dupNote}` : null,
        jsonMapDuplicateNoticeOpen: noticeOpen,
        activeRegionFilterId: null,
        cameraFocusRequest: null,
      };
    });
  },

  loadLocalTumFiles: async (files) => {
    const list = Array.from(files).filter((f) => /\.txt$/i.test(f.name) || f.type === "text/plain");
    if (list.length === 0) {
      set({
        loadError: "未识别到轨迹文本文件（需扩展名 .txt）。",
      });
      return;
    }

    const existingNames = new Set(get().tumTrajectories.map((t) => t.fileName));
    const newItems: LoadedTumTrajectory[] = [];
    const skippedDuplicate: string[] = [];
    let formatFailure = false;
    const seenInBatch = new Set<string>();
    const baseIndex = get().tumTrajectories.length;

    for (const file of list) {
      if (existingNames.has(file.name) || seenInBatch.has(file.name)) {
        skippedDuplicate.push(file.name);
        continue;
      }
      seenInBatch.add(file.name);

      let text: string;
      try {
        text = await file.text();
      } catch (err) {
        console.error(`[json-map-view] Failed to read TUM file: ${file.name}`, err);
        formatFailure = true;
        continue;
      }

      const parsed = parseTumTrajectoryFile(text);
      if (!parsed) {
        formatFailure = true;
        continue;
      }

      const id = newDocId();
      const color = tumColorAt(baseIndex + newItems.length);
      newItems.push({
        id,
        fileName: file.name,
        color,
        loadedAt: Date.now(),
        pointsScene: parsed.pointsScene,
      });
      existingNames.add(file.name);
    }

    set((s) => {
      if (newItems.length === 0) {
        if (skippedDuplicate.length > 0 && !formatFailure) {
          return {
            loadError: `已跳过同名轨迹文件（不允许重复加载）：${skippedDuplicate.join("、")}`,
          };
        }
        if (formatFailure) {
          return {
            loadError:
              skippedDuplicate.length > 0
                ? `已跳过同名：${skippedDuplicate.join("、")}。数据不满足格式要求，加载失败`
                : "数据不满足格式要求，加载失败",
          };
        }
        return { loadError: "未能加载任何轨迹文件。" };
      }

      const tumTrajectories = [...s.tumTrajectories, ...newItems];
      const sceneGraphRoot = buildSceneRootFromSlices(s.documents, tumTrajectories);
      const dupNote =
        skippedDuplicate.length > 0 ? `（已跳过同名文件：${skippedDuplicate.join("、")}）` : "";
      const errNote = formatFailure ? "；部分文件格式错误已跳过" : "";
      return {
        tumTrajectories,
        sceneGraphRoot,
        selectedNodeId: null,
        loadError:
          formatFailure || dupNote
            ? `已加载 ${newItems.length} 条轨迹${dupNote}${errNote}`
            : null,
        activeRegionFilterId: null,
        cameraFocusRequest: null,
      };
    });
  },

  removeDocument: (documentId) => {
    set((s) => {
      const documents = s.documents.filter((d) => d.id !== documentId);
      const sceneGraphRoot = buildSceneRootFromSlices(documents, s.tumTrajectories);
      let activeDocumentId = s.activeDocumentId;
      if (activeDocumentId === documentId) {
        activeDocumentId = documents[0]?.id ?? null;
      }
      let selectedNodeId = s.selectedNodeId;
      if (sceneGraphRoot && selectedNodeId) {
        if (!findNodeById(sceneGraphRoot, selectedNodeId)) {
          selectedNodeId = null;
        }
      } else {
        selectedNodeId = null;
      }
      const hiddenNodeIds = pruneHiddenIdsForGraph(new Set(s.hiddenNodeIds), sceneGraphRoot);
      return {
        documents,
        sceneGraphRoot,
        activeDocumentId,
        selectedNodeId,
        hiddenNodeIds,
        activeRegionFilterId: null,
        cameraFocusRequest: null,
      };
    });
  },

  removeTumTrajectory: (tumId) => {
    set((s) => {
      const tumTrajectories = s.tumTrajectories.filter((t) => t.id !== tumId);
      const sceneGraphRoot = buildSceneRootFromSlices(s.documents, tumTrajectories);
      let selectedNodeId = s.selectedNodeId;
      if (sceneGraphRoot && selectedNodeId) {
        if (!findNodeById(sceneGraphRoot, selectedNodeId)) {
          selectedNodeId = null;
        }
      } else {
        selectedNodeId = null;
      }
      const hiddenNodeIds = pruneHiddenIdsForGraph(new Set(s.hiddenNodeIds), sceneGraphRoot);
      return {
        tumTrajectories,
        sceneGraphRoot,
        selectedNodeId,
        hiddenNodeIds,
        activeRegionFilterId: null,
        cameraFocusRequest: null,
      };
    });
  },

  toggleViewportVisibility: (nodeId) => {
    set((s) => {
      const next = new Set(s.hiddenNodeIds);
      const willHide = !next.has(nodeId);
      if (willHide) {
        next.add(nodeId);
      } else {
        next.delete(nodeId);
      }
      let selectedNodeId = s.selectedNodeId;
      if (willHide && s.sceneGraphRoot && selectedNodeId) {
        const subtree = findNodeById(s.sceneGraphRoot, nodeId);
        if (subtree && subtreeContainsNodeId(subtree, selectedNodeId)) {
          selectedNodeId = null;
        }
      }
      return {
        hiddenNodeIds: next,
        selectedNodeId,
        cameraFocusRequest: selectedNodeId ? s.cameraFocusRequest : null,
      };
    });
  },

  setActiveDocumentId: (id) => {
    set({
      activeDocumentId: id,
      selectedNodeId: null,
      activeRegionFilterId: null,
      cameraFocusRequest: null,
    });
  },

  setSelectedNodeId: (id, fromTree = false) => {
    set({
      selectedNodeId: id,
      cameraFocusRequest: fromTree && id ? id : null,
    });
  },

  clearCameraFocusRequest: () => {
    set({ cameraFocusRequest: null });
  },

  clearSelection: () => {
    set({ selectedNodeId: null, cameraFocusRequest: null });
  },

  clearLoadError: () => {
    set({ loadError: null });
  },

  dismissJsonMapDuplicateNotice: () => {
    set({ jsonMapDuplicateNoticeOpen: false });
  },

  toggleRegionFilter: (regionId) => {
    set((s) => ({
      activeRegionFilterId: s.activeRegionFilterId === regionId ? null : regionId,
    }));
  },
}));

/** Active document or null. */
export function selectActiveDocument(state: EditorState): LoadedJsonDocument | null {
  if (!state.activeDocumentId) {
    return null;
  }
  return state.documents.find((d) => d.id === state.activeDocumentId) ?? null;
}

/** Selected `SceneNode` in the combined scene graph, or null. */
export function selectSelectedNode(state: EditorState): SceneNode | null {
  if (!state.sceneGraphRoot || !state.selectedNodeId) {
    return null;
  }
  return findNodeById(state.sceneGraphRoot, state.selectedNodeId);
}

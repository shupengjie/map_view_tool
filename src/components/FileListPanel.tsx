/**
 * Left-bottom panel: single mixed list of loaded JSON and TUM files (by load time), each removable.
 */

import type { LoadedJsonDocument, LoadedTumTrajectory } from "@/store/useEditorStore";
import { useEditorStore } from "@/store/useEditorStore";
import { useMemo } from "react";

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

type FileListEntry =
  | { kind: "json"; doc: LoadedJsonDocument }
  | { kind: "tum"; tum: LoadedTumTrajectory };

export function FileListPanel() {
  const documents = useEditorStore((s) => s.documents);
  const tumTrajectories = useEditorStore((s) => s.tumTrajectories);
  const activeId = useEditorStore((s) => s.activeDocumentId);
  const setActiveDocumentId = useEditorStore((s) => s.setActiveDocumentId);
  const removeDocument = useEditorStore((s) => s.removeDocument);
  const removeTumTrajectory = useEditorStore((s) => s.removeTumTrajectory);

  const entries = useMemo(() => {
    const rows: FileListEntry[] = [
      ...documents.map((doc) => ({ kind: "json" as const, doc })),
      ...tumTrajectories.map((tum) => ({ kind: "tum" as const, tum })),
    ];
    rows.sort((a, b) => {
      const ta = a.kind === "json" ? a.doc.loadedAt : a.tum.loadedAt;
      const tb = b.kind === "json" ? b.doc.loadedAt : b.tum.loadedAt;
      return ta - tb;
    });
    return rows;
  }, [documents, tumTrajectories]);

  return entries.length === 0 ? (
    <div className="inspector-empty">无已加载文件</div>
  ) : (
    <>
      {entries.map((entry) => {
        if (entry.kind === "json") {
          const d = entry.doc;
          return (
            <div
              key={`json-${d.id}`}
              className={`file-row ${d.id === activeId ? "file-row-active" : ""}`}
            >
              <div
                role="button"
                tabIndex={0}
                className="file-row-main"
                onClick={() => setActiveDocumentId(d.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActiveDocumentId(d.id);
                  }
                }}
              >
                <span className="file-row-name">{d.fileName}</span>
                <span className="file-row-meta">
                  {formatSize(d.byteSize)} · {formatTime(d.loadedAt)}
                </span>
              </div>
              <button
                type="button"
                className="file-row-delete"
                title="从会话中移除此文件及其场景数据"
                aria-label={`删除 ${d.fileName}`}
                onClick={(e) => {
                  e.stopPropagation();
                  removeDocument(d.id);
                }}
              >
                ×
              </button>
            </div>
          );
        }
        const t = entry.tum;
        return (
          <div key={`tum-${t.id}`} className="file-row">
            <div className="file-row-main">
              <span className="file-row-name">{t.fileName}</span>
              <span className="file-row-meta">
                {t.pointsScene.length} 点 · {formatTime(t.loadedAt)}
              </span>
            </div>
            <button
              type="button"
              className="file-row-delete"
              title="从会话中移除此轨迹及其场景数据"
              aria-label={`删除 ${t.fileName}`}
              onClick={(e) => {
                e.stopPropagation();
                removeTumTrajectory(t.id);
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </>
  );
}

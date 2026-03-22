/**
 * Top toolbar: local JSON and TUM trajectory file inputs.
 */

import logoUrl from "@/icons/logo.png";
import { useRef } from "react";
import { useEditorStore } from "@/store/useEditorStore";

export function Toolbar() {
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const tumInputRef = useRef<HTMLInputElement>(null);
  const loadLocalJsonFiles = useEditorStore((s) => s.loadLocalJsonFiles);
  const loadLocalTumFiles = useEditorStore((s) => s.loadLocalTumFiles);
  const loadError = useEditorStore((s) => s.loadError);
  const clearLoadError = useEditorStore((s) => s.clearLoadError);

  return (
    <header className="toolbar">
      <div className="toolbar-brand">
        <img src={logoUrl} alt="" className="toolbar-logo" decoding="async" />
        <span className="toolbar-title">JSON Map View</span>
      </div>
      <div className="toolbar-actions">
        <button
          type="button"
          className="godot-btn godot-btn-primary"
          onClick={() => jsonInputRef.current?.click()}
        >
          加载本地 JSON…
        </button>
        <input
          ref={jsonInputRef}
          type="file"
          accept=".json,application/json"
          multiple
          hidden
          onChange={(e) => {
            const files = e.target.files;
            if (files?.length) {
              void loadLocalJsonFiles(files);
            }
            e.target.value = "";
          }}
        />
        <button type="button" className="godot-btn" onClick={() => tumInputRef.current?.click()}>
          加载 TUM 轨迹
        </button>
        <input
          ref={tumInputRef}
          type="file"
          accept=".txt,text/plain"
          multiple
          hidden
          onChange={(e) => {
            const files = e.target.files;
            if (files?.length) {
              void loadLocalTumFiles(files);
            }
            e.target.value = "";
          }}
        />
      </div>
      {loadError ? (
        <span className="toolbar-error" role="alert">
          {loadError}
          <button type="button" className="toolbar-error-dismiss" onClick={clearLoadError} aria-label="关闭提示">
            ×
          </button>
        </span>
      ) : null}
    </header>
  );
}

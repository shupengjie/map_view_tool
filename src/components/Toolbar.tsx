/**
 * Top toolbar: “加载数据” dropdown — Json地图 / TUM轨迹 / Layer数据 file inputs.
 */

import logoUrl from "@/icons/logo.png";
import { useEffect, useRef, useState } from "react";
import { useEditorStore } from "@/store/useEditorStore";

export function Toolbar() {
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const layerInputRef = useRef<HTMLInputElement>(null);
  const tumInputRef = useRef<HTMLInputElement>(null);
  const menuWrapRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const loadLocalJsonMapFiles = useEditorStore((s) => s.loadLocalJsonMapFiles);
  const loadLocalLayerDataJsonFiles = useEditorStore((s) => s.loadLocalLayerDataJsonFiles);
  const loadLocalTumFiles = useEditorStore((s) => s.loadLocalTumFiles);
  const loadError = useEditorStore((s) => s.loadError);
  const clearLoadError = useEditorStore((s) => s.clearLoadError);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onDocPointerDown = (e: PointerEvent) => {
      const el = menuWrapRef.current;
      if (el && !el.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDocPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="toolbar">
      <div className="toolbar-brand">
        <img src={logoUrl} alt="" className="toolbar-logo" decoding="async" />
        <span className="toolbar-title">JSON Map View</span>
      </div>
      <div className="toolbar-actions">
        <div className="toolbar-load-wrap" ref={menuWrapRef}>
          <button
            type="button"
            className="godot-btn godot-btn-primary toolbar-load-trigger"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            加载数据
            <span className="toolbar-load-chevron" aria-hidden>
              ▾
            </span>
          </button>
          {menuOpen ? (
            <div className="toolbar-load-menu" role="menu" aria-label="加载数据">
              <button
                type="button"
                role="menuitem"
                className="toolbar-load-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  jsonInputRef.current?.click();
                }}
              >
                Json地图
              </button>
              <button
                type="button"
                role="menuitem"
                className="toolbar-load-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  tumInputRef.current?.click();
                }}
              >
                TUM轨迹
              </button>
              <button
                type="button"
                role="menuitem"
                className="toolbar-load-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  layerInputRef.current?.click();
                }}
              >
                Layer数据
              </button>
            </div>
          ) : null}
        </div>
        <input
          ref={jsonInputRef}
          type="file"
          accept=".json,application/json"
          title="须为 .json 且含 json_map（json_map 与 .json 之间可有其他字符）"
          multiple
          hidden
          onChange={(e) => {
            const files = e.target.files;
            if (files?.length) {
              void loadLocalJsonMapFiles(files);
            }
            e.target.value = "";
          }}
        />
        <input
          ref={layerInputRef}
          type="file"
          accept=".json,application/json"
          title="仅支持文件名以 layer_data.json 结尾"
          multiple
          hidden
          onChange={(e) => {
            const files = e.target.files;
            if (files?.length) {
              void loadLocalLayerDataJsonFiles(files);
            }
            e.target.value = "";
          }}
        />
        <input
          ref={tumInputRef}
          type="file"
          accept=".txt,text/plain"
          title="仅支持文件名以 .txt 结尾"
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

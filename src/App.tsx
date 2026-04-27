/**
 * Root layout: toolbar + horizontal resizable columns (scene tree / files | viewport | inspector).
 */

import "@/App.css";
import { FileListPanel } from "@/components/FileListPanel";
import { InspectorPanel } from "@/components/InspectorPanel";
import { JsonMapDuplicateNotice } from "@/components/JsonMapDuplicateNotice";
import { LayerDataDuplicateNotice } from "@/components/LayerDataDuplicateNotice";
import { SceneTreePanel } from "@/components/SceneTreePanel";
import { Toolbar } from "@/components/Toolbar";
import { TumEvoPage } from "@/components/TumEvoPage";
import { Viewport3D } from "@/components/Viewport3D";
import { useEditorStore } from "@/store/useEditorStore";
import type { ReactNode } from "react";
import { useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

function PanelChrome({
  title,
  children,
  viewport = false,
  inspector = false,
}: {
  title: string;
  children: ReactNode;
  /** When true, body does not scroll so WebGL can fill the panel. */
  viewport?: boolean;
  /** When true, body is a flex column so inspector + region list can split and scroll internally. */
  inspector?: boolean;
}) {
  const bodyClass =
    viewport || inspector ? "godot-panel-body godot-panel-body--fill" : "godot-panel-body";
  return (
    <div className="godot-panel" style={{ height: "100%" }}>
      <div className="godot-panel-title">{title}</div>
      <div className={bodyClass}>{children}</div>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState<"home" | "json-map-view" | "tum-evo">("home");
  const resetWorkspace = useEditorStore((s) => s.resetWorkspace);

  const handleBackHome = () => {
    resetWorkspace();
    setPage("home");
  };

  if (page === "home") {
    return (
      <div className="app-shell app-shell--home">
        <main className="home-page">
          <header className="home-page-header">
            <h1 className="home-page-title">泊车SLAM工具集</h1>
            <p className="home-page-subtitle">快速进入各类泊车SLAM常用工具。</p>
          </header>
          <section className="home-grid" aria-label="功能入口列表">
            <button
              type="button"
              className="home-entry-card home-entry-card--primary"
              onClick={() => setPage("json-map-view")}
            >
              <span className="home-entry-title">Json Map View</span>
              <span className="home-entry-desc">加载并查看 json_map 资源，使用场景树、3D 视口和属性面板进行分析。</span>
              <span className="home-entry-action">进入功能</span>
            </button>
            <button
              type="button"
              className="home-entry-card home-entry-card--placeholder"
              onClick={() => setPage("tum-evo")}
            >
              <span className="home-entry-title">TUM EVO</span>
              <span className="home-entry-desc">TUM 格式轨迹的类 EVO 精度对比展示。</span>
              <span className="home-entry-action">进入功能</span>
            </button>
          </section>
        </main>
      </div>
    );
  }

  if (page === "tum-evo") {
    return <TumEvoPage onBackHome={handleBackHome} />;
  }

  return (
    <div className="app-shell">
      <JsonMapDuplicateNotice />
      <LayerDataDuplicateNotice />
      <Toolbar onBackHome={handleBackHome} />
      <div className="app-main-panels">
        <PanelGroup direction="horizontal" autoSaveId="json-map-view-main">
          <Panel defaultSize={22} minSize={14} maxSize={40}>
            <PanelGroup direction="vertical" autoSaveId="json-map-view-left">
              <Panel defaultSize={58} minSize={22}>
                <PanelChrome title="场景树">
                  <SceneTreePanel />
                </PanelChrome>
              </Panel>
              <PanelResizeHandle className="panel-resize-handle" />
              <Panel defaultSize={42} minSize={18}>
                <PanelChrome title="已加载文件">
                  <FileListPanel />
                </PanelChrome>
              </Panel>
            </PanelGroup>
          </Panel>
          <PanelResizeHandle className="panel-resize-handle" />
          <Panel defaultSize={53} minSize={35}>
            <PanelChrome title="3D 视口" viewport>
              <Viewport3D />
            </PanelChrome>
          </Panel>
          <PanelResizeHandle className="panel-resize-handle" />
          <Panel defaultSize={25} minSize={16} maxSize={45}>
            <PanelChrome title="属性" inspector>
              <InspectorPanel />
            </PanelChrome>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}

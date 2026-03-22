/**
 * Root layout: toolbar + horizontal resizable columns (scene tree / files | viewport | inspector).
 */

import "@/App.css";
import { FileListPanel } from "@/components/FileListPanel";
import { InspectorPanel } from "@/components/InspectorPanel";
import { JsonMapDuplicateNotice } from "@/components/JsonMapDuplicateNotice";
import { SceneTreePanel } from "@/components/SceneTreePanel";
import { Toolbar } from "@/components/Toolbar";
import { Viewport3D } from "@/components/Viewport3D";
import type { ReactNode } from "react";
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
  return (
    <div className="app-shell">
      <JsonMapDuplicateNotice />
      <Toolbar />
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

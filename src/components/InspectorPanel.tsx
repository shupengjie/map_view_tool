/**
 * Right panel: Godot-style property inspector (label | value rows), not raw JSON.
 */

import { LANE_LINE_TYPE_LABELS } from "@/adapters/mapJsonToScene";
import { RegionListPanel } from "@/components/RegionListPanel";
import { findDocumentIdForSelectedNode } from "@/scene/graphUtils";
import type { SceneNode } from "@/scene/types";
import { selectActiveDocument, selectSelectedNode, useEditorStore } from "@/store/useEditorStore";
import type { ReactNode } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="inspector-section">
      <div className="inspector-section-title">{title}</div>
      <div className="inspector-section-body">{children}</div>
    </div>
  );
}

function InspectorRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="inspector-row">
      <span className="inspector-row-label" title={label}>
        {label}
      </span>
      <div className="inspector-row-value">{children}</div>
    </div>
  );
}

function formatScalar(v: unknown): string {
  if (v === null || v === undefined) {
    return "—";
  }
  if (typeof v === "number") {
    return Number.isInteger(v) ? String(v) : v.toFixed(6).replace(/\.?0+$/, "");
  }
  if (typeof v === "boolean") {
    return v ? "true" : "false";
  }
  return String(v);
}

function formatJsonish(v: unknown): string {
  if (v === null || v === undefined) {
    return "—";
  }
  if (typeof v === "object") {
    return JSON.stringify(v);
  }
  return formatScalar(v);
}

/** Payload keys that represent a CSS color string in the inspector. */
function isInspectorColorPayloadKey(key: string): boolean {
  const k = key.toLowerCase();
  return k === "color" || (k.endsWith("color") && k !== "vectorcolor");
}

function resolveInspectorCssColor(v: unknown): string | null {
  if (typeof v !== "string") {
    return null;
  }
  const s = v.trim();
  if (!s) {
    return null;
  }
  if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(s)) {
    return s;
  }
  if (/^rgba?\(\s*[^)]+\)$/i.test(s)) {
    return s;
  }
  if (/^hsla?\(\s*[^)]+\)$/i.test(s)) {
    return s;
  }
  if (typeof document !== "undefined") {
    const el = document.createElement("div");
    el.style.color = s;
    if (el.style.color !== "") {
      return s;
    }
  }
  return null;
}

/** Color swatch (legend); falls back to text if the value is not a usable CSS color. */
function InspectorColorLegend({ value }: { value: unknown }) {
  const css = resolveInspectorCssColor(value);
  if (!css) {
    return <span className="inspector-value-text">{formatScalar(value)}</span>;
  }
  return (
    <span className="inspector-color-legend" title={css}>
      <span
        className="inspector-color-swatch"
        style={{ backgroundColor: css }}
        role="img"
        aria-label={css}
      />
    </span>
  );
}

/** Bump / crossWalk: id, length, width, link_id, regionID */
function EndPtRectInspector({
  title,
  sourceFile,
  payload,
}: {
  title: string;
  sourceFile: string | null;
  payload: Record<string, unknown>;
}) {
  return (
    <InspectorSection title={title}>
      <InspectorRow label="来源文件">
        <span className="inspector-value-text">{sourceFile ?? "—"}</span>
      </InspectorRow>
      <InspectorRow label="id">
        <span className="inspector-value-num">{formatScalar(payload.id)}</span>
      </InspectorRow>
      <InspectorRow label="length">
        <span className="inspector-value-num">{formatScalar(payload.length)}</span>
      </InspectorRow>
      <InspectorRow label="width">
        <span className="inspector-value-num">{formatScalar(payload.width)}</span>
      </InspectorRow>
      <InspectorRow label="link_id">
        <span className="inspector-value-num">{formatScalar(payload.link_id)}</span>
      </InspectorRow>
      <InspectorRow label="regionID">
        <span className="inspector-value-num">{formatScalar(payload.regionID)}</span>
      </InspectorRow>
    </InspectorSection>
  );
}

function ArrowPolylineInspector({
  node,
  sourceFile,
}: {
  node: SceneNode;
  sourceFile: string | null;
}) {
  const p = node.payload!;
  return (
    <InspectorSection title="箭头">
      <InspectorRow label="来源文件">
        <span className="inspector-value-text">{sourceFile ?? "—"}</span>
      </InspectorRow>
      <InspectorRow label="arrowType">
        <span className="inspector-value-num">{formatScalar(p.arrowType)}</span>
      </InspectorRow>
      <InspectorRow label="id">
        <span className="inspector-value-num">{formatScalar(p.id)}</span>
      </InspectorRow>
      <InspectorRow label="link_id">
        <span className="inspector-value-num">{formatScalar(p.link_id)}</span>
      </InspectorRow>
      <InspectorRow label="regionID">
        <span className="inspector-value-num">{formatScalar(p.regionID)}</span>
      </InspectorRow>
    </InspectorSection>
  );
}

function RoadLinkInspector({
  sourceFile,
  payload,
}: {
  sourceFile: string | null;
  payload: Record<string, unknown>;
}) {
  return (
    <InspectorSection title="道路链接 (roadLink)">
      <InspectorRow label="来源文件">
        <span className="inspector-value-text">{sourceFile ?? "—"}</span>
      </InspectorRow>
      <InspectorRow label="id">
        <span className="inspector-value-num">{formatScalar(payload.id)}</span>
      </InspectorRow>
      <InspectorRow label="last_linked_roadlink_ids">
        <span className="inspector-value-mono inspector-value-wrap">{formatJsonish(payload.last_linked_roadlink_ids)}</span>
      </InspectorRow>
      <InspectorRow label="next_linked_roadlink_ids">
        <span className="inspector-value-mono inspector-value-wrap">{formatJsonish(payload.next_linked_roadlink_ids)}</span>
      </InspectorRow>
    </InspectorSection>
  );
}

function RoadBoundaryInspector({
  sourceFile,
  payload,
}: {
  sourceFile: string | null;
  payload: Record<string, unknown>;
}) {
  return (
    <InspectorSection title="道路边界线">
      <InspectorRow label="来源文件">
        <span className="inspector-value-text">{sourceFile ?? "—"}</span>
      </InspectorRow>
      <InspectorRow label="侧">
        <span className="inspector-value-text">{formatScalar(payload.side)}</span>
      </InspectorRow>
      <InspectorRow label="id">
        <span className="inspector-value-num">{formatScalar(payload.id)}</span>
      </InspectorRow>
      <InspectorRow label="line_type">
        <span className="inspector-value-num">{formatScalar(payload.line_type)}</span>
      </InspectorRow>
      <InspectorRow label="link_id">
        <span className="inspector-value-num">{formatScalar(payload.link_id)}</span>
      </InspectorRow>
    </InspectorSection>
  );
}

function PillarInspector({
  sourceFile,
  payload,
}: {
  sourceFile: string | null;
  payload: Record<string, unknown>;
}) {
  return (
    <InspectorSection title="立柱 (pillar)">
      <InspectorRow label="来源文件">
        <span className="inspector-value-text">{sourceFile ?? "—"}</span>
      </InspectorRow>
      <InspectorRow label="id">
        <span className="inspector-value-num">{formatScalar(payload.id)}</span>
      </InspectorRow>
      <InspectorRow label="length">
        <span className="inspector-value-num">{formatScalar(payload.length)}</span>
      </InspectorRow>
      <InspectorRow label="width">
        <span className="inspector-value-num">{formatScalar(payload.width)}</span>
      </InspectorRow>
      <InspectorRow label="height">
        <span className="inspector-value-num">{formatScalar(payload.height)}</span>
      </InspectorRow>
      <InspectorRow label="regionID">
        <span className="inspector-value-num">{formatScalar(payload.regionID)}</span>
      </InspectorRow>
      <InspectorRow label="link_id">
        <span className="inspector-value-num">{formatScalar(payload.link_id)}</span>
      </InspectorRow>
    </InspectorSection>
  );
}

function ParkingSlotInspector({
  sourceFile,
  payload,
}: {
  sourceFile: string | null;
  payload: Record<string, unknown>;
}) {
  return (
    <InspectorSection title="停车位 (parkingSlot)">
      <InspectorRow label="来源文件">
        <span className="inspector-value-text">{sourceFile ?? "—"}</span>
      </InspectorRow>
      <InspectorRow label="id">
        <span className="inspector-value-num">{formatScalar(payload.id)}</span>
      </InspectorRow>
      <InspectorRow label="isOccupancy">
        <span className="inspector-value-num">{formatScalar(payload.isOccupancy)}</span>
      </InspectorRow>
      <InspectorRow label="length">
        <span className="inspector-value-num">{formatScalar(payload.length)}</span>
      </InspectorRow>
      <InspectorRow label="width">
        <span className="inspector-value-num">{formatScalar(payload.width)}</span>
      </InspectorRow>
      <InspectorRow label="psType">
        <span className="inspector-value-num">{formatScalar(payload.psType)}</span>
      </InspectorRow>
      <InspectorRow label="regionID">
        <span className="inspector-value-num">{formatScalar(payload.regionID)}</span>
      </InspectorRow>
      <InspectorRow label="link_id">
        <span className="inspector-value-num">{formatScalar(payload.link_id)}</span>
      </InspectorRow>
    </InspectorSection>
  );
}

function laneLineTypeEnumName(payload: Record<string, unknown>): string {
  const lt = payload.lineType;
  if (typeof lt === "number" && lt >= 1 && lt <= 6) {
    return LANE_LINE_TYPE_LABELS[lt - 1]!;
  }
  return "—";
}

function LaneLineInspector({
  sourceFile,
  payload,
}: {
  sourceFile: string | null;
  payload: Record<string, unknown>;
}) {
  return (
    <InspectorSection title="车道线 (laneLine)">
      <InspectorRow label="来源文件">
        <span className="inspector-value-text">{sourceFile ?? "—"}</span>
      </InspectorRow>
      <InspectorRow label="id">
        <span className="inspector-value-num">{formatScalar(payload.id)}</span>
      </InspectorRow>
      <InspectorRow label="lineType">
        <span className="inspector-value-num">{formatScalar(payload.lineType)}</span>
      </InspectorRow>
      <InspectorRow label="类型名称">
        <span className="inspector-value-text">{laneLineTypeEnumName(payload)}</span>
      </InspectorRow>
      <InspectorRow label="link_id">
        <span className="inspector-value-num">{formatScalar(payload.link_id)}</span>
      </InspectorRow>
      <InspectorRow label="regionID">
        <span className="inspector-value-num">{formatScalar(payload.regionID)}</span>
      </InspectorRow>
    </InspectorSection>
  );
}

function RoadBoundaryRefTrajectoryInspector({
  payload,
  sourceFile,
  pointCount,
}: {
  payload: Record<string, unknown>;
  sourceFile: string | null;
  pointCount: number;
}) {
  return (
    <InspectorSection title="参考轨迹线">
      <InspectorRow label="来源文件">
        <span className="inspector-value-text">{sourceFile ?? "—"}</span>
      </InspectorRow>
      <InspectorRow label="颜色">
        <InspectorColorLegend value={payload.roadLinkColor} />
      </InspectorRow>
      <InspectorRow label="边界 id">
        <span className="inspector-value-num">{formatScalar(payload.id)}</span>
      </InspectorRow>
      <InspectorRow label="link_id">
        <span className="inspector-value-num">{formatScalar(payload.link_id)}</span>
      </InspectorRow>
      <InspectorRow label="轨迹点数量">
        <span className="inspector-value-num">{formatScalar(pointCount)}</span>
      </InspectorRow>
    </InspectorSection>
  );
}

function MapTrajectoryInspector({
  payload,
  sourceFile,
}: {
  payload: Record<string, unknown>;
  sourceFile: string | null;
}) {
  return (
    <InspectorSection title="地图轨迹 (trajectories)">
      <InspectorRow label="来源文件">
        <span className="inspector-value-text">{sourceFile ?? "—"}</span>
      </InspectorRow>
      <InspectorRow label="轨迹 id">
        <span className="inspector-value-num">{formatScalar(payload.trajectoryId)}</span>
      </InspectorRow>
      <InspectorRow label="颜色">
        <InspectorColorLegend value={payload.color} />
      </InspectorRow>
      <InspectorRow label="轨迹点数量">
        <span className="inspector-value-num">{formatScalar(payload.pointCount)}</span>
      </InspectorRow>
      <InspectorRow label="首点时间 t">
        <span className="inspector-value-num">{formatScalar(payload.firstT)}</span>
      </InspectorRow>
      <InspectorRow label="末点时间 t">
        <span className="inspector-value-num">{formatScalar(payload.lastT)}</span>
      </InspectorRow>
    </InspectorSection>
  );
}

function TumTrajectoryInspector({
  payload,
  sourceFile,
}: {
  payload: Record<string, unknown>;
  sourceFile: string | null;
}) {
  return (
    <InspectorSection title="TUM 轨迹">
      <InspectorRow label="来源文件">
        <span className="inspector-value-text">{sourceFile ?? "—"}</span>
      </InspectorRow>
      <InspectorRow label="颜色">
        <InspectorColorLegend value={payload.color} />
      </InspectorRow>
      <InspectorRow label="轨迹点数量">
        <span className="inspector-value-num">{formatScalar(payload.pointCount)}</span>
      </InspectorRow>
    </InspectorSection>
  );
}

function LayerDataPointCloudInspector({
  node,
  payload,
  sourceFile,
}: {
  node: SceneNode;
  payload: Record<string, unknown>;
  sourceFile: string | null;
}) {
  const n = node.polylinePoints?.length ?? 0;
  return (
    <InspectorSection title={node.name}>
      <InspectorRow label="来源文件">
        <span className="inspector-value-text">{sourceFile ?? "—"}</span>
      </InspectorRow>
      <InspectorRow label="颜色">
        <InspectorColorLegend value={payload.pointCloudColor} />
      </InspectorRow>
      <InspectorRow label="点数量">
        <span className="inspector-value-num">{formatScalar(n)}</span>
      </InspectorRow>
    </InspectorSection>
  );
}

function LayerDataGraphEdgeInspector({
  payload,
  sourceFile,
}: {
  payload: Record<string, unknown>;
  sourceFile: string | null;
}) {
  return (
    <InspectorSection title="中心图连线">
      <InspectorRow label="来源文件">
        <span className="inspector-value-text">{sourceFile ?? "—"}</span>
      </InspectorRow>
      <InspectorRow label="fromId">
        <span className="inspector-value-num">{formatScalar(payload.fromId)}</span>
      </InspectorRow>
      <InspectorRow label="toId">
        <span className="inspector-value-num">{formatScalar(payload.toId)}</span>
      </InspectorRow>
    </InspectorSection>
  );
}

/** Polyline nodes without a dedicated schema: no arrow-style fields. */
function PolylineFallbackInspector({ sourceFile }: { sourceFile: string | null }) {
  return (
    <InspectorSection title="折线">
      <InspectorRow label="来源文件">
        <span className="inspector-value-text">{sourceFile ?? "—"}</span>
      </InspectorRow>
      <div className="inspector-empty inspector-empty--inline">无扩展属性。</div>
    </InspectorSection>
  );
}

function PolylineInspector({
  node,
  sourceFile,
}: {
  node: SceneNode;
  sourceFile: string | null;
}) {
  const role = node.payload?.role;
  const p = node.payload as Record<string, unknown> | undefined;
  if (role === "mapTrajectory" && p) {
    return <MapTrajectoryInspector payload={p} sourceFile={sourceFile} />;
  }
  if (role === "tumTrajectory" && p) {
    return <TumTrajectoryInspector payload={p} sourceFile={sourceFile} />;
  }
  if (role === "roadBoundaryRefTrajectory" && p) {
    return (
      <RoadBoundaryRefTrajectoryInspector
        payload={p}
        sourceFile={sourceFile}
        pointCount={node.polylinePoints?.length ?? 0}
      />
    );
  }
  if (role === "bump" && p) {
    return <EndPtRectInspector title="减速带 (bump)" sourceFile={sourceFile} payload={p} />;
  }
  if (role === "crossWalk" && p) {
    return <EndPtRectInspector title="人行横道 (crossWalk)" sourceFile={sourceFile} payload={p} />;
  }
  if (role === "laneLine" && p) {
    return <LaneLineInspector sourceFile={sourceFile} payload={p} />;
  }
  if (role === "roadBoundaryLine" && p) {
    return <RoadBoundaryInspector sourceFile={sourceFile} payload={p} />;
  }
  if ((role === "layerDataBoundaryPointCloud" || role === "layerDataLanePointCloud") && p) {
    return <LayerDataPointCloudInspector node={node} payload={p} sourceFile={sourceFile} />;
  }
  if (role === "layerDataGraphEdge" && p) {
    return <LayerDataGraphEdgeInspector payload={p} sourceFile={sourceFile} />;
  }
  if (role === "arrow" && p) {
    return <ArrowPolylineInspector node={node} sourceFile={sourceFile} />;
  }
  return <PolylineFallbackInspector sourceFile={sourceFile} />;
}

function GenericInspector({ node, sourceFile }: { node: SceneNode; sourceFile: string | null }) {
  const t = node.transform;
  const payload = node.payload;

  return (
    <>
      <InspectorSection title="节点">
        <InspectorRow label="来源文件">
          <span className="inspector-value-text">{sourceFile ?? "—"}</span>
        </InspectorRow>
        <InspectorRow label="名称">
          <span className="inspector-value-text">{node.name}</span>
        </InspectorRow>
        <InspectorRow label="类型">
          <span className="inspector-value-enum">{node.type}</span>
        </InspectorRow>
        <InspectorRow label="节点 ID">
          <span className="inspector-value-mono">{node.id}</span>
        </InspectorRow>
      </InspectorSection>

      {t ? (
        <InspectorSection title="变换">
          {t.position ? (
            <InspectorRow label="位置">
              <span className="inspector-value-mono">
                ({t.position.map((n) => n.toFixed(3)).join(", ")})
              </span>
            </InspectorRow>
          ) : null}
          {t.rotation ? (
            <InspectorRow label="旋转">
              <span className="inspector-value-mono">
                ({t.rotation.map((n) => n.toFixed(4)).join(", ")})
              </span>
            </InspectorRow>
          ) : null}
          {t.scale ? (
            <InspectorRow label="缩放">
              <span className="inspector-value-mono">
                ({t.scale.map((n) => n.toFixed(3)).join(", ")})
              </span>
            </InspectorRow>
          ) : null}
        </InspectorSection>
      ) : null}

      {payload && Object.keys(payload).length > 0 ? (
        <InspectorSection title="附加数据">
          {Object.entries(payload).map(([k, v]) => (
            <InspectorRow key={k} label={k}>
              {isInspectorColorPayloadKey(k) && typeof v === "string" ? (
                <InspectorColorLegend value={v} />
              ) : (
                <span className="inspector-value-mono inspector-value-wrap">
                  {typeof v === "object" && v !== null ? JSON.stringify(v) : formatScalar(v)}
                </span>
              )}
            </InspectorRow>
          ))}
        </InspectorSection>
      ) : null}
    </>
  );
}

function RoadLinksLayerInspector({ node, sourceFile }: { node: SceneNode; sourceFile: string | null }) {
  const groupId = node.id;
  const pointMode = useEditorStore((s) => s.roadLinksPointRenderMode.get(groupId) === true);
  const setRoadLinksPointRenderMode = useEditorStore((s) => s.setRoadLinksPointRenderMode);

  return (
    <>
      <InspectorSection title="road_links">
        <div className="inspector-row">
          <span className="inspector-row-label">显示</span>
          <div className="inspector-row-value">
            <label className="inspector-road-links-point-mode">
              <input
                type="checkbox"
                checked={pointMode}
                onChange={(e) => setRoadLinksPointRenderMode(groupId, e.target.checked)}
              />
              <span>点渲染模式</span>
            </label>
          </div>
        </div>
      </InspectorSection>
      <GenericInspector node={node} sourceFile={sourceFile} />
    </>
  );
}

function InspectorContent({
  node,
  sourceFile,
}: {
  node: SceneNode;
  sourceFile: string | null;
}) {
  return (
    <div className="inspector-godot">
      {node.type === "mapFrameAxes" || node.type === "sceneBackgroundGrid" ? (
        <div className="inspector-empty">该节点无属性。</div>
      ) : node.type === "group" &&
        node.payload &&
        (node.payload as Record<string, unknown>).role === "layer" &&
        (node.payload as Record<string, unknown>).layer === "road_links" ? (
        <RoadLinksLayerInspector node={node} sourceFile={sourceFile} />
      ) : node.type === "pillar" && node.payload ? (
        <PillarInspector sourceFile={sourceFile} payload={node.payload as Record<string, unknown>} />
      ) : node.type === "group" && node.payload && (node.payload as Record<string, unknown>).role === "roadLink" ? (
        <RoadLinkInspector sourceFile={sourceFile} payload={node.payload as Record<string, unknown>} />
      ) : node.type === "parkingSlot" && node.payload ? (
        <ParkingSlotInspector sourceFile={sourceFile} payload={node.payload as Record<string, unknown>} />
      ) : node.type === "polyline" && node.payload ? (
        <PolylineInspector node={node} sourceFile={sourceFile} />
      ) : (
        <GenericInspector node={node} sourceFile={sourceFile} />
      )}
    </div>
  );
}

export function InspectorPanel() {
  const node = useEditorStore((s) => selectSelectedNode(s));
  const documents = useEditorStore((s) => s.documents);
  const tumTrajectories = useEditorStore((s) => s.tumTrajectories);
  const sceneGraphRoot = useEditorStore((s) => s.sceneGraphRoot);
  const selectedId = useEditorStore((s) => s.selectedNodeId);
  const activeDoc = useEditorStore(selectActiveDocument);
  const hasRegionPanel = (activeDoc?.regionList?.length ?? 0) > 0;

  const owningDocId =
    sceneGraphRoot && selectedId
      ? findDocumentIdForSelectedNode(sceneGraphRoot, documents, selectedId)
      : null;
  const doc = owningDocId ? documents.find((d) => d.id === owningDocId) : null;
  const tumSourceName =
    node?.payload && (node.payload as Record<string, unknown>).role === "tumTrajectory"
      ? String((node.payload as Record<string, unknown>).fileName ?? "")
      : null;
  const sourceFile = doc?.fileName ?? (tumSourceName && tumSourceName.length > 0 ? tumSourceName : null);

  if (documents.length === 0 && tumTrajectories.length === 0) {
    return <div className="inspector-empty">加载文件后，此处显示选中节点属性。</div>;
  }

  const propertiesBody = !node ? (
    <div className="inspector-empty">在场景树或 3D 视口中选择一个节点。</div>
  ) : (
    <InspectorContent node={node} sourceFile={sourceFile} />
  );

  if (hasRegionPanel) {
    return (
      <div className="inspector-panel-root">
        <PanelGroup direction="vertical" autoSaveId="json-map-view-inspector" className="inspector-panel-group">
          <Panel defaultSize={55} minSize={18}>
            <div className="inspector-panel-region inspector-panel-region--props">{propertiesBody}</div>
          </Panel>
          <PanelResizeHandle className="panel-resize-handle" />
          <Panel defaultSize={45} minSize={15}>
            <div className="inspector-panel-region inspector-panel-region--regions">
              <RegionListPanel />
            </div>
          </Panel>
        </PanelGroup>
      </div>
    );
  }

  return (
    <div className="inspector-panel-root">
      <div className="inspector-panel-region inspector-panel-region--props inspector-panel-region--fill">
        {propertiesBody}
      </div>
    </div>
  );
}

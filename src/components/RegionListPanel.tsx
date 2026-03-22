/**
 * Bottom half of the right column: regionList styled like inspector + file list rows.
 */

import type { MapRegionItem } from "@/scene/regionMap";
import { selectActiveDocument, useEditorStore } from "@/store/useEditorStore";

function formatRegionScalar(v: unknown): string {
  if (v === null || v === undefined) {
    return "—";
  }
  if (typeof v === "number") {
    return Number.isInteger(v) ? String(v) : v.toFixed(6).replace(/\.?0+$/, "");
  }
  return String(v);
}

export function RegionListPanel() {
  const activeDoc = useEditorStore(selectActiveDocument);
  const activeRegionFilterId = useEditorStore((s) => s.activeRegionFilterId);
  const toggleRegionFilter = useEditorStore((s) => s.toggleRegionFilter);

  const list = activeDoc?.regionList;
  if (!list || list.length === 0) {
    return null;
  }

  return (
    <div className="inspector-godot region-list-panel">
      <div className="inspector-section region-list-section">
        <div className="inspector-section-title">区域</div>
        <div className="inspector-section-body region-list-scroll">
          {list.map((r: MapRegionItem) => (
            <div
              key={r.id}
              className={`file-row region-list-item-row ${
                activeRegionFilterId === r.id ? "file-row-active" : ""
              }`}
            >
              <div className="file-row-main region-list-item-main">
                <div className="inspector-row">
                  <span className="inspector-row-label">name</span>
                  <span className="inspector-row-value">
                    <span className="inspector-value-text">{r.name}</span>
                  </span>
                </div>
                <div className="inspector-row">
                  <span className="inspector-row-label">id</span>
                  <span className="inspector-row-value">
                    <span className="inspector-value-num">{formatRegionScalar(r.id)}</span>
                  </span>
                </div>
                <div className="inspector-row">
                  <span className="inspector-row-label">fromRegionHeight</span>
                  <span className="inspector-row-value">
                    <span className="inspector-value-num">{formatRegionScalar(r.fromRegionHeight)}</span>
                  </span>
                </div>
                <div className="inspector-row">
                  <span className="inspector-row-label">toRegionHeight</span>
                  <span className="inspector-row-value">
                    <span className="inspector-value-num">{formatRegionScalar(r.toRegionHeight)}</span>
                  </span>
                </div>
                <div className="inspector-row">
                  <span className="inspector-row-label">fromRegionID</span>
                  <span className="inspector-row-value">
                    <span className="inspector-value-num">{formatRegionScalar(r.fromRegionID)}</span>
                  </span>
                </div>
                <div className="inspector-row">
                  <span className="inspector-row-label">toRegionID</span>
                  <span className="inspector-row-value">
                    <span className="inspector-value-num">{formatRegionScalar(r.toRegionID)}</span>
                  </span>
                </div>
              </div>
              <div className="region-list-filter-slot">
                <button
                  type="button"
                  className={`godot-btn region-list-filter-btn ${
                    activeRegionFilterId === r.id ? "godot-btn-primary" : ""
                  }`}
                  onClick={() => toggleRegionFilter(r.id)}
                >
                  筛选
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

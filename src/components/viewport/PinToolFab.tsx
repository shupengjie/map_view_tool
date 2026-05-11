/**
 * Bottom-right floating action button + measure/pin tools for the 3D viewport.
 *
 * Public component: `ViewportToolbarFab`. The pin popover and float input are kept private to this
 * module — they only exist to support the FAB UX. Quaternion normality is validated in the popover
 * before invoking `addPin`; map↔scene frame conversion happens at render time in `PinAxesNodeView`.
 */

import { useEditorStore } from "@/store/useEditorStore";
import { useCallback, useEffect, useState } from "react";

/** Permits an in-progress float string: optional minus, optional integer/decimal parts. */
const FLOAT_TYPING_PATTERN = /^-?\d*\.?\d*$/;

function parseFloatSafe(raw: string, fallback = 0): number {
  const v = Number.parseFloat(raw);
  return Number.isFinite(v) ? v : fallback;
}

interface PinPoseConfirm {
  readonly position: readonly [number, number, number];
  readonly orientation: readonly [number, number, number, number];
}

/**
 * Quaternion unit-norm tolerance. Real-world data often carries small floating drift, so we accept
 * |‖q‖ − 1| ≤ 1e-3; anything looser usually indicates the user pasted a non-quaternion (e.g. Euler).
 */
const QUAT_NORM_TOLERANCE = 1e-3;

function quaternionNorm(q: readonly [number, number, number, number]): number {
  return Math.hypot(q[0], q[1], q[2], q[3]);
}

/** Single labelled float input (e.g. "X 0.0"). Rejects non-float keystrokes at the source. */
function PinFloatField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="viewport-pin-popover-field">
      <span className="viewport-pin-popover-field-label">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        className="viewport-pin-popover-input"
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          if (FLOAT_TYPING_PATTERN.test(next)) {
            onChange(next);
          }
        }}
      />
    </label>
  );
}

/**
 * Floating pose card anchored to the left of the pin tool button.
 * Inputs are interpreted in the **map file frame** (X 前, Y 左, Z 上); the viewport converts to
 * the Three.js scene frame at render time. Quaternion is validated to be unit-norm before insert.
 */
function ViewportPinPopover({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (pose: PinPoseConfirm) => void;
}) {
  const [posX, setPosX] = useState("0.0");
  const [posY, setPosY] = useState("0.0");
  const [posZ, setPosZ] = useState("0.0");
  const [oriX, setOriX] = useState("0.0");
  const [oriY, setOriY] = useState("0.0");
  const [oriZ, setOriZ] = useState("0.0");
  const [oriW, setOriW] = useState("1.0");
  const [validationError, setValidationError] = useState<string | null>(null);

  const updateOri = (setter: (v: string) => void) => (next: string) => {
    setter(next);
    if (validationError) {
      setValidationError(null);
    }
  };

  const handleConfirm = () => {
    const quat: [number, number, number, number] = [
      parseFloatSafe(oriX),
      parseFloatSafe(oriY),
      parseFloatSafe(oriZ),
      parseFloatSafe(oriW, 1),
    ];
    const norm = quaternionNorm(quat);
    if (!Number.isFinite(norm) || Math.abs(norm - 1) > QUAT_NORM_TOLERANCE) {
      setValidationError(
        `四元数不满足归一化条件：‖q‖ = ${norm.toFixed(6)}（容差 ${QUAT_NORM_TOLERANCE}）`,
      );
      return;
    }
    setValidationError(null);
    onConfirm({
      position: [parseFloatSafe(posX), parseFloatSafe(posY), parseFloatSafe(posZ)],
      orientation: quat,
    });
  };

  return (
    <div
      className="viewport-pin-popover"
      role="dialog"
      aria-label="放置图钉"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="viewport-pin-popover-label">位置（地图坐标系 X 前, Y 左, Z 上）</div>
      <div className="viewport-pin-popover-row">
        <PinFloatField label="X" value={posX} onChange={setPosX} />
        <PinFloatField label="Y" value={posY} onChange={setPosY} />
        <PinFloatField label="Z" value={posZ} onChange={setPosZ} />
      </div>
      <div className="viewport-pin-popover-label">姿态（地图坐标系四元数 qx, qy, qz, qw）</div>
      <div className="viewport-pin-popover-row">
        <PinFloatField label="X" value={oriX} onChange={updateOri(setOriX)} />
        <PinFloatField label="Y" value={oriY} onChange={updateOri(setOriY)} />
      </div>
      <div className="viewport-pin-popover-row">
        <PinFloatField label="Z" value={oriZ} onChange={updateOri(setOriZ)} />
        <PinFloatField label="W" value={oriW} onChange={updateOri(setOriW)} />
      </div>
      {validationError ? (
        <div className="viewport-pin-popover-error" role="alert">
          {validationError}
        </div>
      ) : null}
      <div className="viewport-pin-popover-actions">
        <button type="button" className="godot-btn" onClick={onCancel}>
          取消
        </button>
        <button type="button" className="godot-btn godot-btn-primary" onClick={handleConfirm}>
          确认
        </button>
      </div>
    </div>
  );
}

export function ViewportToolbarFab() {
  const [expanded, setExpanded] = useState(false);
  const [pinPopoverOpen, setPinPopoverOpen] = useState(false);
  const measureDistanceToolActive = useEditorStore((s) => s.measureDistanceToolActive);
  const measureAngleToolActive = useEditorStore((s) => s.measureAngleToolActive);
  const setMeasureDistanceToolActive = useEditorStore((s) => s.setMeasureDistanceToolActive);
  const setMeasureAngleToolActive = useEditorStore((s) => s.setMeasureAngleToolActive);
  const addPin = useEditorStore((s) => s.addPin);

  const closePinPopover = useCallback(() => setPinPopoverOpen(false), []);
  const handlePinConfirm = useCallback(
    (pose: PinPoseConfirm) => {
      addPin(pose);
      setPinPopoverOpen(false);
    },
    [addPin],
  );

  useEffect(() => {
    if (!expanded && pinPopoverOpen) {
      setPinPopoverOpen(false);
    }
  }, [expanded, pinPopoverOpen]);

  return (
    <div className="viewport-toolbar-fab" role="toolbar" aria-label="3D 视口工具">
      {expanded ? (
        <div className="viewport-toolbar-fab-tools">
          <button
            type="button"
            className={`viewport-toolbar-fab-tool${measureDistanceToolActive ? " viewport-toolbar-fab-tool--active" : ""}`}
            title={
              measureDistanceToolActive
                ? "关闭距离测量（Esc 也可退出）"
                : "距离测量：左键选两点；中键拖动旋转；滚轮缩放；右键平移"
            }
            aria-label="距离测量"
            aria-pressed={measureDistanceToolActive}
            onClick={() => setMeasureDistanceToolActive(!measureDistanceToolActive)}
          >
            <svg
              className="viewport-toolbar-fab-icon"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden
            >
              <path
                d="M5 19L19 5"
                stroke="currentColor"
                strokeWidth="1.85"
                strokeLinecap="round"
              />
              <circle cx="5" cy="19" r="2.25" fill="currentColor" />
              <circle cx="19" cy="5" r="2.25" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            className={`viewport-toolbar-fab-tool${measureAngleToolActive ? " viewport-toolbar-fab-tool--active" : ""}`}
            title={
              measureAngleToolActive
                ? "关闭角度测量（Esc 也可退出）"
                : "角度测量：左键选三点，显示夹角（0~180°）；中键拖动旋转；滚轮缩放；右键平移"
            }
            aria-label="角度测量"
            aria-pressed={measureAngleToolActive}
            onClick={() => setMeasureAngleToolActive(!measureAngleToolActive)}
          >
            <svg
              className="viewport-toolbar-fab-icon"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden
            >
              <path d="M5 18L12 6L19 18" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" />
              <path d="M8.8 14.5A4 4 0 0112 12.9a4 4 0 013.2 1.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              <circle cx="12" cy="6" r="1.7" fill="currentColor" />
            </svg>
          </button>
          <div className="viewport-toolbar-fab-tool-wrap">
            <button
              type="button"
              className={`viewport-toolbar-fab-tool${pinPopoverOpen ? " viewport-toolbar-fab-tool--active" : ""}`}
              title={pinPopoverOpen ? "关闭图钉面板" : "图钉：放置一个带位置与姿态的图钉"}
              aria-label="图钉"
              aria-pressed={pinPopoverOpen}
              aria-haspopup="dialog"
              aria-expanded={pinPopoverOpen}
              onClick={() => setPinPopoverOpen((v) => !v)}
            >
              <svg
                className="viewport-toolbar-fab-icon"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden
              >
                <path
                  d="M14.5 3.5l6 6-3.2 1.1-3.9 3.9.6 4.3-2 2-4.6-4.6-4.4 4.4 4.4-4.4-4.6-4.6 2-2 4.3.6 3.9-3.9 1.5-2.8z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {pinPopoverOpen ? (
              <ViewportPinPopover onCancel={closePinPopover} onConfirm={handlePinConfirm} />
            ) : null}
          </div>
        </div>
      ) : null}
      <button
        type="button"
        className={`viewport-toolbar-fab-toggle${expanded ? " viewport-toolbar-fab-toggle--open" : ""}`}
        aria-expanded={expanded}
        title={expanded ? "收起 3D 视口工具" : "3D 视口工具"}
        onClick={() => setExpanded((v) => !v)}
      >
        <svg
          className="viewport-toolbar-fab-icon"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <path
            d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}

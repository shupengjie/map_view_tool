import { createPortal } from "react-dom";
import type { Dispatch, MutableRefObject, PointerEvent, Ref, SetStateAction, WheelEvent } from "react";
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (!ref) {
    return;
  }
  if (typeof ref === "function") {
    ref(value);
  } else {
    (ref as MutableRefObject<T | null>).current = value;
  }
}

function safeChartFileBase(title: string): string {
  const s = title.replace(/[/\\?%*:|"<>]/g, "_").replace(/\s+/g, "_").trim();
  return s.length > 0 ? s.slice(0, 96) : "chart";
}

function stampForFile(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function prepareSvgCloneForRaster(svgEl: SVGSVGElement, logicalW: number, logicalH: number): string {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(logicalW));
  clone.setAttribute("height", String(logicalH));
  clone.querySelectorAll("text").forEach((node) => {
    const el = node as SVGTextElement;
    const ff = el.getAttribute("font-family");
    if (ff && (ff.includes("var(") || ff.includes("--"))) {
      el.setAttribute("font-family", "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace");
    }
  });
  let serialized = new XMLSerializer().serializeToString(clone);
  if (!/\sxmlns=/.test(serialized.split(">", 1)[0] ?? "")) {
    serialized = serialized.replace(/<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return serialized;
}

/**
 * Rasterize the in-DOM SVG (current view / crosshair / tooltip) to a PNG blob.
 */
function chartSvgToPngBlob(
  svgEl: SVGSVGElement,
  logicalW: number,
  logicalH: number,
  quality = 0.92,
): Promise<Blob | null> {
  const serialized = prepareSvgCloneForRaster(svgEl, logicalW, logicalH);
  const svgBlob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  const scale = Math.min(2, Math.max(1, globalThis.devicePixelRatio ?? 1));
  const outW = Math.round(logicalW * scale);
  const outH = Math.round(logicalH * scale);
  return new Promise((resolve, reject) => {
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.fillStyle = "#1e2229";
      ctx.fillRect(0, 0, outW, outH);
      ctx.drawImage(img, 0, 0, outW, outH);
      canvas.toBlob((pngBlob) => resolve(pngBlob), "image/png", quality);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to decode SVG for rasterization"));
    };
    img.src = url;
  });
}

function downloadChartSvgAsPng(svgEl: SVGSVGElement, logicalW: number, logicalH: number, fileBase: string): void {
  void chartSvgToPngBlob(svgEl, logicalW, logicalH).then((pngBlob) => {
    if (!pngBlob) {
      return;
    }
    const a = document.createElement("a");
    const href = URL.createObjectURL(pngBlob);
    a.href = href;
    a.download = `${fileBase}_${stampForFile()}.png`;
    a.rel = "noopener";
    a.click();
    URL.revokeObjectURL(href);
  });
}

async function copyChartSvgPngToClipboard(svgEl: SVGSVGElement, logicalW: number, logicalH: number): Promise<void> {
  const pngBlob = await chartSvgToPngBlob(svgEl, logicalW, logicalH);
  if (!pngBlob) {
    throw new Error("PNG blob is empty");
  }
  const clipboard = navigator.clipboard;
  const ClipboardItemCtor = globalThis.ClipboardItem;
  if (!clipboard?.write || typeof ClipboardItemCtor !== "function") {
    throw new Error("Clipboard image write is not supported in this context");
  }
  await clipboard.write([new ClipboardItemCtor({ [pngBlob.type]: pngBlob })]);
}

export interface InteractiveTimeSeriesSeries {
  readonly label: string;
  readonly color: string;
  readonly points: readonly { t: number; v: number }[];
}

interface ViewBounds {
  readonly t0: number;
  readonly t1: number;
  readonly v0: number;
  readonly v1: number;
}

interface DataBounds {
  readonly tMin: number;
  readonly tMax: number;
  readonly vMin: number;
  readonly vMax: number;
}

const PAD_L = 44;
const PAD_R = 12;
const PAD_T = 22;
const PAD_B = 28;

function computeDataBounds(series: readonly InteractiveTimeSeriesSeries[]): DataBounds | null {
  let tMin = Number.POSITIVE_INFINITY;
  let tMax = Number.NEGATIVE_INFINITY;
  let vMin = Number.POSITIVE_INFINITY;
  let vMax = Number.NEGATIVE_INFINITY;
  for (const s of series) {
    for (const p of s.points) {
      tMin = Math.min(tMin, p.t);
      tMax = Math.max(tMax, p.t);
      vMin = Math.min(vMin, p.v);
      vMax = Math.max(vMax, p.v);
    }
  }
  if (!Number.isFinite(tMin) || tMax <= tMin || !Number.isFinite(vMin) || !Number.isFinite(vMax)) {
    return null;
  }
  const vPad = (vMax - vMin) * 0.08 || 0.01;
  const tPad = (tMax - tMin) * 0.02 || 1e-6;
  return {
    tMin: tMin - tPad,
    tMax: tMax + tPad,
    vMin: vMin - vPad,
    vMax: vMax + vPad,
  };
}

function initialViewFromData(b: DataBounds): ViewBounds {
  return { t0: b.tMin, t1: b.tMax, v0: b.vMin, v1: b.vMax };
}

function clampView(view: ViewBounds, data: DataBounds): ViewBounds {
  const minSpanT = Math.max((data.tMax - data.tMin) * 1e-5, 1e-9);
  const minSpanV = Math.max((data.vMax - data.vMin) * 1e-5, 1e-12);
  const maxSpanT = (data.tMax - data.tMin) * 8;
  const maxSpanV = (data.vMax - data.vMin) * 8;
  let { t0, t1, v0, v1 } = view;
  if (t1 - t0 < minSpanT) {
    const c = (t0 + t1) / 2;
    t0 = c - minSpanT / 2;
    t1 = c + minSpanT / 2;
  }
  if (v1 - v0 < minSpanV) {
    const c = (v0 + v1) / 2;
    v0 = c - minSpanV / 2;
    v1 = c + minSpanV / 2;
  }
  if (t1 - t0 > maxSpanT) {
    const c = (t0 + t1) / 2;
    t0 = c - maxSpanT / 2;
    t1 = c + maxSpanT / 2;
  }
  if (v1 - v0 > maxSpanV) {
    const c = (v0 + v1) / 2;
    v0 = c - maxSpanV / 2;
    v1 = c + maxSpanV / 2;
  }
  return { t0, t1, v0, v1 };
}

function zoomAround(view: ViewBounds, tF: number, vF: number, factor: number, data: DataBounds): ViewBounds {
  const nt0 = tF + (view.t0 - tF) * factor;
  const nt1 = tF + (view.t1 - tF) * factor;
  const nv0 = vF + (view.v0 - vF) * factor;
  const nv1 = vF + (view.v1 - vF) * factor;
  return clampView({ t0: nt0, t1: nt1, v0: nv0, v1: nv1 }, data);
}

function clientToSvgPoint(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } | null {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) {
    return null;
  }
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

function svgToData(
  x: number,
  y: number,
  view: ViewBounds,
  w: number,
  h: number,
): { t: number; v: number } {
  const iw = w - PAD_L - PAD_R;
  const ih = h - PAD_T - PAD_B;
  const t = view.t0 + ((x - PAD_L) / iw) * (view.t1 - view.t0);
  const v = view.v0 + (1 - (y - PAD_T) / ih) * (view.v1 - view.v0);
  return { t, v };
}

function useChartGeometry(w: number, h: number) {
  return useMemo(() => {
    const iw = w - PAD_L - PAD_R;
    const ih = h - PAD_T - PAD_B;
    return { iw, ih };
  }, [w, h]);
}

function buildPaths(
  series: readonly InteractiveTimeSeriesSeries[],
  view: ViewBounds,
  w: number,
  h: number,
): { paths: string[]; tLabel0: string; tLabel1: string; vLabel0: string; vLabel1: string } {
  const iw = w - PAD_L - PAD_R;
  const ih = h - PAD_T - PAD_B;
  const tx = (t: number) => PAD_L + ((t - view.t0) / (view.t1 - view.t0)) * iw;
  const vy = (v: number) => PAD_T + (1 - (v - view.v0) / (view.v1 - view.v0)) * ih;
  const pathStrs = series.map((s) => {
    if (s.points.length === 0) {
      return "";
    }
    return s.points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${tx(p.t).toFixed(2)} ${vy(p.v).toFixed(2)}`)
      .join(" ");
  });
  return {
    paths: pathStrs,
    tLabel0: view.t0.toFixed(3),
    tLabel1: view.t1.toFixed(3),
    vLabel0: view.v0.toFixed(4),
    vLabel1: view.v1.toFixed(4),
  };
}

interface ChartSvgProps {
  readonly w: number;
  readonly h: number;
  readonly title: string;
  readonly unit: string;
  readonly series: readonly InteractiveTimeSeriesSeries[];
  readonly view: ViewBounds;
  readonly setView: Dispatch<SetStateAction<ViewBounds>>;
  readonly dataBounds: DataBounds;
  /** 仅悬浮弹层内：缩放、平移、十字线与坐标提示 */
  readonly interactive: boolean;
}

function inPlotArea(x: number, y: number, w: number, h: number): boolean {
  return x >= PAD_L && x <= w - PAD_R && y >= PAD_T && y <= h - PAD_B;
}

const ChartSvg = forwardRef<SVGSVGElement, ChartSvgProps>(function ChartSvg(
  { w, h, title, unit, series, view, setView, dataBounds, interactive },
  ref,
) {
  const innerRef = useRef<SVGSVGElement | null>(null);
  const setMergedRef = useCallback(
    (el: SVGSVGElement | null) => {
      innerRef.current = el;
      assignRef(ref, el);
    },
    [ref],
  );
  const dragRef = useRef<{ lastX: number; lastY: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number; t: number; v: number } | null>(null);
  const { paths, tLabel0, tLabel1, vLabel0, vLabel1 } = useMemo(
    () => buildPaths(series, view, w, h),
    [series, view, w, h],
  );
  const { iw, ih } = useChartGeometry(w, h);

  const onWheel = useCallback(
    (e: WheelEvent<SVGSVGElement>) => {
      if (!interactive) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const svg = innerRef.current;
      if (!svg) {
        return;
      }
      const p = clientToSvgPoint(svg, e.clientX, e.clientY);
      if (!p || !inPlotArea(p.x, p.y, w, h)) {
        return;
      }
      const factor = e.deltaY > 0 ? 1.07 : 0.93;
      setView((prev) => {
        const { t: tF, v: vF } = svgToData(p.x, p.y, prev, w, h);
        return zoomAround(prev, tF, vF, factor, dataBounds);
      });
    },
    [dataBounds, interactive, setView, w, h],
  );

  const onPointerDown = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      if (!interactive || e.button !== 0) {
        return;
      }
      const svg = innerRef.current;
      if (!svg) {
        return;
      }
      const p = clientToSvgPoint(svg, e.clientX, e.clientY);
      if (!p || !inPlotArea(p.x, p.y, w, h)) {
        return;
      }
      dragRef.current = { lastX: p.x, lastY: p.y };
      setIsPanning(true);
      setHover(null);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [interactive, w, h],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      if (!interactive) {
        return;
      }
      const svg = innerRef.current;
      if (!svg) {
        return;
      }
      const p = clientToSvgPoint(svg, e.clientX, e.clientY);
      if (!p) {
        return;
      }
      if (dragRef.current) {
        const dx = p.x - dragRef.current.lastX;
        const dy = p.y - dragRef.current.lastY;
        dragRef.current = { lastX: p.x, lastY: p.y };
        setView((prev) => {
          const dt = (-dx / iw) * (prev.t1 - prev.t0);
          const dv = (dy / ih) * (prev.v1 - prev.v0);
          return clampView({ t0: prev.t0 + dt, t1: prev.t1 + dt, v0: prev.v0 + dv, v1: prev.v1 + dv }, dataBounds);
        });
        return;
      }
      if (inPlotArea(p.x, p.y, w, h)) {
        const { t, v } = svgToData(p.x, p.y, view, w, h);
        setHover({ x: p.x, y: p.y, t, v });
      } else {
        setHover(null);
      }
    },
    [dataBounds, interactive, iw, ih, setView, view, w, h],
  );

  const onPointerUp = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      dragRef.current = null;
      setIsPanning(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [],
  );

  const onPointerLeave = useCallback(
    (e: PointerEvent<SVGSVGElement>) => {
      dragRef.current = null;
      setIsPanning(false);
      setHover(null);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [],
  );

  const tooltipLines = useMemo(() => {
    if (!hover) {
      return null;
    }
    const tStr = hover.t.toFixed(6);
    const vStr = hover.v.toFixed(6);
    const tw = Math.max(14 * 6, 8 + Math.max(tStr.length, vStr.length) * 6.2);
    const th = 34;
    let tx = hover.x + 10;
    let ty = hover.y - th - 8;
    if (tx + tw > w - PAD_R) {
      tx = hover.x - tw - 10;
    }
    if (ty < PAD_T) {
      ty = hover.y + 10;
    }
    return { tStr, vStr, tw, th, tx, ty, mx: hover.x, my: hover.y };
  }, [hover, w, h]);

  return (
    <svg
      ref={setMergedRef}
      className={interactive ? "tum-evo-chart-svg tum-evo-chart-svg--interactive" : "tum-evo-chart-svg"}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={title}
      onWheel={interactive ? onWheel : undefined}
      onPointerDown={interactive ? onPointerDown : undefined}
      onPointerMove={interactive ? onPointerMove : undefined}
      onPointerUp={interactive ? onPointerUp : undefined}
      onPointerLeave={interactive ? onPointerLeave : undefined}
      onPointerCancel={interactive ? onPointerUp : undefined}
      style={{
        cursor: interactive ? (isPanning ? "grabbing" : hover ? "crosshair" : "grab") : "default",
        touchAction: interactive ? "none" : "auto",
      }}
    >
      <title>{title}</title>
      <rect x="0" y="0" width={w} height={h} fill="rgba(255,255,255,0.03)" rx="4" />
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={h - PAD_B} stroke="rgba(255,255,255,0.25)" />
      <line x1={PAD_L} y1={h - PAD_B} x2={w - PAD_R} y2={h - PAD_B} stroke="rgba(255,255,255,0.25)" />
      <text x={PAD_L} y={h - 6} fill="rgba(255,255,255,0.45)" fontSize="10">
        t (s) {tLabel0} → {tLabel1}
      </text>
      <text x={PAD_L + 4} y={14} fill="rgba(255,255,255,0.5)" fontSize="10">
        {unit} 范围 {vLabel0} … {vLabel1}
      </text>
      {series.map((s, idx) => (
        <path key={s.label} d={paths[idx]!} fill="none" stroke={s.color} strokeWidth="1.75" />
      ))}
      {interactive && tooltipLines ? (
        <g className="tum-evo-chart-crosshair" pointerEvents="none">
          <line
            x1={tooltipLines.mx}
            y1={PAD_T}
            x2={tooltipLines.mx}
            y2={h - PAD_B}
            stroke="rgba(255,255,255,0.55)"
            strokeWidth="1"
            strokeDasharray="5 5"
          />
          <line
            x1={PAD_L}
            y1={tooltipLines.my}
            x2={w - PAD_R}
            y2={tooltipLines.my}
            stroke="rgba(255,255,255,0.55)"
            strokeWidth="1"
            strokeDasharray="5 5"
          />
          <rect
            x={tooltipLines.tx}
            y={tooltipLines.ty}
            width={tooltipLines.tw}
            height={tooltipLines.th}
            rx="4"
            fill="rgba(28, 32, 40, 0.94)"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="1"
          />
          <text x={tooltipLines.tx + 8} y={tooltipLines.ty + 14} fill="rgba(255,255,255,0.92)" fontSize="11" fontFamily="var(--font-mono, monospace)">
            {`t = ${tooltipLines.tStr} s`}
          </text>
          <text x={tooltipLines.tx + 8} y={tooltipLines.ty + 28} fill="rgba(255,255,255,0.92)" fontSize="11" fontFamily="var(--font-mono, monospace)">
            {`${unit} = ${tooltipLines.vStr}`}
          </text>
        </g>
      ) : null}
    </svg>
  );
});

ChartSvg.displayName = "ChartSvg";

export interface InteractiveTimeSeriesChartProps {
  readonly title: string;
  readonly caption: string;
  readonly unit: string;
  readonly series: readonly InteractiveTimeSeriesSeries[];
  /** 内联图尺寸（与 viewBox 一致） */
  readonly width?: number;
  readonly height?: number;
  /** 弹层内大图尺寸（默认约为原 880×420 的 1.5 倍） */
  readonly modalWidth?: number;
  readonly modalHeight?: number;
}

const DEFAULT_MODAL_W = Math.round(880 * 1.5);
const DEFAULT_MODAL_H = Math.round(420 * 1.5);

export function InteractiveTimeSeriesChart({
  title,
  caption,
  unit,
  series,
  width = 520,
  height = 240,
  modalWidth = DEFAULT_MODAL_W,
  modalHeight = DEFAULT_MODAL_H,
}: InteractiveTimeSeriesChartProps) {
  const dataBounds = useMemo(() => computeDataBounds(series), [series]);
  const [view, setViewState] = useState<ViewBounds | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const modalSvgRef = useRef<SVGSVGElement>(null);
  const copyToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setView = useCallback<Dispatch<SetStateAction<ViewBounds>>>(
    (action) => {
      setViewState((prev) => {
        if (!dataBounds) {
          return prev;
        }
        const base = prev ?? initialViewFromData(dataBounds);
        return typeof action === "function" ? (action as (b: ViewBounds) => ViewBounds)(base) : action;
      });
    },
    [dataBounds],
  );

  useEffect(() => {
    if (!dataBounds) {
      setViewState(null);
      return;
    }
    setViewState(initialViewFromData(dataBounds));
  }, [dataBounds]);

  useEffect(() => {
    if (!modalOpen) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModalOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) {
      if (copyToastTimerRef.current !== null) {
        clearTimeout(copyToastTimerRef.current);
        copyToastTimerRef.current = null;
      }
      setCopyToast(null);
    }
  }, [modalOpen]);

  useEffect(() => {
    return () => {
      if (copyToastTimerRef.current !== null) {
        clearTimeout(copyToastTimerRef.current);
      }
    };
  }, []);

  const resetView = useCallback(() => {
    if (dataBounds) {
      setView(initialViewFromData(dataBounds));
    }
  }, [dataBounds, setView]);

  const saveModalChartPng = useCallback(() => {
    const el = modalSvgRef.current;
    if (!el) {
      return;
    }
    try {
      downloadChartSvgAsPng(el, modalWidth, modalHeight, safeChartFileBase(title));
    } catch (e) {
      console.error("Failed to save chart image", e);
    }
  }, [modalHeight, modalWidth, title]);

  const copyBusyRef = useRef(false);
  const showCopyToast = useCallback((message: string) => {
    if (copyToastTimerRef.current !== null) {
      clearTimeout(copyToastTimerRef.current);
    }
    setCopyToast(message);
    copyToastTimerRef.current = setTimeout(() => {
      setCopyToast(null);
      copyToastTimerRef.current = null;
    }, 2800);
  }, []);

  const copyModalChartPng = useCallback(async () => {
    const el = modalSvgRef.current;
    if (!el || copyBusyRef.current) {
      return;
    }
    copyBusyRef.current = true;
    try {
      await copyChartSvgPngToClipboard(el, modalWidth, modalHeight);
      showCopyToast("复制成功，图片已写入剪贴板");
    } catch (e) {
      console.error("Failed to copy chart image", e);
    } finally {
      copyBusyRef.current = false;
    }
  }, [modalHeight, modalWidth, showCopyToast]);

  if (!dataBounds || !view) {
    return null;
  }

  const hintInline = "双击图表可在中央弹窗中缩放、平移，并查看十字线与坐标读数。";
  const hintModal = "滚轮缩放 · 拖拽平移 · 鼠标在绘图区内显示时间与数值";

  const modal = modalOpen
    ? createPortal(
        <>
          <div
            className="tum-evo-chart-modal-backdrop"
            role="presentation"
            onClick={() => setModalOpen(false)}
          >
            <div
              className="tum-evo-chart-modal-card"
              role="dialog"
              aria-modal="true"
              aria-label={`${title}（放大）`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="tum-evo-chart-modal-header">
                <h4 className="tum-evo-chart-modal-title">{title}</h4>
                <div className="tum-evo-chart-modal-actions">
                  <button type="button" className="tum-evo-chart-modal-btn" onClick={() => void copyModalChartPng()}>
                    复制图片
                  </button>
                  <button type="button" className="tum-evo-chart-modal-btn" onClick={saveModalChartPng}>
                    保存图片
                  </button>
                  <button type="button" className="tum-evo-chart-modal-btn" onClick={resetView}>
                    重置视图
                  </button>
                  <button
                    type="button"
                    className="tum-evo-chart-modal-close"
                    aria-label="关闭"
                    onClick={() => setModalOpen(false)}
                  >
                    ×
                  </button>
                </div>
              </div>
              <p className="tum-evo-chart-modal-caption">{caption}</p>
              <p className="tum-evo-chart-hint-inline tum-evo-chart-hint-inline--modal">{hintModal}</p>
              <div className="tum-evo-chart-modal-plot" style={{ aspectRatio: `${modalWidth} / ${modalHeight}` }}>
                <ChartSvg
                  ref={modalSvgRef}
                  w={modalWidth}
                  h={modalHeight}
                  title={title}
                  unit={unit}
                  series={series}
                  view={view}
                  setView={setView}
                  dataBounds={dataBounds}
                  interactive
                />
              </div>
              <div className="tum-evo-chart-legend tum-evo-chart-legend--modal">
                {series.map((s) => (
                  <span key={s.label} className="tum-evo-chart-legend-item">
                    <i className="tum-evo-chart-swatch" style={{ background: s.color }} />
                    {s.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
          {copyToast ? (
            <div className="tum-evo-chart-copy-toast" role="status" aria-live="polite">
              {copyToast}
            </div>
          ) : null}
        </>,
        document.body,
      )
    : null;

  return (
    <>
      <figure className="tum-evo-chart-figure">
        <h4 className="tum-evo-chart-title">{title}</h4>
        <p className="tum-evo-chart-caption">{caption}</p>
        <p className="tum-evo-chart-hint-inline">{hintInline}</p>
        <div
          className="tum-evo-chart-plot-wrap"
          style={{ aspectRatio: `${width} / ${height}` }}
          onDoubleClick={(e) => {
            e.preventDefault();
            setModalOpen(true);
          }}
        >
          <ChartSvg
            w={width}
            h={height}
            title={title}
            unit={unit}
            series={series}
            view={view}
            setView={setView}
            dataBounds={dataBounds}
            interactive={false}
          />
        </div>
        <div className="tum-evo-chart-legend">
          {series.map((s) => (
            <span key={s.label} className="tum-evo-chart-legend-item">
              <i className="tum-evo-chart-swatch" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </figure>
      {modal}
    </>
  );
}

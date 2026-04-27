import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { parseTumTrajectoryFile, type ParsedTumTrajectory } from "@/utils/tumTrajectory";
import { TumEvoToolbar } from "@/components/TumEvoToolbar";
import { TumEvoTrajectoryPresentation } from "@/components/TumEvoTrajectoryPresentation";

function TumEvoDocToc() {
  return (
    <aside className="tum-evo-doc-toc" aria-label="本页目录">
      <p className="tum-evo-doc-toc-heading">目录</p>
      <nav className="tum-evo-doc-toc-nav">
        <ul className="tum-evo-doc-toc-root">
          <li>
            <a href="#tum-evo-doc-section-1">一、评价基础设定</a>
          </li>
          <li>
            <a href="#tum-evo-doc-section-2">二、轨迹信息呈现</a>
            <ul className="tum-evo-doc-toc-nested">
              <li>
                <a href="#tum-evo-doc-viz-3d">三维轨迹</a>
              </li>
              <li>
                <a href="#tum-evo-doc-viz-position">位置分量随时间</a>
              </li>
              <li>
                <a href="#tum-evo-doc-viz-rpy">姿态 (RPY) 随时间</a>
              </li>
              <li>
                <a href="#tum-evo-doc-viz-velocity">车辆速度随时间</a>
              </li>
            </ul>
          </li>
          <li>
            <a href="#tum-evo-doc-section-3">三、绝对位姿误差(APE)</a>
            <ul className="tum-evo-doc-toc-nested">
              <li>
                <a href="#tum-evo-doc-ape-timeseries">APE 误差随时间</a>
              </li>
            </ul>
          </li>
        </ul>
      </nav>
    </aside>
  );
}

type TumDisplayMode = "origin" | "best_effort";

interface TumCompareStats {
  readonly count: number;
  readonly rmse: number;
  readonly mean: number;
  readonly median: number;
  readonly max: number;
}

interface TumCompareResult {
  readonly mode: TumDisplayMode;
  readonly stats: TumCompareStats;
  readonly gtXY: readonly [number, number][];
  readonly estXY: readonly [number, number][];
}

function nearestPairs(
  gt: ParsedTumTrajectory,
  est: ParsedTumTrajectory,
): readonly [readonly [number, number, number], readonly [number, number, number]][] {
  const out: [readonly [number, number, number], readonly [number, number, number]][] = [];
  let j = 0;
  for (const g of gt.rows) {
    while (j + 1 < est.rows.length && est.rows[j + 1]!.timestamp <= g.timestamp) {
      j += 1;
    }
    const c0 = est.rows[j];
    const c1 = est.rows[j + 1];
    const pick =
      c0 && c1
        ? Math.abs(c0.timestamp - g.timestamp) <= Math.abs(c1.timestamp - g.timestamp)
          ? c0
          : c1
        : c0 ?? c1;
    if (!pick) {
      continue;
    }
    out.push([[g.x, g.y, g.z], [pick.x, pick.y, pick.z]]);
  }
  return out;
}

function summarizeErrors(errors: readonly number[]): TumCompareStats {
  const sorted = [...errors].sort((a, b) => a - b);
  const count = sorted.length;
  if (count === 0) {
    return { count: 0, rmse: 0, mean: 0, median: 0, max: 0 };
  }
  const sum = sorted.reduce((acc, x) => acc + x, 0);
  const sse = sorted.reduce((acc, x) => acc + x * x, 0);
  const mean = sum / count;
  const rmse = Math.sqrt(sse / count);
  const median =
    count % 2 ? sorted[(count - 1) / 2]! : (sorted[count / 2 - 1]! + sorted[count / 2]!) / 2;
  return { count, rmse, mean, median, max: sorted[count - 1]! };
}

function runTumDisplayComparison(
  gt: ParsedTumTrajectory,
  est: ParsedTumTrajectory,
): readonly [TumCompareResult, TumCompareResult] | null {
  const pairs = nearestPairs(gt, est);
  if (pairs.length < 2) {
    return null;
  }
  const g0 = pairs[0]![0];
  const e0 = pairs[0]![1];
  const dx0 = g0[0] - e0[0];
  const dy0 = g0[1] - e0[1];
  const dz0 = g0[2] - e0[2];

  const gCx = pairs.reduce((acc, p) => acc + p[0][0], 0) / pairs.length;
  const gCy = pairs.reduce((acc, p) => acc + p[0][1], 0) / pairs.length;
  const gCz = pairs.reduce((acc, p) => acc + p[0][2], 0) / pairs.length;
  const eCx = pairs.reduce((acc, p) => acc + p[1][0], 0) / pairs.length;
  const eCy = pairs.reduce((acc, p) => acc + p[1][1], 0) / pairs.length;
  const eCz = pairs.reduce((acc, p) => acc + p[1][2], 0) / pairs.length;
  const dxc = gCx - eCx;
  const dyc = gCy - eCy;
  const dzc = gCz - eCz;

  const makeResult = (mode: TumDisplayMode): TumCompareResult => {
    const gtXY: [number, number][] = [];
    const estXY: [number, number][] = [];
    const errors: number[] = [];
    for (const [g, e] of pairs) {
      const dx = mode === "origin" ? dx0 : dxc;
      const dy = mode === "origin" ? dy0 : dyc;
      const dz = mode === "origin" ? dz0 : dzc;
      const ax = e[0] + dx;
      const ay = e[1] + dy;
      const az = e[2] + dz;
      const ex = g[0] - ax;
      const ey = g[1] - ay;
      const ez = g[2] - az;
      errors.push(Math.hypot(ex, ey, ez));
      gtXY.push([g[0], g[1]]);
      estXY.push([ax, ay]);
    }
    return { mode, stats: summarizeErrors(errors), gtXY, estXY };
  };
  return [makeResult("origin"), makeResult("best_effort")];
}

export function TumEvoPage({ onBackHome }: { onBackHome: () => void }) {
  const [tumGt, setTumGt] = useState<{ name: string; data: ParsedTumTrajectory } | null>(null);
  const [tumTest, setTumTest] = useState<{ name: string; data: ParsedTumTrajectory } | null>(null);
  const [tumComparing, setTumComparing] = useState(false);
  const [tumError, setTumError] = useState<string | null>(null);
  const gtInputRef = useRef<HTMLInputElement>(null);
  const testInputRef = useRef<HTMLInputElement>(null);
  /** 避免「返回主页」或路由切换后，异步读文件仍对已卸载页面 setState；卸载时顺带释放弹层可能遗留的 body 滚动锁。 */
  const tumEvoMountedRef = useRef(true);

  useLayoutEffect(() => {
    tumEvoMountedRef.current = true;
    return () => {
      tumEvoMountedRef.current = false;
      document.body.style.removeProperty("overflow");
    };
  }, []);

  const loadOneTum = async (
    files: FileList,
    setter: (v: { name: string; data: ParsedTumTrajectory } | null) => void,
  ) => {
    const file = files[0];
    if (!file) {
      return;
    }
    if (!file.name.toLowerCase().endsWith(".txt")) {
      if (tumEvoMountedRef.current) {
        setTumError("仅支持 .txt 的 TUM 轨迹文件。");
      }
      return;
    }
    const text = await file.text();
    if (!tumEvoMountedRef.current) {
      return;
    }
    const parsed = parseTumTrajectoryFile(text);
    if (!tumEvoMountedRef.current) {
      return;
    }
    if (!parsed) {
      if (tumEvoMountedRef.current) {
        setTumError("文件格式不符合 TUM 要求（timestamp tx ty tz qx qy qz qw）。");
      }
      return;
    }
    if (!tumEvoMountedRef.current) {
      return;
    }
    setter({ name: file.name, data: parsed });
    setTumComparing(false);
    setTumError(null);
  };

  const handleBackHome = useCallback(() => {
    if (typeof globalThis.window !== "undefined" && globalThis.window.location.hash) {
      const { pathname, search } = globalThis.window.location;
      globalThis.window.history.replaceState(null, "", `${pathname}${search}`);
    }
    onBackHome();
  }, [onBackHome]);

  return (
    <div className="app-shell">
      <TumEvoToolbar onBackHome={handleBackHome} />
      <main
        className={tumComparing ? "tum-evo-page tum-evo-page--scroll-doc" : "tum-evo-page tum-evo-page--centered"}
      >
        {!tumComparing ? (
          <section className="tum-evo-overlay-card tum-evo-overlay-card--refined" aria-label="加载轨迹数据">
            <h2 className="tum-evo-title">加载轨迹数据</h2>
            <div className="tum-evo-row">
              <span className="tum-evo-file-name">{tumGt?.name ?? "未加载文件，请加载"}</span>
              <button
                type="button"
                className={
                  tumGt
                    ? "godot-btn tum-evo-row-btn tum-evo-row-btn--danger"
                    : "godot-btn godot-btn-primary tum-evo-row-btn"
                }
                disabled={tumComparing}
                onClick={() => {
                  if (tumGt) {
                    setTumGt(null);
                    setTumComparing(false);
                  } else {
                    gtInputRef.current?.click();
                  }
                }}
              >
                {tumGt ? "清除数据" : "加载真值数据"}
              </button>
            </div>
            <div className="tum-evo-row">
              <span className="tum-evo-file-name">{tumTest?.name ?? "未加载文件，请加载"}</span>
              <button
                type="button"
                className={
                  tumTest
                    ? "godot-btn tum-evo-row-btn tum-evo-row-btn--danger"
                    : "godot-btn godot-btn-primary tum-evo-row-btn"
                }
                disabled={tumComparing}
                onClick={() => {
                  if (tumTest) {
                    setTumTest(null);
                    setTumComparing(false);
                  } else {
                    testInputRef.current?.click();
                  }
                }}
              >
                {tumTest ? "清除数据" : "加载测试数据"}
              </button>
            </div>
            <div className="tum-evo-row tum-evo-row--confirm">
              <button
                type="button"
                className={
                  tumComparing
                    ? "godot-btn tum-evo-row-btn tum-evo-row-btn--danger tum-evo-confirm-btn"
                    : "godot-btn godot-btn-primary tum-evo-row-btn tum-evo-confirm-btn"
                }
                disabled={!tumComparing && !(tumGt && tumTest)}
                onClick={() => {
                  if (tumComparing) {
                    setTumComparing(false);
                    return;
                  }
                  if (!tumGt || !tumTest) {
                    return;
                  }
                  const next = runTumDisplayComparison(tumGt.data, tumTest.data);
                  if (!next) {
                    setTumError("有效匹配点数量不足，无法生成对比结果。");
                    return;
                  }
                  setTumComparing(true);
                }}
              >
                {tumComparing ? "取消对比" : "确认对比"}
              </button>
            </div>
            <input
              ref={gtInputRef}
              type="file"
              accept=".txt,text/plain"
              hidden
              onChange={(e) => {
                if (e.target.files?.length) {
                  void loadOneTum(e.target.files, setTumGt);
                }
                e.target.value = "";
              }}
            />
            <input
              ref={testInputRef}
              type="file"
              accept=".txt,text/plain"
              hidden
              onChange={(e) => {
                if (e.target.files?.length) {
                  void loadOneTum(e.target.files, setTumTest);
                }
                e.target.value = "";
              }}
            />
          </section>
        ) : null}
        {tumComparing ? (
          <section className="tum-evo-doc-shell" aria-label="轨迹精度对比文档">
            <header className="tum-evo-doc-header">
              <h1 className="tum-evo-doc-title">轨迹精度对比</h1>
            </header>
            <div className="tum-evo-doc-layout">
              <article className="tum-evo-doc-body">
                <p>
                  本文采用行业标准评价体系，对不同算法的轨迹精度进行量化对比，核心围绕绝对位姿误差、相对位姿误差及衍生统计指标展开，同时结合运动维度拆分与可视化分析，确保评价全面、客观、可复现。以下为具体评价指标及规范说明。
                </p>
                <h2 id="tum-evo-doc-section-1">一、 评价基础设定</h2>
                <p>
                  1. 轨迹数据说明：所有待评价轨迹均统一为TUM格式（每行包含 timestamp tx ty tz qx qy qz qw），确保时间戳对齐、数据格式一致。
                </p>
                <p>
                  2. 数据对齐方式： 根据实验需求选择对齐策略，默认采用「起点对齐（--align_origin）」。
                </p>
                {tumGt && tumTest ? (
                  <TumEvoTrajectoryPresentation gt={tumGt.data} est={tumTest.data} />
                ) : null}
              </article>
              <TumEvoDocToc />
            </div>
          </section>
        ) : null}
        {tumError ? (
          <div className="floating-notice-bar tum-evo-floating-notice" role="alert">
            <span className="floating-notice-text">{tumError}</span>
            <button
              type="button"
              className="godot-btn godot-btn-primary floating-notice-confirm"
              onClick={() => setTumError(null)}
            >
              确认
            </button>
          </div>
        ) : null}
      </main>
    </div>
  );
}

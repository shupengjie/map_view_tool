import { Canvas, useThree } from "@react-three/fiber";
import { GizmoHelper, GizmoViewport, Grid, Line, OrbitControls } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { Box3, Sphere, Vector3 } from "three";
import { mapJsonPointToThree } from "@/adapters/mapJsonToScene";
import { InteractiveTimeSeriesChart } from "@/components/InteractiveTimeSeriesChart";
import {
  GIZMO_VIEWPORT_AXIS_COLORS,
  MAP_FRAME_SCENE_GRID_FADE_DISTANCE,
  MapFrameAxesR3f,
} from "@/components/MapFrameAxes";
import type { ParsedTumTrajectory } from "@/utils/tumTrajectory";
import {
  computeApeAnalysis,
  computeTrajectoryScalarErrors,
  summarizeSeriesErrorStats,
  type ApeErrorStats,
  type SeriesErrorStats,
} from "@/utils/tumEvoApe";
import {
  computeOriginAlignedBundle,
  quatToRpyRad,
  radToDeg,
  type TumOriginAlignedBundle,
  type TumPoseWithVel,
} from "@/utils/tumEvoViz";

type Vec3Tuple = readonly [number, number, number];

/**
 * TUM 与 json_map 一致：文件内 x=车头前、y=车身左、z=车顶上；映射到 Three.js Y-up 场景（与主视口相同）。
 */
function trajectoryVehicleToScenePoints(rows: readonly { x: number; y: number; z: number }[]): Vec3Tuple[] {
  return rows.map((r) => mapJsonPointToThree({ x: r.x, y: r.y, z: r.z }));
}

/** 阻止滚轮事件冒泡到页面，避免缩放 3D 视口时带动整页滚动。 */
function TumEvoCanvasWrap({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const onWheel = (e: WheelEvent) => {
      if (!el.contains(e.target as Node)) {
        return;
      }
      e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  return (
    <div className="tum-evo-canvas-wrap" ref={ref}>
      {children}
    </div>
  );
}

/**
 * 仅在轨迹数据集变化时做一次相机拟合。不把 canvas 的 size 列入依赖，避免页面滚动引起尺寸变化后重置相机与 OrbitControls 状态。
 */
function CameraFit({ pointsA, pointsB }: { pointsA: Vec3Tuple[]; pointsB: Vec3Tuple[] }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const lastFitKey = useRef("");
  const fitKey = useMemo(() => {
    if (pointsA.length === 0 && pointsB.length === 0) {
      return "";
    }
    const tail = (pts: Vec3Tuple[]) => (pts.length ? pts[pts.length - 1]! : null);
    const h = (p: Vec3Tuple | null) => (p ? `${p[0]},${p[1]},${p[2]}` : "");
    return `${pointsA.length}|${pointsB.length}|${h(pointsA[0] ?? null)}|${h(tail(pointsA))}|${h(pointsB[0] ?? null)}|${h(tail(pointsB))}`;
  }, [pointsA, pointsB]);

  useLayoutEffect(() => {
    if (!fitKey || lastFitKey.current === fitKey) {
      return;
    }
    lastFitKey.current = fitKey;
    const box = new Box3();
    for (const p of pointsA) {
      box.expandByPoint(new Vector3(p[0], p[1], p[2]));
    }
    for (const p of pointsB) {
      box.expandByPoint(new Vector3(p[0], p[1], p[2]));
    }
    if (box.isEmpty()) {
      return;
    }
    const center = box.getCenter(new Vector3());
    const sphere = new Sphere();
    box.getBoundingSphere(sphere);
    const r = Math.max(sphere.radius, 0.5);
    const dist = r * 2.8;
    const { clientWidth, clientHeight } = gl.domElement;
    const aspect = clientWidth / Math.max(clientHeight, 1);
    camera.position.set(center.x + dist * 0.85, center.y + dist * 0.55, center.z + dist * 0.85 * aspect);
    camera.near = Math.max(0.01, dist / 200);
    camera.far = dist * 50;
    camera.updateProjectionMatrix();
    camera.lookAt(center);
  }, [camera, gl, fitKey, pointsA, pointsB]);
  return null;
}

function TumEvoScene3D({
  gtPoints,
  estPoints,
}: {
  gtPoints: Vec3Tuple[];
  estPoints: Vec3Tuple[];
}) {
  return (
    <>
      <color attach="background" args={["#1e2229"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[8, 14, 10]} intensity={0.9} />
      <Grid
        infiniteGrid
        fadeDistance={MAP_FRAME_SCENE_GRID_FADE_DISTANCE}
        fadeStrength={1.25}
        cellSize={1}
        cellThickness={0.55}
        cellColor="#424242"
        sectionSize={10}
        sectionThickness={1.05}
        sectionColor="#4f6fa8"
        position={[0, 0, 0]}
      />
      <MapFrameAxesR3f />
      <Line points={gtPoints} color="#72c2ff" lineWidth={2} />
      <Line points={estPoints} color="#ffb77a" lineWidth={2} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
      <GizmoHelper alignment="top-right" margin={[72, 72]}>
        <GizmoViewport
          labels={["前", "上", "右"]}
          axisColors={[...GIZMO_VIEWPORT_AXIS_COLORS]}
          labelColor="#e8e8e8"
        />
      </GizmoHelper>
      <CameraFit pointsA={gtPoints} pointsB={estPoints} />
    </>
  );
}

function VizSection({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <div className="tum-evo-viz-section">
      <h3 id={id} className="tum-evo-viz-section-title">
        {title}
      </h3>
      {children}
    </div>
  );
}

function rowsToTimeValue(
  rows: readonly TumPoseWithVel[],
  getV: (r: TumPoseWithVel) => number,
  t0: number,
): { t: number; v: number }[] {
  return rows.map((r) => ({ t: r.timestamp - t0, v: getV(r) }));
}

function fmtApeM(x: number): string {
  return x.toFixed(4);
}

function fmtApeDeg(x: number): string {
  return x.toFixed(4);
}

function fmtApeSse(x: number): string {
  if (!Number.isFinite(x)) {
    return "—";
  }
  return Math.abs(x) >= 1e4 || Math.abs(x) < 1e-3 ? x.toExponential(4) : x.toFixed(4);
}

function fmtEmpiricalSigmaProb(p: number): string {
  return `${(p * 100).toFixed(2)}%`;
}

function buildSeriesErrorTableStats(
  bundle: TumOriginAlignedBundle | null,
): Record<
  | "posX"
  | "posY"
  | "posZ"
  | "rollDeg"
  | "pitchDeg"
  | "yawDeg"
  | "speed"
  | "vx"
  | "vy"
  | "vz",
  SeriesErrorStats | null
> | null {
  if (!bundle) {
    return null;
  }
  const err = computeTrajectoryScalarErrors(bundle);
  if (!err) {
    return null;
  }
  const mdPos = 6;
  const mdAngle = 4;
  const mdVel = 6;
  return {
    posX: summarizeSeriesErrorStats(err.posX, mdPos),
    posY: summarizeSeriesErrorStats(err.posY, mdPos),
    posZ: summarizeSeriesErrorStats(err.posZ, mdPos),
    rollDeg: summarizeSeriesErrorStats(err.rollDeg, mdAngle),
    pitchDeg: summarizeSeriesErrorStats(err.pitchDeg, mdAngle),
    yawDeg: summarizeSeriesErrorStats(err.yawDeg, mdAngle),
    speed: summarizeSeriesErrorStats(err.speed, mdVel),
    vx: summarizeSeriesErrorStats(err.vx, mdVel),
    vy: summarizeSeriesErrorStats(err.vy, mdVel),
    vz: summarizeSeriesErrorStats(err.vz, mdVel),
  };
}

function TumEvoSeriesErrorTable({
  caption,
  unitLabel,
  stats,
  valueFmt,
  varianceFmt = fmtApeSse,
}: {
  caption: string;
  unitLabel: string;
  stats: SeriesErrorStats | null;
  valueFmt: (n: number) => string;
  varianceFmt?: (n: number) => string;
}) {
  if (!stats) {
    return null;
  }
  return (
    <div className="tum-evo-ape-table-wrap tum-evo-series-error-table-wrap">
      <table className="tum-evo-ape-table tum-evo-series-error-table">
        <caption className="tum-evo-ape-table-caption">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">指标</th>
            <th scope="col">最大值</th>
            <th scope="col">最小值</th>
            <th scope="col">中位数</th>
            <th scope="col">众数</th>
            <th scope="col">平均数</th>
            <th scope="col">方差</th>
            <th scope="col">标准差</th>
            <th scope="col" title="P(|e − 均值| ≤ 1·σ)，σ 为样本标准差">
              1σ 占比
            </th>
            <th scope="col" title="P(|e − 均值| ≤ 2·σ)">
              2σ 占比
            </th>
            <th scope="col" title="P(|e − 均值| ≤ 3·σ)">
              3σ 占比
            </th>
            <th scope="col" title="在标准正态假设下，均值 ± 1·σ 所覆盖的误差范围">
              1σ 范围
            </th>
            <th scope="col" title="在标准正态假设下，均值 ± 2·σ 所覆盖的误差范围">
              2σ 范围
            </th>
            <th scope="col" title="在标准正态假设下，均值 ± 3·σ 所覆盖的误差范围">
              3σ 范围
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">
              误差（真值 − 测试）
              <span className="tum-evo-ape-table-unit">（{unitLabel}）</span>
            </th>
            <td>{valueFmt(stats.max)}</td>
            <td>{valueFmt(stats.min)}</td>
            <td>{valueFmt(stats.median)}</td>
            <td>{stats.mode !== null ? valueFmt(stats.mode) : "—"}</td>
            <td>{valueFmt(stats.mean)}</td>
            <td>{varianceFmt(stats.variance)}</td>
            <td>{valueFmt(stats.std)}</td>
            <td>{fmtEmpiricalSigmaProb(stats.pWithin1Sigma)}</td>
            <td>{fmtEmpiricalSigmaProb(stats.pWithin2Sigma)}</td>
            <td>{fmtEmpiricalSigmaProb(stats.pWithin3Sigma)}</td>
            <td>
              [{valueFmt(stats.mean - stats.std)}, {valueFmt(stats.mean + stats.std)}]
            </td>
            <td>
              [{valueFmt(stats.mean - 2 * stats.std)}, {valueFmt(stats.mean + 2 * stats.std)}]
            </td>
            <td>
              [{valueFmt(stats.mean - 3 * stats.std)}, {valueFmt(stats.mean + 3 * stats.std)}]
            </td>
          </tr>
        </tbody>
      </table>
      <p className="tum-evo-series-error-hint">
        基于 n={stats.count} 个配对点（真值时间戳就近关联）；众数为按小数舍入后的众数；σ 为样本标准差。
      </p>
    </div>
  );
}

function ApeStatsTableRow({
  label,
  unit,
  s,
  fmt,
}: {
  label: string;
  unit: string;
  s: ApeErrorStats;
  fmt: (n: number) => string;
}) {
  return (
    <tr>
      <th scope="row">
        {label}
        <span className="tum-evo-ape-table-unit">（{unit}）</span>
      </th>
      <td>{fmt(s.max)}</td>
      <td>{fmt(s.mean)}</td>
      <td>{fmt(s.median)}</td>
      <td>{fmt(s.min)}</td>
      <td>{fmt(s.rmse)}</td>
      <td>{fmtApeSse(s.sse)}</td>
      <td>{fmt(s.std)}</td>
    </tr>
  );
}

export function TumEvoTrajectoryPresentation({
  gt,
  est,
}: {
  gt: ParsedTumTrajectory;
  est: ParsedTumTrajectory;
}) {
  const bundle = useMemo(() => computeOriginAlignedBundle(gt, est), [gt, est]);
  const t0 = useMemo(() => {
    if (!bundle) {
      return 0;
    }
    const a = bundle.gt[0]?.timestamp ?? 0;
    const b = bundle.estAligned[0]?.timestamp ?? 0;
    return Math.min(a, b);
  }, [bundle]);

  const gtPts = useMemo(() => (bundle ? trajectoryVehicleToScenePoints(bundle.gt) : []), [bundle]);
  const estPts = useMemo(() => (bundle ? trajectoryVehicleToScenePoints(bundle.estAligned) : []), [bundle]);

  const ape = useMemo(() => (bundle ? computeApeAnalysis(bundle, t0) : null), [bundle, t0]);
  const seriesErrStats = useMemo(() => buildSeriesErrorTableStats(bundle), [bundle]);

  if (!bundle) {
    return null;
  }

  const sGt = { label: "真值 (groundtruth)", color: "#72c2ff" };
  const sEst = { label: "测试 (起点对齐)", color: "#ffb77a" };
  const sApeTrans = { label: "平移误差 ‖Δt‖", color: "#ffb77a" };
  const sApeRot = { label: "旋转误差角", color: "#c99cff" };
  const sApeDx = { label: "Δx", color: "#72c2ff" };
  const sApeDy = { label: "Δy", color: "#51d6a8" };
  const sApeDz = { label: "Δz", color: "#e6b565" };

  return (
    <>
      <h2 id="tum-evo-doc-section-2">二、轨迹信息呈现与解读</h2>
      <p>
        本节从空间轨迹、位置分量、姿态分量与速度分量四个角度展示真值与测试轨迹在同一时间基准下的变化过程，帮助定位“误差出现在哪个维度、从何时开始、如何累积”。
      </p>

      <VizSection id="tum-evo-doc-viz-3d" title="三维轨迹">
        <>
          <p className="tum-evo-viz-desc">
            轨迹文件采用车辆坐标约定：x 为车头前向、y 为车身左向、z 为车顶上向。三维视图与 Json Map View 主视口保持一致，统一映射到 Three.js 的 Y-up 场景。图中同时绘制真值轨迹与起点对齐后的测试轨迹，用于直观观察路径形状、转向一致性与空间偏移趋势。
          </p>
          <TumEvoCanvasWrap>
            <Canvas gl={{ antialias: true }} className="tum-evo-canvas">
              <TumEvoScene3D gtPoints={gtPts} estPoints={estPts} />
            </Canvas>
          </TumEvoCanvasWrap>
          <p className="tum-evo-viz-legend-inline">
            <span><i className="tum-evo-chart-swatch" style={{ background: sGt.color }} />{sGt.label}</span>
            <span><i className="tum-evo-chart-swatch" style={{ background: sEst.color }} />{sEst.label}</span>
          </p>
        </>
      </VizSection>

      <VizSection id="tum-evo-doc-viz-position" title="位置分量随时间">
        <>
          <p className="tum-evo-viz-desc">
            横轴为相对时间（从两条轨迹较早起点开始计时），纵轴为车辆坐标系下的位置分量（米）。该组图用于识别测试轨迹在前向、侧向、垂向上的系统偏差与局部偏移，蓝线代表真值，橙线代表起点对齐后的测试轨迹。
          </p>
          <div className="tum-evo-chart-grid">
            <div className="tum-evo-chart-with-stats">
              <InteractiveTimeSeriesChart
                title="X(t)"
                caption="车辆系 x（车头前）位置随时间变化。"
                unit="m"
                series={[
                  { ...sGt, points: rowsToTimeValue(bundle.gt, (r) => r.x, t0) },
                  { ...sEst, points: rowsToTimeValue(bundle.estAligned, (r) => r.x, t0) },
                ]}
              />
              <TumEvoSeriesErrorTable
                caption="X(t) 分量误差统计"
                unitLabel="m"
                stats={seriesErrStats?.posX ?? null}
                valueFmt={fmtApeM}
              />
            </div>
            <div className="tum-evo-chart-with-stats">
              <InteractiveTimeSeriesChart
                title="Y(t)"
                caption="车辆系 y（车身左）位置随时间变化。"
                unit="m"
                series={[
                  { ...sGt, points: rowsToTimeValue(bundle.gt, (r) => r.y, t0) },
                  { ...sEst, points: rowsToTimeValue(bundle.estAligned, (r) => r.y, t0) },
                ]}
              />
              <TumEvoSeriesErrorTable
                caption="Y(t) 分量误差统计"
                unitLabel="m"
                stats={seriesErrStats?.posY ?? null}
                valueFmt={fmtApeM}
              />
            </div>
            <div className="tum-evo-chart-with-stats">
              <InteractiveTimeSeriesChart
                title="Z(t)"
                caption="车辆系 z（车顶上）位置随时间变化。"
                unit="m"
                series={[
                  { ...sGt, points: rowsToTimeValue(bundle.gt, (r) => r.z, t0) },
                  { ...sEst, points: rowsToTimeValue(bundle.estAligned, (r) => r.z, t0) },
                ]}
              />
              <TumEvoSeriesErrorTable
                caption="Z(t) 分量误差统计"
                unitLabel="m"
                stats={seriesErrStats?.posZ ?? null}
                valueFmt={fmtApeM}
              />
            </div>
          </div>
        </>
      </VizSection>

      <VizSection id="tum-evo-doc-viz-rpy" title="姿态 (RPY) 随时间">
        <>
          <p className="tum-evo-viz-desc">
            四元数 (qx, qy, qz, qw) 统一按 ZYX 内旋顺序转换为 Roll、Pitch、Yaw（度）。由于起点对齐仅影响平移，不改变姿态，故该组图可直接反映测试轨迹在姿态估计上的相位差、幅值偏差与漂移情况。
          </p>
          <div className="tum-evo-chart-grid">
            <div className="tum-evo-chart-with-stats">
              <InteractiveTimeSeriesChart
                title="Roll(t)"
                caption="绕 X 轴转角随时间变化。"
                unit="°"
                series={[
                  {
                    ...sGt,
                    points: rowsToTimeValue(bundle.gt, (r) => radToDeg(quatToRpyRad(r.qx, r.qy, r.qz, r.qw).roll), t0),
                  },
                  {
                    ...sEst,
                    points: rowsToTimeValue(bundle.estAligned, (r) => radToDeg(quatToRpyRad(r.qx, r.qy, r.qz, r.qw).roll), t0),
                  },
                ]}
              />
              <TumEvoSeriesErrorTable
                caption="Roll(t) 误差统计（最短角差）"
                unitLabel="°"
                stats={seriesErrStats?.rollDeg ?? null}
                valueFmt={fmtApeDeg}
              />
            </div>
            <div className="tum-evo-chart-with-stats">
              <InteractiveTimeSeriesChart
                title="Pitch(t)"
                caption="绕 Y 轴转角随时间变化。"
                unit="°"
                series={[
                  {
                    ...sGt,
                    points: rowsToTimeValue(bundle.gt, (r) => radToDeg(quatToRpyRad(r.qx, r.qy, r.qz, r.qw).pitch), t0),
                  },
                  {
                    ...sEst,
                    points: rowsToTimeValue(bundle.estAligned, (r) => radToDeg(quatToRpyRad(r.qx, r.qy, r.qz, r.qw).pitch), t0),
                  },
                ]}
              />
              <TumEvoSeriesErrorTable
                caption="Pitch(t) 误差统计（最短角差）"
                unitLabel="°"
                stats={seriesErrStats?.pitchDeg ?? null}
                valueFmt={fmtApeDeg}
              />
            </div>
            <div className="tum-evo-chart-with-stats">
              <InteractiveTimeSeriesChart
                title="Yaw(t)"
                caption="绕 Z 轴转角随时间变化。"
                unit="°"
                series={[
                  {
                    ...sGt,
                    points: rowsToTimeValue(bundle.gt, (r) => radToDeg(quatToRpyRad(r.qx, r.qy, r.qz, r.qw).yaw), t0),
                  },
                  {
                    ...sEst,
                    points: rowsToTimeValue(bundle.estAligned, (r) => radToDeg(quatToRpyRad(r.qx, r.qy, r.qz, r.qw).yaw), t0),
                  },
                ]}
              />
              <TumEvoSeriesErrorTable
                caption="Yaw(t) 误差统计（最短角差）"
                unitLabel="°"
                stats={seriesErrStats?.yawDeg ?? null}
                valueFmt={fmtApeDeg}
              />
            </div>
          </div>
        </>
      </VizSection>

      <VizSection id="tum-evo-doc-viz-velocity" title="车辆速度随时间">
        <>
          <p className="tum-evo-viz-desc">
            速度由相邻位姿位置差分除以时间间隔得到（首点置 0），并拆分为合速度与三轴分量。该组图用于判断测试轨迹是否在动态节奏上与真值一致，尤其适合定位急加减速段、转弯段或起伏路段中的时序误差。
          </p>
          <div className="tum-evo-chart-grid">
            <div className="tum-evo-chart-with-stats">
              <InteractiveTimeSeriesChart
                title="|v|(t)"
                caption="合速度大小（标量速率）随时间变化。"
                unit="m/s"
                series={[
                  {
                    ...sGt,
                    points: rowsToTimeValue(bundle.gt, (r) => Math.hypot(r.vx, r.vy, r.vz), t0),
                  },
                  {
                    ...sEst,
                    points: rowsToTimeValue(bundle.estAligned, (r) => Math.hypot(r.vx, r.vy, r.vz), t0),
                  },
                ]}
              />
              <TumEvoSeriesErrorTable
                caption="|v|(t) 误差统计（合速度差）"
                unitLabel="m/s"
                stats={seriesErrStats?.speed ?? null}
                valueFmt={fmtApeM}
              />
            </div>
            <div className="tum-evo-chart-with-stats">
              <InteractiveTimeSeriesChart
                title="Vx(t)"
                caption="沿车辆 x（车头前）方向速度随时间变化。"
                unit="m/s"
                series={[
                  { ...sGt, points: rowsToTimeValue(bundle.gt, (r) => r.vx, t0) },
                  { ...sEst, points: rowsToTimeValue(bundle.estAligned, (r) => r.vx, t0) },
                ]}
              />
              <TumEvoSeriesErrorTable
                caption="Vx(t) 分量误差统计"
                unitLabel="m/s"
                stats={seriesErrStats?.vx ?? null}
                valueFmt={fmtApeM}
              />
            </div>
            <div className="tum-evo-chart-with-stats">
              <InteractiveTimeSeriesChart
                title="Vy(t)"
                caption="沿车辆 y（车身左）方向速度随时间变化。"
                unit="m/s"
                series={[
                  { ...sGt, points: rowsToTimeValue(bundle.gt, (r) => r.vy, t0) },
                  { ...sEst, points: rowsToTimeValue(bundle.estAligned, (r) => r.vy, t0) },
                ]}
              />
              <TumEvoSeriesErrorTable
                caption="Vy(t) 分量误差统计"
                unitLabel="m/s"
                stats={seriesErrStats?.vy ?? null}
                valueFmt={fmtApeM}
              />
            </div>
            <div className="tum-evo-chart-with-stats">
              <InteractiveTimeSeriesChart
                title="Vz(t)"
                caption="沿车辆 z（车顶上）方向速度随时间变化。"
                unit="m/s"
                series={[
                  { ...sGt, points: rowsToTimeValue(bundle.gt, (r) => r.vz, t0) },
                  { ...sEst, points: rowsToTimeValue(bundle.estAligned, (r) => r.vz, t0) },
                ]}
              />
              <TumEvoSeriesErrorTable
                caption="Vz(t) 分量误差统计"
                unitLabel="m/s"
                stats={seriesErrStats?.vz ?? null}
                valueFmt={fmtApeM}
              />
            </div>
          </div>
        </>
      </VizSection>

      <h2 id="tum-evo-doc-section-3">三、绝对位姿误差（APE）评估</h2>
      <p>
        APE 用于衡量测试轨迹在全局参考下的偏差水平。本文统一采用“平移误差（m）+ 旋转误差角（°）”的双指标体系，并提供统计量与时序曲线，兼顾整体结论与局部诊断。
      </p>
      {ape ? (
        <>
          <p className="tum-evo-viz-desc">
            误差计算流程为：先在真值时间轴上对测试轨迹进行就近时间关联，再按起点对齐后的结果计算误差。平移误差定义为“真值位置 − 对齐后测试位置”，旋转误差定义为相对姿态
            R<sub>gt</sub>R<sub>est</sub>
            <sup>−1</sup> 的几何转角（取最短路径，范围 0°–180°）。
          </p>
          <div className="tum-evo-ape-table-wrap">
            <table className="tum-evo-ape-table">
              <caption className="tum-evo-ape-table-caption">APE 误差统计（基于全部有效匹配帧）</caption>
              <thead>
                <tr>
                  <th scope="col">指标</th>
                  <th scope="col">max</th>
                  <th scope="col">mean</th>
                  <th scope="col">median</th>
                  <th scope="col">min</th>
                  <th scope="col">rmse</th>
                  <th scope="col">sse</th>
                  <th scope="col">std</th>
                </tr>
              </thead>
              <tbody>
                <ApeStatsTableRow label="平移误差范数" unit="m" s={ape.transStats} fmt={fmtApeM} />
                <ApeStatsTableRow label="旋转误差角" unit="°" s={ape.rotStats} fmt={fmtApeDeg} />
              </tbody>
            </table>
          </div>

          <div id="tum-evo-doc-ape-timeseries" className="tum-evo-doc-scroll-anchor" aria-hidden />
          <VizSection title="APE 误差随时间">
            <>
              <p className="tum-evo-viz-desc">
                时序图用于查看误差在不同时间段的分布特征：若均值较小但局部峰值较高，通常代表特定工况下存在不稳定估计；若三轴分量长期同向偏移，则可能存在坐标系标定或外参误差。
              </p>
              <div className="tum-evo-chart-grid">
                <InteractiveTimeSeriesChart
                  title="‖Δt‖(t)"
                  caption="平移误差范数随时间变化。"
                  unit="m"
                  series={[
                    {
                      ...sApeTrans,
                      points: ape.frames.map((f) => ({ t: f.tRel, v: f.transMag })),
                    },
                  ]}
                />
                <InteractiveTimeSeriesChart
                  title="θ(t)"
                  caption="旋转误差角随时间变化。"
                  unit="°"
                  series={[
                    {
                      ...sApeRot,
                      points: ape.frames.map((f) => ({ t: f.tRel, v: f.rotDeg })),
                    },
                  ]}
                />
                <InteractiveTimeSeriesChart
                  title="Δx, Δy, Δz (t)"
                  caption="平移误差在车辆系各轴上的分量（真值 − 对齐后测试）。"
                  unit="m"
                  series={[
                    { ...sApeDx, points: ape.frames.map((f) => ({ t: f.tRel, v: f.dx })) },
                    { ...sApeDy, points: ape.frames.map((f) => ({ t: f.tRel, v: f.dy })) },
                    { ...sApeDz, points: ape.frames.map((f) => ({ t: f.tRel, v: f.dz })) },
                  ]}
                />
              </div>
            </>
          </VizSection>
        </>
      ) : (
        <>
          <div id="tum-evo-doc-ape-timeseries" className="tum-evo-doc-scroll-anchor" aria-hidden />
          <p className="tum-evo-viz-desc">当前数据未形成足够的真值-测试有效匹配帧，暂不生成 APE 统计表与误差时序图。</p>
        </>
      )}
    </>
  );
}

import { Canvas, useThree } from "@react-three/fiber";
import { Grid, Line, OrbitControls } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { Box3, Sphere, Vector3 } from "three";
import { mapJsonPointToThree } from "@/adapters/mapJsonToScene";
import { InteractiveTimeSeriesChart } from "@/components/InteractiveTimeSeriesChart";
import type { ParsedTumTrajectory } from "@/utils/tumTrajectory";
import { computeApeAnalysis, type ApeErrorStats } from "@/utils/tumEvoApe";
import {
  computeOriginAlignedBundle,
  quatToRpyRad,
  radToDeg,
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
        args={[80, 80]}
        cellSize={1}
        cellThickness={0.6}
        sectionSize={5}
        sectionThickness={1}
        fadeDistance={120}
        infiniteGrid
        position={[0, 0, 0]}
      />
      <Line points={gtPoints} color="#72c2ff" lineWidth={2} />
      <Line points={estPoints} color="#ffb77a" lineWidth={2} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
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
      <h2 id="tum-evo-doc-section-2">二、 轨迹信息呈现</h2>
      <p>轨迹呈现如下：</p>

      <VizSection id="tum-evo-doc-viz-3d" title="三维轨迹">
        <>
          <p className="tum-evo-viz-desc">
            轨迹文件采用车辆坐标约定：x 为车头方向、y 为车身左侧、z 为车顶向上；三维展示与 Json Map View 主视口一致，将上述坐标映射到 Three.js
            Y-up 场景（地面为水平面）。下图绘制真值与「起点对齐」后的测试轨迹，仅对测试施加与真值首帧一致的平移。可拖拽旋转视角；在视口内滚动滚轮仅缩放场景，不会带动页面滚动。
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
            横轴为自两条轨迹较早起点起计的时间（秒），纵轴为轨迹文件中车辆坐标系下的位置分量（米）：x 车头前、y 车身左、z 车顶向上。蓝线为真值，橙线为起点对齐后的测试轨迹。
          </p>
          <div className="tum-evo-chart-grid">
            <InteractiveTimeSeriesChart
              title="X(t)"
              caption="车辆系 x（车头前）位置随时间变化。"
              unit="m"
              series={[
                { ...sGt, points: rowsToTimeValue(bundle.gt, (r) => r.x, t0) },
                { ...sEst, points: rowsToTimeValue(bundle.estAligned, (r) => r.x, t0) },
              ]}
            />
            <InteractiveTimeSeriesChart
              title="Y(t)"
              caption="车辆系 y（车身左）位置随时间变化。"
              unit="m"
              series={[
                { ...sGt, points: rowsToTimeValue(bundle.gt, (r) => r.y, t0) },
                { ...sEst, points: rowsToTimeValue(bundle.estAligned, (r) => r.y, t0) },
              ]}
            />
            <InteractiveTimeSeriesChart
              title="Z(t)"
              caption="车辆系 z（车顶上）位置随时间变化。"
              unit="m"
              series={[
                { ...sGt, points: rowsToTimeValue(bundle.gt, (r) => r.z, t0) },
                { ...sEst, points: rowsToTimeValue(bundle.estAligned, (r) => r.z, t0) },
              ]}
            />
          </div>
        </>
      </VizSection>

      <VizSection id="tum-evo-doc-viz-rpy" title="姿态 (RPY) 随时间">
        <>
          <p className="tum-evo-viz-desc">
            将每条轨迹的四元数 (qx, qy, qz, qw) 按 ZYX 内旋顺序转换为滚转、俯仰、偏航角（度）。平移对齐不改变四元数，故测试轨迹的姿态曲线与对齐前一致，仅与真值在同一时间轴上对比。
          </p>
          <div className="tum-evo-chart-grid">
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
          </div>
        </>
      </VizSection>

      <VizSection id="tum-evo-doc-viz-velocity" title="车辆速度随时间">
        <>
          <p className="tum-evo-viz-desc">
            速度由相邻位姿在车辆坐标系下的位置差分除以时间间隔得到，首点记为 0。起点对齐仅平移位置，故测试轨迹速度与对齐前一致。下图先给出合速度大小 |v| =
            √(vx²+vy²+vz²)，其后为各轴分量，便于先看整体快慢再看车头、侧向、垂向上的节奏差异。
          </p>
          <div className="tum-evo-chart-grid">
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
            <InteractiveTimeSeriesChart
              title="Vx(t)"
              caption="沿车辆 x（车头前）方向速度随时间变化。"
              unit="m/s"
              series={[
                { ...sGt, points: rowsToTimeValue(bundle.gt, (r) => r.vx, t0) },
                { ...sEst, points: rowsToTimeValue(bundle.estAligned, (r) => r.vx, t0) },
              ]}
            />
            <InteractiveTimeSeriesChart
              title="Vy(t)"
              caption="沿车辆 y（车身左）方向速度随时间变化。"
              unit="m/s"
              series={[
                { ...sGt, points: rowsToTimeValue(bundle.gt, (r) => r.vy, t0) },
                { ...sEst, points: rowsToTimeValue(bundle.estAligned, (r) => r.vy, t0) },
              ]}
            />
            <InteractiveTimeSeriesChart
              title="Vz(t)"
              caption="沿车辆 z（车顶上）方向速度随时间变化。"
              unit="m/s"
              series={[
                { ...sGt, points: rowsToTimeValue(bundle.gt, (r) => r.vz, t0) },
                { ...sEst, points: rowsToTimeValue(bundle.estAligned, (r) => r.vz, t0) },
              ]}
            />
          </div>
        </>
      </VizSection>

      <h2 id="tum-evo-doc-section-3">三、 绝对位姿误差(APE)</h2>
      <p>
        核心指标分为绝对位姿误差（APE），反映轨迹全局精度，所有误差单位统一为「平移：米（m），旋转：度（°）」。
      </p>
      {ape ? (
        <>
          <p className="tum-evo-viz-desc">
            在真值时间戳上对测试轨迹做就近时间关联；平移采用与上文一致的「起点对齐」（测试首帧平移到真值首帧）。APE
            平移误差为真值位置减对齐后测试位置，下图给出范数与各分量；旋转误差为相对姿态 R<sub>gt</sub>R<sub>est</sub>
            <sup>−1</sup> 的几何转角（取最短路径，0°–180°）。
          </p>
          <div className="tum-evo-ape-table-wrap">
            <table className="tum-evo-ape-table">
              <caption className="tum-evo-ape-table-caption">APE 误差统计（全匹配帧）</caption>
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
          <p className="tum-evo-viz-desc">当前数据无法形成真值–测试时间匹配帧，未生成 APE 表与曲线。</p>
        </>
      )}
    </>
  );
}

import { Quaternion } from "three";
import {
  quatToRpyRad,
  radToDeg,
  shortestAngleDiffDeg,
  type TumOriginAlignedBundle,
  type TumPoseWithVel,
} from "@/utils/tumEvoViz";

/** Per matched frame: time relative to doc t0, translation residual (m), rotation geodesic (deg). */
export interface ApeFrameError {
  readonly tRel: number;
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
  readonly transMag: number;
  readonly rotDeg: number;
}

export interface ApeErrorStats {
  readonly max: number;
  readonly mean: number;
  readonly median: number;
  readonly min: number;
  readonly rmse: number;
  readonly sse: number;
  readonly std: number;
}

export interface ApeAnalysis {
  readonly frames: readonly ApeFrameError[];
  readonly transStats: ApeErrorStats;
  readonly rotStats: ApeErrorStats;
}

/** Per-sample error sequence stats (真值 − 测试，时间对齐于真值). */
export interface SeriesErrorStats {
  readonly count: number;
  readonly max: number;
  readonly min: number;
  readonly median: number;
  /** Modal value after rounding; null if no repeated rounded value. */
  readonly mode: number | null;
  readonly mean: number;
  /** Sample variance (n−1). */
  readonly variance: number;
  readonly std: number;
  /** Empirical P(|e − mean| ≤ k·std), k=1,2,3; std 为样本标准差。 */
  readonly pWithin1Sigma: number;
  readonly pWithin2Sigma: number;
  readonly pWithin3Sigma: number;
}

function computeRoundedMode(values: readonly number[], decimals: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const p = 10 ** decimals;
  const counts = new Map<number, number>();
  for (const v of values) {
    const k = Math.round(v * p) / p;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [k, c] of counts) {
    if (c > bestCount) {
      bestCount = c;
      best = k;
    }
  }
  if (bestCount <= 1 && values.length > 1) {
    return null;
  }
  return best;
}

export function summarizeSeriesErrorStats(
  values: readonly number[],
  modeDecimals: number,
): SeriesErrorStats | null {
  const n = values.length;
  if (n === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0]!;
  const max = sorted[n - 1]!;
  const sum = values.reduce((acc, x) => acc + x, 0);
  const mean = sum / n;
  const sumSqDev = values.reduce((acc, x) => acc + (x - mean) * (x - mean), 0);
  const variance = n > 1 ? sumSqDev / (n - 1) : 0;
  const std = n > 1 ? Math.sqrt(variance) : 0;
  const median =
    n % 2 === 1 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
  const mode = computeRoundedMode(values, modeDecimals);

  let p1 = 0;
  let p2 = 0;
  let p3 = 0;
  if (!Number.isFinite(std) || std === 0) {
    p1 = p2 = p3 = 1;
  } else {
    for (const x of values) {
      const d = Math.abs(x - mean);
      if (d <= std) {
        p1 += 1;
      }
      if (d <= 2 * std) {
        p2 += 1;
      }
      if (d <= 3 * std) {
        p3 += 1;
      }
    }
    p1 /= n;
    p2 /= n;
    p3 /= n;
  }

  return {
    count: n,
    max,
    min,
    median,
    mode,
    mean,
    variance,
    std,
    pWithin1Sigma: p1,
    pWithin2Sigma: p2,
    pWithin3Sigma: p3,
  };
}

export function matchGtToEst(
  gt: readonly TumPoseWithVel[],
  est: readonly TumPoseWithVel[],
): { g: TumPoseWithVel; e: TumPoseWithVel }[] {
  const out: { g: TumPoseWithVel; e: TumPoseWithVel }[] = [];
  let j = 0;
  for (const g of gt) {
    while (j + 1 < est.length && est[j + 1]!.timestamp <= g.timestamp) {
      j += 1;
    }
    const c0 = est[j];
    const c1 = est[j + 1];
    const pick =
      c0 && c1
        ? Math.abs(c0.timestamp - g.timestamp) <= Math.abs(c1.timestamp - g.timestamp)
          ? c0
          : c1
        : c0 ?? c1;
    if (pick) {
      out.push({ g, e: pick });
    }
  }
  return out;
}

/** 与图表一致：真值时间戳就近配对后的标量误差序列（真值 − 测试）。 */
export interface TrajectoryScalarErrorSets {
  readonly posX: readonly number[];
  readonly posY: readonly number[];
  readonly posZ: readonly number[];
  readonly rollDeg: readonly number[];
  readonly pitchDeg: readonly number[];
  readonly yawDeg: readonly number[];
  readonly speed: readonly number[];
  readonly vx: readonly number[];
  readonly vy: readonly number[];
  readonly vz: readonly number[];
}

export function computeTrajectoryScalarErrors(
  bundle: TumOriginAlignedBundle,
): TrajectoryScalarErrorSets | null {
  const pairs = matchGtToEst(bundle.gt, bundle.estAligned);
  if (pairs.length < 1) {
    return null;
  }
  const posX: number[] = [];
  const posY: number[] = [];
  const posZ: number[] = [];
  const rollDeg: number[] = [];
  const pitchDeg: number[] = [];
  const yawDeg: number[] = [];
  const speed: number[] = [];
  const vx: number[] = [];
  const vy: number[] = [];
  const vz: number[] = [];
  for (const { g, e } of pairs) {
    posX.push(g.x - e.x);
    posY.push(g.y - e.y);
    posZ.push(g.z - e.z);
    const gR = quatToRpyRad(g.qx, g.qy, g.qz, g.qw);
    const eR = quatToRpyRad(e.qx, e.qy, e.qz, e.qw);
    rollDeg.push(shortestAngleDiffDeg(radToDeg(gR.roll), radToDeg(eR.roll)));
    pitchDeg.push(shortestAngleDiffDeg(radToDeg(gR.pitch), radToDeg(eR.pitch)));
    yawDeg.push(shortestAngleDiffDeg(radToDeg(gR.yaw), radToDeg(eR.yaw)));
    speed.push(Math.hypot(g.vx, g.vy, g.vz) - Math.hypot(e.vx, e.vy, e.vz));
    vx.push(g.vx - e.vx);
    vy.push(g.vy - e.vy);
    vz.push(g.vz - e.vz);
  }
  return {
    posX,
    posY,
    posZ,
    rollDeg,
    pitchDeg,
    yawDeg,
    speed,
    vx,
    vy,
    vz,
  };
}

/** Geodesic angle (deg) between orientations: R_rel = R_gt · R_est⁻¹, shortest path. */
function quatGeodesicDeg(
  gqx: number,
  gqy: number,
  gqz: number,
  gqw: number,
  eqx: number,
  eqy: number,
  eqz: number,
  eqw: number,
): number {
  const qG = new Quaternion(gqx, gqy, gqz, gqw).normalize();
  const qE = new Quaternion(eqx, eqy, eqz, eqw).normalize();
  const qRel = qG.clone().multiply(qE.clone().invert());
  if (qRel.w < 0) {
    qRel.set(-qRel.x, -qRel.y, -qRel.z, -qRel.w);
  }
  const w = Math.min(1, Math.max(-1, qRel.w));
  return ((2 * Math.acos(w)) * 180) / Math.PI;
}

export function summarizeApeMetric(values: readonly number[]): ApeErrorStats {
  const n = values.length;
  if (n === 0) {
    return { max: 0, mean: 0, median: 0, min: 0, rmse: 0, sse: 0, std: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0]!;
  const max = sorted[n - 1]!;
  const sum = values.reduce((a, x) => a + x, 0);
  const mean = sum / n;
  const sse = values.reduce((a, x) => a + x * x, 0);
  const rmse = Math.sqrt(sse / n);
  const median =
    n % 2 === 1 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
  const sumSqDev = values.reduce((a, x) => a + (x - mean) * (x - mean), 0);
  const std = n > 1 ? Math.sqrt(sumSqDev / (n - 1)) : 0;
  return { max, mean, median, min, rmse, sse, std };
}

/**
 * APE on GT timestamps: nearest-time est pose after origin translation alignment (same as bundle).
 * Translation error = p_gt − p_est_aligned (m). Rotation error = angle of R_gt R_est⁻¹ (°).
 */
export function computeApeAnalysis(bundle: TumOriginAlignedBundle, t0: number): ApeAnalysis | null {
  const pairs = matchGtToEst(bundle.gt, bundle.estAligned);
  if (pairs.length < 1) {
    return null;
  }
  const frames: ApeFrameError[] = pairs.map(({ g, e }) => {
    const dx = g.x - e.x;
    const dy = g.y - e.y;
    const dz = g.z - e.z;
    return {
      tRel: g.timestamp - t0,
      dx,
      dy,
      dz,
      transMag: Math.hypot(dx, dy, dz),
      rotDeg: quatGeodesicDeg(g.qx, g.qy, g.qz, g.qw, e.qx, e.qy, e.qz, e.qw),
    };
  });
  const transVals = frames.map((f) => f.transMag);
  const rotVals = frames.map((f) => f.rotDeg);
  return {
    frames,
    transStats: summarizeApeMetric(transVals),
    rotStats: summarizeApeMetric(rotVals),
  };
}

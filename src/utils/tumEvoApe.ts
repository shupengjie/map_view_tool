import { Quaternion } from "three";
import type { TumOriginAlignedBundle, TumPoseWithVel } from "@/utils/tumEvoViz";

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

function matchGtToEst(
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

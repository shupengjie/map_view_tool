import type { ParsedTumTrajectory, TumPoseRow } from "@/utils/tumTrajectory";

/** Pose with optional derived velocity (m/s) along world axes. */
export interface TumPoseWithVel extends TumPoseRow {
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
}

export interface TumOriginAlignedBundle {
  /** Ground truth rows (unchanged). */
  readonly gt: readonly TumPoseWithVel[];
  /** Estimated rows after translation-only origin alignment to GT first pose. */
  readonly estAligned: readonly TumPoseWithVel[];
}

function finiteDiffVelocity(rows: readonly TumPoseRow[]): TumPoseWithVel[] {
  const out: TumPoseWithVel[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i]!;
    if (i === 0) {
      out.push({ ...r, vx: 0, vy: 0, vz: 0 });
      continue;
    }
    const p0 = rows[i - 1]!;
    const dt = r.timestamp - p0.timestamp;
    if (dt <= 0 || !Number.isFinite(dt)) {
      out.push({ ...r, vx: 0, vy: 0, vz: 0 });
      continue;
    }
    out.push({
      ...r,
      vx: (r.x - p0.x) / dt,
      vy: (r.y - p0.y) / dt,
      vz: (r.z - p0.z) / dt,
    });
  }
  return out;
}

/**
 * Hamilton quaternion (qx, qy, qz, qw) to intrinsic ZYX Euler: roll–pitch–yaw (rad).
 * Roll about X, pitch about Y, yaw about Z.
 */
export function quatToRpyRad(qx: number, qy: number, qz: number, qw: number): { roll: number; pitch: number; yaw: number } {
  const sinr_cosp = 2 * (qw * qx + qy * qz);
  const cosr_cosp = 1 - 2 * (qx * qx + qy * qy);
  const roll = Math.atan2(sinr_cosp, cosr_cosp);
  const sinp = 2 * (qw * qy - qz * qx);
  const pitch =
    Math.abs(sinp) >= 1 ? (Math.sign(sinp) * Math.PI) / 2 : Math.asin(Math.max(-1, Math.min(1, sinp)));
  const siny_cosp = 2 * (qw * qz + qx * qy);
  const cosy_cosp = 1 - 2 * (qy * qy + qz * qz);
  const yaw = Math.atan2(siny_cosp, cosy_cosp);
  return { roll, pitch, yaw };
}

export function radToDeg(r: number): number {
  return (r * 180) / Math.PI;
}

/**
 * First-pose translation: align estimated origin to ground-truth first position (evo --align_origin style).
 * Quaternions are unchanged (translation-only alignment).
 */
export function computeOriginAlignedBundle(gt: ParsedTumTrajectory, est: ParsedTumTrajectory): TumOriginAlignedBundle | null {
  if (gt.rows.length < 1 || est.rows.length < 1) {
    return null;
  }
  const g0 = gt.rows[0]!;
  const e0 = est.rows[0]!;
  const dx = g0.x - e0.x;
  const dy = g0.y - e0.y;
  const dz = g0.z - e0.z;
  const estShifted: TumPoseRow[] = est.rows.map((r) => ({
    ...r,
    x: r.x + dx,
    y: r.y + dy,
    z: r.z + dz,
  }));
  return {
    gt: finiteDiffVelocity(gt.rows),
    estAligned: finiteDiffVelocity(estShifted),
  };
}

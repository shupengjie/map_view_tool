/**
 * TUM RGB-D / monocular trajectory: each line `timestamp tx ty tz qx qy qz qw`
 * (timestamp, position, quaternion). Whitespace-separated; `#` starts a comment line.
 */

import { mapJsonPointToThree } from "@/adapters/mapJsonToScene";
import type { Vec3 } from "@/scene/types";

export interface TumPoseRow {
  readonly timestamp: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly qx: number;
  readonly qy: number;
  readonly qz: number;
  readonly qw: number;
}

export interface ParsedTumTrajectory {
  readonly rows: readonly TumPoseRow[];
  readonly pointsScene: readonly Vec3[];
}

function isFiniteNum(n: number): boolean {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * Returns null if the file content does not satisfy the TUM line format or has fewer than 2 poses.
 */
export function parseTumTrajectoryFile(text: string): ParsedTumTrajectory | null {
  const rows: TumPoseRow[] = [];
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    const parts = line.split(/\s+/).filter((p) => p.length > 0);
    if (parts.length !== 8) {
      return null;
    }
    const nums = parts.map((p) => Number(p));
    if (nums.some((n) => !isFiniteNum(n))) {
      return null;
    }
    const [ts, x, y, z, qx, qy, qz, qw] = nums;
    rows.push({
      timestamp: ts,
      x,
      y,
      z,
      qx,
      qy,
      qz,
      qw,
    });
  }
  if (rows.length < 2) {
    return null;
  }
  const pointsScene = rows.map((r) => mapJsonPointToThree({ x: r.x, y: r.y, z: r.z })) as Vec3[];
  return { rows, pointsScene };
}

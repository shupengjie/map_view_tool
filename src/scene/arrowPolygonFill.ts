/**
 * Filled arrow mesh: points form a closed polygon in the map plane (projected to XZ, Y = elevation).
 * Uses THREE.ShapeGeometry to triangulate the interior — not a thick line strip.
 */

import type { Vec3 } from "@/scene/types";
import { Matrix4, Shape, ShapeGeometry } from "three";

function distSq(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Builds a flat filled polygon mesh in world space.
 * - 2D outline uses X and Z (world horizontal plane); Y is averaged for the whole face.
 * - If the first and last vertices coincide, the duplicate closing vertex is removed before triangulation.
 */
export function buildArrowPolygonFillGeometry(points: readonly Vec3[]): ShapeGeometry | null {
  if (points.length < 3) {
    return null;
  }

  let ring: Vec3[] = [...points];
  if (distSq(ring[0]!, ring[ring.length - 1]!) < 1e-8) {
    ring = ring.slice(0, -1);
  }
  if (ring.length < 3) {
    return null;
  }

  const shape = new Shape();
  shape.moveTo(ring[0]![0], ring[0]![2]);
  for (let i = 1; i < ring.length; i++) {
    shape.lineTo(ring[i]![0], ring[i]![2]);
  }
  shape.closePath();

  const geom = new ShapeGeometry(shape);
  const rot = new Matrix4().makeRotationX(Math.PI / 2);
  geom.applyMatrix4(rot);
  const avgY = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  geom.applyMatrix4(new Matrix4().makeTranslation(0, avgY, 0));
  geom.computeVertexNormals();
  return geom;
}

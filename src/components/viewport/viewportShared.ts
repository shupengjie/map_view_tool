/**
 * Shared 3D-viewport primitives that multiple node views need.
 * Currently small enough to live in one file; widen as the viewport package grows.
 */

/**
 * Width / height segments for small viewport spheres (vertices, instanced clouds, pick colliders).
 * Keeps triangle count low; raycasting still uses the same mesh bounds.
 */
export const VIEWPORT_SMALL_SPHERE_W_SEGS = 6;
export const VIEWPORT_SMALL_SPHERE_H_SEGS = 6;

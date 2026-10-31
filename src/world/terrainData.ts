import { WORLD_SEED } from '../game/config'
import { generateWorld, SEA_LEVEL, VERTS, WORLD_HALF, type Site } from './hydrology'

export { SEA_LEVEL, VERTS, WORLD_HALF }
export type { Site }

/** The simulated world (terrain, water, falls, sites). Generated once, ~1 s, when this module is first imported. */
export const world = generateWorld(WORLD_SEED)

function bil(arr: Float32Array, x: number, z: number) {
  const fx = Math.min(Math.max(x + WORLD_HALF, 0), VERTS - 1.0001)
  const fz = Math.min(Math.max(z + WORLD_HALF, 0), VERTS - 1.0001)
  const x0 = fx | 0
  const z0 = fz | 0
  const tx = fx - x0
  const tz = fz - z0
  const i = z0 * VERTS + x0
  return (arr[i] * (1 - tx) + arr[i + 1] * tx) * (1 - tz) + (arr[i + VERTS] * (1 - tx) + arr[i + VERTS + 1] * tx) * tz
}

export const heightAt = (x: number, z: number) => bil(world.h, x, z)
/** Water depth above the ground at this point (0 on dry land). */
export const depthAt = (x: number, z: number) => bil(world.depth, x, z)
/** 1 in water fading to 0 about 4.5 units from the shore. */
export const shoreAt = (x: number, z: number) => bil(world.shore, x, z)
export const flowAt = (x: number, z: number) => Math.hypot(bil(world.flowX, x, z), bil(world.flowZ, x, z))

export function slopeAt(x: number, z: number) {
  const dx = (heightAt(x + 1, z) - heightAt(x - 1, z)) / 2
  const dz = (heightAt(x, z + 1) - heightAt(x, z - 1)) / 2
  return Math.hypot(dx, dz)
}

/** Distance from the point to the edge of the nearest structure pad (negative inside). */
export function siteClearance(x: number, z: number) {
  let best = 1e9
  for (const s of world.sites) best = Math.min(best, Math.hypot(x - s.x, z - s.z) - s.radius)
  return best
}

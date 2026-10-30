import { createNoise2D } from 'simplex-noise'
import { CHUNK_SIZE, WORLD_SEED } from '../game/config'
import { hashInts, mulberry32 } from '../utils/random'
import { heightAt } from './heightAt'

export interface Prop {
  x: number
  y: number
  z: number
  /** uniform size multiplier */
  s: number
  /** yaw */
  r: number
  /** variation 0..1 (colour / shape) */
  v: number
  /** collision radius (0 = none) */
  radius: number
}

export interface ChunkData {
  cx: number
  cz: number
  trees: Prop[]
  bushes: Prop[]
  rocks: Prop[]
}

const forestNoise = createNoise2D(mulberry32(WORLD_SEED + 7))
const meadowNoise = createNoise2D(mulberry32(WORLD_SEED + 13))

/** 0..1 : how forested a spot is. */
export function forestMask(x: number, z: number) {
  return forestNoise(x * 0.011, z * 0.011) * 0.5 + 0.5
}

/** 0..1 : tall-grass / flower meadow patches. */
export function meadowMask(x: number, z: number) {
  return meadowNoise(x * 0.06, z * 0.06) * 0.5 + 0.5
}

const SPAWN_CLEARING = 7

/**
 * Jittered-grid scatter on *global* cells, so a prop's position never depends on which chunk
 * asks for it. This keeps chunk borders seamless.
 */
function scatter(
  cx: number,
  cz: number,
  cell: number,
  salt: number,
  chance: (x: number, z: number) => number,
  make: (x: number, z: number, rng: () => number) => Omit<Prop, 'y'>,
) {
  const out: Prop[] = []
  const x0 = cx * CHUNK_SIZE
  const z0 = cz * CHUNK_SIZE
  const i0 = Math.floor(x0 / cell)
  const i1 = Math.ceil((x0 + CHUNK_SIZE) / cell)
  const j0 = Math.floor(z0 / cell)
  const j1 = Math.ceil((z0 + CHUNK_SIZE) / cell)
  for (let i = i0; i < i1; i++) {
    for (let j = j0; j < j1; j++) {
      const rng = mulberry32(hashInts(i, j, WORLD_SEED, salt))
      const x = (i + 0.15 + rng() * 0.7) * cell
      const z = (j + 0.15 + rng() * 0.7) * cell
      if (x < x0 || x >= x0 + CHUNK_SIZE || z < z0 || z >= z0 + CHUNK_SIZE) continue
      if (Math.hypot(x, z) < SPAWN_CLEARING) continue
      if (rng() > chance(x, z)) continue
      const p = make(x, z, rng)
      out.push({ ...p, y: heightAt(p.x, p.z) })
    }
  }
  return out
}

const cache = new Map<string, ChunkData>()

export function getChunkData(cx: number, cz: number): ChunkData {
  const key = `${cx},${cz}`
  let d = cache.get(key)
  if (d) return d

  const trees = scatter(
    cx,
    cz,
    6,
    101,
    (x, z) => 0.05 + Math.max(0, forestMask(x, z) - 0.5) * 2.4,
    (x, z, rng) => ({ x, z, s: 0.85 + rng() * 0.5, r: rng() * Math.PI * 2, v: rng(), radius: 0.35 }),
  )
  const bushes = scatter(
    cx,
    cz,
    5,
    202,
    (x, z) => 0.16 + forestMask(x, z) * 0.18,
    (x, z, rng) => ({ x, z, s: 0.7 + rng() * 0.7, r: rng() * Math.PI * 2, v: rng(), radius: 0.5 }),
  )
  const rocks = scatter(
    cx,
    cz,
    9,
    303,
    () => 0.35,
    (x, z, rng) => ({ x, z, s: 0.6 + rng() * 0.8, r: rng() * Math.PI * 2, v: rng(), radius: 0.55 }),
  )

  d = { cx, cz, trees, bushes, rocks }
  cache.set(key, d)
  return d
}

export function dropChunkData(cx: number, cz: number) {
  cache.delete(`${cx},${cz}`)
}

/** Resolve a moving circle against nearby solid props. Mutates and returns the position. */
export function resolveCollisions(pos: { x: number; z: number }, radius: number) {
  const cx = Math.floor(pos.x / CHUNK_SIZE)
  const cz = Math.floor(pos.z / CHUNK_SIZE)
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const d = getChunkData(cx + dx, cz + dz)
      for (const list of [d.trees, d.bushes, d.rocks]) {
        for (const p of list) {
          const ox = pos.x - p.x
          const oz = pos.z - p.z
          const min = p.radius * p.s + radius
          const d2 = ox * ox + oz * oz
          if (d2 < min * min && d2 > 1e-6) {
            const dist = Math.sqrt(d2)
            const push = (min - dist) / dist
            pos.x += ox * push
            pos.z += oz * push
          }
        }
      }
    }
  }
  return pos
}

import { CHUNK_SIZE, WORLD_SEED } from '../game/config'
import { hashInts, mulberry32 } from '../utils/random'
import { forestMask, meadowMask, patchMask } from './biome'
import { siteGeometry, type Circle, type SPart } from './structures'
import { biomeAt, depthAt, flowAt, heightAt, lavaAt, shoreAt, siteClearance, slopeAt, world } from './terrainData'
import { B } from './biomes'
import type { TreeKind } from './templates'

export interface Prop {
  x: number
  y: number
  z: number
  s: number
  r: number
  v: number
}
export interface TreeProp extends Prop {
  kind: TreeKind
  variant: number
}
export type BushKind = 'round' | 'flowering' | 'fern' | 'berry' | 'dry' | 'frost' | 'glow' | 'tropic' | 'swamp' | 'ash'
export interface BushProp extends Prop {
  kind: BushKind
  palette: number
}
export type RockKind = 'rock' | 'boulder' | 'flat' | 'crystal'
export interface RockProp extends Prop {
  kind: RockKind
  biome: number
}
export type FlowerKind = 'dots' | 'daisy' | 'tulip' | 'poppy' | 'bluebell' | 'lavender' | 'sunflower' | 'clover'
export interface FlowerProp {
  x: number
  y: number
  z: number
  s: number
  r: number
  kind: FlowerKind
  c1: number
  c2: number
  glow?: boolean
}
export interface LilyProp extends Prop {
  lotus: boolean
  palette: number
}

export interface ChunkData {
  cx: number
  cz: number
  trees: TreeProp[]
  bushes: BushProp[]
  rocks: RockProp[]
  flowers: FlowerProp[]
  reeds: Prop[]
  lilies: LilyProp[]
  parts: SPart[]
  colliders: Circle[]
}

/**
 * Jittered-grid scatter on *global* cells, so a prop's position never depends on which chunk asks for it
 * (seamless chunk borders). `make` returns null to reject a candidate after terrain tests.
 */
function scatter<T>(cx: number, cz: number, cell: number, salt: number, chance: number, make: (x: number, z: number, rng: () => number) => T | null) {
  const out: T[] = []
  const x0 = cx * CHUNK_SIZE
  const z0 = cz * CHUNK_SIZE
  const i0 = Math.floor(x0 / cell)
  const i1 = Math.ceil((x0 + CHUNK_SIZE) / cell)
  const j0 = Math.floor(z0 / cell)
  const j1 = Math.ceil((z0 + CHUNK_SIZE) / cell)
  for (let i = i0; i < i1; i++) {
    for (let j = j0; j < j1; j++) {
      const rng = mulberry32(hashInts(i, j, WORLD_SEED, salt))
      const x = (i + 0.12 + rng() * 0.76) * cell
      const z = (j + 0.12 + rng() * 0.76) * cell
      if (x < x0 || x >= x0 + CHUNK_SIZE || z < z0 || z >= z0 + CHUNK_SIZE) continue
      if (rng() > chance) continue
      const p = make(x, z, rng)
      if (p) out.push(p)
    }
  }
  return out
}

const pick = <T,>(rng: () => number, items: readonly T[]) => items[Math.floor(rng() * items.length)]

function pickTree(b: number, x: number, z: number, y: number, shore: number, clear: number, rng: () => number): TreeKind {
  const r = rng()
  switch (b) {
    case B.Desert:
      return r < 0.85 ? 'cactus' : 'dead'
    case B.Snow:
      return r < 0.93 ? 'snowPine' : 'dead'
    case B.Tropical:
      return shore > 0.1 ? (r < 0.5 ? 'mangrove' : 'palm') : r < 0.82 ? 'palm' : 'round'
    case B.Swamp:
      return r < 0.4 ? 'mangrove' : r < 0.72 ? 'willow' : 'dead'
    case B.Volcanic:
      return 'charred'
    case B.Mountain:
      return y > 14 ? (r < 0.8 ? 'snowPine' : 'dead') : r < 0.65 ? 'pine' : r < 0.85 ? 'dead' : 'snowPine'
    case B.Cave:
      return 'giantShroom'
    case B.Magical:
      return r < 0.55 ? 'magic' : r < 0.78 ? 'blossom' : 'giantShroom'
    case B.Forest:
      if (shore > 0.12) return r < 0.4 ? 'willow' : 'birch'
      return r < 0.28 ? 'oval' : r < 0.5 ? 'round' : r < 0.7 ? 'pine' : r < 0.84 ? 'birch' : r < 0.93 ? 'autumn' : 'blossom'
  }
  if (shore > 0.12) return r < 0.42 ? 'willow' : r < 0.68 ? 'birch' : 'round'
  if (y > 9.5) return r < 0.68 ? 'pine' : r < 0.8 ? 'dead' : 'oval'
  const patch = patchMask(x, z)
  if (patch > 0.74 && r < 0.72) return 'blossom'
  if (patch < 0.26 && r < 0.62) return 'autumn'
  if (clear < 16 && r < 0.14) return 'dead'
  if (r < 0.34) return 'oval'
  if (r < 0.62) return 'round'
  if (r < 0.82) return 'birch'
  return y > 4.5 ? 'pine' : 'oval'
}

/** base chance a grid cell holds a tree, per biome */
function treeChance(b: number, forest: number, y: number) {
  switch (b) {
    case B.Forest: return 0.5 + forest * 0.35
    case B.Desert: return 0.045
    case B.Snow: return 0.13
    case B.Tropical: return 0.26
    case B.Swamp: return 0.2
    case B.Volcanic: return 0.05
    case B.Mountain: return y > 20 ? 0.02 : 0.07
    case B.Cave: return 0.1
    case B.Magical: return 0.3
  }
  return 0.04 + Math.max(0, forest - 0.5) * 1.6
}

const nearLava = (x: number, z: number) => lavaAt(x, z) !== null || lavaAt(x + 1.6, z) !== null || lavaAt(x - 1.6, z) !== null || lavaAt(x, z + 1.6) !== null || lavaAt(x, z - 1.6) !== null

const FLOWER_SETS: Record<FlowerKind, { colors: readonly number[]; n: [number, number]; rad: [number, number]; w: number }> = {
  // colour indices refer to PALETTE_KEYS: yellow orange red pink magenta purple violet blue white cream
  dots: { colors: [0, 1, 2, 3, 5, 7, 8], n: [10, 24], rad: [1.2, 2.2], w: 0.24 },
  daisy: { colors: [8, 8, 0, 3, 9], n: [6, 14], rad: [1.0, 1.9], w: 0.17 },
  tulip: { colors: [2, 3, 0, 5, 1, 8], n: [5, 10], rad: [0.9, 1.6], w: 0.13 },
  poppy: { colors: [2, 1, 2], n: [6, 12], rad: [1.0, 1.9], w: 0.1 },
  bluebell: { colors: [7, 6, 5], n: [6, 12], rad: [1.0, 1.8], w: 0.12 },
  lavender: { colors: [5, 6, 5], n: [8, 16], rad: [1.0, 1.9], w: 0.1 },
  sunflower: { colors: [0], n: [2, 4], rad: [0.7, 1.2], w: 0.04 },
  clover: { colors: [8, 3, 8], n: [12, 26], rad: [1.2, 2.2], w: 0.1 },
}
const FLOWER_KINDS = Object.keys(FLOWER_SETS) as FlowerKind[]

const cache = new Map<string, ChunkData>()

export function getChunkData(cx: number, cz: number): ChunkData {
  const key = `${cx},${cz}`
  let d = cache.get(key)
  if (d) return d
  const x0 = cx * CHUNK_SIZE
  const z0 = cz * CHUNK_SIZE
  const inWorld = (x: number, z: number) => Math.abs(x) < 244 && Math.abs(z) < 244

  const trees = scatter<TreeProp>(cx, cz, 5.2, 101, 0.9, (x, z, rng) => {
    if (!inWorld(x, z)) return null
    const y = heightAt(x, z)
    const shore = shoreAt(x, z)
    if (depthAt(x, z) > 0 || shore > 0.8 || slopeAt(x, z) > 0.85) return null
    const clear = siteClearance(x, z)
    if (clear < 2) return null
    const biome = biomeAt(x, z)
    if (nearLava(x, z)) return null
    const forest = forestMask(x, z)
    let p = treeChance(biome, forest, y) + (shore > 0.1 && biome !== B.Desert ? 0.12 : 0)
    if (clear < 16 && biome <= B.Forest) p += 0.04
    if (rng() > p) return null
    const kind = pickTree(biome, x, z, y, shore, clear, rng)
    return { x, y, z, s: (kind === 'giantShroom' || kind === 'palm' ? 1 : 0.85) + rng() * 0.5, r: rng() * Math.PI * 2, v: rng(), kind, variant: rng() < 0.5 ? 0 : 1 }
  })

  const bushes = scatter<BushProp>(cx, cz, 4.4, 202, 0.9, (x, z, rng) => {
    if (!inWorld(x, z)) return null
    const y = heightAt(x, z)
    const shore = shoreAt(x, z)
    if (depthAt(x, z) > 0 || shore > 0.75 || slopeAt(x, z) > 1.0 || siteClearance(x, z) < 1.2) return null
    if (nearLava(x, z)) return null
    const biome = biomeAt(x, z)
    const dens = [0.14 + forestMask(x, z) * 0.26, 0.4, 0.12, 0.1, 0.38, 0.4, 0.06, 0.07, 0.2, 0.34][biome]
    if (rng() > dens) return null
    const r = rng()
    let kind: BushKind
    switch (biome) {
      case B.Desert: kind = 'dry'; break
      case B.Snow: kind = 'frost'; break
      case B.Tropical: kind = r < 0.5 ? 'fern' : r < 0.8 ? 'tropic' : 'flowering'; break
      case B.Swamp: kind = r < 0.5 ? 'swamp' : 'fern'; break
      case B.Volcanic: kind = 'ash'; break
      case B.Mountain: kind = r < 0.5 ? 'round' : 'frost'; break
      case B.Cave: case B.Magical: kind = r < 0.8 ? 'glow' : 'flowering'; break
      default: kind = shore > 0.1 ? (r < 0.55 ? 'fern' : 'round') : r < 0.3 ? 'flowering' : r < 0.45 ? 'fern' : r < 0.58 ? 'berry' : 'round'
    }
    return { x, y, z, s: 0.7 + rng() * 0.7, r: rng() * Math.PI * 2, v: rng(), kind, palette: Math.floor(rng() * 5) }
  })

  const rocks = scatter<RockProp>(cx, cz, 8, 303, 0.5, (x, z, rng) => {
    if (!inWorld(x, z)) return null
    const y = heightAt(x, z)
    const depth = depthAt(x, z)
    const shore = shoreAt(x, z)
    const slope = slopeAt(x, z)
    // flat stepping stones sit in shallow water at the shore
    if (shore > 0.55 && depth < 0.45) {
      if (rng() > 0.55) return null
      return { x, y, z, s: 0.6 + rng() * 0.5, r: rng() * 6, v: rng(), kind: 'flat', biome: biomeAt(x, z) }
    }
    if (depth > 0 || shore > 0.8 || siteClearance(x, z) < 1) return null
    if (nearLava(x, z)) return null
    const biome = biomeAt(x, z)
    const mult = [1, 0.7, 0.9, 0.8, 0.5, 0.5, 1.8, 1.6, 1.8, 1][biome]
    if (rng() > (0.35 + slope * 0.5) * mult) return null
    if ((biome === B.Magical || biome === B.Cave) && rng() < 0.45) return { x, y, z, s: 0.7 + rng() * 0.9, r: rng() * 6, v: rng(), kind: 'crystal', biome }
    const boulder = slope > 0.5 || y > 9 || biome === B.Mountain || biome === B.Volcanic ? rng() < 0.55 : rng() < 0.15
    return { x, y, z, s: (boulder ? 1.3 : 0.6) + rng() * (boulder ? 0.9 : 0.8), r: rng() * 6, v: rng(), kind: boulder ? 'boulder' : 'rock', biome }
  })

  const flowers = scatter<FlowerProp[]>(cx, cz, 5, 404, 1, (x, z, rng) => {
    if (!inWorld(x, z)) return null
    const biome = biomeAt(x, z)
    const fl = [1, 0.7, 0.04, 0, 0.9, 0.35, 0, 0.12, 0.2, 1.3][biome]
    if (fl <= 0 || nearLava(x, z)) return null
    const meadow = meadowMask(x, z)
    if (rng() > (0.22 + meadow * 0.6) * (1 - forestMask(x, z) * 0.55) * fl) return null
    if (depthAt(x, z) > 0 || shoreAt(x, z) > 0.85 || slopeAt(x, z) > 0.7) return null
    // pick the species: weighted
    let t = rng()
    let kind: FlowerKind = 'dots'
    for (const k of FLOWER_KINDS) {
      t -= FLOWER_SETS[k].w
      if (t <= 0) {
        kind = k
        break
      }
    }
    const set = FLOWER_SETS[kind]
    // palette indices: 0 yellow 1 orange 2 red 3 pink 4 magenta 5 purple 6 violet 7 blue 8 white 9 cream
    const cols: readonly number[] = biome === B.Magical ? [5, 6, 7, 3, 8, 4] : biome === B.Tropical ? [2, 3, 1, 4, 0] : biome === B.Swamp ? [8, 5, 0] : set.colors
    const c1 = pick(rng, cols)
    const c2 = rng() < 0.3 ? pick(rng, cols) : c1
    const n = set.n[0] + Math.floor(rng() * (set.n[1] - set.n[0] + 1))
    const rad = set.rad[0] + rng() * (set.rad[1] - set.rad[0])
    const out: FlowerProp[] = []
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2
      const rr = Math.sqrt(rng()) * rad
      const fx = x + Math.cos(a) * rr
      const fz = z + Math.sin(a) * rr * 0.85
      if (depthAt(fx, fz) > 0 || shoreAt(fx, fz) > 0.9) continue
      out.push({ x: fx, y: heightAt(fx, fz), z: fz, s: 0.8 + rng() * 0.5, r: rng() * 6, kind, c1: rng() < 0.75 ? c1 : c2, c2, glow: biome === B.Magical })
    }
    return out
  }).flat()

  const reeds = scatter<Prop>(cx, cz, 2.4, 505, 0.55, (x, z, rng) => {
    const shore = shoreAt(x, z)
    if (shore < 0.35 || shore > 0.97 || depthAt(x, z) > 0.5 || slopeAt(x, z) > 0.6) return null
    return { x, y: heightAt(x, z), z, s: 0.8 + rng() * 0.7, r: rng() * 6, v: rng() }
  })

  const lilies = scatter<LilyProp>(cx, cz, 3, 606, 0.45, (x, z, rng) => {
    const depth = depthAt(x, z)
    if (depth < 0.3 || depth > 1.7 || flowAt(x, z) > 0.05) return null
    return { x, y: heightAt(x, z) + depth, z, s: 0.7 + rng() * 0.6, r: rng() * 6, v: rng(), lotus: rng() < 0.3, palette: rng() < 0.5 ? 3 : 8 }
  })

  // structures overlapping this chunk
  const parts: SPart[] = []
  const structCols: Circle[] = []
  for (const site of world.sites) {
    const reach = site.radius + 8
    if (site.x + reach < x0 || site.x - reach > x0 + CHUNK_SIZE || site.z + reach < z0 || site.z - reach > z0 + CHUNK_SIZE) continue
    const g = siteGeometry(site)
    for (const p of g.parts) if (p.x >= x0 && p.x < x0 + CHUNK_SIZE && p.z >= z0 && p.z < z0 + CHUNK_SIZE) parts.push(p)
    for (const c of g.cols) if (c.x >= x0 && c.x < x0 + CHUNK_SIZE && c.z >= z0 && c.z < z0 + CHUNK_SIZE) structCols.push(c)
  }

  const colliders: Circle[] = [...structCols]
  for (const t of trees) colliders.push({ x: t.x, z: t.z, r: (t.kind === 'pine' || t.kind === 'birch' || t.kind === 'snowPine' || t.kind === 'palm' ? 0.28 : t.kind === 'cactus' ? 0.4 : t.kind === 'giantShroom' ? 0.35 : 0.38) * t.s })
  for (const r of rocks) if (r.kind !== 'flat') colliders.push({ x: r.x, z: r.z, r: (r.kind === 'boulder' ? 0.85 : 0.5) * r.s })

  d = { cx, cz, trees, bushes, rocks, flowers, reeds, lilies, parts, colliders }
  cache.set(key, d)
  return d
}

export function dropChunkData(cx: number, cz: number) {
  cache.delete(`${cx},${cz}`)
}

/** Resolve a moving circle against nearby solid props and structures. Mutates and returns the position. */
export function resolveCollisions(pos: { x: number; z: number }, radius: number) {
  const cx = Math.floor(pos.x / CHUNK_SIZE)
  const cz = Math.floor(pos.z / CHUNK_SIZE)
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (const p of getChunkData(cx + dx, cz + dz).colliders) {
        const ox = pos.x - p.x
        const oz = pos.z - p.z
        const min = p.r + radius
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
  return pos
}

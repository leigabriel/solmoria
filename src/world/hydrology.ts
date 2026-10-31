import { createNoise2D } from 'simplex-noise'
import { hashInts, mulberry32 } from '../utils/random'

/**
 * Finite world with simulated hydrology.
 *
 *  1. Base terrain: highland in the north, lowland in the south, joined by a steep escarpment (the scarp),
 *     mountain rim on the west / east / north, and open sea to the south.
 *  2. Priority-flood fills every depression (these become lakes at their real spill height).
 *  3. D8 flow directions + flow accumulation on the filled surface; cells draining a large enough
 *     catchment become rivers, so rivers always run downhill, merge, pass through lakes and reach the sea.
 *  4. Channels are carved along those paths. Where a river's bed drops steeply (it crosses the scarp)
 *     a waterfall is created.
 *
 * One vertex per world unit: vertex (ix, iz) sits at world (ix - HALF, iz - HALF).
 */
export const WORLD_HALF = 256
export const GRID = 512
export const VERTS = GRID + 1
export const SEA_LEVEL = -0.4
export const NO_WATER = -1e9

export type SiteType = 'ruinCourt' | 'cottage' | 'cottageRuin' | 'stoneCircle' | 'shrine' | 'archway'

export interface Site {
  x: number
  z: number
  y: number
  type: SiteType
  seed: number
  radius: number
}

export interface Fall {
  /** x,y,z triples along the fall, top to bottom (water surface) */
  pts: number[]
  width: number
  drop: number
  baseY: number
}

export interface WorldData {
  h: Float32Array
  /** water surface height, NO_WATER where dry */
  wl: Float32Array
  /** water depth (>= 0) */
  depth: Float32Array
  flowX: Float32Array
  flowZ: Float32Array
  /** 1 in water, fading to 0 about 4.5 units from the shore */
  shore: Float32Array
  falls: Fall[]
  sites: Site[]
  spawn: { x: number; z: number }
  stats: { riverCells: number; lakes: { x: number; z: number; area: number; level: number }[]; falls: number; sites: number }
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax
  const dz = bz - az
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0, 1)
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t))
}

/** Designed drainage lines: broad valleys are cut along them, the simulation decides where water really goes. */
const RIVER_LINES: [number, number][][] = [
  // west river: rim -> scarp fall -> big lake -> sea
  [[-150, -250], [-135, -170], [-118, -95], [-105, -45], [-100, 0], [-104, 50], [-108, 88], [-95, 130], [-80, 175], [-70, 230], [-72, 256]],
  // central river: rim -> highland tarn -> scarp fall -> east lake -> sea
  [[25, -250], [35, -190], [52, -150], [58, -140], [45, -95], [32, -50], [30, -20], [42, 25], [70, 70], [88, 110], [96, 138], [108, 175], [104, 220], [100, 256]],
  // east river: rim -> scarp fall -> joins the east lake
  [[175, -225], [165, -140], [150, -60], [135, -20], [120, 20], [108, 68], [96, 112]],
]

const LAKE_BASINS = [
  { x: -108, z: 88, r: 26, d: 5.5 },
  { x: 96, z: 138, r: 24, d: 5 },
  { x: 58, z: -140, r: 11, d: 2.4 },
]

const SITE_RADIUS: Record<SiteType, number> = {
  ruinCourt: 10,
  cottage: 6,
  cottageRuin: 6,
  stoneCircle: 8,
  shrine: 5,
  archway: 5,
}

export function generateWorld(seed: number): WorldData {
  const nA = createNoise2D(mulberry32(seed + 21))
  const nB = createNoise2D(mulberry32(seed + 22))
  const nC = createNoise2D(mulberry32(seed + 23))
  const total = VERTS * VERTS
  const H = WORLD_HALF
  const h = new Float32Array(total)

  // ---------------------------------------------------------------- 1. base terrain
  const scarpZ = (x: number) => -28 + 16 * Math.sin(x * 0.011 + 0.8) + 9 * nB(x * 0.02, 0.3) + 3 * nC(x * 0.07, 0.5)
  const baseAt = (x: number, z: number) => {
    const zs = scarpZ(x)
    const hills = 1.0 * nA(x * 0.012, z * 0.012) + 0.5 * nA(x * 0.03 + 9, z * 0.03) + 0.22 * nA(x * 0.08, z * 0.08) + 0.06 * nA(x * 0.2, z * 0.2)
    const lowT = clamp((z - (zs + 20)) / (H - (zs + 20)), 0, 1)
    const low = 3.0 - 6.8 * lowT * lowT * lowT + hills * 0.7
    const high = 10 + 4 * clamp((zs - z) / 230, 0, 1) + hills
    const s = smooth(zs + 3.5, zs - 3.5, z)
    let v = low + (high - low) * s
    const de = Math.min(x + H, H - x, z + H)
    v += 12 * smooth(70, 0, de) * (0.75 + 0.5 * nC(x * 0.03 + 3, z * 0.03))
    return v
  }

  // Valley floors: sample each drainage line densely and force the floor to be monotonically downhill
  // (running minimum of the terrain, minus a margin, with a small constant descent). This keeps the valleys
  // free of pits, so the simulation yields flowing rivers; lakes only appear in the designed basins.
  const STEP = 2
  interface Line { segStart: number[]; segLen: number[]; xs: number[]; zs: number[]; floor: number[] }
  const lines: Line[] = RIVER_LINES.map((pl) => {
    const L: Line = { segStart: [], segLen: [], xs: [], zs: [], floor: [] }
    for (let k = 0; k < pl.length - 1; k++) {
      const len = Math.hypot(pl[k + 1][0] - pl[k][0], pl[k + 1][1] - pl[k][1])
      const n = Math.max(1, Math.round(len / STEP))
      L.segStart.push(L.xs.length)
      L.segLen.push(n)
      for (let i = 0; i < n; i++) {
        L.xs.push(pl[k][0] + ((pl[k + 1][0] - pl[k][0]) * i) / n)
        L.zs.push(pl[k][1] + ((pl[k + 1][1] - pl[k][1]) * i) / n)
      }
    }
    L.xs.push(pl[pl.length - 1][0])
    L.zs.push(pl[pl.length - 1][1])
    let f = 1e9
    for (let i = 0; i < L.xs.length; i++) {
      f = Math.min(f - 0.0008 * STEP, baseAt(L.xs[i], L.zs[i]) - 1.3)
      L.floor.push(f)
    }
    return L
  })
  for (let iz = 0; iz < VERTS; iz++) {
    const z = iz - H
    for (let ix = 0; ix < VERTS; ix++) {
      const x = ix - H
      let v = baseAt(x, z)
      for (let li = 0; li < RIVER_LINES.length; li++) {
        const pl = RIVER_LINES[li]
        const L = lines[li]
        let bd = 1e9
        let bf = 0
        for (let k = 0; k < pl.length - 1; k++) {
          const ax = pl[k][0]
          const az = pl[k][1]
          const dx = pl[k + 1][0] - ax
          const dz = pl[k + 1][1] - az
          const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1)
          const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t))
          if (d < bd) {
            bd = d
            const fi = L.segStart[k] + t * L.segLen[k]
            const i0 = Math.min(L.floor.length - 2, Math.floor(fi))
            bf = L.floor[i0] + (L.floor[i0 + 1] - L.floor[i0]) * (fi - i0)
          }
        }
        if (bd < 45) v = Math.min(v, bf + 0.012 * bd * bd)
      }
      for (const l of LAKE_BASINS) {
        // compact bowl (zero beyond 1.15 r) so the lake gets a real rim and spills into the valley, not into a fjord
        const d = Math.hypot(x - l.x, z - l.z)
        if (d < l.r * 1.15) v -= l.d * (1 - smooth(l.r * 0.5, l.r * 1.15, d))
      }
      h[iz * VERTS + ix] = v
    }
  }

  // ---------------------------------------------------------------- 2. priority flood (with epsilon)
  const EPS = 5e-4
  const filled = new Float32Array(h)
  const parent = new Int32Array(total).fill(-1)
  const closed = new Uint8Array(total)
  const order = new Int32Array(total)
  let oc = 0
  const heap = new Int32Array(total)
  let hs = 0
  const push = (i: number) => {
    let k = hs++
    heap[k] = i
    const key = filled[i]
    while (k > 0) {
      const p = (k - 1) >> 1
      if (filled[heap[p]] <= key) break
      heap[k] = heap[p]
      k = p
    }
    heap[k] = i
  }
  const pop = () => {
    const top = heap[0]
    const last = heap[--hs]
    if (hs > 0) {
      const key = filled[last]
      let k = 0
      for (;;) {
        let c = 2 * k + 1
        if (c >= hs) break
        if (c + 1 < hs && filled[heap[c + 1]] < filled[heap[c]]) c++
        if (filled[heap[c]] >= key) break
        heap[k] = heap[c]
        k = c
      }
      heap[k] = last
    }
    return top
  }
  for (let i = 0; i < VERTS; i++) {
    for (const c of [i, (VERTS - 1) * VERTS + i, i * VERTS, i * VERTS + VERTS - 1]) {
      if (!closed[c]) {
        closed[c] = 1
        push(c)
      }
    }
  }
  const DX = [1, -1, 0, 0, 1, 1, -1, -1]
  const DZ = [0, 0, 1, -1, 1, -1, 1, -1]
  while (hs > 0) {
    const c = pop()
    order[oc++] = c
    const cx = c % VERTS
    const cz = (c / VERTS) | 0
    for (let k = 0; k < 8; k++) {
      const nx = cx + DX[k]
      const nz = cz + DZ[k]
      if (nx < 0 || nz < 0 || nx >= VERTS || nz >= VERTS) continue
      const n = nz * VERTS + nx
      if (closed[n]) continue
      closed[n] = 1
      filled[n] = Math.max(h[n], filled[c] + EPS)
      parent[n] = c
      push(n)
    }
  }

  // ---------------------------------------------------------------- 3. flow accumulation
  const acc = new Float32Array(total).fill(1)
  for (let k = oc - 1; k >= 0; k--) {
    const c = order[k]
    const p = parent[c]
    if (p >= 0) acc[p] += acc[c]
  }

  // ---------------------------------------------------------------- 4. lakes = filled depressions
  const wl = new Float32Array(total).fill(NO_WATER)
  const lakeMask = new Uint8Array(total)
  const comp = new Int32Array(total).fill(-1)
  const lakes: WorldData['stats']['lakes'] = []
  const stack: number[] = []
  for (let c = 0; c < total; c++) {
    if (comp[c] !== -1 || filled[c] - h[c] <= 0.5) continue
    const id = lakes.length
    stack.length = 0
    stack.push(c)
    comp[c] = id
    const cells: number[] = []
    while (stack.length) {
      const s = stack.pop()!
      cells.push(s)
      const sx = s % VERTS
      const sz = (s / VERTS) | 0
      for (let k = 0; k < 4; k++) {
        const nx = sx + DX[k]
        const nz = sz + DZ[k]
        if (nx < 0 || nz < 0 || nx >= VERTS || nz >= VERTS) continue
        const n = nz * VERTS + nx
        if (comp[n] === -1 && filled[n] - h[n] > 0.5) {
          comp[n] = id
          stack.push(n)
        }
      }
    }
    if (cells.length < 120) {
      for (const s of cells) comp[s] = -2
      lakes.push({ x: 0, z: 0, area: 0, level: 0 })
      continue
    }
    let lvl = 0
    let mx = 0
    let mz = 0
    for (const s of cells) {
      lvl += filled[s]
      mx += s % VERTS
      mz += (s / VERTS) | 0
    }
    lvl /= cells.length
    lakes.push({ x: mx / cells.length - H, z: mz / cells.length - H, area: cells.length, level: lvl })
    // fill + dilate to the true shoreline (cells whose fill height matches the lake level)
    const q: number[] = []
    for (const s of cells) {
      wl[s] = lvl
      lakeMask[s] = 1
      q.push(s)
    }
    while (q.length) {
      const s = q.pop()!
      const sx = s % VERTS
      const sz = (s / VERTS) | 0
      for (let k = 0; k < 8; k++) {
        const nx = sx + DX[k]
        const nz = sz + DZ[k]
        if (nx < 0 || nz < 0 || nx >= VERTS || nz >= VERTS) continue
        const n = nz * VERTS + nx
        if (lakeMask[n] || comp[n] === -2) continue
        if (filled[n] - h[n] > 0.005 && Math.abs(filled[n] - lvl) < 0.08) {
          lakeMask[n] = 1
          wl[n] = lvl
          q.push(n)
        }
      }
    }
  }
  const realLakes = lakes.filter((l) => l.area > 0)

  // ---------------------------------------------------------------- 5. rivers
  const T = 800
  const isRiver = new Uint8Array(total)
  const riverCells: number[] = []
  for (let c = 0; c < total; c++) {
    if (acc[c] >= T && !lakeMask[c] && h[c] > SEA_LEVEL + 0.15 && parent[c] >= 0) {
      isRiver[c] = 1
      riverCells.push(c)
    }
  }
  const widthOf = (c: number) => Math.min(9, 2.4 + 1.2 * Math.log2(acc[c] / T + 1))
  const depthOf = (c: number) => 0.5 + 0.16 * Math.log2(acc[c] / T + 1)
  const bedOf = (c: number) => filled[c] - depthOf(c)

  const bestD = new Float32Array(total).fill(1e9)
  const flowX = new Float32Array(total)
  const flowZ = new Float32Array(total)
  const riverWl = new Float32Array(total).fill(NO_WATER)
  for (const c of riverCells) {
    const cx = c % VERTS
    const cz = (c / VERTS) | 0
    const hw = widthOf(c) / 2
    const dep = depthOf(c)
    const B = filled[c] - dep
    const W = B + dep * 0.88
    const R = Math.ceil(hw + 6)
    const p = parent[c]
    let fx = (p % VERTS) - cx
    let fz = ((p / VERTS) | 0) - cz
    const fl = Math.hypot(fx, fz) || 1
    const speed = clamp(0.5 + (filled[c] - filled[p]) * 1.2, 0.5, 2.4)
    fx = (fx / fl) * speed
    fz = (fz / fl) * speed
    for (let dz = -R; dz <= R; dz++) {
      const nz = cz + dz
      if (nz < 0 || nz >= VERTS) continue
      for (let dx = -R; dx <= R; dx++) {
        const nx = cx + dx
        if (nx < 0 || nx >= VERTS) continue
        const d = Math.hypot(dx, dz)
        if (d > R) continue
        const n = nz * VERTS + nx
        const target = B + Math.max(0, d - hw) * 0.55
        if (target < h[n]) h[n] = target
        if (d <= hw + 2 && d < bestD[n]) {
          bestD[n] = d
          riverWl[n] = W
          flowX[n] = fx
          flowZ[n] = fz
        }
      }
    }
  }

  // ---------------------------------------------------------------- 6. waterfalls (steep stretches of river bed)
  const STEEP = 0.55
  const stepSlope = (c: number, p: number) => {
    const dx = (c % VERTS) - (p % VERTS)
    const dz = ((c / VERTS) | 0) - ((p / VERTS) | 0)
    return (filled[c] - filled[p]) / Math.hypot(dx, dz)
  }
  const falls: Fall[] = []
  const used = new Uint8Array(total)
  for (const c of riverCells) {
    if (used[c]) continue
    const p0 = parent[c]
    if (p0 < 0 || !isRiver[p0] || stepSlope(c, p0) <= STEEP) continue
    // only start at the top of a steep run
    let upSteep = false
    let up = -1
    let upAcc = 0
    const cx = c % VERTS
    const cz = (c / VERTS) | 0
    for (let k = 0; k < 8; k++) {
      const nx = cx + DX[k]
      const nz = cz + DZ[k]
      if (nx < 0 || nz < 0 || nx >= VERTS || nz >= VERTS) continue
      const n = nz * VERTS + nx
      if (parent[n] === c && isRiver[n]) {
        if (stepSlope(n, c) > STEEP) upSteep = true
        if (acc[n] > upAcc) {
          upAcc = acc[n]
          up = n
        }
      }
    }
    if (upSteep) continue
    const chain = [c]
    let cur = c
    let gap = 0
    for (;;) {
      const p = parent[cur]
      if (p < 0 || !isRiver[p]) break
      chain.push(p)
      if (stepSlope(cur, p) > STEEP) gap = 0
      else if (++gap > 2) break
      cur = p
    }
    chain.length -= gap
    for (const s of chain) used[s] = 1
    const drop = bedOf(chain[0]) - bedOf(chain[chain.length - 1])
    if (drop < 1.8 || chain.length < 2) continue
    const cells = up >= 0 ? [up, ...chain] : chain
    const last = parent[cells[cells.length - 1]]
    if (last >= 0 && isRiver[last]) cells.push(last)
    // lip = biggest single drop along the run; sculpt a real cliff there
    let m = 0
    let best = -1
    for (let i = 0; i < cells.length - 1; i++) {
      const dd = bedOf(cells[i]) - bedOf(cells[i + 1])
      if (dd > best) {
        best = dd
        m = i
      }
    }
    const lipC = cells[m]
    const lastC = cells[cells.length - 1]
    const lx = lipC % VERTS
    const lz = (lipC / VERTS) | 0
    let dxl = (lastC % VERTS) - lx
    let dzl = ((lastC / VERTS) | 0) - lz
    const dl = Math.hypot(dxl, dzl) || 1
    dxl /= dl
    dzl /= dl
    const lipBed = bedOf(lipC)
    const baseBed = bedOf(lastC)
    const hw = widthOf(c) / 2
    const dep = depthOf(lastC)
    const lipW = lipBed + depthOf(lipC) * 0.88
    const baseW = baseBed + dep * 0.88
    const FACE = 1.6
    const poolEnd = FACE + hw * 1.6
    const R = Math.ceil(hw + 7 + poolEnd)
    for (let dz = -R; dz <= R; dz++) {
      const nz = lz + dz
      if (nz < 0 || nz >= VERTS) continue
      for (let dx = -R; dx <= R; dx++) {
        const nx = lx + dx
        if (nx < 0 || nx >= VERTS) continue
        const u = dx * dxl + dz * dzl
        const sd = Math.abs(dx * dzl - dz * dxl)
        if (u < 0 || u > poolEnd + 2 || sd > hw + 6) continue
        const n = nz * VERTS + nx
        const k = Math.min(1, u / FACE)
        const sm = k * k * (3 - 2 * k)
        let prof = lipBed + (baseBed - lipBed) * sm
        const inPool = u > FACE - 0.4 && u < poolEnd
        if (inPool && sd <= hw) prof = baseBed - 0.55 * Math.sin(Math.PI * Math.min(1, (u - FACE + 0.4) / (poolEnd - FACE + 0.4)))
        const target = prof + Math.max(0, sd - hw) * 0.55
        if (target < h[n]) h[n] = target
        if (sd <= hw + 1.5 && u > 0.05) {
          if (u < FACE - 0.4) riverWl[n] = NO_WATER
          else if (u < poolEnd + 1) {
            riverWl[n] = baseW
            flowX[n] = dxl * 0.4
            flowZ[n] = dzl * 0.4
          }
        }
      }
    }
    // curtain follows the cliff face, slightly proud of it, leaving the lip in a small arc
    const pts: number[] = []
    const STEPS = 12
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS
      let k = 0.5
      for (let it = 0; it < 12; it++) k -= (k * k * (3 - 2 * k) - t) / Math.max(0.2, 6 * k * (1 - k))
      k = Math.min(1, Math.max(0, k))
      const uu = k * FACE + 0.22 + 0.25 * Math.sin(Math.PI * t) * (1 - t)
      const y = lipW + (baseW - lipW) * t
      pts.push(lx - H + dxl * uu, y, lz - H + dzl * uu)
    }
    falls.push({ pts, width: widthOf(c) * 0.9, drop: lipBed - baseBed, baseY: baseW })
  }

  // ---------------------------------------------------------------- 7. combine water (lakes > rivers > sea)
  for (let c = 0; c < total; c++) {
    if (lakeMask[c]) continue
    let w = riverWl[c]
    if (h[c] < SEA_LEVEL) w = Math.max(w, SEA_LEVEL)
    wl[c] = w
  }
  const depth = new Float32Array(total)
  for (let c = 0; c < total; c++) depth[c] = wl[c] > NO_WATER / 2 ? Math.max(0, wl[c] - h[c]) : 0

  // shoreline proximity via two-pass chamfer distance
  const dist = new Float32Array(total)
  for (let c = 0; c < total; c++) dist[c] = depth[c] > 0.03 ? 0 : 99
  const D1 = 1
  const D2 = 1.414
  for (let iz = 0; iz < VERTS; iz++) {
    for (let ix = 0; ix < VERTS; ix++) {
      const c = iz * VERTS + ix
      let d = dist[c]
      if (ix > 0) d = Math.min(d, dist[c - 1] + D1)
      if (iz > 0) {
        d = Math.min(d, dist[c - VERTS] + D1)
        if (ix > 0) d = Math.min(d, dist[c - VERTS - 1] + D2)
        if (ix < VERTS - 1) d = Math.min(d, dist[c - VERTS + 1] + D2)
      }
      dist[c] = d
    }
  }
  for (let iz = VERTS - 1; iz >= 0; iz--) {
    for (let ix = VERTS - 1; ix >= 0; ix--) {
      const c = iz * VERTS + ix
      let d = dist[c]
      if (ix < VERTS - 1) d = Math.min(d, dist[c + 1] + D1)
      if (iz < VERTS - 1) {
        d = Math.min(d, dist[c + VERTS] + D1)
        if (ix < VERTS - 1) d = Math.min(d, dist[c + VERTS + 1] + D2)
        if (ix > 0) d = Math.min(d, dist[c + VERTS - 1] + D2)
      }
      dist[c] = d
    }
  }
  const shore = new Float32Array(total)
  for (let c = 0; c < total; c++) shore[c] = clamp(1 - dist[c] / 4.5, 0, 1)
  // soften the chamfer-distance staircase
  for (let pass = 0; pass < 2; pass++) {
    const src = shore.slice()
    for (let z = 1; z < VERTS - 1; z++) {
      for (let x = 1; x < VERTS - 1; x++) {
        const c = z * VERTS + x
        if (depth[c] > 0.03) continue
        let sum = 0
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) sum += src[c + dz * VERTS + dx]
        shore[c] = sum / 9
      }
    }
  }

  // ---------------------------------------------------------------- 8. structure sites (dry, gentle ground) + spawn
  const bil = (arr: Float32Array, x: number, z: number) => {
    const fx = clamp(x + H, 0, GRID - 1e-4)
    const fz = clamp(z + H, 0, GRID - 1e-4)
    const x0 = fx | 0
    const z0 = fz | 0
    const tx = fx - x0
    const tz = fz - z0
    const i = z0 * VERTS + x0
    return (arr[i] * (1 - tx) + arr[i + 1] * tx) * (1 - tz) + (arr[i + VERTS] * (1 - tx) + arr[i + VERTS + 1] * tx) * tz
  }
  const sites: Site[] = []
  const suitable = (x: number, z: number, r: number) => {
    if (Math.abs(x) > H - 40 || Math.abs(z) > H - 40) return false
    const h0 = bil(h, x, z)
    if (h0 < SEA_LEVEL + 1.5) return false
    for (const rr of [0, r * 0.5, r, r + 7]) {
      for (let k = 0; k < (rr === 0 ? 1 : 8); k++) {
        const a = (k / 8) * Math.PI * 2
        const px = x + Math.cos(a) * rr
        const pz = z + Math.sin(a) * rr
        if (bil(shore, px, pz) > 0.001 || bil(depth, px, pz) > 0) return false
        if (Math.abs(bil(h, px, pz) - h0) > (rr <= r ? 1.6 : 3)) return false
      }
    }
    return sites.every((s) => Math.hypot(s.x - x, s.z - z) > s.radius + r + 14)
  }
  const TYPES: SiteType[] = ['ruinCourt', 'cottage', 'cottageRuin', 'stoneCircle', 'shrine', 'archway', 'ruinCourt', 'cottageRuin', 'stoneCircle']
  const addSite = (x: number, z: number, type: SiteType, sd: number) => {
    const r = SITE_RADIUS[type]
    const y = bil(h, x, z)
    // flatten a pad so walls and floors sit on level ground
    const R = r + 5
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const ix = Math.round(x + dx) + H
        const iz = Math.round(z + dz) + H
        if (ix < 0 || iz < 0 || ix >= VERTS || iz >= VERTS) continue
        const d = Math.hypot(ix - H - x, iz - H - z)
        if (d > R) continue
        const t = smooth(R, r, d)
        const c = iz * VERTS + ix
        h[c] = h[c] * (1 - t) + y * t
      }
    }
    sites.push({ x, z, y, type, seed: sd, radius: r })
  }
  // a couple of guaranteed landmarks near the spawn point so there is something to find straight away
  const forced: [SiteType, number, number][] = [['ruinCourt', -26, 16], ['archway', 16, -10], ['stoneCircle', 30, 42]]
  for (const [type, fx, fz] of forced) {
    const r = SITE_RADIUS[type]
    let done = false
    for (let rad = 0; rad <= 40 && !done; rad += 4) {
      for (let k = 0; k < (rad === 0 ? 1 : 12) && !done; k++) {
        const a = (k / 12) * Math.PI * 2
        const x = Math.round(fx + Math.cos(a) * rad)
        const z = Math.round(fz + Math.sin(a) * rad)
        if (suitable(x, z, r)) {
          addSite(x, z, type, hashInts(x, z, seed))
          done = true
        }
      }
    }
  }
  const CELL = 52
  for (let i = -5; i <= 4; i++) {
    for (let j = -5; j <= 4; j++) {
      const rng = mulberry32(hashInts(i, j, seed, 909))
      const x = Math.round((i + 0.15 + rng() * 0.7) * CELL)
      const z = Math.round((j + 0.15 + rng() * 0.7) * CELL)
      const type = TYPES[Math.floor(rng() * TYPES.length)]
      if (rng() > 0.7) continue
      if (suitable(x, z, SITE_RADIUS[type])) addSite(x, z, type, hashInts(x, z, seed, 5))
    }
  }

  // spawn: nearest dry, level ground to the origin that isn't inside a site
  let spawn = { x: 0, z: 0 }
  search: for (let rad = 0; rad <= 90; rad += 3) {
    for (let k = 0; k < (rad === 0 ? 1 : 16); k++) {
      const a = (k / 16) * Math.PI * 2
      const x = Math.round(Math.cos(a) * rad)
      const z = Math.round(Math.sin(a) * rad)
      if (bil(shore, x, z) > 0.001 || bil(depth, x, z) > 0) continue
      const h0 = bil(h, x, z)
      if (Math.abs(bil(h, x + 3, z) - h0) > 0.5 || Math.abs(bil(h, x, z + 3) - h0) > 0.5) continue
      if (sites.some((s) => Math.hypot(s.x - x, s.z - z) < s.radius + 6)) continue
      spawn = { x, z }
      break search
    }
  }

  return {
    h,
    wl,
    depth,
    flowX,
    flowZ,
    shore,
    falls,
    sites,
    spawn,
    stats: { riverCells: riverCells.length, lakes: realLakes, falls: falls.length, sites: sites.length },
  }
}

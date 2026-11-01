import { createNoise2D } from 'simplex-noise'
import { mulberry32 } from '../utils/random'
import { B, BIOME_COUNT } from './biomes'

export interface BiomeFeatures {
  volcano: { x: number; z: number; R: number; lavaLevel: number } | null
  caves: { x: number; z: number; r: number; floor: number; entrance: number }[]
  magic: { x: number; z: number } | null
}

export interface BiomeInput {
  seed: number
  h: Float32Array
  /** extra (swamp) water levels are written here */
  riverWl: Float32Array
  /** 1 where there is water already (lake / river / sea) */
  water: Uint8Array
  /** 1 on lake cells (never built over) */
  lake: Uint8Array
  VERTS: number
  H: number
  seaLevel: number
  noWater: number
}

export interface BiomeOutput {
  biome: Uint8Array
  /** lava surface level per cell (noWater when none) */
  lava: Float32Array
  features: BiomeFeatures
}

// (x, z, biome, weight): placed by climate logic. North is cold highland, south is warm lowland / sea,
// east is dry, the west holds the enchanted grove, and the centre stays friendly around the spawn.
const ANCHORS: [number, number, number, number][] = [
  [0, 10, B.Grass, 1.5], [-70, 60, B.Grass, 1], [85, 95, B.Grass, 0.9], [-25, -75, B.Grass, 0.9], [40, 40, B.Grass, 0.8],
  [-100, -30, B.Forest, 1.2], [55, -60, B.Forest, 1], [-35, 125, B.Forest, 1], [120, -10, B.Forest, 0.8],
  [175, 75, B.Desert, 1.3], [145, 135, B.Desert, 1], [215, 20, B.Desert, 0.9],
  [-60, -215, B.Snow, 0.95], [60, -225, B.Snow, 0.85], [-195, -150, B.Snow, 0.8], [0, -170, B.Snow, 0.7],
  [-175, 150, B.Tropical, 1.2], [-95, 205, B.Tropical, 1], [20, 205, B.Tropical, 0.9],
  [100, 160, B.Swamp, 0.7], [-120, 105, B.Swamp, 0.55],
  [130, -150, B.Volcanic, 1],
  [-220, 10, B.Mountain, 1], [225, -70, B.Mountain, 0.9], [-130, -190, B.Mountain, 0.8],
  [-125, 5, B.Magical, 0.85],
]

const CAVE_ANCHORS: [number, number][] = [[-205, -45], [35, -150]]
const VOLCANO_ANCHOR: [number, number] = [130, -150]

function blur(src: Float32Array, V: number, r: number) {
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  const n = r * 2 + 1
  for (let z = 0; z < V; z++) {
    let sum = 0
    for (let x = -r; x <= r; x++) sum += src[z * V + Math.min(V - 1, Math.max(0, x))]
    for (let x = 0; x < V; x++) {
      tmp[z * V + x] = sum / n
      sum += src[z * V + Math.min(V - 1, x + r + 1)] - src[z * V + Math.max(0, x - r)]
    }
  }
  for (let x = 0; x < V; x++) {
    let sum = 0
    for (let z = -r; z <= r; z++) sum += tmp[Math.min(V - 1, Math.max(0, z)) * V + x]
    for (let z = 0; z < V; z++) {
      out[z * V + x] = sum / n
      sum += tmp[Math.min(V - 1, z + r + 1) * V + x] - tmp[Math.max(0, z - r) * V + x]
    }
  }
  return out
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export function applyBiomes(inp: BiomeInput): BiomeOutput {
  const { h, riverWl, water, VERTS: V, H, seaLevel, noWater } = inp
  const total = V * V
  const nWarpX = createNoise2D(mulberry32(inp.seed + 501))
  const nWarpZ = createNoise2D(mulberry32(inp.seed + 502))
  const nDune = createNoise2D(mulberry32(inp.seed + 503))
  const nRidge = createNoise2D(mulberry32(inp.seed + 504))
  const nPond = createNoise2D(mulberry32(inp.seed + 505))
  const nMisc = createNoise2D(mulberry32(inp.seed + 506))
  const rng = mulberry32(inp.seed + 507)

  // sample a disc: reject lakes outright, tolerate a little river / sea
  const waterNear = (x: number, z: number, r: number) => {
    let wet = 0
    let n = 0
    for (const rr of [0, r * 0.35, r * 0.7, r]) {
      for (let k = 0; k < (rr === 0 ? 1 : 16); k++) {
        const a = (k / 16) * Math.PI * 2
        const ix = Math.round(x + Math.cos(a) * rr) + H
        const iz = Math.round(z + Math.sin(a) * rr) + H
        if (ix < 0 || iz < 0 || ix >= V || iz >= V) return true
        n++
        if (inp.lake[iz * V + ix]) return true
        if (h[iz * V + ix] < seaLevel + 0.5) return true
        if (water[iz * V + ix]) wet++
      }
    }
    return wet / n > 0.14
  }
  const find = (ax: number, az: number, r: number, maxRad = 110) => {
    for (let rad = 0; rad <= maxRad; rad += 5) {
      for (let k = 0; k < (rad === 0 ? 1 : 18); k++) {
        const a = (k / 18) * Math.PI * 2
        const x = Math.round(ax + Math.cos(a) * rad)
        const z = Math.round(az + Math.sin(a) * rad)
        if (Math.abs(x) > H - r - 12 || Math.abs(z) > H - r - 12) continue
        if (!waterNear(x, z, r)) return { x, z }
      }
    }
    return null
  }

  // ---- 1. biome map: nearest weighted anchor in a domain-warped space ---------------------------
  const biome = new Uint8Array(total)
  for (let iz = 0; iz < V; iz++) {
    for (let ix = 0; ix < V; ix++) {
      const x = ix - H
      const z = iz - H
      const wx = x + 42 * nWarpX(x * 0.008, z * 0.008) + 14 * nWarpX(x * 0.03 + 9, z * 0.03)
      const wz = z + 42 * nWarpZ(x * 0.008 + 5, z * 0.008) + 14 * nWarpZ(x * 0.03, z * 0.03 + 3)
      let best = 1e12
      let id = 0
      for (const [ax, az, b, w] of ANCHORS) {
        const d = Math.hypot(wx - ax, wz - az) / w
        if (d < best) {
          best = d
          id = b
        }
      }
      biome[iz * V + ix] = id
    }
  }

  // ---- 2. designed features ------------------------------------------------------------------
  const features: BiomeFeatures = { volcano: null, caves: [], magic: null }
  const volc = find(VOLCANO_ANCHOR[0], VOLCANO_ANCHOR[1], 40, 130)
  const caveSpots: { x: number; z: number }[] = []
  for (const [ax, az] of CAVE_ANCHORS) {
    const p = find(ax, az, 40, 100)
    if (p && (!volc || Math.hypot(p.x - volc.x, p.z - volc.z) > 90)) caveSpots.push(p)
  }
  const ringMean = (cx: number, cz: number, r: number) => {
    let s = 0
    let n = 0
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2
      const ix = Math.round(cx + Math.cos(a) * r) + H
      const iz = Math.round(cz + Math.sin(a) * r) + H
      if (ix < 0 || iz < 0 || ix >= V || iz >= V) continue
      s += h[iz * V + ix]
      n++
    }
    return n ? s / n : 0
  }
  const origH = h.slice()

  // biome overrides from elevation / coast / spawn protection / feature discs
  for (let iz = 0; iz < V; iz++) {
    for (let ix = 0; ix < V; ix++) {
      const c = iz * V + ix
      const x = ix - H
      const z = iz - H
      let id = biome[c]
      const h0 = origH[c]
      if (h0 > 17 && id !== B.Magical) id = id === B.Snow ? B.Snow : B.Mountain
      else if (h0 > 12.5 && (id === B.Grass || id === B.Forest)) id = B.Mountain
      if (h0 < 2.2 && z > 130 && (id === B.Grass || id === B.Forest)) id = B.Tropical
      if (Math.hypot(x, z) < 38) id = B.Grass
      biome[c] = id
    }
  }
  const paintDisc = (cx: number, cz: number, r: number, id: number) => {
    for (let iz = Math.max(0, cz + H - r); iz <= Math.min(V - 1, cz + H + r); iz++) {
      for (let ix = Math.max(0, cx + H - r); ix <= Math.min(V - 1, cx + H + r); ix++) {
        if (Math.hypot(ix - H - cx, iz - H - cz) <= r + 3 * nMisc(ix * 0.1, iz * 0.1)) biome[iz * V + ix] = id
      }
    }
  }
  if (volc) paintDisc(volc.x, volc.z, 50, B.Volcanic)
  for (const c of caveSpots) paintDisc(c.x, c.z, 30, B.Cave)

  // ---- 3. smooth weights for terrain shaping -----------------------------------------------------
  const ind = (b: number) => {
    const a = new Float32Array(total)
    for (let c = 0; c < total; c++) a[c] = biome[c] === b ? 1 : 0
    return blur(blur(a, V, 7), V, 5)
  }
  const wMount = ind(B.Mountain)
  const wDesert = ind(B.Desert)
  const wSnow = ind(B.Snow)
  const wSwamp = ind(B.Swamp)
  const wmask = new Float32Array(total)
  for (let c = 0; c < total; c++) wmask[c] = water[c] ? 1 : 0
  const nearW = blur(wmask, V, 6)
  const dry = (c: number) => 1 - Math.min(1, nearW[c] * 4)

  const lava = new Float32Array(total).fill(noWater)

  for (let iz = 1; iz < V - 1; iz++) {
    for (let ix = 1; ix < V - 1; ix++) {
      const c = iz * V + ix
      const x = ix - H
      const z = iz - H
      const spawnSafe = smooth(30, 60, Math.hypot(x, z))
      const d = dry(c) * spawnSafe
      if (d <= 0) continue
      let add = 0
      if (wMount[c] > 0.02) add += wMount[c] * 6.5 * Math.pow(1 - Math.abs(nRidge(x * 0.018, z * 0.018)), 2.2) * smooth(2, 7, origH[c])
      if (wDesert[c] > 0.02) add += wDesert[c] * (1.7 * Math.pow(1 - Math.abs(nDune(x * 0.022 + 3, z * 0.04)), 2) + 0.35 * nDune(x * 0.09, z * 0.09))
      if (wSnow[c] > 0.02) add += wSnow[c] * 1.1 * nMisc(x * 0.03, z * 0.03)
      h[c] += add * d
    }
  }

  // swamp: flatten towards the water table and dig little ponds
  for (let iz = 0; iz < V; iz++) {
    for (let ix = 0; ix < V; ix++) {
      const c = iz * V + ix
      const w = wSwamp[c]
      if (w < 0.15 || water[c] || h[c] < seaLevel + 0.2) continue
      const x = ix - H
      const z = iz - H
      const target = Math.min(h[c], 1.4 + 0.25 * nPond(x * 0.1, z * 0.1))
      h[c] = h[c] + (target - h[c]) * Math.min(1, w * 1.4)
      if (biome[c] === B.Swamp && w > 0.5) {
        const pn = nPond(x * 0.045 + 20, z * 0.045)
        if (pn > 0.28) {
          const dig = Math.min(0.9, (pn - 0.28) * 2.2)
          const surf = h[c]
          h[c] = surf - dig
          riverWl[c] = surf - 0.12
        }
      }
    }
  }

  // ---- 4. volcano + lava -----------------------------------------------------------------------------
  if (volc) {
    const R = 40
    const base = ringMean(volc.x, volc.z, R)
    const peakAdd = 17
    const lavaAdd = 11.8
    features.volcano = { x: volc.x, z: volc.z, R, lavaLevel: base + lavaAdd }
    for (let iz = Math.max(1, volc.z + H - R - 2); iz <= Math.min(V - 2, volc.z + H + R + 2); iz++) {
      for (let ix = Math.max(1, volc.x + H - R - 2); ix <= Math.min(V - 2, volc.x + H + R + 2); ix++) {
        const r = Math.hypot(ix - H - volc.x, iz - H - volc.z)
        if (r > R) continue
        const c = iz * V + ix
        riverWl[c] = noWater
        let add: number
        if (r > 9) add = peakAdd * Math.pow(1 - (r - 9) / (R - 9), 1.7)
        else add = peakAdd - 7.5 * (1 - (r / 9) * (r / 9))
        // a little craggy roughness
        add += nMisc(ix * 0.35, iz * 0.35) * 0.35 * smooth(R, 9, r)
        h[c] = Math.max(h[c], origH[c]) * 0 + (h[c] + add)
        if (r < 9 && base + add < base + lavaAdd) lava[c] = base + lavaAdd
      }
    }
    // lava streams running down the flanks
    for (let s = 0; s < 4; s++) {
      let a = rng() * Math.PI * 2
      let r = 8
      while (r < R * 0.92) {
        a += (rng() - 0.5) * 0.18
        r += 0.8
        const px = volc.x + Math.cos(a) * r
        const pz = volc.z + Math.sin(a) * r
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ix = Math.round(px) + dx + H
            const iz = Math.round(pz) + dz + H
            if (ix < 1 || iz < 1 || ix >= V - 1 || iz >= V - 1) continue
            if (Math.hypot(ix - H - px, iz - H - pz) > 1.15) continue
            const c = iz * V + ix
            h[c] -= 0.45
            lava[c] = h[c] + 0.4
          }
        }
      }
    }
    // scattered lava pools on the volcanic plain
    for (let iz = 1; iz < V - 1; iz++) {
      for (let ix = 1; ix < V - 1; ix++) {
        const c = iz * V + ix
        if (biome[c] !== B.Volcanic || water[c] || lava[c] > noWater / 2) continue
        const r = Math.hypot(ix - H - volc.x, iz - H - volc.z)
        if (r < R * 0.7) continue
        if (nPond(ix * 0.06 + 50, iz * 0.06 + 50) > 0.62) {
          h[c] -= 0.4
          lava[c] = h[c] + 0.45
        }
      }
    }
  }

  // ---- 5. caverns: sunken, rock-walled bowls with a ramp entrance ---------------------------------
  for (const cs of caveSpots) {
    const R0 = 15
    const b0 = ringMean(cs.x, cs.z, 36)
    const floor = b0 - 5.5
    const rim = b0 + 4.5
    // entrance faces the lowest ground around the cavern (downhill = natural opening)
    let ent = Math.PI / 2
    let lo = 1e9
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2
      const ix = Math.round(cs.x + Math.cos(a) * 40) + H
      const iz = Math.round(cs.z + Math.sin(a) * 40) + H
      if (ix < 0 || iz < 0 || ix >= V || iz >= V) continue
      if (h[iz * V + ix] < lo) {
        lo = h[iz * V + ix]
        ent = a
      }
    }
    features.caves.push({ x: cs.x, z: cs.z, r: R0, floor, entrance: ent })
    for (let iz = Math.max(1, cs.z + H - 40); iz <= Math.min(V - 2, cs.z + H + 40); iz++) {
      for (let ix = Math.max(1, cs.x + H - 40); ix <= Math.min(V - 2, cs.x + H + 40); ix++) {
        const dx = ix - H - cs.x
        const dz = iz - H - cs.z
        const r = Math.hypot(dx, dz)
        if (r > 38) continue
        const c = iz * V + ix
        const old = h[c]
        riverWl[c] = noWater
        const bowl = floor + 0.35 * nMisc(ix * 0.12, iz * 0.12)
        let ring: number
        if (r < R0) ring = bowl
        else if (r < 24) ring = bowl + (rim - bowl) * smooth(R0, 24, r)
        else if (r < 28) ring = rim + 0.6 * nMisc(ix * 0.2, iz * 0.2)
        else ring = rim + (old - rim) * smooth(28, 38, r)
        let da = Math.abs(Math.atan2(dz, dx) - ent)
        if (da > Math.PI) da = Math.PI * 2 - da
        const s = smooth(0.42, 0.24, da)
        const ramp = bowl + (old - bowl) * smooth(R0 - 2, 36, r)
        h[c] = ring + (ramp - ring) * s
        // keep the cavern dry
        riverWl[c] = noWater
      }
    }
  }

  return { biome, lava, features: { ...features, magic: (() => {
    // the enchanted grove centre: centroid of magical cells
    let sx = 0, sz = 0, n = 0
    for (let c = 0; c < total; c += 7) if (biome[c] === B.Magical) { sx += (c % V) - H; sz += ((c / V) | 0) - H; n++ }
    return n ? { x: sx / n, z: sz / n } : null
  })() } }
}

export { BIOME_COUNT }

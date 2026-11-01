import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { createNoise2D } from 'simplex-noise'
import { mulberry32 } from '../utils/random'
import { srgb } from '../utils/textures'
import { template, type Template } from './propBatch'

/** Lumpy ellipsoid used for canopies and bushes. */
function lumpy(rx: number, ry: number, rz: number, detail: number, lump: number, seed: number) {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail)
  g.deleteAttribute('normal')
  g.deleteAttribute('uv')
  g = mergeVertices(g)
  const n = createNoise2D(mulberry32(seed))
  const p = g.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize()
    const k = 1 + (n(v.x * 2.2 + v.y, v.z * 2.2 + v.y * 1.3) * 0.5 + n(v.x * 5, v.z * 5 + v.y * 4) * 0.25) * lump
    p.setXYZ(i, v.x * rx * k, v.y * ry * k, v.z * rz * k)
  }
  g.computeVertexNormals()
  return g
}

function custom(pos: number[], idx: number[], normal: [number, number, number] = [0, 1, 0]) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  const n: number[] = []
  for (let i = 0; i < pos.length / 3; i++) n.push(...normal)
  g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3))
  g.setIndex(idx)
  return g
}

/** n thin diamond petals radiating in the XZ plane, facing up. Radius 0.5 at scale 1. */
function petalStar(n: number, width: number) {
  const pos: number[] = []
  const idx: number[] = []
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    const L = 0.5
    const pt = (x: number, z: number) => [x * c - z * s, 0, x * s + z * c]
    const base = pos.length / 3
    pos.push(...pt(0, 0), ...pt(width, L * 0.5), ...pt(-width, L * 0.5), ...pt(0, L))
    idx.push(base, base + 3, base + 1, base, base + 2, base + 3)
  }
  return custom(pos, idx)
}

/** Arching fern frond along +Z. */
function frond() {
  const pos: number[] = []
  const idx: number[] = []
  const rows = 5
  for (let r = 0; r <= rows; r++) {
    const t = r / rows
    const y = 0.55 * t - 0.62 * t * t + 0.04
    const w = 0.13 * Math.sin(Math.min(1, t * 1.15) * Math.PI) * (1 - t * 0.2)
    if (r === rows) pos.push(0, y, t * 0.95)
    else pos.push(-w, y, t * 0.95, w, y, t * 0.95)
  }
  for (let r = 0; r < rows - 1; r++) {
    const a = r * 2
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
  }
  const last = (rows - 1) * 2
  idx.push(last, last + 2, last + 1)
  return custom(pos, idx)
}

const T = template
export const TPL = {
  box: T(new THREE.BoxGeometry(1, 1, 1)),
  cyl: T(new THREE.CylinderGeometry(1, 1, 1, 8)),
  disc: T(new THREE.CylinderGeometry(1, 1, 1, 32)),
  trunk: T(new THREE.CylinderGeometry(0.62, 1, 1, 6).translate(0, 0.5, 0)),
  cone: T(new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0)),
  coneDown: T(new THREE.ConeGeometry(1, 1, 5).rotateX(Math.PI).translate(0, -0.5, 0)),
  stem: T(new THREE.CylinderGeometry(1, 1, 1, 4).translate(0, 0.5, 0)),
  cup: T(new THREE.ConeGeometry(1, 1, 6).rotateX(Math.PI).translate(0, 0.5, 0)),
  discUp: T(new THREE.CircleGeometry(1, 8).rotateX(-Math.PI / 2)),
  discTilt: T(new THREE.CircleGeometry(1, 8).rotateX(-Math.PI / 2 + 0.9)),
  sphere: T(new THREE.SphereGeometry(1, 6, 5)),
  dome: T(new THREE.SphereGeometry(1, 14, 9)),
  rock: T(new THREE.DodecahedronGeometry(1, 0)),
  petals6: T(petalStar(6, 0.12)),
  petals9: T(petalStar(9, 0.1)),
  petals5: T(petalStar(5, 0.17)),
  frond: T(frond()),
  oval: T(lumpy(1.15, 1.9, 1.15, 2, 0.28, 11)),
  round: T(lumpy(1.7, 1.45, 1.7, 2, 0.26, 17)),
  bush: T(lumpy(1, 0.8, 1, 2, 0.3, 23)),
  small: T(lumpy(0.85, 0.8, 0.85, 1, 0.3, 31)),
  willow: T(lumpy(1.5, 0.75, 1.5, 2, 0.22, 41)),
}

// ------------------------------------------------------------------ palettes (sRGB)
export const PALETTE = {
  yellow: srgb(0.98, 0.85, 0.25),
  orange: srgb(0.97, 0.55, 0.16),
  red: srgb(0.9, 0.2, 0.18),
  pink: srgb(0.96, 0.55, 0.7),
  magenta: srgb(0.82, 0.25, 0.55),
  purple: srgb(0.58, 0.36, 0.82),
  violet: srgb(0.45, 0.35, 0.85),
  blue: srgb(0.3, 0.5, 0.92),
  white: srgb(0.97, 0.96, 0.92),
  cream: srgb(0.99, 0.92, 0.7),
}
export type PaletteKey = keyof typeof PALETTE
export const PALETTE_KEYS = Object.keys(PALETTE) as PaletteKey[]

// ------------------------------------------------------------------ composed parts (trees, bushes)
export interface Part {
  t: Template
  m: THREE.Matrix4
  a: THREE.Color
  b: THREE.Color
  stip: number
  emis: number
  moss: number
}

const _e = new THREE.Euler()
const _q = new THREE.Quaternion()
function mat(px: number, py: number, pz: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0) {
  _e.set(rx, ry, rz)
  _q.setFromEuler(_e)
  return new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), _q, new THREE.Vector3(sx, sy, sz))
}
const part = (t: Template, m: THREE.Matrix4, a: THREE.Color, b: THREE.Color = a, stip = 0, emis = 0, moss = 0): Part => ({ t, m, a, b, stip, emis, moss })

const BARK = srgb(0.36, 0.24, 0.15)
const BARK_DARK = srgb(0.27, 0.18, 0.12)

export type TreeKind = 'oval' | 'round' | 'pine' | 'birch' | 'willow' | 'dead' | 'blossom' | 'autumn' | 'palm' | 'cactus' | 'snowPine' | 'charred' | 'magic' | 'mangrove' | 'giantShroom'

function makeTree(kind: TreeKind, variant: number): Part[] {
  const rng = mulberry32(kind.length * 977 + variant * 131 + kind.charCodeAt(0))
  const parts: Part[] = []
  switch (kind) {
    case 'oval': {
      const w = 0.9 + variant * 0.18
      parts.push(part(TPL.trunk, mat(0, -0.15, 0, 0.22, 1.5, 0.22), BARK))
      parts.push(part(TPL.oval, mat(0, 2.55, 0, w, 0.9 + variant * 0.2, w, 0, rng() * 6, 0), srgb(0.2, 0.4, 0.17), srgb(0.34, 0.5, 0.17), 1))
      if (variant) parts.push(part(TPL.small, mat(0.7, 1.7, 0.2, 0.7, 0.7, 0.7), srgb(0.22, 0.42, 0.17), srgb(0.34, 0.5, 0.17), 1))
      break
    }
    case 'round': {
      parts.push(part(TPL.trunk, mat(0, -0.15, 0, 0.28, 1.5, 0.28), BARK))
      parts.push(part(TPL.round, mat(0, 2.5, 0, 0.9 + variant * 0.12, 0.9, 0.9 + variant * 0.12, 0, rng() * 6, 0), srgb(0.28, 0.48, 0.15), srgb(0.44, 0.58, 0.18), 1))
      parts.push(part(TPL.small, mat(1.1, 1.9, 0.5, 0.9, 0.8, 0.9), srgb(0.28, 0.48, 0.15), srgb(0.44, 0.58, 0.18), 1))
      parts.push(part(TPL.small, mat(-1.0, 2.0, -0.6, 0.8, 0.7, 0.8), srgb(0.28, 0.48, 0.15), srgb(0.44, 0.58, 0.18), 1))
      break
    }
    case 'pine': {
      const dark = srgb(0.11, 0.29, 0.21)
      const light = srgb(0.2, 0.39, 0.25)
      parts.push(part(TPL.trunk, mat(0, -0.15, 0, 0.17, 2.4, 0.17), BARK_DARK))
      const tiers: [number, number, number][] = [[0.9, 1.45, 1.75], [1.8, 1.15, 1.55], [2.7, 0.88, 1.4], [3.55, 0.6, 1.2]]
      tiers.forEach(([y, r, h], i) => parts.push(part(TPL.cone, mat(0, y, 0, r * (0.9 + variant * 0.1), h + variant * 0.2, r * (0.9 + variant * 0.1), 0, i * 0.7, 0), dark, light, 1)))
      break
    }
    case 'birch': {
      const white = srgb(0.86, 0.84, 0.77)
      parts.push(part(TPL.trunk, mat(0, -0.1, 0, 0.12, 2.9, 0.12, 0, 0, variant ? 0.05 : -0.04), white))
      for (let i = 0; i < 5; i++) parts.push(part(TPL.box, mat(0, 0.4 + i * 0.5, 0.09, 0.07, 0.05, 0.03, 0, 0, 0), srgb(0.12, 0.1, 0.1)))
      const a = srgb(0.47, 0.64, 0.2)
      const b = srgb(0.66, 0.75, 0.27)
      parts.push(part(TPL.small, mat(0, 3.0, 0, 1, 1.1, 1), a, b, 1))
      parts.push(part(TPL.small, mat(0.55, 2.4, 0.3, 0.75, 0.8, 0.75), a, b, 1))
      parts.push(part(TPL.small, mat(-0.45, 3.35, -0.2, 0.65, 0.7, 0.65), a, b, 1))
      break
    }
    case 'willow': {
      parts.push(part(TPL.trunk, mat(0, -0.15, 0, 0.36, 1.7, 0.36, 0, 0, 0.06), BARK_DARK))
      const a = srgb(0.45, 0.62, 0.24)
      const b = srgb(0.62, 0.76, 0.32)
      parts.push(part(TPL.willow, mat(0, 2.3, 0, 1, 1, 1, 0, rng() * 6, 0), a, b, 1))
      const n = 16
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + rng() * 0.2
        const r = 1.45 + rng() * 0.25
        const len = 1.4 + rng() * 0.9
        parts.push(part(TPL.coneDown, mat(Math.cos(ang) * r, 2.15, Math.sin(ang) * r, 0.11, len, 0.11, 0, 0, 0), a, b, 1))
        if (i % 2) parts.push(part(TPL.coneDown, mat(Math.cos(ang) * (r - 0.55), 2.55, Math.sin(ang) * (r - 0.55), 0.1, len * 0.7, 0.1), a, b, 1))
      }
      break
    }
    case 'dead': {
      const grey = srgb(0.4, 0.34, 0.3)
      parts.push(part(TPL.trunk, mat(0, -0.15, 0, 0.2, 3.2, 0.2, 0, 0, variant ? 0.07 : -0.05), grey))
      const br = [[1.7, 0.9, 0.2], [2.2, -1.0, 0.5], [2.6, 0.6, -0.4], [1.2, -0.8, 1.4]]
      br.forEach(([y, rz, ry], i) => parts.push(part(TPL.trunk, mat(0, y, 0, 0.09, 1.2 - i * 0.1, 0.09, 0, ry * 2, rz), grey)))
      break
    }
    case 'blossom': {
      parts.push(part(TPL.trunk, mat(0, -0.15, 0, 0.26, 1.5, 0.26, 0, 0, 0.05), BARK_DARK))
      const a = srgb(0.92, 0.6, 0.73)
      const b = srgb(0.98, 0.8, 0.85)
      parts.push(part(TPL.round, mat(0, 2.4, 0, 0.85, 0.85, 0.85, 0, rng() * 6, 0), a, b, 1))
      parts.push(part(TPL.small, mat(1.0, 1.9, 0.4, 0.8, 0.7, 0.8), a, b, 1))
      parts.push(part(TPL.small, mat(-0.9, 2.1, -0.5, 0.7, 0.65, 0.7), a, b, 1))
      break
    }
    case 'palm': {
      // leaning, ringed trunk with a crown of arching fronds
      const lean = variant ? 0.16 : -0.12
      const trunk = srgb(0.55, 0.42, 0.26)
      const seg = 5
      for (let i = 0; i < seg; i++) {
        const y = i * 0.78
        parts.push(part(TPL.trunk, mat(-lean * y * 0.9, y - 0.1, 0, 0.17 - i * 0.012, 0.82, 0.17 - i * 0.012, 0, 0, lean), i % 2 ? trunk : srgb(0.48, 0.36, 0.22)))
      }
      const topX = -lean * 3.9 * 0.9
      const a = srgb(0.16, 0.45, 0.2)
      const b = srgb(0.36, 0.64, 0.25)
      const n = 9
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + rng() * 0.3
        const s = 2.1 + rng() * 0.6
        parts.push(part(TPL.frond, mat(topX, 3.85, 0, s, s, s, 0, ang, 0), a, b, 0))
      }
      parts.push(part(TPL.sphere, mat(topX, 3.85, 0, 0.16, 0.16, 0.16), srgb(0.4, 0.25, 0.12)))
      parts.push(part(TPL.sphere, mat(topX + 0.14, 3.7, 0.1, 0.1, 0.1, 0.1), srgb(0.38, 0.24, 0.1)))
      break
    }
    case 'cactus': {
      const a = srgb(0.2, 0.46, 0.22)
      const b = srgb(0.34, 0.58, 0.28)
      const hgt = 2.3 + variant * 0.7
      parts.push(part(TPL.stem, mat(0, -0.1, 0, 0.3, hgt, 0.3), a, b, 1))
      parts.push(part(TPL.sphere, mat(0, hgt - 0.1, 0, 0.3, 0.26, 0.3), a, b, 1))
      // arms
      parts.push(part(TPL.stem, mat(0.28, hgt * 0.42, 0, 0.5, 0.2, 0.2, 0, 0, 0), a, b, 1))
      parts.push(part(TPL.stem, mat(0.7, hgt * 0.42, 0, 0.18, 0.95 + variant * 0.2, 0.18), a, b, 1))
      parts.push(part(TPL.sphere, mat(0.7, hgt * 0.42 + 0.93 + variant * 0.2, 0, 0.18, 0.17, 0.18), a, b, 1))
      if (variant) {
        parts.push(part(TPL.stem, mat(-0.28, hgt * 0.6, 0, 0.5, 0.18, 0.18), a, b, 1))
        parts.push(part(TPL.stem, mat(-0.7, hgt * 0.6, 0, 0.16, 0.7, 0.16), a, b, 1))
        parts.push(part(TPL.sphere, mat(-0.7, hgt * 0.6 + 0.7, 0, 0.16, 0.15, 0.16), a, b, 1))
      }
      parts.push(part(TPL.discTilt, mat(0, hgt + 0.1, 0.1, 0.14, 0.14, 0.14), srgb(0.95, 0.4, 0.55), srgb(0.95, 0.4, 0.55), 0, 0.4))
      break
    }
    case 'snowPine': {
      const dark = srgb(0.16, 0.33, 0.3)
      const snow = srgb(0.93, 0.96, 0.99)
      parts.push(part(TPL.trunk, mat(0, -0.15, 0, 0.17, 2.4, 0.17), BARK_DARK))
      const tiers: [number, number, number][] = [[0.9, 1.45, 1.75], [1.8, 1.15, 1.55], [2.7, 0.88, 1.4], [3.55, 0.6, 1.2]]
      tiers.forEach(([y, r, h], i) => {
        const k = (0.9 + variant * 0.1)
        parts.push(part(TPL.cone, mat(0, y, 0, r * k, h + variant * 0.2, r * k, 0, i * 0.7, 0), dark, srgb(0.22, 0.4, 0.34), 1))
        // snow cap on each tier: a slightly smaller, higher white cone
        parts.push(part(TPL.cone, mat(0, y + h * 0.3, 0, r * k * 0.72, h * 0.72, r * k * 0.72, 0, i * 0.7, 0), snow, snow, 0))
      })
      break
    }
    case 'charred': {
      const coal = srgb(0.1, 0.08, 0.08)
      parts.push(part(TPL.trunk, mat(0, -0.15, 0, 0.22, 2.9, 0.22, 0, 0, variant ? 0.08 : -0.06), coal, srgb(0.2, 0.12, 0.08)))
      const br = [[1.5, 0.9, 0.2], [2.0, -1.1, 0.7], [2.4, 0.6, -0.5]]
      br.forEach(([y, rz, ry], i) => parts.push(part(TPL.trunk, mat(0, y, 0, 0.08, 1.1 - i * 0.12, 0.08, 0, ry * 2, rz), coal)))
      // glowing embers in the cracks
      parts.push(part(TPL.sphere, mat(0.1, 1.0, 0.12, 0.07, 0.07, 0.07), srgb(1, 0.5, 0.1), srgb(1, 0.35, 0.05), 0, 1.4))
      parts.push(part(TPL.sphere, mat(-0.08, 1.9, -0.1, 0.06, 0.06, 0.06), srgb(1, 0.55, 0.12), srgb(1, 0.4, 0.05), 0, 1.4))
      break
    }
    case 'magic': {
      const trunk = srgb(0.34, 0.26, 0.42)
      parts.push(part(TPL.trunk, mat(0, -0.15, 0, 0.3, 1.9, 0.3, 0, 0, variant ? 0.1 : -0.08), trunk, srgb(0.4, 0.3, 0.5)))
      const a = srgb(0.5, 0.35, 0.9)
      const b = srgb(0.5, 0.85, 0.95)
      parts.push(part(TPL.round, mat(0, 2.75, 0, 0.95, 0.95, 0.95, 0, rng() * 6, 0), a, b, 1, 0.55))
      parts.push(part(TPL.small, mat(1.15, 2.1, 0.4, 0.85, 0.75, 0.85), a, b, 1, 0.55))
      parts.push(part(TPL.small, mat(-1.0, 2.25, -0.55, 0.75, 0.7, 0.75), a, b, 1, 0.55))
      // glowing fruit
      for (let i = 0; i < 5; i++) {
        const ang = rng() * Math.PI * 2
        parts.push(part(TPL.sphere, mat(Math.cos(ang) * 1.3, 2.3 + rng() * 1.0, Math.sin(ang) * 1.3, 0.1, 0.1, 0.1), srgb(1, 0.9, 0.5), srgb(1, 0.75, 0.9), 0, 1.6))
      }
      break
    }
    case 'mangrove': {
      const root = srgb(0.3, 0.22, 0.14)
      parts.push(part(TPL.trunk, mat(0, 0.5, 0, 0.24, 1.5, 0.24), root))
      // stilt roots
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2 + rng() * 0.4
        parts.push(part(TPL.cone, mat(Math.cos(ang) * 0.32, 0.9, Math.sin(ang) * 0.32, 0.09, 1.1, 0.09, Math.sin(ang) * 0.5, 0, -Math.cos(ang) * 0.5), root))
      }
      const a = srgb(0.17, 0.38, 0.17)
      const b = srgb(0.3, 0.5, 0.2)
      parts.push(part(TPL.willow, mat(0, 2.4, 0, 0.95, 1.1, 0.95, 0, rng() * 6, 0), a, b, 1))
      parts.push(part(TPL.small, mat(0.9, 2.1, 0.3, 0.7, 0.6, 0.7), a, b, 1))
      break
    }
    case 'giantShroom': {
      const stem = srgb(0.86, 0.84, 0.78)
      const capA = variant ? srgb(0.35, 0.7, 0.85) : srgb(0.85, 0.3, 0.55)
      const capB = variant ? srgb(0.55, 0.95, 0.95) : srgb(1, 0.6, 0.8)
      const hgt = 2.0 + variant * 0.8
      parts.push(part(TPL.trunk, mat(0, -0.1, 0, 0.3, hgt, 0.3), stem))
      parts.push(part(TPL.dome, mat(0, hgt - 0.1, 0, 1.6 + variant * 0.3, 0.85, 1.6 + variant * 0.3), capA, capB, 0, 0.7))
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2 + rng() * 0.5
        const r = 0.7 + rng() * 0.5
        parts.push(part(TPL.sphere, mat(Math.cos(ang) * r, hgt + 0.45 - r * 0.2, Math.sin(ang) * r, 0.13, 0.08, 0.13), srgb(1, 1, 0.9), srgb(1, 1, 0.9), 0, 1.0))
      }
      break
    }
    case 'autumn': {
      parts.push(part(TPL.trunk, mat(0, -0.15, 0, 0.27, 1.5, 0.27), BARK))
      const a = srgb(0.84, 0.38, 0.11)
      const b = srgb(0.95, 0.72, 0.2)
      parts.push(part(TPL.round, mat(0, 2.45, 0, 0.88, 0.88, 0.88, 0, rng() * 6, 0), a, b, 1))
      parts.push(part(TPL.small, mat(1.05, 1.95, 0.4, 0.85, 0.75, 0.85), a, b, 1))
      parts.push(part(TPL.small, mat(-1, 2.0, -0.6, 0.75, 0.7, 0.75), a, b, 1))
      break
    }
  }
  return parts
}

export const TREE_PARTS: Record<TreeKind, Part[][]> = (() => {
  const kinds: TreeKind[] = ['oval', 'round', 'pine', 'birch', 'willow', 'dead', 'blossom', 'autumn', 'palm', 'cactus', 'snowPine', 'charred', 'magic', 'mangrove', 'giantShroom']
  const out = {} as Record<TreeKind, Part[][]>
  for (const k of kinds) out[k] = [makeTree(k, 0), makeTree(k, 1)]
  return out
})()

/** Fern: radial arching fronds. */
export const FERN_PARTS: Part[] = (() => {
  const a = srgb(0.24, 0.48, 0.17)
  const b = srgb(0.4, 0.62, 0.22)
  const out: Part[] = []
  const n = 9
  for (let i = 0; i < n; i++) {
    const s = 0.85 + (i % 3) * 0.2
    out.push(part(TPL.frond, mat(0, 0.02, 0, s, s, s, 0, (i / n) * Math.PI * 2, 0), a, b, 0))
  }
  return out
})()

export const ROUND_BUSH: Part[] = [part(TPL.bush, mat(0, 0.55, 0, 1, 1, 1), srgb(0.4, 0.49, 0.14), srgb(0.28, 0.45, 0.16), 1)]
export const DARK_BUSH: Part[] = [part(TPL.bush, mat(0, 0.55, 0, 1, 1, 1), srgb(0.2, 0.4, 0.17), srgb(0.3, 0.48, 0.17), 1)]

// biome bushes
export const DRY_BUSH: Part[] = [part(TPL.bush, mat(0, 0.45, 0, 0.8, 0.6, 0.8), srgb(0.58, 0.5, 0.26), srgb(0.72, 0.6, 0.3), 1)]
export const FROST_BUSH: Part[] = [part(TPL.bush, mat(0, 0.5, 0, 0.9, 0.7, 0.9), srgb(0.7, 0.8, 0.86), srgb(0.92, 0.96, 1), 1)]
export const GLOW_BUSH: Part[] = [
  part(TPL.bush, mat(0, 0.5, 0, 0.9, 0.7, 0.9), srgb(0.3, 0.22, 0.6), srgb(0.35, 0.65, 0.8), 1, 0.45),
  part(TPL.sphere, mat(0.4, 0.8, 0.2, 0.07, 0.07, 0.07), srgb(1, 0.9, 0.6), srgb(1, 0.8, 0.9), 0, 1.6),
  part(TPL.sphere, mat(-0.3, 0.7, -0.3, 0.06, 0.06, 0.06), srgb(0.7, 1, 1), srgb(0.9, 0.8, 1), 0, 1.6),
]
export const TROPIC_BUSH: Part[] = [part(TPL.bush, mat(0, 0.55, 0, 1, 1, 1), srgb(0.12, 0.45, 0.2), srgb(0.22, 0.6, 0.25), 1)]
export const SWAMP_BUSH: Part[] = [part(TPL.bush, mat(0, 0.5, 0, 1, 0.8, 1), srgb(0.22, 0.3, 0.14), srgb(0.32, 0.38, 0.17), 1, 0, 1)]
export const ASH_BUSH: Part[] = [part(TPL.bush, mat(0, 0.45, 0, 0.7, 0.55, 0.7), srgb(0.2, 0.17, 0.16), srgb(0.32, 0.2, 0.14), 1)]

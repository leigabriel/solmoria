import { hashInts, mulberry32 } from '../utils/random'
import { heightAt } from './terrainData'
import type { Site } from './hydrology'

export interface SPart {
  kind: 'box' | 'cyl' | 'cone' | 'sphere'
  x: number
  y: number
  z: number
  sx: number
  sy: number
  sz: number
  rx: number
  ry: number
  rz: number
  color: [number, number, number]
  moss: number
  emis: number
}
export interface Circle {
  x: number
  z: number
  r: number
}

const STONES: [number, number, number][] = [
  [0.66, 0.62, 0.54],
  [0.58, 0.55, 0.48],
  [0.72, 0.68, 0.58],
  [0.52, 0.5, 0.46],
]
const PLASTER: [number, number, number] = [0.8, 0.73, 0.58]
const ROOF: [number, number, number] = [0.58, 0.24, 0.17]
const WOOD: [number, number, number] = [0.42, 0.28, 0.16]
const WOOD_DARK: [number, number, number] = [0.3, 0.2, 0.12]
const GLOW: [number, number, number] = [1.0, 0.92, 0.38]

class Ctx {
  parts: SPart[] = []
  cols: Circle[] = []
  rng: () => number
  cos: number
  sin: number
  constructor(public site: Site, public yaw: number) {
    this.rng = mulberry32(site.seed)
    this.cos = Math.cos(yaw)
    this.sin = Math.sin(yaw)
  }
  /** site-local -> world (rotation about Y by yaw, matching three.js) */
  w(lx: number, lz: number): [number, number] {
    return [this.site.x + lx * this.cos + lz * this.sin, this.site.z - lx * this.sin + lz * this.cos]
  }
  stone(): [number, number, number] {
    const b = STONES[Math.floor(this.rng() * STONES.length)]
    const j = (this.rng() - 0.5) * 0.06
    return [b[0] + j, b[1] + j, b[2] + j]
  }
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, ry: number, color: [number, number, number], moss = 1, emis = 0, rx = 0, rz = 0) {
    this.parts.push({ kind: 'box', x, y, z, sx, sy, sz, rx, ry, rz, color, moss, emis })
  }
  cyl(x: number, y: number, z: number, r: number, h: number, color: [number, number, number], moss = 1, rx = 0, ry = 0, rz = 0, emis = 0) {
    this.parts.push({ kind: 'cyl', x, y, z, sx: r, sy: h, sz: r, rx, ry, rz, color, moss, emis })
  }
  col(x: number, z: number, r: number) {
    this.cols.push({ x, z, r })
  }

  /**
   * Course-built stone wall between two site-local points. When broken, the top edge is jagged and
   * blocks are missing; rubble is scattered at its foot.
   */
  wall(ax: number, az: number, bx: number, bz: number, height: number, thick: number, broken: boolean, opts: { plaster?: boolean; gaps?: [number, number][]; footing?: number } = {}) {
    const [x0, z0] = this.w(ax, az)
    const [x1, z1] = this.w(bx, bz)
    const L = Math.hypot(x1 - x0, z1 - z0)
    const ang = Math.atan2(z1 - z0, x1 - x0)
    const ca = Math.cos(ang)
    const sa = Math.sin(ang)
    const CH = 0.42
    const courses = Math.ceil(height / CH)
    const prof: number[] = []
    const n = Math.ceil(L / 0.6) + 2
    for (let i = 0; i < n; i++) prof.push(this.rng())
    const top = (s: number) => {
      if (!broken) return height
      const f = (s / L) * (n - 1)
      const i = Math.min(n - 2, Math.floor(f))
      const t = f - i
      const v = prof[i] * (1 - t) + prof[i + 1] * t
      return height * (0.12 + 0.88 * Math.pow(v, 0.8))
    }
    const inGap = (s: number) => (opts.gaps ?? []).some(([a, b]) => s > a - 0.05 && s < b + 0.05)
    for (let c = 0; c < courses; c++) {
      let s = -(c % 2) * 0.45
      while (s < L) {
        const len = 0.7 + this.rng() * 0.55
        const s0 = Math.max(0, s)
        const s1 = Math.min(L, s + len)
        s += len
        if (s1 - s0 < 0.22) continue
        const mid = (s0 + s1) / 2
        if (inGap(mid)) continue
        if (c * CH > top(mid)) continue
        const px = x0 + ca * mid
        const pz = z0 + sa * mid
        const gy = heightAt(px, pz)
        const col = opts.plaster && c >= (opts.footing ?? 2) ? ([PLASTER[0] + (this.rng() - 0.5) * 0.04, PLASTER[1], PLASTER[2]] as [number, number, number]) : this.stone()
        const wob = broken ? (this.rng() - 0.5) * 0.07 : 0
        this.box(px, gy + c * CH + CH / 2 - 0.2, pz, s1 - s0 - 0.02, CH - 0.02, thick, -ang + wob, col, opts.plaster && c >= (opts.footing ?? 2) ? 0 : 1)
      }
    }
    // colliders every ~0.9 units where the wall is tall enough to block
    for (let s = 0.3; s < L; s += 0.9) {
      if (inGap(s)) continue
      if (top(s) > 0.9) this.col(x0 + ca * s, z0 + sa * s, thick * 0.5 + 0.3)
    }
    // rubble at the foot
    const rubble = Math.floor(L * (broken ? 1.6 : 0.25))
    for (let i = 0; i < rubble; i++) {
      const s = this.rng() * L
      const off = (this.rng() - 0.5) * 1.8
      const px = x0 + ca * s - sa * off
      const pz = z0 + sa * s + ca * off
      const sz = 0.14 + this.rng() * 0.3
      this.box(px, heightAt(px, pz) + sz * 0.4 - 0.05, pz, sz * 1.3, sz, sz, this.rng() * 3, this.stone(), 1, 0, (this.rng() - 0.5) * 0.5, (this.rng() - 0.5) * 0.5)
    }
  }

  pillar(lx: number, lz: number, h: number, broken: boolean) {
    const [x, z] = this.w(lx, lz)
    const gy = heightAt(x, z)
    this.box(x, gy + 0.14 - 0.1, z, 1.0, 0.3, 1.0, this.yaw, this.stone())
    const H = broken ? h * (0.3 + this.rng() * 0.45) : h
    this.cyl(x, gy + 0.3 + H / 2 - 0.1, z, 0.34, H, this.stone())
    if (broken) {
      this.box(x + 0.05, gy + 0.3 + H - 0.05, z, 0.44, 0.22, 0.4, this.rng() * 3, this.stone(), 1, 0, 0.3, 0.25)
      const drums = 1 + Math.floor(this.rng() * 2)
      for (let i = 0; i < drums; i++) {
        const a = this.rng() * Math.PI * 2
        const d = 1.1 + this.rng() * 0.9
        const dx = x + Math.cos(a) * d
        const dz = z + Math.sin(a) * d
        this.cyl(dx, heightAt(dx, dz) + 0.3, dz, 0.33, 0.6 + this.rng() * 0.7, this.stone(), 1, 0, a, Math.PI / 2)
      }
    } else {
      this.box(x, gy + 0.3 + H + 0.05, z, 0.95, 0.26, 0.95, this.yaw, this.stone())
    }
    this.col(x, z, 0.45)
  }
}

export interface SiteGeometry {
  parts: SPart[]
  cols: Circle[]
}

function ruinCourt(c: Ctx) {
  const W = 12
  const D = 9
  const hw = W / 2
  const hd = D / 2
  c.wall(-hw, -hd, hw, -hd, 2.5, 0.55, true) // back wall
  c.wall(-hw, -hd, -hw, hd, 2.1, 0.55, true) // west wall
  c.wall(hw, -hd, hw, 0.5, 1.8, 0.55, true, {}) // east wall (open toward the front)
  c.wall(-hw, hd, -hw + 3.2, hd, 1.4, 0.55, true) // front stubs
  c.wall(hw - 3.2, hd, hw, hd, 1.2, 0.55, true)
  for (let i = 0; i < 4; i++) c.pillar(-hw + 2.2 + i * 2.6, hd - 0.4, 3.6, c.rng() < 0.6)
  // entrance steps
  for (let i = 0; i < 3; i++) {
    const [x, z] = c.w(0, hd + 0.5 + i * 0.5)
    c.box(x, heightAt(x, z) + 0.1 + (2 - i) * 0.0, z, 3.2 - i * 0.3, 0.3 - i * 0.05, 0.6, c.yaw, c.stone())
  }
  // central pedestal with a broken statue
  const [px, pz] = c.w(0, -0.5)
  const gy = heightAt(px, pz)
  c.box(px, gy + 0.4 - 0.1, pz, 1.4, 0.8, 1.4, c.yaw, c.stone())
  c.box(px, gy + 1.2, pz, 0.7, 0.9, 0.55, c.yaw + 0.2, c.stone(), 1, 0, 0, 0.12)
  c.col(px, pz, 0.9)
  const [fx, fz] = c.w(1.6, 0.8)
  c.box(fx, heightAt(fx, fz) + 0.2, fz, 0.8, 0.45, 0.5, 1.2, c.stone(), 1, 0, 0.1, 1.2)
  // glowing rune at the pedestal foot
  const [rx, rz] = c.w(0, 0.7)
  c.box(rx, heightAt(rx, rz) + 0.04, rz, 1.2, 0.05, 0.7, c.yaw, GLOW, 0, 2.2)
}

function stoneCircle(c: Ctx, broken: boolean) {
  const n = 9
  const R = 5
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const [x, z] = c.w(Math.cos(a) * R, Math.sin(a) * R)
    const gy = heightAt(x, z)
    const h = 1.8 + c.rng() * 1.2
    const fallen = broken && c.rng() < 0.35
    if (fallen) {
      c.box(x, gy + 0.3, z, 0.8, 0.55, h, a + c.rng(), c.stone(), 1, 0, 0, 0.1)
    } else {
      const lean = broken ? (c.rng() - 0.5) * 0.2 : (c.rng() - 0.5) * 0.06
      c.box(x, gy + h / 2 - 0.2, z, 0.85, h, 0.5, -a + Math.PI / 2, c.stone(), 1, 0, lean, lean * 0.7)
      c.col(x, z, 0.5)
    }
  }
  const [ax, az] = c.w(0, 0)
  const gy = heightAt(ax, az)
  c.box(ax, gy + 0.25, az, 2.0, 0.55, 1.2, c.yaw, c.stone())
  c.box(ax, gy + 0.55, az, 1.1, 0.05, 0.6, c.yaw, GLOW, 0, 2.2)
  c.col(ax, az, 1.0)
  for (let i = 0; i < 3; i++) {
    const [sx, sz] = c.w((c.rng() - 0.5) * 3, (c.rng() - 0.5) * 3 + 1.8)
    c.box(sx, heightAt(sx, sz) + 0.2, sz, 0.4, 0.4, 0.4, c.rng() * 3, c.stone())
  }
}

function archway(c: Ctx, broken: boolean) {
  const gap = 1.8
  c.pillar(-gap, 0, 3.7, false)
  if (broken) c.pillar(gap, 0, 3.7, true)
  else c.pillar(gap, 0, 3.7, false)
  const [lx, lz] = c.w(0, 0)
  const gy = heightAt(lx, lz)
  if (!broken) {
    c.box(lx, gy + 0.3 + 3.7 + 0.26 + 0.12 + 0.25, lz, 4.6, 0.5, 1.0, c.yaw, c.stone())
    c.box(lx, gy + 0.3 + 3.7 + 0.8 + 0.2, lz, 0.9, 0.5, 0.8, c.yaw, c.stone())
  } else {
    const [hx, hz] = c.w(-1.4, 0)
    c.box(hx, gy + 0.3 + 3.7 + 0.5, hz, 2.0, 0.5, 1.0, c.yaw, c.stone(), 1, 0, 0, 0.06)
    const [fx, fz] = c.w(1.2, 2.0)
    c.box(fx, heightAt(fx, fz) + 0.25, fz, 2.2, 0.5, 0.95, c.yaw + 0.9, c.stone(), 1, 0, 0.12, 0.08)
    const [kx, kz] = c.w(2.6, 1.0)
    c.box(kx, heightAt(kx, kz) + 0.25, kz, 0.9, 0.5, 0.8, 0.5, c.stone(), 1, 0, 0.3, 0.2)
  }
  c.wall(-gap - 0.6, 0, -gap - 3.2, 0.2, 1.4, 0.5, true)
  c.wall(gap + 0.6, 0, gap + 2.4, -0.1, 1.0, 0.5, true)
}

function shrine(c: Ctx, broken: boolean) {
  const [x, z] = c.w(0, 0)
  const gy = heightAt(x, z)
  const steps: [number, number][] = [[4.2, 0.3], [3.2, 0.3], [2.2, 0.3]]
  steps.forEach(([s, h], i) => c.box(x, gy + h / 2 + i * h - 0.2, z, s, h, s, c.yaw, c.stone()))
  const base = gy + 0.9 - 0.2
  c.box(x, base + 1.4, z, 0.75, 2.8, 0.75, c.yaw, c.stone(), 1, 0, broken ? 0.1 : 0, broken ? 0.05 : 0)
  if (!broken) c.box(x, base + 3.05, z, 0.62, 0.62, 0.62, c.yaw + Math.PI / 4, c.stone(), 1, 0, 0.6, 0.6)
  else {
    const [bx, bz] = c.w(1.4, 1.5)
    c.box(bx, heightAt(bx, bz) + 0.3, bz, 0.7, 0.55, 0.7, 0.4, c.stone(), 1, 0, 0.5, 0.4)
  }
  const [fx, fz] = c.w(0, 0.45)
  for (let i = 0; i < 3; i++) c.box(fx, base + 0.9 + i * 0.7, fz, 0.35 - i * 0.05, 0.08, 0.03, c.yaw, GLOW, 0, 2.2)
  for (const sx of [-1.6, 1.6]) {
    const [lx, lz] = c.w(sx, 1.4)
    const g2 = heightAt(lx, lz)
    c.cyl(lx, g2 + 0.7, lz, 0.07, 1.6, WOOD_DARK, 0)
    if (!broken || sx < 0) c.box(lx, g2 + 1.6, lz, 0.32, 0.32, 0.32, c.yaw, [1.0, 0.82, 0.4], 0, 1.6)
    c.col(lx, lz, 0.2)
  }
  c.col(x, z, 1.5)
}

function cottage(c: Ctx, broken: boolean) {
  const W = 4.6
  const D = 3.6
  const hw = W / 2
  const hd = D / 2
  const H = 2.2
  const opts = { plaster: true, footing: 2 }
  c.wall(-hw, -hd, hw, -hd, H, 0.36, broken, opts) // back
  c.wall(-hw, hd, hw, hd, H, 0.36, broken, { ...opts, gaps: [[hw - 0.6, hw + 0.6]] }) // front, door gap in the middle
  c.wall(-hw, -hd, -hw, hd, H, 0.36, broken, opts)
  c.wall(hw, -hd, hw, hd, H, 0.36, broken, opts)
  const [cx, cz] = c.w(0, 0)
  const gy = heightAt(cx, cz)
  c.box(cx, gy - 0.12, cz, W - 0.5, 0.1, D - 0.5, c.yaw, WOOD_DARK, 0)
  if (!broken) {
    const rise = 1.35
    const run = hd + 0.45
    const slope = Math.hypot(run, rise)
    const ang = Math.atan2(rise, run)
    for (const s of [-1, 1]) {
      const [x, z] = c.w(0, s * run * 0.5)
      c.box(x, gy + H - 0.1 + rise / 2 + 0.12, z, W + 0.9, 0.18, slope + 0.1, c.yaw, ROOF, 0, 0, -s * ang, 0)
    }
    // gable ends
    for (const sx of [-hw, hw]) {
      for (let i = 0; i < 4; i++) {
        const [x, z] = c.w(sx, 0)
        c.box(x, gy + H - 0.2 + i * 0.34 + 0.17, z, 0.36, 0.34, D * (0.92 - i * 0.24), c.yaw, PLASTER, 0)
      }
    }
    const [kx, kz] = c.w(hw + 0.45, -0.6)
    c.box(kx, gy + 1.7, kz, 0.8, 3.4, 0.8, c.yaw, c.stone())
    const [dx, dz] = c.w(hw - 0.6 + 0.3, hd + 0.35)
    c.box(dx, gy + 0.9, dz, 0.9, 1.8, 0.07, c.yaw + 1.1, WOOD, 0)
    for (const wx of [-1.2, 1.2]) {
      const [sx, sz] = c.w(wx, hd + 0.22)
      c.box(sx, gy + 1.4, sz, 0.5, 0.7, 0.05, c.yaw, WOOD, 0)
    }
  } else {
    for (let i = 0; i < 3; i++) {
      const [x, z] = c.w(-1.5 + i * 1.4, -0.4)
      c.box(x, gy + 1.9, z, 0.16, 0.16, D * 0.95, c.yaw, WOOD_DARK, 0, 0, (c.rng() - 0.5) * 0.5, (c.rng() - 0.5) * 0.4)
    }
    const [sx, sz] = c.w(0.4, 0.2)
    c.box(sx, gy + 0.25, sz, 2.3, 0.16, 1.7, c.yaw + 0.3, ROOF, 0, 0, 0.18, 0.1)
    const [kx, kz] = c.w(hw + 0.45, -0.6)
    c.box(kx, gy + 1.0, kz, 0.8, 2.0, 0.8, c.yaw, c.stone(), 1, 0, 0, 0.1)
  }
}

const GEN: Record<Site['type'], (c: Ctx) => void> = {
  ruinCourt: (c) => ruinCourt(c),
  cottage: (c) => cottage(c, false),
  cottageRuin: (c) => cottage(c, true),
  stoneCircle: (c) => stoneCircle(c, c.rng() < 0.6),
  shrine: (c) => shrine(c, c.rng() < 0.4),
  archway: (c) => archway(c, c.rng() < 0.55),
}

const cache = new Map<string, SiteGeometry>()
export function siteGeometry(site: Site): SiteGeometry {
  const key = `${site.x},${site.z}`
  let g = cache.get(key)
  if (!g) {
    const yaw = (hashInts(site.x, site.z, 3) % 628) / 100
    // cottages & courts face the camera (+z) roughly; circles / shrines are rotationally free
    const c = new Ctx(site, site.type === 'cottage' || site.type === 'cottageRuin' || site.type === 'ruinCourt' ? ((hashInts(site.x, site.z) % 100) / 100 - 0.5) * 0.5 : yaw)
    GEN[site.type](c)
    g = { parts: c.parts, cols: c.cols }
    cache.set(key, g)
  }
  return g
}

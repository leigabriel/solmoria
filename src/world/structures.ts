import { hashInts, mulberry32 } from '../utils/random'
import { biomeAt, heightAt } from './terrainData'
import { B } from './biomes'
import type { Site } from './hydrology'

export interface SPart {
  kind: 'box' | 'cyl' | 'cone' | 'sphere' | 'dome'
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
  cone(x: number, y: number, z: number, rx_: number, h: number, color: [number, number, number], moss = 0, emis = 0, ry = 0) {
    this.parts.push({ kind: 'cone', x, y, z, sx: rx_, sy: h, sz: rx_, rx: 0, ry, rz: 0, color, moss, emis })
  }
  sphere(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: [number, number, number], moss = 0, emis = 0) {
    this.parts.push({ kind: Math.max(sx, sz) > 0.9 ? 'dome' : 'sphere', x, y, z, sx, sy, sz, rx: 0, ry: 0, rz: 0, color, moss, emis })
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


// ------------------------------------------------------------------------------------------------ villages
type RGB = [number, number, number]
const WALLS: RGB[] = [[0.9, 0.82, 0.66], [0.78, 0.86, 0.9], [0.92, 0.76, 0.7], [0.86, 0.8, 0.5], [0.8, 0.72, 0.9]]
const ROOFS: RGB[] = [[0.7, 0.28, 0.2], [0.85, 0.66, 0.24], [0.2, 0.52, 0.55], [0.5, 0.3, 0.62], [0.76, 0.4, 0.2]]
const CAPS: RGB[] = [[0.82, 0.18, 0.2], [0.55, 0.28, 0.72], [0.15, 0.55, 0.62], [0.95, 0.5, 0.15]]
const CREAM: RGB = [0.95, 0.9, 0.78]
const LAMP: RGB = [1.0, 0.82, 0.4]
const GRASSY: RGB = [0.3, 0.52, 0.2]
const STONE_GREY: RGB = [0.55, 0.52, 0.46]
const pickOf = <T,>(rng: () => number, a: readonly T[]) => a[Math.floor(rng() * a.length)]

/** A local frame (position + yaw) so each house is authored in its own coordinates. */
class Frame {
  gy: number
  cs: number
  sn: number
  constructor(public c: Ctx, public wx: number, public wz: number, public Y: number) {
    this.gy = heightAt(wx, wz)
    this.cs = Math.cos(Y)
    this.sn = Math.sin(Y)
  }
  p(dx: number, dz: number): [number, number] {
    return [this.wx + dx * this.cs + dz * this.sn, this.wz - dx * this.sn + dz * this.cs]
  }
  box(dx: number, dy: number, dz: number, sx: number, sy: number, sz: number, color: RGB, emis = 0, rz = 0, rx = 0) {
    const [x, z] = this.p(dx, dz)
    this.c.box(x, this.gy + dy, z, sx, sy, sz, this.Y, color, 0, emis, rx, rz)
  }
  cyl(dx: number, dy: number, dz: number, r: number, h: number, color: RGB, emis = 0, moss = 0) {
    const [x, z] = this.p(dx, dz)
    this.c.cyl(x, this.gy + dy, z, r, h, color, moss, 0, 0, 0, emis)
  }
  /** cylinder lying along local x (a log) */
  log(dx: number, dy: number, dz: number, r: number, len: number, color: RGB, yawOff = 0) {
    const [x, z] = this.p(dx, dz)
    this.c.cyl(x, this.gy + dy, z, r, len, color, 0, 0, this.Y + yawOff, Math.PI / 2)
  }
  cone(dx: number, dy: number, dz: number, r: number, h: number, color: RGB, moss = 0, emis = 0) {
    const [x, z] = this.p(dx, dz)
    this.c.cone(x, this.gy + dy, z, r, h, color, moss, emis)
  }
  sphere(dx: number, dy: number, dz: number, sx: number, sy: number, sz: number, color: RGB, moss = 0, emis = 0) {
    const [x, z] = this.p(dx, dz)
    this.c.sphere(x, this.gy + dy, z, sx, sy, sz, color, moss, emis)
  }
  col(dx: number, dz: number, r: number) {
    const [x, z] = this.p(dx, dz)
    this.c.col(x, z, r)
  }
  /** footing that reaches well below grade so a house never floats on uneven ground */
  footing(w: number, d: number, color: RGB = STONE_GREY, h = 0.5) {
    this.box(0, h / 2 - 0.45, 0, w, h + 0.9, d, color)
  }
  /** door + glowing window dot on the +z face */
  door(dz: number, w = 0.9, h = 1.6, trim: RGB = WOOD) {
    this.box(0, h / 2, dz, w, h, 0.12, WOOD_DARK)
    this.box(0, h + 0.05, dz, w + 0.25, 0.14, 0.16, trim)
    this.box(-w / 2 - 0.06, h / 2, dz, 0.12, h, 0.16, trim)
    this.box(w / 2 + 0.06, h / 2, dz, 0.12, h, 0.16, trim)
    this.sphere(w * 0.32, h * 0.5, dz + 0.08, 0.05, 0.05, 0.03, GLOW, 0, 1.5)
  }
  window(dx: number, dy: number, dz: number, sx = 0.5, sy = 0.5, trim: RGB = WOOD) {
    this.box(dx, dy, dz, sx + 0.14, sy + 0.14, 0.1, trim)
    this.box(dx, dy, dz + 0.03, sx, sy, 0.1, GLOW, 1.6)
    this.box(dx, dy, dz + 0.07, 0.04, sy, 0.04, trim)
  }
}

/** Gabled roof with closed gable ends; ridge runs along local z. */
function gable(f: Frame, W: number, D: number, y0: number, roof: RGB, wall: RGB, rise = 1.5, over = 0.5, ridge: RGB = WOOD) {
  const half = W / 2 + over
  const ang = Math.atan2(rise, half)
  const len = Math.hypot(half, rise)
  f.box(-half / 2, y0 + rise / 2, 0, len, 0.18, D + 0.9, roof, 0, ang)
  f.box(half / 2, y0 + rise / 2, 0, len, 0.18, D + 0.9, roof, 0, -ang)
  f.box(0, y0 + rise + 0.05, 0, 0.3, 0.18, D + 1.0, ridge)
  const steps = 4
  for (let i = 0; i < steps; i++) {
    const w = W * (1 - (i + 0.5) / steps)
    const y = y0 + 0.05 + (i + 0.5) * ((rise - 0.1) / steps)
    f.box(0, y, D / 2 - 0.02, w, (rise - 0.1) / steps + 0.02, 0.12, wall)
    f.box(0, y, -D / 2 + 0.02, w, (rise - 0.1) / steps + 0.02, 0.12, wall)
  }
}

// ---- houses --------------------------------------------------------------------------------
function mushroomHouse(f: Frame, rng: () => number, glow = 0) {
  const cap = pickOf(rng, CAPS)
  f.footing(2.0, 2.0, GRASSY, 0.1)
  f.cyl(0, 0.95, 0, 1.0, 1.9, CREAM)
  f.sphere(0, 2.2, 0, 2.4, 1.15, 2.4, cap, 0, glow)
  for (let i = 0; i < 7; i++) {
    const a = rng() * Math.PI * 2
    const e = 0.35 + rng() * 0.55
    f.sphere(Math.cos(a) * 2.3 * Math.cos(e) * 0.97, 2.2 + Math.sin(e) * 1.15 * 0.97, Math.sin(a) * 2.3 * Math.cos(e) * 0.97, 0.26, 0.1, 0.26, [0.97, 0.95, 0.9], 0, glow)
  }
  f.door(0.97, 0.8, 1.3)
  f.window(-0.62, 1.3, 0.78, 0.35, 0.35)
  f.cyl(0, 0.05, 0, 1.3, 0.12, GRASSY, 1)
  f.col(0, 0, 1.9)
}

function thatchCottage(f: Frame, rng: () => number) {
  const wall = pickOf(rng, WALLS)
  const roof = pickOf(rng, ROOFS)
  const W = 3.4 + rng() * 0.8
  const D = 3.0 + rng() * 0.8
  f.footing(W + 0.3, D + 0.3)
  f.box(0, 0.5 + 0.9, 0, W, 1.8, D, wall)
  for (const x of [-W / 2, W / 2]) f.box(x, 1.4, D / 2 + 0.02, 0.14, 1.8, 0.1, WOOD)
  f.box(0, 2.25, D / 2 + 0.02, W + 0.1, 0.14, 0.1, WOOD)
  gable(f, W, D, 2.3, roof, wall)
  f.door(D / 2 + 0.02, 0.85, 1.55)
  f.window(-W / 2 + 0.75, 1.4, D / 2 + 0.03)
  f.window(W / 2 - 0.75, 1.4, D / 2 + 0.03)
  f.box(W / 2 - 0.5, 3.3, -0.3, 0.5, 1.6, 0.5, [0.6, 0.55, 0.48])
  f.box(-W / 2 + 0.75, 0.85, D / 2 + 0.2, 0.7, 0.14, 0.24, WOOD)
  for (let i = 0; i < 3; i++) f.sphere(-W / 2 + 0.55 + i * 0.2, 0.98, D / 2 + 0.2, 0.08, 0.08, 0.08, ([[1, 0.4, 0.55], [1, 0.9, 0.3], [0.75, 0.5, 1]] as RGB[])[i], 0, 0.3)
  f.col(-W / 4, 0, Math.max(D, W) * 0.42)
  f.col(W / 4, 0, Math.max(D, W) * 0.42)
}

function towerHouse(f: Frame, rng: () => number, roofCol?: RGB, glowTop = false) {
  const roof = roofCol ?? pickOf(rng, ROOFS)
  const wall = pickOf(rng, WALLS)
  f.cyl(0, 0.3, 0, 1.75, 1.5, STONE_GREY)
  f.cyl(0, 2.4, 0, 1.45, 4.2, wall)
  f.cyl(0, 4.6, 0, 1.75, 0.35, WOOD)
  f.cone(0, 4.75, 0, 2.2, 2.6, roof)
  f.sphere(0, 7.45, 0, 0.18, 0.18, 0.18, GLOW, 0, glowTop ? 2.6 : 1.8)
  f.door(1.44, 0.85, 1.5)
  f.window(0, 2.9, 1.43, 0.4, 0.55)
  f.window(0, 4.0, 1.43, 0.4, 0.45)
  f.window(1.1, 3.4, -0.9, 0.4, 0.5)
  f.box(0, 0.12, 1.95, 1.7, 0.24, 0.9, WOOD)
  f.col(0, 0, 1.75)
}

function hobbitHole(f: Frame, rng: () => number) {
  f.sphere(0, 0, 0, 3.0, 1.9, 3.0, GRASSY, 1)
  const door: RGB = rng() < 0.5 ? [0.2, 0.5, 0.55] : [0.7, 0.3, 0.2]
  f.box(0, 0.85, 2.45, 1.9, 1.7, 0.3, WOOD_DARK)
  f.sphere(0, 1.7, 2.45, 0.95, 0.4, 0.15, WOOD_DARK)
  f.box(0, 0.8, 2.6, 1.4, 1.6, 0.14, door)
  f.sphere(0, 1.6, 2.6, 0.7, 0.35, 0.08, door)
  f.sphere(0.28, 0.95, 2.62, 0.07, 0.07, 0.05, GLOW, 0, 1.4)
  f.cyl(1.4, 2.0, -0.6, 0.35, 1.2, [0.58, 0.54, 0.48])
  f.window(-1.7, 0.9, 1.9, 0.3, 0.3)
  for (let i = 0; i < 6; i++) {
    const a = rng() * Math.PI * 2
    f.sphere(Math.cos(a) * 2.2, 0.9 + rng() * 0.4, Math.sin(a) * 2.2, 0.1, 0.1, 0.1, ([[1, 0.5, 0.6], [1, 0.9, 0.3], [0.9, 0.9, 1]] as RGB[])[i % 3], 0, 0.3)
  }
  f.col(0, 0, 2.7)
}

const LOG_A: RGB = [0.45, 0.3, 0.17]
const LOG_B: RGB = [0.38, 0.25, 0.14]
function logCabin(f: Frame, rng: () => number) {
  const W = 3.8 + rng() * 0.6
  const D = 3.2 + rng() * 0.6
  const roof: RGB = pickOf(rng, [[0.2, 0.42, 0.25], [0.3, 0.4, 0.2], [0.42, 0.3, 0.18]] as RGB[])
  f.footing(W + 0.3, D + 0.3, [0.5, 0.48, 0.44], 0.3)
  for (let i = 0; i < 7; i++) {
    const y = 0.28 + i * 0.29
    f.box(0, y, 0, W, 0.27, D, i % 2 ? LOG_A : LOG_B)
    // protruding log ends at the corners
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.cyl(sx * (W / 2 + 0.05), y, sz * (D / 2 + 0.05), 0.15, 0.28, i % 2 ? LOG_B : LOG_A)
  }
  gable(f, W, D, 2.2, roof, LOG_A, 1.4, 0.55, WOOD_DARK)
  f.door(D / 2 + 0.02, 0.85, 1.55, WOOD_DARK)
  f.window(-W / 2 + 0.8, 1.35, D / 2 + 0.03)
  f.window(W / 2 - 0.8, 1.35, D / 2 + 0.03)
  f.box(0, 0.08, D / 2 + 0.55, 1.6, 0.16, 0.9, WOOD)
  f.box(W / 2 - 0.45, 3.2, -0.4, 0.55, 1.8, 0.55, [0.5, 0.47, 0.42])
  // firewood stack against the wall
  for (let i = 0; i < 3; i++) for (let j = 0; j <= i; j++) f.log(-W / 2 - 0.35 + 0, 0.18 + i * 0.28, -0.5 + j * 0.3 - i * 0.15, 0.13, 0.7, LOG_B, Math.PI / 2)
  f.col(-W / 4, 0, Math.max(D, W) * 0.42)
  f.col(W / 4, 0, Math.max(D, W) * 0.42)
}

const ADOBE: RGB[] = [[0.9, 0.76, 0.52], [0.86, 0.68, 0.45], [0.92, 0.82, 0.62]]
const CLOTH: RGB[] = [[0.78, 0.25, 0.2], [0.2, 0.5, 0.6], [0.9, 0.7, 0.2], [0.55, 0.3, 0.6]]
function adobeHouse(f: Frame, rng: () => number) {
  const col = pickOf(rng, ADOBE)
  const W = 3.6 + rng() * 1.0
  const D = 3.2 + rng() * 0.8
  const H = 2.2 + (rng() < 0.4 ? 1.0 : 0)
  const cloth = pickOf(rng, CLOTH)
  f.footing(W + 0.3, D + 0.3, [0.72, 0.6, 0.42], 0.25)
  f.box(0, H / 2 + 0.1, 0, W, H, D, col)
  // parapet with notches
  f.box(0, H + 0.35, D / 2 - 0.1, W + 0.2, 0.3, 0.2, col)
  f.box(0, H + 0.35, -D / 2 + 0.1, W + 0.2, 0.3, 0.2, col)
  f.box(W / 2 - 0.1, H + 0.35, 0, 0.2, 0.3, D, col)
  f.box(-W / 2 + 0.1, H + 0.35, 0, 0.2, 0.3, D, col)
  // door arch
  f.box(0, 0.85, D / 2 + 0.02, 0.9, 1.5, 0.14, WOOD_DARK)
  f.sphere(0, 1.6, D / 2 + 0.02, 0.45, 0.28, 0.1, WOOD_DARK)
  f.sphere(0.25, 0.9, D / 2 + 0.1, 0.05, 0.05, 0.03, GLOW, 0, 1.4)
  f.window(-W / 2 + 0.8, 1.45, D / 2 + 0.03, 0.4, 0.5, [0.6, 0.45, 0.28])
  f.window(W / 2 - 0.8, 1.45, D / 2 + 0.03, 0.4, 0.5, [0.6, 0.45, 0.28])
  // striped awning over the door
  for (let i = 0; i < 5; i++) f.box(-0.8 + i * 0.4, 2.1, D / 2 + 0.55, 0.4, 0.06, 1.0, i % 2 ? [0.95, 0.92, 0.85] : cloth, 0, 0.25)
  for (const x of [-1.0, 1.0]) f.cyl(x, 1.0, D / 2 + 1.0, 0.05, 2.1, WOOD)
  // roof dome or ladder + water jar
  if (rng() < 0.45) f.sphere(-W / 4, H + 0.4, -D / 6, 1.0, 0.8, 1.0, col)
  else {
    f.box(W / 2 + 0.12, H / 2 + 0.2, -D / 4, 0.08, H + 0.4, 0.5, WOOD)
    for (let i = 0; i < 4; i++) f.box(W / 2 + 0.12, 0.5 + i * 0.5, -D / 4, 0.12, 0.05, 0.5, WOOD)
  }
  f.sphere(-W / 2 - 0.5, 0.35, D / 2 - 0.3, 0.3, 0.38, 0.3, [0.72, 0.4, 0.25])
  f.col(-W / 4, 0, Math.max(D, W) * 0.42)
  f.col(W / 4, 0, Math.max(D, W) * 0.42)
}

function igloo(f: Frame, rng: () => number) {
  const ice: RGB = [0.92, 0.96, 1.0]
  f.sphere(0, 0, 0, 2.7, 1.9, 2.7, ice)
  // brick lines
  for (let i = 0; i < 3; i++) f.cyl(0, 0.35 + i * 0.5, 0, 2.58 - i * 0.55, 0.05, [0.78, 0.86, 0.95])
  // entrance tunnel
  f.box(0, 0.55, 2.55, 1.5, 1.1, 1.4, ice)
  f.sphere(0, 1.05, 2.55, 0.78, 0.5, 0.72, ice)
  f.box(0, 0.5, 3.26, 0.8, 0.9, 0.1, [0.15, 0.2, 0.28])
  f.sphere(0, 0.95, 3.26, 0.42, 0.26, 0.08, [0.15, 0.2, 0.28])
  f.window(-1.7, 1.0, 1.95, 0.3, 0.3, [0.8, 0.88, 0.96])
  // icicles + sled
  for (let i = 0; i < 5; i++) f.cone(-0.5 + i * 0.25, 0.95, 3.1, 0.04, -0.25, [0.8, 0.92, 1], 0, 0.2)
  f.box(2.6, 0.12, 1.2, 0.5, 0.06, 1.3, WOOD)
  f.col(0, 0.6, 2.4)
  if (rng() < 0.5) f.box(2.6, 0.3, 1.2, 0.4, 0.3, 0.6, [0.6, 0.35, 0.3])
}

function aFrameCabin(f: Frame, rng: () => number) {
  const W = 3.6
  const D = 3.6 + rng() * 0.6
  const wood = pickOf(rng, [[0.45, 0.3, 0.2], [0.5, 0.36, 0.24], [0.4, 0.28, 0.2]] as RGB[])
  const snow: RGB = [0.95, 0.97, 1.0]
  f.footing(W + 0.2, D + 0.2, [0.55, 0.55, 0.58], 0.3)
  const rise = 3.2
  const half = W / 2 + 0.1
  const ang = Math.atan2(rise, half)
  const len = Math.hypot(half, rise)
  f.box(-half / 2, rise / 2 + 0.3, 0, len, 0.2, D + 0.4, wood, 0, ang)
  f.box(half / 2, rise / 2 + 0.3, 0, len, 0.2, D + 0.4, wood, 0, -ang)
  f.box(-half / 2 + 0.05, rise / 2 + 0.45, 0, len * 0.96, 0.18, D + 0.5, snow, 0, ang)
  f.box(half / 2 - 0.05, rise / 2 + 0.45, 0, len * 0.96, 0.18, D + 0.5, snow, 0, -ang)
  f.box(0, rise + 0.45, 0, 0.35, 0.3, D + 0.5, snow)
  // front wall (triangle of planks) with door and window
  for (let i = 0; i < 6; i++) {
    const w = W * (1 - (i + 0.5) / 6.4)
    f.box(0, 0.35 + i * 0.5, D / 2 - 0.05, w, 0.52, 0.12, wood)
  }
  f.door(D / 2 + 0.04, 0.85, 1.55, WOOD_DARK)
  f.window(0, 2.5, D / 2 + 0.05, 0.4, 0.4)
  f.box(-W / 2 - 0.1, 0.12, D / 2 + 0.7, 0.2, 0.2, 0.2, [0, 0, 0], 0)
  f.box(0, 0.08, D / 2 + 0.6, 1.5, 0.16, 0.9, WOOD)
  // chimney
  f.box(W / 4, 3.4, -0.7, 0.5, 1.8, 0.5, [0.5, 0.48, 0.46])
  f.box(W / 4, 4.35, -0.7, 0.58, 0.14, 0.58, snow)
  f.col(0, 0, D * 0.38)
  f.col(0, D / 4, D * 0.3)
  f.col(0, -D / 4, D * 0.3)
}

function stiltHut(f: Frame, rng: () => number, swamp = false) {
  const W = 3.2 + rng() * 0.5
  const D = 3.0 + rng() * 0.4
  const wallC: RGB = swamp ? [0.36, 0.32, 0.22] : [0.78, 0.66, 0.38]
  const plank: RGB = swamp ? [0.3, 0.24, 0.16] : [0.62, 0.45, 0.25]
  const roofC: RGB = swamp ? [0.3, 0.38, 0.2] : pickOf(rng, [[0.62, 0.52, 0.22], [0.5, 0.6, 0.24]] as RGB[])
  const PH = swamp ? 0.95 : 0.8
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.cyl(sx * (W / 2 - 0.15), PH / 2 - 0.45, sz * (D / 2 - 0.15), 0.13, PH + 0.9, plank, 0, swamp ? 1 : 0)
  f.box(0, PH, 0, W + 0.5, 0.14, D + 0.5, plank)
  f.box(0, PH + 0.95, 0, W, 1.7, D, wallC)
  for (const x of [-W / 2, W / 2]) f.box(x, PH + 0.95, D / 2 + 0.02, 0.12, 1.7, 0.1, plank)
  // thatch: steep four-sided cone-ish hip roof made of two gables
  gable(f, W, D, PH + 1.8, roofC, wallC, 1.5, 0.7, plank)
  f.door(D / 2 + 0.03, 0.8, 1.4, plank)
  f.window(-W / 2 + 0.7, PH + 1.1, D / 2 + 0.04, 0.4, 0.4, plank)
  // steps + railing
  for (let i = 0; i < 3; i++) f.box(0, 0.12 + i * (PH / 3), D / 2 + 1.5 - i * 0.35, 1.1, 0.1, 0.4, plank)
  f.box(-W / 2 - 0.2, PH + 0.5, D / 2 + 0.2, 0.06, 0.06, 0.7, plank)
  f.sphere(W / 2 - 0.1, PH + 1.6, D / 2 + 0.25, 0.1, 0.1, 0.1, swamp ? [0.6, 1, 0.5] : GLOW, 0, 1.6)
  f.col(0, 0, Math.max(W, D) * 0.5)
}

function stoneChalet(f: Frame, rng: () => number) {
  const W = 4.2 + rng() * 0.6
  const D = 3.4 + rng() * 0.6
  const slate: RGB = pickOf(rng, [[0.32, 0.36, 0.44], [0.38, 0.4, 0.46], [0.28, 0.3, 0.36]] as RGB[])
  const stone: RGB = [0.58, 0.56, 0.52]
  f.footing(W + 0.3, D + 0.3, stone, 0.3)
  // fitted-stone lower storey
  for (let i = 0; i < 4; i++) f.box(0, 0.25 + i * 0.35, 0, W, 0.33, D, i % 2 ? [0.6, 0.57, 0.53] : [0.52, 0.5, 0.47])
  // timber upper storey
  f.box(0, 2.15, 0, W - 0.2, 1.2, D - 0.2, [0.82, 0.76, 0.64])
  for (const x of [-W / 2 + 0.1, 0, W / 2 - 0.1]) f.box(x, 2.15, D / 2 - 0.08, 0.14, 1.2, 0.1, WOOD_DARK)
  f.box(0, 1.55, D / 2 - 0.08, W - 0.1, 0.12, 0.12, WOOD_DARK)
  gable(f, W - 0.2, D - 0.2, 2.75, slate, [0.82, 0.76, 0.64], 1.7, 0.6, WOOD_DARK)
  f.door(D / 2 + 0.02, 0.9, 1.5, WOOD_DARK)
  f.window(-W / 2 + 0.8, 0.9, D / 2 + 0.03, 0.4, 0.45, [0.4, 0.4, 0.42])
  f.window(W / 2 - 0.8, 0.9, D / 2 + 0.03, 0.4, 0.45, [0.4, 0.4, 0.42])
  f.window(0, 2.15, D / 2 - 0.05, 0.45, 0.5, WOOD_DARK)
  // balcony
  f.box(0, 1.6, D / 2 + 0.4, W - 0.8, 0.1, 0.8, WOOD)
  f.box(0, 1.9, D / 2 + 0.78, W - 0.8, 0.05, 0.05, WOOD)
  f.box(W / 2 - 0.6, 3.6, -0.5, 0.7, 2.2, 0.7, [0.5, 0.48, 0.45])
  f.col(-W / 4, 0, Math.max(D, W) * 0.42)
  f.col(W / 4, 0, Math.max(D, W) * 0.42)
}

function crystalSpire(f: Frame, rng: () => number, n = 3, big = 1) {
  const cols: RGB[] = [[0.55, 0.45, 1], [0.4, 0.9, 1], [1, 0.5, 0.85]]
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng()
    const r = 0.25 + rng() * 0.3
    f.cone(Math.cos(a) * r, 0, Math.sin(a) * r, 0.2 * big, (1.0 + rng() * 1.2) * big, cols[i % 3], 0, 1.3)
  }
}

function crystalHouse(f: Frame, rng: () => number) {
  if (rng() < 0.5) {
    mushroomHouse(f, rng, 0.55)
    for (let i = 0; i < 3; i++) {
      const a = rng() * Math.PI * 2
      const [x, z] = f.p(Math.cos(a) * 2.9, Math.sin(a) * 2.9)
      crystalSpire(new Frame(f.c, x, z, 0), rng, 3, 0.8)
    }
  } else towerHouse(f, rng, [0.5, 0.32, 0.75], true)
}

function windmill(f: Frame) {
  f.cone(0, 0, 0, 1.9, 5.0, [0.86, 0.8, 0.68])
  f.cyl(0, 0.2, 0, 2.1, 0.4, [0.55, 0.52, 0.46])
  f.cone(0, 4.6, 0, 1.4, 1.9, [0.55, 0.3, 0.2])
  f.door(1.55, 0.8, 1.4)
  f.window(0, 2.6, 1.0, 0.3, 0.4)
  f.cyl(0, 4.3, 1.2, 0.2, 0.5, WOOD)
  const [hx, hz] = f.p(0, 1.55)
  const hy = f.gy + 4.2
  const spin = 0.35
  for (let k = 0; k < 2; k++) {
    f.c.box(hx, hy, hz, 0.35, 5.2, 0.06, f.Y, [0.85, 0.82, 0.74], 0, 0, 0, spin + (k * Math.PI) / 2)
    f.c.box(hx, hy, hz, 0.1, 5.2, 0.12, f.Y, WOOD, 0, 0, 0, spin + (k * Math.PI) / 2)
  }
  f.sphere(0, 4.2, 1.55, 0.2, 0.2, 0.2, WOOD_DARK)
  f.col(0, 0, 1.9)
}

function watchtower(f: Frame) {
  const stone: RGB = [0.55, 0.53, 0.5]
  f.footing(3.2, 3.2, stone, 0.4)
  for (let i = 0; i < 9; i++) f.box(0, 0.5 + i * 0.5, 0, 2.6 - i * 0.04, 0.48, 2.6 - i * 0.04, i % 2 ? [0.58, 0.56, 0.52] : [0.5, 0.48, 0.45])
  f.box(0, 5.1, 0, 3.3, 0.25, 3.3, WOOD)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.cyl(sx * 1.5, 5.7, sz * 1.5, 0.08, 1.2, WOOD)
  f.box(0, 5.5, 1.5, 3.2, 0.08, 0.08, WOOD)
  f.cone(0, 6.3, 0, 2.3, 1.6, [0.3, 0.34, 0.42])
  f.door(1.28, 0.8, 1.4, WOOD_DARK)
  f.window(0, 3.4, 1.3, 0.3, 0.45, WOOD_DARK)
  f.sphere(0, 6.2, 1.5, 0.12, 0.12, 0.12, GLOW, 0, 2)
  f.col(0, 0, 1.9)
}

// ---- plaza centrepieces + small props --------------------------------------------------------
function well(f: Frame, moss = 0) {
  f.cyl(0, 0.45, 0, 1.15, 0.9, [0.62, 0.58, 0.5], 0, moss)
  f.cyl(0, 0.92, 0, 0.9, 0.06, [0.2, 0.45, 0.55], 0.6)
  for (const s of [-1, 1]) f.box(s * 1.0, 1.6, 0, 0.12, 1.5, 0.12, WOOD)
  f.box(0, 2.45, 0, 2.3, 0.12, 0.12, WOOD)
  f.cone(0, 2.5, 0, 1.5, 0.85, ROOFS[0])
  f.col(0, 0, 1.2)
}

function bonfire(f: Frame) {
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2
    f.box(Math.cos(a) * 1.25, 0.18, Math.sin(a) * 1.25, 0.5, 0.36, 0.42, STONE_GREY)
  }
  for (let i = 0; i < 4; i++) f.log(0, 0.35 + (i % 2) * 0.15, 0, 0.12, 1.5, LOG_B, (i / 4) * Math.PI)
  f.cyl(0, 0.42, 0, 0.8, 0.1, [1, 0.45, 0.12], 1.4)
  f.cone(0, 0.45, 0, 0.45, 1.2, [1, 0.6, 0.15], 0, 1.8)
  f.cone(0, 0.6, 0, 0.26, 1.7, [1, 0.85, 0.3], 0, 2.2)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    f.log(Math.cos(a) * 2.7, 0.22, Math.sin(a) * 2.7, 0.22, 1.8, LOG_A, a + Math.PI / 2)
  }
  f.col(0, 0, 1.1)
}

function oasis(f: Frame, rng: () => number) {
  f.cyl(0, 0.08, 0, 3.4, 0.16, [0.85, 0.72, 0.5])
  f.cyl(0, 0.16, 0, 2.7, 0.1, [0.25, 0.6, 0.72], 0.7)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    f.sphere(Math.cos(a) * 2.8, 0.2, Math.sin(a) * 2.8, 0.4, 0.28, 0.4, [0.7, 0.62, 0.48])
  }
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.6
    const px = Math.cos(a) * 2.4
    const pz = Math.sin(a) * 2.4
    f.log(px, 1.5, pz, 0.14, 3.0, [0.52, 0.4, 0.26], 0)
    f.cyl(px, 1.5, pz, 0.14, 3.0, [0.52, 0.4, 0.26])
    for (let l = 0; l < 6; l++) {
      const b = (l / 6) * Math.PI * 2
      f.sphere(px + Math.cos(b) * 0.7, 3.05, pz + Math.sin(b) * 0.7, 0.62, 0.1, 0.22, [0.22, 0.5, 0.22], 0, 0)
    }
    f.col(px, pz, 0.35)
  }
  f.col(0, 0, 2.6)
}

function totem(f: Frame) {
  const cols: RGB[] = [[0.7, 0.25, 0.2], [0.2, 0.55, 0.55], [0.9, 0.7, 0.2], [0.5, 0.3, 0.6]]
  f.cyl(0, 0.3, 0, 1.0, 0.6, STONE_GREY)
  for (let i = 0; i < 4; i++) {
    f.cyl(0, 1.0 + i * 0.8, 0, 0.42, 0.78, cols[i])
    f.box(0, 1.0 + i * 0.8, 0.4, 0.5, 0.22, 0.12, [0.1, 0.07, 0.05])
    f.sphere(-0.15, 1.12 + i * 0.8, 0.4, 0.06, 0.06, 0.04, GLOW, 0, 1.4)
    f.sphere(0.15, 1.12 + i * 0.8, 0.4, 0.06, 0.06, 0.04, GLOW, 0, 1.4)
  }
  f.cone(0, 4.2, 0, 0.5, 0.7, [0.9, 0.3, 0.2])
  f.cyl(0, 0.62, 0, 1.15, 0.1, [1, 0.5, 0.15], 1.2)
  f.col(0, 0, 1.1)
}

function crystalFountain(f: Frame, rng: () => number) {
  f.cyl(0, 0.3, 0, 2.2, 0.6, [0.7, 0.66, 0.82])
  f.cyl(0, 0.62, 0, 1.9, 0.06, [0.45, 0.7, 1.0], 0.8, 0)
  f.cyl(0, 1.0, 0, 0.55, 1.4, [0.66, 0.6, 0.8])
  const cols: RGB[] = [[0.55, 0.45, 1], [0.4, 0.9, 1], [1, 0.5, 0.85]]
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    f.cone(Math.cos(a) * 0.5, 1.5, Math.sin(a) * 0.5, 0.2, 1.1 + rng() * 0.8, cols[i % 3], 0, 1.5)
  }
  f.cone(0, 1.6, 0, 0.3, 2.2, cols[1], 0, 1.8)
  f.col(0, 0, 2.2)
}

function obelisk(f: Frame) {
  f.cyl(0, 0.3, 0, 1.6, 0.6, [0.5, 0.48, 0.45])
  f.box(0, 1.1, 0, 1.0, 1.0, 1.0, [0.56, 0.54, 0.5])
  f.box(0, 2.3, 0, 0.8, 1.4, 0.8, [0.6, 0.58, 0.54])
  f.cone(0, 3.0, 0, 0.58, 1.3, [0.64, 0.62, 0.58])
  for (let i = 0; i < 3; i++) f.box(0, 1.9 + i * 0.5, 0.42, 0.28, 0.1, 0.06, [0.5, 0.9, 1], 1.5)
  f.col(0, 0, 1.3)
}

function lamp(f: Frame, kind: 'post' | 'torch' | 'crystal' | 'lantern' = 'post', tint: RGB = [1.0, 0.82, 0.4]) {
  if (kind === 'torch') {
    f.cyl(0, 0.9, 0, 0.07, 1.8, WOOD)
    f.cyl(0, 1.85, 0, 0.16, 0.2, WOOD_DARK)
    f.cone(0, 1.9, 0, 0.18, 0.5, [1, 0.6, 0.15], 0, 2.0)
  } else if (kind === 'crystal') {
    f.cyl(0, 0.9, 0, 0.08, 1.8, [0.55, 0.52, 0.65])
    f.cone(0, 1.75, 0, 0.18, 0.7, tint, 0, 2.0)
  } else if (kind === 'lantern') {
    f.cyl(0, 0.9, 0, 0.07, 1.8, WOOD)
    f.box(0.18, 1.8, 0, 0.36, 0.05, 0.05, WOOD)
    f.sphere(0.36, 1.6, 0, 0.17, 0.22, 0.17, tint, 0, 1.8)
  } else {
    f.cyl(0, 1.0, 0, 0.06, 2.0, WOOD_DARK)
    f.box(0, 2.15, 0, 0.3, 0.34, 0.3, tint, 2.0)
    f.cone(0, 2.32, 0, 0.26, 0.2, WOOD_DARK)
  }
  f.col(0, 0, 0.12)
}

function stall(f: Frame, rng: () => number, cloth?: RGB[]) {
  const a = pickOf(rng, cloth ?? ROOFS)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.cyl(sx * 1.2, 1.0, sz * 0.8, 0.07, 2.0, WOOD)
  for (let i = 0; i < 6; i++) f.box(-1.0 + i * 0.4, 2.1 + 0.02, 0, 0.4, 0.07, 2.1, i % 2 ? [0.95, 0.92, 0.85] : a, 0, 0.18)
  f.box(0, 0.5, 0.35, 2.3, 0.9, 0.7, WOOD)
  const goods: RGB[] = [[0.9, 0.2, 0.15], [0.95, 0.75, 0.2], [0.4, 0.7, 0.25], [0.8, 0.45, 0.2]]
  for (let i = 0; i < 6; i++) f.sphere(-0.9 + i * 0.36, 1.05, 0.35, 0.13, 0.13, 0.13, pickOf(rng, goods))
  f.box(-1.5, 0.3, -0.6, 0.5, 0.6, 0.5, WOOD_DARK)
  f.col(0, 0.35, 1.3)
}

// ---- fences and walls ------------------------------------------------------------------------
type FenceKind = 'picket' | 'palisade' | 'stone' | 'adobe' | 'bamboo' | 'reed' | 'hedge' | 'snowstone'
interface Seg { c: Ctx; x0: number; z0: number; x1: number; z1: number; mx: number; mz: number; len: number; yaw: number; g0: number; g1: number; gm: number; i: number; rng: () => number }

const FENCES: Record<FenceKind, (s: Seg) => void> = {
  picket(s) {
    const { c, x0, z0, mx, mz, len, yaw, g0, gm } = s
    c.cyl(x0, g0 + 0.5, z0, 0.07, 1.0, WOOD_DARK, 0)
    c.cone(x0, g0 + 1.0, z0, 0.09, 0.14, WOOD_DARK)
    c.box(mx, gm + 0.35, mz, len, 0.08, 0.06, yaw, WOOD, 0)
    c.box(mx, gm + 0.7, mz, len, 0.08, 0.06, yaw, WOOD, 0)
    const dx = (s.x1 - x0) / len
    const dz = (s.z1 - z0) / len
    for (let k = 1; k <= 3; k++) {
      const t = (k / 4) * len
      const px = x0 + dx * t
      const pz = z0 + dz * t
      const hh = 0.68 + (k % 2) * 0.06
      c.box(px, gm + hh / 2 + 0.05, pz, 0.1, hh, 0.05, yaw, [0.62, 0.48, 0.3], 0)
    }
  },
  palisade(s) {
    const { c, x0, z0, x1, z1, len, g0 } = s
    const dx = (x1 - x0) / len
    const dz = (z1 - z0) / len
    for (let k = 0; k < 2; k++) {
      const t = k * 0.65
      const px = x0 + dx * t
      const pz = z0 + dz * t
      const g = heightAt(px, pz)
      const h = 2.1 + s.rng() * 0.35
      c.cyl(px, g + h / 2 - 0.1, pz, 0.17, h, k ? LOG_A : LOG_B, 0)
      c.cone(px, g + h - 0.1, pz, 0.17, 0.4, k ? LOG_A : LOG_B)
    }
    c.box(s.mx, s.gm + 1.2, s.mz, len, 0.1, 0.08, s.yaw, [0.62, 0.5, 0.3], 0)
    c.box(s.mx, s.gm + 0.55, s.mz, len, 0.1, 0.08, s.yaw, [0.62, 0.5, 0.3], 0)
    void g0
  },
  stone(s) {
    const { c, mx, mz, len, yaw, gm } = s
    const h = 1.15 + (s.i % 3) * 0.06
    c.box(mx, gm + h / 2 - 0.2, mz, len + 0.04, h + 0.4, 0.62, yaw, c.stone(), 1)
    c.box(mx, gm + h + 0.08, mz, len + 0.08, 0.16, 0.78, yaw, [0.5, 0.48, 0.45], 1)
    if (s.i % 4 === 0) c.box(mx, gm + h + 0.35, mz, 0.3, 0.5, 0.3, yaw, [0.55, 0.53, 0.5], 1)
  },
  snowstone(s) {
    FENCES.stone(s)
    const { c, mx, mz, len, yaw, gm } = s
    c.box(mx, gm + 1.38, mz, len + 0.1, 0.18, 0.7, yaw, [0.95, 0.97, 1.0], 0)
  },
  adobe(s) {
    const { c, mx, mz, len, yaw, gm } = s
    c.box(mx, gm + 0.75, mz, len + 0.04, 2.1, 0.6, yaw, [0.88, 0.74, 0.5], 0)
    // crenellation blocks on every other segment
    if (s.i % 2 === 0) c.box(mx, gm + 1.95, mz, len * 0.55, 0.4, 0.62, yaw, [0.9, 0.78, 0.55], 0)
    c.box(mx, gm + 0.2, mz, len + 0.04, 0.5, 0.7, yaw, [0.72, 0.6, 0.42], 0)
    if (s.i % 6 === 0) {
      c.cyl(s.x0, s.g0 + 1.3, s.z0, 0.5, 2.8, [0.86, 0.72, 0.48], 0)
      c.sphere(s.x0, s.g0 + 2.75, s.z0, 0.55, 0.4, 0.55, [0.9, 0.78, 0.55], 0, 0)
    }
  },
  bamboo(s) {
    const { c, x0, z0, x1, z1, len, yaw, gm } = s
    const dx = (x1 - x0) / len
    const dz = (z1 - z0) / len
    for (let k = 0; k < 3; k++) {
      const t = (k / 3) * len + 0.1
      const px = x0 + dx * t
      const pz = z0 + dz * t
      const g = heightAt(px, pz)
      const h = 1.5 + ((s.i + k) % 3) * 0.18
      c.cyl(px, g + h / 2 - 0.1, pz, 0.07, h, k % 2 ? [0.6, 0.72, 0.3] : [0.7, 0.78, 0.38], 0)
    }
    c.box(s.mx, gm + 0.5, s.mz, len, 0.07, 0.06, yaw, [0.45, 0.32, 0.18], 0)
    c.box(s.mx, gm + 1.05, s.mz, len, 0.07, 0.06, yaw, [0.45, 0.32, 0.18], 0)
  },
  reed(s) {
    const { c, x0, z0, x1, z1, len, yaw, gm } = s
    const dx = (x1 - x0) / len
    const dz = (z1 - z0) / len
    for (let k = 0; k < 3; k++) {
      const t = (k / 3) * len + 0.15
      const px = x0 + dx * t
      const pz = z0 + dz * t
      const g = heightAt(px, pz)
      c.cone(px, g - 0.1, pz, 0.2, 1.4 + ((s.i + k) % 3) * 0.2, k % 2 ? [0.55, 0.58, 0.28] : [0.45, 0.5, 0.24], 0.5)
    }
    c.box(s.mx, gm + 0.55, s.mz, len, 0.07, 0.06, yaw, WOOD_DARK, 1)
    if (s.i % 3 === 0) c.cyl(x0, s.g0 + 0.85, z0, 0.08, 1.7, WOOD_DARK, 1)
  },
  hedge(s) {
    const { c, mx, mz, len, gm } = s
    c.sphere(mx, gm + 0.5, mz, len * 0.62, 0.62, 0.62, [0.22 + (s.i % 3) * 0.03, 0.4, 0.34], 0, 0.15)
    if (s.i % 4 === 0) {
      const cols: RGB[] = [[0.55, 0.45, 1], [0.4, 0.9, 1], [1, 0.5, 0.85]]
      c.cone(mx, gm + 0.6, mz, 0.16, 1.1 + s.rng() * 0.6, cols[(s.i / 4) % 3 | 0], 0, 1.4)
    }
  },
}

/** Ring fence/wall of short straight segments that follow the terrain, with gate gaps at the given angles. */
function ringFence(c: Ctx, cx: number, cz: number, R: number, kind: FenceKind, gates: number[], gateHalf: number, step: number) {
  const n = Math.round((Math.PI * 2 * R) / step)
  const rng = mulberry32(c.site.seed + 4401)
  const colR = kind === 'hedge' ? 0.8 : kind === 'adobe' || kind === 'stone' || kind === 'snowstone' ? 0.85 : 0.7
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2
    const a1 = ((i + 1) / n) * Math.PI * 2
    const am = (a0 + a1) / 2
    if (gates.some((g) => Math.abs(Math.atan2(Math.sin(am - g), Math.cos(am - g))) < gateHalf)) continue
    const x0 = cx + Math.cos(a0) * R
    const z0 = cz + Math.sin(a0) * R
    const x1 = cx + Math.cos(a1) * R
    const z1 = cz + Math.sin(a1) * R
    const mx = (x0 + x1) / 2
    const mz = (z0 + z1) / 2
    const len = Math.hypot(x1 - x0, z1 - z0)
    const yaw = Math.atan2(-(z1 - z0), x1 - x0)
    FENCES[kind]({ c, x0, z0, x1, z1, mx, mz, len, yaw, g0: heightAt(x0, z0), g1: heightAt(x1, z1), gm: heightAt(mx, mz), i, rng })
    c.col(mx, mz, colR)
  }
}

/** Two posts, a lintel and a hanging lantern flanking a gate gap at angle `a`. */
function gate(c: Ctx, cx: number, cz: number, R: number, a: number, gateHalf: number, tall: number, post: RGB, lintel: RGB, glow: RGB) {
  const side = Math.PI / 2
  const gx = cx + Math.cos(a) * R
  const gz = cz + Math.sin(a) * R
  const hw = gateHalf * R
  const tx = -Math.sin(a)
  const tz = Math.cos(a)
  const f = new Frame(c, gx, gz, Math.atan2(-tz, tx) + side)
  // local x now runs along the radius; use world offsets directly for the posts
  for (const s of [-1, 1]) {
    const px = gx + tx * hw * s
    const pz = gz + tz * hw * s
    const g = heightAt(px, pz)
    c.cyl(px, g + tall / 2 - 0.1, pz, 0.22, tall, post, 0)
    c.sphere(px, g + tall, pz, 0.28, 0.2, 0.28, lintel, 0, 0)
    c.col(px, pz, 0.35)
  }
  const gy = heightAt(gx, gz)
  c.box(gx, gy + tall - 0.1, gz, hw * 2 + 0.5, 0.2, 0.22, Math.atan2(-tz, tx), lintel, 0)
  c.sphere(gx, gy + tall - 0.55, gz, 0.12, 0.16, 0.12, glow, 0, 2.0)
  void f
}

// ---- village styles --------------------------------------------------------------------------
interface VStyle {
  houses: ((f: Frame, r: () => number) => void)[]
  floor: RGB
  floor2: RGB
  path: RGB
  centre: (f: Frame, r: () => number) => void
  lamp: Parameters<typeof lamp>[1]
  lampTint?: RGB
  fence: FenceKind
  gateTall: number
  gatePost: RGB
  gateLintel: RGB
  stalls?: RGB[]
  windmill?: boolean
  tower?: boolean
  yard: 'barrel' | 'hay' | 'crate' | 'pots'
}

const STYLES: Record<number, VStyle> = {
  [B.Grass]: {
    houses: [mushroomHouse, thatchCottage, towerHouse, hobbitHole, thatchCottage, mushroomHouse, towerHouse],
    floor: [0.76, 0.66, 0.46], floor2: [0.7, 0.62, 0.5], path: [0.76, 0.66, 0.46],
    centre: (f) => well(f), lamp: 'post', fence: 'picket', gateTall: 2.3, gatePost: WOOD_DARK, gateLintel: WOOD, windmill: true, yard: 'hay',
  },
  [B.Forest]: {
    houses: [logCabin, logCabin, logCabin, thatchCottage, towerHouse, logCabin, hobbitHole],
    floor: [0.52, 0.4, 0.26], floor2: [0.46, 0.36, 0.24], path: [0.5, 0.4, 0.26],
    centre: (f) => bonfire(f), lamp: 'torch', fence: 'palisade', gateTall: 3.0, gatePost: LOG_B, gateLintel: LOG_A, stalls: [[0.2, 0.42, 0.25], [0.5, 0.3, 0.15]], yard: 'barrel',
  },
  [B.Desert]: {
    houses: [adobeHouse, adobeHouse, adobeHouse, adobeHouse, adobeHouse, adobeHouse, adobeHouse],
    floor: [0.88, 0.76, 0.52], floor2: [0.82, 0.68, 0.46], path: [0.84, 0.72, 0.5],
    centre: (f, r) => oasis(f, r), lamp: 'lantern', lampTint: [1, 0.7, 0.3], fence: 'adobe', gateTall: 3.2, gatePost: [0.86, 0.72, 0.48], gateLintel: [0.9, 0.78, 0.55], stalls: CLOTH, yard: 'pots',
  },
  [B.Snow]: {
    houses: [aFrameCabin, igloo, aFrameCabin, igloo, aFrameCabin, igloo, aFrameCabin],
    floor: [0.86, 0.9, 0.95], floor2: [0.8, 0.86, 0.92], path: [0.78, 0.84, 0.9],
    centre: (f) => bonfire(f), lamp: 'torch', fence: 'snowstone', gateTall: 2.6, gatePost: [0.55, 0.55, 0.58], gateLintel: [0.95, 0.97, 1], stalls: [[0.3, 0.5, 0.75], [0.8, 0.8, 0.9]], yard: 'crate',
  },
  [B.Tropical]: {
    houses: [stiltHut, stiltHut, stiltHut, stiltHut, mushroomHouse, stiltHut, stiltHut],
    floor: [0.9, 0.82, 0.58], floor2: [0.84, 0.74, 0.5], path: [0.86, 0.78, 0.55],
    centre: (f) => totem(f), lamp: 'lantern', lampTint: [1, 0.6, 0.35], fence: 'bamboo', gateTall: 2.8, gatePost: [0.6, 0.7, 0.3], gateLintel: [0.7, 0.55, 0.3], stalls: [[0.9, 0.3, 0.3], [0.2, 0.65, 0.5], [0.95, 0.75, 0.2]], yard: 'pots',
  },
  [B.Swamp]: {
    houses: [(f, r) => stiltHut(f, r, true), (f, r) => stiltHut(f, r, true), (f, r) => stiltHut(f, r, true), (f, r) => stiltHut(f, r, true), hobbitHole, (f, r) => stiltHut(f, r, true), (f, r) => stiltHut(f, r, true)],
    floor: [0.42, 0.38, 0.26], floor2: [0.38, 0.35, 0.25], path: [0.4, 0.34, 0.22],
    centre: (f) => well(f, 1), lamp: 'lantern', lampTint: [0.6, 1, 0.5], fence: 'reed', gateTall: 2.4, gatePost: WOOD_DARK, gateLintel: [0.4, 0.3, 0.2], stalls: [[0.3, 0.4, 0.25], [0.4, 0.3, 0.2]], yard: 'barrel',
  },
  [B.Mountain]: {
    houses: [stoneChalet, stoneChalet, stoneChalet, towerHouse, stoneChalet, stoneChalet, stoneChalet],
    floor: [0.6, 0.58, 0.54], floor2: [0.54, 0.52, 0.5], path: [0.58, 0.56, 0.52],
    centre: (f) => obelisk(f), lamp: 'post', lampTint: [1, 0.85, 0.5], fence: 'stone', gateTall: 3.0, gatePost: [0.52, 0.5, 0.47], gateLintel: [0.58, 0.56, 0.52], stalls: [[0.35, 0.4, 0.5], [0.6, 0.35, 0.25]], tower: true, yard: 'crate',
  },
  [B.Magical]: {
    houses: [crystalHouse, crystalHouse, crystalHouse, crystalHouse, crystalHouse, crystalHouse, crystalHouse],
    floor: [0.7, 0.62, 0.82], floor2: [0.62, 0.55, 0.78], path: [0.66, 0.6, 0.8],
    centre: (f, r) => crystalFountain(f, r), lamp: 'crystal', lampTint: [0.6, 0.95, 1], fence: 'hedge', gateTall: 2.8, gatePost: [0.7, 0.66, 0.82], gateLintel: [0.55, 0.45, 1], stalls: [[0.55, 0.3, 0.8], [0.3, 0.7, 0.8]], yard: 'pots',
  },
}

function yardProp(c: Ctx, st: VStyle, x: number, z: number, rng: () => number) {
  const bf = new Frame(c, x, z, rng() * 6)
  switch (st.yard) {
    case 'barrel':
      bf.cyl(0, 0.35, 0, 0.32, 0.7, WOOD)
      bf.cyl(0.7, 0.2, 0.2, 0.28, 0.4, WOOD_DARK)
      bf.col(0.3, 0.1, 0.7)
      break
    case 'hay':
      bf.box(0, 0.3, 0, 0.7, 0.6, 0.6, [0.88, 0.76, 0.35])
      bf.box(0.8, 0.25, 0.1, 0.6, 0.5, 0.6, [0.84, 0.72, 0.32])
      bf.col(0.4, 0.05, 0.8)
      break
    case 'crate':
      bf.box(0, 0.3, 0, 0.7, 0.6, 0.7, WOOD)
      bf.box(0.1, 0.8, 0, 0.5, 0.4, 0.5, WOOD_DARK)
      bf.col(0.1, 0, 0.55)
      break
    default:
      bf.sphere(0, 0.35, 0, 0.3, 0.38, 0.3, [0.72, 0.4, 0.25])
      bf.sphere(0.65, 0.25, 0.2, 0.22, 0.28, 0.22, [0.6, 0.35, 0.22])
      bf.col(0.3, 0.1, 0.6)
  }
}

function village(c: Ctx) {
  const rng = c.rng
  const cx = c.site.x
  const cz = c.site.z
  const biome = biomeAt(cx, cz)
  const st = STYLES[biome] ?? STYLES[B.Grass]
  const plaza = new Frame(c, cx, cz, c.yaw)
  // plaza: two stacked discs, then the centrepiece
  c.cyl(cx, plaza.gy + 0.04, cz, 5.8, 0.1, st.floor, 0)
  c.cyl(cx, plaza.gy + 0.07, cz, 3.4, 0.1, st.floor2, 0)
  st.centre(plaza, rng)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    lamp(new Frame(c, cx + Math.cos(a) * 4.8, cz + Math.sin(a) * 4.8, 0), st.lamp, st.lampTint)
  }

  // houses around the plaza, each turned so its door faces the centre
  const n = 7
  const start = rng() * Math.PI * 2
  const order = st.houses.slice(0, n)
  const angles: number[] = []
  for (let i = 0; i < n; i++) {
    const a = start + (i / n) * Math.PI * 2 + (rng() - 0.5) * 0.12
    angles.push(a)
    const r = 10.8 + rng() * 1.8
    const hx = cx + Math.cos(a) * r
    const hz = cz + Math.sin(a) * r
    const f = new Frame(c, hx, hz, Math.atan2(cx - hx, cz - hz))
    order[i](f, rng)
    // path from plaza to door
    for (let s = 0; s < 4; s++) {
      const t = 0.18 + s * 0.15
      const px = cx + (hx - cx) * (1 - t)
      const pz = cz + (hz - cz) * (1 - t)
      c.cyl(px, heightAt(px, pz) + 0.05, pz, 0.9, 0.08, st.path, 0)
    }
    yardProp(c, st, hx + Math.cos(a + 0.55) * 3.1, hz + Math.sin(a + 0.55) * 3.1, rng)
  }

  // gaps between neighbouring houses: stalls on the plaza rim, a landmark on the outskirts, gates in the fence
  const mid = (i: number) => (angles[i % n] + angles[(i + 1) % n] + (i % n === n - 1 ? Math.PI * 2 : 0)) / 2
  for (const k of [2, 4]) {
    const a = mid(k)
    stall(new Frame(c, cx + Math.cos(a) * 6.4, cz + Math.sin(a) * 6.4, Math.atan2(-Math.cos(a), -Math.sin(a))), rng, st.stalls)
  }
  const outer = mid(1)
  if (st.windmill) windmill(new Frame(c, cx + Math.cos(outer) * 15.6, cz + Math.sin(outer) * 15.6, Math.atan2(-Math.cos(outer), -Math.sin(outer))))
  if (st.tower) watchtower(new Frame(c, cx + Math.cos(outer) * 15.2, cz + Math.sin(outer) * 15.2, Math.atan2(-Math.cos(outer), -Math.sin(outer))))

  const R = 18.4
  const gateAngles = [mid(0), mid(3), mid(5)]
  const gateHalf = 1.7 / R
  ringFence(c, cx, cz, R, st.fence, gateAngles, gateHalf, 1.3)
  for (const a of gateAngles) {
    gate(c, cx, cz, R, a, gateHalf, st.gateTall, st.gatePost, st.gateLintel, st.lampTint ?? LAMP)
    // road from the plaza rim out through the gate
    for (let d = 7; d < R + 2.5; d += 1.4) {
      const px = cx + Math.cos(a) * d
      const pz = cz + Math.sin(a) * d
      c.cyl(px, heightAt(px, pz) + 0.05, pz, 0.85, 0.08, st.path, 0)
    }
  }
}

// ------------------------------------------------------------------------------------------------ camp
/** The spawn camp: a fire ring with log seats, a canvas tent, a statue of the hero and a signpost. */
function camp(c: Ctx) {
  const cx = c.site.x
  const cz = c.site.z
  const rng = c.rng
  const gy = heightAt(cx, cz)
  c.cyl(cx, gy + 0.04, cz, 7.2, 0.1, [0.52, 0.42, 0.3], 0)
  c.cyl(cx, gy + 0.07, cz, 4.6, 0.1, [0.46, 0.37, 0.26], 0)
  const fire = new Frame(c, cx, cz, c.yaw)
  // fire ring (the animated flames live in CampFire.tsx)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    fire.box(Math.cos(a) * 1.1, 0.16, Math.sin(a) * 1.1, 0.46, 0.32, 0.4, i % 2 ? [0.55, 0.53, 0.5] : [0.46, 0.44, 0.42])
  }
  fire.cyl(0, 0.12, 0, 0.85, 0.1, [0.12, 0.08, 0.06])
  fire.cyl(0, 0.2, 0, 0.55, 0.06, [1, 0.45, 0.1], 1.6)
  for (let i = 0; i < 3; i++) fire.log(0, 0.3 + i * 0.1, 0, 0.1, 1.4, LOG_B, (i / 3) * Math.PI)
  fire.col(0, 0, 1.3)
  // log seats around the fire (the tent side stays open)
  for (const a of [Math.PI * 0.55, Math.PI * 1.05, Math.PI * 1.5, Math.PI * 0.05]) {
    fire.log(Math.cos(a) * 2.9, 0.24, Math.sin(a) * 2.9, 0.24, 1.9, LOG_A, a + Math.PI / 2)
    fire.col(Math.cos(a) * 2.9, Math.sin(a) * 2.9, 0.7)
  }

  // tent: A-frame canvas with an open front, facing the fire
  const ta = Math.PI * 1.25 + 0.2
  const tx = cx + Math.cos(ta) * 5.4
  const tz = cz + Math.sin(ta) * 5.4
  const t = new Frame(c, tx, tz, Math.atan2(cx - tx, cz - tz))
  const W = 3.0
  const D = 3.6
  const rise = 2.3
  const half = W / 2
  const ang = Math.atan2(rise, half)
  const len = Math.hypot(half, rise)
  const canvas: RGB = [0.93, 0.86, 0.68]
  const stripe: RGB = [0.78, 0.25, 0.2]
  for (const side of [-1, 1]) {
    t.box(side * half / 2, rise / 2 + 0.05, 0, len, 0.1, D + 0.3, canvas, 0, -side * ang)
    for (let i = 0; i < 3; i++) t.box(side * half / 2, rise / 2 + 0.07, -D / 3 + i * (D / 3), len * 0.98, 0.11, 0.35, stripe, 0, -side * ang)
  }
  t.box(0, rise + 0.1, 0, 0.14, 0.14, D + 0.6, WOOD)
  for (const sz of [-1, 1]) t.cyl(0, (rise + 0.1) / 2, sz * (D / 2 + 0.25), 0.05, rise + 0.1, WOOD)
  // back panel + dark interior + bedroll
  for (let i = 0; i < 5; i++) t.box(0, 0.3 + i * 0.42, -D / 2 + 0.02, W * (1 - (i + 0.4) / 5.2), 0.45, 0.08, canvas)
  t.box(0, 0.06, 0, W - 0.2, 0.1, D - 0.2, [0.2, 0.15, 0.12])
  t.box(-0.45, 0.2, -0.3, 0.8, 0.22, 2.0, [0.3, 0.45, 0.55])
  t.sphere(-0.45, 0.35, -1.15, 0.3, 0.15, 0.2, [0.95, 0.92, 0.85])
  t.col(0, 0, 1.55)
  // supplies by the tent
  t.box(2.2, 0.3, 1.2, 0.6, 0.6, 0.6, WOOD)
  t.box(2.35, 0.8, 1.2, 0.45, 0.4, 0.45, WOOD_DARK)
  t.cyl(2.2, 0.35, 0.3, 0.3, 0.7, WOOD)
  t.col(2.2, 0.8, 0.8)

  // statue of the hero on a stepped plinth
  const sa = Math.PI * 0.1 - 0.25
  const sx = cx + Math.cos(sa) * 5.6
  const sz = cz + Math.sin(sa) * 5.6
  const s = new Frame(c, sx, sz, Math.atan2(cx - sx, cz - sz))
  const stone: RGB = [0.66, 0.64, 0.6]
  s.box(0, 0.2, 0, 2.2, 0.5, 2.2, [0.55, 0.53, 0.5])
  s.box(0, 0.65, 0, 1.6, 0.5, 1.6, stone)
  s.box(0, 1.05, 0, 1.2, 0.35, 1.2, [0.6, 0.58, 0.55])
  s.sphere(0, 1.75, 0, 0.62, 0.78, 0.55, [0.88, 0.88, 0.86])
  s.sphere(0, 2.48, 0, 0.62, 0.18, 0.62, [0.62, 0.52, 0.3])
  s.cone(0, 2.5, 0, 0.62, 0.3, [0.7, 0.58, 0.32])
  s.sphere(-0.2, 1.95, 0.5, 0.05, 0.07, 0.04, [0.2, 0.2, 0.22])
  s.sphere(0.2, 1.95, 0.5, 0.05, 0.07, 0.04, [0.2, 0.2, 0.22])
  // katana planted point-down in front, hands resting on the hilt
  s.box(0, 1.55, 0.62, 0.07, 1.5, 0.05, [0.82, 0.86, 0.9])
  s.box(0, 2.3, 0.62, 0.34, 0.06, 0.08, [0.4, 0.3, 0.12])
  s.box(0, 2.5, 0.62, 0.07, 0.4, 0.07, [0.2, 0.15, 0.12])
  // the Sunseed shard hovering above, glowing
  s.cone(0, 3.0, 0, 0.2, 0.75, [0.6, 0.95, 1], 0, 2.2)
  s.cone(0, 3.0, 0, 0.2, -0.75, [0.7, 1, 1], 0, 2.2)
  s.box(0, 0.45, 0.83, 1.0, 0.22, 0.05, [0.4, 0.38, 0.35])
  s.col(0, 0, 1.3)

  // lantern posts and a signpost pointing at the nearest village
  const la = Math.PI * 0.8
  lamp(new Frame(c, cx + Math.cos(la) * 3.8, cz + Math.sin(la) * 3.8, 0), 'lantern')
  lamp(new Frame(c, cx + Math.cos(la + Math.PI) * 3.8, cz + Math.sin(la + Math.PI) * 3.8, 0), 'lantern')
  const pa = Math.PI * 0.5 + 0.35
  const sg = new Frame(c, cx + Math.cos(pa) * 5.4, cz + Math.sin(pa) * 5.4, pa + Math.PI / 2)
  sg.cyl(0, 1.0, 0, 0.07, 2.0, WOOD_DARK)
  sg.box(0.45, 1.7, 0, 0.9, 0.24, 0.05, WOOD)
  sg.box(-0.4, 1.35, 0, 0.8, 0.24, 0.05, WOOD)
  sg.col(0, 0, 0.2)
  // flowers and little stones around the rim
  for (let i = 0; i < 14; i++) {
    const a = rng() * Math.PI * 2
    const r = 6.6 + rng() * 1.2
    const px = cx + Math.cos(a) * r
    const pz = cz + Math.sin(a) * r
    const g = heightAt(px, pz)
    if (i % 2) c.sphere(px, g + 0.12, pz, 0.08, 0.08, 0.08, [[1, 0.5, 0.6], [1, 0.9, 0.3], [0.9, 0.9, 1]][i % 3] as RGB, 0, 0.3)
    else c.box(px, g + 0.1, pz, 0.3, 0.2, 0.26, rng() * 3, [0.58, 0.56, 0.52], 1)
  }
}

const GEN: Record<Site['type'], (c: Ctx) => void> = {
  ruinCourt: (c) => ruinCourt(c),
  cottage: (c) => cottage(c, false),
  cottageRuin: (c) => cottage(c, true),
  stoneCircle: (c) => stoneCircle(c, c.rng() < 0.6),
  shrine: (c) => shrine(c, c.rng() < 0.4),
  archway: (c) => archway(c, c.rng() < 0.55),
  village: (c) => village(c),
  camp: (c) => camp(c),
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

import { hashInts, mulberry32 } from '../utils/random'
import { biomeAt, heightAt } from './terrainData'
import { B } from './biomes'
import type { Site } from './hydrology'

export interface SPart {
  kind: 'box' | 'cyl' | 'disc' | 'cone' | 'sphere' | 'dome'
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
  /** where villagers may wander; layouts narrow this to their own walls */
  inside: (x: number, z: number) => boolean = (x, z) => Math.hypot(x - this.site.x, z - this.site.z) < 17.2
  setCircle(r: number) {
    this.inside = (x, z) => Math.hypot(x - this.site.x, z - this.site.z) < r
  }
  /** world -> site-local */
  local(x: number, z: number): [number, number] {
    const dx = x - this.site.x
    const dz = z - this.site.z
    return [dx * this.cos - dz * this.sin, dx * this.sin + dz * this.cos]
  }
  setRect(hw: number, hd: number) {
    this.inside = (x, z) => {
      const [lx, lz] = this.local(x, z)
      return Math.abs(lx) < hw && Math.abs(lz) < hd
    }
  }
  setEllipse(a: number, b: number) {
    this.inside = (x, z) => {
      const [lx, lz] = this.local(x, z)
      return (lx / a) ** 2 + (lz / b) ** 2 < 1
    }
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
  /** smooth round slab (32 sides) for plazas, pools and bases; y is the centre */
  disc(x: number, y: number, z: number, r: number, h: number, color: [number, number, number], moss = 0, emis = 0) {
    this.parts.push({ kind: 'disc', x, y, z, sx: r, sy: h, sz: r, rx: 0, ry: 0, rz: 0, color, moss, emis })
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
  inside: (x: number, z: number) => boolean
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
  disc(dx: number, dy: number, dz: number, r: number, h: number, color: RGB, emis = 0, moss = 0) {
    const [x, z] = this.p(dx, dz)
    this.c.disc(x, this.gy + dy, z, r, h, color, moss, emis)
  }
  /** round plate standing upright on the local +z face (axis along local z): round doors, shields, suns */
  wheel(dx: number, dy: number, dz: number, r: number, thick: number, color: RGB, emis = 0) {
    const [x, z] = this.p(dx, dz)
    this.c.cyl(x, this.gy + dy, z, r, thick, color, 0, 0, this.Y - Math.PI / 2, Math.PI / 2, emis)
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
  f.disc(0, 0.05, 0, 1.3, 0.12, GRASSY, 1)
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
  f.disc(0, 0.3, 0, 1.75, 1.5, STONE_GREY)
  f.disc(0, 2.4, 0, 1.45, 4.2, wall)
  f.disc(0, 4.6, 0, 1.75, 0.35, WOOD)
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
  f.disc(0, 0.2, 0, 2.1, 0.4, [0.55, 0.52, 0.46])
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

// ---- Middle-earth builders: Shire, Rohan, Harad, Gondor, Lake-town, Dwarf-hold, Elven realm ----
const GOLD_THATCH: RGB = [0.84, 0.69, 0.3]
const ROHAN_GREEN: RGB = [0.2, 0.42, 0.24]
const WHITE_STONE: RGB = [0.88, 0.88, 0.85]
const WHITE_STONE2: RGB = [0.78, 0.79, 0.8]
const SLATE_BLUE: RGB = [0.24, 0.3, 0.42]
const DWARF_STONE: RGB = [0.44, 0.44, 0.47]
const DWARF_STONE2: RGB = [0.34, 0.34, 0.38]
const FORGE: RGB = [1, 0.5, 0.15]
const MALLORN_GOLD: RGB = [0.92, 0.76, 0.26]
const ELF_WHITE: RGB = [0.93, 0.93, 0.88]
const ELF_COPPER: RGB = [0.36, 0.62, 0.5]
const DOORS: RGB[] = [[0.2, 0.5, 0.3], [0.7, 0.2, 0.18], [0.9, 0.7, 0.2], [0.2, 0.4, 0.65], [0.5, 0.3, 0.6]]
const IVORY: RGB = [0.93, 0.9, 0.78]

/** Same frame raised by dy (for doors and details on decks and platforms). */
function lifted(f: Frame, dy: number): Frame {
  const g = new Frame(f.c, f.wx, f.wz, f.Y)
  g.gy = f.gy + dy
  return g
}

// --- The Shire -------------------------------------------------------------------------------
/** Hobbit-hole: a grassy hill with a round coloured door, round windows, a chimney and a white garden fence. */
function shireHole(f: Frame, rng: () => number) {
  const door = pickOf(rng, DOORS)
  f.sphere(0, -0.05, 0, 3.1, 2.1, 3.1, GRASSY, 1)
  f.sphere(-2.1, -0.05, -1.3, 1.7, 1.2, 1.7, [0.34, 0.56, 0.22], 1)
  f.wheel(0, 1.0, 2.5, 1.08, 0.5, WOOD_DARK)
  f.wheel(0, 1.0, 2.66, 0.88, 0.3, door)
  f.sphere(0.45, 1.0, 2.84, 0.08, 0.08, 0.06, [0.95, 0.8, 0.3], 0, 0.9)
  f.wheel(-1.9, 1.15, 1.72, 0.38, 0.3, WOOD)
  f.wheel(-1.9, 1.15, 1.84, 0.28, 0.3, GLOW, 1.4)
  f.wheel(1.9, 1.15, 1.72, 0.38, 0.3, WOOD)
  f.wheel(1.9, 1.15, 1.84, 0.28, 0.3, GLOW, 1.4)
  f.cyl(1.1, 2.4, -0.9, 0.3, 1.0, [0.58, 0.52, 0.45])
  const pale: RGB = [0.88, 0.84, 0.72]
  for (const s of [-1, 1]) {
    f.box(s * 2.3, 0.34, 4.0, 2.2, 0.07, 0.06, pale)
    f.box(s * 2.3, 0.18, 4.0, 2.2, 0.07, 0.06, pale)
    for (let k = 0; k < 3; k++) f.box(s * (1.3 + k * 1.0), 0.28, 4.0, 0.09, 0.56, 0.09, pale)
  }
  f.cyl(-1.6, 0.5, 3.1, 0.04, 1.0, WOOD)
  f.box(-1.6, 1.1, 3.1, 0.3, 0.22, 0.22, door)
  for (let i = 0; i < 5; i++) {
    const cols: RGB[] = [[1, 0.5, 0.6], [1, 0.9, 0.3], [0.75, 0.6, 1]]
    f.sphere(1.2 + i * 0.28, 0.12, 3.5 + (i % 2) * 0.2, 0.1, 0.1, 0.1, cols[i % 3], 0, 0.3)
  }
  f.col(0, 0, 2.7)
}

/** The Party Tree: a huge oak with string lanterns and a picnic table. */
function partyTree(f: Frame) {
  f.disc(0, 0.1, 0, 2.2, 0.2, [0.5, 0.45, 0.35])
  f.cyl(0, 2.2, 0, 0.75, 4.4, [0.4, 0.3, 0.2])
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4
    f.cone(Math.cos(a) * 0.8, 0, Math.sin(a) * 0.8, 0.4, 1.0, [0.4, 0.3, 0.2])
  }
  f.sphere(0, 4.3, 0, 3.9, 2.7, 3.9, [0.3, 0.55, 0.2])
  f.sphere(1.7, 4.8, -0.8, 2.4, 1.8, 2.4, [0.36, 0.6, 0.24])
  f.sphere(-1.8, 4.6, 0.9, 2.2, 1.6, 2.2, [0.28, 0.5, 0.2])
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2
    f.sphere(Math.cos(a) * 3.0, 3.7 + (i % 2) * 0.3, Math.sin(a) * 3.0, 0.14, 0.18, 0.14, [1, 0.8, 0.4], 0, 1.7)
  }
  f.box(2.2, 0.75, 1.2, 1.9, 0.1, 0.75, WOOD)
  for (const s of [-1, 1]) f.box(2.2 + s * 0.75, 0.38, 1.2, 0.1, 0.76, 0.6, WOOD_DARK)
  f.col(0, 0, 1.0)
}

// --- Rohan -----------------------------------------------------------------------------------
/** Long timber hall with steep golden thatch and crossed horse-head gable beams. `grand` is Meduseld. */
function rohanHall(f: Frame, rng: () => number, grand = false) {
  const W = grand ? 5.6 : 3.6
  const D = grand ? 8.4 : 5.4
  const H = grand ? 2.8 : 2.0
  const rise = grand ? 3.3 : 2.3
  const wall: RGB = [0.42, 0.34, 0.27]
  const thatch: RGB = grand ? GOLD_THATCH : pickOf(rng, [[0.74, 0.62, 0.32], [0.66, 0.55, 0.3], [0.78, 0.66, 0.34]] as RGB[])
  f.footing(W + 0.3, D + 0.3, [0.5, 0.48, 0.44], 0.35)
  f.box(0, 0.35 + H / 2, 0, W, H, D, wall)
  for (let i = 0; i <= 4; i++) for (const s of [-1, 1]) f.box(s * (W / 2 + 0.04), 0.35 + H / 2, -D / 2 + (i / 4) * D, 0.16, H, 0.16, WOOD_DARK)
  const y0 = 0.35 + H
  gable(f, W, D, y0, thatch, wall, rise, 0.85, WOOD_DARK)
  // lower eave band so the thatch looks thick
  for (const s of [-1, 1]) f.box(s * (W / 2 + 0.7), y0 + 0.12, 0, 0.3, 0.3, D + 0.9, [thatch[0] * 0.8, thatch[1] * 0.8, thatch[2] * 0.8])
  // crossed beams ending in horse heads
  const yt = y0 + rise + 0.15
  for (const z of [D / 2 + 0.55, -D / 2 - 0.55]) {
    f.box(0, yt, z, 2.0, 0.14, 0.14, WOOD_DARK, 0, 0.75)
    f.box(0, yt, z, 2.0, 0.14, 0.14, WOOD_DARK, 0, -0.75)
    for (const s of [-1, 1]) f.box(s * 0.73, yt + 0.72, z, 0.2, 0.34, 0.14, [0.6, 0.46, 0.3])
  }
  f.door(D / 2 + 0.02, grand ? 1.5 : 0.95, grand ? 2.3 : 1.65, [0.72, 0.56, 0.2])
  for (const s of [-1, 1]) {
    f.window(s * (W / 2 - 0.85), 0.35 + H * 0.6, D / 2 + 0.03, 0.34, 0.4, WOOD_DARK)
    f.wheel(s * (W / 2 - 0.5), 0.35 + H * 0.3, D / 2 + 0.06, 0.3, 0.08, s > 0 ? [0.72, 0.2, 0.18] : [0.9, 0.78, 0.3])
  }
  // carved porch posts with rearing-horse tops
  for (const s of [-1, 1]) {
    const px = s * (grand ? 1.7 : 1.0)
    f.cyl(px, 1.4, D / 2 + 0.75, 0.14, grand ? 3.2 : 2.6, WOOD_DARK)
    f.box(px, (grand ? 3.2 : 2.6) + 0.1, D / 2 + 0.75, 0.2, 0.34, 0.14, [0.6, 0.46, 0.3])
  }
  f.box(0, grand ? 3.0 : 2.5, D / 2 + 0.75, grand ? 3.8 : 2.4, 0.12, 0.2, WOOD_DARK)
  if (grand) {
    f.wheel(0, y0 + 0.7, D / 2 + 0.08, 0.8, 0.1, [0.95, 0.78, 0.25], 0.9)
    for (const s of [-1, 1]) f.cyl(s * 1.7, 0.18, D / 2 + 0.75, 0.26, 0.36, [0.6, 0.58, 0.54])
  }
  f.col(0, -D / 4, W * 0.62)
  f.col(0, D / 4, W * 0.62)
  if (grand) f.col(0, 0, W * 0.62)
}

/** Standard of the Mark: a tall pole with a gold sun disc and a green banner. */
function rohanStandard(f: Frame) {
  f.disc(0, 0.25, 0, 1.5, 0.5, [0.58, 0.56, 0.52])
  f.disc(0, 0.6, 0, 1.0, 0.25, [0.5, 0.48, 0.45])
  f.cyl(0, 3.4, 0, 0.13, 5.8, WOOD_DARK)
  f.wheel(0, 5.6, 0.18, 0.5, 0.08, [0.95, 0.78, 0.25], 1.0)
  f.box(0.7, 4.2, 0, 1.3, 1.9, 0.05, ROHAN_GREEN)
  f.box(0.7, 4.3, 0.04, 0.5, 0.5, 0.04, [0.92, 0.9, 0.82])
  f.box(0.7, 3.2, 0, 1.3, 0.08, 0.06, [0.9, 0.75, 0.25])
  f.col(0, 0, 1.5)
}

// --- Harad -----------------------------------------------------------------------------------
/** Tiered pavilion in red and gold with a carpeted entrance. */
function pavilion(f: Frame, rng: () => number) {
  const a = pickOf(rng, [[0.72, 0.16, 0.13], [0.55, 0.15, 0.3], [0.7, 0.4, 0.1]] as RGB[])
  const gold: RGB = [0.9, 0.7, 0.2]
  f.disc(0, 0.06, 0, 3.3, 0.12, [0.6, 0.3, 0.2])
  f.disc(0, 0.8, 0, 2.5, 1.5, [0.94, 0.86, 0.62])
  f.cone(0, 1.5, 0, 3.2, 1.3, a)
  f.cone(0, 2.5, 0, 2.1, 1.4, gold)
  f.cone(0, 3.5, 0, 1.2, 1.3, a)
  f.cyl(0, 5.3, 0, 0.05, 1.2, WOOD_DARK)
  f.sphere(0, 5.95, 0, 0.16, 0.16, 0.16, gold, 0, 1.0)
  f.box(0, 0.9, 2.46, 1.3, 1.6, 0.1, [0.16, 0.09, 0.07])
  f.box(0, 1.8, 2.5, 1.8, 0.2, 0.2, a, 0, 0.3)
  f.sphere(0.4, 0.9, 2.55, 0.06, 0.06, 0.04, GLOW, 0, 1.4)
  f.box(0, 0.04, 3.5, 1.7, 0.06, 1.5, a)
  for (const s of [-1, 1]) f.sphere(s * 1.7, 0.2, 3.4, 0.28, 0.2, 0.28, gold)
  for (const s of [-1, 1]) f.box(s * 1.0, 0.9, 2.5, 0.05, 1.7, 0.05, WOOD_DARK)
  f.col(0, 0, 3.0)
}

// --- Gondor ----------------------------------------------------------------------------------
/** White-stone house with dark slate roof, arched door and tall windows; sometimes a slim tower. */
function gondorHouse(f: Frame, rng: () => number) {
  const W = 3.8 + rng() * 0.6
  const D = 3.6 + rng() * 0.5
  const tall = rng() < 0.45
  const H = tall ? 4.6 : 3.0
  f.footing(W + 0.4, D + 0.4, WHITE_STONE2, 0.35)
  const n = Math.round(H / 0.5)
  for (let i = 0; i < n; i++) {
    const k = i % 2 ? 0.97 : 1
    f.box(0, 0.1 + ((i + 0.5) * H) / n, 0, W, H / n + 0.02, D, [WHITE_STONE[0] * k, WHITE_STONE[1] * k, WHITE_STONE[2] * k])
  }
  f.box(0, H + 0.2, 0, W + 0.5, 0.25, D + 0.5, WHITE_STONE2)
  gable(f, W + 0.2, D + 0.2, H + 0.32, SLATE_BLUE, WHITE_STONE, tall ? 2.4 : 1.6, 0.35, [0.18, 0.2, 0.28])
  for (const s of [-1, 1]) f.box(s * (W / 2), H / 2 + 0.1, D / 2, 0.4, H, 0.4, WHITE_STONE2)
  const dark: RGB = [0.13, 0.15, 0.2]
  f.box(0, 0.95, D / 2 + 0.02, 1.0, 1.8, 0.14, dark)
  f.sphere(0, 1.85, D / 2 + 0.02, 0.5, 0.36, 0.1, dark)
  for (const s of [-1, 1]) f.box(s * 0.62, 1.0, D / 2 + 0.05, 0.16, 2.0, 0.14, WHITE_STONE2)
  f.sphere(0, 2.1, D / 2 + 0.05, 0.7, 0.2, 0.1, WHITE_STONE2)
  for (const s of [-1, 1]) f.window(s * (W / 2 - 0.9), 1.7 + (tall ? 0.2 : 0), D / 2 + 0.03, 0.32, 0.7, WHITE_STONE2)
  if (tall) for (const s of [-1, 1]) f.window(s * (W / 2 - 0.9), 3.7, D / 2 + 0.03, 0.32, 0.6, WHITE_STONE2)
  f.box(W / 2 - 0.5, H + 1.9, -0.6, 0.6, 1.4, 0.6, WHITE_STONE2)
  f.box(0, H + 0.45, 0, W + 0.3, 0.1, D + 0.3, [0.97, 0.98, 1.0])
  f.col(-W / 4, 0, Math.max(D, W) * 0.42)
  f.col(W / 4, 0, Math.max(D, W) * 0.42)
}

/** The White Tree of Gondor on a stepped white terrace with a basin. */
function whiteTree(f: Frame) {
  f.disc(0, 0.45, 0, 3.4, 0.3, WHITE_STONE)
  f.disc(0, 0.75, 0, 2.5, 0.3, WHITE_STONE2)
  f.disc(0, 1.0, 0, 1.6, 0.3, WHITE_STONE)
  f.disc(0, 1.18, 0, 1.3, 0.08, [0.4, 0.65, 0.85], 0.6)
  const bark: RGB = [0.8, 0.78, 0.74]
  f.cyl(0, 2.4, 0, 0.26, 2.6, bark)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    f.cone(Math.cos(a) * 0.55, 3.0 + (i % 2) * 0.3, Math.sin(a) * 0.55, 0.12, 1.5, bark)
  }
  for (let i = 0; i < 16; i++) {
    const a = i * 2.4
    const r = 0.3 + (i % 5) * 0.34
    f.sphere(Math.cos(a) * r, 3.9 + (i % 4) * 0.35, Math.sin(a) * r, 0.3, 0.2, 0.3, [0.97, 0.98, 1.0], 0, 0.7)
  }
  f.col(0, 0, 1.7)
}

// --- Lake-town -------------------------------------------------------------------------------
/** Tall pile-dwelling: stilts and braces, jettied upper storey, steep shingle roof, nets and a rowing boat. */
function lakeHouse(f: Frame, rng: () => number, grand = false) {
  const W = grand ? 4.8 : 3.0 + rng() * 0.4
  const D = grand ? 5.2 : 3.4 + rng() * 0.4
  const PH = 1.1
  const plank: RGB = [0.5, 0.38, 0.26]
  const dark: RGB = [0.34, 0.26, 0.19]
  const wall: RGB = pickOf(rng, [[0.62, 0.5, 0.36], [0.55, 0.46, 0.4], [0.5, 0.52, 0.48]] as RGB[])
  const trim: RGB = pickOf(rng, [[0.7, 0.25, 0.2], [0.2, 0.5, 0.55], [0.82, 0.62, 0.2]] as RGB[])
  for (const sx of [-1, 1]) for (const sz of [-1, 0, 1]) f.cyl(sx * (W / 2 - 0.1), PH / 2 - 0.5, sz * (D / 2 - 0.1), 0.14, PH + 1.0, dark, 0, 1)
  for (const sz of [-1, 1]) f.box(0, 0.45, sz * (D / 2 - 0.1), W - 0.2, 0.08, 0.08, dark)
  f.box(0, PH, 0, W + 0.9, 0.16, D + 0.9, plank)
  f.box(0, PH + 0.9, 0, W, 1.7, D, wall)
  f.box(0, PH + 2.35, 0, W + 0.5, 1.3, D + 0.4, wall)
  for (const x of [-W / 2, 0, W / 2]) f.box(x, PH + 0.9, D / 2 + 0.02, 0.1, 1.7, 0.08, dark)
  for (const x of [-W / 2 - 0.2, W / 2 + 0.2]) f.box(x, PH + 2.35, D / 2 + 0.22, 0.1, 1.3, 0.08, dark)
  gable(f, W + 0.5, D + 0.4, PH + 3.0, [0.3, 0.25, 0.24], wall, grand ? 2.4 : 2.0, 0.5, dark)
  const g = lifted(f, PH + 0.08)
  g.door(D / 2 + 0.03, 0.8, 1.5, trim)
  f.window(-W / 2 + 0.6, PH + 2.3, D / 2 + 0.25, 0.36, 0.5, trim)
  f.window(W / 2 - 0.6, PH + 2.3, D / 2 + 0.25, 0.36, 0.5, trim)
  f.box(W / 2 + 0.35, PH + 1.8, D / 2 + 0.45, 0.6, 0.05, 0.05, dark)
  f.sphere(W / 2 + 0.55, PH + 1.55, D / 2 + 0.45, 0.13, 0.17, 0.13, [1, 0.75, 0.3], 0, 1.8)
  f.box(-W / 2 - 0.5, PH + 1.3, 0.2, 0.05, 1.2, 1.7, [0.72, 0.68, 0.56])
  f.cyl(W / 2 + 0.2, PH + 0.5, -D / 2 - 0.1, 0.3, 0.8, plank)
  f.box(-0.8, PH + 0.3, D / 2 + 0.4, 0.5, 0.5, 0.5, plank)
  for (let i = 0; i < 3; i++) f.box(0, 0.14 + i * (PH / 3), D / 2 + 1.5 - i * 0.28, 1.2, 0.1, 0.4, plank)
  if (!grand) {
    f.box(-W / 2 - 1.5, 0.1, -0.6, 0.8, 0.22, 2.6, dark)
    f.box(-W / 2 - 1.5, 0.3, 0.9, 0.7, 0.2, 0.5, dark, 0, 0.5)
    f.box(-W / 2 - 1.5, 0.3, -2.1, 0.7, 0.2, 0.5, dark, 0, -0.5)
  } else {
    f.box(W / 4, PH + 4.3, -0.8, 0.7, 1.6, 0.7, [0.55, 0.5, 0.45])
    f.box(-W / 4, PH + 4.3, -0.8, 0.7, 1.6, 0.7, [0.55, 0.5, 0.45])
  }
  f.col(0, 0, Math.max(W, D) * 0.58)
}

/** Harbour market: a plank deck, a lantern post with nets, crates and barrels. */
function pierMarket(f: Frame) {
  f.disc(0, 0.14, 0, 3.2, 0.24, [0.5, 0.38, 0.26])
  f.cyl(0, 2.2, 0, 0.14, 4.0, WOOD_DARK)
  f.box(0, 3.8, 0, 2.6, 0.1, 0.1, WOOD_DARK)
  for (const x of [-1.2, 0, 1.2]) f.sphere(x, 3.5, 0, 0.14, 0.2, 0.14, [1, 0.75, 0.3], 0, 1.8)
  f.box(0.6, 2.4, 0.1, 0.05, 1.3, 1.2, [0.72, 0.68, 0.56])
  f.box(1.7, 0.6, 0.9, 0.7, 0.6, 0.7, WOOD)
  f.box(1.55, 1.15, 0.8, 0.5, 0.45, 0.5, WOOD_DARK)
  f.cyl(-1.6, 0.7, 1.0, 0.32, 0.8, WOOD)
  f.cyl(-1.0, 0.65, 1.6, 0.28, 0.7, WOOD_DARK)
  f.col(0, 0, 1.0)
}

/** Marsh stilt-house with pale marsh-lights hung under the eaves. */
function marshHouse(f: Frame, rng: () => number) {
  stiltHut(f, rng, true)
  for (let i = 0; i < 3; i++) f.sphere(-1.1 + i * 1.1, 1.3 - (i % 2) * 0.2, 1.9, 0.09, 0.12, 0.09, [0.6, 1, 0.55], 0, 1.8)
  for (let i = 0; i < 3; i++) f.cone(2.2 + i * 0.2, 0, -0.8 + i * 0.5, 0.2, 1.5 + i * 0.3, [0.45, 0.5, 0.24], 0.5)
}

// --- Dwarf-hold ------------------------------------------------------------------------------
/** Squat stone hall: massive courses, square-pillared porch, a glowing forge door, rune band, tall chimney. */
function dwarfHall(f: Frame, rng: () => number) {
  const W = 4.6 + rng() * 0.6
  const D = 4.0 + rng() * 0.5
  const H = 2.8 + (rng() < 0.4 ? 0.8 : 0)
  f.footing(W + 0.5, D + 0.5, DWARF_STONE2, 0.4)
  for (let i = 0; i < 6; i++) f.box(0, 0.3 + (i + 0.5) * (H / 6), 0, W, H / 6 + 0.02, D, i % 2 ? DWARF_STONE : DWARF_STONE2)
  f.box(0, H + 0.5, 0, W + 0.7, 0.4, D + 0.7, DWARF_STONE2)
  f.box(0, H + 0.85, 0, W - 0.3, 0.3, D - 0.3, DWARF_STONE)
  for (const s of [-1, 1]) {
    f.box(s * 1.45, H / 2 + 0.3, D / 2 + 0.55, 0.7, H, 0.7, DWARF_STONE)
    f.box(s * 1.45, H + 0.4, D / 2 + 0.55, 0.98, 0.25, 0.98, DWARF_STONE2)
  }
  f.box(0, H + 0.4, D / 2 + 0.55, 3.9, 0.3, 0.9, DWARF_STONE2)
  f.box(0, 1.15, D / 2 + 0.02, 1.5, 2.1, 0.14, [0.1, 0.08, 0.07])
  f.box(0, 0.95, D / 2 + 0.1, 1.1, 1.5, 0.06, FORGE, 1.0)
  f.box(0, 2.3, D / 2 + 0.05, 1.9, 0.3, 0.16, DWARF_STONE2)
  for (let i = 0; i < 5; i++) f.box(-0.8 + i * 0.4, H - 0.3, D / 2 + 0.05, 0.12, 0.3, 0.05, [1, 0.7, 0.3], 1.4)
  f.box(W / 2 - 0.6, H + 2.0, -0.6, 0.8, 2.4, 0.8, DWARF_STONE2)
  f.sphere(W / 2 - 0.6, H + 3.3, -0.6, 0.3, 0.2, 0.3, FORGE, 0, 1.6)
  f.box(-W / 2 - 0.9, 0.6, D / 2 - 0.4, 0.5, 0.3, 0.8, [0.22, 0.22, 0.26])
  f.box(-W / 2 - 0.9, 0.25, D / 2 - 0.4, 0.3, 0.5, 0.3, WOOD_DARK)
  f.col(-W / 4, 0, Math.max(D, W) * 0.45)
  f.col(W / 4, 0, Math.max(D, W) * 0.45)
}

/** Square keep with a glowing arrow slit and a brazier on the roof. */
function dwarfKeep(f: Frame) {
  f.footing(3.6, 3.6, DWARF_STONE2, 0.4)
  for (let i = 0; i < 8; i++) f.box(0, 0.5 + i * 0.8, 0, 3.0 - i * 0.03, 0.82, 3.0 - i * 0.03, i % 2 ? DWARF_STONE : DWARF_STONE2)
  f.box(0, 6.9, 0, 3.8, 0.5, 3.8, DWARF_STONE2)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.box(sx * 1.6, 7.45, sz * 1.6, 0.6, 0.6, 0.6, DWARF_STONE)
  f.box(0, 4.0, 1.52, 0.2, 0.8, 0.05, FORGE, 1.4)
  f.box(0, 2.4, 1.52, 0.2, 0.8, 0.05, FORGE, 1.4)
  f.door(1.5, 0.9, 1.5, DWARF_STONE2)
  f.cone(0, 7.2, 0, 0.5, 1.0, FORGE, 0, 2.2)
  f.col(0, 0, 2.1)
}

/** Great brazier column with a rune-lit shaft. */
function dwarfMonument(f: Frame) {
  f.box(0, 0.25, 0, 3.2, 0.5, 3.2, DWARF_STONE2)
  f.box(0, 0.65, 0, 2.4, 0.3, 2.4, DWARF_STONE)
  f.box(0, 3.0, 0, 1.1, 4.6, 1.1, DWARF_STONE)
  f.box(0, 5.45, 0, 1.5, 0.4, 1.5, DWARF_STONE2)
  f.disc(0, 5.85, 0, 1.1, 0.4, [0.2, 0.2, 0.22])
  f.cone(0, 6.0, 0, 0.7, 1.4, FORGE, 0, 2.2)
  f.cone(0, 6.2, 0, 0.4, 1.8, [1, 0.85, 0.4], 0, 2.4)
  for (let i = 0; i < 5; i++) f.box(0, 1.4 + i * 0.6, 0.57, 0.5, 0.12, 0.04, [1, 0.65, 0.25], 1.4)
  f.col(0, 0, 2.0)
}

// --- Elven realm -----------------------------------------------------------------------------
/** Rivendell-style pavilion: white colonnade, copper-green flared roof, round gold window, hanging lamps. */
function elvenPavilion(f: Frame, rng: () => number) {
  void rng
  f.disc(0, 0.2, 0, 3.0, 0.4, ELF_WHITE)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    if (Math.abs(Math.sin(a) - 1) < 0.2) continue
    f.cyl(Math.cos(a) * 2.3, 1.9, Math.sin(a) * 2.3, 0.1, 3.0, ELF_WHITE)
  }
  for (const s of [-1, 1]) f.cyl(s * 0.95, 1.9, 2.45, 0.1, 3.0, ELF_WHITE)
  f.disc(0, 3.5, 0, 2.6, 0.2, ELF_WHITE)
  f.cone(0, 3.6, 0, 3.4, 1.7, ELF_COPPER)
  f.cone(0, 4.9, 0, 1.6, 1.3, [0.42, 0.7, 0.55])
  f.cone(0, 5.9, 0, 0.5, 1.3, MALLORN_GOLD, 0, 0.6)
  f.sphere(0, 7.2, 0, 0.15, 0.15, 0.15, [1, 0.95, 0.7], 0, 1.8)
  f.box(0, 1.6, -1.9, 3.2, 2.4, 0.12, ELF_WHITE)
  f.wheel(0, 2.1, -1.8, 0.72, 0.1, MALLORN_GOLD, 0.4)
  f.wheel(0, 2.1, -1.76, 0.56, 0.1, [1, 0.95, 0.7], 1.2)
  for (const s of [-1, 1]) f.sphere(s * 1.2, 3.1, 2.2, 0.13, 0.2, 0.13, [0.7, 1, 0.6], 0, 1.8)
  f.box(0, 0.12, 3.15, 1.8, 0.2, 0.7, ELF_WHITE)
  f.box(-1.2, 0.65, -1.2, 1.0, 0.1, 0.4, [0.8, 0.7, 0.5])
  f.col(0, 0, 3.0)
}

/** Mallorn: silver-grey trunk, golden crown. */
function mallornTree(f: Frame, h = 7.5, spread = 1) {
  f.cyl(0, h / 2, 0, 0.55 * spread, h, [0.64, 0.62, 0.57])
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5
    f.cone(Math.cos(a) * 0.5 * spread, 0, Math.sin(a) * 0.5 * spread, 0.35, 1.2, [0.64, 0.62, 0.57])
  }
  f.sphere(0, h - 0.3, 0, 1.9 * spread, 1.5, 1.9 * spread, MALLORN_GOLD, 0, 0.25)
  f.sphere(0.8 * spread, h + 0.5, -0.5 * spread, 1.2 * spread, 1.1, 1.2 * spread, [0.95, 0.8, 0.3], 0, 0.3)
  f.sphere(-0.9 * spread, h + 0.2, 0.6 * spread, 1.1 * spread, 1.0, 1.1 * spread, [0.88, 0.72, 0.24], 0, 0.2)
  f.col(0, 0, 0.9)
}

/** A mallorn with a flet: an open wooden platform around the trunk, a canopy cloth, lanterns and a rope ladder. */
function mallornFlet(f: Frame, rng: () => number) {
  void rng
  mallornTree(f, 8.4, 0.95)
  const y = 3.6
  f.disc(0, y, 0, 2.3, 0.22, [0.82, 0.72, 0.52])
  f.disc(0, y - 0.3, 0, 1.2, 0.4, [0.6, 0.58, 0.52])
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    f.cyl(Math.cos(a) * 1.9, y + 0.9, Math.sin(a) * 1.9, 0.06, 1.8, ELF_WHITE)
    f.sphere(Math.cos(a) * 1.9, y + 1.5, Math.sin(a) * 1.9, 0.12, 0.18, 0.12, [0.7, 1, 0.6], 0, 1.8)
  }
  f.disc(0, y + 1.9, 0, 2.2, 0.08, [0.9, 0.95, 0.8])
  for (const s of [-1, 1]) f.cyl(s * 0.25, y / 2, 2.15, 0.025, y, [0.85, 0.8, 0.65])
  for (let i = 0; i < 8; i++) f.box(0, 0.35 + i * 0.4, 2.15, 0.5, 0.04, 0.04, [0.5, 0.4, 0.28])
  f.col(0, 0, 0.9)
}

/** White basin with slender leaf-like spires and a golden bowl. */
function elvenFountain(f: Frame) {
  f.disc(0, 0.3, 0, 2.4, 0.6, ELF_WHITE)
  f.disc(0, 0.62, 0, 2.0, 0.06, [0.4, 0.75, 0.8], 0.8)
  f.disc(0, 1.0, 0, 0.6, 1.2, ELF_WHITE)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    f.cone(Math.cos(a) * 0.3, 1.5, Math.sin(a) * 0.3, 0.16, 2.4 + i * 0.3, ELF_WHITE, 0, 0.2)
  }
  f.disc(0, 1.7, 0, 1.0, 0.12, MALLORN_GOLD, 0.3)
  f.sphere(0, 4.0, 0, 0.2, 0.3, 0.2, [1, 0.95, 0.7], 0, 1.8)
  f.col(0, 0, 2.3)
}

// ---- plaza centrepieces + small props --------------------------------------------------------
function well(f: Frame, moss = 0) {
  f.disc(0, 0.45, 0, 1.15, 0.9, [0.62, 0.58, 0.5], 0, moss)
  f.disc(0, 0.92, 0, 0.9, 0.06, [0.2, 0.45, 0.55], 0.6)
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
  f.disc(0, 0.42, 0, 0.8, 0.1, [1, 0.45, 0.12], 1.4)
  f.cone(0, 0.45, 0, 0.45, 1.2, [1, 0.6, 0.15], 0, 1.8)
  f.cone(0, 0.6, 0, 0.26, 1.7, [1, 0.85, 0.3], 0, 2.2)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    f.log(Math.cos(a) * 2.7, 0.22, Math.sin(a) * 2.7, 0.22, 1.8, LOG_A, a + Math.PI / 2)
  }
  f.col(0, 0, 1.1)
}

function oasis(f: Frame, rng: () => number) {
  f.disc(0, 0.08, 0, 3.4, 0.16, [0.85, 0.72, 0.5])
  f.disc(0, 0.16, 0, 2.7, 0.1, [0.25, 0.6, 0.72], 0.7)
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
  f.disc(0, 0.3, 0, 1.0, 0.6, STONE_GREY)
  for (let i = 0; i < 4; i++) {
    f.cyl(0, 1.0 + i * 0.8, 0, 0.42, 0.78, cols[i])
    f.box(0, 1.0 + i * 0.8, 0.4, 0.5, 0.22, 0.12, [0.1, 0.07, 0.05])
    f.sphere(-0.15, 1.12 + i * 0.8, 0.4, 0.06, 0.06, 0.04, GLOW, 0, 1.4)
    f.sphere(0.15, 1.12 + i * 0.8, 0.4, 0.06, 0.06, 0.04, GLOW, 0, 1.4)
  }
  f.cone(0, 4.2, 0, 0.5, 0.7, [0.9, 0.3, 0.2])
  f.disc(0, 0.62, 0, 1.15, 0.1, [1, 0.5, 0.15], 1.2)
  f.col(0, 0, 1.1)
}

function crystalFountain(f: Frame, rng: () => number) {
  f.disc(0, 0.3, 0, 2.2, 0.6, [0.7, 0.66, 0.82])
  f.disc(0, 0.62, 0, 1.9, 0.06, [0.45, 0.7, 1.0], 0.8)
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
  f.disc(0, 0.3, 0, 1.6, 0.6, [0.5, 0.48, 0.45])
  f.box(0, 1.1, 0, 1.0, 1.0, 1.0, [0.56, 0.54, 0.5])
  f.box(0, 2.3, 0, 0.8, 1.4, 0.8, [0.6, 0.58, 0.54])
  f.cone(0, 3.0, 0, 0.58, 1.3, [0.64, 0.62, 0.58])
  for (let i = 0; i < 3; i++) f.box(0, 1.9 + i * 0.5, 0.42, 0.28, 0.1, 0.06, [0.5, 0.9, 1], 1.5)
  f.col(0, 0, 1.3)
}

function lamp(f: Frame, kind: 'post' | 'torch' | 'crystal' | 'lantern' | 'banner' | 'brazier' | 'white' | 'elven' = 'post', tint: RGB = [1.0, 0.82, 0.4]) {
  if (kind === 'banner') {
    f.cyl(0, 1.7, 0, 0.06, 3.4, WOOD_DARK)
    f.box(0.32, 3.25, 0, 0.7, 0.06, 0.06, WOOD_DARK)
    f.box(0.35, 2.6, 0, 0.62, 1.2, 0.04, tint)
    f.box(0.35, 2.65, 0.03, 0.22, 0.24, 0.03, [0.95, 0.92, 0.8])
    f.box(0.35, 1.98, 0, 0.62, 0.06, 0.05, [0.9, 0.75, 0.25])
  } else if (kind === 'brazier') {
    f.box(0, 0.5, 0, 0.5, 1.0, 0.5, DWARF_STONE)
    f.disc(0, 1.05, 0, 0.4, 0.16, [0.2, 0.2, 0.22])
    f.cone(0, 1.1, 0, 0.28, 0.7, FORGE, 0, 2.2)
  } else if (kind === 'white') {
    f.cyl(0, 1.0, 0, 0.07, 2.0, WHITE_STONE2)
    f.box(0, 2.15, 0, 0.34, 0.4, 0.34, [1, 0.95, 0.8], 1.8)
    f.cone(0, 2.35, 0, 0.3, 0.25, SLATE_BLUE)
  } else if (kind === 'elven') {
    f.cyl(0, 1.1, 0, 0.05, 2.2, ELF_WHITE)
    f.box(0.15, 2.05, 0, 0.35, 0.04, 0.04, ELF_WHITE)
    f.sphere(0.3, 1.85, 0, 0.17, 0.25, 0.17, tint, 0, 1.9)
  } else if (kind === 'torch') {
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
type FenceKind = 'picket' | 'palisade' | 'stone' | 'adobe' | 'bamboo' | 'reed' | 'hedge' | 'snowstone' | 'rail' | 'rampart' | 'bastion' | 'leafhedge'
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
  rail(s) {
    const { c, x0, z0, mx, mz, len, yaw, g0, gm } = s
    c.cyl(x0, g0 + 0.5, z0, 0.09, 1.0, WOOD_DARK, 0)
    c.box(mx, gm + 0.85, mz, len, 0.05, 0.05, yaw, [0.78, 0.72, 0.55], 0)
    c.box(mx, gm + 0.45, mz, len, 0.05, 0.05, yaw, [0.78, 0.72, 0.55], 0)
    if (s.i % 5 === 0) c.sphere(x0, g0 + 1.1, z0, 0.1, 0.14, 0.1, [1, 0.75, 0.3], 0, 1.6)
  },
  rampart(s) {
    const { c, mx, mz, len, yaw, gm } = s
    c.box(mx, gm + 1.0, mz, len + 0.05, 2.4, 0.9, yaw, s.i % 2 ? WHITE_STONE : WHITE_STONE2, 0)
    c.box(mx, gm + 2.3, mz, len + 0.08, 0.2, 1.1, yaw, WHITE_STONE2, 0)
    if (s.i % 2 === 0) c.box(mx, gm + 2.65, mz, len * 0.55, 0.5, 0.5, yaw, WHITE_STONE, 0)
    if (s.i % 6 === 0) c.box(s.x0, gm + 1.5, s.z0, 0.8, 3.2, 1.2, yaw, WHITE_STONE2, 0)
  },
  bastion(s) {
    const { c, mx, mz, len, yaw, gm } = s
    c.box(mx, gm + 1.2, mz, len + 0.06, 2.8, 1.0, yaw, s.i % 3 ? DWARF_STONE : DWARF_STONE2, 0.15)
    c.box(mx, gm + 2.7, mz, len + 0.1, 0.3, 1.2, yaw, DWARF_STONE2, 0)
    if (s.i % 4 === 0) {
      c.box(s.x0, gm + 1.8, s.z0, 1.0, 3.6, 1.2, yaw, DWARF_STONE2, 0.1)
      c.box(s.x0, gm + 2.3, s.z0, 0.12, 0.5, 1.25, yaw, FORGE, 0, 1.3)
    }
  },
  leafhedge(s) {
    const { c, mx, mz, len, gm } = s
    const a = s.i % 2
    c.sphere(mx, gm + 0.6, mz, len * 0.62, 0.7, 0.62, [a ? 0.62 : 0.82, a ? 0.68 : 0.7, a ? 0.2 : 0.22], 0, 0.2)
    if (s.i % 4 === 0) {
      c.cyl(mx, gm + 1.2, mz, 0.05, 2.4, ELF_WHITE, 0)
      c.sphere(mx, gm + 2.5, mz, 0.14, 0.2, 0.14, [0.7, 1, 0.6], 0, 1.8)
    }
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

// ---- fences, gates, roads --------------------------------------------------------------------
type Pt = [number, number]
interface GateDef { x: number; z: number; a: number }
const TAU = Math.PI * 2

/** Closed polygon sampled from a radius function around (cx, cz). */
function polyPts(cx: number, cz: number, radius: (a: number) => number, n: number): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU
    const r = radius(a)
    out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r])
  }
  return out
}

/** Fence/wall along a closed polygon in short straight segments that follow the terrain; segments near a gate are left open. */
function fenceLine(c: Ctx, pts: Pt[], kind: FenceKind, gates: GateDef[], gateHalf: number, step: number, breakChance = 0) {
  const rng = mulberry32(c.site.seed + 4401)
  const colR = kind === 'hedge' ? 0.8 : kind === 'adobe' || kind === 'stone' || kind === 'snowstone' ? 0.85 : 0.7
  let i = 0
  for (let e = 0; e < pts.length; e++) {
    const [ax, az] = pts[e]
    const [bx, bz] = pts[(e + 1) % pts.length]
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / step))
    for (let k = 0; k < n; k++) {
      const x0 = ax + ((bx - ax) * k) / n
      const z0 = az + ((bz - az) * k) / n
      const x1 = ax + ((bx - ax) * (k + 1)) / n
      const z1 = az + ((bz - az) * (k + 1)) / n
      const mx = (x0 + x1) / 2
      const mz = (z0 + z1) / 2
      i++
      if (gates.some((g) => Math.hypot(g.x - mx, g.z - mz) < gateHalf)) continue
      if (breakChance > 0 && rng() < breakChance) continue
      const len = Math.hypot(x1 - x0, z1 - z0)
      const yaw = Math.atan2(-(z1 - z0), x1 - x0)
      FENCES[kind]({ c, x0, z0, x1, z1, mx, mz, len, yaw, g0: heightAt(x0, z0), g1: heightAt(x1, z1), gm: heightAt(mx, mz), i, rng })
      c.col(mx, mz, colR)
    }
  }
}

type GateKind = 'plain' | 'horse' | 'tusk' | 'white' | 'dwarf' | 'elf' | 'pier'

/** Arch of short slabs rising from both sides of a gate, meeting near the top. */
function arcBoxes(c: Ctx, g: GateDef, hw: number, height: number, color: RGB, t0: number, t1: number, emis: number, segs = 7, maxDeg = 84) {
  const tx = -Math.sin(g.a)
  const tz = Math.cos(g.a)
  const yaw = Math.atan2(-tz, tx)
  const gy = heightAt(g.x, g.z)
  for (const s of [-1, 1]) {
    for (let i = 0; i < segs; i++) {
      const p0 = (i / segs) * ((maxDeg * Math.PI) / 180)
      const p1 = ((i + 1) / segs) * ((maxDeg * Math.PI) / 180)
      const x0 = hw * Math.cos(p0) * s
      const y0 = height * Math.sin(p0)
      const x1 = hw * Math.cos(p1) * s
      const y1 = height * Math.sin(p1)
      const mx = (x0 + x1) / 2
      const my = (y0 + y1) / 2
      const len = Math.hypot(x1 - x0, y1 - y0)
      const th = t0 + (t1 - t0) * (i / segs)
      c.box(g.x + tx * mx, gy + my, g.z + tz * mx, len + 0.06, th, Math.max(th, 0.3), yaw, color, 0, emis, 0, Math.atan2(y1 - y0, x1 - x0))
    }
  }
}

/** Gate dressing per culture (a = outward normal angle); `plain` is two posts, a lintel and a lantern. */
function gate(c: Ctx, g: GateDef, hw: number, tall: number, post: RGB, lintel: RGB, glow: RGB, kind: GateKind = 'plain') {
  const tx = -Math.sin(g.a)
  const tz = Math.cos(g.a)
  const yaw = Math.atan2(-tz, tx)
  const gy = heightAt(g.x, g.z)
  const at = (o: number): Pt => [g.x + tx * o, g.z + tz * o]
  if (kind === 'tusk') {
    arcBoxes(c, g, hw + 0.2, tall + 0.9, IVORY, 0.5, 0.12, 0, 8, 86)
    for (const s of [-1, 1]) {
      const [px, pz] = at((hw + 0.2) * s)
      c.sphere(px, heightAt(px, pz) + 0.3, pz, 0.45, 0.4, 0.45, [0.7, 0.55, 0.38], 0, 0)
      c.cyl(px + tx * 0.9 * s, heightAt(px, pz) + 1.7, pz + tz * 0.9 * s, 0.05, 3.4, WOOD_DARK)
      c.box(px + tx * 1.2 * s, heightAt(px, pz) + 2.5, pz + tz * 1.2 * s, 0.05, 1.2, 0.6, yaw + Math.PI / 2, [0.72, 0.14, 0.1])
      c.col(px, pz, 0.45)
    }
    c.sphere(g.x, gy + tall + 0.9, g.z, 0.16, 0.2, 0.16, glow, 0, 2)
    return
  }
  if (kind === 'white' || kind === 'dwarf') {
    const dw = kind === 'dwarf'
    const off = hw + 0.7
    const stone = dw ? DWARF_STONE : WHITE_STONE
    const stone2 = dw ? DWARF_STONE2 : WHITE_STONE2
    const th = dw ? tall + 1.2 : tall + 1.4
    for (const s of [-1, 1]) {
      const [px, pz] = at(off * s)
      const gr = heightAt(px, pz)
      c.box(px, gr + th / 2 - 0.1, pz, 1.3, th, 1.5, yaw, stone, dw ? 0.2 : 0)
      c.box(px, gr + th + 0.2, pz, 1.6, 0.35, 1.8, yaw, stone2, 0)
      if (dw) c.cone(px, gr + th + 0.4, pz, 0.45, 0.9, FORGE, 0, 2.2)
      else for (const k of [-1, 1]) c.box(px + tx * 0.5 * k, gr + th + 0.65, pz + tz * 0.5 * k, 0.4, 0.5, 0.4, yaw, stone, 0)
      c.col(px, pz, 0.9)
    }
    if (dw) {
      c.box(g.x, gy + th + 0.15, g.z, off * 2 + 1.0, 0.9, 1.6, yaw, stone2, 0)
      for (let i = 0; i < 7; i++) {
        const [rx, rz] = at(-1.2 + i * 0.4)
        c.box(rx, gy + th + 0.15, rz, 0.14, 0.34, 1.64, yaw, FORGE, 0, 1.4)
      }
    } else {
      arcBoxes(c, g, hw + 0.2, tall * 0.85, stone, 0.55, 0.4, 0, 8, 90)
      for (const s of [-1, 1]) {
        const [bx, bz] = at(off * s)
        c.box(bx, gy + th - 0.6, bz + 0, 0.9, 1.6, 0.04, yaw + Math.PI / 2, SLATE_BLUE)
      }
    }
    c.sphere(g.x, gy + tall - 0.4, g.z, 0.12, 0.16, 0.12, glow, 0, 2)
    return
  }
  if (kind === 'elf') {
    arcBoxes(c, g, hw + 0.1, tall + 0.8, ELF_WHITE, 0.2, 0.08, 0.15, 9, 88)
    for (const s of [-1, 1]) {
      const [px, pz] = at((hw + 0.1) * s)
      c.cyl(px, heightAt(px, pz) + 0.3, pz, 0.2, 0.6, ELF_WHITE)
      c.col(px, pz, 0.35)
    }
    c.sphere(g.x, gy + tall + 0.9, g.z, 0.22, 0.26, 0.22, MALLORN_GOLD, 0, 1.0)
    c.sphere(g.x, gy + tall - 0.3, g.z, 0.12, 0.2, 0.12, [0.7, 1, 0.6], 0, 2.0)
    return
  }
  const extra = kind === 'horse' ? 1.0 : kind === 'pier' ? 0.8 : 0
  const t = tall + extra
  for (const s of [-1, 1]) {
    const [px, pz] = at(hw * s)
    const gr = heightAt(px, pz)
    c.cyl(px, gr + t / 2 - 0.1, pz, kind === 'pier' ? 0.16 : 0.22, t, post, 0)
    if (kind === 'horse') {
      c.box(px, gr + t + 0.35, pz, 0.14, 0.9, 0.14, yaw, [0.6, 0.46, 0.3], 0, 0, 0, -0.5 * s)
      c.box(px + tx * 0.3 * s, gr + t + 0.82, pz + tz * 0.3 * s, 0.26, 0.2, 0.16, yaw, [0.62, 0.48, 0.32])
    } else c.sphere(px, gr + t, pz, 0.28, 0.2, 0.28, lintel, 0, 0)
    c.col(px, pz, 0.35)
  }
  c.box(g.x, gy + t - 0.1, g.z, hw * 2 + 0.5, 0.2, 0.22, yaw, lintel, 0)
  if (kind === 'horse') c.sphere(g.x, gy + t + 0.45, g.z, 0.5, 0.5, 0.2, [0.95, 0.78, 0.25], 0, 0.9)
  if (kind === 'pier') c.box(g.x, gy + t * 0.55, g.z, hw * 2, 0.06, 0.06, yaw, [0.78, 0.72, 0.55], 0)
  c.sphere(g.x, gy + t - 0.55, g.z, 0.12, 0.16, 0.12, glow, 0, 2.0)
}

type TurretShape = 'round' | 'dome' | 'square' | 'log'
/** Corner tower: round stone, domed, square dwarf-keep or log watch-post. */
function turret(c: Ctx, x: number, z: number, h: number, wall: RGB, roof: RGB, shape: TurretShape = 'round') {
  const g = heightAt(x, z)
  if (shape === 'square') {
    c.box(x, g + h / 2 - 0.2, z, 2.4, h + 0.4, 2.4, c.yaw, wall, 0.3)
    c.box(x, g + h + 0.15, z, 2.9, 0.4, 2.9, c.yaw, [wall[0] * 0.85, wall[1] * 0.85, wall[2] * 0.85], 0.2)
    c.cone(x, g + h + 0.35, z, 0.45, 0.9, FORGE, 0, 2.2)
    c.box(x, g + h * 0.65, z, 0.16, 0.7, 2.5, c.yaw, FORGE, 0, 1.3)
  } else if (shape === 'log') {
    c.disc(x, g + h / 2 - 0.2, z, 1.2, h + 0.4, LOG_B)
    c.disc(x, g + h + 0.1, z, 1.5, 0.3, LOG_A)
    c.cone(x, g + h + 0.25, z, 1.7, 1.8, roof)
    c.sphere(x, g + h * 0.7, z, 0.14, 0.2, 0.14, LAMP, 0, 1.8)
  } else {
    c.disc(x, g + h / 2 - 0.2, z, 1.2, h + 0.4, wall)
    c.disc(x, g + h + 0.1, z, 1.45, 0.3, [wall[0] * 0.9, wall[1] * 0.9, wall[2] * 0.9])
    if (shape === 'dome') c.sphere(x, g + h + 0.35, z, 1.35, 0.95, 1.35, roof, 0, 0)
    else c.cone(x, g + h + 1.1, z, 1.55, 1.9, roof)
    c.sphere(x, g + h * 0.7, z, 0.14, 0.2, 0.14, LAMP, 0, 1.8)
  }
  c.col(x, z, 1.5)
}

/** Continuous road: overlapping flat slabs that follow the ground, no stepping stones. */
function road(c: Ctx, pts: Pt[], width: number, color: RGB, closed = false) {
  const m = closed ? pts.length : pts.length - 1
  let j = 0
  for (let e = 0; e < m; e++) {
    const [ax, az] = pts[e]
    const [bx, bz] = pts[(e + 1) % pts.length]
    const L = Math.hypot(bx - ax, bz - az)
    if (L < 0.01) continue
    const n = Math.max(1, Math.ceil(L / 1.5))
    const yaw = Math.atan2(-(bz - az), bx - ax)
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n
      const mx = ax + (bx - ax) * t
      const mz = az + (bz - az) * t
      const sh = 1 - (j++ % 3) * 0.025
      c.box(mx, heightAt(mx, mz) + 0.05, mz, L / n + 0.3, 0.1, width, yaw, [color[0] * sh, color[1] * sh, color[2] * sh], 0)
    }
  }
}

/** Gently winding polyline between two points (ends stay exact). */
function wander(x0: number, z0: number, x1: number, z1: number, amp: number, n: number, phase = 0): Pt[] {
  const L = Math.hypot(x1 - x0, z1 - z0) || 1
  const px = -(z1 - z0) / L
  const pz = (x1 - x0) / L
  const out: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const off = amp * Math.sin(t * Math.PI) * Math.sin(t * Math.PI * 2 + phase)
    out.push([x0 + (x1 - x0) * t + px * off, z0 + (z1 - z0) * t + pz * off])
  }
  return out
}

/** Plank walkway with side posts. */
function boardwalk(c: Ctx, pts: Pt[], width: number) {
  road(c, pts, width, [0.43, 0.31, 0.19])
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i]
    const [ax, az] = pts[Math.max(0, i - 1)]
    const [bx, bz] = pts[Math.min(pts.length - 1, i + 1)]
    const L = Math.hypot(bx - ax, bz - az) || 1
    const nx = -(bz - az) / L
    const nz = (bx - ax) / L
    for (const s of [-1, 1]) {
      const px = x + nx * (width / 2 + 0.05) * s
      const pz = z + nz * (width / 2 + 0.05) * s
      c.cyl(px, heightAt(px, pz) + 0.3, pz, 0.07, 0.6, WOOD_DARK, 1)
    }
  }
}

// ---- village styles --------------------------------------------------------------------------
interface VStyle {
  houses: ((f: Frame, r: () => number) => void)[]
  floor: RGB
  floor2: RGB
  path: RGB
  centre: (f: Frame, r: () => number) => void
  lamp: Parameters<typeof lamp>[1]
  gateKind?: GateKind
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
  // The Shire: hobbit-holes round a Party Tree, a mill on the edge, white garden fences
  [B.Grass]: {
    houses: [shireHole, shireHole, thatchCottage, shireHole, shireHole, shireHole, thatchCottage],
    floor: [0.7, 0.62, 0.45], floor2: [0.64, 0.56, 0.4], path: [0.68, 0.58, 0.4],
    centre: (f, r) => { void r; partyTree(f) }, lamp: 'lantern', lampTint: [1, 0.8, 0.4], fence: 'picket', gateTall: 2.3, gatePost: WOOD_DARK, gateLintel: WOOD, windmill: true, yard: 'hay',
  },
  // Rohan: golden-thatched timber halls, horse-head gables, green banners, log stockade
  [B.Forest]: {
    houses: [rohanHall, rohanHall, rohanHall, rohanHall, rohanHall, rohanHall, rohanHall],
    floor: [0.52, 0.45, 0.32], floor2: [0.46, 0.4, 0.3], path: [0.5, 0.42, 0.28],
    centre: (f) => rohanStandard(f), lamp: 'banner', lampTint: ROHAN_GREEN, fence: 'palisade', gateKind: 'horse', gateTall: 3.2, gatePost: LOG_B, gateLintel: LOG_A, stalls: [[0.2, 0.42, 0.25], [0.85, 0.7, 0.3]], yard: 'barrel',
  },
  // Harad: red-and-gold tiered pavilions and sandstone houses, tusk arches, banners
  [B.Desert]: {
    houses: [pavilion, adobeHouse, pavilion, adobeHouse, pavilion, adobeHouse, pavilion],
    floor: [0.88, 0.76, 0.52], floor2: [0.82, 0.68, 0.46], path: [0.84, 0.72, 0.5],
    centre: (f, r) => oasis(f, r), lamp: 'banner', lampTint: [0.72, 0.14, 0.1], fence: 'adobe', gateKind: 'tusk', gateTall: 3.0, gatePost: IVORY, gateLintel: IVORY, stalls: CLOTH, yard: 'pots',
  },
  // Gondor: white stone, slate roofs, the White Tree, white ramparts and arched gates
  [B.Snow]: {
    houses: [gondorHouse, gondorHouse, gondorHouse, gondorHouse, gondorHouse, gondorHouse, gondorHouse],
    floor: [0.82, 0.84, 0.88], floor2: [0.76, 0.79, 0.85], path: [0.72, 0.75, 0.8],
    centre: (f) => whiteTree(f), lamp: 'white', lampTint: [1, 0.92, 0.7], fence: 'rampart', gateKind: 'white', gateTall: 3.4, gatePost: WHITE_STONE, gateLintel: WHITE_STONE2, stalls: [[0.24, 0.3, 0.42], [0.85, 0.85, 0.9]], yard: 'crate',
  },
  // Lake-town: pile-dwellings on a plank street, rope rails, lanterns, rowing boats
  [B.Tropical]: {
    houses: [lakeHouse, lakeHouse, lakeHouse, lakeHouse, lakeHouse, lakeHouse, lakeHouse],
    floor: [0.5, 0.4, 0.28], floor2: [0.46, 0.36, 0.25], path: [0.5, 0.38, 0.26],
    centre: (f) => pierMarket(f), lamp: 'lantern', lampTint: [1, 0.7, 0.3], fence: 'rail', gateKind: 'pier', gateTall: 2.8, gatePost: WOOD_DARK, gateLintel: [0.5, 0.38, 0.26], stalls: [[0.7, 0.25, 0.2], [0.2, 0.5, 0.55], [0.85, 0.65, 0.2]], yard: 'barrel',
  },
  // Marsh-folk: crooked stilt shacks, reed screens, pale marsh-lights
  [B.Swamp]: {
    houses: [marshHouse, marshHouse, marshHouse, marshHouse, hobbitHole, marshHouse, marshHouse],
    floor: [0.42, 0.38, 0.26], floor2: [0.38, 0.35, 0.25], path: [0.4, 0.34, 0.22],
    centre: (f) => well(f, 1), lamp: 'lantern', lampTint: [0.6, 1, 0.5], fence: 'reed', gateTall: 2.4, gatePost: WOOD_DARK, gateLintel: [0.4, 0.3, 0.2], stalls: [[0.3, 0.4, 0.25], [0.4, 0.3, 0.2]], yard: 'barrel',
  },
  // Dwarf-hold: massive squared stone, rune-lit gates, braziers, forge glow
  [B.Mountain]: {
    houses: [dwarfHall, dwarfHall, dwarfHall, dwarfHall, dwarfHall, dwarfHall, dwarfHall],
    floor: [0.48, 0.48, 0.5], floor2: [0.4, 0.4, 0.44], path: [0.44, 0.44, 0.47],
    centre: (f) => dwarfMonument(f), lamp: 'brazier', fence: 'bastion', gateKind: 'dwarf', gateTall: 3.6, gatePost: DWARF_STONE, gateLintel: DWARF_STONE2, stalls: [[0.35, 0.4, 0.5], [0.6, 0.35, 0.25]], tower: true, yard: 'crate',
  },
  // Elven realm: white colonnades, copper-green roofs, mallorn flets, leaf arches
  [B.Magical]: {
    houses: [elvenPavilion, mallornFlet, elvenPavilion, mallornFlet, elvenPavilion, mallornFlet],
    floor: [0.86, 0.86, 0.78], floor2: [0.8, 0.84, 0.72], path: [0.8, 0.8, 0.7],
    centre: (f) => elvenFountain(f), lamp: 'elven', lampTint: [0.75, 1, 0.65], fence: 'leafhedge', gateKind: 'elf', gateTall: 3.0, gatePost: ELF_WHITE, gateLintel: MALLORN_GOLD, stalls: [[0.4, 0.6, 0.45], [0.9, 0.8, 0.35]], yard: 'pots',
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

// ---- village layouts -------------------------------------------------------------------------
/** Round or square plaza plus the biome's centrepiece. */
function plaza(c: Ctx, st: VStyle, R: number, square = false): Frame {
  const { x: cx, z: cz } = c.site
  const f = new Frame(c, cx, cz, c.yaw)
  if (square) {
    c.box(cx, f.gy + 0.05, cz, R * 2, 0.1, R * 2, c.yaw, st.floor, 0)
    c.box(cx, f.gy + 0.08, cz, R * 1.35, 0.1, R * 1.35, c.yaw, st.floor2, 0)
  } else {
    c.disc(cx, f.gy + 0.04, cz, R, 0.1, st.floor)
    c.disc(cx, f.gy + 0.07, cz, R * 0.58, 0.1, st.floor2)
  }
  st.centre(f, c.rng)
  return f
}

function lampRing(c: Ctx, st: VStyle, r: number, n: number, phase: number) {
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * TAU
    lamp(new Frame(c, c.site.x + Math.cos(a) * r, c.site.z + Math.sin(a) * r, 0), st.lamp, st.lampTint)
  }
}

/** A house whose door faces (tx, tz). */
function house(c: Ctx, st: VStyle, i: number, x: number, z: number, tx: number, tz: number, rng: () => number) {
  st.houses[i % st.houses.length](new Frame(c, x, z, Math.atan2(tx - x, tz - z)), rng)
}

/** Short lane from a house door to a target on the road or plaza. */
function lane(c: Ctx, st: VStyle, x: number, z: number, tx: number, tz: number, w = 1.5) {
  const d = Math.hypot(tx - x, tz - z) || 1
  const k = Math.min(2.6 / d, 0.5)
  road(c, [[x + (tx - x) * k, z + (tz - z) * k], [tx, tz]], w, st.path)
}

function stallAt(c: Ctx, st: VStyle, x: number, z: number, tx: number, tz: number, rng: () => number) {
  stall(new Frame(c, x, z, Math.atan2(tx - x, tz - z)), rng, st.stalls)
}

function gateAtLocal(c: Ctx, lx: number, lz: number, dx: number, dz: number): GateDef {
  const [x, z] = c.w(lx, lz)
  const [ox, oz] = c.w(lx + dx, lz + dz)
  return { x, z, a: Math.atan2(oz - z, ox - x) }
}

function logPile(f: Frame) {
  for (let i = 0; i < 3; i++) f.log(i * 0.34 - 0.34, 0.24, 0, 0.22, 2.8, i % 2 ? LOG_A : LOG_B, 0)
  for (let i = 0; i < 2; i++) f.log(i * 0.34 - 0.17, 0.62, 0, 0.22, 2.8, i ? LOG_B : LOG_A, 0)
  f.col(0, 0, 1.4)
}

interface RingOpts {
  plazaR: number
  n: number
  rMin: number
  rMax: number
  jitter: number
  fenceR: number
  wob: number
  gates: number
  step: number
  ringRoad?: number
  curve: number
  extra: 'windmill' | 'logs' | 'none'
}

/** Houses in a ring around a round plaza, a (possibly lumpy) round fence, roads out through the gates. */
function ringVillage(c: Ctx, st: VStyle, o: RingOpts) {
  const rng = c.rng
  const { x: cx, z: cz } = c.site
  plaza(c, st, o.plazaR)
  lampRing(c, st, o.plazaR - 1.0, 4, Math.PI / 4)
  if (o.ringRoad) road(c, polyPts(cx, cz, () => o.ringRoad!, 40), 1.8, st.path, true)

  const start = rng() * TAU
  const angles: number[] = []
  for (let i = 0; i < o.n; i++) {
    const a = start + (i / o.n) * TAU + (rng() - 0.5) * o.jitter
    angles.push(a)
    const r = o.rMin + rng() * (o.rMax - o.rMin)
    const hx = cx + Math.cos(a) * r
    const hz = cz + Math.sin(a) * r
    house(c, st, i, hx, hz, cx, cz, rng)
    const lr = o.ringRoad ?? o.plazaR - 0.4
    lane(c, st, hx, hz, cx + Math.cos(a) * lr, cz + Math.sin(a) * lr)
    yardProp(c, st, hx + Math.cos(a + 0.55) * 3.1, hz + Math.sin(a + 0.55) * 3.1, rng)
  }
  const gap = (i: number) => {
    const a0 = angles[i % o.n]
    let a1 = angles[(i + 1) % o.n]
    if (a1 < a0) a1 += TAU
    return (a0 + a1) / 2
  }
  const gateIdx = Array.from({ length: o.gates }, (_, g) => Math.floor((g * o.n) / o.gates))
  const others = Array.from({ length: o.n }, (_, i) => i).filter((i) => !gateIdx.includes(i))
  const facing = (a: number) => Math.atan2(-Math.cos(a), -Math.sin(a))

  let k = 0
  if (o.extra === 'windmill') {
    const a = gap(others[k++])
    windmill(new Frame(c, cx + Math.cos(a) * 15.6, cz + Math.sin(a) * 15.6, facing(a)))
  }
  if (o.extra === 'logs') {
    for (let j = 0; j < 2 && k < others.length; j++) {
      const a = gap(others[k++])
      logPile(new Frame(c, cx + Math.cos(a) * 14.2, cz + Math.sin(a) * 14.2, facing(a) + Math.PI / 2))
    }
  }
  for (let j = 0; j < 2 && k < others.length; j++) {
    const a = gap(others[k++])
    stall(new Frame(c, cx + Math.cos(a) * (o.plazaR + 0.8), cz + Math.sin(a) * (o.plazaR + 0.8), facing(a)), rng, st.stalls)
  }

  const p1 = rng() * TAU
  const p2 = rng() * TAU
  const shape = (a: number) => o.fenceR * (1 + o.wob * (0.6 * Math.sin(3 * a + p1) + 0.4 * Math.sin(5 * a + p2)))
  const fence = polyPts(cx, cz, shape, Math.round((TAU * o.fenceR) / o.step))
  const gates: GateDef[] = gateIdx.map((i) => {
    const a = gap(i)
    return { x: cx + Math.cos(a) * shape(a), z: cz + Math.sin(a) * shape(a), a }
  })
  fenceLine(c, fence, st.fence, gates, 1.7, o.step)
  for (const g of gates) {
    gate(c, g, 1.7, st.gateTall, st.gatePost, st.gateLintel, st.lampTint ?? LAMP, st.gateKind)
    const rim = o.plazaR * 0.9
    road(c, wander(cx + Math.cos(g.a) * rim, cz + Math.sin(g.a) * rim, g.x + Math.cos(g.a) * 2.8, g.z + Math.sin(g.a) * 2.8, o.curve, 10, g.a), 2.1, st.path)
  }
  c.setCircle(o.fenceR * (1 - o.wob) - 1.2)
}

/** Rohan: a palisaded hill-town. One gate, a long avenue between golden-thatched halls, up broad steps to Meduseld on its stone terrace. */
function rohanVillage(c: Ctx, st: VStyle) {
  const rng = c.rng
  const hw = 10.6
  const hd = 14.4
  road(c, [c.w(0, -hd - 2.5), c.w(0, 3.2)], 3.0, st.path)
  // Meduseld on a stone terrace, door facing the gate
  const [hx, hz] = c.w(0, 8.65)
  const [fx, fz] = c.w(0, -40)
  const pf = new Frame(c, hx, hz, c.yaw)
  c.box(hx, pf.gy + 0.45, hz, 11, 1.1, 10.6, c.yaw, [0.58, 0.56, 0.52], 1)
  c.box(hx, pf.gy + 1.02, hz, 10.6, 0.1, 10.2, c.yaw, [0.64, 0.62, 0.57], 0)
  for (let k = 0; k < 4; k++) {
    const [sx, sz] = c.w(0, 3.1 - k * 0.55)
    c.box(sx, pf.gy + ((4 - k) * 0.25) / 2 - 0.05, sz, 5.4, (4 - k) * 0.25 + 0.1, 0.6, c.yaw, [0.6, 0.58, 0.54], 0.5)
  }
  for (const s of [-1, 1]) {
    const [bx, bz] = c.w(s * 3.3, 3.4)
    c.box(bx, pf.gy + 0.4, bz, 0.9, 0.8, 0.7, c.yaw, [0.55, 0.53, 0.5], 1)
  }
  const hall = new Frame(c, hx, hz, Math.atan2(fx - hx, fz - hz))
  hall.gy += 1.05
  rohanHall(hall, rng, true)
  for (const [lx, lz] of [[-3.6, 6.4], [3.6, 6.4], [-3.6, 11.4], [3.6, 11.4], [0, 8.6]] as Pt[]) {
    const [x, z] = c.w(lx, lz)
    c.col(x, z, 3.0)
  }
  // small plaza with the standard, halls fronting the avenue
  const [px, pz] = c.w(0, -3.4)
  const pfm = new Frame(c, px, pz, c.yaw)
  c.disc(px, pfm.gy + 0.04, pz, 3.4, 0.1, st.floor)
  st.centre(pfm, rng)
  const rows = [-10.6, -6.6, -0.6]
  let i = 0
  for (const side of [-1, 1]) {
    for (const lz of rows) {
      const lx = side * 6.5
      const [x, z] = c.w(lx, lz)
      const [tx, tz] = c.w(0, lz)
      house(c, st, i++, x, z, tx, tz, rng)
      lane(c, st, x, z, tx, tz, 1.4)
      const [yx, yz] = c.w(lx + side * 2.6, lz + 2.4)
      yardProp(c, st, yx, yz, rng)
    }
  }
  for (const [lx, lz] of [[-2.5, -12], [2.5, -12], [-2.5, -8.6], [2.5, -8.6], [-2.5, 1.2], [2.5, 1.2]] as Pt[]) {
    const [x, z] = c.w(lx, lz)
    lamp(new Frame(c, x, z, 0), st.lamp, st.lampTint)
  }
  const [stx, stz] = c.w(-3.1, 1.8)
  const [stt, sttz] = c.w(0, 1.8)
  stallAt(c, st, stx, stz, stt, sttz, rng)
  const corners: Pt[] = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]
  const gates = [gateAtLocal(c, 0, -hd, 0, -1)]
  fenceLine(c, corners.map(([lx, lz]) => c.w(lx, lz)), st.fence, gates, 2.0, 1.1)
  for (const g of gates) gate(c, g, 1.9, st.gateTall, st.gatePost, st.gateLintel, st.lampTint ?? LAMP, st.gateKind)
  for (const [lx, lz] of corners) {
    const [x, z] = c.w(lx, lz)
    turret(c, x, z, 4.6, LOG_B, GOLD_THATCH, 'log')
  }
  c.setRect(hw - 0.9, hd - 0.9)
}

/** Dwarf-hold: a stone fortress, long avenue lined with halls, brazier plaza, keeps and square corner towers. */
function mountainVillage(c: Ctx, st: VStyle) {
  const rng = c.rng
  const hw = 10
  const hd = 14
  road(c, [c.w(0, -hd - 2.5), c.w(0, hd + 2.5)], 2.8, st.path)
  const [px, pz] = c.w(0, 2)
  const f = new Frame(c, px, pz, c.yaw)
  c.disc(px, f.gy + 0.04, pz, 4.2, 0.1, st.floor)
  c.disc(px, f.gy + 0.07, pz, 2.5, 0.1, st.floor2)
  st.centre(f, rng)
  for (const [lx, lz] of [[-3.4, -1.2], [3.4, -1.2], [-3.4, 5.2], [3.4, 5.2]] as Pt[]) {
    const [x, z] = c.w(lx, lz)
    lamp(new Frame(c, x, z, 0), st.lamp, st.lampTint)
  }
  const rows = [-10, -4.8, 0.6, 6.2]
  let i = 0
  for (const side of [-1, 1]) {
    for (const lz of rows) {
      const lx = side * 7.2
      const [x, z] = c.w(lx, lz)
      const [tx, tz] = c.w(0, lz)
      house(c, st, i++, x, z, tx, tz, rng)
      lane(c, st, x, z, tx, tz, 1.4)
      const [yx, yz] = c.w(lx + side * 2.5, lz + 2.8)
      yardProp(c, st, yx, yz, rng)
    }
  }
  for (const side of [-1, 1]) {
    const [x, z] = c.w(side * 6.8, 11.4)
    const [ax, az] = c.w(0, 11.4)
    dwarfKeep(new Frame(c, x, z, Math.atan2(ax - x, az - z)))
  }
  const [sx, sz] = c.w(-3.3, -8.2)
  const [stx, stz] = c.w(0, -8.2)
  stallAt(c, st, sx, sz, stx, stz, rng)
  const corners: Pt[] = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]
  const gates = [gateAtLocal(c, 0, -hd, 0, -1), gateAtLocal(c, 0, hd, 0, 1)]
  fenceLine(c, corners.map(([lx, lz]) => c.w(lx, lz)), st.fence, gates, 2.0, 1.3)
  for (const g of gates) gate(c, g, 1.9, st.gateTall + 0.6, st.gatePost, st.gateLintel, st.lampTint ?? LAMP, st.gateKind)
  for (const [lx, lz] of corners) {
    const [x, z] = c.w(lx, lz)
    turret(c, x, z, 4.8, DWARF_STONE, DWARF_STONE2, 'square')
  }
  c.setRect(hw - 0.9, hd - 0.9)
}

/** Lake-town: a plank street on piles between tall lake-houses, harbour market in the middle, rope rails. */
function tropicalVillage(c: Ctx, st: VStyle) {
  const rng = c.rng
  const rx = 17.2
  const rz = 12.4
  const bend = (lx: number) => Math.sin(lx * 0.22) * 1.5
  const street: Pt[] = []
  for (let lx = -rx - 2.5; lx <= rx + 2.5; lx += 2.2) street.push(c.w(lx, bend(lx)))
  boardwalk(c, street, 3.0)
  plaza(c, st, 4.4)
  lampRing(c, st, 3.6, 4, Math.PI / 4)
  const xs = [-12.6, -7.4, 7.4, 12.6]
  let i = 0
  for (const side of [-1, 1]) {
    for (const lx of xs) {
      const lz = side * (6.6 + (i % 2) * 1.5)
      const [x, z] = c.w(lx, lz)
      const [tx, tz] = c.w(lx, bend(lx) + side * 1.3)
      if (lx === 12.6 && side === 1) lakeHouse(new Frame(c, x, z, Math.atan2(tx - x, tz - z)), rng, true)
      else house(c, st, i, x, z, tx, tz, rng)
      i++
      boardwalk(c, wander(...c.w(lx, bend(lx) + side * 1.3), ...c.w(lx + 0.0, lz - side * 2.6), 0.5, 3, i), 1.3)
      const [yx, yz] = c.w(lx + 3.1, lz)
      yardProp(c, st, yx, yz, rng)
    }
  }
  for (const side of [-1, 1]) {
    const [x, z] = c.w(side * 1.0, side * 5.4 + bend(0))
    const [tx, tz] = c.w(side * 1.0, bend(0))
    stallAt(c, st, x, z, tx, tz, rng)
  }
  const oval: Pt[] = []
  const n = 76
  for (let k = 0; k < n; k++) {
    const t = (k / n) * TAU
    oval.push(c.w(Math.cos(t) * rx, Math.sin(t) * rz))
  }
  const gates = [gateAtLocal(c, rx, bend(rx), 1, 0), gateAtLocal(c, -rx, bend(-rx), -1, 0)]
  fenceLine(c, oval, st.fence, gates, 1.9, 1.3)
  for (const g of gates) gate(c, g, 1.7, st.gateTall, st.gatePost, st.gateLintel, st.lampTint ?? LAMP, st.gateKind)
  c.setEllipse(rx - 1.2, rz - 1.2)
}

/** Swamp: huts scattered at odd distances, plank boardwalks instead of roads, a broken reed fence. */
function swampVillage(c: Ctx, st: VStyle) {
  const rng = c.rng
  const { x: cx, z: cz } = c.site
  const f = new Frame(c, cx, cz, c.yaw)
  c.disc(cx, f.gy + 0.04, cz, 3.8, 0.1, st.floor)
  st.centre(f, rng)
  lampRing(c, st, 4.4, 3, 0.4)
  const start = rng() * TAU
  const n = 7
  const angles: number[] = []
  for (let i = 0; i < n; i++) {
    const a = start + (i / n) * TAU + (rng() - 0.5) * 0.7
    angles.push(a)
    const r = 8 + rng() * 6
    const hx = cx + Math.cos(a) * r
    const hz = cz + Math.sin(a) * r
    house(c, st, i, hx, hz, cx, cz, rng)
    const sx = hx + (cx - hx) * 0.2
    const sz = hz + (cz - hz) * 0.2
    boardwalk(c, wander(sx, sz, cx + Math.cos(a) * 3.6, cz + Math.sin(a) * 3.6, 1.6, Math.max(3, Math.round(r / 1.9)), i), 1.4)
    yardProp(c, st, hx + Math.cos(a + 1.1) * 3.2, hz + Math.sin(a + 1.1) * 3.2, rng)
  }
  const p1 = rng() * TAU
  const p2 = rng() * TAU
  const R = 17.2
  const shape = (a: number) => R * (1 + 0.07 * (0.6 * Math.sin(3 * a + p1) + 0.4 * Math.sin(5 * a + p2)))
  const gates: GateDef[] = [0, 2, 4].map((i) => {
    const a = (angles[i] + angles[i + 1]) / 2
    return { x: cx + Math.cos(a) * shape(a), z: cz + Math.sin(a) * shape(a), a }
  })
  fenceLine(c, polyPts(cx, cz, shape, 70), st.fence, gates, 2.0, 1.3, 0.16)
  for (const g of gates) {
    gate(c, g, 1.9, st.gateTall, st.gatePost, st.gateLintel, st.lampTint ?? LAMP, st.gateKind)
    boardwalk(c, wander(cx + Math.cos(g.a) * 4.4, cz + Math.sin(g.a) * 4.4, g.x + Math.cos(g.a) * 2.6, g.z + Math.sin(g.a) * 2.6, 2.0, 9, g.a), 1.6)
  }
  const a = (angles[5] + angles[6]) / 2
  stall(new Frame(c, cx + Math.cos(a) * 6.2, cz + Math.sin(a) * 6.2, Math.atan2(-Math.cos(a), -Math.sin(a))), rng, st.stalls)
  c.setCircle(R * 0.93 - 1.0)
}

/** Elven realm: six pavilions and mallorn flets in a hexagon, a ring road and six spokes, a golden leaf-hedge with mallorn groves. */
function magicalVillage(c: Ctx, st: VStyle) {
  const rng = c.rng
  const { x: cx, z: cz } = c.site
  const off = rng() * TAU
  const hAng = (i: number) => off + (i / 6) * TAU
  const sAng = (i: number) => off + ((i + 0.5) / 6) * TAU
  road(c, polyPts(cx, cz, () => 7.3, 44), 1.7, st.path, true)
  for (let i = 0; i < 6; i++) {
    const a = sAng(i)
    const reach = i % 2 === 0 ? 20.4 : 12.8
    road(c, [[cx + Math.cos(a) * 4.0, cz + Math.sin(a) * 4.0], [cx + Math.cos(a) * reach, cz + Math.sin(a) * reach]], 2.0, st.path)
  }
  plaza(c, st, 4.6)
  for (let i = 0; i < 6; i++) {
    const a = hAng(i)
    const hx = cx + Math.cos(a) * 10.8
    const hz = cz + Math.sin(a) * 10.8
    house(c, st, i, hx, hz, cx, cz, rng)
    lane(c, st, hx, hz, cx + Math.cos(a) * 7.3, cz + Math.sin(a) * 7.3, 1.3)
    lamp(new Frame(c, cx + Math.cos(a) * 7.3 + Math.cos(a + 1.57) * 1.5, cz + Math.sin(a) * 7.3 + Math.sin(a + 1.57) * 1.5, 0), st.lamp, st.lampTint)
    mallornTree(new Frame(c, cx + Math.cos(a) * 16.4, cz + Math.sin(a) * 16.4, rng() * 6), 6.5, 0.8)
    yardProp(c, st, hx + Math.cos(a + 0.7) * 3.4, hz + Math.sin(a + 0.7) * 3.4, rng)
  }
  const R = 18.7
  const gates: GateDef[] = [0, 2, 4].map((i) => ({ x: cx + Math.cos(sAng(i)) * R, z: cz + Math.sin(sAng(i)) * R, a: sAng(i) }))
  fenceLine(c, polyPts(cx, cz, () => R, Math.round((TAU * R) / 1.3)), st.fence, gates, 1.9, 1.3)
  for (const g of gates) gate(c, g, 1.7, st.gateTall, st.gatePost, st.gateLintel, st.lampTint ?? LAMP, st.gateKind)
  for (const i of [1, 3, 5]) {
    const a = sAng(i)
    mallornTree(new Frame(c, cx + Math.cos(a) * 15.0, cz + Math.sin(a) * 15.0, 0), 8.6, 1.1)
  }
  c.setCircle(R - 1.4)
}

const LAYOUTS: Record<number, (c: Ctx, st: VStyle) => void> = {
  [B.Grass]: (c, st) => ringVillage(c, st, { plazaR: 5.8, n: 7, rMin: 10.8, rMax: 12.6, jitter: 0.12, fenceR: 18.4, wob: 0, gates: 3, step: 1.3, ringRoad: 8.2, curve: 0, extra: 'windmill' }),
  [B.Forest]: rohanVillage,
  [B.Snow]: (c, st) => ringVillage(c, st, { plazaR: 5.0, n: 6, rMin: 9.2, rMax: 10.4, jitter: 0.08, fenceR: 16.2, wob: 0, gates: 2, step: 1.2, ringRoad: 7.4, curve: 0, extra: 'none' }),
  [B.Desert]: (c, st) => ringVillage(c, st, { plazaR: 5.6, n: 7, rMin: 10.6, rMax: 12.6, jitter: 0.18, fenceR: 18.2, wob: 0.02, gates: 3, step: 1.3, curve: 1.2, extra: 'none' }),
  [B.Mountain]: mountainVillage,
  [B.Tropical]: tropicalVillage,
  [B.Swamp]: swampVillage,
  [B.Magical]: magicalVillage,
}

function village(c: Ctx) {
  const biome = biomeAt(c.site.x, c.site.z)
  const st = STYLES[biome] ?? STYLES[B.Grass]
  ;(LAYOUTS[biome] ?? LAYOUTS[B.Grass])(c, st)
}

// ------------------------------------------------------------------------------------------------ camp
/** The spawn camp: a fire ring with log seats, a canvas tent, a statue of the hero and a signpost. */
function camp(c: Ctx) {
  const cx = c.site.x
  const cz = c.site.z
  const rng = c.rng
  const gy = heightAt(cx, cz)
  c.disc(cx, gy + 0.04, cz, 7.2, 0.1, [0.52, 0.42, 0.3])
  c.disc(cx, gy + 0.07, cz, 4.6, 0.1, [0.46, 0.37, 0.26])
  const fire = new Frame(c, cx, cz, c.yaw)
  // fire ring (the animated flames live in CampFire.tsx)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    fire.box(Math.cos(a) * 1.1, 0.16, Math.sin(a) * 1.1, 0.46, 0.32, 0.4, i % 2 ? [0.55, 0.53, 0.5] : [0.46, 0.44, 0.42])
  }
  fire.disc(0, 0.12, 0, 0.85, 0.1, [0.12, 0.08, 0.06])
  fire.disc(0, 0.2, 0, 0.55, 0.06, [1, 0.45, 0.1], 1.6)
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
    g = { parts: c.parts, cols: c.cols, inside: c.inside }
    cache.set(key, g)
  }
  return g
}

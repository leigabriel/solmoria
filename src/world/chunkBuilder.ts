import * as THREE from 'three'
import { CHUNK_SEGMENTS, CHUNK_SIZE, WORLD_SEED, type QualitySettings } from '../game/config'
import { hashInts, mulberry32 } from '../utils/random'
import { srgb } from '../utils/textures'
import { assets } from './assets'
import { forestMask, meadowMask } from './biome'
import { NO_WATER } from './hydrology'
import { PropBatch } from './propBatch'
import { getChunkData } from './scatter'
import { biomeAt, depthAt, heightAt, shoreAt, siteClearance, slopeAt, VERTS, world, WORLD_HALF } from './terrainData'
import { B, BIOMES } from './biomes'
import { ASH_BUSH, DARK_BUSH, DRY_BUSH, FERN_PARTS, FROST_BUSH, GLOW_BUSH, SWAMP_BUSH, TROPIC_BUSH, PALETTE, PALETTE_KEYS, ROUND_BUSH, TPL, TREE_PARTS, type Part } from './templates'
import type { Template } from './propBatch'

const UP = new THREE.Vector3(0, 1, 0)
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _base = new THREE.Matrix4()
const _loc = new THREE.Matrix4()
const _M = new THREE.Matrix4()
const _c = new THREE.Color()

const STEM = srgb(0.26, 0.5, 0.16)
const BARK = srgb(0.36, 0.24, 0.15)

function setBase(x: number, y: number, z: number, yaw: number, s = 1) {
  _q.setFromAxisAngle(UP, yaw)
  _base.compose(_p.set(x, y, z), _q, _s.set(s, s, s))
}

function put(b: PropBatch, t: Template, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, rx: number, ry: number, rz: number, color: THREE.Color, stip = 0, emis = 0, moss = 0) {
  _e.set(rx, ry, rz)
  _q.setFromEuler(_e)
  _loc.compose(_p.set(lx, ly, lz), _q, _s.set(sx, sy, sz))
  _M.multiplyMatrices(_base, _loc)
  b.add(t, _M, color, stip, emis, moss)
}

function putParts(b: PropBatch, parts: Part[], v: number) {
  for (const p of parts) {
    _M.multiplyMatrices(_base, p.m)
    b.add(p.t, _M, _c.copy(p.a).lerp(p.b, v), p.stip, p.emis, p.moss)
  }
}

// ---------------------------------------------------------------------------------------------- terrain
function terrainMesh(cx: number, cz: number, ao: Float32Array) {
  const N = CHUNK_SEGMENTS
  const n1 = N + 1
  const ox = cx * CHUNK_SIZE + WORLD_HALF
  const oz = cz * CHUNK_SIZE + WORLD_HALF
  const pos = new Float32Array(n1 * n1 * 3)
  const nor = new Float32Array(n1 * n1 * 3)
  const shore = new Float32Array(n1 * n1)
  const h = world.h
  const at = (ix: number, iz: number) => h[Math.min(VERTS - 1, Math.max(0, iz)) * VERTS + Math.min(VERTS - 1, Math.max(0, ix))]
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const ix = ox + i
      const iz = oz + j
      const k = j * n1 + i
      pos[k * 3] = ix - WORLD_HALF
      pos[k * 3 + 1] = h[iz * VERTS + ix]
      pos[k * 3 + 2] = iz - WORLD_HALF
      const nx = (at(ix - 1, iz) - at(ix + 1, iz)) * 0.5
      const nz = (at(ix, iz - 1) - at(ix, iz + 1)) * 0.5
      const l = Math.hypot(nx, 1, nz)
      nor[k * 3] = nx / l
      nor[k * 3 + 1] = 1 / l
      nor[k * 3 + 2] = nz / l
      shore[k] = world.shore[iz * VERTS + ix]
    }
  }
  const idx = new Uint16Array(N * N * 6)
  let t = 0
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * n1 + i
      const b = a + 1
      const c = a + n1
      const d = c + 1
      idx[t++] = a
      idx[t++] = c
      idx[t++] = b
      idx[t++] = b
      idx[t++] = c
      idx[t++] = d
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  g.setAttribute('aShore', new THREE.BufferAttribute(shore, 1))
  g.setAttribute('aAO', new THREE.BufferAttribute(ao, 1))
  g.setIndex(new THREE.BufferAttribute(idx, 1))
  g.computeBoundingSphere()
  const m = new THREE.Mesh(g, assets.terrainMat)
  m.receiveShadow = true
  m.userData.own = true
  return m
}

/** Bake soft contact shadows of nearby props into per-vertex values (replaces a transparent decal pass). */
function bakeAO(cx: number, cz: number) {
  const N = CHUNK_SEGMENTS
  const n1 = N + 1
  const ao = new Float32Array(n1 * n1)
  const x0 = cx * CHUNK_SIZE
  const z0 = cz * CHUNK_SIZE
  const stamp = (px: number, pz: number, r: number, k: number) => {
    const i0 = Math.max(0, Math.floor(px - r - x0))
    const i1 = Math.min(N, Math.ceil(px + r - x0))
    const j0 = Math.max(0, Math.floor(pz - r - z0))
    const j1 = Math.min(N, Math.ceil(pz + r - z0))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(x0 + i - px, z0 + j - pz) / r
        if (d < 1) {
          const v = (1 - d) * (1 - d) * k
          if (v > ao[j * n1 + i]) ao[j * n1 + i] = v
        }
      }
    }
  }
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const d = getChunkData(cx + dx, cz + dz)
      for (const t of d.trees) stamp(t.x + 0.3, t.z + 0.3, 2.4 * t.s, 0.95)
      for (const b of d.bushes) stamp(b.x + 0.2, b.z + 0.2, 1.6 * b.s, 0.7)
      for (const r of d.rocks) if (r.kind !== 'flat') stamp(r.x + 0.2, r.z + 0.2, 1.3 * r.s, 0.6)
      for (const c of d.colliders) if (c.r < 0.6) stamp(c.x, c.z, 1.1, 0.35)
    }
  }
  return ao
}

// ---------------------------------------------------------------------------------------------- water
function waterMesh(cx: number, cz: number) {
  const N = CHUNK_SEGMENTS
  const n1 = N + 1
  const ox = cx * CHUNK_SIZE + WORLD_HALF
  const oz = cz * CHUNK_SIZE + WORLD_HALF
  let any = false
  for (let j = 0; j <= N && !any; j++) for (let i = 0; i <= N; i++) if (world.depth[(oz + j) * VERTS + ox + i] > 0.01) { any = true; break }
  if (!any) return null
  const pos = new Float32Array(n1 * n1 * 3)
  const dep = new Float32Array(n1 * n1)
  const flow = new Float32Array(n1 * n1 * 2)
  // Dry vertices borrow the nearest water level so signed depth crosses zero exactly at the shoreline.
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const gx = ox + i
      const gz = oz + j
      const c = gz * VERTS + gx
      const k = j * n1 + i
      let lvl = world.wl[c]
      let fx = world.flowX[c]
      let fz = world.flowZ[c]
      if (!(lvl > NO_WATER / 2) || world.depth[c] <= 0) {
        lvl = NO_WATER
        for (let dz = -2; dz <= 2; dz++) {
          for (let dx = -2; dx <= 2; dx++) {
            const x = gx + dx
            const z = gz + dz
            if (x < 0 || z < 0 || x >= VERTS || z >= VERTS) continue
            const cc = z * VERTS + x
            if (world.depth[cc] > 0 && world.wl[cc] > lvl) {
              lvl = world.wl[cc]
              fx = world.flowX[cc]
              fz = world.flowZ[cc]
            }
          }
        }
      }
      const hh = world.h[c]
      const d = lvl > NO_WATER / 2 ? Math.max(-1, lvl - hh) : -1
      pos[k * 3] = gx - WORLD_HALF
      pos[k * 3 + 1] = lvl > NO_WATER / 2 ? lvl : hh - 0.5
      pos[k * 3 + 2] = gz - WORLD_HALF
      dep[k] = d
      flow[k * 2] = fx
      flow[k * 2 + 1] = fz
    }
  }
  const idx: number[] = []
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * n1 + i
      const b = a + 1
      const c = a + n1
      const d = c + 1
      if (dep[a] > 0 || dep[b] > 0 || dep[c] > 0 || dep[d] > 0) idx.push(a, c, b, b, c, d)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('aDepth', new THREE.BufferAttribute(dep, 1))
  g.setAttribute('aFlow', new THREE.BufferAttribute(flow, 2))
  g.setIndex(idx)
  g.computeBoundingSphere()
  const m = new THREE.Mesh(g, assets.waterMat)
  m.renderOrder = 2
  m.userData.own = true
  return m
}

/** Lava sheet: one quad per grid cell that has lava above the ground; vertices without lava sink under the terrain. */
function lavaMesh(cx: number, cz: number) {
  const N = CHUNK_SEGMENTS
  const n1 = N + 1
  const ox = cx * CHUNK_SIZE + WORLD_HALF
  const oz = cz * CHUNK_SIZE + WORLD_HALF
  const ok = new Uint8Array(n1 * n1)
  const pos = new Float32Array(n1 * n1 * 3)
  let any = false
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const c = (oz + j) * VERTS + ox + i
      const k = j * n1 + i
      const l = world.lava[c]
      const hh = world.h[c]
      const live = l > NO_WATER / 2 && l > hh - 0.02
      ok[k] = live ? 1 : 0
      if (live) any = true
      pos[k * 3] = ox + i - WORLD_HALF
      pos[k * 3 + 1] = live ? l : hh - 0.6
      pos[k * 3 + 2] = oz + j - WORLD_HALF
    }
  }
  if (!any) return null
  const idx: number[] = []
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * n1 + i
      const b = a + 1
      const c = a + n1
      const d = c + 1
      if (ok[a] + ok[b] + ok[c] + ok[d] >= 2) idx.push(a, c, b, b, c, d)
    }
  }
  if (!idx.length) return null
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeBoundingSphere()
  const m = new THREE.Mesh(g, assets.lavaMat)
  m.userData.own = true
  return m
}

function fallObjects(cx: number, cz: number) {
  const out: THREE.Object3D[] = []
  const x0 = cx * CHUNK_SIZE
  const z0 = cz * CHUNK_SIZE
  for (const f of world.falls) {
    const n = f.pts.length / 3
    const mi = Math.floor(n / 2) * 3
    const mx = f.pts[mi]
    const mz = f.pts[mi + 2]
    if (mx < x0 || mx >= x0 + CHUNK_SIZE || mz < z0 || mz >= z0 + CHUNK_SIZE) continue
    const pos: number[] = []
    const uv: number[] = []
    const idx: number[] = []
    let len = 0
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1) * 3
      const b = Math.min(n - 1, i + 1) * 3
      let tx = f.pts[b] - f.pts[a]
      let tz = f.pts[b + 2] - f.pts[a + 2]
      const tl = Math.hypot(tx, tz) || 1
      tx /= tl
      tz /= tl
      if (i > 0) len += Math.hypot(f.pts[i * 3] - f.pts[(i - 1) * 3], f.pts[i * 3 + 1] - f.pts[(i - 1) * 3 + 1], f.pts[i * 3 + 2] - f.pts[(i - 1) * 3 + 2])
      const hw = f.width * 0.5 * 1.1
      const px = f.pts[i * 3]
      const py = f.pts[i * 3 + 1]
      const pz = f.pts[i * 3 + 2]
      pos.push(px + tz * hw, py, pz - tx * hw, px - tz * hw, py, pz + tx * hw)
      uv.push(0, len, 1, len)
      if (i < n - 1) {
        const k = i * 2
        idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('aUv', new THREE.Float32BufferAttribute(uv, 2))
    g.setIndex(idx)
    g.computeBoundingSphere()
    const sheet = new THREE.Mesh(g, assets.fallMat)
    sheet.renderOrder = 3
    sheet.userData.own = true
    out.push(sheet)

    // mist rising from the plunge pool
    const bx = f.pts[(n - 1) * 3]
    const by = f.pts[(n - 1) * 3 + 1]
    const bz = f.pts[(n - 1) * 3 + 2]
    const rng = mulberry32(hashInts(Math.round(bx), Math.round(bz), 77))
    const count = 26
    const mp: number[] = []
    const ph: number[] = []
    const sz: number[] = []
    for (let i = 0; i < count; i++) {
      mp.push(bx + (rng() - 0.5) * f.width * 1.2, by - 0.1 + rng() * 0.3, bz + (rng() - 0.3) * 2.2)
      ph.push(rng())
      sz.push(0.9 + rng() * 1.1)
    }
    const mg = new THREE.BufferGeometry()
    mg.setAttribute('position', new THREE.Float32BufferAttribute(mp, 3))
    mg.setAttribute('aPhase', new THREE.Float32BufferAttribute(ph, 1))
    mg.setAttribute('aSize', new THREE.Float32BufferAttribute(sz, 1))
    mg.boundingSphere = new THREE.Sphere(new THREE.Vector3(bx, by + 2, bz), f.width + 6)
    const mist = new THREE.Points(mg, assets.mistMat)
    mist.renderOrder = 4
    mist.userData.own = true
    out.push(mist)
  }
  return out
}

// ---------------------------------------------------------------------------------------------- grass
const villageSites = world.sites.filter((s) => s.type === 'village')
const inVillage = (x: number, z: number) => villageSites.some((v) => Math.hypot(v.x - x, v.z - z) < 16)

function* grassStep(cx: number, cz: number, q: QualitySettings, group: THREE.Group): Generator<void> {
  const rng = mulberry32(hashInts(cx, cz, WORLD_SEED, 11))
  const x0 = cx * CHUNK_SIZE
  const z0 = cz * CHUNK_SIZE
  const candidates = Math.round(CHUNK_SIZE * CHUNK_SIZE * q.grassDensity)
  const keep: number[] = []
  for (let i = 0; i < candidates; i++) {
    const x = x0 + rng() * CHUNK_SIZE
    const z = z0 + rng() * CHUNK_SIZE
    const a = rng()
    const b = rng()
    const c = rng()
    if (i % 1500 === 1499) yield
    if (depthAt(x, z) > 0) continue
    const gb = BIOMES[biomeAt(x, z)].grass
    if (gb.density < 1 && a > gb.density) continue
    const shore = shoreAt(x, z)
    if (shore > 0.72) continue
    if (slopeAt(x, z) > 0.9) continue
    const clear = siteClearance(x, z)
    if (inVillage(x, z) && a > 0.06) continue
    const dens = Math.min(1, 0.55 + meadowMask(x, z) * 0.35 + (1 - forestMask(x, z)) * 0.2) * (1 - shore * 0.85) * (clear < 0 ? 0.35 : 1)
    if (a > dens) continue
    keep.push(x, z, b, c, rng())
  }
  const n = keep.length / 5
  if (!n) return
  const mesh = new THREE.InstancedMesh(assets.grassGeo, assets.grassMat, n)
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
  for (let i = 0; i < n; i++) {
    const x = keep[i * 5]
    const z = keep[i * 5 + 1]
    const yaw = (keep[i * 5 + 2] - 0.5) * 1.0 // stay roughly camera-facing so the "| \ /" spikes read
    const sw = 0.85 + keep[i * 5 + 3] * 0.5
    const gb = BIOMES[biomeAt(x, z)].grass
    const sh = (0.55 + keep[i * 5 + 4] * 0.55) * gb.height
    _q.setFromAxisAngle(UP, yaw)
    _loc.compose(_p.set(x, heightAt(x, z) - 0.02, z), _q, _s.set(sw, sh, sw))
    mesh.setMatrixAt(i, _loc)
    _c.setHSL(gb.hsl[0] + (keep[i * 5 + 3] - 0.5) * 0.05, gb.hsl[1] + keep[i * 5 + 4] * 0.12, gb.hsl[2] - 0.03 + keep[i * 5 + 2] * 0.12, THREE.SRGBColorSpace)
    mesh.setColorAt(i, _c)
  }
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.receiveShadow = true
  mesh.computeBoundingSphere()
  mesh.userData.own = true
  group.add(mesh)
}

// ---------------------------------------------------------------------------------------------- props
const BUSH_BLOOMS: (keyof typeof PALETTE)[] = ['white', 'pink', 'magenta', 'purple', 'yellow']
const SOLID_STONE = srgb(0.62, 0.43, 0.22)
const SOLID_STONE2 = srgb(0.47, 0.36, 0.22)
const GREY_STONE = srgb(0.56, 0.54, 0.5)
const GREY_STONE2 = srgb(0.44, 0.44, 0.42)
const REED_A = srgb(0.55, 0.58, 0.22)
const REED_B = srgb(0.4, 0.52, 0.2)
const CATTAIL = srgb(0.34, 0.2, 0.1)
const PAD = srgb(0.22, 0.5, 0.22)
const BERRY = srgb(0.85, 0.15, 0.2)

function addBush(b: PropBatch, bu: ReturnType<typeof getChunkData>['bushes'][number]) {
  setBase(bu.x, bu.y, bu.z, bu.r, bu.s)
  const rng = mulberry32(hashInts(Math.round(bu.x * 10), Math.round(bu.z * 10), 9))
  switch (bu.kind) {
    case 'round':
      putParts(b, bu.v > 0.6 ? DARK_BUSH : ROUND_BUSH, bu.v)
      break
    case 'fern':
      putParts(b, FERN_PARTS, bu.v)
      break
    case 'dry':
      putParts(b, DRY_BUSH, bu.v)
      break
    case 'frost':
      putParts(b, FROST_BUSH, bu.v)
      break
    case 'glow':
      putParts(b, GLOW_BUSH, bu.v)
      break
    case 'tropic':
      putParts(b, TROPIC_BUSH, bu.v)
      break
    case 'swamp':
      putParts(b, SWAMP_BUSH, bu.v)
      break
    case 'ash':
      putParts(b, ASH_BUSH, bu.v)
      break
    case 'flowering':
    case 'berry': {
      putParts(b, DARK_BUSH, bu.v)
      const bloom = bu.kind === 'berry' ? BERRY : PALETTE[BUSH_BLOOMS[bu.palette]]
      const n = bu.kind === 'berry' ? 9 : 14
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2
        const el = 0.3 + rng() * 0.95
        const px = Math.cos(a) * Math.cos(el) * 0.97
        const py = 0.55 + Math.sin(el) * 0.8 * 0.97
        const pz = Math.sin(a) * Math.cos(el) * 0.97
        if (bu.kind === 'berry') put(b, TPL.sphere, px, py, pz, 0.07, 0.07, 0.07, 0, 0, 0, bloom, 0, 0.2)
        else put(b, TPL.discTilt, px, py + 0.02, pz, 0.15, 0.15, 0.15, 0, a, 0, bloom, 0, 0.3)
      }
      break
    }
  }
}

function addFlower(b: PropBatch, f: ReturnType<typeof getChunkData>['flowers'][number]) {
  setBase(f.x, f.y, f.z, f.r, f.glow ? 1.15 : 1)
  const s = f.s
  const col = PALETTE[PALETTE_KEYS[f.c1]]
  switch (f.kind) {
    case 'dots':
      put(b, TPL.discTilt, 0, 0.07 * s, 0, 0.055 * s, 0.055 * s, 0.055 * s, 0, 0, 0, col, 0, 0.3)
      break
    case 'clover':
      put(b, TPL.discTilt, 0, 0.05 * s, 0, 0.045 * s, 0.045 * s, 0.045 * s, 0, 0, 0, col, 0, 0.3)
      break
    case 'daisy':
      put(b, TPL.stem, 0, 0, 0, 0.012 * s, 0.2 * s, 0.012 * s, 0, 0, 0, STEM)
      put(b, TPL.petals6, 0, 0.2 * s, 0, 0.24 * s, 1, 0.24 * s, 0.8, f.r, 0, col, 0, 0.3)
      put(b, TPL.discTilt, 0, 0.205 * s, 0, 0.032 * s, 0.032 * s, 0.032 * s, 0, 0, 0, PALETTE.yellow, 0, 0.4)
      break
    case 'tulip':
      put(b, TPL.stem, 0, 0, 0, 0.012 * s, 0.2 * s, 0.012 * s, 0, 0, 0, STEM)
      put(b, TPL.cup, 0, 0.19 * s, 0, 0.065 * s, 0.14 * s, 0.065 * s, 0, 0, 0, col, 0, 0.25)
      break
    case 'poppy':
      put(b, TPL.stem, 0, 0, 0, 0.012 * s, 0.28 * s, 0.012 * s, 0, 0, 0, STEM)
      put(b, TPL.petals5, 0, 0.28 * s, 0, 0.32 * s, 1, 0.32 * s, 0.7, f.r, 0, col, 0, 0.3)
      put(b, TPL.discTilt, 0, 0.285 * s, 0, 0.026 * s, 0.026 * s, 0.026 * s, 0, 0, 0, _c.setRGB(0.05, 0.03, 0.03), 0, 0)
      break
    case 'bluebell':
      put(b, TPL.stem, 0, 0, 0, 0.01 * s, 0.32 * s, 0.01 * s, 0, 0, 0.18, STEM)
      for (let i = 0; i < 4; i++) put(b, TPL.sphere, 0.055 * s + i * 0.004, (0.3 - i * 0.055) * s, 0, 0.035 * s, 0.04 * s, 0.035 * s, 0, 0, 0, col, 0, 0.25)
      break
    case 'lavender':
      put(b, TPL.stem, 0, 0, 0, 0.01 * s, 0.12 * s, 0.01 * s, 0, 0, 0, STEM)
      put(b, TPL.cone, 0, 0.1 * s, 0, 0.034 * s, 0.26 * s, 0.034 * s, 0, 0, 0, col, 0, 0.25)
      put(b, TPL.cone, 0.04 * s, 0.08 * s, 0.02, 0.026 * s, 0.2 * s, 0.026 * s, 0, 0, -0.2, col, 0, 0.25)
      break
    case 'sunflower':
      put(b, TPL.stem, 0, 0, 0, 0.022 * s, 0.85 * s, 0.022 * s, 0, 0, 0, STEM)
      put(b, TPL.petals9, 0, 0.85 * s, 0, 0.5 * s, 1, 0.5 * s, 1.0, f.r, 0, PALETTE.yellow, 0, 0.35)
      put(b, TPL.discTilt, 0, 0.86 * s, 0.01, 0.13 * s, 0.13 * s, 0.13 * s, 0.1, 0, 0, _c.setRGB(0.28, 0.17, 0.08), 0, 0)
      break
  }
}

// per-biome stone colours: [light, dark]
const STONES: Record<number, [THREE.Color, THREE.Color]> = {
  [B.Desert]: [srgb(0.82, 0.6, 0.36), srgb(0.66, 0.44, 0.26)],
  [B.Snow]: [srgb(0.82, 0.88, 0.94), srgb(0.6, 0.68, 0.78)],
  [B.Volcanic]: [srgb(0.2, 0.17, 0.17), srgb(0.1, 0.08, 0.09)],
  [B.Mountain]: [srgb(0.6, 0.58, 0.56), srgb(0.42, 0.42, 0.44)],
  [B.Cave]: [srgb(0.34, 0.3, 0.42), srgb(0.2, 0.18, 0.28)],
  [B.Magical]: [srgb(0.66, 0.6, 0.8), srgb(0.46, 0.4, 0.62)],
  [B.Swamp]: [srgb(0.42, 0.46, 0.36), srgb(0.3, 0.34, 0.26)],
}
const CRYSTALS: THREE.Color[] = [srgb(0.55, 0.45, 1), srgb(0.4, 0.9, 1), srgb(1, 0.5, 0.85)]

function addRock(b: PropBatch, r: ReturnType<typeof getChunkData>['rocks'][number]) {
  setBase(r.x, r.y, r.z, r.r, 1)
  const s = r.s
  if (r.kind === 'crystal') {
    const col = CRYSTALS[Math.floor(r.v * 3) % 3]
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + r.r
      const h = (0.8 + ((i * 37 + r.v * 100) % 10) / 10) * s
      put(b, TPL.cone, Math.cos(a) * 0.22 * s, 0, Math.sin(a) * 0.22 * s, 0.14 * s, h, 0.14 * s, Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3, col, 0, 1.1)
    }
    return
  }
  const st = STONES[r.biome]
  const c1 = st ? st[0] : r.kind === 'rock' ? SOLID_STONE : GREY_STONE
  const c2 = st ? st[1] : r.kind === 'rock' ? SOLID_STONE2 : GREY_STONE2
  const moss = st ? 0 : r.kind === 'rock' ? (r.v > 0.5 ? 1 : 0) : 1
  if (r.kind === 'flat') {
    put(b, TPL.rock, 0, 0.0, 0, s * 0.8, s * 0.2, s * 0.7, 0, 0, 0, _c.copy(c1).lerp(c2, r.v), 0, 0, moss)
  } else if (r.kind === 'boulder') {
    put(b, TPL.rock, 0, 0.3 * s, 0, s * (1 + r.v * 0.4), s * 0.75, s * (1.1 - r.v * 0.2), r.v * 0.3, 0, r.v * 0.2, _c.copy(c1).lerp(c2, r.v), 0, r.biome === B.Volcanic && r.v > 0.7 ? 0.5 : 0, moss)
  } else {
    put(b, TPL.rock, 0, 0.1 * s, 0, s * (1 + r.v * 0.5), s * 0.6, s * (1.2 - r.v * 0.3), 0, 0, 0, _c.copy(c1).lerp(c2, r.v), 0, 0, moss)
  }
}

function addReed(b: PropBatch, r: ReturnType<typeof getChunkData>['reeds'][number]) {
  setBase(r.x, r.y, r.z, r.r, 1)
  const rng = mulberry32(hashInts(Math.round(r.x * 10), Math.round(r.z * 10), 3))
  const n = 4 + Math.floor(rng() * 3)
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2
    const h = (1.1 + rng() * 0.8) * r.s
    const lx = Math.cos(a) * 0.14
    const lz = Math.sin(a) * 0.14
    const tilt = (rng() - 0.5) * 0.3
    put(b, TPL.cone, lx, 0, lz, 0.035, h, 0.035, tilt, 0, -tilt, _c.copy(REED_A).lerp(REED_B, rng()), 0, 0)
    if (rng() < 0.55) put(b, TPL.cyl, lx - tilt * h * 0.9, h * 0.9, lz + tilt * h * 0.9, 0.05, 0.22, 0.05, tilt, 0, -tilt, CATTAIL, 0, 0)
  }
}

function addLily(b: PropBatch, l: ReturnType<typeof getChunkData>['lilies'][number]) {
  setBase(l.x, l.y + 0.05, l.z, l.r, l.s)
  put(b, TPL.discUp, 0, 0, 0, 0.5, 1, 0.5, 0, 0, 0, PAD, 0, 0.08)
  if (l.lotus) {
    put(b, TPL.petals5, 0, 0.05, 0, 0.6, 1, 0.6, 0.15, l.r, 0, PALETTE[PALETTE_KEYS[l.palette]], 0, 0.3)
    put(b, TPL.discUp, 0, 0.09, 0, 0.07, 1, 0.07, 0, 0, 0, PALETTE.yellow, 0, 0.4)
  }
}

const TPL_BY_KIND: Record<string, Template> = { box: TPL.box, cyl: TPL.cyl, cone: TPL.cone, sphere: TPL.sphere, dome: TPL.dome }

function* propsStep(cx: number, cz: number, q: QualitySettings, group: THREE.Group): Generator<void> {
  const data = getChunkData(cx, cz)
  const b = new PropBatch()

  for (const t of data.trees) {
    setBase(t.x, t.y, t.z, t.r, t.s)
    putParts(b, TREE_PARTS[t.kind][t.variant], t.v)
  }
  yield
  for (const bu of data.bushes) addBush(b, bu)
  yield
  const keepEvery = Math.max(1, Math.round(1 / q.flowerDensity))
  data.flowers.forEach((f, i) => {
    if (i % keepEvery === 0) addFlower(b, f)
  })
  yield
  for (const r of data.rocks) addRock(b, r)
  for (const r of data.reeds) addReed(b, r)
  for (const l of data.lilies) addLily(b, l)
  yield
  for (const p of data.parts) {
    _e.set(p.rx, p.ry, p.rz)
    _q.setFromEuler(_e)
    _loc.compose(_p.set(p.x, p.y, p.z), _q, _s.set(p.sx, p.sy, p.sz))
    b.add(TPL_BY_KIND[p.kind], _loc, _c.setRGB(p.color[0], p.color[1], p.color[2], THREE.SRGBColorSpace), 0, p.emis, p.moss)
  }
  const g = b.build()
  if (g) {
    const mesh = new THREE.Mesh(g, assets.propMat)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.userData.own = true
    group.add(mesh)
  }
}

/** Builds one chunk in several steps (generator): the caller advances it a little every frame. */
export function* buildChunkSteps(group: THREE.Group, cx: number, cz: number, q: QualitySettings): Generator<void> {
  group.name = `chunk ${cx},${cz}`
  getChunkData(cx, cz)
  yield
  const ao = bakeAO(cx, cz)
  group.add(terrainMesh(cx, cz, ao))
  yield
  const water = waterMesh(cx, cz)
  if (water) group.add(water)
  const lava = lavaMesh(cx, cz)
  if (lava) group.add(lava)
  for (const o of fallObjects(cx, cz)) group.add(o)
  yield
  yield* grassStep(cx, cz, q, group)
  yield
  yield* propsStep(cx, cz, q, group)
}

export function disposeChunk(group: THREE.Group) {
  group.traverse((o) => {
    if (o instanceof THREE.InstancedMesh) o.dispose()
    if (o.userData.own && (o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose()
  })
}

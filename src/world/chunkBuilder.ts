import * as THREE from 'three'
import { CHUNK_SEGMENTS, CHUNK_SIZE, WORLD_SEED, type QualitySettings } from '../game/config'
import { hashInts, mulberry32 } from '../utils/random'
import { srgb } from '../utils/textures'
import { assets } from './assets'
import { heightAt } from './heightAt'
import { forestMask, getChunkData, meadowMask, type Prop } from './scatter'

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const _e = new THREE.Euler()
const _c = new THREE.Color()
const UP = new THREE.Vector3(0, 1, 0)

function terrainGeometry(cx: number, cz: number) {
  const N = CHUNK_SEGMENTS
  const step = CHUNK_SIZE / N
  const ox = cx * CHUNK_SIZE
  const oz = cz * CHUNK_SIZE
  const pos = new Float32Array((N + 1) * (N + 1) * 3)
  const nor = new Float32Array((N + 1) * (N + 1) * 3)
  const idx: number[] = []
  const e = 0.5
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const x = ox + i * step
      const z = oz + j * step
      const k = (j * (N + 1) + i) * 3
      pos[k] = x
      pos[k + 1] = heightAt(x, z)
      pos[k + 2] = z
      // analytic-ish normal -> seamless lighting across chunk borders
      const nx = heightAt(x - e, z) - heightAt(x + e, z)
      const nz = heightAt(x, z - e) - heightAt(x, z + e)
      const l = Math.hypot(nx, 2 * e, nz)
      nor[k] = nx / l
      nor[k + 1] = (2 * e) / l
      nor[k + 2] = nz / l
    }
  }
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i
      const b = a + 1
      const c = a + (N + 1)
      const d = c + 1
      idx.push(a, c, b, b, c, d)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  g.setIndex(idx)
  g.computeBoundingSphere()
  return g
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, count: number) {
  const mesh = new THREE.InstancedMesh(geo, mat, count)
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
  return mesh
}

function finish(mesh: THREE.InstancedMesh, cast: boolean, receive: boolean) {
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.castShadow = cast
  mesh.receiveShadow = receive
  mesh.computeBoundingSphere()
  mesh.computeBoundingBox()
  return mesh
}

function setMatrix(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number) {
  _q.setFromAxisAngle(UP, yaw)
  _p.set(x, y, z)
  _s.set(sx, sy, sz)
  _m.compose(_p, _q, _s)
  mesh.setMatrixAt(i, _m)
}

/** Builds everything that lives in one chunk. Dispose with disposeChunk(). */
export function buildChunk(cx: number, cz: number, q: QualitySettings) {
  const group = new THREE.Group()
  group.name = `chunk ${cx},${cz}`
  const x0 = cx * CHUNK_SIZE
  const z0 = cz * CHUNK_SIZE

  // --- terrain
  const ground = new THREE.Mesh(terrainGeometry(cx, cz), assets.terrainMat)
  ground.receiveShadow = true
  ground.userData.ownsGeometry = true
  group.add(ground)

  const data = getChunkData(cx, cz)

  // --- grass tufts (denser in meadow patches, sparse under forest)
  {
    const rng = mulberry32(hashInts(cx, cz, WORLD_SEED, 11))
    const maxDensity = q.grassDensity
    const candidates = Math.round(CHUNK_SIZE * CHUNK_SIZE * maxDensity)
    const keep: number[] = []
    for (let i = 0; i < candidates; i++) {
      const x = x0 + rng() * CHUNK_SIZE
      const z = z0 + rng() * CHUNK_SIZE
      const dens = Math.min(1, 0.55 + meadowMask(x, z) * 0.35 + (1 - forestMask(x, z)) * 0.2)
      if (rng() < dens) keep.push(x, z, rng(), rng(), rng())
    }
    const n = keep.length / 5
    if (n > 0) {
      const mesh = instanced(assets.grassGeo, assets.grassMat, n)
      for (let i = 0; i < n; i++) {
        const x = keep[i * 5]
        const z = keep[i * 5 + 1]
        const r = keep[i * 5 + 2]
        const a = keep[i * 5 + 3]
        const b = keep[i * 5 + 4]
        const sw = 0.9 + a * 0.5
        const sh = 0.7 + b * 0.5
        setMatrix(mesh, i, x, heightAt(x, z) - 0.02, z, r * Math.PI * 2, sw, sh, sw)
        _c.setHSL(0.235 + (a - 0.5) * 0.05, 0.5 + b * 0.1, 0.27 + a * 0.1, THREE.SRGBColorSpace)
        mesh.setColorAt(i, _c)
      }
      group.add(finish(mesh, false, true))
    }
  }

  // --- flower clusters (tiny yellow / orange dots in loose groups)
  {
    const cell = 6
    const pts: { x: number; z: number; c: number; sz: number }[] = []
    const i0 = Math.floor(x0 / cell)
    const j0 = Math.floor(z0 / cell)
    const cells = Math.ceil(CHUNK_SIZE / cell)
    for (let i = i0; i < i0 + cells; i++) {
      for (let j = j0; j < j0 + cells; j++) {
        const rng = mulberry32(hashInts(i, j, WORLD_SEED, 404))
        const cxp = (i + rng() * 1) * cell
        const czp = (j + rng() * 1) * cell
        if (cxp < x0 || cxp >= x0 + CHUNK_SIZE || czp < z0 || czp >= z0 + CHUNK_SIZE) continue
        if (rng() > 0.25 + meadowMask(cxp, czp) * 0.55) continue
        const kind = rng()
        const count = 8 + Math.floor(rng() * 12)
        for (let k = 0; k < count; k++) {
          const ang = rng() * Math.PI * 2
          const rad = Math.sqrt(rng()) * (kind < 0.55 ? 1.6 : 1.1)
          pts.push({ x: cxp + Math.cos(ang) * rad, z: czp + Math.sin(ang) * rad * 0.8, c: kind, sz: 0.8 + rng() * 0.7 })
        }
      }
    }
    if (pts.length) {
      const mesh = instanced(assets.flowerGeo, assets.flowerMat, pts.length)
      pts.forEach((p, i) => {
        const scale = p.c < 0.55 ? 0.6 * p.sz : 0.95 * p.sz
        setMatrix(mesh, i, p.x, heightAt(p.x, p.z) + 0.07, p.z, 0, scale, scale, scale)
        if (p.c < 0.55) _c.setRGB(0.98, 0.86 + (p.sz - 0.8) * 0.1, 0.32, THREE.SRGBColorSpace)
        else if (p.c < 0.85) _c.setRGB(0.96, 0.52, 0.16, THREE.SRGBColorSpace)
        else _c.setRGB(0.93, 0.32, 0.22, THREE.SRGBColorSpace)
        mesh.setColorAt(i, _c)
      })
      group.add(finish(mesh, false, false))
    }
  }

  // --- trees: trunk + lumpy oval canopy
  if (data.trees.length) {
    const n = data.trees.length
    const trunks = instanced(assets.trunkGeo, assets.trunkMat, n)
    const canopies = instanced(assets.treeCanopyGeo, assets.foliageMat, n)
    const deep = srgb(0.22, 0.40, 0.18)
    const light = srgb(0.34, 0.50, 0.16)
    data.trees.forEach((t: Prop, i) => {
      setMatrix(trunks, i, t.x, t.y - 0.1, t.z, t.r, t.s, t.s, t.s)
      const w = 0.9 + t.v * 0.35
      setMatrix(canopies, i, t.x, t.y + 2.55 * t.s, t.z, t.r, t.s * w, t.s * (0.85 + t.v * 0.3), t.s * w)
      canopies.setColorAt(i, _c.copy(deep).lerp(light, t.v * 0.8))
    })
    group.add(finish(trunks, true, true), finish(canopies, true, true))
  }

  // --- bushes
  if (data.bushes.length) {
    const n = data.bushes.length
    const mesh = instanced(assets.bushGeo, assets.foliageMat, n)
    const a = srgb(0.40, 0.48, 0.14)
    const b = srgb(0.30, 0.46, 0.15)
    data.bushes.forEach((p, i) => {
      setMatrix(mesh, i, p.x, p.y + 0.55 * p.s, p.z, p.r, p.s, p.s, p.s)
      mesh.setColorAt(i, _c.copy(a).lerp(b, p.v))
    })
    group.add(finish(mesh, true, true))
  }

  // --- rocks
  if (data.rocks.length) {
    const n = data.rocks.length
    const mesh = instanced(assets.rockGeo, assets.rockMat, n)
    const a = srgb(0.62, 0.43, 0.22)
    const b = srgb(0.47, 0.34, 0.20)
    data.rocks.forEach((p, i) => {
      _e.set(0, p.r, 0)
      setMatrix(mesh, i, p.x, p.y + 0.12 * p.s, p.z, p.r, p.s * (1 + p.v * 0.5), p.s * 0.6, p.s * (1.2 - p.v * 0.3))
      mesh.setColorAt(i, _c.copy(a).lerp(b, p.v))
    })
    group.add(finish(mesh, true, true))
  }

  // --- soft contact shadows under props (the dark hollows in the reference)
  {
    const props: { p: Prop; r: number }[] = [
      ...data.trees.map((p) => ({ p, r: 2.0 })),
      ...data.bushes.map((p) => ({ p, r: 1.35 })),
      ...data.rocks.map((p) => ({ p, r: 1.1 })),
    ]
    if (props.length) {
      const mesh = instanced(assets.blobGeo, assets.blobMat, props.length)
      props.forEach(({ p, r }, i) => {
        const k = r * p.s
        setMatrix(mesh, i, p.x + 0.25, p.y + 0.05, p.z + 0.25, 0, k, 1, k)
      })
      mesh.renderOrder = 1
      group.add(finish(mesh, false, false))
    }
  }

  return group
}

export function disposeChunk(group: THREE.Group) {
  group.traverse((o) => {
    if (o instanceof THREE.InstancedMesh) o.dispose()
    else if (o instanceof THREE.Mesh && o.userData.ownsGeometry) o.geometry.dispose()
  })
}

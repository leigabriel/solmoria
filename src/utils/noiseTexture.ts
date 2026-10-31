import * as THREE from 'three'
import { mulberry32 } from './random'

const SIZE = 256

function lattice(period: number, seed: number) {
  const rng = mulberry32(seed)
  const a = new Float32Array(period * period)
  for (let i = 0; i < a.length; i++) a[i] = rng()
  return a
}

/** Tileable smooth value noise sampled at u,v in [0,1). */
function sample(lat: Float32Array, period: number, u: number, v: number) {
  const x = u * period
  const y = v * period
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const i0 = x0 % period
  const i1 = (x0 + 1) % period
  const j0 = y0 % period
  const j1 = (y0 + 1) % period
  const a = lat[j0 * period + i0]
  const b = lat[j0 * period + i1]
  const c = lat[j1 * period + i0]
  const d = lat[j1 * period + i1]
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

/**
 * One 256x256 RGBA texture holding four independent tileable fbm channels. Every shader samples this
 * instead of evaluating procedural noise per pixel, which is the single biggest GPU saving.
 *   R: broad patches (8 cells, 4 octaves)   G: finer detail (16 cells, 3 oct)
 *   B: very broad / clouds (4 cells, 3 oct) A: speckle (32 cells, 2 oct)
 * One texture repeat covers 64 world units.
 */
export function createNoiseTexture() {
  const data = new Uint8Array(SIZE * SIZE * 4)
  const channels: [number, number, number][] = [
    [8, 4, 1001],
    [16, 3, 2002],
    [4, 3, 3003],
    [32, 2, 4004],
  ]
  channels.forEach(([base, octaves, seed], ch) => {
    const lats = Array.from({ length: octaves }, (_, o) => ({ p: base * 2 ** o, l: lattice(base * 2 ** o, seed + o * 101) }))
    let norm = 0
    for (let o = 0; o < octaves; o++) norm += 0.5 ** o
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        let v = 0
        let amp = 1
        for (const { p, l } of lats) {
          v += amp * sample(l, p, x / SIZE, y / SIZE)
          amp *= 0.5
        }
        data[(y * SIZE + x) * 4 + ch] = Math.round((v / norm) * 255)
      }
    }
  })
  const t = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.anisotropy = 4
  t.needsUpdate = true
  return t
}

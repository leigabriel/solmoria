import * as THREE from 'three'
import { createFallMaterial, createGrassMaterial, createMistMaterial, createPropMaterial, createTerrainMaterial, createWaterMaterial } from '../shaders/materials'

/**
 * Grass tuft of 9 single-triangle spikes fanned like the glyphs "\ | /": left-leaning, upright and
 * right-leaning blades of different heights. 9 triangles per tuft (vs 25 before) = far cheaper, and the
 * leaning silhouettes face the fixed camera so the pattern reads clearly. Unit height; instance scale sets size.
 */
function spikeClump() {
  const leans = [-0.55, 0, 0.55, -0.3, 0.28, 0, 0.62, -0.62, 0.14]
  const heights = [0.78, 1.0, 0.8, 0.62, 0.66, 0.88, 0.55, 0.5, 0.72]
  const xs = [-0.13, 0.0, 0.13, -0.07, 0.07, 0.03, 0.2, -0.2, -0.02]
  const zs = [0.02, -0.03, 0.03, 0.06, -0.06, 0.0, -0.02, 0.04, 0.08]
  const yaws = [0.25, 0, -0.25, 0.4, -0.4, 0.1, -0.15, 0.18, -0.1]
  const pos: number[] = []
  const nor: number[] = []
  for (let i = 0; i < leans.length; i++) {
    const h = heights[i]
    const w = 0.065 + (i % 3) * 0.012
    const c = Math.cos(yaws[i])
    const s = Math.sin(yaws[i])
    const pts: [number, number, number][] = [
      [-w, 0, 0],
      [w, 0, 0],
      [leans[i] * h, h, 0.02],
    ]
    for (const [x, y, z] of pts) {
      pos.push(xs[i] + x * c - z * s, y, zs[i] + x * s + z * c)
      nor.push(0, 1, 0)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  return g
}

export const assets = {
  terrainMat: createTerrainMaterial(),
  grassMat: createGrassMaterial(),
  propMat: createPropMaterial(),
  waterMat: createWaterMaterial(),
  fallMat: createFallMaterial(),
  mistMat: createMistMaterial(),
  grassGeo: spikeClump(),
}

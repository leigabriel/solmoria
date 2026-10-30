import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { createNoise2D } from 'simplex-noise'
import { createFoliageMaterial, createGrassMaterial, createTerrainMaterial } from '../shaders/materials'
import { makeRadialTexture } from '../utils/textures'
import { mulberry32 } from '../utils/random'

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

function grassClump() {
  const pos: number[] = []
  const nor: number[] = []
  const idx: number[] = []
  const blades = 3
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI + b * 0.4
    const c = Math.cos(a)
    const s = Math.sin(a)
    const ox = Math.cos(b * 2.1) * 0.07
    const oz = Math.sin(b * 2.1) * 0.07
    const w = 0.12
    const lean = 0.18 + b * 0.05
    const pts: [number, number, number][] = [
      [-w, 0, 0],
      [w, 0, 0],
      [-w * 0.7, 0.55, lean * 0.4],
      [w * 0.7, 0.55, lean * 0.4],
      [0, 1, lean],
    ]
    const base = pos.length / 3
    for (const [x, y, z] of pts) {
      pos.push(ox + x * c - z * s, y, oz + x * s + z * c)
      nor.push(0, 1, 0)
    }
    idx.push(base, base + 1, base + 3, base, base + 3, base + 2, base + 2, base + 3, base + 4)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setIndex(idx)
  return g
}

const trunk = new THREE.CylinderGeometry(0.11, 0.2, 1.4, 6)
trunk.translate(0, 0.7, 0)

const flowerGeo = new THREE.CircleGeometry(0.07, 6)
flowerGeo.rotateX(-Math.PI / 2 + 0.95)

const blobGeo = new THREE.CircleGeometry(1, 20)
blobGeo.rotateX(-Math.PI / 2)

const blobTexture = makeRadialTexture(64, 0.15)

export const assets = {
  terrainMat: createTerrainMaterial(),
  grassMat: createGrassMaterial(),
  foliageMat: createFoliageMaterial(),
  trunkMat: new THREE.MeshLambertMaterial({ color: '#5b3c24' }),
  rockMat: new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }),
  flowerMat: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  blobMat: new THREE.MeshBasicMaterial({
    map: blobTexture,
    color: 0x0b1a05,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    fog: false,
  }),
  grassGeo: grassClump(),
  trunkGeo: trunk,
  treeCanopyGeo: lumpy(1.15, 1.9, 1.15, 2, 0.28, 11),
  bushGeo: lumpy(1, 0.8, 1, 2, 0.3, 23),
  rockGeo: (() => {
    const g = new THREE.DodecahedronGeometry(1, 0)
    return g
  })(),
  flowerGeo,
  blobGeo,
}

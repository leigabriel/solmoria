import * as THREE from 'three'

/** Raw indexed geometry that can be stamped many times into one big merged mesh. */
export interface Template {
  pos: Float32Array
  nor: Float32Array
  idx: Uint32Array
}

export function template(g: THREE.BufferGeometry): Template {
  const pos = new Float32Array(g.attributes.position.array as ArrayLike<number>)
  const nor = new Float32Array(g.attributes.normal.array as ArrayLike<number>)
  let idx: Uint32Array
  if (g.index) idx = new Uint32Array(g.index.array as ArrayLike<number>)
  else idx = Uint32Array.from({ length: pos.length / 3 }, (_, i) => i)
  return { pos, nor, idx }
}

const _v = new THREE.Vector3()
const _m3 = new THREE.Matrix3()

/**
 * Merges many transformed templates into ONE geometry (one draw call per chunk for every tree, bush,
 * flower, rock and ruin). Per-vertex: colour and flags (x = stippled foliage, y = emissive, z = moss).
 */
export class PropBatch {
  private pos: number[] = []
  private nor: number[] = []
  private col: number[] = []
  private flg: number[] = []
  private idx: number[] = []

  get triangles() {
    return this.idx.length / 3
  }

  add(t: Template, m: THREE.Matrix4, c: THREE.Color, stip = 0, emis = 0, moss = 0) {
    const base = this.pos.length / 3
    _m3.getNormalMatrix(m)
    for (let i = 0; i < t.pos.length; i += 3) {
      _v.set(t.pos[i], t.pos[i + 1], t.pos[i + 2]).applyMatrix4(m)
      this.pos.push(_v.x, _v.y, _v.z)
      _v.set(t.nor[i], t.nor[i + 1], t.nor[i + 2]).applyMatrix3(_m3).normalize()
      this.nor.push(_v.x, _v.y, _v.z)
      this.col.push(c.r, c.g, c.b)
      this.flg.push(stip, emis, moss)
    }
    for (let i = 0; i < t.idx.length; i++) this.idx.push(base + t.idx[i])
  }

  build() {
    if (!this.idx.length) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.setAttribute('aFlags', new THREE.Float32BufferAttribute(this.flg, 3))
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(this.idx), 1))
    g.computeBoundingSphere()
    g.computeBoundingBox()
    return g
  }
}

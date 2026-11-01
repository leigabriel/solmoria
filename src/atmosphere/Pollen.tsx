import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { QUALITY } from '../game/config'
import { biomeState, playerState, useSettings } from '../game/store'
import { mulberry32 } from '../utils/random'
import { makeRadialTexture } from '../utils/textures'

const BX = 30
const BY = 7
const BZ = 26

/** Floating pollen / sparkles that wrap around the player. */
export function Pollen() {
  const count = QUALITY[useSettings((s) => s.quality)].pollen
  const ref = useRef<THREE.Points>(null!)

  const { geo, mat, seeds } = useMemo(() => {
    const rng = mulberry32(5)
    const seeds = Array.from({ length: count }, () => ({ x: rng() * BX, y: rng() * BY, z: rng() * BZ, p: rng() * 6.28, s: 0.2 + rng() * 0.5 }))
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    const mat = new THREE.PointsMaterial({
      map: makeRadialTexture(32, 0, '255,255,255'),
      size: 0.16,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: new THREE.Color(1.4, 1.3, 0.7),
      opacity: 0.85,
    })
    return { geo, mat, seeds }
  }, [count])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    mat.color.copy(biomeState.particleColor)
    mat.size = biomeState.particleSize
    const fall = biomeState.particleFall
    const attr = geo.attributes.position as THREE.BufferAttribute
    const px = playerState.pos.x
    const pz = playerState.pos.z
    const wrap = (v: number, size: number) => ((v % size) + size) % size
    for (let i = 0; i < count; i++) {
      const s = seeds[i]
      const x = wrap(s.x + t * 0.35 * s.s + Math.sin(t * 0.7 + s.p) * 0.6 - px, BX) - BX / 2 + px
      const z = wrap(s.z + t * 0.2 * s.s + Math.cos(t * 0.6 + s.p) * 0.6 - pz, BZ) - BZ / 2 + pz
      const y = playerState.pos.y + 0.3 + wrap(s.y + Math.sin(t * 0.5 + s.p) * 0.4 + -fall * t * s.s * 2.2 + t * 0.08 * s.s * (fall === 0 ? 1 : 0), BY)
      attr.setXYZ(i, x, y, z)
    }
    attr.needsUpdate = true
    ref.current.frustumCulled = false
  })

  return <points ref={ref} geometry={geo} material={mat} renderOrder={6} />
}

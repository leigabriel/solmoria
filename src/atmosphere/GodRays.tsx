import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SUN_DIR } from '../game/config'
import { playerState } from '../game/store'
import { mulberry32 } from '../utils/random'
import { makeBeamTexture } from '../utils/textures'

const COUNT = 9

/** A handful of long additive shafts aligned with the sun direction (cheap fake volumetric light). */
export function GodRays() {
  const group = useRef<THREE.Group>(null!)
  const { geo, mat, items } = useMemo(() => {
    const rng = mulberry32(99)
    const geo = new THREE.PlaneGeometry(1, 1)
    const mat = new THREE.MeshBasicMaterial({
      map: makeBeamTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      opacity: 0.1,
      color: 0xfff1c4,
      fog: false,
    })
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), SUN_DIR.clone().negate())
    const items = Array.from({ length: COUNT }, () => ({
      x: (rng() - 0.5) * 34,
      z: (rng() - 0.5) * 24 - 2,
      w: 2.2 + rng() * 3.5,
      phase: rng() * 6.28,
      speed: 0.25 + rng() * 0.3,
      quat,
    }))
    return { geo, mat, items }
  }, [])

  useFrame((state) => {
    const g = group.current
    g.position.set(playerState.pos.x, playerState.pos.y, playerState.pos.z)
    const t = state.clock.elapsedTime
    g.children.forEach((shaft, i) => {
      const it = items[i]
      const o = 0.03 + 0.05 * (0.5 + 0.5 * Math.sin(t * it.speed + it.phase)) * (0.6 + 0.4 * Math.sin(t * 0.13 + i))
      shaft.position.x = it.x + Math.sin(t * 0.12 + it.phase) * 1.8
      for (const plane of shaft.children) ((plane as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = o
    })
  })

  return (
    <group ref={group} renderOrder={5}>
      {items.map((it, i) => (
        <group key={i} position={[it.x, 14, it.z]} quaternion={it.quat}>
          {/* two crossed planes so the shaft reads from any angle */}
          <mesh geometry={geo} material={mat.clone()} scale={[it.w, 46, 1]} />
          <mesh geometry={geo} material={mat.clone()} scale={[it.w, 46, 1]} rotation={[0, Math.PI / 2, 0]} />
        </group>
      ))}
    </group>
  )
}

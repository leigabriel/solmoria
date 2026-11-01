import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { camp } from './villages'
import { heightAt } from './terrainData'
import { playerState } from '../game/store'

const EMBERS = 22

/** Animated flames, a flickering warm light and rising embers for the spawn camp. */
export function CampFire() {
  const flames = useRef<THREE.Group>(null!)
  const light = useRef<THREE.PointLight>(null!)
  const ref = useRef<THREE.Points>(null!)

  const { geo, mat, seeds, flameMats } = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(EMBERS * 3), 3))
    const mat = new THREE.PointsMaterial({ size: 0.12, color: new THREE.Color(2.2, 1.0, 0.3), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending })
    const seeds = Array.from({ length: EMBERS }, (_, i) => ({ p: (i * 0.618) % 1, a: i * 2.4, s: 0.5 + ((i * 37) % 10) / 14 }))
    const flameMats = [new THREE.Color(1.8, 0.55, 0.1), new THREE.Color(2.2, 1.0, 0.2), new THREE.Color(2.4, 1.6, 0.5)].map((c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: true, opacity: 0.92, depthWrite: false }))
    return { geo, mat, seeds, flameMats }
  }, [])

  const base = useMemo(() => (camp ? new THREE.Vector3(camp.x, heightAt(camp.x, camp.z) + 0.25, camp.z) : null), [])

  useFrame((state) => {
    if (!base) return
    const t = state.clock.elapsedTime
    // only animate while the player is near; far away the group is hidden
    const near = Math.hypot(playerState.pos.x - base.x, playerState.pos.z - base.z) < 60
    flames.current.visible = near
    light.current.visible = near
    ref.current.visible = near
    if (!near) return
    const f = flames.current.children as THREE.Mesh[]
    for (let i = 0; i < f.length; i++) {
      const k = 1 + Math.sin(t * (7 + i * 2.3) + i * 1.7) * 0.18 + Math.sin(t * (13 + i) + i) * 0.1
      const m = f[i]
      const base0 = [1.05, 0.8, 0.55][i]
      m.scale.set(1 + Math.sin(t * 9 + i) * 0.08, base0 * k, 1 + Math.cos(t * 8 + i) * 0.08)
      m.rotation.y = t * (1.2 + i * 0.4)
    }
    light.current.intensity = 5.5 + Math.sin(t * 11) * 0.9 + Math.sin(t * 23.7) * 0.6
    const attr = geo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < EMBERS; i++) {
      const s = seeds[i]
      const u = (s.p + t * 0.22 * s.s) % 1
      attr.setXYZ(i, base.x + Math.sin(s.a + t * 0.8 + u * 5) * (0.25 + u * 0.7), base.y + 0.5 + u * 3.6, base.z + Math.cos(s.a * 1.3 + t * 0.7 + u * 4) * (0.25 + u * 0.7))
    }
    attr.needsUpdate = true
    mat.opacity = 0.9
  })

  if (!base) return null
  return (
    <>
      <group ref={flames} position={base}>
        <mesh material={flameMats[0]} position={[0, 0.55, 0]}>
          <coneGeometry args={[0.55, 1.3, 7]} />
        </mesh>
        <mesh material={flameMats[1]} position={[0.05, 0.62, 0]}>
          <coneGeometry args={[0.36, 1.1, 7]} />
        </mesh>
        <mesh material={flameMats[2]} position={[0, 0.6, -0.04]}>
          <coneGeometry args={[0.2, 0.8, 6]} />
        </mesh>
      </group>
      <pointLight ref={light} position={[base.x, base.y + 1.1, base.z]} color="#ffa24a" intensity={5.5} distance={20} decay={1.6} />
      <points ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={6} />
    </>
  )
}

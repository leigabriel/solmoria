import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { playerState } from '../game/store'

const RINGS = 36
const FOAM = 48
const DROPS = 28

interface Ring { life: number; max: number; x: number; z: number; r0: number; r1: number; a: number; y: number }
interface Foam { life: number; max: number; x: number; z: number; vx: number; vz: number; s: number; y: number; yaw: number }
interface Drop { life: number; x: number; y: number; z: number; vx: number; vy: number; vz: number }

/**
 * Water trail for the hero: expanding ripple rings, a V-shaped foam wake streaming off the shoulders and
 * flicked-up droplets while swimming; smaller rings and splashes while wading. Pooled meshes, no allocations per frame.
 */
export function SwimFX() {
  const group = useRef<THREE.Group>(null!)
  const st = useRef({ ringT: 0, foamT: 0, dropT: 0, ri: 0, fi: 0, di: 0 })

  const { rings, foams, drops, ringMesh, foamMesh, dropMesh, ringMat, foamMat, dropMat, geos } = useMemo(() => {
    const ringGeo = new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2)
    const foamGeo = new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2)
    const dropGeo = new THREE.SphereGeometry(1, 5, 4)
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false })
    const dropMat = new THREE.MeshBasicMaterial({ color: 0xdff8ff, transparent: true, opacity: 0.9, depthWrite: false })
    const mk = (g: THREE.BufferGeometry, m: THREE.Material, n: number) => {
      const mesh = new THREE.InstancedMesh(g, m, n)
      mesh.frustumCulled = false
      mesh.renderOrder = 4
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      return mesh
    }
    return {
      rings: Array.from({ length: RINGS }, (): Ring => ({ life: 0, max: 1, x: 0, z: 0, r0: 0, r1: 1, a: 1, y: 0 })),
      foams: Array.from({ length: FOAM }, (): Foam => ({ life: 0, max: 1, x: 0, z: 0, vx: 0, vz: 0, s: 1, y: 0, yaw: 0 })),
      drops: Array.from({ length: DROPS }, (): Drop => ({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 })),
      ringMesh: mk(ringGeo, ringMat, RINGS),
      foamMesh: mk(foamGeo, foamMat, FOAM),
      dropMesh: mk(dropGeo, dropMat, DROPS),
      ringMat, foamMat, dropMat,
      geos: [ringGeo, foamGeo, dropGeo],
    }
  }, [])

  useEffect(() => {
    const g = group.current
    g.add(ringMesh, foamMesh, dropMesh)
    return () => {
      g.remove(ringMesh, foamMesh, dropMesh)
      ringMesh.dispose()
      foamMesh.dispose()
      dropMesh.dispose()
      geos.forEach((x) => x.dispose())
      ringMat.dispose()
      foamMat.dispose()
      dropMat.dispose()
    }
  }, [ringMesh, foamMesh, dropMesh, ringMat, foamMat, dropMat, geos])

  const m4 = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const sc = useMemo(() => new THREE.Vector3(), [])
  const ps = useMemo(() => new THREE.Vector3(), [])
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const col = useMemo(() => new THREE.Color(), [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const s = st.current
    const { pos, speed, facing, swim, depth, waterY } = playerState
    const inWater = depth > 0.08
    const wy = waterY + 0.05
    const fx = Math.sin(facing)
    const fz = Math.cos(facing)
    const moving = speed > 0.35
    const swimming = swim > 0.4

    // spawn ripple rings under the hero (more and wider while swimming)
    s.ringT -= dt
    if (inWater && s.ringT <= 0 && (moving || swimming)) {
      s.ringT = swimming ? 0.16 : 0.24
      const r = rings[s.ri++ % RINGS]
      r.life = r.max = swimming ? 1.5 : 0.9
      r.x = pos.x - fx * 0.15
      r.z = pos.z - fz * 0.15
      r.r0 = swimming ? 0.45 : 0.2
      r.r1 = swimming ? 2.3 : 1.0
      r.a = swimming ? 0.65 : 0.5
      r.y = wy
    }
    // idle treading water: slow wide breathing rings
    if (swimming && !moving && s.ringT <= 0.04) {
      s.ringT = 0.55
      const r = rings[s.ri++ % RINGS]
      r.life = r.max = 1.8
      r.x = pos.x
      r.z = pos.z
      r.r0 = 0.5
      r.r1 = 2.1
      r.a = 0.5
      r.y = wy
    }

    // V wake: foam flecks leave the shoulders and drift outward and back
    s.foamT -= dt
    if (inWater && moving && s.foamT <= 0) {
      s.foamT = swimming ? 0.045 : 0.09
      for (const side of [-1, 1]) {
        const f = foams[s.fi++ % FOAM]
        f.life = f.max = swimming ? 1.3 : 0.8
        const off = swimming ? 0.38 : 0.28
        f.x = pos.x + fz * side * off + fx * 0.28
        f.z = pos.z - fx * side * off + fz * 0.28
        const spread = (swimming ? 0.7 : 0.45) * side
        f.vx = -fx * 0.55 + fz * spread * 0.9
        f.vz = -fz * 0.55 - fx * spread * 0.9
        f.s = (swimming ? 0.2 : 0.13) * (0.7 + Math.random() * 0.6)
        f.y = wy + 0.005
        f.yaw = Math.atan2(f.vx, f.vz)
      }
    }

    // splash droplets from arm strokes / steps
    s.dropT -= dt
    if (inWater && moving && s.dropT <= 0) {
      s.dropT = swimming ? 0.11 : 0.2
      const n = swimming ? 2 : 1
      for (let i = 0; i < n; i++) {
        const d = drops[s.di++ % DROPS]
        d.life = 0.55
        d.x = pos.x + fx * 0.35 + (Math.random() - 0.5) * 0.5
        d.z = pos.z + fz * 0.35 + (Math.random() - 0.5) * 0.5
        d.y = wy
        d.vx = (Math.random() - 0.5) * 1.1 + fx * 0.4
        d.vz = (Math.random() - 0.5) * 1.1 + fz * 0.4
        d.vy = 1.6 + Math.random() * 1.3
      }
    }

    let any = false
    for (let i = 0; i < RINGS; i++) {
      const r = rings[i]
      if (r.life > 0) {
        r.life -= dt
        any = true
      }
      const t = r.life > 0 ? 1 - r.life / r.max : 1
      const rad = r.life > 0 ? r.r0 + (r.r1 - r.r0) * (1 - (1 - t) * (1 - t)) : 0.0001
      m4.compose(ps.set(r.x, r.y, r.z), q.identity(), sc.set(rad, 1, rad))
      ringMesh.setMatrixAt(i, m4)
      // additive blend: fading the instance colour towards black fades the ring out
      const fade = r.life > 0 ? r.a * (1 - t) * (1 - t) * Math.min(1, t * 12) * 0.55 : 0
      ringMesh.setColorAt(i, col.setRGB(0.75 * fade, 0.95 * fade, fade))
    }
    ringMesh.instanceMatrix.needsUpdate = true
    if (ringMesh.instanceColor) ringMesh.instanceColor.needsUpdate = true

    for (let i = 0; i < FOAM; i++) {
      const f = foams[i]
      let size = 0.0001
      if (f.life > 0) {
        f.life -= dt
        f.x += f.vx * dt
        f.z += f.vz * dt
        f.vx *= 1 - dt * 0.8
        f.vz *= 1 - dt * 0.8
        const u = Math.max(0, f.life / f.max)
        size = f.s * Math.min(1, u * 2.2) * (1 + (1 - u) * 0.9)
        any = true
      }
      q.setFromAxisAngle(up, f.yaw)
      m4.compose(ps.set(f.x, f.y, f.z), q, sc.set(size * 0.8, 1, size * 1.9))
      foamMesh.setMatrixAt(i, m4)
    }
    foamMesh.instanceMatrix.needsUpdate = true

    for (let i = 0; i < DROPS; i++) {
      const d = drops[i]
      let size = 0.0001
      if (d.life > 0) {
        d.life -= dt
        d.vy -= 9 * dt
        d.x += d.vx * dt
        d.y += d.vy * dt
        d.z += d.vz * dt
        if (d.y < wy) d.life = 0
        else size = 0.045
        any = true
      }
      m4.compose(ps.set(d.x, d.y, d.z), q.identity(), sc.set(size, size, size))
      dropMesh.setMatrixAt(i, m4)
    }
    dropMesh.instanceMatrix.needsUpdate = true
    group.current.visible = any
  })

  return <group ref={group} />
}

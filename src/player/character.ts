import * as THREE from 'three'
import { srgb } from '../utils/textures'

export interface CharacterRig {
  root: THREE.Group
  body: THREE.Group
  head: THREE.Group
  legL: THREE.Group
  legR: THREE.Group
  armL: THREE.Group
  armR: THREE.Group
  cloak: THREE.Mesh
  phase: number
}

/**
 * Procedural hooded wanderer (placeholder until a GLB is dropped into /public/models).
 * Faces +Z. About 1.15 units tall so it reads like the small hero in the reference.
 */
export function createCharacter(): CharacterRig {
  const cloakMat = new THREE.MeshLambertMaterial({ color: srgb(0.34, 0.12, 0.10) })
  const darkMat = new THREE.MeshLambertMaterial({ color: srgb(0.10, 0.07, 0.07) })
  const hoodMat = new THREE.MeshLambertMaterial({ color: srgb(0.24, 0.09, 0.08) })
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.45, 0.45) })

  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)

  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(g, m)
    o.position.set(x, y, z)
    o.castShadow = true
    return o
  }

  // cloak / torso
  const cloak = mesh(new THREE.CylinderGeometry(0.17, 0.3, 0.62, 10, 1, true), cloakMat, 0, 0.72, 0)
  cloak.material = cloakMat.clone()
  ;(cloak.material as THREE.MeshLambertMaterial).side = THREE.DoubleSide
  body.add(cloak)
  body.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.14, 10), darkMat, 0, 1.0, 0))

  // glowing waist trim + collar
  const belt = mesh(new THREE.TorusGeometry(0.235, 0.014, 6, 20), glow, 0, 0.62, 0)
  belt.rotation.x = Math.PI / 2
  belt.castShadow = false
  body.add(belt)
  const collar = mesh(new THREE.TorusGeometry(0.17, 0.012, 6, 16), glow, 0, 1.02, 0)
  collar.rotation.x = Math.PI / 2
  collar.castShadow = false
  body.add(collar)

  // head + hood
  const head = new THREE.Group()
  head.position.set(0, 1.08, 0)
  head.add(mesh(new THREE.SphereGeometry(0.15, 10, 8), darkMat))
  const hood = mesh(new THREE.SphereGeometry(0.19, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), hoodMat, 0, 0.03, -0.015)
  head.add(hood)
  const peak = mesh(new THREE.ConeGeometry(0.1, 0.24, 8), hoodMat, 0, 0.17, -0.12)
  peak.rotation.x = -0.9
  head.add(peak)
  body.add(head)

  const limb = (x: number, y: number, len: number, r: number, mat: THREE.Material, trim = false) => {
    const pivot = new THREE.Group()
    pivot.position.set(x, y, 0)
    const m = mesh(new THREE.CylinderGeometry(r, r * 0.85, len, 6), mat, 0, -len / 2, 0)
    pivot.add(m)
    if (trim) {
      const t = mesh(new THREE.TorusGeometry(r * 1.1, 0.01, 5, 10), glow, 0, -len + 0.06, 0)
      t.rotation.x = Math.PI / 2
      t.castShadow = false
      pivot.add(t)
    }
    return pivot
  }

  const legL = limb(-0.1, 0.46, 0.46, 0.065, darkMat)
  const legR = limb(0.1, 0.46, 0.46, 0.065, darkMat)
  const armL = limb(-0.25, 0.98, 0.46, 0.05, cloakMat, true)
  const armR = limb(0.25, 0.98, 0.46, 0.05, cloakMat, true)
  root.add(legL, legR)
  body.add(armL, armR)

  return { root, body, head, legL, legR, armL, armR, cloak, phase: 0 }
}

/** Idle / walk / run blended by speed. */
export function animateCharacter(rig: CharacterRig, speed: number, dt: number, time: number) {
  const move = THREE.MathUtils.clamp(speed / 3.4, 0, 1)
  rig.phase += dt * (3.2 + speed * 1.9) * (move > 0.02 ? 1 : 0)
  const s = Math.sin(rig.phase)
  const amp = 0.95 * move
  rig.legL.rotation.x = s * amp
  rig.legR.rotation.x = -s * amp
  rig.armL.rotation.x = -s * amp * 0.85
  rig.armR.rotation.x = s * amp * 0.85
  rig.armL.rotation.z = 0.08 + (1 - move) * 0.04
  rig.armR.rotation.z = -0.08 - (1 - move) * 0.04

  const run = THREE.MathUtils.clamp((speed - 2.2) / 3.4, 0, 1)
  rig.body.rotation.x = THREE.MathUtils.lerp(rig.body.rotation.x, 0.06 + run * 0.2, 1 - Math.exp(-10 * dt))
  rig.body.position.y = Math.abs(Math.sin(rig.phase)) * 0.06 * move + Math.sin(time * 2) * 0.006 * (1 - move)
  rig.body.scale.y = 1 + Math.sin(time * 2) * 0.012 * (1 - move)
  rig.head.rotation.y = Math.sin(time * 0.8) * 0.15 * (1 - move)
  rig.cloak.scale.x = 1 + run * 0.06 + Math.sin(rig.phase * 2) * 0.03 * move
  rig.cloak.scale.z = 1 + run * 0.06 + Math.cos(rig.phase * 2) * 0.03 * move
}

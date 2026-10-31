import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CAMERA } from '../game/config'
import { playerState } from '../game/store'
import { combat } from '../combat/state'

const pitch = THREE.MathUtils.degToRad(CAMERA.pitchDeg)
const OFFSET_Y = Math.sin(pitch) * CAMERA.distance
const OFFSET_Z = Math.cos(pitch) * CAMERA.distance

/** Fixed-yaw, high-angle follow camera with damping and a little look-ahead (matches the reference). */
export function CameraRig() {
  const focus = useRef(new THREE.Vector3(0, 0, 0))
  const first = useRef(true)

  useFrame(({ camera }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const { pos, vel } = playerState
    const tx = pos.x + vel.x * CAMERA.lookAhead
    const ty = pos.y + CAMERA.lookHeight
    const tz = pos.z + vel.z * CAMERA.lookAhead
    const f = focus.current
    if (first.current) {
      f.set(tx, ty, tz)
      first.current = false
    } else {
      f.x = THREE.MathUtils.damp(f.x, tx, CAMERA.damp, dt)
      f.y = THREE.MathUtils.damp(f.y, ty, CAMERA.damp, dt)
      f.z = THREE.MathUtils.damp(f.z, tz, CAMERA.damp, dt)
    }
    camera.position.set(f.x, f.y + OFFSET_Y, f.z + OFFSET_Z)
    if (combat.shake > 0) {
      const k = combat.shake * combat.shake * 0.35
      camera.position.x += (Math.random() - 0.5) * k
      camera.position.y += (Math.random() - 0.5) * k
    }
    camera.lookAt(f)
  })

  return null
}

import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { PLAYER } from '../game/config'
import { playerState } from '../game/store'
import { readMove } from '../input/useKeyboard'
import { sharedUniforms } from '../shaders/materials'
import { heightAt } from '../world/heightAt'
import { resolveCollisions } from '../world/scatter'
import { animateCharacter, createCharacter } from './character'

const mv = { x: 0, y: 0, walk: false }
const damp = THREE.MathUtils.damp

function lerpAngle(a: number, b: number, t: number) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a))
  return a + d * t
}

export function Player() {
  const rig = useMemo(() => createCharacter(), [])

  useEffect(() => {
    playerState.pos.set(0, heightAt(0, 0), 0)
    playerState.vel.set(0, 0, 0)
    playerState.speed = 0
    playerState.facing = Math.PI * 0.1
    return () => {
      rig.root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose()
      })
    }
  }, [rig])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    readMove(mv)
    const mag = Math.min(1, Math.hypot(mv.x, mv.y))

    // Analog response: a light stick push walks, a full push runs. Shift forces walking.
    const analog = THREE.MathUtils.smoothstep(mag, 0.05, 0.95)
    const top = mv.walk ? PLAYER.walkSpeed : PLAYER.runSpeed
    const target = mag > 0.001 ? THREE.MathUtils.lerp(PLAYER.walkSpeed * 0.6, top, analog) : 0
    // camera looks toward -Z, so screen-up is -Z
    const dirX = mag > 0.001 ? mv.x / mag : 0
    const dirZ = mag > 0.001 ? -mv.y / mag : 0

    const { pos, vel } = playerState
    vel.x = damp(vel.x, dirX * target, PLAYER.accel, dt)
    vel.z = damp(vel.z, dirZ * target, PLAYER.accel, dt)

    pos.x += vel.x * dt
    pos.z += vel.z * dt
    resolveCollisions(pos, PLAYER.radius)
    pos.y = damp(pos.y, heightAt(pos.x, pos.z), 18, dt)

    const speed = Math.hypot(vel.x, vel.z)
    playerState.speed = speed
    if (speed > 0.25) {
      playerState.facing = lerpAngle(playerState.facing, Math.atan2(vel.x, vel.z), 1 - Math.exp(-PLAYER.turnRate * dt))
    }

    rig.root.position.copy(pos)
    rig.root.rotation.y = playerState.facing
    animateCharacter(rig, speed, dt, state.clock.elapsedTime)
    sharedUniforms.uPlayer.value.copy(pos)
  })

  return <primitive object={rig.root} />
}

import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { PLAYER } from '../game/config'
import { input, playerState } from '../game/store'
import { readMove } from '../input/useKeyboard'
import { sharedUniforms } from '../shaders/materials'
import { biomeAt, depthAt, heightAt, lavaAt, WORLD_HALF, world } from '../world/terrainData'
import { BIOMES } from '../world/biomes'
import { resolveCollisions } from '../world/scatter'
import { audio } from '../audio/audio'
import { combat, tickCombat } from '../combat/state'
import { animateCharacter, createCharacter, disposeCharacter, type CharacterRig } from './character'

/** Live handle for effects that attach to the character (slash trail, sparks). */
export const playerRig: { current: CharacterRig | null } = { current: null }

const mv = { x: 0, y: 0, walk: false }
const LAVA_PROBE: [number, number][] = [[0, 0], [0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45]]
const surfaceAt = (x: number, z: number) => (depthAt(x, z) > 0.06 ? 'water' : BIOMES[biomeAt(x, z)].surface)
const damp = THREE.MathUtils.damp

function lerpAngle(a: number, b: number, t: number) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a))
  return a + d * t
}

export function Player() {
  const rig = useMemo(() => createCharacter(), [])

  useEffect(() => {
    playerRig.current = rig
    playerState.pos.set(world.spawn.x, heightAt(world.spawn.x, world.spawn.z), world.spawn.z)
    playerState.vel.set(0, 0, 0)
    playerState.speed = 0
    playerState.facing = Math.PI * 0.1
    return () => {
      playerRig.current = null
      disposeCharacter(rig)
    }
  }, [rig])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    tickCombat(dt)
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
    const attacking = combat.active
    if (attacking && combat.t < 0.02) {
      // snap toward the aim (pointer) or, failing that, the held direction
      if (combat.hasAim) playerState.facing = combat.aim
      else if (mag > 0.1) playerState.facing = Math.atan2(dirX, dirZ)
    }
    let tvx = dirX * target
    let tvz = dirZ * target
    if (attacking) {
      const u = combat.u
      const striking = u >= combat.def.hitFrom * 0.6 && u <= combat.def.hitTo
      tvx *= combat.def.move
      tvz *= combat.def.move
      if (striking) {
        tvx += Math.sin(playerState.facing) * combat.def.lunge
        tvz += Math.cos(playerState.facing) * combat.def.lunge
      }
    }
    vel.x = damp(vel.x, tvx, attacking ? 22 : PLAYER.accel, dt)
    vel.z = damp(vel.z, tvz, attacking ? 22 : PLAYER.accel, dt)

    // deep water blocks movement, shallows slow you down
    const d0 = depthAt(pos.x, pos.z)
    const slow = d0 > 0.05 ? 1 - Math.min(0.45, d0 * 0.6) : 1
    const nx = pos.x + vel.x * dt * slow
    const nz = pos.z + vel.z * dt * slow
    // lava is solid ground you can't wade into: block at its edge (a small margin keeps you off the glow)
    const lavaBlocked = (x: number, z: number) => {
      for (const [ox, oz] of LAVA_PROBE) {
        const l = lavaAt(x + ox, z + oz)
        if (l !== null && l > heightAt(x + ox, z + oz) - 0.02) return true
      }
      return false
    }
    const clearAt = (x: number, z: number) => depthAt(x, z) < 1.0 && !lavaBlocked(x, z)
    if (clearAt(nx, nz)) {
      pos.x = nx
      pos.z = nz
    } else if (clearAt(nx, pos.z)) pos.x = nx
    else if (clearAt(pos.x, nz)) pos.z = nz
    else { vel.x = 0; vel.z = 0 }
    const lim = WORLD_HALF - 6
    pos.x = Math.max(-lim, Math.min(lim, pos.x))
    pos.z = Math.max(-lim, Math.min(lim, pos.z))
    resolveCollisions(pos, PLAYER.radius)
    // vertical: grounded follows the terrain; jump launches with gravity, landing plays a thud
    const ground = heightAt(pos.x, pos.z)
    if (input.jump > 0) input.jump -= dt
    if (playerState.grounded) {
      if (input.jump > 0) {
        playerState.grounded = false
        playerState.vy = 6.2
        input.jump = 0
        audio.jump()
      } else if (pos.y - ground > 0.35) {
        playerState.grounded = false // walked off a ledge
        playerState.vy = 0
      } else pos.y = damp(pos.y, ground, 18, dt)
    }
    if (!playerState.grounded) {
      playerState.vy -= 17 * dt
      pos.y += playerState.vy * dt
      if (pos.y <= ground && playerState.vy <= 0) {
        pos.y = ground
        playerState.grounded = true
        playerState.vy = 0
        audio.land(surfaceAt(pos.x, pos.z))
      }
    }

    const speed = Math.hypot(vel.x, vel.z)
    playerState.speed = speed
    if (speed > 0.25 && !attacking) {
      playerState.facing = lerpAngle(playerState.facing, Math.atan2(vel.x, vel.z), 1 - Math.exp(-PLAYER.turnRate * dt))
    }

    rig.root.scale.setScalar(1.3)
    rig.root.position.copy(pos)
    rig.root.rotation.y = playerState.facing
    const prevPhase = Math.floor(rig.phase / Math.PI)
    animateCharacter(
      rig,
      attacking ? Math.min(speed, 1.2) : speed,
      dt,
      state.clock.elapsedTime,
      attacking ? { kind: combat.kind!, step: combat.step, u: combat.u, hitFrom: combat.def.hitFrom, hitTo: combat.def.hitTo } : null,
      playerState.grounded ? 0 : 1,
    )
    if (speed > 0.9 && !attacking && playerState.grounded && Math.floor(rig.phase / Math.PI) !== prevPhase) {
      audio.step(surfaceAt(pos.x, pos.z), speed > 3.6)
    }
    sharedUniforms.uPlayer.value.copy(pos)
  })

  return <primitive object={rig.root} />
}

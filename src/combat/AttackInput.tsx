import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { audio } from '../audio/audio'
import { playerState, useHud } from '../game/store'
import { combat, requestAttack, type AttackKind } from './state'

/**
 * Controls
 *   Left click / J    light slash (click again to chain a 3-hit combo)
 *   Right click / K   heavy overhead slam
 *   E                 dash thrust
 *   Space             jump
 *   Q / R             spin slash
 * The blade swings toward the mouse pointer; on touch, toward the move direction.
 */
const pointer = { x: 0, y: 0, active: false }
const KEYS: Record<string, AttackKind> = { KeyJ: 'light', KeyK: 'heavy', KeyE: 'thrust', KeyQ: 'spin', KeyR: 'spin' }
const _v = new THREE.Vector3()

export function AttackInput() {
  const { gl } = useThree()

  useEffect(() => {
    const el = gl.domElement
    const pd = (e: PointerEvent) => {
      audio.start()
      if ((e.target as HTMLElement)?.closest?.('.atk, .hud-ui')) return
      if (e.pointerType !== 'mouse') return
      pointer.active = true
      if (e.button === 0) requestAttack('light')
      else if (e.button === 2) requestAttack('heavy')
    }
    const pm = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      const r = el.getBoundingClientRect()
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1
      pointer.y = -(((e.clientY - r.top) / r.height) * 2 - 1)
      pointer.active = true
    }
    const ctx = (e: Event) => e.preventDefault()
    const kd = (e: KeyboardEvent) => {
      audio.start()
      const k = KEYS[e.code]
      const h = useHud.getState()
      if (h.menuOpen || h.bagOpen || h.mapOpen) return
      if (!k || e.repeat) return
      e.preventDefault()
      requestAttack(k)
    }
    // window-level: the touch joystick layer sits above the canvas and would swallow mouse events
    window.addEventListener('pointerdown', pd)
    window.addEventListener('pointermove', pm)
    window.addEventListener('contextmenu', ctx)
    window.addEventListener('keydown', kd)
    return () => {
      el.removeEventListener('pointerdown', pd)
      el.removeEventListener('pointermove', pm)
      el.removeEventListener('contextmenu', ctx)
      window.removeEventListener('keydown', kd)
    }
  }, [gl])

  useFrame(({ camera, size }) => {
    if (!pointer.active) {
      combat.hasAim = false
      return
    }
    _v.set(playerState.pos.x, playerState.pos.y + 0.6, playerState.pos.z).project(camera)
    const dx = (pointer.x - _v.x) * (size.width / size.height)
    const dy = pointer.y - _v.y
    if (Math.hypot(dx, dy) < 0.02) return
    combat.aim = Math.atan2(dx, -dy)
    combat.hasAim = true
  })
  return null
}

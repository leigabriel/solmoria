import { useEffect, useRef } from 'react'
import { input } from '../game/store'

const RADIUS = 58
const DEADZONE = 0.08

/**
 * Dynamic ("floating") joystick: appears wherever the thumb lands in the left part of the screen
 * and follows the thumb if it is dragged past the rim. Touch / pen only; mouse users have WASD.
 */
export function Joystick() {
  const zone = useRef<HTMLDivElement>(null)
  const base = useRef<HTMLDivElement>(null)
  const knob = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = zone.current!
    const b = base.current!
    const k = knob.current!
    let id = -1
    let cx = 0
    let cy = 0

    const place = () => {
      b.style.transform = `translate(${cx - RADIUS}px, ${cy - RADIUS}px)`
    }
    const reset = () => {
      id = -1
      input.joyX = 0
      input.joyY = 0
      b.style.opacity = '0'
      k.style.transform = 'translate(0px, 0px)'
    }

    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || id !== -1) return
      id = e.pointerId
      el.setPointerCapture(id)
      cx = e.clientX
      cy = e.clientY
      place()
      b.style.opacity = '1'
      input.used = true
      move(e)
    }
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      let dx = e.clientX - cx
      let dy = e.clientY - cy
      const d = Math.hypot(dx, dy)
      if (d > RADIUS) {
        // drag the base along so the thumb never leaves the pad
        const over = d - RADIUS
        cx += (dx / d) * over
        cy += (dy / d) * over
        dx = (dx / d) * RADIUS
        dy = (dy / d) * RADIUS
        place()
      }
      k.style.transform = `translate(${dx}px, ${dy}px)`
      const nx = dx / RADIUS
      const ny = dy / RADIUS
      const m = Math.hypot(nx, ny)
      if (m < DEADZONE) {
        input.joyX = 0
        input.joyY = 0
      } else {
        const s = (m - DEADZONE) / (1 - DEADZONE) / m
        input.joyX = nx * s
        input.joyY = -ny * s
      }
    }
    const up = (e: PointerEvent) => {
      if (e.pointerId === id) reset()
    }

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      reset()
    }
  }, [])

  return (
    <div ref={zone} className="joy-zone">
      <div ref={base} className="joy-base">
        <div ref={knob} className="joy-knob" />
      </div>
    </div>
  )
}

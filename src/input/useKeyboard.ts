import { useEffect } from 'react'
import { input } from '../game/store'

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'])

export function useKeyboard() {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        if (!e.repeat) input.jump = 0.15
        input.used = true
        return
      }
      if (!MOVE_KEYS.has(e.code)) return
      input.keys.add(e.code)
      input.used = true
      e.preventDefault()
    }
    const up = (e: KeyboardEvent) => input.keys.delete(e.code)
    const clear = () => input.keys.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [])
}

/** Returns movement in screen space: x right, y up, length <= 1, plus whether the walk modifier is held. */
export function readMove(out: { x: number; y: number; walk: boolean }) {
  const k = input.keys
  let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0)
  let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0)
  const kl = Math.hypot(x, y)
  if (kl > 0) {
    x /= kl
    y /= kl
  }
  // joystick overrides / adds (analog)
  x += input.joyX
  y += input.joyY
  const l = Math.hypot(x, y)
  if (l > 1) {
    x /= l
    y /= l
  }
  out.x = x
  out.y = y
  out.walk = k.has('ShiftLeft') || k.has('ShiftRight')
  return out
}

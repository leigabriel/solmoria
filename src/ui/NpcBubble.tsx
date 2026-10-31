import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { nearestNpc } from '../animals/Animals'
import { playerState } from '../game/store'

let el: HTMLDivElement | null = null
let nameEl: HTMLDivElement | null = null
let lineEl: HTMLDivElement | null = null
const v = new THREE.Vector3()
let lastText = ''

/** Speech bubble shown over the nearest villager. Plain DOM, positioned from inside the canvas. */
export function NpcBubble() {
  return (
    <div className="npc-bubble" ref={(n) => { el = n }}>
      <div className="npc-name" ref={(n) => { nameEl = n }} />
      <div className="npc-line" ref={(n) => { lineEl = n }} />
    </div>
  )
}

export function NpcBubbleDriver() {
  useFrame(({ camera, size, clock }) => {
    if (!el || !nameEl || !lineEl) return
    const n = nearestNpc(playerState.pos.x, playerState.pos.z, 4.2)
    if (!n) {
      el.style.visibility = 'hidden'
      return
    }
    const line = n.lines[(n.seed + Math.floor(clock.elapsedTime / 7)) % n.lines.length]
    const text = `${n.name} · ${n.title}|${line}`
    if (text !== lastText) {
      lastText = text
      nameEl.textContent = `${n.name} · ${n.title}`
      lineEl.textContent = line
    }
    camera.updateMatrixWorld()
    v.set(n.x, n.y + 1.35, n.z).project(camera)
    el.style.visibility = v.z < 1 ? 'visible' : 'hidden'
    el.style.transform = `translate3d(${((v.x * 0.5 + 0.5) * size.width).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * size.height).toFixed(1)}px, 0) translate(-50%, -100%)`
  })
  return null
}

import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { PLAYER_NAME } from '../game/config'
import { playerState } from '../game/store'

let el: HTMLDivElement | null = null
const v = new THREE.Vector3()

/** The tag itself: plain DOM, styled in styles.css (.nametag). Positioned by <NameTagDriver/>. */
export function NameTag() {
  return (
    <div className="nametag" ref={(node) => { el = node }}>
      {PLAYER_NAME}
    </div>
  )
}

/** Lives inside the Canvas, after the camera rig, and projects the head position to the screen every frame. */
export function NameTagDriver() {
  useFrame(({ camera, size }) => {
    if (!el) return
    camera.updateMatrixWorld()
    v.set(playerState.pos.x, playerState.pos.y + 1.6, playerState.pos.z).project(camera)
    const visible = v.z < 1
    el.style.visibility = visible ? 'visible' : 'hidden'
    const x = (v.x * 0.5 + 0.5) * size.width
    const y = (-v.y * 0.5 + 0.5) * size.height
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`
  })
  return null
}

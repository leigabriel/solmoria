import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { QUALITY, SUN_DIR } from '../game/config'
import { biomeState, playerState, useSettings } from '../game/store'
import { sharedUniforms } from '../shaders/materials'

const HALF = 20
const _right = new THREE.Vector3()
const _up = new THREE.Vector3()
const _t = new THREE.Vector3()
const WORLD_UP = new THREE.Vector3(0, 1, 0)

/** Warm key light from the upper left, cool-green hemisphere fill. Shadow frustum follows the player. */
export function Lighting() {
  const q = QUALITY[useSettings((s) => s.quality)]
  const light = useRef<THREE.DirectionalLight>(null!)
  const hemi = useRef<THREE.HemisphereLight>(null!)
  const target = useMemo(() => new THREE.Object3D(), [])
  const texel = (HALF * 2) / q.shadowMapSize

  useLayoutEffect(() => {
    const l = light.current
    l.target = target
    const c = l.shadow.camera
    c.left = -HALF
    c.right = HALF
    c.top = HALF
    c.bottom = -HALF
    c.near = 1
    c.far = 90
    c.updateProjectionMatrix()
    l.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize)
    l.shadow.bias = -0.0006
    l.shadow.normalBias = 0.04
    l.shadow.radius = 3
  }, [q.shadowMapSize, target])

  useFrame((state) => {
    sharedUniforms.uTime.value = state.clock.elapsedTime
    light.current.color.copy(biomeState.sun)
    light.current.intensity = biomeState.sunI
    hemi.current.color.copy(biomeState.hemiSky)
    hemi.current.groundColor.copy(biomeState.hemiGround)
    hemi.current.intensity = biomeState.hemi
    // snap the focus point to shadow-texel steps in light space so shadows don't shimmer while moving
    const p = playerState.pos
    _right.crossVectors(WORLD_UP, SUN_DIR).normalize()
    _up.crossVectors(SUN_DIR, _right).normalize()
    const px = p.dot(_right)
    const py = p.dot(_up)
    const sx = Math.round(px / texel) * texel
    const sy = Math.round(py / texel) * texel
    _t.copy(p).addScaledVector(_right, sx - px).addScaledVector(_up, sy - py)
    target.position.copy(_t)
    light.current.position.copy(_t).addScaledVector(SUN_DIR, 45)
    target.updateMatrixWorld()
  })

  return (
    <>
      <primitive object={target} />
      <directionalLight ref={light} color="#fff1cf" intensity={2.5} castShadow />
      <hemisphereLight ref={hemi} args={['#e7f3c8', '#58702a', 1.55]} />
    </>
  )
}

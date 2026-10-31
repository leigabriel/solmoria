import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { CAMERA } from './config'
import { sharedUniforms } from '../shaders/materials'

/** Keeps frame time near 60 fps by nudging the pixel ratio, and feeds the pixel-scale uniform used by mist. */
export function AdaptiveRes({ max }: { max: number }) {
  const { gl, size } = useThree()
  const avg = useRef(16)
  const cool = useRef(0)
  const dpr = useRef(Math.min(max, 1.25))
  useFrame((_, dt) => {
    avg.current += (dt * 1000 - avg.current) * 0.05
    cool.current -= dt
    if (cool.current <= 0) {
      if (avg.current > 20 && dpr.current > 0.7) { dpr.current = Math.max(0.7, dpr.current - 0.15); cool.current = 1 }
      else if (avg.current < 14.5 && dpr.current < max) { dpr.current = Math.min(max, dpr.current + 0.1); cool.current = 2 }
      if (Math.abs(gl.getPixelRatio() - dpr.current) > 0.01) gl.setPixelRatio(dpr.current)
    }
    sharedUniforms.uPxPerUnit.value = (size.height * dpr.current) / (2 * Math.tan((CAMERA.fov * Math.PI) / 360) * CAMERA.distance)
  })
  return null
}

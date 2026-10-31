import { useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { audio } from './audio'

/** Starts audio on the first gesture (autoplay policy) and runs the ambience mixer. */
export function AudioDriver() {
  useEffect(() => {
    const go = () => audio.start()
    window.addEventListener('pointerdown', go)
    window.addEventListener('keydown', go)
    window.addEventListener('touchstart', go)
    return () => {
      window.removeEventListener('pointerdown', go)
      window.removeEventListener('keydown', go)
      window.removeEventListener('touchstart', go)
    }
  }, [])
  useFrame((_, dt) => audio.update(Math.min(dt, 0.1)))
  return null
}

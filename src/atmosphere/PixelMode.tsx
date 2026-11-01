import { useEffect } from 'react'
import { sharedUniforms } from '../shaders/materials'
import { PIXEL_PRESETS } from '../game/pixel'
import { useSettings } from '../game/store'

/** Applies the pixel-art setting outside the render loop: terrain texture cells and the nearest-neighbour upscale class. */
export function PixelMode() {
  const pixel = useSettings((s) => s.pixel)
  useEffect(() => {
    const p = PIXEL_PRESETS[pixel]
    sharedUniforms.uPix.value = p ? p.cells : 0
    document.documentElement.classList.toggle('px', !!p)
    return () => document.documentElement.classList.remove('px')
  }, [pixel])
  return null
}

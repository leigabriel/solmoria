import { forwardRef, useMemo } from 'react'
import { Bloom, EffectComposer, HueSaturation, SMAA, Vignette } from '@react-three/postprocessing'
import { Effect } from 'postprocessing'
import { Uniform } from 'three'
import { QUALITY } from '../game/config'
import { PIXEL_PRESETS } from '../game/pixel'
import { useSettings } from '../game/store'

const FRAG = /* glsl */ `
uniform float uLevels;
float bayer4(vec2 c) {
  vec2 m = mod(floor(c), 4.0);
  float i = m.x + m.y * 4.0;
  // 4x4 Bayer matrix, row-major
  float t[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return t[int(i)] / 16.0;
}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = pow(max(inputColor.rgb, 0.0), vec3(1.0 / 2.2));
  float d = (bayer4(gl_FragCoord.xy) - 0.5) / uLevels;
  c = floor((c + d) * uLevels + 0.5) / uLevels;
  outputColor = vec4(pow(c, vec3(2.2)), inputColor.a);
}
`

class PixelPaletteEffect extends Effect {
  constructor(levels: number) {
    super('PixelPaletteEffect', FRAG, { uniforms: new Map([['uLevels', new Uniform(levels)]]) })
  }
}

/** Posterises to a limited colour set with an ordered (Bayer) dither: the "few colours" pixel-art look. */
const PixelPalette = forwardRef<PixelPaletteEffect, { levels: number }>(function PixelPalette({ levels }, ref) {
  const effect = useMemo(() => new PixelPaletteEffect(levels), [levels])
  return <primitive ref={ref} object={effect} dispose={null} />
})

/** Bloom (only the glowing accents / pollen exceed the threshold), vignette and a touch of saturation. */
export function Effects() {
  const q = QUALITY[useSettings((s) => s.quality)]
  const px = PIXEL_PRESETS[useSettings((s) => s.pixel)]
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {q.bloom ? <Bloom mipmapBlur luminanceThreshold={0.7} luminanceSmoothing={0.35} intensity={0.85} radius={0.85} /> : <></>}
      <HueSaturation saturation={px ? 0.12 : 0.04} />
      <Vignette offset={0.28} darkness={0.55} eskil={false} />
      {q.smaa && !px ? <SMAA /> : <></>}
      {px ? <PixelPalette levels={px.levels} /> : <></>}
    </EffectComposer>
  )
}

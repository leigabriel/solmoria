import { Bloom, EffectComposer, HueSaturation, SMAA, Vignette } from '@react-three/postprocessing'
import { QUALITY } from '../game/config'
import { useSettings } from '../game/store'

/** Bloom (only the glowing accents / pollen exceed the threshold), vignette and a touch of saturation. */
export function Effects() {
  const q = QUALITY[useSettings((s) => s.quality)]
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {q.bloom ? <Bloom mipmapBlur luminanceThreshold={0.92} luminanceSmoothing={0.2} intensity={0.55} radius={0.7} /> : <></>}
      <HueSaturation saturation={0.04} />
      <Vignette offset={0.28} darkness={0.55} eskil={false} />
      {q.smaa ? <SMAA /> : <></>}
    </EffectComposer>
  )
}

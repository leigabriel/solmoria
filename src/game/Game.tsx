import { Canvas } from '@react-three/fiber'
import { PCFShadowMap } from 'three'
import { Effects } from '../atmosphere/Effects'
import { GodRays } from '../atmosphere/GodRays'
import { Lighting } from '../atmosphere/Lighting'
import { Pollen } from '../atmosphere/Pollen'
import { CameraRig } from '../player/CameraRig'
import { NameTagDriver } from '../ui/NameTag'
import { Player } from '../player/Player'
import { NpcBubbleDriver } from '../ui/NpcBubble'
import { Animals } from '../animals/Animals'
import { AttackInput } from '../combat/AttackInput'
import { CombatFX } from '../combat/CombatFX'
import { AudioDriver } from '../audio/AudioDriver'
import { World } from '../world/World'
import { CAMERA, QUALITY, SKY_COLOR } from './config'
import { AdaptiveRes } from './AdaptiveRes'
import { useSettings } from './store'

export function Game() {
  const quality = useSettings((s) => s.quality)
  const q = QUALITY[quality]
  return (
    // key: switching quality rebuilds the renderer + world cleanly
    <Canvas
      key={quality}
      shadows={{ type: PCFShadowMap }}
      flat
      dpr={Math.min(q.dpr, typeof window === 'undefined' ? 1 : window.devicePixelRatio)}
      gl={{ antialias: !q.smaa && !q.bloom, powerPreference: 'high-performance' }}
      camera={{ fov: CAMERA.fov, near: 0.5, far: 260, position: [0, 14, 10] }}
    >
      <color attach="background" args={[SKY_COLOR]} />
      <fog attach="fog" args={[SKY_COLOR, 40, 100]} />
      <Lighting />
      <World />
      <Player />
      <Animals />
      <AttackInput />
      <CombatFX />
      <AudioDriver />
      <CameraRig />
      <NameTagDriver />
      <NpcBubbleDriver />
      {q.godRays && <GodRays />}
      <AdaptiveRes max={Math.min(q.dpr, typeof window === 'undefined' ? 1 : window.devicePixelRatio)} />
      <Pollen />
      <Effects />
    </Canvas>
  )
}

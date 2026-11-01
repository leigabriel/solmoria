import { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { biomeState, playerState } from '../game/store'
import { BIOMES, BIOME_COUNT } from '../world/biomes'
import { biomeAt, lavaAt } from '../world/terrainData'

const target = new Float32Array(BIOME_COUNT)
const _a = new THREE.Color()
const _b = new THREE.Color()
const SAMPLES: [number, number][] = [[0, 0], [9, 0], [-9, 0], [0, 9], [0, -9], [6, 6], [-6, 6], [6, -6], [-6, -6]]

const defs = BIOMES.map((b) => ({
  sky: new THREE.Color(b.atmo.sky),
  fog: new THREE.Color(b.atmo.fog),
  hemiSky: new THREE.Color(b.atmo.hemiSky),
  hemiGround: new THREE.Color(b.atmo.hemiGround),
  sun: new THREE.Color(b.atmo.sun),
  pc: new THREE.Color(b.particle.color[0], b.particle.color[1], b.particle.color[2]),
  b,
}))

/** Blends sky, fog, light colours, particles and ambience between biomes as the player walks. */
export function BiomeAtmosphere() {
  const { scene } = useThree()
  const bg = useMemo(() => new THREE.Color(), [])
  const fog = useMemo(() => new THREE.Fog('#d4e6b4', 40, 100), [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const { x, z } = playerState.pos
    target.fill(0)
    for (const [dx, dz] of SAMPLES) target[biomeAt(x + dx, z + dz)] += 1 / SAMPLES.length
    const k = 1 - Math.exp(-dt * 1.4)
    const w = biomeState.w
    let best = 0
    let bestW = -1
    let sum = 0
    for (let i = 0; i < BIOME_COUNT; i++) {
      w[i] += (target[i] - w[i]) * k
      sum += w[i]
      if (w[i] > bestW) {
        bestW = w[i]
        best = i
      }
    }
    biomeState.id = biomeAt(x, z) === best ? best : target[best] > 0.5 ? best : biomeAt(x, z)
    const inv = 1 / Math.max(sum, 1e-4)

    bg.setRGB(0, 0, 0)
    fog.color.setRGB(0, 0, 0)
    biomeState.hemiSky.setRGB(0, 0, 0)
    biomeState.hemiGround.setRGB(0, 0, 0)
    biomeState.sun.setRGB(0, 0, 0)
    biomeState.particleColor.setRGB(0, 0, 0)
    let near = 0, far = 0, hemi = 0, sunI = 0, fall = 0, size = 0, wind = 0, birds = 0, wp = 0
    for (let i = 0; i < BIOME_COUNT; i++) {
      const f = w[i] * inv
      if (f < 0.002) continue
      const d = defs[i]
      bg.r += d.sky.r * f; bg.g += d.sky.g * f; bg.b += d.sky.b * f
      fog.color.r += d.fog.r * f; fog.color.g += d.fog.g * f; fog.color.b += d.fog.b * f
      biomeState.hemiSky.r += d.hemiSky.r * f; biomeState.hemiSky.g += d.hemiSky.g * f; biomeState.hemiSky.b += d.hemiSky.b * f
      biomeState.hemiGround.r += d.hemiGround.r * f; biomeState.hemiGround.g += d.hemiGround.g * f; biomeState.hemiGround.b += d.hemiGround.b * f
      biomeState.sun.r += d.sun.r * f; biomeState.sun.g += d.sun.g * f; biomeState.sun.b += d.sun.b * f
      biomeState.particleColor.r += d.pc.r * f; biomeState.particleColor.g += d.pc.g * f; biomeState.particleColor.b += d.pc.b * f
      const a = d.b.atmo
      near += a.near * f; far += a.far * f; hemi += a.hemi * f; sunI += a.sunI * f
      fall += d.b.particle.fall * f; size += d.b.particle.size * f
      wind += d.b.sound.wind * f; birds += d.b.sound.birds * f; wp += d.b.sound.windPitch * f
    }
    fog.near = near
    fog.far = far
    biomeState.hemi = hemi
    biomeState.sunI = sunI
    biomeState.particleFall = fall
    biomeState.particleSize = size
    biomeState.wind = wind
    biomeState.birds = birds
    biomeState.windPitch = wp
    // glow when close to lava: warm the light a touch
    const lv = lavaAt(x, z) !== null || lavaAt(x + 4, z) !== null || lavaAt(x - 4, z) !== null || lavaAt(x, z + 4) !== null || lavaAt(x, z - 4) !== null ? 1 : 0
    biomeState.nearLava += (lv - biomeState.nearLava) * k
    if (biomeState.nearLava > 0.01) {
      _a.setRGB(1, 0.45, 0.12)
      biomeState.hemiSky.lerp(_a, biomeState.nearLava * 0.25)
    }
    _b.copy(bg)
    scene.background = _b
    scene.fog = fog
  })

  return null
}

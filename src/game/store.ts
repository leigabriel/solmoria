import * as THREE from 'three'
import { create } from 'zustand'
import type { Quality } from './config'

const KEY = 'solmoria.quality'

function initialQuality(): Quality {
  const forced = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('quality') : null
  if (forced === 'low' || forced === 'medium' || forced === 'high') return forced
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'low' || saved === 'medium' || saved === 'high') return saved
  } catch {
    /* storage may be unavailable */
  }
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
  return coarse && Math.min(innerWidth, innerHeight) < 900 ? 'low' : 'medium'
}

interface Settings {
  quality: Quality
  setQuality: (q: Quality) => void
}

export const useSettings = create<Settings>((set) => ({
  quality: initialQuality(),
  setQuality: (quality) => {
    try {
      localStorage.setItem(KEY, quality)
    } catch {
      /* ignore */
    }
    set({ quality })
  },
}))

/** Per-frame mutable state. Kept outside React so nothing re-renders at 60 fps. */
export const playerState = {
  pos: new THREE.Vector3(0, 0, 0),
  vel: new THREE.Vector3(),
  speed: 0,
  facing: 0,
  vy: 0,
  grounded: true,
}

/** Live biome state (updated every frame by BiomeAtmosphere, read by lights, particles, audio, HUD). */
export const biomeState = {
  /** dominant biome id under the player */
  id: 0,
  /** smoothed influence per biome, sums to ~1 */
  w: new Float32Array(10).fill(0).map((_, i) => (i === 0 ? 1 : 0)),
  /** blended atmosphere */
  hemiSky: new THREE.Color('#e7f3c8'),
  hemiGround: new THREE.Color('#58702a'),
  hemi: 1.55,
  sun: new THREE.Color('#fff1cf'),
  sunI: 2.5,
  particleColor: new THREE.Color(1.4, 1.3, 0.7),
  particleFall: -0.05,
  particleSize: 0.16,
  wind: 0.4,
  birds: 1,
  windPitch: 1,
  /** set by the player when standing on lava-adjacent ground etc. */
  nearLava: 0,
}

export const input = {
  keys: new Set<string>(),
  joyX: 0,
  joyY: 0,
  used: false,
  /** seconds the jump press stays buffered */
  jump: 0,
}

interface Hud {
  hp: number
  maxHp: number
  menuOpen: boolean
  bagOpen: boolean
  mapOpen: boolean
  volume: number
  setMenu: (v: boolean) => void
  setBag: (v: boolean) => void
  setMap: (v: boolean) => void
  setVolume: (v: number) => void
}

const VOL_KEY = 'solmoria.volume'
function initialVolume() {
  try {
    const v = parseFloat(localStorage.getItem(VOL_KEY) ?? '')
    if (v >= 0 && v <= 1) return v
  } catch {
    /* storage may be unavailable */
  }
  return 0.7
}

export const useHud = create<Hud>((set) => ({
  hp: 100,
  maxHp: 100,
  menuOpen: false,
  bagOpen: false,
  mapOpen: false,
  volume: initialVolume(),
  setMenu: (menuOpen) => set({ menuOpen, bagOpen: false, mapOpen: false }),
  setBag: (bagOpen) => set({ bagOpen, menuOpen: false, mapOpen: false }),
  setMap: (mapOpen) => set({ mapOpen, menuOpen: false, bagOpen: false }),
  setVolume: (volume) => {
    try {
      localStorage.setItem(VOL_KEY, String(volume))
    } catch {
      /* ignore */
    }
    set({ volume })
  },
}))

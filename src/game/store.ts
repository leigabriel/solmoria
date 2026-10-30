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
}

export const input = {
  keys: new Set<string>(),
  joyX: 0,
  joyY: 0,
  used: false,
}

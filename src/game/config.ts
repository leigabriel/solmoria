import * as THREE from 'three'

export const WORLD_SEED = 20261030
export const CHUNK_SIZE = 32
export const CHUNK_SEGMENTS = 32

/** Reference video: high-angle follow camera, ~55 degree pitch, narrow FOV. */
export const CAMERA = {
  fov: 32,
  distance: 20,
  pitchDeg: 55,
  damp: 4.5,
  lookHeight: 0.6,
  lookAhead: 0.28,
}

export const PLAYER = {
  walkSpeed: 2.2,
  runSpeed: 5.6,
  accel: 12,
  turnRate: 11,
  radius: 0.32,
}

/** Direction pointing *toward* the sun: upper-left and behind the scene, so shadows fall down-right. */
export const SUN_DIR = new THREE.Vector3(-0.5, 0.8, -0.3).normalize()

/** Name shown above the player's head. */
export const PLAYER_NAME = 'Lhei'

export const SKY_COLOR = '#d4e6b4'

export type Quality = 'low' | 'medium' | 'high'

export interface QualitySettings {
  dpr: number
  shadowMapSize: number
  chunkRadius: number
  grassDensity: number
  flowerDensity: number
  bloom: boolean
  smaa: boolean
  godRays: boolean
  pollen: number
}

export const QUALITY: Record<Quality, QualitySettings> = {
  low: { dpr: 1, shadowMapSize: 1024, chunkRadius: 1, grassDensity: 4.0, flowerDensity: 0.6, bloom: false, smaa: false, godRays: false, pollen: 40 },
  medium: { dpr: 1.5, shadowMapSize: 2048, chunkRadius: 1, grassDensity: 6.5, flowerDensity: 1, bloom: true, smaa: false, godRays: true, pollen: 90 },
  high: { dpr: 2, shadowMapSize: 2048, chunkRadius: 2, grassDensity: 8.0, flowerDensity: 1, bloom: true, smaa: true, godRays: true, pollen: 160 },
}

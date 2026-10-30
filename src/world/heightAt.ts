import { createNoise2D } from 'simplex-noise'
import { WORLD_SEED } from '../game/config'
import { mulberry32 } from '../utils/random'

const nA = createNoise2D(mulberry32(WORLD_SEED))
const nB = createNoise2D(mulberry32(WORLD_SEED + 1))

/** Gentle rolling meadow: low amplitude so the high-angle camera reads it as soft hills. */
export function heightAt(x: number, z: number) {
  return nA(x * 0.018, z * 0.018) * 1.6 + nA(x * 0.06 + 50, z * 0.06) * 0.45 + nB(x * 0.15, z * 0.15) * 0.08
}

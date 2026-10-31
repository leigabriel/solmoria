import { createNoise2D } from 'simplex-noise'
import { WORLD_SEED } from '../game/config'
import { mulberry32 } from '../utils/random'

const forestN = createNoise2D(mulberry32(WORLD_SEED + 7))
const meadowN = createNoise2D(mulberry32(WORLD_SEED + 13))
const patchN = createNoise2D(mulberry32(WORLD_SEED + 31))

/** 0..1 : how forested a spot is. */
export const forestMask = (x: number, z: number) => forestN(x * 0.011, z * 0.011) * 0.5 + 0.5
/** 0..1 : flower / tall-grass meadow patches. */
export const meadowMask = (x: number, z: number) => meadowN(x * 0.06, z * 0.06) * 0.5 + 0.5
/** 0..1 : large patches that host rare tree colours (blossom / autumn). */
export const patchMask = (x: number, z: number) => patchN(x * 0.02, z * 0.02) * 0.5 + 0.5

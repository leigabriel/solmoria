import type { PixelMode } from './store'

/** Internal render height in pixels, terrain texture cells per world unit and colour levels per channel. */
export const PIXEL_PRESETS: Record<PixelMode, { lines: number; cells: number; levels: number } | null> = {
  off: null,
  fine: { lines: 400, cells: 3, levels: 28 },
  chunky: { lines: 240, cells: 1.6, levels: 16 },
}

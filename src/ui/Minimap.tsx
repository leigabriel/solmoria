import { useEffect, useRef } from 'react'
import { playerState } from '../game/store'
import { useHud } from '../game/store'
import { SEA_LEVEL, VERTS, WORLD_HALF, world } from '../world/terrainData'
import { villages } from '../world/villages'

const SIZE = 150
const VIEW = 96 // world units shown across the square

let cache: HTMLCanvasElement | null = null

/** One pixel per world unit, rendered once from the real terrain / water / site data. */
export function worldImage() {
  if (cache) return cache
  const c = document.createElement('canvas')
  c.width = c.height = VERTS - 1
  const g = c.getContext('2d')!
  const img = g.createImageData(c.width, c.height)
  const h = world.h
  for (let z = 0; z < c.height; z++) {
    for (let x = 0; x < c.width; x++) {
      const i = z * VERTS + x
      const hh = h[i]
      const slope = (h[i - 1 < 0 ? i : i - 1] - h[i + 1] + (h[i - VERTS < 0 ? i : i - VERTS] - h[i + VERTS < h.length ? i + VERTS : i]) * 0.7) * 0.18 || 0
      const light = 0.85 + Math.max(-0.25, Math.min(0.25, slope))
      let r: number, gg: number, b: number
      const d = world.depth[i]
      if (d > 0.02 || hh < SEA_LEVEL) {
        const t = Math.min(1, d / 3)
        r = 70 - 30 * t
        gg = 150 - 50 * t
        b = 170 - 30 * t
      } else if (world.shore[i] > 0.55) {
        r = 214; gg = 196; b = 140
      } else if (hh > 17) {
        const t = Math.min(1, (hh - 17) / 10)
        r = 150 + 60 * t; gg = 146 + 60 * t; b = 134 + 60 * t
      } else {
        const t = Math.min(1, Math.max(0, hh / 14))
        r = 90 + 18 * t; gg = 140 + 10 * t; b = 62 + 4 * t
      }
      const o = (z * c.width + x) * 4
      img.data[o] = Math.min(255, r * light)
      img.data[o + 1] = Math.min(255, gg * light)
      img.data[o + 2] = Math.min(255, b * light)
      img.data[o + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  // landmarks
  for (const s of world.sites) {
    if (s.type === 'village') continue
    g.fillStyle = '#4a3b2a'
    g.fillRect(s.x + WORLD_HALF - 1.5, s.z + WORLD_HALF - 1.5, 3, 3)
  }
  for (const v of villages) {
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.arc(v.site.x + WORLD_HALF, v.site.z + WORLD_HALF, 4.2, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#c0562f'
    g.beginPath()
    g.arc(v.site.x + WORLD_HALF, v.site.z + WORLD_HALF, 2.8, 0, Math.PI * 2)
    g.fill()
  }
  g.fillStyle = '#ffffff'
  for (const f of world.falls) {
    const m = Math.floor(f.pts.length / 6) * 3
    g.fillRect(f.pts[m] + WORLD_HALF - 1.5, f.pts[m + 2] + WORLD_HALF - 1.5, 3, 3)
  }
  cache = c
  return c
}

/** Square map, top-left. North is up; the arrow shows where the hero is facing. */
export function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current!
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    cv.width = cv.height = SIZE * dpr
    const g = cv.getContext('2d')!
    g.scale(dpr, dpr)
    g.imageSmoothingEnabled = true
    const img = worldImage()
    const scale = SIZE / VIEW
    let raf = 0
    let last = 0
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw)
      if (t - last < 66) return
      last = t
      const px = playerState.pos.x + WORLD_HALF
      const pz = playerState.pos.z + WORLD_HALF
      g.fillStyle = '#2c4a5a'
      g.fillRect(0, 0, SIZE, SIZE)
      g.drawImage(img, px - VIEW / 2, pz - VIEW / 2, VIEW, VIEW, 0, 0, SIZE, SIZE)
      // player arrow
      g.save()
      g.translate(SIZE / 2, SIZE / 2)
      g.rotate(Math.PI - playerState.facing)
      g.fillStyle = '#fff6d0'
      g.strokeStyle = '#2a1d12'
      g.lineWidth = 1.5
      g.beginPath()
      g.moveTo(0, -7)
      g.lineTo(5, 5)
      g.lineTo(0, 2)
      g.lineTo(-5, 5)
      g.closePath()
      g.fill()
      g.stroke()
      g.restore()
      void scale
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <button className="hud-map hud-ui" onClick={() => useHud.getState().setMap(true)} aria-label="Open map" title="Map (M)">
      <canvas ref={ref} />
      <span className="hud-n">N</span>
    </button>
  )
}

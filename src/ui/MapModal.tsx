import { useEffect, useRef, useState } from 'react'
import { playerState, useHud } from '../game/store'
import { WORLD_HALF, world } from '../world/terrainData'
import { villages } from '../world/villages'
import { worldImage } from './Minimap'

const WORLD = WORLD_HALF * 2

/** Centered world map. Wheel or +/- zooms, drag pans, double-click recentres on you, M / Esc closes. */
export function MapModal() {
  const open = useHud((s) => s.mapOpen)
  if (!open) return null
  return <MapView />
}

function MapView() {
  const ref = useRef<HTMLCanvasElement>(null)
  const view = useRef({ cx: playerState.pos.x, cz: playerState.pos.z, zoom: 1 })
  const [size, setSize] = useState(() => Math.max(260, Math.min(window.innerWidth - 44, window.innerHeight - 150, 640)))

  useEffect(() => {
    const on = () => setSize(Math.max(260, Math.min(window.innerWidth - 44, window.innerHeight - 150, 640)))
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])

  useEffect(() => {
    const cv = ref.current!
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    cv.width = cv.height = size * dpr
    const g = cv.getContext('2d')!
    const img = worldImage()
    let raf = 0
    const toScreen = (x: number, z: number): [number, number] => {
      const v = view.current
      const ppu = (size / WORLD) * v.zoom
      return [size / 2 + (x - v.cx) * ppu, size / 2 + (z - v.cz) * ppu]
    }
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const v = view.current
      const ppu = (size / WORLD) * v.zoom
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.fillStyle = '#2c4a5a'
      g.fillRect(0, 0, size, size)
      g.imageSmoothingEnabled = true
      const [ox, oz] = toScreen(-WORLD_HALF, -WORLD_HALF)
      g.drawImage(img, ox, oz, WORLD * ppu, WORLD * ppu)
      // waterfalls
      g.fillStyle = '#ffffff'
      g.strokeStyle = '#3a2412'
      g.lineWidth = 1
      for (const f of world.falls) {
        const m = Math.floor(f.pts.length / 6) * 3
        const [x, y] = toScreen(f.pts[m], f.pts[m + 2])
        g.beginPath()
        g.rect(x - 3, y - 3, 6, 6)
        g.fill()
        g.stroke()
      }
      // villages
      g.font = "13px 'Helvetica Neue Light', Helvetica, Arial, sans-serif"
      g.textAlign = 'center'
      for (const vl of villages) {
        const [x, y] = toScreen(vl.site.x, vl.site.z)
        g.fillStyle = '#c0562f'
        g.strokeStyle = '#fff6d8'
        g.lineWidth = 2
        g.beginPath()
        g.arc(x, y, 6, 0, Math.PI * 2)
        g.fill()
        g.stroke()
        g.lineWidth = 3
        g.strokeStyle = 'rgba(40,24,10,0.85)'
        g.strokeText(vl.name, x, y - 11)
        g.fillStyle = '#fff6d8'
        g.fillText(vl.name, x, y - 11)
      }
      // you
      const [px, py] = toScreen(playerState.pos.x, playerState.pos.z)
      g.save()
      g.translate(px, py)
      g.rotate(Math.PI - playerState.facing)
      g.fillStyle = '#fff6d0'
      g.strokeStyle = '#2a1d12'
      g.lineWidth = 2
      g.beginPath()
      g.moveTo(0, -9)
      g.lineTo(6.5, 7)
      g.lineTo(0, 3)
      g.lineTo(-6.5, 7)
      g.closePath()
      g.fill()
      g.stroke()
      g.restore()
    }
    raf = requestAnimationFrame(draw)

    const clampView = () => {
      const v = view.current
      v.zoom = Math.max(1, Math.min(6, v.zoom))
      const half = WORLD / v.zoom / 2
      v.cx = Math.max(-WORLD_HALF + half, Math.min(WORLD_HALF - half, v.cx))
      v.cz = Math.max(-WORLD_HALF + half, Math.min(WORLD_HALF - half, v.cz))
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      view.current.zoom *= e.deltaY < 0 ? 1.18 : 1 / 1.18
      clampView()
    }
    let drag: { x: number; y: number } | null = null
    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY }
      cv.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!drag) return
      const ppu = (size / WORLD) * view.current.zoom
      view.current.cx -= (e.clientX - drag.x) / ppu
      view.current.cz -= (e.clientY - drag.y) / ppu
      drag = { x: e.clientX, y: e.clientY }
      clampView()
    }
    const up = () => (drag = null)
    const dbl = () => {
      view.current.cx = playerState.pos.x
      view.current.cz = playerState.pos.z
      clampView()
    }
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Equal' || e.code === 'NumpadAdd') view.current.zoom *= 1.25
      else if (e.code === 'Minus' || e.code === 'NumpadSubtract') view.current.zoom /= 1.25
      else if (e.code === 'Digit0') view.current.zoom = 1
      else return
      clampView()
    }
    cv.addEventListener('wheel', wheel, { passive: false })
    cv.addEventListener('pointerdown', down)
    cv.addEventListener('pointermove', move)
    cv.addEventListener('pointerup', up)
    cv.addEventListener('dblclick', dbl)
    window.addEventListener('keydown', key)
    return () => {
      cancelAnimationFrame(raf)
      cv.removeEventListener('wheel', wheel)
      cv.removeEventListener('pointerdown', down)
      cv.removeEventListener('pointermove', move)
      cv.removeEventListener('pointerup', up)
      cv.removeEventListener('dblclick', dbl)
      window.removeEventListener('keydown', key)
    }
  }, [size])

  return (
    <div className="map-back hud-ui" onPointerDown={(e) => e.target === e.currentTarget && useHud.getState().setMap(false)}>
      <div className="map-modal" role="dialog" aria-label="Map">
        <div className="map-head">
          <span>
            Map<small>wheel / +/- zoom · drag to pan · double-click to find yourself</small>
          </span>
          <button className="x" onClick={() => useHud.getState().setMap(false)} aria-label="Close">×</button>
        </div>
        <canvas ref={ref} style={{ width: size, height: size }} />
        <div className="map-key">
          <span style={{ ['--c' as string]: '#fff6d0' }}>You</span>
          <span style={{ ['--c' as string]: '#c0562f' }}>Village</span>
          <span style={{ ['--c' as string]: '#ffffff' }}>Waterfall</span>
          <span style={{ ['--c' as string]: '#4a3b2a' }}>Ruins</span>
        </div>
      </div>
    </div>
  )
}

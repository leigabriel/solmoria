import { useEffect, useRef, useState } from 'react'
import { input, playerState, useSettings } from '../game/store'
import type { Quality } from '../game/config'

function Fps() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let frames = 0
    let last = performance.now()
    let raf = 0
    const tick = (t: number) => {
      frames++
      if (t - last >= 500) {
        if (ref.current) ref.current.textContent = `${Math.round((frames * 1000) / (t - last))} fps`
        frames = 0
        last = t
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <div ref={ref} className="fps" />
}

export function Hud() {
  const quality = useSettings((s) => s.quality)
  const setQuality = useSettings((s) => s.setQuality)
  const [hint, setHint] = useState(true)
  const debug = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')

  useEffect(() => {
    if (debug) (window as unknown as { __player: typeof playerState }).__player = playerState
  }, [debug])

  useEffect(() => {
    const id = setInterval(() => {
      if (input.used) {
        setHint(false)
        clearInterval(id)
      }
    }, 300)
    return () => clearInterval(id)
  }, [])

  return (
    <>
      <div className="mist" />
      <div className="intro">
        <h1>Solmoria</h1>
      </div>
      {hint && (
        <div className="hint">
          <span className="hint-kb">WASD / arrows to move · Shift to walk</span>
          <span className="hint-touch">Touch and drag to move</span>
        </div>
      )}
      <label className="quality">
        <span>Quality</span>
        <select value={quality} onChange={(e) => setQuality(e.target.value as Quality)}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </label>
      {debug && <Fps />}
    </>
  )
}

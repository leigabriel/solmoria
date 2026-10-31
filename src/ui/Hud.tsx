import { useEffect } from 'react'
import { audio } from '../audio/audio'
import { PLAYER_NAME, QUALITY, type Quality } from '../game/config'
import { useHud, useSettings } from '../game/store'
import pfp from '../assets/pfp.png'
import { MapModal } from './MapModal'
import { Minimap } from './Minimap'

function BagIcon() {
  return (
    <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
      <path d="M17 14c0-5 3-9 7-9s7 4 7 9" fill="none" stroke="#3a2412" strokeWidth="3" strokeLinecap="round" />
      <path d="M10 17h28l3 24c.2 1.7-1 3-2.7 3H9.7C8 44 6.800 42.700 7 41z" fill="#c98b3c" stroke="#3a2412" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M13 24h22" stroke="#3a2412" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="20" y="22" width="8" height="7" rx="1.500" fill="#f2d27a" stroke="#3a2412" strokeWidth="2" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
      <path d="M6 9h20M6 16h20M6 23h20" stroke="#3a2412" strokeWidth="3.200" strokeLinecap="round" />
    </svg>
  )
}

const CONTROLS: [string, string][] = [
  ['WASD / arrows', 'move'],
  ['Shift', 'walk'],
  ['Left click / J', 'slash (chain 3 hits)'],
  ['Right click / K', 'heavy slam'],
  ['E', 'dash thrust'],
  ['Q / R', 'spin slash'],
  ['Space', 'jump'],
  ['M', 'map'],
  ['B', 'bag'],
]

function MenuPanel() {
  const { menuOpen, setMenu, volume, setVolume } = useHud()
  const quality = useSettings((s) => s.quality)
  const setQuality = useSettings((s) => s.setQuality)
  if (!menuOpen) return null
  return (
    <div className="panel hud-ui panel-menu" role="dialog" aria-label="Menu">
      <div className="panel-head">
        <span>Menu</span>
        <button className="x" onClick={() => setMenu(false)} aria-label="Close">×</button>
      </div>
      <label className="row">
        <span>Volume</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            setVolume(v)
            audio.setVolume(v)
          }}
        />
      </label>
      <div className="row">
        <span>Quality</span>
        <div className="seg">
          {(Object.keys(QUALITY) as Quality[]).map((q) => (
            <button key={q} className={q === quality ? 'on' : ''} onClick={() => setQuality(q)}>
              {q}
            </button>
          ))}
        </div>
      </div>
      <div className="controls">
        {CONTROLS.map(([k, v]) => (
          <div key={k}>
            <b>{k}</b>
            <span>{v}</span>
          </div>
        ))}
      </div>
      <button className="primary" onClick={() => setMenu(false)}>Resume</button>
    </div>
  )
}

function BagPanel() {
  const { bagOpen, setBag } = useHud()
  if (!bagOpen) return null
  return (
    <div className="panel hud-ui panel-bag" role="dialog" aria-label="Bag">
      <div className="panel-head">
        <span>Bag</span>
        <button className="x" onClick={() => setBag(false)} aria-label="Close">×</button>
      </div>
      <div className="slots">
        {Array.from({ length: 20 }, (_, i) => (
          <div key={i} className="slot" />
        ))}
      </div>
      <p className="empty">Nothing here yet. Things you find while exploring will appear here.</p>
    </div>
  )
}

/** Heads-up display: portrait + health (bottom left), bag (bottom right), map (top left), menu (top right). */
export function Hud() {
  const { hp, maxHp, bagOpen, menuOpen, setBag, setMenu } = useHud()

  useEffect(() => {
    audio.setVolume(useHud.getState().volume)
  }, [])

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        const h = useHud.getState()
        if (h.mapOpen) h.setMap(false)
        else if (h.bagOpen) h.setBag(false)
        else h.setMenu(!h.menuOpen)
      }
      else if (e.code === 'KeyB' || e.code === 'KeyI') setBag(!useHud.getState().bagOpen)
      else if (e.code === 'KeyM') useHud.getState().setMap(!useHud.getState().mapOpen)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [setBag, setMenu])

  return (
    <div className="hud">
      <Minimap />

      <button className={`hud-ui hud-btn hud-menu${menuOpen ? ' on' : ''}`} onClick={() => setMenu(!menuOpen)} aria-label="Menu">
        <MenuIcon />
      </button>

      <div className="hud-me">
        <img src={pfp} alt="" className="hud-pfp" draggable={false} />
        <div className="hud-id">
          <div className="hud-name">{PLAYER_NAME}</div>
          <div className="hud-hp" role="progressbar" aria-valuemin={0} aria-valuemax={maxHp} aria-valuenow={hp}>
            <div className="hud-hp-fill" style={{ width: `${(hp / maxHp) * 100}%` }} />
            <span>{hp}/{maxHp}</span>
          </div>
        </div>
      </div>

      <button className={`hud-ui hud-btn hud-bag${bagOpen ? ' on' : ''}`} onClick={() => setBag(!bagOpen)} aria-label="Bag">
        <BagIcon />
      </button>

      <MenuPanel />
      <BagPanel />
      <MapModal />
    </div>
  )
}

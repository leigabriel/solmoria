import { useEffect, useState } from 'react'
import { audio } from '../audio/audio'
import { GAME_TAGLINE, GAME_TITLE, PROLOGUE } from '../story/story'
import { Divider, Icon, Panel } from './rpg'

const skip = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')

/** Title screen and prologue. Any key or click advances; the last page starts the game (and unlocks audio). */
export function Intro() {
  const [page, setPage] = useState(skip ? PROLOGUE.length + 1 : 0)
  const [leaving, setLeaving] = useState(false)

  const advance = () => {
    audio.start()
    if (page > PROLOGUE.length) return
    if (page === PROLOGUE.length) {
      setLeaving(true)
      window.setTimeout(() => setPage(PROLOGUE.length + 1), 700)
      return
    }
    setPage((p) => p + 1)
  }

  useEffect(() => {
    if (page > PROLOGUE.length) return
    const k = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') {
        e.preventDefault()
        advance()
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

  if (page > PROLOGUE.length) return null
  return (
    <div className={`intro${leaving ? ' out' : ''}`} onPointerDown={advance} role="dialog" aria-label={GAME_TITLE}>
      {page === 0 ? (
        <div className="intro-title">
          <div className="intro-kicker">a samurai blob tale</div>
          <h1>{GAME_TITLE}</h1>
          <Divider />
          <p>{GAME_TAGLINE}</p>
          <div className="intro-press">Click or press Enter</div>
        </div>
      ) : (
        <Panel className="intro-page">
          <div className="intro-chap"><Icon name="scroll" size={22} />Prologue · {page} / {PROLOGUE.length}</div>
          <p>{PROLOGUE[page - 1]}</p>
          <div className="intro-next">{page === PROLOGUE.length ? 'Begin the journey ▶' : 'Next ▶'}</div>
        </Panel>
      )}
    </div>
  )
}

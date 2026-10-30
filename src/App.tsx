import { Game } from './game/Game'
import { Joystick } from './input/Joystick'
import { useKeyboard } from './input/useKeyboard'
import { NameTag } from './ui/NameTag'
import { useEffect } from 'react'
import { playerState } from './game/store'

export default function App() {
  useKeyboard()
  useEffect(() => {
    // test hook only: ?debug exposes the player state to the console, nothing is drawn
    if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __player: typeof playerState }).__player = playerState
  }, [])
  return (
    <>
      <Game />
      <Joystick />
      <NameTag />
      <div className="mist" />
    </>
  )
}

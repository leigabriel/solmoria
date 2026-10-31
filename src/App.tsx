import { Game } from './game/Game'
import { Joystick } from './input/Joystick'
import { useKeyboard } from './input/useKeyboard'
import { NameTag } from './ui/NameTag'
import { NpcBubble } from './ui/NpcBubble'
import { Hud } from './ui/Hud'
import { AttackButtons } from './ui/AttackButtons'
import { useEffect } from 'react'
import { playerState } from './game/store'
import { combat } from './combat/state'

export default function App() {
  useKeyboard()
  useEffect(() => {
    // test hook only: ?debug exposes the player state to the console, nothing is drawn
    if (new URLSearchParams(location.search).has('debug')) {
      const w = window as unknown as { __player: typeof playerState; __combat: typeof combat }
      w.__player = playerState
      w.__combat = combat
    }
  }, [])
  return (
    <>
      <Game />
      <Joystick />
      <AttackButtons />
      <NameTag />
      <NpcBubble />
      <Hud />
      <div className="mist" />
    </>
  )
}

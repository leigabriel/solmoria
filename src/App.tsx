import { Game } from './game/Game'
import { Joystick } from './input/Joystick'
import { useKeyboard } from './input/useKeyboard'
import { Hud } from './ui/Hud'

export default function App() {
  useKeyboard()
  return (
    <>
      <Game />
      <Joystick />
      <Hud />
    </>
  )
}

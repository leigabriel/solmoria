import { audio } from '../audio/audio'
import { requestAttack, type AttackKind } from '../combat/state'

const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches

const BTN: { kind: AttackKind; label: string; cls: string }[] = [
  { kind: 'light', label: '斬', cls: 'b-main' },
  { kind: 'heavy', label: '撃', cls: 'b-heavy' },
  { kind: 'thrust', label: '突', cls: 'b-thrust' },
  { kind: 'spin', label: '旋', cls: 'b-spin' },
]

/** Touch-only attack pad (right thumb). Desktop uses mouse / keys, so nothing is drawn there. */
export function AttackButtons() {
  if (!coarse) return null
  return (
    <div className="atk-pad">
      {BTN.map((b) => (
        <button
          key={b.kind}
          className={`atk ${b.cls}`}
          onPointerDown={(e) => {
            e.preventDefault()
            audio.start()
            requestAttack(b.kind)
          }}
        >
          {b.label}
        </button>
      ))}
    </div>
  )
}

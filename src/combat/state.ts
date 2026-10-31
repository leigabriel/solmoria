import { audio } from '../audio/audio'

export type AttackKind = 'light' | 'heavy' | 'thrust' | 'spin'

export interface AttackDef {
  dur: number
  /** normalised time window in which the blade is live */
  hitFrom: number
  hitTo: number
  /** forward lunge speed while striking */
  lunge: number
  /** 0 = rooted, 1 = full movement */
  move: number
  cooldown: number
}

export const ATTACKS: Record<AttackKind, AttackDef[]> = {
  light: [
    { dur: 0.36, hitFrom: 0.28, hitTo: 0.62, lunge: 2.4, move: 0.15, cooldown: 0 },
    { dur: 0.36, hitFrom: 0.28, hitTo: 0.62, lunge: 2.4, move: 0.15, cooldown: 0 },
    { dur: 0.52, hitFrom: 0.3, hitTo: 0.66, lunge: 3.2, move: 0.1, cooldown: 0.12 },
  ],
  heavy: [{ dur: 0.85, hitFrom: 0.5, hitTo: 0.72, lunge: 1.2, move: 0, cooldown: 0.2 }],
  thrust: [{ dur: 0.5, hitFrom: 0.3, hitTo: 0.6, lunge: 8, move: 0, cooldown: 0.1 }],
  spin: [{ dur: 0.62, hitFrom: 0.1, hitTo: 0.85, lunge: 0, move: 0.45, cooldown: 0.25 }],
}

/** Mutable attack state, read by the player rig, the effects and the input layer. */
export const combat = {
  kind: null as AttackKind | null,
  step: 0,
  t: 0,
  def: ATTACKS.light[0] as AttackDef,
  /** time left in which a follow-up light attack continues the combo */
  comboWindow: 0,
  lock: 0,
  queued: null as AttackKind | null,
  /** facing the attack wants (radians); set by the input layer */
  aim: 0,
  hasAim: false,
  /** changes every time a new attack starts (effects use it to restart) */
  serial: 0,
  /** set for one frame when the blade connects */
  impact: 0,
  shake: 0,
  get u() {
    return this.kind ? Math.min(1, this.t / this.def.dur) : 0
  },
  get active() {
    return this.kind !== null
  },
  get live() {
    const u = this.u
    return this.kind !== null && u >= this.def.hitFrom && u <= this.def.hitTo
  },
}

export function requestAttack(kind: AttackKind) {
  if (combat.lock > 0 && !combat.kind) return
  if (combat.kind) {
    // allow buffering the next move in the second half of the current one
    if (combat.u > 0.45) combat.queued = kind
    return
  }
  begin(kind)
}

function begin(kind: AttackKind) {
  let step = 0
  if (kind === 'light' && combat.comboWindow > 0) step = (combat.step + 1) % ATTACKS.light.length
  combat.kind = kind
  combat.step = step
  combat.def = ATTACKS[kind][step]
  combat.t = 0
  combat.serial++
  combat.queued = null
  combat.comboWindow = 0
  audio.swing(kind === 'light' && step === 2 ? 'heavy' : kind, kind === 'light' ? 1 + step * -0.12 : 1)
}

export function tickCombat(dt: number) {
  combat.impact = Math.max(0, combat.impact - dt * 6)
  combat.shake = Math.max(0, combat.shake - dt * 5)
  if (combat.lock > 0) combat.lock -= dt
  if (combat.comboWindow > 0 && !combat.kind) combat.comboWindow -= dt
  if (!combat.kind) {
    if (combat.queued) {
      const q = combat.queued
      combat.queued = null
      begin(q)
    }
    return
  }
  combat.t += dt
  if (combat.t >= combat.def.dur) {
    const k = combat.kind
    combat.lock = combat.def.cooldown
    combat.kind = null
    combat.comboWindow = k === 'light' ? 0.55 : 0
    if (combat.queued) {
      const q = combat.queued
      combat.queued = null
      if (combat.lock <= 0) begin(q)
      else combat.queued = q
    }
  }
}

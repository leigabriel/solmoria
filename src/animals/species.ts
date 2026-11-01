import { VILLAGER_LINES } from '../story/story'
import * as THREE from 'three'
import { PropBatch } from '../world/propBatch'
import { TPL } from '../world/templates'
import { srgb } from '../utils/textures'

type Kind = 'box' | 'sphere' | 'cyl' | 'cone'
type V3 = [number, number, number]

export interface SpeciesDef {
  id: string
  body: THREE.BufferGeometry
  leg: THREE.BufferGeometry | null
  /** hip pivots: x, y, z and gait phase (0 | pi) */
  hips: [number, number, number, number][]
  emissive?: number
  walk: number
  flee: number
  swing: number
  home: number
  swim?: boolean
  voice?: 'moo' | 'neigh' | 'cluck' | 'chirp'
  tints: number[]
  scale: number
  /** villagers: shown with a name and a line of dialogue when the player is close */
  npc?: { title: string; lines: string[] }
}

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const TPLS = { box: TPL.box, sphere: TPL.sphere, cyl: TPL.cyl, cone: TPL.cone }

type PartDef = [Kind, V3, V3, [number, number, number], V3?]
function build(parts: PartDef[]) {
  const b = new PropBatch()
  for (const [k, pos, sc, col, rot] of parts) {
    _e.set(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0)
    _q.setFromEuler(_e)
    _m.compose(_p.set(...pos), _q, _s.set(...sc))
    b.add(TPLS[k], _m, srgb(...col), 0, 0, 0)
  }
  return b.build()!
}

const WHITE: V3 = [0.93, 0.92, 0.88]
const DARK: V3 = [0.16, 0.13, 0.12]
const PINK: V3 = [0.86, 0.6, 0.56]

function cow(): SpeciesDef {
  const body = build([
    ['box', [0, 0.86, 0], [0.62, 0.52, 1.1], WHITE],
    ['box', [0.01, 0.9, 0.12], [0.64, 0.3, 0.4], DARK],
    ['box', [-0.01, 0.82, -0.3], [0.64, 0.26, 0.3], DARK],
    ['box', [0, 0.95, 0.68], [0.3, 0.3, 0.36], WHITE],
    ['box', [0, 0.88, 0.9], [0.22, 0.16, 0.12], PINK],
    ['cone', [-0.15, 1.08, 0.66], [0.04, 0.12, 0.04], [0.9, 0.85, 0.7], [0, 0, 0.5]],
    ['cone', [0.15, 1.08, 0.66], [0.04, 0.12, 0.04], [0.9, 0.85, 0.7], [0, 0, -0.5]],
    ['box', [-0.2, 1.0, 0.6], [0.12, 0.05, 0.1], DARK, [0, 0, 0.3]],
    ['box', [0.2, 1.0, 0.6], [0.12, 0.05, 0.1], DARK, [0, 0, -0.3]],
    ['cone', [0, 1.1, -0.55], [0.04, 0.5, 0.04], DARK, [2.9, 0, 0]],
    ['sphere', [0, 0.55, -0.25], [0.12, 0.09, 0.14], PINK],
  ])
  const leg = build([
    ['cyl', [0, -0.25, 0], [0.07, 0.5, 0.07], WHITE],
    ['cyl', [0, -0.47, 0], [0.075, 0.08, 0.075], DARK],
  ])
  return { id: 'cow', body, leg, hips: [[-0.2, 0.6, 0.38, 0], [0.2, 0.6, 0.38, Math.PI], [-0.2, 0.6, -0.38, Math.PI], [0.2, 0.6, -0.38, 0]], walk: 0.9, flee: 4.2, swing: 0.5, home: 14, voice: 'moo', tints: [0xffffff, 0xf2e6d4, 0xe8d8c4], scale: 1 }
}

function horse(): SpeciesDef {
  const BR: V3 = [0.45, 0.28, 0.15]
  const MANE: V3 = [0.12, 0.08, 0.06]
  const body = build([
    ['box', [0, 1.12, 0], [0.42, 0.52, 1.05], BR],
    ['box', [0, 1.45, 0.58], [0.2, 0.58, 0.24], BR, [-0.55, 0, 0]],
    ['box', [0, 1.78, 0.86], [0.17, 0.2, 0.42], BR, [0.45, 0, 0]],
    ['box', [0, 1.7, 1.02], [0.15, 0.13, 0.12], [0.3, 0.2, 0.14], [0.45, 0, 0]],
    ['box', [0, 1.62, 0.5], [0.05, 0.62, 0.12], MANE, [-0.55, 0, 0]],
    ['cone', [-0.06, 1.95, 0.75], [0.035, 0.12, 0.035], BR],
    ['cone', [0.06, 1.95, 0.75], [0.035, 0.12, 0.035], BR],
    ['cone', [0, 1.2, -0.55], [0.07, 0.7, 0.07], MANE, [2.7, 0, 0]],
  ])
  const leg = build([
    ['cyl', [0, -0.4, 0], [0.055, 0.8, 0.055], BR],
    ['cyl', [0, -0.76, 0], [0.06, 0.1, 0.06], MANE],
  ])
  return { id: 'horse', body, leg, hips: [[-0.14, 0.85, 0.42, 0], [0.14, 0.85, 0.42, Math.PI], [-0.14, 0.85, -0.42, Math.PI], [0.14, 0.85, -0.42, 0]], walk: 1.2, flee: 8, swing: 0.55, home: 20, voice: 'neigh', tints: [0xffffff, 0xd9a878, 0x6a5a50, 0xf0ece0, 0x3a2f2a], scale: 1 }
}

function sheep(): SpeciesDef {
  const WOOL: V3 = [0.93, 0.9, 0.82]
  const body = build([
    ['sphere', [0, 0.55, 0], [0.32, 0.3, 0.42], WOOL],
    ['sphere', [0.14, 0.7, 0.1], [0.2, 0.18, 0.2], WOOL],
    ['sphere', [-0.14, 0.68, -0.15], [0.2, 0.18, 0.2], WOOL],
    ['box', [0, 0.62, 0.46], [0.14, 0.16, 0.2], DARK],
    ['box', [-0.09, 0.64, 0.42], [0.04, 0.05, 0.1], DARK, [0, 0, 0.6]],
    ['box', [0.09, 0.64, 0.42], [0.04, 0.05, 0.1], DARK, [0, 0, -0.6]],
    ['sphere', [0, 0.55, -0.42], [0.08, 0.08, 0.08], WOOL],
  ])
  const leg = build([['cyl', [0, -0.15, 0], [0.04, 0.3, 0.04], DARK]])
  return { id: 'sheep', body, leg, hips: [[-0.14, 0.32, 0.22, 0], [0.14, 0.32, 0.22, Math.PI], [-0.14, 0.32, -0.22, Math.PI], [0.14, 0.32, -0.22, 0]], walk: 0.7, flee: 4.4, swing: 0.55, home: 10, tints: [0xffffff, 0xf0e8d8, 0xd9d0c0], scale: 1 }
}

function chicken(): SpeciesDef {
  const FW: V3 = [0.95, 0.93, 0.88]
  const RED: V3 = [0.8, 0.12, 0.1]
  const ORG: V3 = [0.95, 0.65, 0.15]
  const body = build([
    ['sphere', [0, 0.3, 0], [0.13, 0.13, 0.19], FW],
    ['sphere', [0, 0.45, 0.14], [0.065, 0.075, 0.065], FW],
    ['cone', [0, 0.45, 0.22], [0.025, 0.06, 0.025], ORG, [Math.PI / 2, 0, 0]],
    ['box', [0, 0.53, 0.14], [0.02, 0.05, 0.07], RED],
    ['sphere', [0, 0.39, 0.2], [0.025, 0.035, 0.02], RED],
    ['cone', [0, 0.38, -0.2], [0.07, 0.2, 0.03], [0.3, 0.2, 0.12], [-2.4, 0, 0]],
  ])
  const leg = build([['cyl', [0, -0.1, 0], [0.012, 0.2, 0.012], ORG]])
  return { id: 'chicken', body, leg, hips: [[-0.05, 0.2, 0, 0], [0.05, 0.2, 0, Math.PI]], walk: 0.6, flee: 3.6, swing: 0.9, home: 5, voice: 'cluck', tints: [0xffffff, 0xd9b48a, 0xb08050, 0x8a6a4a, 0xf4f0e4], scale: 1 }
}

function deer(): SpeciesDef {
  const FUR: V3 = [0.62, 0.9, 0.86]
  const GLOW: V3 = [1, 0.9, 0.55]
  const body = build([
    ['box', [0, 0.95, 0], [0.26, 0.34, 0.78], FUR],
    ['box', [0, 1.25, 0.44], [0.12, 0.42, 0.14], FUR, [-0.5, 0, 0]],
    ['box', [0, 1.5, 0.62], [0.13, 0.16, 0.3], FUR, [0.4, 0, 0]],
    ['box', [0, 1.48, 0.78], [0.07, 0.08, 0.08], DARK],
    ['box', [-0.08, 1.7, 0.56], [0.025, 0.4, 0.025], GLOW, [0, 0, 0.3]],
    ['box', [0.08, 1.7, 0.56], [0.025, 0.4, 0.025], GLOW, [0, 0, -0.3]],
    ['box', [-0.17, 1.84, 0.54], [0.02, 0.2, 0.02], GLOW, [0, 0, 0.9]],
    ['box', [0.17, 1.84, 0.54], [0.02, 0.2, 0.02], GLOW, [0, 0, -0.9]],
    ['box', [-0.2, 2.02, 0.52], [0.018, 0.16, 0.018], GLOW, [0.3, 0, 0.2]],
    ['box', [0.2, 2.02, 0.52], [0.018, 0.16, 0.018], GLOW, [0.3, 0, -0.2]],
    ['sphere', [0, 1.0, -0.42], [0.07, 0.07, 0.08], GLOW],
  ])
  const leg = build([['cyl', [0, -0.34, 0], [0.034, 0.68, 0.034], FUR]])
  return { id: 'deer', body, leg, hips: [[-0.09, 0.76, 0.3, 0], [0.09, 0.76, 0.3, Math.PI], [-0.09, 0.76, -0.3, Math.PI], [0.09, 0.76, -0.3, 0]], emissive: 0x2a6a66, walk: 1, flee: 8.5, swing: 0.5, home: 22, tints: [0xffffff, 0xd8f4ff, 0xfff0d0], scale: 1 }
}

function duck(): SpeciesDef {
  const body = build([
    ['sphere', [0, 0.08, 0], [0.14, 0.1, 0.2], [0.55, 0.42, 0.28]],
    ['sphere', [0, 0.2, 0.14], [0.065, 0.07, 0.065], [0.1, 0.45, 0.25]],
    ['box', [0, 0.18, 0.22], [0.06, 0.025, 0.08], [0.95, 0.7, 0.15]],
    ['cone', [0, 0.1, -0.2], [0.05, 0.1, 0.03], [0.4, 0.3, 0.2], [-1.9, 0, 0]],
  ])
  return { id: 'duck', body, leg: null, hips: [], walk: 0.5, flee: 2.6, swing: 0, home: 8, swim: true, voice: 'chirp', tints: [0xffffff, 0xd8c0a0, 0xf4f4ee], scale: 1 }
}

/** Plump villagers in the same chubby style as the hero, each with a trade-defining hat. */
function blobNpc(id: string, body: [number, number, number], hat: (add: (p: PartDef) => void) => void, npc: SpeciesDef['npc'], scale = 1.3): SpeciesDef {
  const parts: PartDef[] = [
    ['sphere', [0, 0.52, 0], [0.24, 0.32, 0.22], body],
    ['sphere', [-0.075, 0.68, 0.19], [0.014, 0.02, 0.01], DARK],
    ['sphere', [0.075, 0.68, 0.19], [0.014, 0.02, 0.01], DARK],
    ['sphere', [0, 0.63, 0.205], [0.012, 0.008, 0.006], DARK],
    ['cyl', [-0.24, 0.5, 0.02], [0.05, 0.2, 0.05], body, [0, 0, 0.35]],
    ['cyl', [0.24, 0.5, 0.02], [0.05, 0.2, 0.05], body, [0, 0, -0.35]],
  ]
  hat((p) => parts.push(p))
  const leg = build([['cyl', [0, -0.09, 0], [0.065, 0.18, 0.065], body], ['sphere', [0, -0.18, 0.03], [0.075, 0.04, 0.1], [0.25, 0.18, 0.12]]])
  return { id, body: build(parts), leg, hips: [[-0.1, 0.22, 0, 0], [0.1, 0.22, 0, Math.PI]], walk: 0.8, flee: 1.6, swing: 0.55, home: 9, tints: [0xffffff], scale, npc }
}

function villagers() {
  return {
    farmer: blobNpc('farmer', [0.96, 0.92, 0.8], (a) => {
      a(['cone', [0, 0.86, 0], [0.34, 0.12, 0.34], [0.93, 0.78, 0.3]])
      a(['box', [0, 0.28, 0.2], [0.3, 0.3, 0.05], [0.4, 0.55, 0.28]])
    }, { title: 'Farmer', lines: VILLAGER_LINES.farmer }),
    elder: blobNpc('elder', [0.9, 0.9, 0.95], (a) => {
      a(['cone', [0, 0.82, 0], [0.22, 0.55, 0.22], [0.3, 0.32, 0.7]])
      a(['sphere', [0, 0.95, 0], [0.04, 0.04, 0.04], [1, 0.9, 0.4]])
      a(['cone', [0, 0.52, 0.2], [0.1, 0.3, 0.06], [0.97, 0.97, 0.97], [Math.PI, 0, 0]])
    }, { title: 'Elder', lines: VILLAGER_LINES.elder }),
    merchant: blobNpc('merchant', [0.86, 0.72, 0.52], (a) => {
      a(['sphere', [0, 0.88, 0], [0.22, 0.14, 0.22], [0.8, 0.18, 0.2]])
      a(['sphere', [0.18, 0.3, 0.12], [0.08, 0.09, 0.08], [0.45, 0.3, 0.15]])
    }, { title: 'Merchant', lines: VILLAGER_LINES.merchant }),
    child: blobNpc('child', [0.97, 0.9, 0.88], (a) => {
      a(['sphere', [0.08, 0.9, 0.05], [0.07, 0.05, 0.05], [1, 0.45, 0.6]])
      a(['sphere', [-0.08, 0.9, 0.05], [0.07, 0.05, 0.05], [1, 0.45, 0.6]])
    }, { title: 'Child', lines: VILLAGER_LINES.child }, 0.95),
    guard: blobNpc('guard', [0.72, 0.76, 0.84], (a) => {
      a(['sphere', [0, 0.85, 0], [0.25, 0.17, 0.25], [0.55, 0.57, 0.62]])
      a(['cone', [0, 1.0, -0.05], [0.04, 0.2, 0.04], [0.8, 0.15, 0.15]])
      a(['cyl', [0.32, 0.8, 0.1], [0.018, 1.7, 0.018], [0.4, 0.28, 0.16]])
      a(['cone', [0.32, 1.64, 0.1], [0.04, 0.14, 0.04], [0.85, 0.87, 0.9]])
    }, { title: 'Guard', lines: VILLAGER_LINES.guard }),
  }
}

function rabbit(): SpeciesDef {
  const FUR: V3 = [0.72, 0.62, 0.5]
  const body = build([
    ['sphere', [0, 0.17, 0], [0.1, 0.1, 0.15], FUR],
    ['sphere', [0, 0.25, 0.14], [0.065, 0.065, 0.07], FUR],
    ['cyl', [-0.03, 0.4, 0.13], [0.018, 0.15, 0.012], FUR, [-0.2, 0, 0.1]],
    ['cyl', [0.03, 0.4, 0.13], [0.018, 0.15, 0.012], FUR, [-0.2, 0, -0.1]],
    ['sphere', [0, 0.18, -0.15], [0.04, 0.04, 0.04], [0.97, 0.95, 0.9]],
  ])
  const leg = build([['cyl', [0, -0.05, 0], [0.025, 0.1, 0.025], FUR]])
  return { id: 'rabbit', body, leg, hips: [[-0.05, 0.1, 0.07, 0], [0.05, 0.1, 0.07, 0], [-0.05, 0.1, -0.08, Math.PI], [0.05, 0.1, -0.08, Math.PI]], walk: 0.9, flee: 4.2, swing: 0.8, home: 8, tints: [0xffffff, 0xd9c8b0, 0xb8a58a, 0xf0ece4], scale: 1 }
}

export function makeSpecies() {
  return { rabbit: rabbit(), cow: cow(), horse: horse(), sheep: sheep(), chicken: chicken(), deer: deer(), duck: duck(), ...villagers() }
}

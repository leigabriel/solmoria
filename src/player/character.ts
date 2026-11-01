import * as THREE from 'three'
import { srgb } from '../utils/textures'

export interface CharacterRig {
  root: THREE.Group
  body: THREE.Group
  torso: THREE.Group
  hips: THREE.Group
  head: THREE.Group
  thighL: THREE.Group
  thighR: THREE.Group
  shinL: THREE.Group
  shinR: THREE.Group
  armL: THREE.Group
  armR: THREE.Group
  foreL: THREE.Group
  foreR: THREE.Group
  cape: THREE.Mesh
  capeBase: Float32Array
  capeHeight: number
  phase: number
  katana: THREE.Group
  tip: THREE.Object3D
  guard: THREE.Object3D
}

const CAPE_W = 0.2
const CAPE_H = 0.2
const CAPE_SEG_X = 3
const CAPE_SEG_Y = 4
export const HIP_Y = 0.28

/**
 * The samurai blob: a plump white body, straw kasa hat with grey ears, dark eye patch and whiskers,
 * olive sash, katana in hand and a scabbard on the back (see the character sheet). Faces +Z, ~1.05 tall.
 * Built from primitives so no asset is required; a GLB can replace it later.
 */
export function createCharacter(): CharacterRig {
  const white = new THREE.MeshLambertMaterial({ color: srgb(0.97, 0.955, 0.92) })
  const ink = new THREE.MeshBasicMaterial({ color: srgb(0.1, 0.07, 0.07), side: THREE.BackSide })
  const dark = new THREE.MeshLambertMaterial({ color: srgb(0.14, 0.11, 0.12) })
  const patch = new THREE.MeshLambertMaterial({ color: srgb(0.36, 0.35, 0.37) })
  const hat = new THREE.MeshLambertMaterial({ color: srgb(0.93, 0.62, 0.16), side: THREE.DoubleSide })
  const hatDark = new THREE.MeshLambertMaterial({ color: srgb(0.78, 0.46, 0.1) })
  const grey = new THREE.MeshLambertMaterial({ color: srgb(0.46, 0.45, 0.47) })
  const olive = new THREE.MeshLambertMaterial({ color: srgb(0.5, 0.5, 0.26), side: THREE.DoubleSide })
  const gold = new THREE.MeshLambertMaterial({ color: srgb(0.78, 0.6, 0.2) })
  const capeMat = olive

  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)

  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, cast = true) => {
    const o = new THREE.Mesh(g, m)
    o.position.set(x, y, z)
    o.castShadow = cast
    return o
  }
  /** cartoon outline: inverted hull a touch larger than the shape */
  const outlined = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, w = 0.012) => {
    const grp = new THREE.Group()
    grp.position.set(x, y, z)
    const a = mesh(g, m)
    a.scale.set(sx, sy, sz)
    const o = new THREE.Mesh(g, ink)
    o.scale.set(sx + w, sy + w, sz + w)
    grp.add(a, o)
    return grp
  }

  // ---- hips (pelvis pivot) + stubby legs ------------------------------------------------------
  const hips = new THREE.Group()
  hips.position.y = HIP_Y
  body.add(hips)

  const leg = (side: number) => {
    const thigh = new THREE.Group()
    thigh.position.set(0.1 * side, -0.02, 0)
    thigh.add(outlined(new THREE.CylinderGeometry(1, 0.85, 1, 8), white, 0, -0.06, 0, 0.075, 0.13, 0.075, 0.01))
    const shin = new THREE.Group()
    shin.position.y = -0.12
    shin.add(outlined(new THREE.CylinderGeometry(0.8, 0.7, 1, 8), white, 0, -0.05, 0, 0.065, 0.1, 0.065, 0.01))
    shin.add(outlined(new THREE.SphereGeometry(1, 8, 6), white, 0, -0.14, 0.03, 0.075, 0.045, 0.1, 0.01))
    thigh.add(shin)
    hips.add(thigh)
    return { thigh, shin }
  }
  const L = leg(-1)
  const R = leg(1)

  // ---- torso: the big plump body -------------------------------------------------------------
  const torso = new THREE.Group()
  torso.position.y = 0.0
  hips.add(torso)
  torso.add(outlined(new THREE.SphereGeometry(1, 20, 16), white, 0, 0.3, 0, 0.27, 0.36, 0.25, 0.018))

  // olive sash / loincloth sagging at the front
  const sash = mesh(new THREE.CylinderGeometry(0.262, 0.25, 0.1, 18, 1, true, -1.35, 2.7), olive, 0, 0.11, 0)
  torso.add(sash)
  const sashBelt = mesh(new THREE.TorusGeometry(0.255, 0.012, 5, 22, Math.PI * 1.5), dark, 0, 0.165, 0, false)
  sashBelt.rotation.set(Math.PI / 2, 0, Math.PI * 0.75 + Math.PI)
  torso.add(sashBelt)
  const sag = mesh(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), olive, 0, 0.07, 0.15)
  sag.scale.set(0.2, 0.09, 0.12)
  torso.add(sag)

  // scabbard on the back with the hilt peeking over the shoulder
  const sheath = new THREE.Group()
  sheath.position.set(-0.13, 0.3, -0.24)
  sheath.rotation.set(0.15, 0, 0.55)
  sheath.add(mesh(new THREE.CylinderGeometry(0.026, 0.022, 0.62, 7), dark, 0, 0, 0))
  sheath.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 7), gold, 0, 0.3, 0))
  sheath.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.13, 7), grey, 0, 0.38, 0))
  const sBand = mesh(new THREE.TorusGeometry(0.03, 0.007, 5, 10), gold, 0, -0.12, 0, false)
  sBand.rotation.x = Math.PI / 2
  sheath.add(sBand)
  torso.add(sheath)

  // ---- head: hat, ears, face --------------------------------------------------------------------
  const head = new THREE.Group()
  head.position.set(0, 0.5, 0)
  torso.add(head)
  // grey ears poking out through the hat
  for (const sx of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(0.05, 0.11, 6), grey, 0.125 * sx, 0.23, -0.02)
    ear.rotation.z = -0.35 * sx
    head.add(ear)
  }
  // kasa: wide shallow cone with a darker rim and a little top knob
  const kasa = outlined(new THREE.ConeGeometry(1, 0.42, 18, 1, true), hat, 0, 0.17, 0, 0.36, 0.34, 0.36, 0.014)
  head.add(kasa)
  const rimDisc = mesh(new THREE.TorusGeometry(0.355, 0.012, 5, 28), hatDark, 0, 0.115, 0, false)
  rimDisc.rotation.x = Math.PI / 2
  head.add(rimDisc)
  head.add(mesh(new THREE.SphereGeometry(0.03, 6, 5), hatDark, 0, 0.3, 0, false))
  // face
  for (const sx of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(1, 6, 5), dark, 0.07 * sx, 0.02, 0.2, false)
    eye.scale.set(0.014, 0.02, 0.008)
    head.add(eye)
    for (let i = 0; i < 3; i++) {
      const w = mesh(new THREE.BoxGeometry(0.075, 0.004, 0.004), dark, 0.16 * sx, 0.0 - i * 0.018, 0.17, false)
      w.rotation.set(0, -0.6 * sx, (i - 1) * 0.16 * sx)
      head.add(w)
    }
  }
  const eyePatch = mesh(new THREE.SphereGeometry(1, 10, 8), patch, 0.09, 0.025, 0.178, false)
  eyePatch.scale.set(0.06, 0.055, 0.03)
  head.add(eyePatch)
  const nose = mesh(new THREE.SphereGeometry(1, 5, 4), dark, 0, 0.0, 0.208, false)
  nose.scale.set(0.012, 0.008, 0.006)
  head.add(nose)

  // ---- arms (short nubs) -------------------------------------------------------------------------
  const arm = (side: number) => {
    const upper = new THREE.Group()
    upper.position.set(0.245 * side, 0.4, 0)
    upper.add(outlined(new THREE.CylinderGeometry(0.9, 0.75, 1, 8), white, 0, -0.06, 0, 0.055, 0.13, 0.055, 0.01))
    const fore = new THREE.Group()
    fore.position.y = -0.12
    fore.add(outlined(new THREE.CylinderGeometry(0.75, 0.65, 1, 8), white, 0, -0.05, 0, 0.05, 0.1, 0.05, 0.01))
    fore.add(outlined(new THREE.SphereGeometry(1, 8, 6), white, 0, -0.12, 0, 0.055, 0.055, 0.055, 0.01))
    upper.add(fore)
    torso.add(upper)
    return { upper, fore }
  }
  const aL = arm(-1)
  const aR = arm(1)

  // ---- small sash tail (vertex-animated every frame) ----------------------------------------------
  const capeGeo = new THREE.PlaneGeometry(CAPE_W, CAPE_H, CAPE_SEG_X, CAPE_SEG_Y)
  capeGeo.translate(0, -CAPE_H / 2, 0)
  const capeBase = new Float32Array(capeGeo.attributes.position.array as Float32Array)
  const cape = mesh(capeGeo, capeMat, 0, 0.17, -0.25)
  cape.frustumCulled = false
  torso.add(cape)

  // ---- katana (blade +Y in its own space; rotated so it points forward from the fist) -------------
  const katana = new THREE.Group()
  const steel = new THREE.MeshLambertMaterial({ color: srgb(0.82, 0.86, 0.9), emissive: srgb(0.35, 0.33, 0.2), emissiveIntensity: 0.55 })
  const edge = new THREE.MeshBasicMaterial({ color: srgb(1, 0.96, 0.78) })
  const wrap = new THREE.MeshLambertMaterial({ color: srgb(0.12, 0.08, 0.1) })
  const kGold = new THREE.MeshLambertMaterial({ color: srgb(0.78, 0.6, 0.2), emissive: srgb(0.4, 0.28, 0.05), emissiveIntensity: 0.5 })
  const bladeGeo = new THREE.BoxGeometry(0.02, 0.56, 0.05)
  bladeGeo.translate(0, 0.28 + 0.06, 0)
  const blade = new THREE.Mesh(bladeGeo, steel)
  const tipGeo = new THREE.ConeGeometry(0.03, 0.07, 4).rotateY(Math.PI / 4).scale(0.5, 1, 1)
  const tipMesh = new THREE.Mesh(tipGeo, steel)
  tipMesh.position.y = 0.34 + 0.28 + 0.03
  const edgeLine = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.56, 0.006).translate(0, 0.34, 0.016), edge)
  const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.009, 10), kGold)
  tsuba.position.y = 0.06
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.15, 7), wrap)
  grip.position.y = -0.02
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), kGold)
  pommel.position.y = -0.1
  katana.add(blade, tipMesh, edgeLine, tsuba, grip, pommel)
  katana.traverse((o) => { o.castShadow = true })
  const tip = new THREE.Object3D()
  tip.position.y = 0.66
  const guard = new THREE.Object3D()
  guard.position.y = 0.1
  katana.add(tip, guard)
  katana.scale.setScalar(1.15)
  katana.position.set(0, -0.12, 0.01)
  katana.rotation.x = Math.PI / 2 + 0.25
  torso.add(katana)

  return {
    root,
    body,
    torso,
    hips,
    head,
    thighL: L.thigh,
    thighR: R.thigh,
    shinL: L.shin,
    shinR: R.shin,
    armL: aL.upper,
    armR: aR.upper,
    foreL: aL.fore,
    foreR: aR.fore,
    cape,
    capeBase,
    capeHeight: CAPE_H,
    phase: 0,
    katana,
    tip,
    guard,
  }
}

const clamp = THREE.MathUtils.clamp

/** Idle / walk / run blended by speed, with cape physics-ish flutter. */
const sm = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
const lerp = THREE.MathUtils.lerp

/**
 * Sword poses are authored as where the fist is, where the blade points, and how the torso
 * twists / leans (all in torso space, +Z forward). The arm is then solved to reach the fist.
 */
interface Pose {
  h: [number, number, number]
  d: [number, number, number]
  tw: number
  lean: number
}
const READY: Pose = { h: [0.3, 0.3, 0.14], d: [0.12, 0.4, 1], tw: 0, lean: 0 }
const MOVES: Record<string, { w: Pose; s: Pose }> = {
  light0: { w: { h: [0.34, 0.62, -0.02], d: [0.35, 1, -0.35], tw: 0.55, lean: -0.12 }, s: { h: [-0.12, 0.2, 0.3], d: [-0.85, -0.25, 0.75], tw: -0.7, lean: 0.18 } },
  light1: { w: { h: [-0.14, 0.18, 0.26], d: [-0.9, -0.2, 0.5], tw: -0.6, lean: 0.1 }, s: { h: [0.36, 0.55, 0.12], d: [0.85, 0.5, 0.45], tw: 0.7, lean: 0 } },
  light2: { w: { h: [0.3, 0.14, 0.2], d: [0.2, -0.55, 0.9], tw: 0.4, lean: 0.3 }, s: { h: [0.05, 0.74, 0.2], d: [-0.1, 1, 0.45], tw: -0.45, lean: -0.22 } },
  heavy: { w: { h: [0.2, 0.85, -0.1], d: [0.1, 1, -0.25], tw: 0.15, lean: -0.5 }, s: { h: [0.12, 0.25, 0.34], d: [0, -0.5, 1], tw: -0.1, lean: 0.65 } },
  thrust: { w: { h: [0.3, 0.32, -0.05], d: [0.15, 0.1, 1], tw: 0.8, lean: 0.1 }, s: { h: [0.08, 0.36, 0.34], d: [-0.02, 0.05, 1], tw: -0.5, lean: 0.3 } },
  spin: { w: { h: [0.34, 0.36, 0.1], d: [1, 0.1, 0.15], tw: 0, lean: 0.05 }, s: { h: [0.34, 0.36, 0.1], d: [1, 0.1, 0.15], tw: 0, lean: 0.05 } },
}

const _qa = new THREE.Quaternion()
const _qb = new THREE.Quaternion()
const _qc = new THREE.Quaternion()
const _va = new THREE.Vector3()
const _vb = new THREE.Vector3()
const _vc = new THREE.Vector3()
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const DOWN = new THREE.Vector3(0, -1, 0)
const SHOULDER = new THREE.Vector3(0.245, 0.4, 0)
const REACH = 0.235

function dirQuat(d: [number, number, number], out: THREE.Quaternion) {
  _vc.set(d[0], d[1], d[2]).normalize()
  return out.setFromUnitVectors(Y_AXIS, _vc)
}

/** Blend two poses into `hand` (fist), `q` (blade orientation) and the torso values. */
function mixPose(a: Pose, b: Pose, t: number, hand: THREE.Vector3, q: THREE.Quaternion) {
  hand.set(lerp(a.h[0], b.h[0], t), lerp(a.h[1], b.h[1], t), lerp(a.h[2], b.h[2], t))
  q.copy(dirQuat(a.d, _qa)).slerp(dirQuat(b.d, _qb), t)
  return { tw: lerp(a.tw, b.tw, t), lean: lerp(a.lean, b.lean, t) }
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
const easeInOut = (t: number) => t * t * (3 - 2 * t)

export interface AttackPose {
  kind: 'light' | 'heavy' | 'thrust' | 'spin'
  step: number
  u: number
  hitFrom: number
  hitTo: number
}

function swordPose(rig: CharacterRig, a: AttackPose | null, move: number, phase: number) {
  const hand = _va
  const q = _qc
  let tw = 0
  let lean = 0
  let weight = 0
  let spin = 0
  if (!a) {
    // carried ready: blade forward, swaying with the stride
    const sway = Math.sin(phase * 2) * 0.03 * move
    mixPose(READY, READY, 0, hand, q)
    hand.y += sway
    hand.z += Math.cos(phase) * 0.03 * move
    q.multiply(_qa.setFromAxisAngle(new THREE.Vector3(1, 0, 0), sway * 2))
  } else {
    const key = a.kind === 'light' ? `light${a.step}` : a.kind
    const m = MOVES[key]
    let st: { tw: number; lean: number }
    if (a.u < a.hitFrom) {
      // anticipation: ease in, with a little overshoot past the windup pose
      const t = a.u / a.hitFrom
      st = mixPose(READY, m.w, easeInOut(t) * (1 + Math.sin(t * Math.PI) * 0.06), hand, q)
    } else if (a.u < a.hitTo) {
      st = mixPose(m.w, m.s, easeOutCubic((a.u - a.hitFrom) / (a.hitTo - a.hitFrom)), hand, q)
    } else {
      // brief follow-through hold, then back to ready
      const t = clamp((a.u - a.hitTo) / (1 - a.hitTo), 0, 1)
      st = mixPose(m.s, READY, easeInOut(clamp((t - 0.25) / 0.75, 0, 1)), hand, q)
    }
    tw = st.tw
    lean = st.lean
    weight = sm(0, 0.12, a.u) * (1 - sm(0.82, 1, a.u) * 0.9)
    if (a.kind === 'spin') spin = sm(a.hitFrom, a.hitTo + 0.08, a.u) * Math.PI * 2
  }
  // solve the arm so the fist is where the pose wants it (reach-limited), blade follows exactly
  _vb.copy(hand).sub(SHOULDER)
  const len = _vb.length()
  if (len > REACH) _vb.multiplyScalar(REACH / len)
  hand.copy(SHOULDER).add(_vb)
  rig.armR.quaternion.setFromUnitVectors(DOWN, _vb.normalize())
  rig.foreR.rotation.set(0, 0, 0)
  rig.katana.position.copy(hand)
  rig.katana.quaternion.copy(q)

  rig.torso.rotation.y = lerp(rig.torso.rotation.y, tw, weight)
  rig.torso.rotation.x = lerp(rig.torso.rotation.x, lean, weight)
  rig.body.rotation.y = spin
  if (a && weight > 0) {
    // lunge stance: legs split, hips dip
    const stance = weight * (a.kind === 'spin' ? 0.2 : 0.55)
    rig.thighR.rotation.x = lerp(rig.thighR.rotation.x, -stance, 0.8)
    rig.thighL.rotation.x = lerp(rig.thighL.rotation.x, stance * 0.8, 0.8)
    rig.hips.position.y -= 0.03 * weight * (a.kind === 'heavy' || a.kind === 'thrust' ? 1.5 : 1)
    rig.armL.rotation.x = lerp(rig.armL.rotation.x, -0.5 - lean * 0.4, weight)
    rig.armL.rotation.z = lerp(rig.armL.rotation.z, 0.5 + Math.abs(tw) * 0.4, weight)
  }
}

export function animateCharacter(rig: CharacterRig, speed: number, dt: number, time: number, atk?: AttackPose | null, air = 0, swim = 0) {
  const move = clamp(speed / 3.4, 0, 1)
  const run = clamp((speed - 2.2) / 3.4, 0, 1)
  const idle = 1 - move
  rig.phase += dt * (3.0 + speed * 1.85) * (move > 0.02 ? 1 : 0)
  const p = rig.phase
  const s = Math.sin(p)
  const k = 1 - Math.exp(-12 * dt)

  // legs: thigh swing + knee bend on the recovery stroke
  const amp = (0.55 + run * 0.5) * move
  rig.thighL.rotation.x = s * amp
  rig.thighR.rotation.x = -s * amp
  rig.shinL.rotation.x = Math.max(0, -Math.sin(p + 0.9)) * (0.9 + run * 0.6) * move
  rig.shinR.rotation.x = Math.max(0, Math.sin(p + 0.9)) * (0.9 + run * 0.6) * move

  // arms counter-swing, forearms bent forward (more when running)
  const armAmp = (0.5 + run * 0.45) * move
  rig.armL.rotation.x = -s * armAmp
  rig.armR.rotation.x = s * armAmp
  rig.armL.rotation.z = 0.07 + idle * 0.03
  rig.armR.rotation.z = -0.07 - idle * 0.03
  const bend = 0.18 + run * 0.7 + move * 0.2
  rig.foreL.rotation.x = -(bend + Math.max(0, s) * 0.3 * move)
  rig.foreR.rotation.x = -(bend + Math.max(0, -s) * 0.3 * move)

  // torso twists against the hips, leans into the run, bobs on each step
  rig.torso.rotation.y = s * 0.14 * move
  rig.hips.rotation.y = -s * 0.1 * move
  rig.torso.rotation.x = THREE.MathUtils.lerp(rig.torso.rotation.x, 0.03 + run * 0.2, k)
  rig.hips.position.y = HIP_Y + Math.abs(Math.cos(p)) * 0.035 * move - run * 0.025 + Math.sin(time * 1.9) * 0.006 * idle
  rig.torso.scale.y = 1 + Math.sin(time * 1.9) * 0.012 * idle

  // head keeps level, glances around when idle
  rig.head.rotation.y = -rig.torso.rotation.y * 0.8 + Math.sin(time * 0.7) * 0.22 * idle
  rig.head.rotation.x = -rig.torso.rotation.x * 0.7 + Math.sin(time * 1.3) * 0.03 * idle

  // cape: trails behind with speed, ripples along its length
  const trail = clamp(speed / 5.6, 0, 1)
  // airborne: legs tuck, free arm lifts
  if (air > 0.01) {
    rig.thighL.rotation.x = lerp(rig.thighL.rotation.x, -0.75, air)
    rig.thighR.rotation.x = lerp(rig.thighR.rotation.x, -0.35, air)
    rig.shinL.rotation.x = lerp(rig.shinL.rotation.x, 1.1, air)
    rig.shinR.rotation.x = lerp(rig.shinR.rotation.x, 0.8, air)
    rig.armL.rotation.z = lerp(rig.armL.rotation.z, 1.0, air)
    rig.armL.rotation.x = lerp(rig.armL.rotation.x, -0.3, air)
  }
  // swimming: body pitches forward, arms windmill (front crawl), legs flutter, head lifts out of the water
  const sk = swim > 0.01 ? 1 : 0
  const pitch = THREE.MathUtils.lerp(rig.body.rotation.x, swim * (0.75 + 0.1 * Math.min(1, speed / 2)), k)
  rig.body.rotation.x = Math.abs(pitch) < 1e-4 ? 0 : pitch
  rig.body.position.y = swim * 0.12
  if (sk) {
    const sp = time * (3.4 + Math.min(speed, 2.5) * 1.4)
    const stroke = 0.45 + Math.min(1, speed / 1.6) * 0.55
    rig.armL.rotation.x = lerp(rig.armL.rotation.x, -(1.2 + Math.sin(sp) * 1.4 * stroke) - 0.9, swim)
    rig.armR.rotation.x = lerp(rig.armR.rotation.x, -(1.2 + Math.sin(sp + Math.PI) * 1.4 * stroke) - 0.9, swim)
    rig.armL.rotation.z = lerp(rig.armL.rotation.z, 0.25 + Math.max(0, Math.cos(sp)) * 0.35, swim)
    rig.armR.rotation.z = lerp(rig.armR.rotation.z, -0.25 - Math.max(0, -Math.cos(sp)) * 0.35, swim)
    rig.foreL.rotation.x = lerp(rig.foreL.rotation.x, -0.25 - Math.max(0, Math.sin(sp)) * 0.6, swim)
    rig.foreR.rotation.x = lerp(rig.foreR.rotation.x, -0.25 - Math.max(0, -Math.sin(sp)) * 0.6, swim)
    rig.thighL.rotation.x = lerp(rig.thighL.rotation.x, Math.sin(sp * 2) * 0.4, swim)
    rig.thighR.rotation.x = lerp(rig.thighR.rotation.x, -Math.sin(sp * 2) * 0.4, swim)
    rig.shinL.rotation.x = lerp(rig.shinL.rotation.x, 0.25 + Math.max(0, -Math.sin(sp * 2)) * 0.5, swim)
    rig.shinR.rotation.x = lerp(rig.shinR.rotation.x, 0.25 + Math.max(0, Math.sin(sp * 2)) * 0.5, swim)
    rig.torso.rotation.y = lerp(rig.torso.rotation.y, Math.sin(sp) * 0.22, swim)
    // keep the head up and looking forward against the body pitch
    rig.head.rotation.x = lerp(rig.head.rotation.x, -rig.body.rotation.x * 0.8 + Math.sin(sp * 2) * 0.03, swim)
    rig.hips.position.y = lerp(rig.hips.position.y, HIP_Y + Math.sin(sp * 2) * 0.012, swim)
  }
  swordPose(rig, atk ?? null, move, p)

  const pos = rig.cape.geometry.attributes.position as THREE.BufferAttribute
  const base = rig.capeBase
  const H = rig.capeHeight
  for (let i = 0; i < pos.count; i++) {
    const bx = base[i * 3]
    const by = base[i * 3 + 1]
    const r = clamp(-by / H, 0, 1)
    const r2 = r * r
    const wave = Math.sin(time * 3.1 + r * 3.0 + bx * 4.0 + p * 0.5)
    const x = bx * (1 + r * 0.45) + Math.sin(p * 0.5 + r * 2.0) * 0.05 * r * move + Math.sin(time * 1.3 + r) * 0.012 * r
    const y = by + r2 * trail * 0.14
    const z = -r2 * (0.05 + trail * 0.34) - (wave * 0.03 * r) * (0.35 + trail) + Math.sin(time * 1.1 + r * 2.0) * 0.012 * r * idle
    pos.setXYZ(i, x, y, z)
  }
  pos.needsUpdate = true
  rig.cape.geometry.computeVertexNormals()
}

export function disposeCharacter(rig: CharacterRig) {
  rig.root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose()
      const m = o.material as THREE.Material | THREE.Material[]
      if (Array.isArray(m)) m.forEach((x) => x.dispose())
      else m.dispose()
    }
  })
}

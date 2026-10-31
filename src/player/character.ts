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
  aR.fore.add(katana)

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
export interface AttackPose {
  kind: 'light' | 'heavy' | 'thrust' | 'spin'
  step: number
  u: number
  hitFrom: number
  hitTo: number
}

const sm = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
const lerp = THREE.MathUtils.lerp

/** Overrides arm / torso pose for the active attack: windup, fast strike, recovery. */
function attackPose(rig: CharacterRig, a: AttackPose) {
  const w = sm(0, a.hitFrom, a.u) // windup
  const e = 1 - Math.pow(1 - sm(a.hitFrom, a.hitTo, a.u), 3) // strike (ease-out)
  const r = sm(a.hitTo, 1, a.u) // recover
  const ar = rig.armR
  const al = rig.armL
  const fr = rig.foreR
  const tor = rig.torso
  let ax = 0, az = 0, ay = 0, ty = 0, tx = 0, by = 0, fb = 0
  if (a.kind === 'light') {
    if (a.step === 0) { // high right -> low left
      ax = lerp(lerp(-0.3, -2.5, w), -1.0, e); az = lerp(lerp(-0.1, -0.9, w), 0.5, e); ty = lerp(lerp(0, -0.7, w), 0.8, e); fb = lerp(1.2, 0.2, e)
    } else if (a.step === 1) { // backhand low left -> high right
      ax = lerp(lerp(-0.3, -1.1, w), -1.7, e); az = lerp(lerp(-0.1, 0.7, w), -1.0, e); ty = lerp(lerp(0, 0.8, w), -0.8, e); fb = 0.3
    } else { // rising finisher with a twist
      ax = lerp(lerp(-0.3, -0.2, w), -2.7, e); az = lerp(lerp(-0.1, -0.5, w), -0.2, e); ty = lerp(lerp(0, -0.5, w), 0.6, e); tx = lerp(0, -0.25, e); fb = lerp(0.8, 0.1, e)
    }
  } else if (a.kind === 'heavy') {
    ax = lerp(lerp(-0.3, -3.0, w), -0.55, e); az = -0.15; tx = lerp(lerp(0, -0.35, w), 0.55, e); fb = lerp(1.0, 0.1, e)
    al.rotation.x = lerp(lerp(0, -2.7, w), -0.8, e)
  } else if (a.kind === 'thrust') {
    ax = lerp(lerp(-0.3, -1.1, w), -1.5, e); az = lerp(lerp(-0.1, -0.5, w), -0.05, e); ty = lerp(lerp(0, 0.7, w), -0.35, e); fb = lerp(1.1, 0.0, e)
  } else {
    ax = -1.45; az = -1.35 * Math.min(1, a.u * 6); by = sm(0, 0.95, a.u) * Math.PI * 2; ty = 0; fb = 0.1
  }
  const blend = a.kind === 'spin' ? 1 : 1 - r * 0.85
  ar.rotation.x = lerp(ar.rotation.x, ax, blend)
  ar.rotation.z = lerp(ar.rotation.z, az, blend)
  ar.rotation.y = lerp(ar.rotation.y, ay, blend)
  fr.rotation.x = lerp(fr.rotation.x, -fb, blend)
  tor.rotation.y = lerp(tor.rotation.y, ty, blend)
  tor.rotation.x = lerp(tor.rotation.x, tx, blend)
  rig.body.rotation.y = by
}

export function animateCharacter(rig: CharacterRig, speed: number, dt: number, time: number, atk?: AttackPose | null) {
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
  if (atk) attackPose(rig, atk)
  else if (rig.body.rotation.y !== 0) rig.body.rotation.y = 0

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

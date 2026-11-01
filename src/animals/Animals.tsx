import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { audio } from '../audio/audio'
import { WORLD_SEED } from '../game/config'
import { playerState } from '../game/store'
import { mulberry32 } from '../utils/random'
import { forestMask, meadowMask } from '../world/biome'
import { B } from '../world/biomes'
import { biomeAt, lavaAt, depthAt, heightAt, shoreAt, siteClearance, slopeAt, world, WORLD_HALF, type Site } from '../world/terrainData'
import { siteGeometry } from '../world/structures'
import { makeSpecies, type SpeciesDef } from './species'

interface Animal {
  sp: SpeciesDef
  i: number
  x: number
  z: number
  hx: number
  hz: number
  yaw: number
  tx: number
  tz: number
  mode: 0 | 1 | 2 // idle | walk | flee
  timer: number
  gait: number
  speed: number
  voice: number
  hop: number
  /** villagers keep to their village and avoid its buildings */
  home?: Site
  name?: string
  lineSeed?: number
}

/** lava, volcanic rock and caverns hold no wildlife */
const badGround = (x: number, z: number) => {
  const b = biomeAt(x, z)
  return b === B.Volcanic || b === B.Cave || lavaAt(x, z) !== null
}
const inB = (x: number, z: number, ...ids: number[]) => ids.includes(biomeAt(x, z))

const NPC_NAMES = ['Pip', 'Mara', 'Tobin', 'Elsie', 'Barnaby', 'Willa', 'Odo', 'Nell', 'Fenn', 'Juniper', 'Rook', 'Tansy', 'Bram', 'Posy']

const animals: Animal[] = []

/** Closest villager within `r` (for the dialogue bubble). */
export function nearestNpc(x: number, z: number, r: number) {
  let best: Animal | null = null
  let bd = r
  for (const a of animals) {
    if (!a.sp.npc) continue
    const d = Math.hypot(a.x - x, a.z - z)
    if (d < bd) {
      bd = d
      best = a
    }
  }
  return best ? { x: best.x, y: heightAt(best.x, best.z), z: best.z, name: best.name!, title: best.sp.npc!.title, lines: best.sp.npc!.lines, seed: best.lineSeed! } : null
}

function villagerOk(a: Animal, x: number, z: number) {
  const site = a.home!
  if (Math.hypot(x - site.x, z - site.z) > 17.2) return false
  if (depthAt(x, z) > 0.04 || slopeAt(x, z) > 0.7 || badGround(x, z)) return false
  for (const c of siteGeometry(site).cols) if (Math.hypot(c.x - x, c.z - z) < c.r + 0.45) return false
  return true
}

/** Called by sword strikes: animals nearby bolt away. */
export function scareAnimals(x: number, z: number, r: number) {
  for (const a of animals) {
    const d = Math.hypot(a.x - x, a.z - z)
    if (d < r) {
      a.mode = 2
      a.timer = 2 + Math.random() * 2
      a.tx = a.x + ((a.x - x) / (d || 1)) * 18
      a.tz = a.z + ((a.z - z) / (d || 1)) * 18
    }
  }
}

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _qx = new THREE.Quaternion()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const _c = new THREE.Color()
const AX = new THREE.Vector3(1, 0, 0)
const AY = new THREE.Vector3(0, 1, 0)
const AZ = new THREE.Vector3(0, 0, 1)
const _base = new THREE.Matrix4()
const _leg = new THREE.Matrix4()

function okLand(x: number, z: number, maxSlope = 0.45) {
  if (Math.abs(x) > WORLD_HALF - 12 || Math.abs(z) > WORLD_HALF - 12) return false
  if (depthAt(x, z) > 0.04 || shoreAt(x, z) > 0.55 || badGround(x, z)) return false
  if (slopeAt(x, z) > maxSlope) return false
  return siteClearance(x, z) > 0.5
}

function populate() {
  animals.length = 0
  const sp = makeSpecies()
  const rng = mulberry32(WORLD_SEED ^ 0xa11ce)
  const counts: Record<string, number> = {}
  const add = (s: SpeciesDef, x: number, z: number, hx = x, hz = z) => {
    counts[s.id] = (counts[s.id] ?? 0) + 1
    animals.push({ sp: s, i: 0, x, z, hx, hz, yaw: rng() * 6.28, tx: x, tz: z, mode: 0, timer: rng() * 4, gait: rng() * 6, speed: 0, voice: 8 + rng() * 30, hop: rng() * 6 })
  }
  const herd = (s: SpeciesDef, herds: number, size: number, pick: (x: number, z: number) => boolean, maxSlope = 0.35) => {
    let placed = 0
    for (let tries = 0; tries < 4000 && placed < herds; tries++) {
      const cx = (rng() - 0.5) * (WORLD_HALF * 1.7)
      const cz = (rng() - 0.5) * (WORLD_HALF * 1.7)
      if (!okLand(cx, cz, maxSlope) || !pick(cx, cz)) continue
      // keep herds away from the spawn so the first view isn't crowded, but not too far
      let n = 0
      for (let k = 0; k < size * 4 && n < size; k++) {
        const x = cx + (rng() - 0.5) * 8
        const z = cz + (rng() - 0.5) * 8
        if (okLand(x, z, maxSlope)) {
          add(s, x, z, cx, cz)
          n++
        }
      }
      if (n) placed++
    }
  }
  herd(sp.cow, 9, 4, (x, z) => inB(x, z, B.Grass, B.Forest, B.Tropical) && meadowMask(x, z) > 0.4 && forestMask(x, z) < 0.6)
  herd(sp.horse, 7, 3, (x, z) => inB(x, z, B.Grass, B.Forest, B.Desert, B.Mountain) && heightAt(x, z) > 2 && forestMask(x, z) < 0.65, 0.3)
  herd(sp.sheep, 9, 6, (x, z) => inB(x, z, B.Grass, B.Forest, B.Mountain, B.Snow) && heightAt(x, z) > 1 && meadowMask(x, z) > 0.3, 0.4)
  herd(sp.deer, 9, 4, (x, z) => inB(x, z, B.Forest, B.Snow, B.Magical, B.Mountain) || (inB(x, z, B.Grass) && forestMask(x, z) > 0.5), 0.45)
  herd(sp.rabbit, 14, 3, (x, z) => inB(x, z, B.Grass, B.Forest, B.Snow, B.Magical, B.Tropical) && meadowMask(x, z) > 0.25, 0.5)
  // villagers wander inside their village; a few chickens and a hound-less yard feel
  for (const site of world.sites) {
    if (site.type !== 'village') continue
    const mix = [sp.farmer, sp.farmer, sp.elder, sp.merchant, sp.child, sp.child, sp.guard]
    const count = 6 + Math.floor(rng() * 3)
    for (let k = 0; k < count; k++) {
      for (let tries = 0; tries < 40; tries++) {
        const a = rng() * 6.28
        const r = 2 + rng() * 13
        const x = site.x + Math.cos(a) * r
        const z = site.z + Math.sin(a) * r
        const probe: Animal = { sp: mix[k % mix.length], i: 0, x, z, hx: x, hz: z, yaw: rng() * 6.28, tx: x, tz: z, mode: 0, timer: rng() * 4, gait: 0, speed: 0, voice: 99, hop: rng() * 6, home: site }
        if (villagerOk(probe, x, z)) {
          counts[probe.sp.id] = (counts[probe.sp.id] ?? 0) + 1
          probe.name = NPC_NAMES[Math.floor(rng() * NPC_NAMES.length)]
          probe.lineSeed = Math.floor(rng() * 100)
          animals.push(probe)
          break
        }
      }
    }
    for (let k = 0; k < 6; k++) {
      const a = rng() * 6.28
      const r = 3 + rng() * 11
      const x = site.x + Math.cos(a) * r
      const z = site.z + Math.sin(a) * r
      const probe: Animal = { sp: sp.chicken, i: 0, x, z, hx: x, hz: z, yaw: rng() * 6.28, tx: x, tz: z, mode: 0, timer: rng() * 4, gait: 0, speed: 0, voice: 8 + rng() * 30, hop: rng() * 6, home: site }
      if (villagerOk(probe, x, z)) {
        counts.chicken = (counts.chicken ?? 0) + 1
        animals.push(probe)
      }
    }
  }
  // chickens scratch around cottages
  for (const site of world.sites) {
    if (site.type !== 'cottage' && site.type !== 'cottageRuin') continue
    for (let k = 0; k < 5; k++) {
      const a = rng() * 6.28
      const r = site.radius + 1.5 + rng() * 3
      const x = site.x + Math.cos(a) * r
      const z = site.z + Math.sin(a) * r
      if (okLand(x, z, 0.5)) add(sp.chicken, x, z, site.x, site.z)
    }
  }
  // ducks float on the real lakes
  for (const lk of world.stats.lakes) {
    if (lk.area < 200) continue
    let n = 0
    for (let k = 0; k < 60 && n < 4; k++) {
      const x = lk.x + (rng() - 0.5) * Math.sqrt(lk.area) * 0.6
      const z = lk.z + (rng() - 0.5) * Math.sqrt(lk.area) * 0.6
      if (depthAt(x, z) > 0.5) {
        add(sp.duck, x, z, lk.x, lk.z)
        n++
      }
    }
  }
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')) (window as unknown as { __animals: Animal[] }).__animals = animals
  return { sp, counts }
}

function Ground() {
  const { sp, counts } = useMemo(populate, [])
  const meshes = useMemo(() => {
    const list: { sp: SpeciesDef; body: THREE.InstancedMesh; legs: THREE.InstancedMesh[]; n: number }[] = []
    for (const s of Object.values(sp)) {
      const n = counts[s.id]
      if (!n) continue
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: s.emissive ?? 0x000000, emissiveIntensity: s.emissive ? 0.8 : 0 })
      const body = new THREE.InstancedMesh(s.body, mat, n)
      const legs = s.hips.map(() => new THREE.InstancedMesh(s.leg!, mat, n))
      let k = 0
      for (const a of animals) {
        if (a.sp !== s) continue
        a.i = k
        _c.setHex(s.tints[(Math.random() * s.tints.length) | 0])
        body.setColorAt(k, _c)
        legs.forEach((l) => l.setColorAt(k, _c))
        k++
      }
      for (const m of [body, ...legs]) {
        m.frustumCulled = false
        m.castShadow = true
        m.receiveShadow = true
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      }
      list.push({ sp: s, body, legs, n })
    }
    return list
  }, [sp, counts])

  useEffect(() => () => meshes.forEach((m) => [m.body, ...m.legs].forEach((x) => x.dispose())), [meshes])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const px = playerState.pos.x
    const pz = playerState.pos.z
    for (const a of animals) {
      const s = a.sp
      const dp = Math.hypot(a.x - px, a.z - pz)
      // spook when the player runs straight at them
      if (a.mode !== 2 && dp < 3.2 && playerState.speed > 3.5 && !s.npc) {
        a.mode = 2
        a.timer = 1.5 + Math.random()
        a.tx = a.x + ((a.x - px) / (dp || 1)) * 14
        a.tz = a.z + ((a.z - pz) / (dp || 1)) * 14
      }
      a.timer -= dt
      if (a.timer <= 0) {
        if (a.mode === 1 || a.mode === 2) {
          a.mode = 0
          a.timer = 2 + Math.random() * 6
        } else if (Math.random() < 0.7) {
          a.mode = 1
          a.timer = 6
          let ang = Math.random() * 6.28
          let r = Math.random() * s.home
          a.tx = a.hx + Math.cos(ang) * r
          a.tz = a.hz + Math.sin(ang) * r
          // villagers only pick spots they can actually stand on (not inside a house, fence or pond)
          if (a.home) {
            for (let k = 0; k < 8 && !villagerOk(a, a.tx, a.tz); k++) {
              ang = Math.random() * 6.28
              r = Math.random() * s.home
              a.tx = a.hx + Math.cos(ang) * r
              a.tz = a.hz + Math.sin(ang) * r
            }
            if (!villagerOk(a, a.tx, a.tz)) {
              a.mode = 0
              a.timer = 1.5
            }
          }
        } else a.timer = 2 + Math.random() * 5
      }
      let want = 0
      if (a.mode === 1) want = s.walk
      else if (a.mode === 2) want = s.flee
      if (want > 0) {
        const dx = a.tx - a.x
        const dz = a.tz - a.z
        if (Math.hypot(dx, dz) < 0.6) {
          a.mode = 0
          a.timer = 2 + Math.random() * 4
          want = 0
        } else {
          const ty = Math.atan2(dx, dz)
          const d = Math.atan2(Math.sin(ty - a.yaw), Math.cos(ty - a.yaw))
          a.yaw += d * Math.min(1, dt * (a.mode === 2 ? 8 : 3))
        }
      }
      // villagers stop and turn to face a nearby hero (so the dialogue bubble feels like a conversation)
      if (a.home && s.npc && dp < 4.4 && a.mode !== 2) {
        a.mode = 0
        a.timer = Math.max(a.timer, 0.6)
        want = 0
        const ty = Math.atan2(px - a.x, pz - a.z)
        a.yaw += Math.atan2(Math.sin(ty - a.yaw), Math.cos(ty - a.yaw)) * Math.min(1, dt * 4)
      }
      a.speed += (want - a.speed) * Math.min(1, dt * 4)
      if (a.speed > 0.02) {
        const nx = a.x + Math.sin(a.yaw) * a.speed * dt
        const nz = a.z + Math.cos(a.yaw) * a.speed * dt
        const ok = s.swim ? depthAt(nx, nz) > 0.4 : a.home ? villagerOk(a, nx, nz) : okLand(nx, nz, 0.55)
        if (ok) {
          a.x = nx
          a.z = nz
        } else {
          a.mode = 0
          a.timer = 1 + Math.random() * 2
          a.yaw += Math.PI * (0.6 + Math.random() * 0.8)
        }
      }
      a.gait += dt * (2 + a.speed * 2.6)
      a.hop += dt

      if (dp < 40) {
        a.voice -= dt
        if (a.voice <= 0 && s.voice) {
          a.voice = 14 + Math.random() * 35
          const vol = Math.max(0, 1 - dp / 40) * 0.18
          const pan = Math.max(-1, Math.min(1, (a.x - px) / 25))
          if (s.voice === 'moo') audio.moo(vol, pan)
          else if (s.voice === 'neigh') audio.neigh(vol, pan)
          else if (s.voice === 'cluck') audio.cluck(vol * 1.4, pan)
          else audio.chirp(vol * 0.8, pan)
        }
      }

      const y = s.swim ? world.wl[((Math.round(a.z + WORLD_HALF)) * 513 + Math.round(a.x + WORLD_HALF))] : heightAt(a.x, a.z)
      const bob = s.swim ? Math.sin(a.hop * 2) * 0.012 - 0.03 : Math.abs(Math.sin(a.gait)) * 0.03 * Math.min(1, a.speed)
      const graze = a.mode === 0 && !s.swim && Math.sin(a.hop * 0.4 + a.i) > 0.2 ? 0.28 : 0
      _q.setFromAxisAngle(AY, a.yaw)
      _qx.setFromAxisAngle(AX, graze)
      _q.multiply(_qx)
      _base.compose(_p.set(a.x, y + bob, a.z), _q, _s.setScalar(s.scale))
      const m = meshes.find((mm) => mm.sp === s)!
      m.body.setMatrixAt(a.i, _base)
      for (let l = 0; l < s.hips.length; l++) {
        const h = s.hips[l]
        _qx.setFromAxisAngle(AX, Math.sin(a.gait + h[3]) * s.swing * Math.min(1, a.speed * 0.8))
        _leg.compose(_p.set(h[0], h[1], h[2]), _qx, _s.set(1, 1, 1))
        _m.multiplyMatrices(_base, _leg)
        m.legs[l].setMatrixAt(a.i, _m)
      }
    }
    for (const m of meshes) {
      m.body.instanceMatrix.needsUpdate = true
      for (const l of m.legs) l.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <>
      {meshes.map((m) => (
        <group key={m.sp.id}>
          <primitive object={m.body} />
          {m.legs.map((l, i) => (
            <primitive key={i} object={l} />
          ))}
        </group>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------------------------- air
const BIRDS = 48
const FLOCKS = 6

function Birds() {
  const { body, wingL, wingR, flock } = useMemo(() => {
    const mat = new THREE.MeshLambertMaterial({ color: 0x2c2a33, side: THREE.DoubleSide })
    const bg = new THREE.ConeGeometry(0.1, 0.5, 5).rotateX(Math.PI / 2).scale(1, 0.8, 1)
    const wg = new THREE.BufferGeometry()
    wg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.12, 0.5, 0, 0, 0, 0, -0.12, 0.5, 0, 0.1], 3))
    wg.setIndex([0, 1, 2, 1, 3, 2])
    wg.computeVertexNormals()
    const wgl = wg.clone().scale(-1, 1, 1)
    const rng = mulberry32(777)
    const flock = Array.from({ length: BIRDS }, (_, i) => {
      const f = i % FLOCKS
      return {
        cx: ((f * 97) % 220) - 110 + (rng() - 0.5) * 30,
        cz: ((f * 61) % 200) - 100 + (rng() - 0.5) * 30,
        r: 22 + f * 7 + rng() * 6,
        h: 15 + f * 2 + rng() * 5,
        a: rng() * 6.28,
        w: (0.18 + rng() * 0.05) * (f % 2 ? 1 : -1),
        ph: rng() * 6.28,
        off: rng() * 2 - 1,
      }
    })
    const mk = (g: THREE.BufferGeometry) => {
      const m = new THREE.InstancedMesh(g, mat, BIRDS)
      m.frustumCulled = false
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      return m
    }
    return { body: mk(bg), wingL: mk(wgl), wingR: mk(wg), flock }
  }, [])
  useFrame((state) => {
    const t = state.clock.elapsedTime
    flock.forEach((b, i) => {
      const a = b.a + t * b.w
      // loosely follow the player's area so the sky is never empty
      const cx = b.cx * 0.35 + playerState.pos.x * 0.65
      const cz = b.cz * 0.35 + playerState.pos.z * 0.65
      const x = cx + Math.cos(a) * (b.r + b.off * 4)
      const z = cz + Math.sin(a) * (b.r + b.off * 4)
      const y = b.h + Math.sin(t * 0.6 + b.ph) * 1.5
      const yaw = Math.atan2(-Math.sin(a) * Math.sign(b.w), Math.cos(a) * Math.sign(b.w))
      _q.setFromAxisAngle(AY, yaw)
      _qx.setFromAxisAngle(AZ, -Math.sign(b.w) * 0.3)
      _q.multiply(_qx)
      _base.compose(_p.set(x, y, z), _q, _s.set(1, 1, 1))
      body.setMatrixAt(i, _base)
      const flap = Math.sin(t * 9 + b.ph) * 0.65 * (Math.sin(t * 0.4 + b.ph) > -0.3 ? 1 : 0.1)
      for (const [mesh, sgn] of [[wingR, 1], [wingL, -1]] as const) {
        _qx.setFromAxisAngle(AZ, flap * sgn)
        _leg.compose(_p.set(0, 0, 0), _qx, _s.set(1, 1, 1))
        _m.multiplyMatrices(_base, _leg)
        mesh.setMatrixAt(i, _m)
      }
    })
    body.instanceMatrix.needsUpdate = true
    wingL.instanceMatrix.needsUpdate = true
    wingR.instanceMatrix.needsUpdate = true
  })
  return (
    <>
      <primitive object={body} />
      <primitive object={wingL} />
      <primitive object={wingR} />
    </>
  )
}

const FLIES = 60

/** Glowing butterflies drifting around the player (recycled), so meadows always feel alive. */
function Butterflies() {
  const { wl, wr, data } = useMemo(() => {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, toneMapped: false })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.12, 0.02, 0.09, 0.14, 0, -0.07, 0.04, 0, -0.1], 3))
    g.setIndex([0, 1, 2, 0, 2, 3])
    const gl = g.clone().scale(-1, 1, 1)
    const cols = [0xff9ad0, 0xffe066, 0x9ad8ff, 0xffffff, 0xc9a0ff, 0xffa85a]
    const rng = mulberry32(31)
    const data = Array.from({ length: FLIES }, () => ({
      x: playerState.pos.x + (rng() - 0.5) * 40,
      z: playerState.pos.z + (rng() - 0.5) * 40,
      y: 0.6 + rng() * 1.4,
      a: rng() * 6.28,
      s: 0.7 + rng() * 0.8,
      ph: rng() * 6.28,
      c: cols[(rng() * cols.length) | 0],
    }))
    const mk = (geo: THREE.BufferGeometry) => {
      const m = new THREE.InstancedMesh(geo, mat, FLIES)
      m.frustumCulled = false
      data.forEach((d, i) => m.setColorAt(i, _c.setHex(d.c).multiplyScalar(1.5)))
      return m
    }
    return { wl: mk(gl), wr: mk(g), data }
  }, [])
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const t = state.clock.elapsedTime
    data.forEach((d, i) => {
      d.a += Math.sin(t * 0.7 + d.ph) * dt * 2.2
      d.x += Math.sin(d.a) * d.s * dt
      d.z += Math.cos(d.a) * d.s * dt
      const dx = d.x - playerState.pos.x
      const dz = d.z - playerState.pos.z
      if (Math.hypot(dx, dz) > 26) {
        const ang = Math.random() * 6.28
        d.x = playerState.pos.x + Math.cos(ang) * 18
        d.z = playerState.pos.z + Math.sin(ang) * 18
      }
      const ground = heightAt(d.x, d.z) + depthAt(d.x, d.z)
      const y = ground + d.y + Math.sin(t * 2 + d.ph) * 0.2
      _q.setFromAxisAngle(AY, d.a)
      _base.compose(_p.set(d.x, y, d.z), _q, _s.set(1, 1, 1))
      const f = 0.2 + Math.abs(Math.sin(t * 11 + d.ph)) * 1.0
      _qx.setFromAxisAngle(AZ, f)
      _leg.compose(_p.set(0, 0, 0), _qx, _s.set(1, 1, 1))
      _m.multiplyMatrices(_base, _leg)
      wr.setMatrixAt(i, _m)
      _qx.setFromAxisAngle(AZ, -f)
      _leg.compose(_p.set(0, 0, 0), _qx, _s.set(1, 1, 1))
      _m.multiplyMatrices(_base, _leg)
      wl.setMatrixAt(i, _m)
    })
    wl.instanceMatrix.needsUpdate = true
    wr.instanceMatrix.needsUpdate = true
  })
  return (
    <>
      <primitive object={wl} />
      <primitive object={wr} />
    </>
  )
}

export function Animals() {
  return (
    <>
      <Ground />
      <Birds />
      <Butterflies />
    </>
  )
}

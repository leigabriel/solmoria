import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { audio } from '../audio/audio'
import { playerState } from '../game/store'
import { playerRig } from '../player/Player'
import { sharedUniforms } from '../shaders/materials'
import { heightAt } from '../world/terrainData'
import { scareAnimals } from '../animals/Animals'
import { combat } from './state'

const TRAIL = 26
const MAX_P = 220
const _tip = new THREE.Vector3()
const _grd = new THREE.Vector3()
const _dir = new THREE.Vector3()

const GRASS_COLS = [0x6faa2f, 0x8cc43c, 0x4e8a22, 0xa8d44a]
const SPARK_COLS = [0xfff2b0, 0xffd36a, 0xffffff]
const PETAL_COLS = [0xff7aa8, 0xffe14d, 0xffffff, 0xc89bff, 0xff9a4d]

/** Slash ribbon, flying grass / petals / sparks, ground shock rings, blade glow, camera shake. */
export function CombatFX() {
  const { scene } = useThree()

  const fx = useMemo(() => {
    // ---- trail ----
    const tg = new THREE.BufferGeometry()
    const tpos = new Float32Array(TRAIL * 2 * 3)
    const talpha = new Float32Array(TRAIL * 2)
    tg.setAttribute('position', new THREE.BufferAttribute(tpos, 3))
    tg.setAttribute('aAlpha', new THREE.BufferAttribute(talpha, 1))
    const tidx: number[] = []
    for (let i = 0; i < TRAIL - 1; i++) {
      const a = i * 2
      tidx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    tg.setIndex(tidx)
    const tmat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: 'attribute float aAlpha; varying float vA; void main(){ vA=aAlpha; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'varying float vA; void main(){ gl_FragColor=vec4(mix(vec3(1.0,0.78,0.35),vec3(1.0,1.0,0.9),vA)*1.15, vA*0.85); }',
    })
    const trail = new THREE.Mesh(tg, tmat)
    trail.frustumCulled = false
    trail.renderOrder = 6
    const ages = new Float32Array(TRAIL).fill(9)
    const pts = Array.from({ length: TRAIL }, () => [new THREE.Vector3(), new THREE.Vector3()])

    // ---- particles ----
    const pg = new THREE.BufferGeometry()
    const ppos = new Float32Array(MAX_P * 3)
    const pcol = new Float32Array(MAX_P * 3)
    const psize = new Float32Array(MAX_P)
    const palpha = new Float32Array(MAX_P)
    pg.setAttribute('position', new THREE.BufferAttribute(ppos, 3))
    pg.setAttribute('color', new THREE.BufferAttribute(pcol, 3))
    pg.setAttribute('aSize', new THREE.BufferAttribute(psize, 1))
    pg.setAttribute('aAlpha', new THREE.BufferAttribute(palpha, 1))
    const pmat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uPxPerUnit: sharedUniforms.uPxPerUnit },
      vertexShader: `attribute float aSize; attribute float aAlpha; varying float vA; varying vec3 vC; uniform float uPxPerUnit;
        void main(){ vA=aAlpha; vC=color; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=max(1.0, aSize*uPxPerUnit/max(-mv.z,0.1)); }`,
      fragmentShader: `varying float vA; varying vec3 vC; void main(){ vec2 c=gl_PointCoord-0.5; float d=length(c)*2.0; if(d>1.0) discard; gl_FragColor=vec4(vC*1.1, vA); }`,
      vertexColors: true,
    })
    const points = new THREE.Points(pg, pmat)
    points.frustumCulled = false
    points.renderOrder = 6
    const vel = new Float32Array(MAX_P * 3)
    const life = new Float32Array(MAX_P)
    const maxLife = new Float32Array(MAX_P).fill(1)
    const grav = new Float32Array(MAX_P)

    // ---- shock rings ----
    const ringGeo = new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2)
    const rings = Array.from({ length: 4 }, () => {
      const m = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false }),
      )
      m.visible = false
      m.renderOrder = 6
      return { m, t: 9, size: 1 }
    })
    return { trail, tg, ages, pts, points, pg, vel, life, maxLife, grav, rings, cursor: 0, ringCursor: 0, fired: -1, trailLast: false }
  }, [])

  useEffect(() => {
    const objs: THREE.Object3D[] = [fx.trail, fx.points, ...fx.rings.map((r) => r.m)]
    objs.forEach((o) => scene.add(o))
    return () => {
      objs.forEach((o) => scene.remove(o))
    }
  }, [fx, scene])

  const emit = (x: number, y: number, z: number, vx: number, vy: number, vz: number, col: number, size: number, life: number, g: number) => {
    const i = fx.cursor++ % MAX_P
    fx.pg.attributes.position.setXYZ(i, x, y, z)
    fx.vel[i * 3] = vx
    fx.vel[i * 3 + 1] = vy
    fx.vel[i * 3 + 2] = vz
    const c = new THREE.Color(col)
    fx.pg.attributes.color.setXYZ(i, c.r, c.g, c.b)
    fx.pg.attributes.aSize.setX(i, size)
    fx.life[i] = life
    fx.maxLife[i] = life
    fx.grav[i] = g
  }

  const ring = (x: number, y: number, z: number, size: number) => {
    const r = fx.rings[fx.ringCursor++ % fx.rings.length]
    r.m.position.set(x, y + 0.08, z)
    r.t = 0
    r.size = size
    r.m.visible = true
  }

  const burst = (cx: number, cz: number, spread: number, n: number, power: number, sparks: boolean) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const r = Math.random() * spread
      const x = cx + Math.cos(a) * r
      const z = cz + Math.sin(a) * r
      const roll = Math.random()
      const col = sparks && roll < 0.35 ? SPARK_COLS[(Math.random() * 3) | 0] : roll < 0.8 ? GRASS_COLS[(Math.random() * 4) | 0] : PETAL_COLS[(Math.random() * 5) | 0]
      const sp = sparks && roll < 0.35
      emit(x, heightAt(x, z) + 0.15, z, Math.cos(a) * power * (0.4 + Math.random()), 1.4 + Math.random() * power * 0.9, Math.sin(a) * power * (0.4 + Math.random()), col, sp ? 0.1 : 0.13, 0.5 + Math.random() * 0.6, sp ? 7 : 5)
    }
  }

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const rig = playerRig.current
    const live = combat.live
    // ---- trail ----
    if (rig) {
      rig.tip.getWorldPosition(_tip)
      rig.guard.getWorldPosition(_grd)
      // push newest sample at index 0
      for (let i = TRAIL - 1; i > 0; i--) {
        fx.pts[i][0].copy(fx.pts[i - 1][0])
        fx.pts[i][1].copy(fx.pts[i - 1][1])
        fx.ages[i] = fx.ages[i - 1] + dt
      }
      fx.pts[0][0].copy(_tip)
      fx.pts[0][1].copy(_grd)
      fx.ages[0] = live || combat.u > 0.1 && combat.active && combat.u < combat.def.hitTo + 0.1 ? 0 : 9
    }
    const pos = fx.tg.attributes.position as THREE.BufferAttribute
    const al = fx.tg.attributes.aAlpha as THREE.BufferAttribute
    for (let i = 0; i < TRAIL; i++) {
      pos.setXYZ(i * 2, fx.pts[i][0].x, fx.pts[i][0].y, fx.pts[i][0].z)
      pos.setXYZ(i * 2 + 1, fx.pts[i][1].x, fx.pts[i][1].y, fx.pts[i][1].z)
      const a = Math.max(0, 1 - fx.ages[i] / 0.22) * (1 - i / TRAIL)
      al.setX(i * 2, a)
      al.setX(i * 2 + 1, a * 0.15)
    }
    pos.needsUpdate = true
    al.needsUpdate = true

    // ---- blade glow (feeds bloom) ----
    if (rig) {
      const blade = rig.katana.children[0] as THREE.Mesh
      const m = blade.material as THREE.MeshLambertMaterial
      m.emissiveIntensity = THREE.MathUtils.damp(m.emissiveIntensity, live ? 2.2 : 0.55, 20, dt)
    }

    // ---- impact: fires once per attack when the blade enters its live window ----
    if (live && fx.fired !== combat.serial) {
      fx.fired = combat.serial
      const f = playerState.facing
      const reach = combat.kind === 'thrust' ? 2.4 : combat.kind === 'spin' ? 0 : combat.kind === 'heavy' ? 2.1 : 1.5
      const cx = playerState.pos.x + Math.sin(f) * reach
      const cz = playerState.pos.z + Math.cos(f) * reach
      const gy = heightAt(cx, cz)
      if (combat.kind === 'heavy') {
        burst(cx, cz, 1.2, 46, 4.2, true)
        ring(cx, gy, cz, 3.6)
        combat.shake = 1
        audio.cut(0.3)
        audio.shing(0.12)
        scareAnimals(cx, cz, 9)
      } else if (combat.kind === 'spin') {
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2
          burst(playerState.pos.x + Math.cos(a) * 1.7, playerState.pos.z + Math.sin(a) * 1.7, 0.6, 5, 2.8, k % 3 === 0)
        }
        ring(playerState.pos.x, playerState.pos.y, playerState.pos.z, 2.6)
        combat.shake = 0.5
        audio.cut(0.26)
        scareAnimals(playerState.pos.x, playerState.pos.z, 7)
      } else if (combat.kind === 'thrust') {
        burst(cx, cz, 0.7, 24, 3.8, true)
        ring(cx, gy, cz, 2.2)
        combat.shake = 0.45
        audio.cut(0.24)
        scareAnimals(cx, cz, 6)
      } else {
        burst(cx, cz, 0.9, 16 + combat.step * 6, 2.6, combat.step === 2)
        if (combat.step === 2) ring(cx, gy, cz, 2.0)
        combat.shake = Math.max(combat.shake, 0.18 + combat.step * 0.12)
        audio.cut(0.18 + combat.step * 0.04)
        scareAnimals(cx, cz, 5)
      }
      combat.impact = 1
    }
    // continuous leaf shavings along the blade while live
    if (live && rig && Math.random() < 0.8) {
      _dir.copy(_tip)
      const gx = _dir.x
      const gz = _dir.z
      const col = GRASS_COLS[(Math.random() * 4) | 0]
      emit(gx, heightAt(gx, gz) + 0.2, gz, (Math.random() - 0.5) * 1.6, 1 + Math.random() * 1.4, (Math.random() - 0.5) * 1.6, col, 0.1, 0.45, 4)
    }

    // ---- particles ----
    const pp = fx.pg.attributes.position as THREE.BufferAttribute
    const pa = fx.pg.attributes.aAlpha as THREE.BufferAttribute
    for (let i = 0; i < MAX_P; i++) {
      if (fx.life[i] <= 0) {
        pa.setX(i, 0)
        continue
      }
      fx.life[i] -= dt
      fx.vel[i * 3 + 1] -= fx.grav[i] * dt
      pp.setXYZ(i, pp.getX(i) + fx.vel[i * 3] * dt, pp.getY(i) + fx.vel[i * 3 + 1] * dt, pp.getZ(i) + fx.vel[i * 3 + 2] * dt)
      pa.setX(i, Math.max(0, Math.min(1, (fx.life[i] / fx.maxLife[i]) * 2)))
    }
    pp.needsUpdate = true
    pa.needsUpdate = true
    ;(fx.pg.attributes.color as THREE.BufferAttribute).needsUpdate = true
    ;(fx.pg.attributes.aSize as THREE.BufferAttribute).needsUpdate = true

    // ---- rings ----
    for (const r of fx.rings) {
      if (r.t > 1) {
        r.m.visible = false
        continue
      }
      r.t += dt / 0.45
      const e = 1 - Math.pow(1 - Math.min(1, r.t), 3)
      r.m.scale.setScalar(0.3 + e * r.size)
      ;(r.m.material as THREE.MeshBasicMaterial).opacity = (1 - Math.min(1, r.t)) * 0.7
    }
    void state
  })
  return null
}

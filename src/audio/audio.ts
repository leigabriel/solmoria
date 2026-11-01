import { biomeState, playerState } from '../game/store'
import { depthAt, world } from '../world/terrainData'

/**
 * Fully synthesised sound (Web Audio): no asset downloads, no licences to track, tiny bundle.
 * Everything starts after the first user gesture (browser autoplay policy).
 */
let ctx: AudioContext | null = null
let master: GainNode
let noiseBuf: AudioBuffer
let windGain: GainNode
let windFilter: BiquadFilterNode
let waterGain: GainNode
let fallGain: GainNode
let waterFilter: BiquadFilterNode
let birdTimer = 0
let lavaTimer = 0
let waterTimer = 0
let started = false
let pendingVolume = 0.7
type Surface = 'grass' | 'water' | 'sand' | 'snow' | 'rock' | 'mud'

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const rnd = (a: number, b: number) => a + Math.random() * (b - a)

function noiseSource(loop = true) {
  const s = ctx!.createBufferSource()
  s.buffer = noiseBuf
  s.loop = loop
  if (loop) s.loopStart = Math.random() * 0.5
  return s
}

function env(g: GainNode, t: number, attack: number, peak: number, decay: number) {
  g.gain.cancelScheduledValues(t)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
}

/** One-shot filtered noise burst. */
function burst(opts: { type?: BiquadFilterType; f: number; f2?: number; q?: number; peak: number; attack?: number; decay: number; delay?: number; pan?: number }) {
  if (!ctx) return
  const t = ctx.currentTime + (opts.delay ?? 0)
  const src = noiseSource(false)
  const f = ctx.createBiquadFilter()
  f.type = opts.type ?? 'bandpass'
  f.frequency.setValueAtTime(opts.f, t)
  if (opts.f2) f.frequency.exponentialRampToValueAtTime(opts.f2, t + (opts.attack ?? 0.005) + opts.decay)
  f.Q.value = opts.q ?? 1
  const g = ctx.createGain()
  env(g, t, opts.attack ?? 0.005, opts.peak, opts.decay)
  const p = ctx.createStereoPanner()
  p.pan.value = opts.pan ?? 0
  src.connect(f).connect(g).connect(p).connect(master)
  src.start(t, Math.random() * 1.5)
  src.stop(t + (opts.attack ?? 0.005) + opts.decay + 0.05)
}

function tone(opts: { f: number; f2?: number; type?: OscillatorType; peak: number; attack?: number; decay: number; delay?: number; pan?: number }) {
  if (!ctx) return
  const t = ctx.currentTime + (opts.delay ?? 0)
  const o = ctx.createOscillator()
  o.type = opts.type ?? 'sine'
  o.frequency.setValueAtTime(opts.f, t)
  if (opts.f2) o.frequency.exponentialRampToValueAtTime(opts.f2, t + (opts.attack ?? 0.005) + opts.decay)
  const g = ctx.createGain()
  env(g, t, opts.attack ?? 0.005, opts.peak, opts.decay)
  const p = ctx.createStereoPanner()
  p.pan.value = opts.pan ?? 0
  o.connect(g).connect(p).connect(master)
  o.start(t)
  o.stop(t + (opts.attack ?? 0.005) + opts.decay + 0.05)
}

function buildAmbience() {
  const c = ctx!
  // wind: low-passed noise with a slow LFO
  const wind = noiseSource()
  const wf = c.createBiquadFilter()
  wf.type = 'lowpass'
  wf.frequency.value = 420
  windFilter = wf
  windGain = c.createGain()
  windGain.gain.value = 0.05
  const lfo = c.createOscillator()
  lfo.frequency.value = 0.11
  const lg = c.createGain()
  lg.gain.value = 0.03
  lfo.connect(lg).connect(windGain.gain)
  wind.connect(wf).connect(windGain).connect(master)
  wind.start()
  lfo.start()
  // leaves: highpassed shimmer
  const leaves = noiseSource()
  const lf = c.createBiquadFilter()
  lf.type = 'bandpass'
  lf.frequency.value = 3200
  lf.Q.value = 0.6
  const leafGain = c.createGain()
  leafGain.gain.value = 0.012
  const lfo2 = c.createOscillator()
  lfo2.frequency.value = 0.23
  const lg2 = c.createGain()
  lg2.gain.value = 0.008
  lfo2.connect(lg2).connect(leafGain.gain)
  leaves.connect(lf).connect(leafGain).connect(master)
  leaves.start()
  lfo2.start()
  // running water bed (gain follows proximity)
  const w = noiseSource()
  waterFilter = c.createBiquadFilter()
  waterFilter.type = 'bandpass'
  waterFilter.frequency.value = 900
  waterFilter.Q.value = 0.5
  waterGain = c.createGain()
  waterGain.gain.value = 0
  w.connect(waterFilter).connect(waterGain).connect(master)
  w.start()
  // waterfall roar: broadband low rumble
  const f = noiseSource()
  const ff = c.createBiquadFilter()
  ff.type = 'lowpass'
  ff.frequency.value = 1400
  fallGain = c.createGain()
  fallGain.gain.value = 0
  f.connect(ff).connect(fallGain).connect(master)
  f.start()
}

export const audio = {
  setVolume(v: number) {
    pendingVolume = v
    if (ctx) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05)
  },

  /** Call from a user gesture. */
  start() {
    if (started) {
      if (ctx && ctx.state === 'suspended') void ctx.resume()
      return
    }
    started = true
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = pendingVolume
    const comp = ctx.createDynamicsCompressor()
    master.connect(comp).connect(ctx.destination)
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    buildAmbience()
  },

  /** Per-frame: ambience mix follows where the player stands. */
  update(dt: number) {
    if (!ctx) return
    const { x, z } = playerState.pos
    const t = ctx.currentTime
    waterTimer -= dt
    if (waterTimer <= 0) {
      waterTimer = 0.2
      let nearest = 99
      for (const r of [0, 2, 4, 7, 11, 16, 22]) {
        for (let k = 0; k < (r ? 8 : 1); k++) {
          const a = (k / 8) * Math.PI * 2
          if (depthAt(x + Math.cos(a) * r, z + Math.sin(a) * r) > 0.05) {
            nearest = Math.min(nearest, r)
            break
          }
        }
        if (nearest < 99) break
      }
      let fall = 99
      for (const f of world.falls) {
        const i = Math.floor(f.pts.length / 6) * 3
        fall = Math.min(fall, Math.hypot(f.pts[i] - x, f.pts[i + 2] - z))
      }
      const wv = nearest >= 99 ? 0 : clamp(1 - nearest / 24, 0, 1)
      waterGain.gain.setTargetAtTime(wv * wv * 0.1, t, 0.4)
      waterFilter.frequency.setTargetAtTime(600 + wv * 700, t, 0.5)
      const fv = clamp(1 - fall / 55, 0, 1)
      fallGain.gain.setTargetAtTime(fv * fv * 0.22, t, 0.4)
    }
    birdTimer -= dt
    if (birdTimer <= 0) {
      birdTimer = rnd(1.2, 5) / Math.max(0.05, biomeState.birds)
      if (biomeState.birds > 0.08) this.birdSong(rnd(0.02, 0.06) * Math.min(1, biomeState.birds), rnd(-0.8, 0.8))
    }
    // lava: low bubbling pops
    lavaTimer -= dt
    if (lavaTimer <= 0) {
      lavaTimer = rnd(0.15, 0.7)
      if (biomeState.nearLava > 0.25) {
        const v = biomeState.nearLava
        burst({ type: 'lowpass', f: rnd(160, 320), q: 1.4, peak: 0.1 * v, attack: 0.01, decay: rnd(0.1, 0.25) })
        if (Math.random() < 0.4) burst({ f: rnd(1800, 3200), q: 1.2, peak: 0.04 * v, attack: 0.002, decay: 0.05 })
      }
    }
    // wind level / pitch follow the biome; birdsong thins out where there are none
    windGain.gain.setTargetAtTime(0.02 + biomeState.wind * 0.1, t, 0.8)
    windFilter.frequency.setTargetAtTime(300 * biomeState.windPitch + 120, t, 0.8)
  },

  birdSong(vol = 0.05, pan = 0) {
    const base = rnd(2400, 4200)
    const n = 2 + Math.floor(Math.random() * 4)
    for (let i = 0; i < n; i++) {
      tone({ f: base * rnd(0.9, 1.1), f2: base * rnd(1.15, 1.6), peak: vol, attack: 0.01, decay: rnd(0.05, 0.1), delay: i * rnd(0.09, 0.14), pan })
    }
  },

  step(surface: Surface, run: boolean) {
    if (!ctx) return
    const v = (run ? 0.11 : 0.07) * rnd(0.8, 1.15)
    if (surface === 'water') {
      burst({ f: rnd(500, 800), f2: 1800, q: 0.9, peak: v * 1.6, attack: 0.008, decay: 0.22 })
      tone({ f: rnd(300, 420), f2: rnd(700, 1000), peak: v * 0.35, decay: 0.09, delay: 0.03 })
    } else if (surface === 'sand') {
      burst({ f: rnd(1200, 1900), q: 0.5, peak: v * 0.9, attack: 0.012, decay: 0.16 })
      burst({ type: 'lowpass', f: rnd(300, 420), q: 0.5, peak: v * 0.5, attack: 0.01, decay: 0.12 })
    } else if (surface === 'snow') {
      burst({ f: rnd(2600, 3800), q: 0.4, peak: v * 0.8, attack: 0.02, decay: 0.2 })
      burst({ type: 'lowpass', f: rnd(500, 700), q: 0.6, peak: v * 0.45, attack: 0.015, decay: 0.14 })
    } else if (surface === 'rock') {
      burst({ f: rnd(900, 1500), q: 1.4, peak: v * 1.1, attack: 0.002, decay: 0.05 })
      tone({ f: rnd(140, 190), f2: rnd(90, 120), peak: v * 0.5, decay: 0.07 })
    } else if (surface === 'mud') {
      burst({ type: 'lowpass', f: rnd(260, 420), q: 1.2, peak: v * 1.5, attack: 0.012, decay: 0.2 })
      tone({ f: rnd(110, 160), f2: rnd(190, 260), peak: v * 0.4, decay: 0.1, delay: 0.02 })
    } else {
      burst({ f: rnd(2200, 3400), q: 0.7, peak: v, attack: 0.004, decay: 0.09 })
      burst({ type: 'lowpass', f: rnd(160, 260), q: 0.7, peak: v * 0.8, attack: 0.003, decay: 0.07 })
    }
  },

  jump() {
    burst({ type: 'lowpass', f: 380, q: 0.7, peak: 0.07, attack: 0.01, decay: 0.12 })
    tone({ f: 260, f2: 520, type: 'sine', peak: 0.03, decay: 0.12 })
  },

  land(surface: Surface) {
    if (surface === 'water') burst({ f: 600, f2: 1600, q: 0.8, peak: 0.2, attack: 0.01, decay: 0.3 })
    else {
      burst({ type: 'lowpass', f: 220, q: 0.7, peak: 0.16, attack: 0.003, decay: 0.12 })
      burst({ f: 2600, q: 0.7, peak: 0.07, attack: 0.003, decay: 0.1 })
    }
  },

  swing(kind: 'light' | 'heavy' | 'thrust' | 'spin', pitch = 1) {
    if (!ctx) return
    if (kind === 'light') burst({ f: 1400 * pitch, f2: 4200 * pitch, q: 2.2, peak: 0.22, attack: 0.03, decay: 0.16 })
    else if (kind === 'heavy') {
      burst({ f: 500, f2: 2600, q: 1.6, peak: 0.34, attack: 0.07, decay: 0.28 })
      tone({ f: 130, f2: 60, type: 'sine', peak: 0.18, attack: 0.01, decay: 0.3, delay: 0.1 })
    } else if (kind === 'thrust') burst({ f: 900, f2: 5200, q: 2.8, peak: 0.26, attack: 0.02, decay: 0.12 })
    else {
      for (let i = 0; i < 3; i++) burst({ f: 900 + i * 400, f2: 3800, q: 2, peak: 0.2, attack: 0.04, decay: 0.2, delay: i * 0.16 })
    }
  },

  /** Cutting through grass / foliage when the blade connects. */
  cut(vol = 0.2) {
    burst({ f: 5200, q: 0.6, peak: vol, attack: 0.002, decay: 0.12 })
    burst({ type: 'highpass', f: 3000, peak: vol * 0.6, attack: 0.002, decay: 0.2, delay: 0.02 })
  },

  /** Metallic ring: sheathing/drawing and heavy impacts. */
  shing(vol = 0.1) {
    for (const [f, m] of [[2400, 1], [3600, 0.6], [5100, 0.35], [6900, 0.2]] as const) tone({ f, peak: vol * m, attack: 0.002, decay: 0.7 })
    burst({ f: 6500, q: 1, peak: vol * 1.2, attack: 0.002, decay: 0.08 })
  },

  moo(vol: number, pan: number) {
    if (!ctx) return
    tone({ f: 110, f2: 82, type: 'sawtooth', peak: vol * 0.5, attack: 0.15, decay: 0.9, pan })
    tone({ f: 220, f2: 160, type: 'triangle', peak: vol * 0.3, attack: 0.15, decay: 0.9, pan })
  },
  neigh(vol: number, pan: number) {
    if (!ctx) return
    tone({ f: 520, f2: 1100, type: 'sawtooth', peak: vol * 0.3, attack: 0.05, decay: 0.25, pan })
    tone({ f: 1100, f2: 420, type: 'sawtooth', peak: vol * 0.3, attack: 0.02, decay: 0.55, delay: 0.28, pan })
  },
  cluck(vol: number, pan: number) {
    if (!ctx) return
    for (let i = 0; i < 3; i++) tone({ f: rnd(500, 650), f2: rnd(350, 450), type: 'square', peak: vol * 0.15, attack: 0.004, decay: 0.07, delay: i * 0.12, pan })
  },
  chirp(vol: number, pan: number) {
    this.birdSong(vol, pan)
  },
}

// Dev tool: renders a top-down map of the generated world (heights, water, falls, sites) to a PPM.
//   npx tsx scripts/hydro-debug.ts out.ppm
import { writeFileSync } from 'node:fs'
import { generateWorld, VERTS, WORLD_HALF, NO_WATER } from '../src/world/hydrology'

const t0 = performance.now()
const w = generateWorld(20261030)
console.log('generated in', Math.round(performance.now() - t0), 'ms')
console.log('river cells', w.stats.riverCells, 'falls', w.stats.falls, 'sites', w.stats.sites, 'spawn', w.spawn)
console.log('lakes', w.stats.lakes.map((l) => `(${Math.round(l.x)},${Math.round(l.z)}) area=${l.area} level=${l.level.toFixed(2)}`).join(' | '))
for (const f of w.falls) console.log('fall at', Math.round(f.pts[0]), Math.round(f.pts[2]), 'drop', f.drop.toFixed(1), 'width', f.width.toFixed(1), 'pts', f.pts.length / 3)
for (const s of w.sites) console.log('site', s.type, s.x, s.z, 'y', s.y.toFixed(1))
let hmin = 1e9, hmax = -1e9
for (const v of w.h) { hmin = Math.min(hmin, v); hmax = Math.max(hmax, v) }
console.log('height range', hmin.toFixed(1), hmax.toFixed(1))

const S = 2
const W = VERTS * S
const buf = Buffer.alloc(W * W * 3)
const put = (x: number, y: number, c: number[]) => { const i = (y * W + x) * 3; buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2] }
for (let iz = 0; iz < VERTS; iz++) for (let ix = 0; ix < VERTS; ix++) {
  const c = iz * VERTS + ix
  const hh = w.h[c]
  const sh = Math.max(0, Math.min(1, (w.h[c] - w.h[Math.max(0, c - 1)]) * 0.5 + (w.h[c] - w.h[Math.max(0, c - VERTS)]) * 0.5 + 0.5))
  let col = [60 + hh * 6 + sh * 40, 110 + hh * 5 + sh * 40, 50 + hh * 3 + sh * 30]
  if (hh > 12) col = [120 + hh * 3, 115 + hh * 3, 105 + hh * 3]
  if (w.depth[c] > 0.02) col = w.wl[c] === NO_WATER ? col : (w.flowX[c] || w.flowZ[c]) ? [90, 190, 235] : [40, 100, 190]
  col = col.map((v) => Math.max(0, Math.min(255, v)))
  for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) put(ix * S + a, iz * S + b, col)
}
const dot = (x: number, z: number, col: number[], r = 3) => {
  for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) { const px = Math.round((x + WORLD_HALF) * S) + a, py = Math.round((z + WORLD_HALF) * S) + b; if (px >= 0 && py >= 0 && px < W && py < W) put(px, py, col) }
}
for (const f of w.falls) dot(f.pts[0], f.pts[2], [255, 40, 40], 4)
for (const s of w.sites) dot(s.x, s.z, [255, 230, 40], 3)
dot(w.spawn.x, w.spawn.z, [255, 255, 255], 4)
writeFileSync(process.argv[2] ?? 'hydro.ppm', Buffer.concat([Buffer.from(`P6\n${W} ${W}\n255\n`), buf]))

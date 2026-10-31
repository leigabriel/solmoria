import { useEffect, useLayoutEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CHUNK_SIZE, QUALITY } from '../game/config'
import { playerState, useSettings } from '../game/store'
import { buildChunkSteps, disposeChunk } from './chunkBuilder'
import { dropChunkData } from './scatter'

const BUDGET_MS = 4
const CHUNKS = 16 // world is 512 units = 16 chunks of 32
const LO = -CHUNKS / 2
const HI = CHUNKS / 2 - 1

interface Job { key: string; group: THREE.Group; gen: Generator<void> }

function runToEnd(gen: Generator<void>) {
  while (!gen.next().done);
}

/** Streams terrain chunks (and everything on them) in and out around the player. */
export function World() {
  const root = useRef<THREE.Group>(null!)
  const quality = useSettings((s) => s.quality)
  const q = QUALITY[quality]
  const chunks = useRef(new Map<string, THREE.Group>())
  const queue = useRef<[number, number][]>([])
  const job = useRef<Job | null>(null)
  const lastCenter = useRef('')

  const wanted = (pcx: number, pcz: number) => {
    const list: [number, number][] = []
    for (let dx = -q.chunkRadius; dx <= q.chunkRadius; dx++)
      for (let dz = -q.chunkRadius; dz <= q.chunkRadius; dz++) { const x = pcx + dx, z = pcz + dz; if (x >= LO && x <= HI && z >= LO && z <= HI) list.push([x, z]) }
    return list.sort((a, b) => Math.hypot(a[0] - pcx, a[1] - pcz) - Math.hypot(b[0] - pcx, b[1] - pcz))
  }

  const add = (cx: number, cz: number) => {
    const key = `${cx},${cz}`
    if (chunks.current.has(key)) return
    const g = new THREE.Group()
    runToEnd(buildChunkSteps(g, cx, cz, q))
    chunks.current.set(key, g)
    root.current.add(g)
  }

  // First frame must already contain the world around the spawn.
  useLayoutEffect(() => {
    const store = chunks.current
    const pcx = Math.floor(playerState.pos.x / CHUNK_SIZE)
    const pcz = Math.floor(playerState.pos.z / CHUNK_SIZE)
    for (const [cx, cz] of wanted(pcx, pcz)) add(cx, cz)
    lastCenter.current = `${pcx},${pcz}`
    return () => {
      for (const [key, g] of store) {
        root.current?.remove(g)
        disposeChunk(g)
        const [cx, cz] = key.split(',').map(Number)
        dropChunkData(cx, cz)
      }
      store.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quality])

  useEffect(() => {
    queue.current = []
    job.current = null
  }, [quality])

  useFrame(() => {
    const pcx = Math.floor(playerState.pos.x / CHUNK_SIZE)
    const pcz = Math.floor(playerState.pos.z / CHUNK_SIZE)
    const center = `${pcx},${pcz}`
    if (center !== lastCenter.current) {
      lastCenter.current = center
      const need = wanted(pcx, pcz)
      const needKeys = new Set(need.map(([x, z]) => `${x},${z}`))
      queue.current = need.filter(([x, z]) => !chunks.current.has(`${x},${z}`) && job.current?.key !== `${x},${z}`)
      // unload chunks that fell out of range (one ring of hysteresis)
      for (const [key, g] of chunks.current) {
        if (needKeys.has(key)) continue
        const [cx, cz] = key.split(',').map(Number)
        if (Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) <= q.chunkRadius + 1) continue
        root.current.remove(g)
        disposeChunk(g)
        dropChunkData(cx, cz)
        chunks.current.delete(key)
      }
    }
    // staged building: advance the current chunk's generator until the frame budget is spent
    const t0 = performance.now()
    while (performance.now() - t0 < BUDGET_MS) {
      if (!job.current) {
        const next = queue.current.shift()
        if (!next) break
        const [cx, cz] = next
        const key = `${cx},${cz}`
        if (chunks.current.has(key)) continue
        const group = new THREE.Group()
        job.current = { key, group, gen: buildChunkSteps(group, cx, cz, q) }
      }
      if (job.current.gen.next().done) {
        chunks.current.set(job.current.key, job.current.group)
        root.current.add(job.current.group)
        job.current = null
      }
    }
  })

  return <group ref={root} />
}

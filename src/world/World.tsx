import { useEffect, useLayoutEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CHUNK_SIZE, QUALITY } from '../game/config'
import { playerState, useSettings } from '../game/store'
import { buildChunk, disposeChunk } from './chunkBuilder'
import { dropChunkData } from './scatter'

const MAX_BUILDS_PER_FRAME = 1

/** Streams terrain chunks (and everything on them) in and out around the player. */
export function World() {
  const root = useRef<THREE.Group>(null!)
  const quality = useSettings((s) => s.quality)
  const q = QUALITY[quality]
  const chunks = useRef(new Map<string, THREE.Group>())
  const queue = useRef<[number, number][]>([])
  const lastCenter = useRef('')

  const wanted = (pcx: number, pcz: number) => {
    const list: [number, number][] = []
    for (let dx = -q.chunkRadius; dx <= q.chunkRadius; dx++)
      for (let dz = -q.chunkRadius; dz <= q.chunkRadius; dz++) list.push([pcx + dx, pcz + dz])
    return list.sort((a, b) => Math.hypot(a[0] - pcx, a[1] - pcz) - Math.hypot(b[0] - pcx, b[1] - pcz))
  }

  const add = (cx: number, cz: number) => {
    const key = `${cx},${cz}`
    if (chunks.current.has(key)) return
    const g = buildChunk(cx, cz, q)
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
  }, [quality])

  useFrame(() => {
    const pcx = Math.floor(playerState.pos.x / CHUNK_SIZE)
    const pcz = Math.floor(playerState.pos.z / CHUNK_SIZE)
    const center = `${pcx},${pcz}`
    if (center !== lastCenter.current) {
      lastCenter.current = center
      const need = wanted(pcx, pcz)
      const needKeys = new Set(need.map(([x, z]) => `${x},${z}`))
      queue.current = need.filter(([x, z]) => !chunks.current.has(`${x},${z}`))
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
    for (let i = 0; i < MAX_BUILDS_PER_FRAME && queue.current.length; i++) {
      const [cx, cz] = queue.current.shift()!
      add(cx, cz)
    }
  })

  return <group ref={root} />
}

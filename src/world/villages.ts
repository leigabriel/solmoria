import { world, type Site } from './terrainData'

const NAMES = ['Hollowbrook', 'Thistledown', 'Mirewick', 'Emberfall', 'Larkspur', 'Brindlemoor', 'Willowmere', 'Dunmallow', 'Fernhollow', 'Pebblebrook']

export interface Village {
  name: string
  site: Site
}

/** Every village in the world with a stable name. */
export const villages: Village[] = world.sites.filter((s) => s.type === 'village').map((site, i) => ({ site, name: NAMES[(i * 3 + 1) % NAMES.length] }))

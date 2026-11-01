import { B } from './biomes'
import { biomeAt, world, type Site } from './terrainData'

/** One name per biome style, so the map reads like a travel guide. */
const NAMES: Record<number, string[]> = {
  [B.Grass]: ['Hollowbrook', 'Larkspur'],
  [B.Forest]: ['Thistledown', 'Fernhollow'],
  [B.Desert]: ['Dunmallow', 'Sunbaked Rest'],
  [B.Snow]: ['Frostbrook', 'Hearthwick'],
  [B.Tropical]: ['Palmshore', 'Sunsway Landing'],
  [B.Swamp]: ['Mirewick', 'Lanternmire'],
  [B.Mountain]: ['Skyhold', 'Stonecrest'],
  [B.Magical]: ['Moonbloom', 'Glimmerfen'],
}
const KIND: Record<number, string> = {
  [B.Grass]: 'meadow village',
  [B.Forest]: 'logging village',
  [B.Desert]: 'desert oasis town',
  [B.Snow]: 'snow village',
  [B.Tropical]: 'island village',
  [B.Swamp]: 'stilt village',
  [B.Mountain]: 'mountain hold',
  [B.Magical]: 'crystal village',
}

export interface Village {
  name: string
  kind: string
  biome: number
  site: Site
}

/** Every village in the world with a stable, biome-flavoured name. */
export const villages: Village[] = world.sites
  .filter((s) => s.type === 'village')
  .map((site, i) => {
    const biome = biomeAt(site.x, site.z)
    const names = NAMES[biome] ?? NAMES[B.Grass]
    return { name: names[i % names.length], kind: KIND[biome] ?? 'village', biome, site }
  })

/** The spawn camp (tent, fire and hero statue). */
export const camp: Site | undefined = world.sites.find((s) => s.type === 'camp')

import { B } from '../world/biomes'

export const GAME_TITLE = 'Legend of Lhei'
export const GAME_TAGLINE = 'Mend the Sunseed. Bring back the dawn.'

/** Opening pages shown on the title screen. */
export const PROLOGUE: string[] = [
  'Long ago, a tree of living light called the Sunseed grew at the heart of Solmoria. Its warmth fed ten realms: meadow and wood, dune and snow, island, mire, ember, peak, cavern and dream.',
  'Then came the Hollow Night. It split the Sunseed into ten shards and scattered them across the land, and the colours of Solmoria began to fade.',
  'You are Lhei, a small samurai in a straw hat, carrying a katana older than memory. The song of the falls woke you in the meadow. Walk the realms, find the shards, and mend the Sunseed before the last colour is gone.',
]

export interface Realm {
  biome: number
  chapter: number
  realm: string
  shard: string
  lore: string
  hint: string
}

/** The ten chapters, in the order the elders suggest walking them. Discovery is tracked per biome. */
export const REALMS: Realm[] = [
  { biome: B.Grass, chapter: 1, realm: 'Dawnmeadow', shard: 'Shard of Dawn', lore: 'Where Lhei woke. The grass still remembers the Sunseed, and the villagers hold what little is left of the old stories.', hint: 'Home. Talk to the villagers and follow the rivers.' },
  { biome: B.Forest, chapter: 2, realm: 'Whisperwood', shard: 'Heartwood Shard', lore: 'The trees here whisper the old songs. Something dark has been slipping between the trunks at night.', hint: 'Dense woods to the west and north-east.' },
  { biome: B.Tropical, chapter: 3, realm: 'Sunsway Isles', shard: 'Tide Shard', lore: 'Palms and warm shallows. The tide folk say the shard sleeps where the sea draws its breath.', hint: 'Follow the rivers south to the warm coast.' },
  { biome: B.Swamp, chapter: 4, realm: 'Mirewick', shard: 'Mire Shard', lore: 'A slow, fogged land of ponds and fireflies. Lights here lead travellers astray, but one of them is honest.', hint: 'Low, wet ground near the great lakes.' },
  { biome: B.Desert, chapter: 5, realm: 'Emberglass Dunes', shard: 'Sand Shard', lore: 'Golden dunes baked by a sun that is slightly too bright. The shard hums beneath the cacti.', hint: 'Cross the east, past the last green.' },
  { biome: B.Mountain, chapter: 6, realm: 'Skyspine Peaks', shard: 'Wind Shard', lore: 'Ridges so tall the clouds rest on them. The shard rides the wind along the highest stone.', hint: 'The grey heights at the western and eastern rims.' },
  { biome: B.Snow, chapter: 7, realm: 'Frostveil', shard: 'Frost Shard', lore: 'An endless white hush. Even the Hollow Night walks softly here, and the deer glow faintly blue.', hint: 'Travel north until the ground turns white.' },
  { biome: B.Volcanic, chapter: 8, realm: 'Cinderheart', shard: 'Flame Shard', lore: 'A volcano that never sleeps, ringed by black glass and rivers of fire. Do not step in the lava.', hint: 'North-east, where the sky glows red.' },
  { biome: B.Cave, chapter: 9, realm: 'Hollowdeep', shard: 'Deep Shard', lore: 'Sunken caverns of crystal and glowing mushrooms. The Hollow Night is thickest here, and quietest.', hint: 'Sunken bowls in the snowy north. Look for the ramps.' },
  { biome: B.Magical, chapter: 10, realm: 'Moonbloom Grove', shard: 'Dream Shard', lore: 'A grove of glowing trees where the Hollow Gate waits. Only a Lhei carrying nine shards may open it.', hint: 'The enchanted grove in the far west.' },
]

export const REALM_BY_BIOME = new Map(REALMS.map((r) => [r.biome, r]))

export const HERO = {
  name: 'Lhei',
  title: 'Wandering Samurai',
  level: 1,
  exp: 0,
  nextExp: 100,
  mp: 24,
  maxMp: 24,
  stats: { Strength: 9, Defense: 6, Skill: 8, Speed: 9, Luck: 5 },
  weapon: 'Old Katana',
  armor: 'Straw Kasa',
}

/** Villager talk, by role: mixes small-town chatter with the story. */
export const VILLAGER_LINES = {
  farmer: ['The grass is tall this year. Greener than the north, mind you.', 'Mind the cows, they wander.', 'Colours are fading at the edges, did you notice?'],
  elder: ['The Sunseed broke into ten shards, wanderer.', 'Start in Whisperwood, then follow the rivers.', 'Falls to the west sing at night. They woke you, did they not?'],
  merchant: ['Fine wares, fair prices! Nothing in stock just yet.', 'Heard a shard glints in the desert. Bring me one and I will weep with joy.', 'Come back with coin.'],
  child: ['Wow, a real sword! Are you the hero?', 'I saw a glowing deer in the snow, I swear!', 'Can you chase the chickens?'],
  guard: ['All quiet in the village. Beyond the fence, less so.', 'Beasts roam where the Hollow Night touches.', 'Keep that blade sheathed indoors.'],
}

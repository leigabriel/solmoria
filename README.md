# Legend of Lhei

A stylised 3D exploration game for the browser, built with React, Three.js and React Three Fiber.
Visual and gameplay reference: a painterly forest clearing seen from a high-angle follow camera.

**Status:** Phase 1 – Exploration Foundation (no combat, no RPG systems yet).

## Run

```bash
npm install
npm run dev        # http://localhost:5173  (add ?debug for an FPS counter)
npm run build      # type-check + production build
```

## Controls

| Input | Action |
|---|---|
| `W A S D` / arrow keys | Move (screen-relative) |
| `Shift` | Walk |
| Touch + drag (left side of screen) | Dynamic joystick, light push walks, full push runs |

Quality (low / medium / high) is in the top-right corner and is remembered between visits. Menu > Settings also has a Pixel art switch (off / fine / chunky): low internal resolution scaled up with nearest-neighbour, blocky terrain texture and a dithered limited palette. `?pixel=fine` forces it from the URL.

## Structure

```
src/
  game/         Canvas, config (camera, light, quality tiers), shared state
  world/        Seeded heightfield, chunk streaming, scatter + collision data, chunk builder
  vegetation/   (reserved) – grass/trees/rocks currently live in world/chunkBuilder + shaders
  shaders/      Terrain / grass / foliage materials (painterly palette, wind, player push, stipple)
  player/       Procedural hooded character + animation, controller, follow camera
  input/        Keyboard + floating touch joystick
  atmosphere/   Lighting + shadows, god rays, pollen, post-processing
  ui/           HUD (hint, quality switch, FPS)
docs/           Roadmap and asset attribution
public/models   Drop GLB characters / props here
```

## Notes

- Worlds are deterministic from `WORLD_SEED` in `src/game/config.ts`.
- `three` is pinned to 0.186 because `postprocessing` does not support 0.187 yet.
- See `docs/ROADMAP.md` for the phase plan and `docs/ATTRIBUTION.md` for asset credits.

## World (v1.1)
- Finite 512x512 world generated at startup from a hydrology simulation: rivers follow drainage, lakes sit in real basins, waterfalls form where rivers drop over the escarpment.
- Ruins, cottages, stone circles, shrines and archways are placed on flattened dry ground; many are broken.
- Chunks stream in staged steps with a per-frame time budget; props merge into one mesh per chunk; adaptive resolution targets 60 fps.

## Controls
| Input | Action |
| --- | --- |
| WASD / arrows, Shift | move, walk |
| Left click / J | light slash, click again to chain a 3-hit combo |
| Right click / K | heavy overhead slam |
| Space / E | dash thrust |
| Q / R | spin slash |
| Touch | left thumb moves, right-side buttons attack |

The blade swings toward the mouse pointer. Animals scatter when struck near or run at.

## Villages and villagers
Eight villages are placed on flat dry ground across the map (plaza, well, market stalls, windmill, mushroom houses, thatched cottages, tower houses, hobbit holes). Farmers, elders, merchants, children and guards wander inside them; walk up to one to see a line of dialogue. Press `M` for the world map, `Space` to jump.

## Story and UI

*Legend of Lhei* is set in the land of Solmoria. The Sunseed, a tree of living light, was split into ten shards by the Hollow Night; Lhei, a small samurai, must walk the ten realms (one per biome) and mend it. The full story is in `docs/STORY.md`, the data in `src/story/story.ts`.

- Title screen and three-page prologue on launch (skipped with `?debug`).
- Menu (top right) has Status, Journal and Settings tabs. The Journal tracks realms discovered; entering a new biome shows a "New realm discovered" banner.
- Parchment UI kit in `src/ui/rpg.tsx` (panels, name plates, stat rows, bars, icons) with styles in `src/styles.css`; the villager dialogue, bag, menu and map share it.
- Swimming: in deep water the hero swims (front crawl, floating at the surface) and leaves ripple rings, a foam V-wake and splash droplets (`src/player/SwimFX.tsx`).

## Biomes

Ten biomes are laid out by `src/world/biomeGen.ts` (warped nearest-anchor map, then terrain shaping) and described by data in `src/world/biomes.ts`:

| Biome | Where | Notes |
| --- | --- | --- |
| Grassland | around the spawn | meadows, flowers, mixed trees |
| Forest | west / north-east | dense mixed woodland |
| Desert | east | dunes, cacti, sandstone, dry shrubs |
| Snow | north | snow pines, frost shrubs, falling snow |
| Tropical | south | palms, mangroves, lush ferns, bright flowers |
| Swamp | south-west / south-east | flattened ground, little ponds, willows, fireflies |
| Volcanic | north-east | volcano cone with a lava crater, lava streams and pools, charred trees, embers |
| Mountain | west rim and high ground | ridged peaks with snow caps |
| Cavern | two sunken caves in the north | open-roof bowl with a ramp, glowing mushrooms and crystals |
| Enchanted | west | glowing trees, crystals, sparkles |

Each biome sets its own ground palette (blended softly in the terrain shader from a coarse biome texture), grass colour and density, props, sky / fog / light colours, floating particles, wind and bird ambience, and footstep sound. Lava is solid: the player cannot walk into it. The biome name appears briefly when you enter a new one, and the map legend lists them all.

The cavern is an open-roof sunken bowl: the terrain is a heightfield, so it cannot hold a true ceiling under the high camera.

## Villages and the spawn camp

There are eight villages, one per biome, each with its own look (`src/world/structures.ts`):

Each biome is a different Middle-earth-style culture with its own layout, houses, centrepiece, walls and gates (research notes: Tolkien's Shire, Rohan, Gondor, Lake-town, Dwarf-holds and the Elven realms as drawn in the books and Peter Jackson's films):

| Biome | Culture | Layout | Houses | Centre | Wall and gates |
| --- | --- | --- | --- | --- | --- |
| Grassland | The Shire | ring road round a plaza, mill on the edge | hobbit-holes with round coloured doors and white garden fences, thatched farmhouses | the Party Tree with string lanterns | picket fence |
| Forest | Rohan | palisaded hill-town, long avenue, broad steps up to a terrace | golden-thatched timber halls with crossed horse-head gables, Meduseld on the terrace | standard with a gold sun and green banner | log stockade with log watch-posts, horse-head gate |
| Desert | Harad | round bazaar | red-and-gold tiered pavilions and sandstone houses | oasis with palms | adobe wall, ivory tusk-arch gates, red banners |
| Snow | Gondor | ring of white-stone houses | white stone, dark slate roofs, arched doors, tall windows | the White Tree on a stepped terrace with a basin | white ramparts with merlons and buttresses, towered arch gates |
| Tropical | Lake-town | plank street on piles through an oval stockade | tall pile-dwellings with jettied upper floors, nets, rowing boats; a grand house at one end | harbour market with lantern post | rope rails, pile gates |
| Swamp | marsh-folk | huts scattered and joined by plank boardwalks | crooked stilt shacks with pale marsh-lights | mossy well | broken reed fence |
| Mountain | Dwarf-hold | fortress with a long avenue | massive squared stone halls, glowing forge doors, rune bands, keeps | rune-lit brazier column | stone bastion wall, square corner towers, great gate with rune lintel |
| Enchanted | Elven realm | hexagon with ring road and six spokes | white colonnaded pavilions with copper-green roofs, mallorn flets with rope ladders | white fountain with a golden bowl | golden leaf-hedge, leaf-arch gates, mallorn groves |

Plazas, pools and bases are 32-sided discs and roads are continuous overlapping slabs (no stepping stones, no 8-sided blobs). Walls are short segments that follow the ground, with gates (posts, lintel and lantern). Villagers keep to the village's own walls, only choose spots they can stand on, and turn to face you when you come close.

The hero starts at the camp near the centre of the map: a canvas tent, a fire ring with animated flames and light, log seats, a statue of the hero holding a glowing shard, lantern posts and a signpost. It is marked on both maps.

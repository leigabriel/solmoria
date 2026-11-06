# Legend of Lhei

A stylised 3D action-exploration RPG for the browser. You play Lhei, a small samurai, walking ten realms to mend a shattered tree of light. Built with React 19, Three.js 0.186, React Three Fiber, Vite and TypeScript. (The repository is still named `solmoria`, after the land the story is set in.)

## Highlights

- **A generated world.** A 512 x 512 map is built at startup from a seeded hydrology simulation: rivers follow drainage, lakes sit in real basins and waterfalls form where rivers drop over the escarpment. The world streams in chunks around the player.
- **Ten biomes** with their own ground palette, plants, weather, light, sound and wildlife.
- **Eight villages, one per culture.** Each is styled after a Middle-earth people: the Shire, Rohan, Harad, Gondor, Lake-town, marsh-folk, a Dwarf-hold and an Elven realm.
- **Katana combat**, dash, spin slash, swimming with a water trail, animals that scatter, wandering villagers who talk to you.
- **Story and parchment UI:** title screen, prologue, journal, bag, minimap and world map.
- **Pixel-art mode** (off / fine / chunky) and low / medium / high quality tiers, with adaptive resolution aiming for 60 fps.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
npm run preview    # serve the production build
```

Useful URL flags: `?debug` (FPS counter, skips the intro), `?pixel=off|fine|chunky`, `?quality=low|medium|high`.

## Controls

| Input | Action |
| --- | --- |
| `W A S D` / arrow keys | Move (screen-relative) |
| `Shift` | Walk |
| Left click / `J` | Light slash; click again to chain a 3-hit combo |
| Right click / `K` | Heavy overhead slam |
| `Space` / `E` | Dash thrust |
| `Q` / `R` | Spin slash |
| Touch | Left thumb is a dynamic joystick (light push walks, full push runs); right-side buttons attack |

The blade swings toward the mouse pointer. Quality and Pixel art are in the menu (top right) under Settings and are remembered between visits.

## Story and UI

*Legend of Lhei* is set in the land of Solmoria. The Sunseed, a tree of living light, was split into ten shards by the Hollow Night; Lhei must walk the ten realms (one per biome) and mend it. The full story is in `docs/STORY.md`, the data in `src/story/story.ts`.

- Title screen and three-page prologue on launch (skipped with `?debug`).
- Menu with Status, Journal and Settings tabs. The Journal tracks realms discovered; entering a new biome shows a "New realm discovered" banner.
- Parchment UI kit in `src/ui/rpg.tsx` (panels, name plates, stat rows, bars, icons), styled in `src/styles.css` and shared by dialogue, bag, menu and map.
- Swimming: in deep water the hero swims and leaves ripple rings, a foam wake and splash droplets (`src/player/SwimFX.tsx`).

## Biomes

Laid out by `src/world/biomeGen.ts` (warped nearest-anchor map, then terrain shaping) and described by data in `src/world/biomes.ts`. The terrain shader blends each biome's ground palette from a coarse biome texture.

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

The cavern is an open-roof sunken bowl: the terrain is a heightfield, so it cannot hold a true ceiling under the high camera.

## Villages and the spawn camp

Each village biome is a different Middle-earth-style culture with its own layout, houses, centrepiece, walls and gates (`src/world/structures.ts`). The designs follow Tolkien's Shire, Rohan, Gondor, Lake-town, Dwarf-holds and the Elven realms as drawn in the books and the films.

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


## Pixel-art mode

Menu > Settings > Pixel art renders at a fixed low internal resolution scaled up with nearest-neighbour, snaps the terrain texture to blocks and adds a dithered, limited-palette pass. `fine` is about 400 lines tall, `chunky` about 240.

## Structure

```
src/
  game/         Canvas, config (camera, light, quality tiers), settings store, adaptive resolution
  world/        Hydrology, biomes, chunk streaming, structures and villages, chunk builder
  vegetation/   Trees, bushes, grass and flower data
  shaders/      Terrain / grass / foliage materials (biome palette, wind, player push, pixel snap)
  player/       Hero model, animation, controller, follow camera, swim effects
  combat/       Katana combat state, hits and effects
  animals/      Animals and villagers (wander AI, dialogue)
  audio/        Music, ambience and sound effects
  input/        Keyboard + floating touch joystick
  atmosphere/   Lighting, shadows, god rays, pollen, bloom and pixel post-processing
  story/        Story data
  ui/           HUD, menu, journal, bag, maps, title screen, parchment UI kit
docs/           Story, roadmap and asset attribution
public/models   Drop GLB characters / props here
```

## Notes

- The world is deterministic from `WORLD_SEED` in `src/game/config.ts`.
- `three` is pinned to 0.186 because `postprocessing` does not support 0.187 yet.
- See `docs/ROADMAP.md` for the phase plan and `docs/ATTRIBUTION.md` for asset credits.

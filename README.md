# Solmoria

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

Quality (low / medium / high) is in the top-right corner and is remembered between visits.

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

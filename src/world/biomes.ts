/** Shared biome definitions (pure data, no three.js) used by world generation, shaders, scatter, audio and UI. */
export const B = { Grass: 0, Forest: 1, Desert: 2, Snow: 3, Tropical: 4, Swamp: 5, Volcanic: 6, Mountain: 7, Cave: 8, Magical: 9 } as const
export const BIOME_COUNT = 10

type RGB = [number, number, number]

export interface BiomeDef {
  id: number
  name: string
  /** four posterised ground bands, dark -> light */
  bands: [RGB, RGB, RGB, RGB]
  dirt: RGB
  shore: RGB
  rock: RGB
  /** flat colour for the maps */
  map: RGB
  atmo: { sky: string; fog: string; near: number; far: number; hemiSky: string; hemiGround: string; hemi: number; sun: string; sunI: number }
  grass: { density: number; hsl: [number, number, number]; height: number }
  /** footstep sound */
  surface: 'grass' | 'sand' | 'snow' | 'rock' | 'mud'
  particle: { kind: 'pollen' | 'dust' | 'snow' | 'firefly' | 'ember' | 'spore' | 'sparkle'; color: [number, number, number]; fall: number; size: number }
  /** ambience: wind level 0..1, bird level 0..1 */
  sound: { wind: number; birds: number; windPitch: number }
}

export const BIOMES: BiomeDef[] = [
  {
    id: B.Grass, name: 'Grassland',
    bands: [[0.22, 0.4, 0.13], [0.33, 0.51, 0.17], [0.45, 0.61, 0.21], [0.6, 0.7, 0.29]],
    dirt: [0.58, 0.36, 0.15], shore: [0.8, 0.7, 0.46], rock: [0.55, 0.5, 0.43], map: [0.38, 0.58, 0.25],
    atmo: { sky: '#d4e6b4', fog: '#d4e6b4', near: 40, far: 100, hemiSky: '#e7f3c8', hemiGround: '#58702a', hemi: 1.55, sun: '#fff1cf', sunI: 2.5 },
    grass: { density: 1, hsl: [0.235, 0.5, 0.3], height: 1 }, surface: 'grass',
    particle: { kind: 'pollen', color: [1.4, 1.3, 0.7], fall: -0.05, size: 0.16 }, sound: { wind: 0.4, birds: 1, windPitch: 1 },
  },
  {
    id: B.Forest, name: 'Forest',
    bands: [[0.12, 0.28, 0.12], [0.18, 0.37, 0.14], [0.26, 0.46, 0.17], [0.38, 0.55, 0.2]],
    dirt: [0.35, 0.25, 0.14], shore: [0.62, 0.55, 0.36], rock: [0.45, 0.42, 0.36], map: [0.2, 0.42, 0.17],
    atmo: { sky: '#bcd9a0', fog: '#b6d29a', near: 32, far: 88, hemiSky: '#d8eab8', hemiGround: '#40582a', hemi: 1.35, sun: '#fff0c8', sunI: 2.1 },
    grass: { density: 0.85, hsl: [0.25, 0.5, 0.22], height: 1 }, surface: 'grass',
    particle: { kind: 'pollen', color: [1.1, 1.3, 0.6], fall: 0.04, size: 0.15 }, sound: { wind: 0.3, birds: 1.2, windPitch: 0.9 },
  },
  {
    id: B.Desert, name: 'Desert',
    bands: [[0.78, 0.62, 0.36], [0.86, 0.7, 0.42], [0.93, 0.8, 0.52], [0.97, 0.87, 0.62]],
    dirt: [0.7, 0.45, 0.25], shore: [0.9, 0.8, 0.55], rock: [0.74, 0.52, 0.34], map: [0.9, 0.78, 0.5],
    atmo: { sky: '#f0d9a8', fog: '#f0d6a0', near: 45, far: 115, hemiSky: '#fff0d0', hemiGround: '#b08850', hemi: 1.7, sun: '#ffe2b0', sunI: 2.9 },
    grass: { density: 0.1, hsl: [0.12, 0.4, 0.55], height: 0.8 }, surface: 'sand',
    particle: { kind: 'dust', color: [1.2, 1.0, 0.7], fall: 0, size: 0.14 }, sound: { wind: 0.7, birds: 0.1, windPitch: 1.5 },
  },
  {
    id: B.Snow, name: 'Snow',
    bands: [[0.72, 0.8, 0.9], [0.84, 0.9, 0.96], [0.93, 0.96, 0.99], [1, 1, 1]],
    dirt: [0.6, 0.7, 0.82], shore: [0.8, 0.9, 0.97], rock: [0.62, 0.66, 0.72], map: [0.93, 0.96, 1],
    atmo: { sky: '#dbe9f4', fog: '#dbe9f4', near: 30, far: 85, hemiSky: '#e8f2ff', hemiGround: '#8aa0b8', hemi: 1.8, sun: '#ffffff', sunI: 2.3 },
    grass: { density: 0.16, hsl: [0.55, 0.25, 0.78], height: 0.8 }, surface: 'snow',
    particle: { kind: 'snow', color: [1.6, 1.7, 1.8], fall: 1.1, size: 0.17 }, sound: { wind: 0.8, birds: 0, windPitch: 1.2 },
  },
  {
    id: B.Tropical, name: 'Tropical',
    bands: [[0.1, 0.45, 0.2], [0.15, 0.58, 0.25], [0.25, 0.7, 0.3], [0.45, 0.8, 0.35]],
    dirt: [0.8, 0.65, 0.4], shore: [0.92, 0.85, 0.6], rock: [0.45, 0.45, 0.42], map: [0.2, 0.68, 0.32],
    atmo: { sky: '#bfeede', fog: '#bfeadb', near: 45, far: 115, hemiSky: '#e0fff0', hemiGround: '#3a8a50', hemi: 1.7, sun: '#fff8d8', sunI: 2.7 },
    grass: { density: 1.1, hsl: [0.3, 0.65, 0.32], height: 1.3 }, surface: 'grass',
    particle: { kind: 'pollen', color: [1.5, 0.9, 0.9], fall: -0.04, size: 0.17 }, sound: { wind: 0.25, birds: 1.8, windPitch: 0.9 },
  },
  {
    id: B.Swamp, name: 'Swamp',
    bands: [[0.12, 0.2, 0.1], [0.18, 0.27, 0.12], [0.26, 0.34, 0.14], [0.35, 0.42, 0.18]],
    dirt: [0.25, 0.18, 0.1], shore: [0.3, 0.25, 0.15], rock: [0.3, 0.3, 0.26], map: [0.22, 0.3, 0.14],
    atmo: { sky: '#a9b98a', fog: '#8d9e72', near: 22, far: 62, hemiSky: '#cbd6a8', hemiGround: '#3c4a22', hemi: 1.2, sun: '#e8e2b0', sunI: 1.7 },
    grass: { density: 0.9, hsl: [0.2, 0.4, 0.2], height: 1.1 }, surface: 'mud',
    particle: { kind: 'firefly', color: [0.9, 1.7, 0.5], fall: 0, size: 0.2 }, sound: { wind: 0.15, birds: 0.3, windPitch: 0.7 },
  },
  {
    id: B.Volcanic, name: 'Volcanic',
    bands: [[0.09, 0.08, 0.09], [0.15, 0.12, 0.12], [0.22, 0.17, 0.15], [0.32, 0.22, 0.17]],
    dirt: [0.4, 0.12, 0.06], shore: [0.12, 0.1, 0.1], rock: [0.12, 0.1, 0.1], map: [0.2, 0.14, 0.14],
    atmo: { sky: '#6a4338', fog: '#5a3a30', near: 28, far: 80, hemiSky: '#ffb48a', hemiGround: '#2a1410', hemi: 1.2, sun: '#ffb070', sunI: 2.0 },
    grass: { density: 0, hsl: [0.05, 0.3, 0.15], height: 0.6 }, surface: 'rock',
    particle: { kind: 'ember', color: [2.0, 0.9, 0.3], fall: -1.0, size: 0.14 }, sound: { wind: 0.5, birds: 0, windPitch: 0.6 },
  },
  {
    id: B.Mountain, name: 'Mountain',
    bands: [[0.36, 0.4, 0.3], [0.45, 0.47, 0.38], [0.55, 0.55, 0.48], [0.65, 0.64, 0.58]],
    dirt: [0.5, 0.45, 0.4], shore: [0.7, 0.68, 0.6], rock: [0.5, 0.5, 0.52], map: [0.55, 0.55, 0.52],
    atmo: { sky: '#c7d6e0', fog: '#c3d2de', near: 35, far: 95, hemiSky: '#e0eaf2', hemiGround: '#5c6670', hemi: 1.5, sun: '#fff6e0', sunI: 2.5 },
    grass: { density: 0.35, hsl: [0.2, 0.25, 0.38], height: 0.8 }, surface: 'rock',
    particle: { kind: 'dust', color: [1.3, 1.3, 1.3], fall: 0.05, size: 0.12 }, sound: { wind: 1, birds: 0.2, windPitch: 1.1 },
  },
  {
    id: B.Cave, name: 'Cavern',
    bands: [[0.2, 0.22, 0.34], [0.27, 0.3, 0.44], [0.35, 0.38, 0.54], [0.45, 0.48, 0.64]],
    dirt: [0.18, 0.14, 0.25], shore: [0.25, 0.27, 0.35], rock: [0.2, 0.2, 0.28], map: [0.18, 0.2, 0.32],
    atmo: { sky: '#232a45', fog: '#1e2440', near: 22, far: 70, hemiSky: '#9aa8e8', hemiGround: '#3a4468', hemi: 1.7, sun: '#a9b8ff', sunI: 1.1 },
    grass: { density: 0, hsl: [0.6, 0.3, 0.2], height: 0.6 }, surface: 'rock',
    particle: { kind: 'spore', color: [0.5, 1.4, 1.8], fall: 0.02, size: 0.15 }, sound: { wind: 0.05, birds: 0, windPitch: 0.5 },
  },
  {
    id: B.Magical, name: 'Enchanted',
    bands: [[0.2, 0.18, 0.42], [0.26, 0.34, 0.5], [0.34, 0.5, 0.55], [0.5, 0.68, 0.65]],
    dirt: [0.4, 0.25, 0.5], shore: [0.7, 0.65, 0.85], rock: [0.4, 0.38, 0.55], map: [0.45, 0.4, 0.75],
    atmo: { sky: '#c9b6f0', fog: '#b9a2e6', near: 30, far: 85, hemiSky: '#d8c8ff', hemiGround: '#2a4a6a', hemi: 1.5, sun: '#ffe0ff', sunI: 2.2 },
    grass: { density: 1, hsl: [0.52, 0.5, 0.45], height: 1.15 }, surface: 'grass',
    particle: { kind: 'sparkle', color: [1.6, 1.0, 1.7], fall: -0.18, size: 0.2 }, sound: { wind: 0.3, birds: 0.4, windPitch: 0.8 },
  },
]

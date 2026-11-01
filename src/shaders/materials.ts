import * as THREE from 'three'
import { createNoiseTexture } from '../utils/noiseTexture'
import { BIOMES, BIOME_COUNT } from '../world/biomes'

/** Uniforms shared by every custom material (updated once per frame). */
export const sharedUniforms = {
  uTime: { value: 0 },
  uPlayer: { value: new THREE.Vector3() },
  uWindDir: { value: new THREE.Vector2(0.8, 0.6).normalize() },
  uNoise: { value: createNoiseTexture() },
  uPxPerUnit: { value: 600 },
  /** pixel-art mode: terrain texture cells per world unit (0 = smooth) */
  uPix: { value: 0 },
  /** coarse biome-id map (1 texel = BIOME_CELL world units), set by assets.ts once the world exists */
  uBiomeTex: { value: new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat) },
  uBiomeN: { value: 1 },
}

/** palette rows per biome: 4 ground bands, dirt, shore, rock */
export const BIOME_PALETTE = BIOMES.flatMap((b) => [...b.bands, b.dirt, b.shore, b.rock].map((c) => new THREE.Vector3(c[0], c[1], c[2])))
export const BIOME_CELL = 4


const DECL = /* glsl */ `
uniform float uTime;
uniform vec2 uWindDir;
uniform vec3 uPlayer;
uniform sampler2D uNoise;
float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
// one texture fetch replaces a 4-octave procedural fbm. 1 texture repeat = 64 world units.
float nR(vec2 uv){ return texture2D(uNoise, uv).r; }
float nG(vec2 uv){ return texture2D(uNoise, uv).g; }
float nB(vec2 uv){ return texture2D(uNoise, uv).b; }
float nA(vec2 uv){ return texture2D(uNoise, uv).a; }
float cloudShadow(vec2 xz){
  vec2 q = xz * (0.55 / 64.0) + uWindDir * uTime * 0.0025;
  return smoothstep(0.48, 0.72, nB(q));
}
vec3 toLinear(vec3 c){ return pow(c, vec3(2.2)); }
`

type Shader = THREE.WebGLProgramParametersWithUniforms

function bind(shader: Shader) {
  shader.uniforms.uTime = sharedUniforms.uTime
  shader.uniforms.uWindDir = sharedUniforms.uWindDir
  shader.uniforms.uPlayer = sharedUniforms.uPlayer
  shader.uniforms.uNoise = sharedUniforms.uNoise
  shader.uniforms.uPxPerUnit = sharedUniforms.uPxPerUnit
}

const PAL_ROWS = 7

// ---------------------------------------------------------------------------------------------
// Terrain: posterised painterly greens + hollows + dirt, sand at the shore, rock on steep faces,
// baked contact shadows (aAO) under props.
// ---------------------------------------------------------------------------------------------
export function createTerrainMaterial() {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff })
  m.customProgramCacheKey = () => 'solmoria-terrain-4'
  m.onBeforeCompile = (shader) => {
    bind(shader)
    shader.uniforms.uBiomeTex = sharedUniforms.uBiomeTex
    shader.uniforms.uBiomeN = sharedUniforms.uBiomeN
    shader.uniforms.uPix = sharedUniforms.uPix
    shader.uniforms.uPal = { value: BIOME_PALETTE }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aShore;\nattribute float aAO;\nvarying float vShore;\nvarying float vAO;\nvarying vec3 vWPos;\nvarying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvShore = aShore; vAO = aAO; vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normal;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${DECL}\nvarying float vShore;\nvarying float vAO;\nvarying vec3 vWPos;\nvarying vec3 vWN;\nuniform sampler2D uBiomeTex;\nuniform float uBiomeN;\nuniform float uPix;\nuniform vec3 uPal[${BIOME_COUNT * PAL_ROWS}];`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
#include <color_fragment>
{
  vec2 p = vWPos.xz;
  if (uPix > 0.5) p = (floor(p * uPix) + 0.5) / uPix;
  vec2 uv = p * (1.0 / 64.0);
  float wp = nB(uv * 1.7 + 0.31);
  float n1 = nR(uv + (wp - 0.5) * 0.2);
  float n2 = nG(uv * 2.3 + 0.17);
  float stipple = (hash21(floor(p * 7.0)) - 0.5) * 0.035;
  float band = n1 * 0.72 + n2 * 0.28 + stipple;

  // biome blend: 4 coarse texels, edges ragged by noise and softened by smoothstep
  vec2 bp = (p + (vec2(nR(uv * 3.1 + 0.2), nG(uv * 3.1 + 0.7)) - 0.5) * 7.0 + ${512 / 2}.0) * (1.0 / ${BIOME_CELL}.0) - 0.5;
  vec2 bi = floor(bp);
  vec2 bt = fract(bp);
  bt = bt * bt * (3.0 - 2.0 * bt);
  vec4 bw = vec4((1.0 - bt.x) * (1.0 - bt.y), bt.x * (1.0 - bt.y), (1.0 - bt.x) * bt.y, bt.x * bt.y);
  vec3 c0 = vec3(0.0), c1 = vec3(0.0), c2 = vec3(0.0), c3 = vec3(0.0), dirtC = vec3(0.0), shoreC = vec3(0.0), rockB = vec3(0.0);
  float bSnowW = 0.0;
  for (int k = 0; k < 4; k++) {
    vec2 o = vec2(float(k - (k / 2) * 2), float(k / 2));
    float id = floor(texture2D(uBiomeTex, (clamp(bi + o, 0.0, uBiomeN - 1.0) + 0.5) / uBiomeN).r * 255.0 + 0.5);
    float wk = bw[k];
    int r = int(id) * ${PAL_ROWS};
    c0 += uPal[r] * wk; c1 += uPal[r + 1] * wk; c2 += uPal[r + 2] * wk; c3 += uPal[r + 3] * wk;
    dirtC += uPal[r + 4] * wk; shoreC += uPal[r + 5] * wk; rockB += uPal[r + 6] * wk;
    bSnowW += step(2.5, id) * step(id, 3.5) * wk;
  }
  vec3 col = c0;
  col = mix(col, c1, smoothstep(0.34, 0.365, band));
  col = mix(col, c2, smoothstep(0.46, 0.485, band));
  col = mix(col, c3, smoothstep(0.62, 0.645, band));

  float hol = 1.0 - smoothstep(0.30, 0.42, nB(uv * 0.9 + 0.6));
  col *= mix(1.0, 0.62, hol);
  float dirt = smoothstep(0.70, 0.74, nA(uv * 2.9 + 0.4));
  col = mix(col, dirtC, dirt * 0.85);

  // shoreline: sand + wet band, murky bed under water
  float sandAmt = smoothstep(0.38, 0.78, vShore + (n2 - 0.5) * 0.35);
  col = mix(col, shoreC, sandAmt);
  col *= 1.0 - 0.22 * smoothstep(0.85, 1.0, vShore);
  col = mix(col, vec3(0.42, 0.40, 0.30), smoothstep(0.995, 1.0, vShore) * 0.7);

  // steep faces (cliffs, banks) turn to rock
  float rk = smoothstep(0.82, 0.60, vWN.y);
  vec3 rockc = mix(rockB * 0.92, rockB * 1.16, n2);
  rockc = mix(rockc, rockB * 0.7, smoothstep(0.55, 0.78, nG(uv * 5.0)));
  col = mix(col, rockc, rk);
  // snow caps on the tallest peaks, snow also clings to gentle slopes in the snow biome
  float cap = smoothstep(21.0, 24.5, vWPos.y + (n2 - 0.5) * 3.0) * (1.0 - bSnowW);
  col = mix(col, vec3(0.93, 0.95, 0.98), cap * (1.0 - 0.7 * rk));

  col *= 1.0 - 0.42 * vAO;
  col = toLinear(col);
  col *= 1.0 - 0.20 * cloudShadow(p);
  diffuseColor.rgb = col;
}
`,
      )
  }
  return m
}

// ---------------------------------------------------------------------------------------------
// Grass: instanced "|\/" spike tufts (9 single-triangle blades each), wind, push away from player.
// ---------------------------------------------------------------------------------------------
export function createGrassMaterial() {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide })
  m.customProgramCacheKey = () => 'solmoria-grass-2'
  m.onBeforeCompile = (shader) => {
    bind(shader)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${DECL}\nvarying float vH;\nvarying float vCS;`)
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
#include <begin_vertex>
{
  vH = position.y;
  vec3 base = instanceMatrix[3].xyz;
  float bend = vH * vH;
  float w = nG(base.xz * (1.3 / 64.0) + uWindDir * uTime * 0.057) * 2.0 - 1.0;
  float flutter = sin(uTime * 2.4 + base.x * 1.7 + base.z * 1.3) * 0.5;
  vec2 dp = base.xz - uPlayer.xz;
  float dl = length(dp);
  float near = smoothstep(1.5, 0.15, dl);
  vec2 push = dp / max(dl, 0.001) * near * 0.75;
  vec2 disp = uWindDir * (w * 0.5 + 0.12) + vec2(flutter * 0.06) + push;
  vec3 world = vec3(disp.x, -near * 0.28 * vH, disp.y) * bend;
  transformed += inverse(mat3(instanceMatrix)) * world;
  vCS = cloudShadow(base.xz);
}
`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vH;\nvarying float vCS;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.5, 1.15, vH) * (1.0 - 0.20 * vCS);')
      // light blades like the ground (up-facing normal) so both faces shade the same
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0));')
  }
  return m
}

// ---------------------------------------------------------------------------------------------
// Props (trees, bushes, flowers, rocks, ruins): ONE merged mesh per chunk.
//   vertex colour = base colour; aFlags.x stippled foliage, .y emissive, .z moss on up-facing stone.
// ---------------------------------------------------------------------------------------------
export function createPropMaterial() {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true })
  m.customProgramCacheKey = () => 'solmoria-props-1'
  m.onBeforeCompile = (shader) => {
    bind(shader)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${DECL}\nattribute vec3 aFlags;\nvarying vec3 vFlags;\nvarying vec3 vWPos;\nvarying vec3 vWN;`)
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
#include <begin_vertex>
vFlags = aFlags;
vWN = normal;
{
  // gentle canopy sway (foliage only); flowers lean a little in the wind
  float sway = sin(uTime * 1.1 + position.x * 0.7 + position.z * 0.5) * 0.035 * max(position.y, 0.0);
  transformed.x += sway * (aFlags.x * 1.0 + 0.0);
}
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${DECL}\nvarying vec3 vFlags;\nvarying vec3 vWPos;\nvarying vec3 vWN;`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
#include <color_fragment>
{
  vec2 uv = vWPos.xz * (1.0 / 64.0);
  if (vFlags.x > 0.5) {
    float m1 = nR(uv * 3.0 + vWPos.y * 0.02);
    float m2 = nG(uv * 9.0 + vWPos.y * 0.05);
    diffuseColor.rgb *= mix(0.70, 1.20, smoothstep(0.32, 0.72, m1)) * mix(0.90, 1.10, m2);
    diffuseColor.rgb *= 1.0 - 0.15 * cloudShadow(vWPos.xz);
  }
  if (vFlags.z > 0.5) {
    float mn = nR(uv * 5.0 + vWPos.y * 0.04);
    float up = smoothstep(0.45, 0.9, vWN.y);
    diffuseColor.rgb *= mix(0.82, 1.14, nG(uv * 14.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, toLinear(vec3(0.30, 0.45, 0.16)), up * smoothstep(0.38, 0.62, mn) * 0.85);
  }
}
`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `
#include <normal_fragment_maps>
if (vFlags.x > 0.5) {
  // dithered / stippled silhouette like the reference's foliage
  float rim = 1.0 - abs(dot(normal, normalize(vViewPosition)));
  float edge = smoothstep(0.58, 1.0, rim);
  float th = hash21(floor(gl_FragCoord.xy * 0.5)) * 0.8 + (nG(vWPos.xz * (5.0 / 64.0) + vWPos.y * 0.06) - 0.5) * 0.4;
  if (edge > th + 0.05) discard;
}
`,
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vFlags.y;')
  }
  return m
}

// ---------------------------------------------------------------------------------------------
// Water: flowing posterised ripples, shoreline foam, depth tint.
// ---------------------------------------------------------------------------------------------
export function createWaterMaterial() {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false })
  m.customProgramCacheKey = () => 'solmoria-water-3'
  m.onBeforeCompile = (shader) => {
    bind(shader)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aDepth;\nattribute vec2 aFlow;\nvarying float vDepth;\nvarying vec2 vFlow;\nvarying vec2 vWXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDepth = aDepth; vFlow = aFlow; vWXZ = (modelMatrix * vec4(transformed, 1.0)).xz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${DECL}\nvarying float vDepth;\nvarying vec2 vFlow;\nvarying vec2 vWXZ;`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
#include <color_fragment>
{
  if (vDepth <= 0.0) discard;
  float speed = length(vFlow);
  vec2 dir = speed > 0.01 ? vFlow / speed : uWindDir * 0.3;
  float sp = speed > 0.01 ? speed : 0.15;
  vec2 uv = vWXZ * (1.0 / 64.0);
  // two-phase flow-map advection: no ever-growing shear where the flow direction changes
  float ph0 = fract(uTime * 0.12);
  float ph1 = fract(uTime * 0.12 + 0.5);
  float wgt = abs(ph0 * 2.0 - 1.0);
  vec2 fv = dir * sp * 0.25;
  vec2 sA = uv * 4.0 - fv * ph0;
  vec2 sB = uv * 4.0 - fv * ph1 + 0.5;
  float r1 = mix(nG(sA), nG(sB), wgt);
  float r2 = mix(nG(sA * 1.9 + vec2(0.37, 0.11)), nG(sB * 1.9 + vec2(0.37, 0.11)), wgt);
  float rip = r1 * 0.6 + r2 * 0.4;

  float d = clamp(vDepth / 1.5, 0.0, 1.0);
  vec3 shallow = vec3(0.50, 0.80, 0.70);
  vec3 deep = vec3(0.13, 0.44, 0.55);
  vec3 col = mix(shallow, deep, smoothstep(0.0, 1.0, d));
  // posterised light/dark ripple bands
  col = mix(col, col * 1.28 + 0.05, smoothstep(0.54, 0.58, rip));
  col = mix(col, col * 0.84, smoothstep(0.40, 0.36, rip));
  // sun glints
  vec2 gc = vWXZ * 2.2;
  vec2 gid = floor(gc);
  float g = hash21(gid + floor(uTime * 1.2));
  float gd = length(fract(gc) - 0.5);
  col += vec3(0.8, 0.9, 0.8) * step(0.985, g) * smoothstep(0.22, 0.0, gd) * smoothstep(0.5, 0.6, rip);
  // shoreline foam (stippled)
  float foamN = nR(uv * 11.0 + dir * uTime * 0.01);
  float foam = smoothstep(0.26, 0.05, vDepth + (foamN - 0.5) * 0.2) * smoothstep(0.0, 0.03, vDepth);
  col = mix(col, vec3(0.93, 0.98, 0.95), foam);
  // fast water is whiter
  col = mix(col, vec3(0.9, 0.97, 0.95), smoothstep(1.3, 2.4, speed) * smoothstep(0.5, 0.65, r1) * 0.7);
  col = toLinear(col);
  col *= 1.0 - 0.15 * cloudShadow(vWXZ);
  float a = mix(0.35, 0.9, smoothstep(0.0, 0.3, vDepth));
  a = max(a, foam * 0.85);
  diffuseColor = vec4(col, a);
}
`,
      )
  }
  return m
}

// ---------------------------------------------------------------------------------------------
// Waterfall sheet: vertical streaks pouring down the ribbon.
// ---------------------------------------------------------------------------------------------
export function createFallMaterial() {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide })
  m.customProgramCacheKey = () => 'solmoria-fall-2'
  m.onBeforeCompile = (shader) => {
    bind(shader)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aUv;\nvarying vec2 vFUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFUv = aUv;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${DECL}\nvarying vec2 vFUv;`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
#include <color_fragment>
{
  float x = vFUv.x;
  float y = vFUv.y;
  // fast vertical streaks that accelerate downward, plus a faster fine layer
  float s1 = nG(vec2(x * 2.4 + 0.1, y * 0.18 + uTime * 0.9));
  float s2 = nR(vec2(x * 4.1 + 0.3, y * 0.12 + uTime * 1.5));
  float s3 = nA(vec2(x * 7.0, y * 0.3 + uTime * 2.2));
  float streak = s1 * 0.45 + s2 * 0.35 + s3 * 0.2;
  vec3 col = mix(vec3(0.62, 0.86, 0.90), vec3(0.98, 1.0, 1.0), smoothstep(0.40, 0.58, streak));
  col = mix(col, vec3(0.40, 0.70, 0.80), smoothstep(0.34, 0.26, streak) * 0.6);
  // frothy white at the lip and ragged side edges
  float froth = smoothstep(1.2, 0.0, y) * 0.8;
  col = mix(col, vec3(1.0), froth);
  col = toLinear(col);
  float ragged = (nR(vec2(y * 0.5 + uTime * 0.6, x * 3.0)) - 0.5) * 0.18;
  float edge = smoothstep(0.0, 0.12, x + ragged) * smoothstep(1.0, 0.88, x + ragged);
  float lip = smoothstep(0.0, 0.25, y);
  float a0 = mix(0.62, 0.95, smoothstep(0.38, 0.55, streak));
  diffuseColor = vec4(col, a0 * edge * lip);
}
`,
      )
  }
  return m
}

// ---------------------------------------------------------------------------------------------
// Waterfall mist: rising, fading white puffs (GPU-animated points).
// ---------------------------------------------------------------------------------------------
export function createMistMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: sharedUniforms.uTime, uPxPerUnit: sharedUniforms.uPxPerUnit },
    vertexShader: /* glsl */ `
      attribute float aPhase;
      attribute float aSize;
      uniform float uTime;
      uniform float uPxPerUnit;
      varying float vA;
      void main() {
        float t = fract(uTime * 0.22 + aPhase);
        vec3 p = position;
        p.y += t * 3.2;
        p.x += sin(uTime * 0.7 + aPhase * 20.0) * 0.4 * t;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = aSize * (0.6 + t * 1.8);
        gl_PointSize = size * uPxPerUnit / max(-mv.z, 0.1);
        vA = sin(t * 3.14159) * 0.55;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c) * 2.0;
        float a = smoothstep(1.0, 0.2, d) * vA;
        gl_FragColor = vec4(0.93, 0.98, 0.98, a);
      }`,
  })
}

// ---------------------------------------------------------------------------------------------
// Lava: unlit, slowly flowing molten crust with bright cracks (HDR so bloom picks it up).
// ---------------------------------------------------------------------------------------------
export function createLavaMaterial() {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
  m.customProgramCacheKey = () => 'solmoria-lava-1'
  m.onBeforeCompile = (shader) => {
    bind(shader)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${DECL}\nvarying vec3 vWPos;`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
#include <color_fragment>
{
  vec2 uv = vWPos.xz * (1.0 / 64.0);
  vec2 flow = vec2(0.012, 0.007) * uTime;
  float a = nR(uv * 2.0 + flow);
  float b = nG(uv * 3.7 - flow * 1.3 + 0.3);
  float n = a * 0.6 + b * 0.4;
  float crack = smoothstep(0.42, 0.5, abs(n - 0.5) * 2.0 + 0.0) ;
  vec3 crust = vec3(0.32, 0.05, 0.02);
  vec3 hot = vec3(1.35, 0.5, 0.06);
  vec3 mid = vec3(0.95, 0.2, 0.03);
  vec3 col = mix(hot, mid, smoothstep(0.35, 0.6, n));
  col = mix(col, crust, smoothstep(0.55, 0.78, n) * 0.85);
  col += vec3(0.18, 0.05, 0.0) * (0.5 + 0.5 * sin(uTime * 1.4 + a * 9.0));
  diffuseColor.rgb = col;
}
`,
      )
  }
  return m
}

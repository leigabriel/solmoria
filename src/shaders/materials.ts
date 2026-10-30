import * as THREE from 'three'

/** Uniforms shared by every custom material (one update per frame in <Uniforms/>). */
export const sharedUniforms = {
  uTime: { value: 0 },
  uPlayer: { value: new THREE.Vector3() },
  uWindDir: { value: new THREE.Vector2(0.8, 0.6).normalize() },
}

const DECL = /* glsl */ `
uniform float uTime;
uniform vec2 uWindDir;
uniform vec3 uPlayer;
`

const NOISE = /* glsl */ `
float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0)), c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++){ v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
// slow drifting cloud shadows
float cloudShadow(vec2 xz){
  vec2 q = xz * 0.03 + uWindDir * uTime * 0.025;
  return smoothstep(0.48, 0.72, fbm(q));
}
vec3 toLinear(vec3 c){ return pow(c, vec3(2.2)); }
`

type Shader = THREE.WebGLProgramParametersWithUniforms

function bind(shader: Shader) {
  shader.uniforms.uTime = sharedUniforms.uTime
  shader.uniforms.uWindDir = sharedUniforms.uWindDir
  shader.uniforms.uPlayer = sharedUniforms.uPlayer
}

/** World-space position varying, valid for instanced and non-instanced meshes. */
const VERT_WORLDPOS_DECL = 'varying vec3 vWPos;'
const VERT_WORLDPOS = /* glsl */ `
#ifdef USE_INSTANCING
  vWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif
`

// ---------------------------------------------------------------------------------------------
// Terrain: posterised, noise-warped patches of 4 greens + dark hollows + dirt, like the video.
// ---------------------------------------------------------------------------------------------
export function createTerrainMaterial() {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff })
  m.customProgramCacheKey = () => 'solmoria-terrain'
  m.onBeforeCompile = (shader) => {
    bind(shader)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_WORLDPOS_DECL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_WORLDPOS}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${DECL}\n${NOISE}\n${VERT_WORLDPOS_DECL}`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
#include <color_fragment>
{
  vec2 p = vWPos.xz;
  float warp = fbm(p * 0.16) * 2.2;
  float n1 = fbm(p * 0.20 + warp);
  float n2 = fbm(p * 0.52 + 31.7);
  float stipple = (hash21(floor(p * 7.0)) - 0.5) * 0.035;
  float band = n1 * 0.72 + n2 * 0.28 + stipple;

  vec3 c0 = vec3(0.22, 0.40, 0.13);
  vec3 c1 = vec3(0.33, 0.51, 0.17);
  vec3 c2 = vec3(0.45, 0.61, 0.21);
  vec3 c3 = vec3(0.60, 0.70, 0.29);
  vec3 col = c0;
  col = mix(col, c1, smoothstep(0.34, 0.365, band));
  col = mix(col, c2, smoothstep(0.46, 0.485, band));
  col = mix(col, c3, smoothstep(0.62, 0.645, band));

  // big dark hollows
  float hol = 1.0 - smoothstep(0.20, 0.34, fbm(p * 0.075 + 7.3));
  col *= mix(1.0, 0.60, hol);

  // small bare-earth patches
  float dirt = smoothstep(0.80, 0.83, fbm(p * 0.33 + 90.0));
  col = mix(col, vec3(0.58, 0.36, 0.15), dirt * 0.9);

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
// Grass: instanced tufts, wind sway, and bending away from the player.
// ---------------------------------------------------------------------------------------------
export function createGrassMaterial() {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide })
  m.customProgramCacheKey = () => 'solmoria-grass'
  m.onBeforeCompile = (shader) => {
    bind(shader)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${DECL}\n${NOISE}\nvarying float vH;\nvarying float vCS;`)
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
#include <begin_vertex>
{
  vH = position.y;
  vec3 base = instanceMatrix[3].xyz;
  float bend = vH * vH;
  float w = vnoise(base.xz * 0.30 + uWindDir * uTime * 0.85) * 2.0 - 1.0;
  float flutter = sin(uTime * 2.4 + base.x * 1.7 + base.z * 1.3) * 0.5;
  vec2 dp = base.xz - uPlayer.xz;
  float dl = length(dp);
  float near = smoothstep(1.5, 0.15, dl);
  vec2 push = dp / max(dl, 0.001) * near * 0.75;
  vec2 disp = uWindDir * (w * 0.32 + 0.10) + vec2(flutter * 0.05) + push;
  vec3 world = vec3(disp.x, -near * 0.28 * vH, disp.y) * bend;
  transformed += inverse(mat3(instanceMatrix)) * world;
  vCS = cloudShadow(base.xz);
}
`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vH;\nvarying float vCS;`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
#include <color_fragment>
diffuseColor.rgb *= mix(0.5, 1.15, vH) * (1.0 - 0.20 * vCS);
`,
      )
      // light blades like the ground (up-facing normal) so both faces shade the same
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>\nnormal = normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0));`,
      )
  }
  return m
}

// ---------------------------------------------------------------------------------------------
// Foliage (tree canopies + bushes): mottled colour and a dithered / stippled silhouette.
// ---------------------------------------------------------------------------------------------
export function createFoliageMaterial() {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff })
  m.customProgramCacheKey = () => 'solmoria-foliage'
  m.onBeforeCompile = (shader) => {
    bind(shader)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${DECL}\n${VERT_WORLDPOS_DECL}`)
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
#include <begin_vertex>
{
  vec3 b0 = instanceMatrix[3].xyz;
  float sway = sin(uTime * 1.1 + b0.x * 0.7 + b0.z * 0.5) * 0.035 * max(position.y, 0.0);
  transformed.x += sway;
}
${VERT_WORLDPOS}
`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${DECL}\n${NOISE}\n${VERT_WORLDPOS_DECL}`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
#include <color_fragment>
{
  float m1 = fbm(vWPos.xz * 1.5 + vWPos.y * 0.9);
  float m2 = vnoise(vWPos.xz * 6.0 + vWPos.y * 3.0);
  diffuseColor.rgb *= mix(0.70, 1.20, smoothstep(0.32, 0.72, m1)) * mix(0.90, 1.10, m2);
  diffuseColor.rgb *= 1.0 - 0.15 * cloudShadow(vWPos.xz);
}
`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `
#include <normal_fragment_maps>
{
  float rim = 1.0 - abs(dot(normal, normalize(vViewPosition)));
  float edge = smoothstep(0.58, 1.0, rim);
  float th = hash21(floor(gl_FragCoord.xy * 0.5)) * 0.8 + (vnoise(vWPos.xz * 5.0 + vWPos.y * 4.0) - 0.5) * 0.4;
  if (edge > th + 0.05) discard;
}
`,
      )
  }
  return m
}

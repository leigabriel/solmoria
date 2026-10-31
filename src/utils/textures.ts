import * as THREE from 'three'

/** Soft radial falloff (white centre -> transparent edge). Used for blob shadows and pollen. */
export function makeRadialTexture(size = 64, inner = 0.0, color = '0,0,0') {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(size / 2, size / 2, size * inner, size / 2, size / 2, size / 2)
  grad.addColorStop(0, `rgba(${color},1)`)
  grad.addColorStop(1, `rgba(${color},0)`)
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Long soft-edged beam used for the light shafts. */
export function makeBeamTexture() {
  const w = 64
  const h = 256
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  const img = g.createImageData(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x / (w - 1)) * 2 - 1
      const v = y / (h - 1)
      const stripes = 0.65 + 0.35 * Math.sin(u * 9.0 + Math.sin(u * 3.0) * 2.0)
      const across = Math.exp(-u * u * 4.5) * stripes
      const along = Math.pow(Math.sin(Math.pow(v, 0.8) * Math.PI), 1.4)
      const a = across * along
      const i = (y * w + x) * 4
      img.data[i] = 255
      img.data[i + 1] = 244
      img.data[i + 2] = 190
      img.data[i + 3] = Math.round(a * 255)
    }
  }
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export function srgb(r: number, g: number, b: number) {
  return new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace)
}

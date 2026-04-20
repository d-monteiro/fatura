type RGB = [number, number, number];

function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)); break;
    case gn: h = (bn - rn) / d + 2; break;
    default: h = (rn - gn) / d + 4;
  }
  return [h * 60, s, l];
}

function rgbToHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function quantize(v: number, step = 32): number {
  return Math.min(255, Math.floor(v / step) * step + step / 2);
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

export async function extractLogoColors(
  src: string,
): Promise<{ primary: string; secondary: string } | null> {
  const img = await loadImage(src).catch(() => null);
  if (!img) return null;

  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  const collect = (minSat: number) => {
    const buckets = new Map<string, { rgb: RGB; count: number }>();
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 80) continue;
      const r = quantize(data[i]);
      const g = quantize(data[i + 1]);
      const b = quantize(data[i + 2]);
      const [, s, l] = rgbToHsl([r, g, b]);
      if (l > 0.93 || l < 0.07) continue;
      if (s < minSat) continue;
      const key = `${r},${g},${b}`;
      const existing = buckets.get(key);
      if (existing) existing.count++;
      else buckets.set(key, { rgb: [r, g, b], count: 1 });
    }
    return buckets;
  };

  // Primeiro passe com filtro normal; se logo é praticamente B&W, relaxar.
  let buckets = collect(0.12);
  if (buckets.size === 0) buckets = collect(0);
  if (buckets.size === 0) return null;

  const scored = [...buckets.values()]
    .map((b) => {
      const [, s, l] = rgbToHsl(b.rgb);
      const lightnessBonus = 1 - Math.abs(l - 0.5) * 1.2;
      return { ...b, score: b.count * (0.4 + s * 0.9 + lightnessBonus * 0.3) };
    })
    .sort((a, b) => b.score - a.score);

  const primary = scored[0];
  const primaryHue = rgbToHsl(primary.rgb)[0];
  const secondary =
    scored.slice(1).find((c) => hueDistance(rgbToHsl(c.rgb)[0], primaryHue) > 25) ??
    scored[1] ??
    primary;

  return { primary: rgbToHex(primary.rgb), secondary: rgbToHex(secondary.rgb) };
}

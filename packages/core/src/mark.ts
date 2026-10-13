import { chacha20 } from "@noble/ciphers/chacha.js";

export const PLANE = 512;
const B = 8;
const BLOCKS = (PLANE / B) * (PLANE / B);
/** Mid-frequency band: coefficients with u + v in {4, 5}. */
export const BAND: ReadonlyArray<readonly [number, number]> = [
  [0, 4], [1, 3], [2, 2], [3, 1], [4, 0],
  [0, 5], [1, 4], [2, 3], [3, 2], [4, 1], [5, 0],
];

const C = new Float64Array(B * B);
for (let k = 0; k < B; k++) {
  for (let n = 0; n < B; n++) {
    C[k * B + n] = (k === 0 ? Math.sqrt(1 / B) : Math.sqrt(2 / B)) * Math.cos(((2 * n + 1) * k * Math.PI) / (2 * B));
  }
}

function dct8(block: Float64Array, out: Float64Array): void {
  const t = new Float64Array(64);
  for (let k = 0; k < B; k++) for (let n = 0; n < B; n++) {
    let s = 0;
    for (let m = 0; m < B; m++) s += C[k * B + m] * block[m * B + n];
    t[k * B + n] = s;
  }
  for (let k = 0; k < B; k++) for (let l = 0; l < B; l++) {
    let s = 0;
    for (let n = 0; n < B; n++) s += t[k * B + n] * C[l * B + n];
    out[k * B + l] = s;
  }
}

function idct8(coef: Float64Array, out: Float64Array): void {
  const t = new Float64Array(64);
  for (let m = 0; m < B; m++) for (let l = 0; l < B; l++) {
    let s = 0;
    for (let k = 0; k < B; k++) s += C[k * B + m] * coef[k * B + l];
    t[m * B + l] = s;
  }
  for (let m = 0; m < B; m++) for (let n = 0; n < B; n++) {
    let s = 0;
    for (let l = 0; l < B; l++) s += t[m * B + l] * C[l * B + n];
    out[m * B + n] = s;
  }
}

/** Separable triangle-filter resample, support scales with the reduction factor. */
export function resizePlane(src: Float64Array, sw: number, sh: number, dw: number, dh: number): Float64Array {
  const axis = (inp: Float64Array, inLen: number, outLen: number, lines: number, stride: (l: number, i: number) => number): Float64Array => {
    const out = new Float64Array(lines * outLen);
    const scale = inLen / outLen;
    const support = Math.max(1, scale);
    for (let o = 0; o < outLen; o++) {
      const center = (o + 0.5) * scale;
      const lo = Math.max(0, Math.floor(center - support));
      const hi = Math.min(inLen - 1, Math.ceil(center + support));
      const w: number[] = [];
      let ws = 0;
      for (let i = lo; i <= hi; i++) {
        const x = Math.abs((i + 0.5 - center) / support);
        const wi = x < 1 ? 1 - x : 0;
        w.push(wi);
        ws += wi;
      }
      for (let l = 0; l < lines; l++) {
        let s = 0;
        for (let i = lo; i <= hi; i++) s += inp[stride(l, i)] * w[i - lo];
        out[l * outLen + o] = s / ws;
      }
    }
    return out;
  };
  const horiz = axis(src, sw, dw, sh, (l, i) => l * sw + i); // sh lines x dw
  const vert = axis(horiz, sh, dh, dw, (l, i) => i * dw + l); // dw lines x dh (transposed)
  const out = new Float64Array(dw * dh);
  for (let x = 0; x < dw; x++) for (let y = 0; y < dh; y++) out[y * dw + x] = vert[x * dh + y];
  return out;
}

export interface YCC { y: Float64Array; cb: Float64Array; cr: Float64Array }

export function rgbToYcc(rgb: Uint8Array, w: number, h: number, channels: number): YCC {
  const n = w * h;
  const y = new Float64Array(n), cb = new Float64Array(n), cr = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const r = rgb[i * channels], g = rgb[i * channels + 1], b = rgb[i * channels + 2];
    y[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    cb[i] = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    cr[i] = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  }
  return { y, cb, cr };
}

export function yccToRgb(p: YCC, n: number): Uint8Array {
  const out = new Uint8Array(n * 3);
  const q = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
  for (let i = 0; i < n; i++) {
    const y = p.y[i], cb = p.cb[i] - 128, cr = p.cr[i] - 128;
    out[i * 3] = q(y + 1.402 * cr);
    out[i * 3 + 1] = q(y - 0.344136 * cb - 0.714136 * cr);
    out[i * 3 + 2] = q(y + 1.772 * cb);
  }
  return out;
}

/** One +-1 per (block, band coefficient), from a ChaCha20 keystream keyed by the 32-byte seed. */
export function pattern(seed: Uint8Array): Int8Array {
  const need = Math.ceil((BLOCKS * BAND.length) / 8);
  const ks = chacha20(seed, new Uint8Array(12), new Uint8Array(need));
  const p = new Int8Array(BLOCKS * BAND.length);
  for (let i = 0; i < p.length; i++) p[i] = ((ks[i >> 3] >> (i & 7)) & 1) === 1 ? 1 : -1;
  return p;
}

function blockCoefs(plane: Float64Array): Float64Array {
  const per = PLANE / B;
  const all = new Float64Array(BLOCKS * 64);
  const blk = new Float64Array(64), out = new Float64Array(64);
  for (let by = 0; by < per; by++) for (let bx = 0; bx < per; bx++) {
    for (let y = 0; y < B; y++) for (let x = 0; x < B; x++) blk[y * B + x] = plane[(by * B + y) * PLANE + bx * B + x];
    dct8(blk, out);
    all.set(out, (by * per + bx) * 64);
  }
  return all;
}

/** Perceptual masking weight in [0,1] from the block's local standard deviation. */
function masking(plane: Float64Array): Float64Array {
  const per = PLANE / B;
  const m = new Float64Array(BLOCKS);
  for (let by = 0; by < per; by++) for (let bx = 0; bx < per; bx++) {
    let s = 0, s2 = 0;
    for (let y = 0; y < B; y++) for (let x = 0; x < B; x++) {
      const v = plane[(by * B + y) * PLANE + bx * B + x]; s += v; s2 += v * v;
    }
    const sd = Math.sqrt(Math.max(0, s2 / 64 - (s / 64) ** 2));
    const t = Math.min(1, sd / 20);
    m[by * per + bx] = 0.25 + 0.75 * t * t * (3 - 2 * t);
  }
  return m;
}

export interface EmbedResult { rgb: Uint8Array; psnr: number; scale: number }

export function psnr(a: Uint8Array, b: Uint8Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  const mse = s / a.length;
  return mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse);
}

function embedOnce(w: number, h: number, ycc: YCC, plane: Float64Array, coefs: Float64Array, mask: Float64Array, pat: Int8Array, scale: number): Uint8Array {
  const per = PLANE / B;
  const coef = new Float64Array(coefs);
  for (let b = 0; b < BLOCKS; b++) {
    const a = scale * mask[b];
    for (let k = 0; k < BAND.length; k++) {
      const [u, v] = BAND[k];
      coef[b * 64 + u * B + v] += a * pat[b * BAND.length + k];
    }
  }
  const marked = new Float64Array(PLANE * PLANE);
  const out = new Float64Array(64);
  for (let by = 0; by < per; by++) for (let bx = 0; bx < per; bx++) {
    idct8(coef.subarray((by * per + bx) * 64, (by * per + bx) * 64 + 64), out);
    for (let y = 0; y < B; y++) for (let x = 0; x < B; x++) marked[(by * B + y) * PLANE + bx * B + x] = out[y * B + x];
  }
  const resid = new Float64Array(PLANE * PLANE);
  for (let i = 0; i < resid.length; i++) resid[i] = marked[i] - plane[i];
  const up = resizePlane(resid, PLANE, PLANE, w, h);
  const y2 = new Float64Array(w * h);
  for (let i = 0; i < y2.length; i++) y2[i] = ycc.y[i] + up[i];
  return yccToRgb({ y: y2, cb: ycc.cb, cr: ycc.cr }, w * h);
}

/** Embed with strength calibrated by bisection so the 8-bit output lands on targetPsnr. */
export function embed(rgb: Uint8Array, w: number, h: number, channels: number, seed: Uint8Array, targetPsnr = 40.6): EmbedResult {
  const ycc = rgbToYcc(rgb, w, h, channels);
  const plane = resizePlane(ycc.y, w, h, PLANE, PLANE);
  const coefs = blockCoefs(plane);
  const mask = masking(plane);
  const pat = pattern(seed);
  const rgb3 = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) { rgb3[i * 3] = rgb[i * channels]; rgb3[i * 3 + 1] = rgb[i * channels + 1]; rgb3[i * 3 + 2] = rgb[i * channels + 2]; }
  let lo = 0.5, hi = 40, best: EmbedResult | null = null;
  for (let it = 0; it < 12; it++) {
    const mid = (lo + hi) / 2;
    const out = embedOnce(w, h, ycc, plane, coefs, mask, pat, mid);
    const p = psnr(rgb3, out);
    if (p >= targetPsnr) { best = { rgb: out, psnr: p, scale: mid }; lo = mid; } else hi = mid;
  }
  if (!best) throw new Error("could not reach target PSNR");
  return best;
}

/** z-score of the keyed pattern against the suspect, with per-block energy normalisation. */
export function detect(rgb: Uint8Array, w: number, h: number, channels: number, seed: Uint8Array): number {
  if (seed.length !== 32) throw new Error("seed must be 32 bytes");
  const ycc = rgbToYcc(rgb, w, h, channels);
  const plane = resizePlane(ycc.y, w, h, PLANE, PLANE);
  const coefs = blockCoefs(plane);
  const pat = pattern(seed);
  let sum = 0;
  for (let b = 0; b < BLOCKS; b++) {
    let e = 0;
    for (const [u, v] of BAND) e += coefs[b * 64 + u * B + v] ** 2;
    const sd = Math.sqrt(e / BAND.length) + 4;
    for (let k = 0; k < BAND.length; k++) {
      const [u, v] = BAND[k];
      sum += (coefs[b * 64 + u * B + v] / sd) * pat[b * BAND.length + k];
    }
  }
  let s2 = 0;
  for (let b = 0; b < BLOCKS; b++) {
    let e = 0;
    for (const [u, v] of BAND) e += coefs[b * 64 + u * B + v] ** 2;
    const sd = Math.sqrt(e / BAND.length) + 4;
    for (let k = 0; k < BAND.length; k++) {
      const [u, v] = BAND[k];
      s2 += (coefs[b * 64 + u * B + v] / sd) ** 2;
    }
  }
  return sum / Math.sqrt(s2);
}

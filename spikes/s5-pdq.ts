export interface PdqResult {
  hash: `0x${string}`;
  quality: number;
  dihedral: `0x${string}`[];
}

const LUMA_R = 0.299;
const LUMA_G = 0.587;
const LUMA_B = 0.114;
const DCT_SCALE = Math.sqrt(2 / 64);
const JAROSZ_PASSES = 2;
const JAROSZ_DIV = 128;

const DCT: Float64Array[] = Array.from({ length: 16 }, (_, i) => {
  const row = new Float64Array(64);
  for (let j = 0; j < 64; j++) {
    row[j] = DCT_SCALE * Math.cos((Math.PI / 2 / 64) * (i + 1) * (2 * j + 1));
  }
  return row;
});

function box1D(
  inp: Float64Array,
  inOff: number,
  out: Float64Array,
  outOff: number,
  len: number,
  stride: number,
  win: number,
): void {
  const half = Math.trunc((win + 2) / 2);
  const p1 = half - 1;
  const p2 = win - half + 1;
  const p3 = len - win;
  const p4 = half - 1;
  let li = 0;
  let ri = 0;
  let oi = 0;
  let sum = 0;
  let cur = 0;
  for (let i = 0; i < p1; i++) {
    sum += inp[inOff + ri];
    cur++;
    ri += stride;
  }
  for (let i = 0; i < p2; i++) {
    sum += inp[inOff + ri];
    cur++;
    out[outOff + oi] = sum / cur;
    ri += stride;
    oi += stride;
  }
  for (let i = 0; i < p3; i++) {
    sum += inp[inOff + ri];
    sum -= inp[inOff + li];
    out[outOff + oi] = sum / cur;
    li += stride;
    ri += stride;
    oi += stride;
  }
  for (let i = 0; i < p4; i++) {
    sum -= inp[inOff + li];
    cur--;
    out[outOff + oi] = sum / cur;
    li += stride;
    oi += stride;
  }
}

function jarosz(b1: Float64Array, b2: Float64Array, rows: number, cols: number): void {
  const wr = Math.trunc((cols + JAROSZ_DIV - 1) / JAROSZ_DIV);
  const wc = Math.trunc((rows + JAROSZ_DIV - 1) / JAROSZ_DIV);
  for (let n = 0; n < JAROSZ_PASSES; n++) {
    for (let i = 0; i < rows; i++) box1D(b1, i * cols, b2, i * cols, cols, 1, wr);
    for (let j = 0; j < cols; j++) box1D(b2, j, b1, j, rows, cols, wc);
  }
}

function torben(m: Float64Array): number {
  const n = m.length;
  const midn = Math.trunc((n + 1) / 2);
  let min = m[0];
  let max = m[0];
  for (const v of m) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  for (;;) {
    const guess = (min + max) / 2;
    let less = 0;
    let greater = 0;
    let equal = 0;
    let maxlt = min;
    let mingt = max;
    for (const v of m) {
      if (v < guess) {
        less++;
        if (v > maxlt) maxlt = v;
      } else if (v > guess) {
        greater++;
        if (v < mingt) mingt = v;
      } else {
        equal++;
      }
    }
    if (less <= midn && greater <= midn) {
      if (less >= midn) return maxlt;
      if (less + equal >= midn) return guess;
      return mingt;
    }
    if (less > greater) max = maxlt;
    else min = mingt;
  }
}

function bitsToHex(m: Float64Array): `0x${string}` {
  const median = torben(m);
  let n = 0n;
  for (let k = 0; k < 256; k++) {
    if (m[k] > median) n |= 1n << BigInt(k);
  }
  return `0x${n.toString(16).padStart(64, "0")}`;
}

function transform(a: Float64Array, kind: number): Float64Array {
  const b = new Float64Array(256);
  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < 16; j++) {
      const v = a[i * 16 + j];
      switch (kind) {
        case 0: b[i * 16 + j] = v; break;
        case 1: b[j * 16 + i] = (j & 1) !== 0 ? v : -v; break;
        case 2: b[i * 16 + j] = ((i + j) & 1) !== 0 ? -v : v; break;
        case 3: b[j * 16 + i] = (i & 1) !== 0 ? v : -v; break;
        case 4: b[i * 16 + j] = (i & 1) !== 0 ? v : -v; break;
        case 5: b[i * 16 + j] = (j & 1) !== 0 ? v : -v; break;
        case 6: b[j * 16 + i] = v; break;
        default: b[j * 16 + i] = ((i + j) & 1) !== 0 ? -v : v;
      }
    }
  }
  return b;
}

export function pdqFromRgba(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): PdqResult {
  const luma = new Float64Array(width * height);
  const tmp = new Float64Array(width * height);
  for (let p = 0; p < width * height; p++) {
    luma[p] = LUMA_R * rgba[p * 4] + LUMA_G * rgba[p * 4 + 1] + LUMA_B * rgba[p * 4 + 2];
  }
  jarosz(luma, tmp, height, width);
  const a = new Float64Array(64 * 64);
  for (let i = 0; i < 64; i++) {
    const ri = Math.trunc(((i + 0.5) * height) / 64);
    for (let j = 0; j < 64; j++) {
      a[i * 64 + j] = luma[ri * width + Math.trunc(((j + 0.5) * width) / 64)];
    }
  }
  let grad = 0;
  for (let i = 0; i < 63; i++) {
    for (let j = 0; j < 64; j++) {
      grad += Math.abs(Math.trunc(((a[i * 64 + j] - a[(i + 1) * 64 + j]) * 100) / 255));
    }
  }
  for (let i = 0; i < 64; i++) {
    for (let j = 0; j < 63; j++) {
      grad += Math.abs(Math.trunc(((a[i * 64 + j] - a[i * 64 + j + 1]) * 100) / 255));
    }
  }
  const quality = Math.min(100, Math.trunc(grad / 90));
  const t = Array.from({ length: 16 }, () => new Float64Array(64));
  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < 64; j++) {
      let s = 0;
      for (let k = 0; k < 64; k++) s += DCT[i][k] * a[k * 64 + j];
      t[i][j] = s;
    }
  }
  const b = new Float64Array(256);
  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < 16; j++) {
      let s = 0;
      for (let k = 0; k < 64; k++) s += t[i][k] * DCT[j][k];
      b[i * 16 + j] = s;
    }
  }
  const dihedral = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => bitsToHex(transform(b, k)));
  return { hash: dihedral[0], quality, dihedral };
}

export function hamming256(a: `0x${string}`, b: `0x${string}`): number {
  let x = BigInt(a) ^ BigInt(b);
  let c = 0;
  while (x) {
    c += Number(x & 1n);
    x >>= 1n;
  }
  return c;
}

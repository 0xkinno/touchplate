import { pdqFromRgba, type PdqResult } from "@touchplate/core";

async function bitmapOf(src: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(src, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This file could not be read as an image. Try a JPEG, PNG or WebP.");
  }
}

function drawn(bmp: ImageBitmap, maxEdge: number): { data: Uint8ClampedArray; width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const width = Math.max(1, Math.round(bmp.width * scale));
  const height = Math.max(1, Math.round(bmp.height * scale));
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas is unavailable");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, width, height);
  return { data: ctx.getImageData(0, 0, width, height).data, width, height };
}

/** Fingerprint computed in the browser. The image bytes never leave the page. */
export async function fingerprintOf(file: Blob): Promise<PdqResult> {
  const bmp = await bitmapOf(file);
  const { data, width, height } = drawn(bmp, 512);
  bmp.close();
  return pdqFromRgba(data, width, height);
}

export interface Raster {
  rgb: Uint8Array;
  width: number;
  height: number;
}

/** RGB raster capped at `maxEdge`, used for watermark embedding and detection. */
export async function rasterOf(file: Blob, maxEdge = 1600): Promise<Raster> {
  const bmp = await bitmapOf(file);
  const { data, width, height } = drawn(bmp, maxEdge);
  bmp.close();
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    rgb[i * 3] = data[i * 4];
    rgb[i * 3 + 1] = data[i * 4 + 1];
    rgb[i * 3 + 2] = data[i * 4 + 2];
  }
  return { rgb, width, height };
}

export async function jpegOf(r: Raster, quality = 0.92): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = r.width;
  c.height = r.height;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("canvas is unavailable");
  const img = ctx.createImageData(r.width, r.height);
  for (let i = 0; i < r.width * r.height; i++) {
    img.data[i * 4] = r.rgb[i * 3];
    img.data[i * 4 + 1] = r.rgb[i * 3 + 1];
    img.data[i * 4 + 2] = r.rgb[i * 3 + 2];
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/jpeg", quality));
}

export async function sha256Hex(b: Blob): Promise<`0x${string}`> {
  const d = await crypto.subtle.digest("SHA-256", await b.arrayBuffer());
  return `0x${Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, "0")).join("")}`;
}

/** Fetches an image from a URL in the browser. Cross-origin blocks surface as a human sentence. */
export async function fetchImage(url: string): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(url, { mode: "cors" });
  } catch {
    throw new Error("That site does not allow the browser to read its images. Save the image and drop the file instead.");
  }
  if (!res.ok) throw new Error(`The image could not be fetched (${res.status}).`);
  const b = await res.blob();
  if (!b.type.startsWith("image/")) throw new Error("That address is not an image.");
  return b;
}

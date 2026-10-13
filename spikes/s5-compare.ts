import { readFileSync, writeFileSync } from "node:fs";
import { hamming256, pdqFromRgba } from "./s5-pdq.ts";

interface Side {
  hash: `0x${string}`;
  quality: number;
  dihedral: `0x${string}`[];
}
interface Row {
  index: number;
  name: string;
  width: number;
  height: number;
  rgbFile: string;
  pyRef: Side;
  cpp: Side;
}

const man: Row[] = JSON.parse(readFileSync("out/s5/manifest.json", "utf8"));
const rows = man.map((m) => {
  const rgb = readFileSync(`out/s5/${m.rgbFile}`);
  const rgba = new Uint8Array(m.width * m.height * 4);
  for (let p = 0; p < m.width * m.height; p++) {
    rgba[p * 4] = rgb[p * 3];
    rgba[p * 4 + 1] = rgb[p * 3 + 1];
    rgba[p * 4 + 2] = rgb[p * 3 + 2];
    rgba[p * 4 + 3] = 255;
  }
  const ts = pdqFromRgba(rgba, m.width, m.height);
  const dih = (ref: Side) => Math.max(...ts.dihedral.map((h, i) => hamming256(h, ref.dihedral[i])));
  return {
    name: m.name,
    w: m.width,
    h: m.height,
    ts: ts.hash,
    tsQ: ts.quality,
    pyQ: m.pyRef.quality,
    cppQ: m.cpp.quality,
    dTsPy: hamming256(ts.hash, m.pyRef.hash),
    dTsCpp: hamming256(ts.hash, m.cpp.hash),
    dPyCpp: hamming256(m.pyRef.hash, m.cpp.hash),
    dihTsPy: dih(m.pyRef),
    dihTsCpp: dih(m.cpp),
  };
});
const max = (f: (r: (typeof rows)[number]) => number) => Math.max(...rows.map(f));
const summary = {
  images: rows.length,
  maxHamming_ts_vs_pythonReference: max((r) => r.dTsPy),
  maxHamming_ts_vs_cppBinding: max((r) => r.dTsCpp),
  maxHamming_pythonReference_vs_cppBinding: max((r) => r.dPyCpp),
  maxDihedralHamming_ts_vs_pythonReference: max((r) => r.dihTsPy),
  maxDihedralHamming_ts_vs_cppBinding: max((r) => r.dihTsCpp),
  maxQualityDelta_ts_vs_pythonReference: max((r) => Math.abs(r.tsQ - r.pyQ)),
  maxQualityDelta_ts_vs_cppBinding: max((r) => Math.abs(r.tsQ - r.cppQ)),
  exactHashMatches_ts_vs_pythonReference: rows.filter((r) => r.dTsPy === 0).length,
};
writeFileSync("s5-parity.json", JSON.stringify({ summary, rows }, null, 1));
console.log(JSON.stringify(summary, null, 2));

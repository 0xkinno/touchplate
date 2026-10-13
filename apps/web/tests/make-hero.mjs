/**
 * Renders the hero photograph: a macro of an antique pewter touchplate with rows of struck maker's marks,
 * shallow depth of field, one mark glowing violet, warm light from the left. Procedural (SVG lighting filters).
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const ROOT = resolve(import.meta.dirname, "../../..");
const W = 2400;
const H = 1600;
const COLS = 7;
const ROWS = 5;

function marks() {
  let out = "";
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cx = 260 + c * 330 + (r % 2) * 40;
      const cy = 200 + r * 290;
      const blur = Math.abs(r - 3) * 2.2; // shallow depth of field around the third row
      const glow = r === 3 && c === 3;
      const seed = (r * 7 + c * 13) % 5;
      out += `<g filter="url(#dof${Math.min(5, Math.round(blur))})" transform="rotate(${(seed - 2) * 2.2} ${cx} ${cy})">
        <circle cx="${cx}" cy="${cy}" r="112" fill="#6f6a60" opacity=".55" filter="url(#deboss)"/>
        <circle cx="${cx}" cy="${cy}" r="96" fill="none" stroke="#2c2a26" stroke-width="7" opacity=".55" filter="url(#deboss)"/>
        <text x="${cx}" y="${cy + 34}" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="112" fill="#2a2824" filter="url(#deboss)">${String.fromCharCode(65 + ((r * 7 + c * 5 + seed) % 26))}</text>
        <text x="${cx}" y="${cy + 86}" text-anchor="middle" font-family="Georgia, serif" font-size="30" fill="#34312c" opacity=".55" filter="url(#deboss)">${String.fromCharCode(65 + ((r * 5 + c) % 26))}${(r * 3 + c) % 9 + 1}</text>
        ${glow ? `<circle cx="${cx}" cy="${cy}" r="150" fill="url(#violet)" style="mix-blend-mode:screen"/><circle cx="${cx}" cy="${cy}" r="100" fill="none" stroke="#836EF9" stroke-width="6" opacity=".9"/>` : ""}
      </g>`;
    }
  }
  return out;
}

const html = `<!doctype html><html><body style="margin:0;background:#cfc8b8">
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="metal" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.0045 0.012" numOctaves="4" seed="7" result="low"/>
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="grain"/>
      <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.55 0" result="grainA"/>
      <feComposite in="low" in2="grainA" operator="arithmetic" k1="0" k2="0.85" k3="0.15" k4="0" result="bump"/>
      <feDiffuseLighting in="bump" surfaceScale="6" diffuseConstant="1.05" lighting-color="#f4eee0" result="diff">
        <feDistantLight azimuth="200" elevation="38"/>
      </feDiffuseLighting>
      <feSpecularLighting in="bump" surfaceScale="5" specularConstant="0.9" specularExponent="22" lighting-color="#fff6e2" result="spec">
        <feDistantLight azimuth="205" elevation="42"/>
      </feSpecularLighting>
      <feComposite in="spec" in2="diff" operator="arithmetic" k1="0" k2="0.55" k3="1" k4="0"/>
    </filter>
    <filter id="deboss" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="3.2" result="b"/>
      <feSpecularLighting in="b" surfaceScale="7" specularConstant="1.2" specularExponent="18" lighting-color="#fff4dc" result="s">
        <feDistantLight azimuth="215" elevation="36"/>
      </feSpecularLighting>
      <feComposite in="s" in2="SourceAlpha" operator="in" result="sin"/>
      <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="sin"/></feMerge>
    </filter>
    ${[0, 1, 2, 3, 4, 5].map((n) => `<filter id="dof${n}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${n * 2.4}"/></filter>`).join("")}
    <radialGradient id="violet"><stop offset="0" stop-color="#9a86ff" stop-opacity=".95"/><stop offset=".45" stop-color="#836EF9" stop-opacity=".45"/><stop offset="1" stop-color="#836EF9" stop-opacity="0"/></radialGradient>
    <linearGradient id="warm" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff2d0" stop-opacity=".55"/><stop offset=".55" stop-color="#fff2d0" stop-opacity="0"/><stop offset="1" stop-color="#1b1a22" stop-opacity=".45"/></linearGradient>
    <radialGradient id="vig" cx=".55" cy=".5" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#14121a" stop-opacity=".55"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#9d978b" filter="url(#metal)"/>
  <g>${marks()}</g>
  <rect width="${W}" height="${H}" fill="url(#warm)"/>
  <rect width="${W}" height="${H}" fill="url(#vig)"/>
</svg></body></html>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.setContent(html);
await page.waitForTimeout(1500);
const buf = await page.screenshot({ type: "jpeg", quality: 86 });
writeFileSync(resolve(ROOT, "apps/web/public/hero-plate.jpg"), buf);
await browser.close();
console.log("hero written", buf.length);

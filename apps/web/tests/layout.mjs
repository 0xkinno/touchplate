/**
 * Responsive and layout QA. For every route and viewport: no horizontal overflow, no overlapping
 * [data-no-overlap] boxes, no console errors, every image has alt text. Phone sizes use device emulation.
 * Usage: BASE_URL=https://touchplate.vercel.app node tests/layout.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const ROOT = resolve(import.meta.dirname, "../../..");
const OUT = resolve(ROOT, "qa");
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const VIEWPORTS = [
  [375, 667], [390, 844], [393, 852], [412, 915], [768, 1024], [1024, 1366], [1280, 800], [1440, 900], [1920, 1080],
];
const ROUTES = ["/", "/lookup", "/studio", "/ledger", "/investigate", "/proof"];

const browser = await chromium.launch({ headless: true });
const results = [];
for (const [w, h] of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    isMobile: w < 768,
    hasTouch: w < 768,
    deviceScaleFactor: w < 768 ? 2 : 1,
    userAgent: w < 768 ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" : undefined,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/net::ERR_|Failed to load resource|favicon/i.test(m.text())) errors.push(m.text()); });
  for (const route of ROUTES) {
    await page.goto(`${BASE}${route}`, { waitUntil: "load", timeout: 120000 });
    await page.waitForTimeout(2000);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    const boxes = await page.$$eval("[data-no-overlap]", (els) =>
      els.filter((e) => e.getBoundingClientRect().width > 0 && getComputedStyle(e).display !== "none")
        .map((e) => { const r = e.getBoundingClientRect(); return { id: e.getAttribute("data-no-overlap"), x: r.x, y: r.y + window.scrollY, w: r.width, h: r.height }; }));
    let overlap = null;
    for (let i = 0; i < boxes.length && !overlap; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) { overlap = `${a.id} x ${b.id}`; break; }
      }
    }
    const missingAlt = await page.$$eval("img", (imgs) => imgs.filter((i) => !i.hasAttribute("alt")).length);
    const name = `${route === "/" ? "home" : route.slice(1)}-${w}x${h}.png`;
    await page.screenshot({ path: resolve(OUT, name), fullPage: false });
    results.push({ route, viewport: `${w}x${h}`, overflow, overlap, missingAlt });
    console.log(`${overflow || overlap || missingAlt ? "FAIL" : "PASS"} ${route} ${w}x${h}${overflow ? " overflow" : ""}${overlap ? ` overlap ${overlap}` : ""}${missingAlt ? ` missingAlt ${missingAlt}` : ""}`);
  }
  if (errors.length) console.log(`console errors at ${w}x${h}: ${errors.slice(0, 2).join(" | ")}`);
  results.push({ viewport: `${w}x${h}`, consoleErrors: errors.length });
  await ctx.close();
}
await browser.close();
writeFileSync(resolve(OUT, "layout-results.json"), JSON.stringify(results, null, 2));
const bad = results.filter((r) => r.overflow || r.overlap || r.missingAlt || r.consoleErrors);
console.log(bad.length ? `\nFAILED ${bad.length}` : "\nALL PASSED");
process.exit(bad.length ? 1 : 0);

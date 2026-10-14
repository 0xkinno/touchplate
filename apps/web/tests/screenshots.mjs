/** Captures README screenshots from the live site (no wallet transactions). */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, devices } from "playwright";
import sharp from "sharp";

const ROOT = resolve(import.meta.dirname, "../../..");
const OUT = resolve(ROOT, "docs/media");
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL ?? "https://touchplate.vercel.app";
const SEALED = resolve(ROOT, "spikes/out/sealed/0.jpg");
const REPOST = resolve(OUT, "..", "..", "qa", "repost-mainnet.jpg");
const m = await sharp(SEALED).metadata();
const squeezed = await sharp(SEALED).resize({ width: Math.round((m.width ?? 900) * 0.8) }).toBuffer();
await sharp(squeezed).jpeg({ quality: 70 }).toFile(REPOST);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const go = async (path, wait = 2500) => {
  await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 120000 });
  await page.waitForTimeout(wait);
};

await go("/", 3500);
await page.screenshot({ path: resolve(OUT, "landing.png") });
await page.evaluate(() => window.scrollTo(0, 1100));
await page.waitForTimeout(800);
await page.screenshot({ path: resolve(OUT, "landing-how.png") });

await go("/lookup");
await page.setInputFiles('input[aria-label="Choose an image"]', REPOST);
await page.getByText(/Sealed by/).first().waitFor({ timeout: 120000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: resolve(OUT, "lookup.png"), fullPage: false });

await go("/ledger", 5000);
await page.screenshot({ path: resolve(OUT, "ledger.png") });

await go("/studio", 3000);
await page.screenshot({ path: resolve(OUT, "studio.png") });

await go("/proof", 3000);
await page.screenshot({ path: resolve(OUT, "proof.png") });

await go("/investigate");
await page.setInputFiles('input[aria-label="Drop the image to investigate"]', REPOST);
await page.getByText(/Verdict copied from the engine/).first().waitFor({ timeout: 150000 }).catch(() => undefined);
await page.waitForTimeout(1500);
await page.screenshot({ path: resolve(OUT, "investigate.png"), fullPage: false });

await go("/developers", 2500);
await page.screenshot({ path: resolve(OUT, "developers.png") });

const phone = await browser.newContext({ ...devices["iPhone 13"] });
const mp = await phone.newPage();
await mp.goto(BASE, { waitUntil: "load", timeout: 120000 });
await mp.waitForTimeout(3500);
await mp.screenshot({ path: resolve(OUT, "mobile-landing.png") });
await browser.close();
console.log("screenshots written to docs/media");

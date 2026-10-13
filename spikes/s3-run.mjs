import { build } from "esbuild";
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

await build({
  entryPoints: ["s3-page.ts"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  outfile: "out/s3-bundle.js",
});

const html = '<!doctype html><meta charset="utf-8"><title>s3</title><script src="/bundle.js"></script>';
const server = createServer((req, res) => {
  if (req.url === "/bundle.js") {
    res.setHeader("content-type", "text/javascript");
    res.end(readFileSync("out/s3-bundle.js"));
  } else {
    res.setHeader("content-type", "text/html");
    res.end(html);
  }
});
await new Promise((r) => server.listen(4173, "127.0.0.1", r));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
page.on("console", (m) => console.log("[page]", m.text()));
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
const cdp = await ctx.newCDPSession(page);
await cdp.send("WebAuthn.enable");
const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: {
    protocol: "ctap2",
    ctap2Version: "ctap2_1",
    transport: "internal",
    hasResidentKey: true,
    hasUserVerification: true,
    hasPrf: true,
    isUserVerified: true,
    automaticPresenceSimulation: true,
  },
});
await page.goto("http://localhost:4173/");
const result = await page.evaluate(() => window.runS3());
const info = await browser.version();
writeFileSync("s3-families.json", JSON.stringify({ browser: info, authenticatorId, ...result }, null, 2));
console.log(JSON.stringify({ browser: info, ...result, assertions: result.assertions.map((a) => ({ ...a, clientDataJSON: a.clientDataJSON.slice(0, 80) + "..." })) }, null, 2));
await browser.close();
server.close();

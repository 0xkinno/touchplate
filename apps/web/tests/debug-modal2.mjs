import { chromium } from "playwright";
const b = await chromium.launch({ headless: true });
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.addInitScript(() => {
  const info = { uuid: "tp-test", name: "Touchplate Test Wallet", rdns: "app.touchplate.testwallet", icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxNicgaGVpZ2h0PScxNic+PC9zdmc+" };
  const provider = { request: async () => [], on() {}, removeListener() {} };
  const a = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
  window.addEventListener("eip6963:requestProvider", a); a();
});
p.on("pageerror", (e) => console.log("PAGEERROR", e.message.slice(0, 400)));
p.on("console", (m) => { if (m.type() === "error") console.log("CONSOLEERR", m.text().slice(0, 500)); });
await p.goto("http://localhost:3100/", { waitUntil: "load", timeout: 120000 });
await p.waitForTimeout(12000);
await p.getByRole("button", { name: "Connect wallet" }).first().click();
await p.waitForTimeout(5000);
const info = await p.evaluate(() => {
  const m = document.querySelector("w3m-modal") ?? document.querySelector("appkit-modal");
  const els = [...document.querySelectorAll("body *")].map((e) => e.tagName.toLowerCase()).filter((t) => t.includes("-"));
  const r = m?.getBoundingClientRect();
  return { tag: m?.tagName, rect: r && [r.x, r.y, r.width, r.height], custom: [...new Set(els)].join(","), shadowText: m?.shadowRoot?.textContent?.slice(0, 300), open: m?.hasAttribute("open") };
});
console.log(JSON.stringify(info, null, 1));
await p.screenshot({ path: "../../qa/debug-modal.png" });
await b.close();

import { chromium } from "playwright";
const b = await chromium.launch({ headless: true });
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const logs = [];
p.on("console", (m) => logs.push(`${m.type()}: ${m.text().slice(0, 200)}`));
await p.addInitScript(() => {
  const info = { uuid: "tp-test", name: "Touchplate Test Wallet", rdns: "app.touchplate.testwallet", icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxNicgaGVpZ2h0PScxNic+PC9zdmc+" };
  const provider = { request: async () => [], on() {}, removeListener() {} };
  const a = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
  window.addEventListener("eip6963:requestProvider", a); a();
});
await p.goto("http://localhost:3100/", { waitUntil: "load", timeout: 120000 });
await p.waitForTimeout(3000);
await p.getByRole("button", { name: "Connect wallet" }).first().click();
await p.waitForTimeout(6000);
await p.screenshot({ path: "../../qa/debug-modal.png" });
console.log(logs.slice(0, 15).join("\n"));
console.log("modal text:", (await p.locator("w3m-modal").first().innerText().catch(() => "no modal")).slice(0, 400));
await b.close();

/**
 * End-to-end test in real Chromium against a running app (BASE_URL). A virtual authenticator with PRF stands in for
 * the passkey, and an EIP-6963 test wallet backed by a funded key stands in for the user's wallet: every
 * eth_sendTransaction the app makes is a request the wallet must answer, and is counted.
 * Usage: BASE_URL=http://localhost:3100 node tests/e2e.mjs
 */
import { config } from "dotenv";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";
import { createPublicClient, createWalletClient, http, parseEther, toHex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { monad } from "viem/chains";

const ROOT = resolve(import.meta.dirname, "../../..");
config({ path: resolve(ROOT, ".env.local") });
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = resolve(ROOT, "qa");
mkdirSync(OUT, { recursive: true });

const RPC = "https://rpc.monad.xyz";
const pub = createPublicClient({ chain: monad, transport: http(RPC) });
const funder = privateKeyToAccount(process.env.MAINNET_DEPLOYER_PRIVATE_KEY);
const user = privateKeyToAccount(generatePrivateKey());
const wallet = createWalletClient({ account: user, chain: monad, transport: http(RPC) });
const fundWallet = createWalletClient({ account: funder, chain: monad, transport: http(RPC) });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
};

// fund the throwaway user wallet with a little MON for gas
const fundHash = await fundWallet.sendTransaction({ to: user.address, value: parseEther("0.4"), gas: 21000n });
await pub.waitForTransactionReceipt({ hash: fundHash });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

const cdp = await ctx.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", ctap2Version: "ctap2_1", transport: "internal", hasResidentKey: true, hasUserVerification: true, hasPrf: true, isUserVerified: true, automaticPresenceSimulation: true },
});

const prompts = [];
await page.exposeFunction("__walletRequest", async (method, params) => {
  prompts.push({ method, at: Date.now() });
  switch (method) {
    case "eth_requestAccounts":
    case "eth_accounts": return [user.address];
    case "eth_chainId": return "0x8f";
    case "net_version": return "143";
    case "wallet_switchEthereumChain":
    case "wallet_addEthereumChain": return null;
    case "eth_sendTransaction": {
      const t = params[0];
      return wallet.sendTransaction({ to: t.to, data: t.data, value: t.value ? BigInt(t.value) : 0n, gas: t.gas ? BigInt(t.gas) : undefined });
    }
    case "personal_sign":
    case "eth_sign": return wallet.signMessage({ message: { raw: params[0] } });
    default: {
      const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    }
  }
});
await page.addInitScript(() => {
  const info = { uuid: "tp-test-wallet", name: "Touchplate Test Wallet", rdns: "app.touchplate.testwallet",
    icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxNicgaGVpZ2h0PScxNic+PHJlY3Qgd2lkdGg9JzE2JyBoZWlnaHQ9JzE2JyBmaWxsPScjMTIxMjEyJy8+PC9zdmc+" };
  const provider = {
    isMetaMask: false,
    request: ({ method, params }) => window.__walletRequest(method, params ?? []),
    on() {}, removeListener() {}, removeAllListeners() {},
  };
  const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
  window.addEventListener("eip6963:requestProvider", announce);
  window.ethereum = provider;
  announce();
});

const shot = (name) => page.screenshot({ path: resolve(OUT, name), fullPage: false });

// ---- landing
await page.goto(BASE, { waitUntil: "load", timeout: 180000 });
check("landing renders headline", await page.getByText("Proof of who made it first").first().isVisible());
await shot("landing-1440.png");
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
check("no horizontal overflow on landing", !overflow);

// ---- wallet connect modal
await page.waitForTimeout(4000);
for (let attempt = 0; attempt < 6; attempt++) {
  await page.getByRole("button", { name: "Connect wallet" }).first().click();
  try {
    await page.getByText("Touchplate Test Wallet").first().waitFor({ timeout: 8000 });
    break;
  } catch {
    if (attempt === 5) throw new Error("connect modal never listed the injected wallet");
  }
}
check("connect modal lists the injected wallet", true);
await shot("connect-modal.png");
await page.getByText("Touchplate Test Wallet").first().click();
await page.getByRole("button", { name: /Open wallet details/ }).waitFor({ timeout: 30000 });
check("wallet connected, address shown in nav", true);

// ---- studio: passkey, register, mark, touch, reveal
await page.goto(`${BASE}/studio`, { waitUntil: "load", timeout: 180000 });
await page.getByRole("button", { name: "Create passkey" }).click();
await page.getByText("Unlocked.").waitFor({ timeout: 60000 });
check("passkey created and key families unlocked", true);
const promptsBefore = prompts.filter((p) => p.method === "eth_sendTransaction").length;
await page.getByRole("button", { name: /Touch and register/ }).click();
await Promise.race([
  page.getByText("Registered. Your passkey is bound").waitFor({ timeout: 120000 }),
  page.locator('[role="alert"]:not(#__next-route-announcer__)').first().waitFor({ timeout: 120000 }).then(async () => {
    throw new Error(`registration failed: ${await page.locator('[role="alert"]:not(#__next-route-announcer__)').first().innerText()}`);
  }),
]);
check("studio registered through a wallet transaction", prompts.filter((p) => p.method === "eth_sendTransaction").length === promptsBefore + 1);

const cocoDir = resolve(ROOT, "spikes/out/coco");
const ids = JSON.parse(readFileSync(resolve(cocoDir, "ids.json"), "utf8"));
await page.setInputFiles('input[aria-label="Choose images to seal"]', resolve(cocoDir, ids[120]));
await page.getByText(/PSNR \d+\.\d dB/).first().waitFor({ timeout: 120000 });
check("image watermarked in the browser with PSNR shown", true);
await shot("studio-marked.png");

await page.getByRole("button", { name: /with one touch/ }).click();
await page.getByText("Priority locked: the touch block is Finalized.").waitFor({ timeout: 180000 });
check("touch sealed and ladder reached Finalized", true);
await shot("studio-ladder.png");

const dl = page.waitForEvent("download");
await page.getByRole("button", { name: "Marked image" }).first().click();
const download = await dl;
const markedPath = resolve(OUT, "marked.jpg");
await download.saveAs(markedPath);

await page.getByRole("button", { name: "Reveal all" }).click();
await page.getByRole("link", { name: "entry page" }).first().waitFor({ timeout: 180000 });
check("image revealed after Finalized", true);
const sendTxs = prompts.filter((p) => p.method === "eth_sendTransaction").length;
check("each on-chain action asked the wallet", sendTxs === promptsBefore + 3, `eth_sendTransaction requests: ${sendTxs - promptsBefore}`);

// ---- lookup with a stripped, squeezed repost
const repost = resolve(OUT, "repost.jpg");
const m = await sharp(markedPath).metadata();
const resized = await sharp(markedPath).resize({ width: Math.round((m.width ?? 800) * 0.75) }).toBuffer();
await sharp(resized).jpeg({ quality: 70 }).toFile(repost);
await page.goto(`${BASE}/lookup`, { waitUntil: "load", timeout: 180000 });
let imageBytesSent = false;
page.on("request", (r) => { if (r.url().includes("/api/") && (r.postDataBuffer()?.length ?? 0) > 20000) imageBytesSent = true; });
await page.setInputFiles('input[aria-label="Choose an image"]', repost);
await page.getByText(/Sealed by/).first().waitFor({ timeout: 180000 });
check("repost attributed to the sealing wallet", (await page.content()).toLowerCase().includes(user.address.slice(0, 8).toLowerCase()));
check("no image bytes sent to the server (I9)", !imageBytesSent);
await shot("lookup-verdict.png");

// ---- other routes
for (const path of ["/ledger", "/investigate", "/proof"]) {
  await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 180000 });
  await shot(`${path.slice(1)}-1440.png`);
  check(`route ${path} renders`, (await page.locator("h1").first().isVisible()));
}

const real = consoleErrors.filter((e) => !/net::ERR_|favicon|walletconnect|Failed to load resource.*(403|429)|analytics|pulse\.walletconnect|web3modal|reown/i.test(e));
check("no unexpected console errors", real.length === 0, real.slice(0, 3).join(" | "));
writeFileSync(resolve(OUT, "e2e-results.json"), JSON.stringify({ base: BASE, user: user.address, walletRequests: prompts.map((p) => p.method), results, consoleErrors }, null, 2));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\nFAILED ${failed.length}` : "\nALL PASSED");
process.exit(failed.length ? 1 : 0);

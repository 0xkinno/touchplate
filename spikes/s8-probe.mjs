import { createPublicClient, http, parseAbi, getAddress } from "viem";
const c = createPublicClient({ transport: http("https://testnet-rpc.monad.xyz") });
const m = createPublicClient({ transport: http("https://rpc.monad.xyz") });
const abi = parseAbi(["function name() view returns (string)","function symbol() view returns (string)","function decimals() view returns (uint8)","function totalSupply() view returns (uint256)"]);
const cands = { testnetAUSD: "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC", testnetFaucet: "0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C" };
for (const [k, a] of Object.entries(cands)) {
  const code = await c.getCode({ address: a });
  console.log(k, getAddress(a), "codeBytes", code ? (code.length - 2) / 2 : 0);
  if (k === "testnetAUSD") for (const fn of ["name","symbol","decimals","totalSupply"]) {
    try { console.log("  ", fn, String(await c.readContract({ address: a, abi, functionName: fn }))); } catch (e) { console.log("  ", fn, "ERR", e.shortMessage); }
  }
}
const mainnet = "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a";
const mc = await m.getCode({ address: mainnet });
console.log("mainnetAUSD codeBytes", mc ? (mc.length-2)/2 : 0);
for (const fn of ["name","symbol","decimals"]) { try { console.log("  ", fn, String(await m.readContract({ address: mainnet, abi, functionName: fn }))); } catch (e) { console.log("  ", fn, "ERR", e.shortMessage); } }

import { createPublicClient, http, toFunctionSelector } from "viem";
const c = createPublicClient({ transport: http("https://testnet-rpc.monad.xyz") });
const faucet = "0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C";
const slot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const raw = await c.getStorageAt({ address: faucet, slot });
const impl = "0x" + raw.slice(26);
console.log("implementation:", impl);
const code = (await c.getCode({ address: impl })).slice(2);
console.log("impl code bytes:", code.length / 2);
const push4 = new Set(); for (let i = 0; i + 10 <= code.length; i += 2) if (code.slice(i, i + 2) === "63") push4.add("0x" + code.slice(i + 2, i + 10));
for (const sig of ["requestFunds(address)", "token()", "owner()", "amount()", "cooldown()", "lastRequest(address)", "fundAmount()", "requestFunds()", "ausd()"]) {
  const s = toFunctionSelector(sig); console.log(sig.padEnd(26), s, push4.has(s) ? "PRESENT" : "-");
}
console.log("all push4 selectors:", [...push4].filter(x => !x.startsWith("0xffff")).slice(0, 25).join(" "));

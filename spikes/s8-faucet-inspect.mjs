import { createPublicClient, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
const c = createPublicClient({ transport: http("https://testnet-rpc.monad.xyz") });
const faucet = "0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C";
const code = (await c.getCode({ address: faucet }));
console.log(code);
const user = privateKeyToAccount(generatePrivateKey()).address;
for (const data of ["0x", "0xdeadbeef", "0x544c7cf9" + "0".repeat(24) + user.slice(2)]) {
  try { const r = await c.call({ account: user, to: faucet, data }); console.log(data.slice(0,12), "ok", r.data); }
  catch (e) { console.log(data.slice(0,12), "ERR", e.shortMessage); }
}

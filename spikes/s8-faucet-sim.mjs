import { createPublicClient, http, parseAbi, encodeFunctionData, toFunctionSelector, getAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
const c = createPublicClient({ transport: http("https://testnet-rpc.monad.xyz") });
const faucet = "0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C";
const code = (await c.getCode({ address: faucet })).slice(2);
const sels = new Set(); for (let i = 0; i < code.length - 10; i += 2) if (code.slice(i, i+2) === "63") sels.add("0x" + code.slice(i+2, i+10));
const guesses = ["requestFunds(address)","requestTokens()","claim()","drip(address)","requestFunds()","faucet()","mint(address)","dispense(address)"];
console.log("selectors present that match guesses:");
for (const g of guesses) { const s = toFunctionSelector(g); console.log(" ", g, s, sels.has(s) ? "PRESENT" : "-"); }
const user = privateKeyToAccount(generatePrivateKey()).address;
const abi = parseAbi(["function requestFunds(address)", "function balanceOf(address) view returns (uint256)"]);
try {
  const r = await c.call({ account: user, to: faucet, data: encodeFunctionData({ abi, functionName: "requestFunds", args: [user] }) });
  console.log("simulated requestFunds(user) ok, returndata:", r.data);
  const gas = await c.estimateGas({ account: user, to: faucet, data: encodeFunctionData({ abi, functionName: "requestFunds", args: [user] }) });
  console.log("estimateGas:", gas);
} catch (e) { console.log("simulate requestFunds ERR:", e.shortMessage, e.details?.slice(0,200)); }
console.log("faucet AUSD balance:", await c.readContract({ address: "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC", abi, functionName: "balanceOf", args: [faucet] }));
console.log("faucet MON balance:", await c.getBalance({ address: faucet }));

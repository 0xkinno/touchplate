import { readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, encodeFunctionData, http, parseAbi, type Hex } from "viem";
const client = createPublicClient({ transport: http("https://testnet-rpc.monad.xyz") });
const art = JSON.parse(readFileSync("s4/out/LayoutProbe.sol/LayoutProbe.json", "utf8"));
const abi = parseAbi(["function writeA(bytes32)","function writeB(bytes32)","function writeC(bytes32)","function readA(bytes32) view returns (bytes32,address,uint64)","function readB(bytes32) view returns (bytes32,address,uint40)","function readC(bytes32) view returns (bytes32,address,uint64)"]);
const ADDR = "0x00000000000000000000000000000000000c0de2" as const;
const FROM = "0x00000000000000000000000000000000000fa11e" as const;
const key = `0x${"ab".repeat(32)}` as Hex;
const code = art.deployedBytecode.object as Hex;
const est = (fn: "writeA"|"writeB"|"writeC"|"readA"|"readB"|"readC") =>
  client.estimateGas({ account: FROM, to: ADDR, data: encodeFunctionData({ abi, functionName: fn, args: [key] }), stateOverride: [{ address: ADDR, code }] });
const out: Record<string, number> = {};
for (const fn of ["writeA","writeB","writeC","readA","readB","readC"] as const) out[fn] = Number(await est(fn));
const intrinsic = 21000;
const result = {
  note: "estimateGas against live testnet RPC with runtime-code override; includes 21000 intrinsic + calldata + dispatch",
  estimateGas: out,
  netOfIntrinsic: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v - intrinsic])),
  slotsPerEntry: { A: 8, B: 4, C: 9 },
  docModel: { firstFreshSlotInPage: 27900, nextFreshSlotInSamePage: 17100 },
  predictedStorageGas: { A: 27900 + 7 * 17100, B: 27900 + 3 * 17100, C: 9 * 27900 },
};
writeFileSync("s9-storage.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));

import "dotenv/config";
import { writeFileSync } from "node:fs";

const key = process.env.QWEN_API_KEY;
const model = process.env.QWEN_MODEL ?? "qwen3.8-max";
const candidates = [
  process.env.QWEN_BASE_URL,
  "https://dashscope-us.aliyuncs.com/compatible-mode/v1",
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  "https://dashscope.aliyuncs.com/compatible-mode/v1",
].filter(Boolean);

const tools = [{
  type: "function",
  function: {
    name: "lookup_registry",
    description: "Look up the earliest finalized registry entry whose fingerprint is near the given 256-bit hash.",
    parameters: { type: "object", properties: { pdq: { type: "string", description: "0x-prefixed 32-byte hash" } }, required: ["pdq"] },
  },
}];

async function post(base, body) {
  const r = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

const attempts = [];
for (const base of candidates) {
  const first = await post(base, {
    model,
    messages: [{ role: "user", content: "Who made image 0x" + "ab".repeat(32) + " first? Use the tool." }],
    tools,
    tool_choice: "auto",
  });
  const call = first.json?.choices?.[0]?.message?.tool_calls?.[0];
  attempts.push({ base, status: first.status, error: first.json?.error?.message ?? first.json?.message ?? null, toolCall: call?.function?.name ?? null });
  if (!call) continue;
  const second = await post(base, {
    model,
    messages: [
      { role: "user", content: "Who made image 0x" + "ab".repeat(32) + " first? Use the tool." },
      first.json.choices[0].message,
      { role: "tool", tool_call_id: call.id, content: JSON.stringify({ found: false }) },
    ],
    tools,
  });
  const out = {
    base, model: first.json.model, toolCall: call.function, secondStatus: second.status,
    finalText: second.json?.choices?.[0]?.message?.content ?? null, usage: second.json?.usage ?? null,
  };
  writeFileSync("s7-qwen.json", JSON.stringify({ attempts, result: out }, null, 2));
  console.log(JSON.stringify({ attempts, result: out }, null, 2));
  process.exit(0);
}
writeFileSync("s7-qwen.json", JSON.stringify({ attempts, result: null }, null, 2));
console.log(JSON.stringify({ attempts }, null, 2));
process.exit(1);

import { Touchplate } from "generated";

const day = (ts: number): string => new Date(ts * 1000).toISOString().slice(0, 10);

type StatKey = "touches" | "reveals" | "derivatives" | "licenses";

async function bump(
  context: { DailyStat: { get: (id: string) => Promise<DailyStatRow | undefined>; set: (v: DailyStatRow) => void } },
  ts: number,
  key: StatKey,
  volume = 0n,
): Promise<void> {
  const id = day(ts);
  const cur = (await context.DailyStat.get(id)) ?? { id, day: id, touches: 0, reveals: 0, derivatives: 0, licenses: 0, licensedVolume: 0n };
  context.DailyStat.set({ ...cur, [key]: cur[key] + 1, licensedVolume: cur.licensedVolume + volume });
}

interface DailyStatRow {
  id: string;
  day: string;
  touches: number;
  reveals: number;
  derivatives: number;
  licenses: number;
  licensedVolume: bigint;
}

Touchplate.StudioRegistered.handler(async ({ event, context }) => {
  context.Studio.set({
    id: event.params.author.toLowerCase(),
    author: event.params.author,
    qx: event.params.qx,
    qy: event.params.qy,
    ed25519Pub: event.params.ed25519Pub,
    registeredBlock: event.block.number,
    registerTx: event.transaction.hash,
  });
});

Touchplate.Touched.handler(async ({ event, context }) => {
  context.Touch.set({
    id: event.params.root,
    root: event.params.root,
    author: event.params.author,
    count: Number(event.params.count),
    nonce: event.params.nonce,
    blockNumber: event.block.number,
    txIndex: event.transaction.transactionIndex,
    logIndex: event.logIndex,
    txHash: event.transaction.hash,
    timestamp: event.block.timestamp,
  });
  await bump(context, event.block.timestamp, "touches");
});

Touchplate.Revealed.handler(async ({ event, context }) => {
  const touch = await context.Touch.get(event.params.root);
  context.Entry.set({
    id: event.params.commitment,
    commitment: event.params.commitment,
    root: event.params.root,
    author: event.params.author,
    pdq: event.params.pdq,
    dihedralRoot: event.params.dihedralRoot,
    markSeedHash: event.params.markSeedHash,
    manifestHash: event.params.manifestHash,
    licensePrice: event.params.licensePrice,
    touchBlock: touch?.blockNumber ?? Number(event.params.touchBlock),
    touchTxIndex: touch?.txIndex ?? 0,
    touchLogIndex: touch?.logIndex ?? 0,
    revealBlock: event.block.number,
    revealTx: event.transaction.hash,
    derivative: false,
    licenseCount: 0,
  });
  await bump(context, event.block.timestamp, "reveals");
});

Touchplate.PriorityRecorded.handler(async ({ event, context }) => {
  context.PriorityRecord.set({
    id: `${event.transaction.hash}-${event.logIndex}`,
    earlier: event.params.earlier,
    later: event.params.later,
    distance: event.params.distance,
    blockNumber: event.block.number,
    txHash: event.transaction.hash,
  });
  const later = await context.Entry.get(event.params.later);
  if (later) context.Entry.set({ ...later, derivative: true });
  await bump(context, event.block.timestamp, "derivatives");
});

Touchplate.MarkProven.handler(async ({ event, context }) => {
  context.MarkProof.set({
    id: `${event.transaction.hash}-${event.logIndex}`,
    commitment: event.params.commitment,
    suspectSha256: event.params.suspectSha256,
    seed: event.params.seed,
    zMilli: Number(event.params.zMilli),
    uri: event.params.uri,
    blockNumber: event.block.number,
    txHash: event.transaction.hash,
  });
});

Touchplate.Licensed.handler(async ({ event, context }) => {
  context.License.set({
    id: `${event.transaction.hash}-${event.logIndex}`,
    commitment: event.params.commitment,
    licensee: event.params.licensee,
    author: event.params.author,
    token: event.params.token,
    paid: event.params.paid,
    fee: event.params.fee,
    blockNumber: event.block.number,
    txHash: event.transaction.hash,
  });
  const entry = await context.Entry.get(event.params.commitment);
  if (entry) context.Entry.set({ ...entry, licenseCount: entry.licenseCount + 1 });
  await bump(context, event.block.timestamp, "licenses", event.params.paid);
});

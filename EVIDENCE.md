# EVIDENCE

Every deployment and transaction below is real. Mainnet is chain 143, testnet is chain 10143.

## Deployments

| Network | What | Address / tx |
|---|---|---|
| mainnet | Touchplate | `0x05648FAa32eeF566b97Cc8E0BAB1C15D7fBeeCF1` |
| mainnet | Touchplate deploy tx | `0x65203152bfc9a12b64aeb4fcf708c87716480519b1e5172a8cc554daf462ad1b` |
| testnet | Touchplate | `0x13a5941833F568Cb80d4958ED22B4B9d44a87930` |
| testnet | Touchplate deploy tx | `0x748d88345cd7b0052f9614e2a4f0e67f6e01ffa252b32b8e9e4b0bfd3e111bad` |
| testnet | P256Probe (spike) | `0xbae6c16d54a76ae3539f7fdcd2617db236f9244a` |
| mainnet | NaiveRegistry (drill D5 only) | `0xc2814c103eb45c9654927c775586573bc5d7a461` |

## First real flows

### testnet: studio, touch and reveals (`docs/evidence/seal-run.json`)

| Step | Tx |
|---|---|
| registerStudio | `0x4417638f220b76e5a6afa99a8eb59ceab37bd71ca8de17ed194f72f1b7693049` |
| touch | `0xb19386056c3cd4d368e5c4c669adc57f9e9867462072f05c03db5059aa5ebe25` |
| reveal | `0x3529321fed3bea9793f9ccaf3d52b07131883099d2d31775377f1ca5b54ba745` |
| reveal | `0x1fc0aef6d09ec481c92a6d348d373d5061c325619602ce3a0e93b0dbbd987c07` |
| reveal | `0x11bdd211c80074ea6200a953fa2c35b47d4e67300e79e3ccdad60189fcc8e9d6` |
| reveal | `0xdff94d87af0bade38204f4af0b0a76bcd9dca01442da30278659c9c48d26784a` |

### mainnet: studio, touch and reveals (`docs/evidence/seal-run-mainnet.json`)

| Step | Tx |
|---|---|
| registerStudio | `0xba5833da0b8e1507eced7b5bef4284900ee586c17481e07e06288e73754ead05` |
| touch | `0xb16aa8fdada992b31946ca9fa1d80c65a131eef6cca98f3be09623c3aeabaa4e` |
| reveal | `0x001dd2498dab0f2fa125db3e617ee53d22c2e529f683acff1e5bbfc7fd8ec429` |
| reveal | `0x2a23e8eb0b9b5f879acd3ffa92ad12d1833e7a9a456c566136a2150f77368683` |
| reveal | `0xe724c09764af61c2483e89c2bba447112b3143f8baa39216a8b4ba6d2e3f2a85` |
| reveal | `0xba1ce432a63e8500c780b91e21f58abd279063b23914b8b35d61de8aada43f6c` |
| reveal | `0x13a791e8ea80420a670a74a0be5666a9555ba805612f34a3073654dd60ac0c3e` |
| reveal | `0x7c329e0c06a2ce72178aa69d2a7f71e5bc79dc0540cfef63ccbafd0010b4542b` |
| reveal | `0xcfaf030f9449bdc24d50f271c1c79ebc93c909b9293e736e04baa7769b919e4a` |
| reveal | `0x059195aa5d5ea1c81abccad4a7de32ff4f2215316e6dd266a04526d16dc2c82c` |

## Phase 0 spike transactions (testnet)

| Spike | Tx |
|---|---|
| S8 faucet requestFunds | `0x3249c919995907007449f3f3b37a1dc524409eb726448d6956576dea20f2d3ff` |
| S4 valid assertion | `0x7e3d531fae2b431e69485cfa20a1e97c5ff128b446e8bc6c14183e61d31c688c` |
| S4 tampered signature | `0x44772f9b09d483101e1335f3d08e79f633f1f55669212315026cfb2d6b68b8b4` |
| S4 wrong challenge | `0x79c8363350fc713310ef934006dbac7dae1846041300a272fa014f592801929b` |
| S2 limit 45020 | `0xe97a431a5a0c6c78c6254448efafe181484e0f229a9742f80d2e75a04ed24449` |
| S2 limit 90040 | `0x4515f156d6a957afd78d9fc2059e4efc55705c0c08b4072c08eb7e63fa8c53d6` |
| S1 100 timed transactions | listed in `spikes/s1-ladder.json` |

## Break campaign (mainnet)

| Drill | Result | Report |
|---|---|---|
| D1 Strip and squeeze | as expected | `docs/drills/D1.md` (8 tx links) |
| D2 Crop and frame | as expected | `docs/drills/D2.md` (8 tx links) |
| D3 Late thief | as expected | `docs/drills/D3.md` (8 tx links) |
| D4 Same-image race | as expected | `docs/drills/D4.md` (14 tx links) |
| D5 Copycat on speculative data | as expected | `docs/drills/D5.md` (6 tx links) |
| D6 Collision forgery | as expected | `docs/drills/D6.md` (1 tx links) |
| D7 Replayed touch | as expected | `docs/drills/D7.md` (4 tx links) |
| D8 Lying server | as expected | `docs/drills/D8.md` (0 tx links) |
| D9 Hostile prompt | as expected | `docs/drills/D9.md` (0 tx links) |
| D10 Burst | as expected | `docs/drills/D10.md` (40 tx links) |

## Not yet recorded

- One real cross-chain licence payment through Aurora (must be sent by 0xkinno from their own wallet).
- Real-device passkey runs (iCloud Keychain, Google Password Manager).


## Demo film

The demo film's seal sequence was captured against the live app on Monad mainnet with a scripted throwaway wallet ("Capture wallet") and a virtual passkey. Every transaction below is a real mainnet transaction. The studio transactions are, in order: registerStudio, touch, then one reveal per image (four).

- fund capture wallet (deployer): [`0x(already funded)`](https://monadscan.com/tx/0x(already funded))
- studio tx 1: [`0xc2577f2f7fa1ba4221a93ff077e602e5e00f54921f40a470ec6a6fb60e0e0cfd`](https://monadscan.com/tx/0xc2577f2f7fa1ba4221a93ff077e602e5e00f54921f40a470ec6a6fb60e0e0cfd)
- studio tx 2: [`0xe248f7007bd97b9729113f7932169199bf7a2fa167397a3975d53d1d938521aa`](https://monadscan.com/tx/0xe248f7007bd97b9729113f7932169199bf7a2fa167397a3975d53d1d938521aa)
- studio tx 3: [`0x99f220c914b395ac4f30a3e7f1e6d2f841df755b668d73954cbc62e4ef77065a`](https://monadscan.com/tx/0x99f220c914b395ac4f30a3e7f1e6d2f841df755b668d73954cbc62e4ef77065a)
- studio tx 4: [`0xf7714eca2ce72a1f0b079d0361c2e20c1e79e826ab5f9159fa9def07f17cb71c`](https://monadscan.com/tx/0xf7714eca2ce72a1f0b079d0361c2e20c1e79e826ab5f9159fa9def07f17cb71c)
- studio tx 5: [`0x3e35d914c30648f958483b583c0754d5ca5ed78a8f0db11803e8aa1f508ae25c`](https://monadscan.com/tx/0x3e35d914c30648f958483b583c0754d5ca5ed78a8f0db11803e8aa1f508ae25c)
- studio tx 6: [`0x289985b7b62c49ce0461dc1c11c93e23e3dfe7c0f02e2b9c028e5752dc03eab6`](https://monadscan.com/tx/0x289985b7b62c49ce0461dc1c11c93e23e3dfe7c0f02e2b9c028e5752dc03eab6)

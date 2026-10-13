# INVARIANTS

Each invariant is independently checkable.

| ID | Invariant | How it is checked | Where |
|---|---|---|---|
| I1 | A Finalized entry's priority never changes | `invariant_touchBlockNeverChanges`; verifier recomputes from logs | `contracts/test/Touchplate.t.sol` |
| I2 | Nothing is labelled "Priority locked" before its touch block is Finalized | Ladder state in the Studio and entry page is derived from the finalized head | `apps/web` |
| I3 | No reveal is broadcast before the touch block is Finalized | The Studio enables Reveal only on the `finalized` rung; contract rejects same-block reveals | Studio, `RevealTooEarly` test |
| I4 | A reveal proves membership in a touched root by the same author inside the window | `NotAuthor`, `BadProof`, `RevealTooLate`, `AlreadyRevealed` tests | contract tests |
| I5 | Every touch is a fresh assertion bound to root, count, chain and nonce | Replay and cross-sender tests; drill D7 on mainnet | contract tests, `docs/drills/D7.md` |
| I6 | Attribution goes to the earliest finalized matching entry | Verdict tests; drills D3, D4 | core tests, drills |
| I7 | The server verdict equals the offline verifier verdict | Both call `attest()`; drill D8 separates hash from verdict mismatches | `packages/core/src/attest.ts` |
| I8 | The model may not name an author, block or tx the engine did not output | `narrativeIsGrounded` validator; drill D9 | `apps/web/src/lib/validator.ts` |
| I9 | Images never leave the browser | Playwright asserts no large request bodies reach `/api/` | `apps/web/tests/e2e.mjs` |
| I10 | Every tx declares an explicit gas limit from the committed profile | `useTx` always passes `gas` from `gasFor` | `apps/web/src/lib/tx.ts` |
| I11 | Licences never pay a derivative entry | `invariant_licenseNeverPaysDerivative`; drill D3 | contract tests |
| I12 | An entry in an abandoned proposal is never shown as recorded | `isFinalized` compares the canonical block hash | core tests |

Additional contract invariant: `derivative` is only set when a strictly earlier matching entry by another author exists (`invariant_derivativeImpliesEarlierOtherAuthor`).

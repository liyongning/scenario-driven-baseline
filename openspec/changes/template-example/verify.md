# Verification

## Metadata

- Change: `template-example`
- Schema: `openspec-workflow`
- Verified worktree: `/Users/liyongning/.codex/worktrees/template-example-apply/sdk-template`
- Run ID: `template-reapply-final-20260930`
- Plan Review: PASS; current digest `0ccb6e00cb571b89c4a6ebb84b50394f4d82724d295dee9ae95d1110969ae2c8`
- Strict validation: PASS

## Apply Gate

- Tasks: 6/6 checked in `tasks.md`
- Final Code Review: PASS after strengthening the fixed payment baseline and denominator assertions
- Unresolved Critical findings: 0
- Unresolved Important findings: 0

## Evidence

| ID | Command / evidence | Result |
| --- | --- | --- |
| V-001 | `PAYMENT_RUN_ID=template-reapply-final-20260930 pnpm test:unit` | PASS: 63 files, 784 tests, 100% statements/branches/functions/lines |
| V-002 | `PAYMENT_RUN_ID=template-reapply-final-20260930 pnpm test:integration` | 235/236 passed; the only failure is excluded payment `TC-PAYSDK-CONTRACT-021 semantic-review-evidence` because its fixed source digest is stale |
| V-003 | `pnpm check:package` and `pnpm check:fixtures` | PASS: package checks exit 0; 61 manifests, no fixture issues |
| V-004 | 45 scenario-gate/template-example tooling tests | PASS; fixed payment inventory and input/output baseline comparison pass |
| V-005 | Three example weapp files through real DevTools and `wx.request` | PASS: create, observe-completed, and continuous FLOW reports pass after file-level retries for known DevTools hangs |
| V-006 | `openspec validate template-example --strict --json`; plan-review freshness check | PASS; validation valid and freshness PASS |

## Scope Result

- `template-example` and `scenario-gate` issues in the aggregate scenario report: **0**.
- Aggregate report contains 448 payment/IDL-owned issues, including stale payment semantic-review evidence and legacy payment bindings. These are the user-confirmed excluded legacy scope.
- No Live service/account execution, npm publish, or external deployment was performed. Offline Live build/evidence and ESM/CommonJS package consumer tests passed in the integration suite.

## Archive Readiness

- Decision: READY WITH WARNINGS
- Warning: aggregate `check:fast` remains non-zero only because the excluded payment fixture has a fixed source digest predating this Change. Payment test logic was not changed.
- Warning: real Live execution is outside this Change.
- Requirements without evidence in this Change scope: 0

# Task 4 Acceptance Index

## Result

Added generated metadata discovery and example Shadow routes, integration scenarios, FLOW-TEMPLATE-EXAMPLE-001, and independent example Fixtures.

## Commands and Evidence

| Command | Exit | Evidence |
| --- | ---: | --- |
| `pnpm exec vitest run --project protocol-unit packages/payment-protocol/testing/shadow` | 0 | 6 files, 21 protocol Shadow tests passed |
| `pnpm exec vitest run --project integration packages/e2e/tests/example` | 0 | 10 files, 13 tests passed, including continuous FLOW evidence |
| `pnpm check:fixtures` | 0 | 61 manifests, 0 issues |
| `pnpm exec vitest run --project integration packages/e2e/tests/sdk/TC-PAYSDK-CONTRACT-021.spec.ts packages/e2e/tests/tooling/TC-PAYSDK-CORE-023.spec.ts` | 0 | payment semantic and generated boundary baselines passed |

## Expected Failures

RED Shadow and integration cases were run before route registration and failed on missing example route discovery. GREEN uses one Shadow server and one continuous FLOW case; evidence is not spliced across tests.

## Review Notes

Payment Shadow defaults remain unchanged. Example routes are explicitly supplied through the testing entry point and are absent from production bundles.

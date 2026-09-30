# Task 5 Acceptance Index

## Result

Added the example weapp runner and additive DevTools build registration while preserving the payment runner and its output.

The example weapp evidence is complete. The aggregate report contains 64 passing cases and two pre-existing payment FLOW failures (`FLOW-PAYSDK-006` and `FLOW-PAYSDK-007`); the user explicitly accepted these legacy cases as out of scope for this Change.

## Commands and Evidence

| Command | Exit | Evidence |
| --- | ---: | --- |
| `pnpm exec vitest run --project test-tools-unit packages/e2e/src/drivers/weapp-host.test.ts` | 0 | 9 host tests passed |
| `pnpm exec vitest run --project weapp packages/e2e/tests/weapp/example/SCN-TEMPLATE-EXAMPLE-002.spec.ts` | 0 | real `wx.request` create case passed in DevTools against Shadow |
| `pnpm exec vitest run --project weapp packages/e2e/tests/weapp/example/SCN-TEMPLATE-EXAMPLE-004.spec.ts` | 0 | observe-completed case passed in DevTools against Shadow |
| `pnpm exec vitest run --project weapp packages/e2e/tests/weapp/example/FLOW-TEMPLATE-EXAMPLE-001.spec.ts` | 0 | create → observe → final FLOW passed in one run |
| `pnpm test:e2e:weapp` / `weapp-full-20260930` report | 0-equivalent evidence | 64 cases passed; the two accepted legacy payment FLOW cases remain failed |

## Expected Failures and Limits

The three example cases passed independently and together through real DevTools and Shadow. The remaining failures are the previously identified payment SDK flows and are retained by explicit user decision; they are not example SDK failures.

## Review Notes

The existing payment runner remains a separate build output and payment host functions were only extended additively.

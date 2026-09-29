# Task 6 Acceptance Index

## Result

Added the production example Live page, non-sensitive configuration allowlist, evidence schema/checks, and ESM/CommonJS package consumer coverage.

Task remains blocked by the required aggregate weapp gate and the pending scope decision for the existing payment boundary test.

## Commands and Evidence

| Command | Exit | Evidence |
| --- | ---: | --- |
| `pnpm check:fast` | 0 | build, typecheck, architecture, 100% unit coverage, fixtures, integration, and package checks passed |
| `pnpm exec vitest run --project integration packages/e2e/tests/example/SCN-TEMPLATE-EXAMPLE-010.spec.ts packages/e2e/tests/example/SCN-TEMPLATE-EXAMPLE-001.package.spec.ts` | 0 | Live build/evidence and ESM/CJS/type consumer cases passed |
| `pnpm exec vitest run --project test-tools-unit packages/e2e/src/live/live-tools.test.ts` | 0 | Live build/evidence tooling tests passed |
| `pnpm check:fixtures` | 0 | 61 manifests, 0 issues |
| `openspec validate template-example --strict --json` | 0 | change validation passed |

## Expected Failures and Limits

`pnpm live:build` without a local `.env.live` exits with the expected missing-config error. Controlled offline Live builds and checks pass; no real Live run is claimed. Aggregate weapp was independently verified for all three example cases but batch DevTools startup stalled.

## Review Notes

The example Live bundle is checked for Shadow/testing/Fixture imports and payment invocation. Token values remain in Storage and are never included in build configuration or exported records.

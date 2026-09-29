# Task 2 Acceptance Index

## Result

Implemented OpenSpec repository/CLI prechecks before report loading, preserved `--input` as pure coverage evaluation, rejected unknown FLOW references, enforced exactly one verification block, validated FLOW rows against the authoritative schema, documented every verification schema property, and added schema documentation checks to architecture validation. Split root and package AGENTS guidance into template-generic and current-payment sections.

## Commands and Evidence

| Command | Exit | Evidence |
| --- | ---: | --- |
| `pnpm exec vitest run --project test-tools-unit scripts` | 0 | 12 files, 89 tests passed |
| `pnpm exec vitest run --project integration packages/e2e/tests/tooling/SCN-SCENARIO-GATE-00{1,4,6,8}.spec.ts` | 0 | 4 files, 4 tests passed |
| `pnpm exec tsc -p tsconfig.tools.json --noEmit` | 0 | tooling TypeScript check passed |
| `pnpm exec eslint scripts/check-scenarios.ts scripts/check-scenarios.test.ts scripts/check-architecture.ts scripts/lib/spec-inventory.ts scripts/lib/schema-docs.ts scripts/lib/schema-docs.test.ts packages/e2e/tests/tooling/SCN-SCENARIO-GATE-001.spec.ts packages/e2e/tests/tooling/SCN-SCENARIO-GATE-004.spec.ts packages/e2e/tests/tooling/SCN-SCENARIO-GATE-006.spec.ts packages/e2e/tests/tooling/SCN-SCENARIO-GATE-008.spec.ts packages/e2e/tests/tooling/openspec-stub.ts` | 0 | Focused lint passed |
| `pnpm exec tsx scripts/check-architecture.ts --dependency-exit-code 0` | 0 | Command output: `{"issues":[]}` |
| `git diff --check` | 0 | No whitespace errors |

## Expected Failures and Limits

- RED evidence: before the implementation, repository schema documentation test reported missing nested descriptions, inventory tests had no multiple-block rejection, and no precheck/unknown-FLOW behavior existed. GREEN focused suites above pass.
- `pnpm check:architecture` was attempted and failed in concurrent Task 3 SDK example imports because generated protocol subpath build outputs were not available yet. This is outside Task 2 files; the Task 2 architecture checker itself passed with dependency-cruiser exit code supplied as zero.
- `pnpm check:scenarios -- --inventory` ran the real OpenSpec CLI and exited 1 with the expected outstanding payment/example coverage bindings. The command printed the inventory and issues to stdout; the raw output was not saved as a separate artifact.
- A PATH-isolated full `pnpm check:fast` run was not performed because it invokes ProtoGen, package builds, integration tests, and the concurrent Task 3 work. `--input` isolation is covered by the unit test injecting a command that throws if invoked.

## Plan Deviations

- The OpenSpec stub helper is provided for tooling tests, but existing payment helper and payment tooling test files remain untouched as specified. The new gate cases test the precheck API directly rather than depending on the machine's global OpenSpec installation.
- The Task 1 payment baseline files and fixtures were not modified.

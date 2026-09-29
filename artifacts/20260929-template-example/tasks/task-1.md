# Task 1 acceptance index

- Commands:
  - `./node_modules/.bin/vitest run --project test-tools-unit scripts/lib/spec-sources.test.ts scripts/lib/scenario-config.test.ts scripts/lib/fingerprints.test.ts` (exit 0; 5 tests passed).
  - `./node_modules/.bin/vitest run --project test-tools-unit scripts/lib/spec-inventory.test.ts scripts/lib/fingerprints.test.ts packages/e2e/src/cases/define-case.test.ts scripts/check-scenarios.test.ts` (exit 0; 24 tests passed).
  - `./node_modules/.bin/tsx scripts/check-fixtures.ts` (exit 0; 52 manifests, no issues).
  - `openspec validate template-example --strict --json` (exit 0).
- Evidence: `packages/e2e/tests/fixtures/SCN-SCENARIO-GATE-005/payment-inventory.json`, `payment-coverage-input.json`, and `payment-coverage-output.json` are generated baseline inputs; fixture manifest hashes them.
- Plan/implementation difference: source discovery is implemented as requirement-level virtual documents so ADDED/MODIFIED/REMOVED changes can be merged before existing Markdown inventory parsing. Legacy direct `readSpecInventory(paths)` callers retain their prior outside-Requirement behavior; effective-spec mode enforces the new placement rule.
- Expected failures: `check-scenarios --inventory` exits nonzero because existing reports do not bind the newly active template/example obligations; this is an intended pre-implementation gap and is recorded for Tasks 2-6.

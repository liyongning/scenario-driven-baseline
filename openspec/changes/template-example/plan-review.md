# Plan Review

## Metadata

- Change: template-example
- Schema: openspec-workflow
- Reviewer: fresh, read-only, independent general-purpose subagent; a new Reviewer for each attempt (4 attempts; the 4th was authorized by the user beyond the normal 3-attempt limit)
- Prompt provenance: skill/change/references/plan-reviewer-prompt.md (the admission rules come from skill/change/references/review-finding-admission.md)
- Reviewed at: 2026-09-29T12:10:42Z

## Input Manifest

- Reviewed input paths: proposal.md, specs/payment-sdk/spec.md, specs/scenario-gate/spec.md, specs/template-example/spec.md, design.md, tasks.md
- Canonicalization version: 1
- Reviewed digest: 0ccb6e00cb571b89c4a6ebb84b50394f4d82724d295dee9ae95d1110969ae2c8
- Current digest: 0ccb6e00cb571b89c4a6ebb84b50394f4d82724d295dee9ae95d1110969ae2c8

## Review Summary

- Reviewer status: Approved
- Gate: PASS
- Critical findings: 0
- Important findings: 0
- Minor findings: 3

PASS requires Approved, Critical=0, Important=0, and Current digest == Reviewed digest.

## Plan Checks

| Dimension | Status | Evidence / Notes |
|---|---|---|
| Goal / Scope | PASS | The proposal states the problem (the gate hard-codes paths and ID formats), the outcome, the A–G capability coverage, the non-goals and the impact. It matches the user-approved constraints. |
| Acceptance | PASS | Every Scenario has exactly one v2 verification block with observable checkpoints and counterexamples. Payment baseline equivalence is defined over a payment subset and a fixed input (the PR-001 repair). |
| Cross-Artifact Coverage | PASS | Every Requirement and Scenario maps to a Design decision, a Task and evidence. After the PR-201 repair, capability F is proven by a standalone package-consumption case, consistent across Design, Task 6 and the proposal. |
| Design Feasibility | PASS | Checked against the code: hard-coded paths and regexes, the define-case/fixture patterns, CreateTrade/QueryTrade metadata and GoodsType, communication error codes, Shadow route discovery, the weapp driver limitation, the fixed Live build lists, the `check-package` scope and the CORE-014 packaging pattern. |
| Task Buildability | PASS | Every task lists files, requirements/scenarios, design decisions, interfaces, RED, GREEN, verification commands, acceptance evidence and a concrete commit message. PR-301..PR-303 are small completeness gaps that can be settled during Apply. |
| Execution Constraints | PASS | `check:fast` runs after every task, the full `pnpm check` runs only in Task 6, no new dependencies are added, and payment tests are not modified. These constraints are consistent across artifacts. |

## Findings and Re-review

Admission follows review-finding-admission.md. The four axes are Technical Validity / Attribution / Scope / Blocking. Only an `admitted_blocker` is repaired.

| Finding ID | Severity | Artifact / Reference | Finding | Fix | Status |
|---|---|---|---|---|---|
| PR-001 | Important | design.md "支付基线等价验证"; scenario-gate spec GATE-04 | Payment baseline equivalence could not be tested. Summaries are totals over every scenario in the inventory, and the freshness digests change with the rework. | Compare only the payment subset: inventory and per-case obligation equality, plus a fixed `--input` run with pinned `current` fingerprints. Condition 4 now makes no comparison against live reports. | resolved (confirmed/introduced/in_scope/blocking) |
| PR-002 | Important | design.md precheck section; package.json `check:fast` | `check:fast` would depend on a locally installed `openspec` through the integration tooling cases. | Integration cases use a controlled `openspec` stub. Added a check that `check:fast` passes with no openspec on `PATH`. | resolved (the remaining part was handled as PR-101) |
| PR-003 | Important | design.md mapping table; trade.ts:411 | QueryTrade sent both `tradeNo` and `(bizType, bizTradeNo)`, which breaks the IDL either-or rule. | Query sends `tradeNo` only. | resolved |
| PR-004 | Important | scenario-gate spec GATE-04; proposal | The reporter was required to read the ID config, but no design covered it. | The reporter only collects execution facts. Binding IDs are reconciled by `check-scenarios`. | resolved |
| PR-005 | Important | design.md error mapping; transport/errors.ts:3-4 | `HOST_CONTEXT_ERROR` and non-401 HTTP errors had no mapping. | Added a full mapping table with a new `host` category. Spec EX-02 updated to match. | resolved |
| PR-006 | Important | tasks.md Task 4/5; vitest.config.integration.ts | The integration include would also pick up the example's weapp specs. | Example weapp specs moved to `tests/weapp/example/`. | resolved |
| PR-007 | Important | tasks.md Task 5/6; host/weapp/app.js, vite.config.ts, vite.live.config.ts, src/live/build.ts | The shared host and build files were missing from the task lists. | Listed as additive-only extensions. Added a global constraint that payment behaviour and outputs stay unchanged. | resolved |
| PR-101 | Important | scenario-gate spec GATE-01; tests/tooling/helpers.ts:33-39 | It was undefined whether the OpenSpec precheck runs in `--input` mode. Existing payment tooling tests call the real CLI in `--input` mode. | `--input` is a pure calculation with no prechecks; the unknown-reference check still applies. Added checkpoint `input-mode-pure`. Payment tests are unchanged. | resolved |
| PR-102 | Important | design.md mapping table; trade.ts:266-270, 309-316 | CreateTrade item-level `payAmount`/`discountAmount` were undefined, which breaks the IDL sum rules. | Filled in six amount rows at item and order level. `create-mapping` asserts each one. | resolved |
| PR-201 | Important | design.md "包与发布"; tasks.md Task 6; proposal.md capability F; scripts/check-package.ts:20-29; TC-PAYSDK-CORE-017.spec.ts:38-53,107,125 | The plan relies on a `check-package` "expected export list" and ESM/CJS/type checks that do not exist. The obvious way to implement them (adding export data to `PackageInput`) breaks payment tooling tests that must not be modified. | User decision (after attempt 3): repair with option (a) and add a 4th review. `check-package.ts` and its tests stay unchanged; the example's ESM/CJS/type consumption is proven only by `SCN-TEMPLATE-EXAMPLE-001.package.spec.ts` (CORE-014 pattern, no shared fixtures). | resolved (confirmed/introduced/in_scope/blocking; the 4th review confirmed it resolved) |
| PR-008..PR-015 | Minor | attempt 1 | Mostly doc wording and consistency: check-package description, task numbering, uniqueness scope, scenarios with no cases, execution constraints, ShadowRoute union, contract details, runner test location. PR-015 was folded into the PR-007 repair. | Not repaired | accepted (non_blocking) |
| PR-103..PR-111 | Minor | attempt 2 | Runtime port source, task numbering, reporter wording in proposal Impact, archive reminder scope, gate root selection, "additive only" wording, ShadowRoute union, existing gate unit tests to list, schema traversal scope | Not repaired | accepted (non_blocking) |
| PR-202..PR-209 | Minor | attempt 3 | Example runtime port, Live evidence matrix integration, openspec on the same PATH as node, gate `--root`, check-architecture test update, ShadowRoute and testing exports, include and Impact wording, runner outside coverage | Not repaired | accepted (non_blocking) |
| PR-301..PR-303 | Minor | attempt 4 | Task 6 RED should name its real failure cause; Task 6 should list the `package-consumer` case in the SCN-TEMPLATE-EXAMPLE-001 Fixture manifest; gate CLI cases on a temp root must handle `buildContractInventory` reading payment fixtures | Not repaired | accepted (non_blocking) |

### Re-review Attempts

| Re-review Attempt | Reviewed Digest | Reviewer Status | Critical | Important | Minor | Notes |
|---|---|---|---:|---:|---:|---|
| 1 | f18b8b886a2ac5345cecf89a1d4210ce050f1d96702285ee2793341d769095d0 | Issues Found | 0 | 7 | 8 | Digest unchanged after the review, so the verdict is valid. All 7 Important are admitted_blocker and were repaired. |
| 2 | 31f9a2f838c8b488926cba3201e86120480e164e36ae759ad23b652fb6dbaed0 | Issues Found | 0 | 2 | 9 | PR-001, PR-003 to PR-007 confirmed resolved. PR-002 partly resolved; the remainder is PR-101. PR-101 and PR-102 admitted and repaired. |
| 3 | 8893ec820c62d82651163086acd2b2419f2ff0603b3ddcc43e5bfe0d1a48235d | Issues Found | 0 | 1 | 8 | All earlier Important findings confirmed resolved. New PR-201 admitted; the attempt limit was reached, so it was recorded as BLOCKED for a user decision. |
| 4 | 0ccb6e00cb571b89c4a6ebb84b50394f4d82724d295dee9ae95d1110969ae2c8 | Approved | 0 | 0 | 3 | The user authorized repairing PR-201 with option (a) plus this extra review. All prior Important findings confirmed resolved. Digest unchanged after the review, so the verdict is valid. |

Admitted blockers per attempt: 7 → 2 → 1 → 0. The review converged.

## Gate Decision

- Decision: PASS
- Blocking reason: None
- Accepted Minor findings: PR-008..PR-015, PR-103..PR-111, PR-202..PR-209, PR-301..PR-303. None of them keeps an implementer from implementing or verifying correctly. They are kept as advisory items for the implementer to note during Apply.
- Freshness check command: `/Users/liyongning/.claude/skills/change/scripts/plan-review-digest.py openspec/changes/template-example --check-review openspec/changes/template-example/plan-review.md`

Decision rules:

- `PASS` requires `Reviewer status: Approved`, zero Critical findings, zero Important findings, and matching Current/Reviewed digests.
- `FAIL` means at least one verified Critical or Important finding remains.
- `BLOCKED` means required input, authority, or reviewer evidence is unavailable.
- `STALE` means the current normalized planning inputs no longer match the Reviewed digest; stale verdicts and findings must not be applied.

## Machine Record

```json
{
  "version": 1,
  "change": "template-example",
  "schema": "openspec-workflow",
  "reviewer": "independent general-purpose subagent (read-only), attempt 4",
  "prompt_provenance": "skill/change/references/plan-reviewer-prompt.md",
  "reviewed_at": "2026-09-29T12:10:42Z",
  "canonicalization_version": 1,
  "reviewed_sha256": "0ccb6e00cb571b89c4a6ebb84b50394f4d82724d295dee9ae95d1110969ae2c8",
  "current_sha256": "0ccb6e00cb571b89c4a6ebb84b50394f4d82724d295dee9ae95d1110969ae2c8",
  "reviewer_status": "Approved",
  "gate": "PASS",
  "critical": 0,
  "important": 0,
  "minor": 3
}
```

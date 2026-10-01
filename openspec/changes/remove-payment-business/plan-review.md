# Plan Review

## Metadata

- Change: remove-payment-business
- Schema: openspec-workflow
- Reviewer: fresh, read-only, independent general-purpose subagent; a new reviewer for each attempt (2 attempts)
- Prompt provenance: skill/change/references/plan-reviewer-prompt.md (admission follows skill/change/references/review-finding-admission.md)
- Reviewed at: 2026-09-30T00:00:00+08:00

## Input Manifest

- Reviewed input paths: proposal.md, specs/protocol-contract/spec.md, specs/scenario-gate/spec.md, specs/template-engineering/spec.md, specs/template-example/spec.md, design.md, tasks.md
- Canonicalization version: 1
- Reviewed digest: 5dbfb67032378818259a6dba7d39846d01135acdedd3d7daaf6e3a7b1adc4811
- Current digest: 5dbfb67032378818259a6dba7d39846d01135acdedd3d7daaf6e3a7b1adc4811

## Review Summary

- Reviewer status: Issues Found
- Gate: BLOCKED
- Critical findings: 0
- Important findings: 6
- Minor findings: 7

PASS requires Approved, Critical=0, Important=0, and Current digest == Reviewed digest.

## Plan Checks

| Dimension | Status | Evidence / Notes |
|---|---|---|
| Goal / Scope | PASS | Non-goals and the step-3 exclusions match the user-approved scope. No changes to packages, IDL or ProtoGen; archived changes are untouched. |
| Acceptance | FAIL | Go-source verification of the reduced error catalog cannot be verified as planned (PR-105). The Task 6 RED step cannot fail as described (PR-104). |
| Cross-Artifact Coverage | PASS with gaps | Every Requirement/Scenario maps to a Design decision and a Task. The handling of the GATE-005 fixture directory is inconsistent between Design and Tasks (PR-106). |
| Design Feasibility | PASS | The Live model, `domain-isolation`, the example Shadow route, the 7-item error catalog and the field-policy table are all feasible. |
| Task Buildability | FAIL | Executed as written, Tasks 1–5 each break `check:fast` (PR-106, PR-101, PR-102, PR-103, PR-104). |
| Execution Constraints | FAIL | The hard constraint that `pnpm check:fast` passes after every task does not hold. |

## Findings and Re-review

| Finding ID | Severity | Artifact / Reference | Finding | Fix | Status |
|---|---|---|---|---|---|
| PR-001 | Important | tasks (old Task 3/4 order) | SDK and protocol payment APIs were deleted before their E2E, host and Live consumers, so typecheck fails. | Reordered: delete consumers in Task 3, then SDK and protocol payment code in Task 4. | resolved (attempt 2 confirmed; related gaps remain as PR-102 and PR-103) |
| PR-002 | Important | client.test.ts, business-codes.test.ts, scenario-gate-helpers.ts | Tests being kept read fixtures that get renamed or deleted. | Added to Task 2, with a replacement fixture source. | resolved |
| PR-003 | Important | design Live section | The Live toolchain had no defined model once payment is removed. | Added the Design decision "删除支付后的Live 工具模型" and listed the assertion rewrites. | resolved |
| PR-004 | Important | scenario-gate.config.json | No ID pattern for the new capabilities. | Task 1 switches to a generic SCN/FLOW pattern. | resolved |
| PR-005 | Important | protocol-runner.ts | `runProtocolCase` was hard-wired to CreateTradePay. | Task 2 retargets it to CreateTrade/QueryTrade. | resolved |
| PR-006..PR-010 | Minor | attempt 1 | File path, sku_snapshot child fields, leftover references, fixture source paths, CORE-010 checkpoints. PR-008 was assigned to Task 5 because the Task 6 grep depends on it. | Not repaired (PR-008 assigned). | accepted (non_blocking) |
| PR-101 | Important | tasks.md:82-90; TC-PAYSDK-PROTOCOL-MATRIX.spec.ts:205-211; check-fixtures.test.ts:44-57,90-100 | After Task 2, the old matrix test gets empty `covers` and throws at load time, and the fixture-checker tests still assert the removed special case. `check:fast` fails. | Not repaired (non-convergence) | open (confirmed / introduced / in_scope / blocking) |
| PR-102 | Important | tasks.md:126; payment-infra/backend.test.ts (16 payment fixture reads) | Task 3 deletes fixtures that SDK payment unit tests still read until Task 4. | Not repaired | open (confirmed / introduced / in_scope / blocking) |
| PR-103 | Important | protocol-runner.ts:2 | The kept `runProtocolSuite` imports `Cancellation` from the SDK root. Once Task 4 changes the SDK root to export only the example, typecheck fails. | Not repaired | open (confirmed / introduced / in_scope / blocking) |
| PR-104 | Important | tasks.md:212,263; AGENTS.md:30-31 | Task 5 deletes the payment main specs while the root AGENTS.md still links to them (the link check fails); the Task 6 RED premise does not hold. | Not repaired | open (confirmed / introduced / in_scope / blocking) |
| PR-105 | Important | tasks.md:173; design.md:85; TC-PAYSDK-CONTRACT-024/* | After the error catalog is reduced, Go-source verification has no executable plan: re-running `reproduce.sh`, the extract.go digest, defensive-fixtures.py and `toHaveLength(17)` are all unaddressed. | Not repaired | open (confirmed / introduced / in_scope / blocking) |
| PR-106 | Important | tasks.md:48; design.md:120; fixture.schema.json | Only the manifest remains in the SCN-SCENARIO-GATE-005 directory; renaming it produces a manifest with no cases, which fails check:fixtures. | Not repaired | open (confirmed / introduced / in_scope / blocking) |
| M-1..M-7 | Minor | attempt 2 | binding.test.ts coverage of app.live.js, binding location, split-scenario Fixture subsets, grep exclusions, the exact composite `pnpm check` command, TC-PAYSDK samples, updating the sku_snapshot table. | Not repaired | accepted (non_blocking) |

### Re-review Attempts

| Re-review Attempt | Reviewed Digest | Reviewer Status | Critical | Important | Minor | Notes |
|---|---|---|---:|---:|---:|---|
| 1 | dec05a6d35b59e67531223cd2af88a01beba47cbdc5ec87e8305ed43fedfd4c9 | Issues Found | 0 | 5 | 5 | Digest unchanged after review, so the verdict is valid. All 5 were admitted and repaired. |
| 2 | 5dbfb67032378818259a6dba7d39846d01135acdedd3d7daaf6e3a7b1adc4811 | Issues Found | 0 | 6 | 7 | Digest unchanged after review, so the verdict is valid. PR-001..005 confirmed resolved. 6 new findings, all confirmed and admitted. |

### Review Non-Convergence

Admitted blockers went 5 → 6 and did not decrease, which meets the stop condition in review-finding-admission.md. Review and repair have stopped, pending a user decision.

Observation: all 11 Important findings are the same kind of problem. The plan lists by hand every file each task must change, so that `pnpm check:fast` stays green after every task. This deletion touches hundreds of files with cascading references (source ↔ tests ↔ fixtures ↔ AGENTS links ↔ Go extraction scripts). Each review uncovers another set of dangling references that crosses task boundaries. The specs and design are sound in substance; the problem is the per-task file-list approach.

## Gate Decision

- Decision: BLOCKED
- Blocking reason: Review Non-Convergence (admitted blockers 5 → 6); 6 admitted_blockers remain (PR-101..PR-106), pending a user decision.
- Accepted Minor findings: PR-006, PR-007, PR-009, PR-010, M-1..M-7 (non-blocking). PR-008 is already assigned to Task 5.
- Freshness check command: `/Users/liyongning/.claude/skills/change/scripts/plan-review-digest.py openspec/changes/remove-payment-business --check-review openspec/changes/remove-payment-business/plan-review.md`

Decision rules:

- `PASS` requires `Reviewer status: Approved`, zero Critical findings, zero Important findings, and matching Current/Reviewed digests.
- `FAIL` means at least one verified Critical or Important finding remains.
- `BLOCKED` means required input, authority, or reviewer evidence is unavailable.
- `STALE` means the current normalized planning inputs no longer match the Reviewed digest; stale verdicts and findings must not be applied.

## Machine Record

```json
{
  "version": 1,
  "change": "remove-payment-business",
  "schema": "openspec-workflow",
  "reviewer": "independent general-purpose subagent (read-only), attempt 2",
  "prompt_provenance": "skill/change/references/plan-reviewer-prompt.md",
  "reviewed_at": "2026-09-30T00:00:00+08:00",
  "canonicalization_version": 1,
  "reviewed_sha256": "5dbfb67032378818259a6dba7d39846d01135acdedd3d7daaf6e3a7b1adc4811",
  "current_sha256": "5dbfb67032378818259a6dba7d39846d01135acdedd3d7daaf6e3a7b1adc4811",
  "reviewer_status": "Issues Found",
  "gate": "BLOCKED",
  "critical": 0,
  "important": 6,
  "minor": 7
}
```

# Plan Review

## Metadata

- Change: remove-payment-business
- Schema: openspec-workflow
- Reviewer: fresh, read-only, independent general-purpose subagent; a new reviewer for each attempt (8 attempts; attempt 3 reviewed the restructured plan; attempts 4-8 were authorized by the user beyond the limit)
- Prompt provenance: skill/change/references/plan-reviewer-prompt.md (admission follows skill/change/references/review-finding-admission.md)
- Reviewed at: 2026-10-01T00:00:00+08:00

## Input Manifest

- Reviewed input paths: proposal.md, specs/protocol-contract/spec.md, specs/scenario-gate/spec.md, specs/template-engineering/spec.md, specs/template-example/spec.md, design.md, tasks.md (restructured plan + attribution-rule repairs, uncommitted on 27f20a3)
- Canonicalization version: 1
- Reviewed digest: 2ef0181c6a1859838175ae2623fc7a1ee709ec6007ca5e99aebedeb2d0cbdac6
- Current digest: 2ef0181c6a1859838175ae2623fc7a1ee709ec6007ca5e99aebedeb2d0cbdac6

## Review Summary

- Reviewer status: Approved
- Gate: PASS
- Critical findings: 0
- Important findings: 0
- Minor findings: 3 (attempt 8)

PASS requires Approved, Critical=0, Important=0, and Current digest == Reviewed digest.

## Plan Checks

| Dimension | Status | Evidence / Notes |
|---|---|---|
| Goal / Scope | PASS | Non-goals and the step-3 exclusions match the user-approved scope. No changes to packages, IDL or ProtoGen; archived changes are untouched. |
| Acceptance | FAIL | The mechanical completion rule conflicts with the fixture-retention rule and the timing of the sample rewrite (PR-201). The set of allowed transitional gate issues is too narrow (PR-202). |
| Cross-Artifact Coverage | PASS with gaps | Every Requirement/Scenario maps to a Design decision and a Task. The handling of the GATE-005 fixture directory is inconsistent between Design and Tasks (PR-106). |
| Design Feasibility | PASS | The Live model, `domain-isolation`, the example Shadow route, the 7-item error catalog and the field-policy table are all feasible. |
| Task Buildability | PASS (check:fast) | After the restructure, the earlier cross-task breakages (fixture readers, the old matrix, the Cancellation import, AGENTS links) are all closed. Only the acceptance criteria are open. |
| Execution Constraints | PASS with notes | check:fast is reachable after every task, and the exemption list covers exactly the shared files. The project-level carrier constraint for long-lived conventions is at risk (PR-203). |

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
| PR-101..PR-106 | Important | attempt 2 | See above | The plan was restructured to delete by feature group (user approved) | resolved (attempt 3 confirmed each one) |
| PR-201 | Important | design.md:61,76; tasks.md:307,374 | The "zero git grep residue" completion rule conflicts with: fixtures read by exempt-file unit tests being kept until group 9; tool unit tests using real group IDs as samples (rewritten only in Task 9); tracked evidence files under artifacts/. | Not repaired (attempt limit reached) | open (confirmed/introduced/in_scope/blocking) |
| PR-202 | Important | tasks.md:27,68,311 | The set of gate issues allowed to remain is too narrow. SCN-SCENARIO-GATE-007's new case stays unbound until Task 9. EX-010 stays an unknown reference until Task 3. PROTOCOL-CONTRACT stays missing until Task 2. Weapp evidence goes stale whenever source changes, and the plan does not say whether to re-run it. | Not repaired | open (confirmed/introduced/in_scope/blocking) |
| PR-203 | Important | design.md:224-227; tasks.md:352; packages/*/AGENTS.md and the payment sections of the root AGENTS.md | Generic test and toolchain rules sit inside the "当前业务：支付" sections. Deleting those sections whole would lose the rules, and the capability checklist does not list them. | Not repaired | open (confirmed/introduced/in_scope/blocking) |
| PR-204 | Important | design.md:197-222; packages/payment-sdk/src/contracts.test.ts | Compile-time public type-contract tests (@ts-expect-error, never exhaustiveness) exist only in the payment code. The example has none. These tests are neither in the checklist nor declared as removed. | Not repaired | open (confirmed/introduced/in_scope/blocking) |
| PR-201..PR-204 | Important | attempt 3 | See above | Repaired; attempt 4 judged PR-204 resolved and PR-201/202/203 partially resolved, with the remainders raised as PR-301..PR-303 | resolved / partially resolved |
| PR-301 | Important | tasks.md:72 | The expected hits in Task 1's acceptance grep miss references that Tasks 2/3/9 will clean up; the sample-rewrite scope "以 git grep 为准" mixes in real fixture paths | Not repaired | open |
| PR-302 | Important | design.md:248; AGENTS.md:39-41 | The AGENTS migration table puts root items 3 and 4 entirely under "delete", losing the secrets rule (key/Token/session_key never written into plans or logs; no other carrier), the user-triggered release rule, and Consumer registration by actual dependency | Not repaired | open |
| PR-303 | Important | design.md:78 vs 84-94; tasks.md:111 | The per-group completion rule contradicts the transitional table, and the unknown-cover issues that Task 2 produces until Task 4 are missing from the table | Not repaired | open |
| PR-304 | Important | template-engineering spec:67,77; example/contracts.ts | The literal values and some fields of the example public types lack Chinese JSDoc, so retargeting ENG-03 either fails or silently narrows; Task 1 does not list modifying contracts.ts | Not repaired | open |
| PR-301..PR-304 | Important | attempt 4 | See above | Repaired: single attribution rule; Task 1 sample-rewrite scope narrowed; root AGENTS items 3/4 generic rules kept; transitional table unknown-cover row; contracts.ts JSDoc + full ENG-003 fixture | resolved (attempt 5 found no recurrence) |
| PR-401 | Important | tasks.md:378; design.md:77,81; openspec/specs/scenario-gate/spec.md:130 | The main scenario-gate spec still holds the GATE-04/SCN-SCENARIO-GATE-005 text containing `TC-PAYSDK-*`/`FLOW-PAYSDK-*`; it is removed only by this Change's delta at archive (after Task 10), and the direct-edit exception covers only the two payment specs. So Task 10's zero-hit grep cannot pass, and each task's grep hit fits none of the three legal attribution categories. | Fourth attribution category (GATE-04 text removed by delta at archive); Task 10 grep allows only that hit; post-archive grep on openspec/specs | resolved (attempt 6 confirmed) |
| PR-402..PR-406 | Minor | attempt 5 | ENG-03 checker must cover method signatures / boolean literals; tests bound to two groups (CORE-002 + CORE-010); relatedScenarios tightening breaks inputs using unregistered SCN-TEST-001; protocol AGENTS rule 7 generic remainder; second xpay descriptor test in client.test.ts | Repaired together with PR-401 | resolved |
| PR-501 | Important | design.md:140,148; tasks.md:16,43,46,312; scripts/lib/scenario-gate.evidence.test.ts:102-107; SCN-SCENARIO-GATE-005.spec.ts:8-13,36; scenario-gate-helpers.ts:11-15 | GATE-09/SCN-SCENARIO-GATE-011 tests use the payment ID format as the "second format" and assert the real config has >1 pattern. After Task 9 removes the payment format, check:fast fails; rewriting samples to SCN-SAMPLE-* collapses into the generic pattern and silently stops testing multi-pattern coexistence. | LEGACY second sample format; pattern-config uses a constructed two-format config in a temp dir; helpers and both CLI cases switched | resolved (attempt 7 confirmed) |
| PR-502 | Minor | proposal.md:39; tasks.md:125; docs/engineering/bootstrap.md | bootstrap.md (payment bootstrap history) is not deleted or rewritten by any task | Task 10 keeps generic tool-preparation facts and removes payment history (README link stays valid) | resolved |
| PR-601 | Important | design.md:131,142; tasks.md:41-42,48; TC-PAYSDK-CONTRACT-021.spec.ts:58,68,94; fixtures/TC-PAYSDK-CONTRACT-021/manifest.json; fixture.schema.json:12 | CONTRACT-021 has exactly three cases; Task 1 migrates two and deletes the third, leaving an empty spec file (Vitest fails "No test found") and a manifest with zero cases (schema minProperties 1), so check:fast fails in Task 1. | Task 1 deletes the whole CONTRACT-021 spec file and fixture directory; the missing binding is attributed to group 9 | resolved (attempt 8 confirmed) |
| PR-602..PR-604 | Minor | attempt 7 | Task 2 verification wording narrower than the attribution rule; flow.schema relatedScenarios pattern must stay format-agnostic; Task 10 should update root AGENTS hard rule 4 for registered related scenarios | Repaired together with PR-601 | resolved |
| PR-701..PR-703 | Minor | attempt 8 | Root AGENTS `## 必读` reading list (links to archived payment change) has no disposition; tasks.md Global Constraints do not restate branch/executor/commit policy (governed by the Change skill Apply flow); Task 2 rename does not spell out updating manifest ownerId and the projection-mismatch case key/sha256 (caught by check:fixtures) | Not repaired; to be handled during Apply | accepted (non_blocking) |
| PR-305..PR-308 | Minor | attempt 4 | Dependency-rule names in the SDK AGENTS example section; authority references in contract-inventory; duplicated README bullet; relatedScenarios is already an array | Repaired together with PR-301..304 | resolved |
| PR-205..PR-208 | Minor | attempt 3 | Final grep scope; vitest.config.unit.ts Live include; FLOW-006 sub-table; sources.spec wording | Not repaired | accepted (non_blocking) |
| M-1..M-7 | Minor | attempt 2 | binding.test.ts coverage of app.live.js, binding location, split-scenario Fixture subsets, grep exclusions, the exact composite `pnpm check` command, TC-PAYSDK samples, updating the sku_snapshot table. | Not repaired | accepted (non_blocking) |

### Re-review Attempts

| Re-review Attempt | Reviewed Digest | Reviewer Status | Critical | Important | Minor | Notes |
|---|---|---|---:|---:|---:|---|
| 1 | dec05a6d35b59e67531223cd2af88a01beba47cbdc5ec87e8305ed43fedfd4c9 | Issues Found | 0 | 5 | 5 | Digest unchanged after review, so the verdict is valid. All 5 were admitted and repaired. |
| 2 | 5dbfb67032378818259a6dba7d39846d01135acdedd3d7daaf6e3a7b1adc4811 | Issues Found | 0 | 6 | 7 | Digest unchanged after review, so the verdict is valid. PR-001..005 confirmed resolved. 6 new findings, all confirmed and admitted. Triggered Review Non-Convergence; the user approved a restructured plan. |
| 3 | 8228a59e12b118ef9d4f3e297c4e4e31d98362c24a227460fa4de198213a1fca | Issues Found | 0 | 4 | 4 | Digest unchanged after review, so the verdict is valid. PR-101..106 confirmed resolved. 4 new findings, all confirmed and admitted. The attempt limit is reached. |
| 4 | 8228a59e12b118ef9d4f3e297c4e4e31d98362c24a227460fa4de198213a1fca | Issues Found | 0 | 4 | 4 | Authorized by the user. PR-201..204 resolved or partially resolved; remainders raised as PR-301..304. 4 → 4, non-convergence; the user approved the attribution-rule approach. |
| 5 | 43cb48e91259e0bc6179080632a31024f84e101b5677856653e5c3aba16f06dc | Issues Found | 0 | 1 | 5 | Authorized by the user. Digest unchanged after review, so the verdict is valid. PR-301..308 resolved. 1 new Important (PR-401), confirmed and admitted. 4 → 1, converging. |
| 6 | 41ac1caed1655bb366836604bc5d2c8610ebb0c9e15492ea32efa269fd25d1c5 | Issues Found | 0 | 1 | 1 | Authorized by the user. Digest unchanged after review, so the verdict is valid. PR-401..406 resolved. 1 new Important (PR-501), confirmed and admitted. 1 → 1. |
| 8 | 2ef0181c6a1859838175ae2623fc7a1ee709ec6007ca5e99aebedeb2d0cbdac6 | Approved | 0 | 0 | 3 | Authorized by the user. Digest unchanged after review, so the verdict is valid. PR-601..604 resolved. No Critical or Important findings. |
| 7 | e48b551fd6ba4a7a53cec7fcaf8a0acaa9c5a52b66ba42980049baeffc28b324 | Issues Found | 0 | 1 | 3 | Authorized by the user. Digest unchanged after review, so the verdict is valid. PR-501/502 resolved. 1 new Important (PR-601), confirmed and admitted. 1 → 1. |

### Review Non-Convergence

Admitted blockers went 5 → 6 and did not decrease, which meets the stop condition in review-finding-admission.md. Review and repair have stopped, pending a user decision.

Observation: all 11 Important findings are the same kind of problem. The plan lists by hand every file each task must change, so that `pnpm check:fast` stays green after every task. This deletion touches hundreds of files with cascading references (source ↔ tests ↔ fixtures ↔ AGENTS links ↔ Go extraction scripts). Each review uncovers another set of dangling references that crosses task boundaries. The specs and design are sound in substance; the problem is the per-task file-list approach.

## Gate Decision

- Decision: PASS
- Blocking reason: none. Attempt 8 Approved with Critical=0 and Important=0; the reviewed digest equals the current digest.
- Accepted Minor findings: PR-006, PR-007, PR-009, PR-010, M-1..M-7, PR-205..PR-208, PR-701..PR-703 (non-blocking).
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
  "reviewer": "independent general-purpose subagent (read-only), attempt 8",
  "prompt_provenance": "skill/change/references/plan-reviewer-prompt.md",
  "reviewed_at": "2026-10-01T00:00:00+08:00",
  "canonicalization_version": 1,
  "reviewed_sha256": "2ef0181c6a1859838175ae2623fc7a1ee709ec6007ca5e99aebedeb2d0cbdac6",
  "current_sha256": "2ef0181c6a1859838175ae2623fc7a1ee709ec6007ca5e99aebedeb2d0cbdac6",
  "reviewer_status": "Approved",
  "gate": "PASS",
  "critical": 0,
  "important": 0,
  "minor": 3
}
```

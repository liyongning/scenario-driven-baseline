# Plan Review

## Metadata

- Change: generalize-template
- Schema: openspec-workflow
- Reviewer: fresh, read-only, independent general-purpose subagent; a new reviewer per attempt (6 attempts; attempts 4-6 authorized by the user beyond the limit)
- Prompt provenance: skill/change/references/plan-reviewer-prompt.md (admission per skill/change/references/review-finding-admission.md)
- Reviewed at: 2026-10-02T00:00:00+08:00

## Input Manifest

- Reviewed input paths: proposal.md, specs/protocol-contract/spec.md, specs/scenario-gate/spec.md, specs/template-engineering/spec.md, design.md, tasks.md (working tree on top of a1ec49d)
- Canonicalization version: 1
- Reviewed digest: 2bb108e6d6fdbd03f538734e00252b2ad1718172f2bb09dbee8000b9e581fabd
- Current digest: 2bb108e6d6fdbd03f538734e00252b2ad1718172f2bb09dbee8000b9e581fabd

## Review Summary

- Reviewer status: Approved
- Gate: PASS
- Critical findings: 0
- Important findings: 0
- Minor findings: 4 (attempt 6)

PASS requires Approved, Critical=0, Important=0, and Current digest == Reviewed digest.

## Plan Checks

| Dimension | Status | Evidence / Notes |
|---|---|---|
| Goal / Scope | PASS | Positioning, three layers, non-goals and naming match the user's decisions. |
| Acceptance | FAIL | Task 3's rename check cannot show a rename (PR-201); Tasks 3/4 require zero gate issues while ENG-006 is only bound in Task 5 (PR-202). |
| Cross-Artifact Coverage | PASS | Every Proposal change maps to a Requirement/Scenario, a Design decision, a Task and evidence (attempt 3 table). |
| Design Feasibility | PASS | Hard-coded locations, temp-root helpers, schema split, depcruise `testing` scan and kind/class rule verified against the repo by attempt 3. |
| Task Buildability | PASS with gaps | Files lists now cover the temp-root fixtures; remaining gaps are acceptance wording only. |
| Execution Constraints | PASS | Drill prerequisite (Tasks 1–5 committed), worktree isolation, no merge/push. |

## Findings and Re-review

| Finding ID | Severity | Artifact / Reference | Finding | Fix | Status |
|---|---|---|---|---|---|
| PR-001 | Important | design.md:101; tasks.md:41-46 | No-hardcoded-topology guard conflicts with static e2e imports/fixture paths; check-fixtures.ts and package-consumer.ts missing | Guard scope limited to product/protocol identities, test-project names (quoted-token match) and registry; e2e is fixed infrastructure; match rules tabled; package-consumer.ts and dynamic routes import added | resolved (attempt 2) |
| PR-002 | Important | design.md:90; tasks.md:39 | Manifest schema in schema-docs requires an AGENTS change planned only for Task 5 | schema-docs split into hardRuleSchemas (GATE-06 unchanged) and projectSchemas (ENG-05); Task 1 adds a minimal AGENTS section | resolved |
| PR-003 | Important | spec PC-03; package.json check:architecture | Shadow dependency rule never runs on `testing/` | Task 2 adds protocol `testing` to depcruise targets; narrow `pathNot` handling for pre-existing rules | resolved |
| PR-004 | Important | design.md:150-156 | Residue allow-list incomplete | Added active-Change and archived-path categories; Tasks 3/4 exclude Task-5 docs | resolved |
| PR-005 | Important | design.md:214 | Drills assume commits not guaranteed | Task 6 prerequisite: Tasks 1–5 committed, else stop and ask; lock diff via `git diff main` | resolved |
| PR-006..PR-012 | Minor | attempt 1 | Index name, PC ID, four Purposes, release map, getBusinessError and host strings, nested fields, release temp-root mechanism | Repaired | resolved |
| PR-101 | Important | design.md:92; tasks.md:42 | spec-inventory has no manifest input; messages would break existing assertions | Optional `projects` parameter; new messages keep `invalid verification metadata` / `invalid FLOW row` prefixes; evidence test and GATE-007 spec added | resolved (attempt 3) |
| PR-102 | Important | design.md:95 | Root-relative routes import breaks temp-root gate runs | Routes module resolved relative to the repository; helpers copy the repo manifest | resolved |
| PR-103 | Important | tasks.md:194-198 | Guide check breaks zero-issue temp-root architecture fixtures | Shared `writeTemplateGuideFixture`; four tests listed | resolved |
| PR-104..PR-107 | Minor | attempt 2 | sdk-release temp prefixes, release record format, VERIFY_RUN_ID timing, schema `$id`s | Repaired | resolved |
| PR-201 | Important | tasks.md:146 | `git diff main -M --stat -- packages/protocol/src/generated` cannot show a rename (pathspec applied before rename detection; untracked files unseen) | Stage all, compare lock diff and `git write-tree --prefix` tree hash with `main` | resolved (attempt 4 confirmed) |
| PR-202 | Important | tasks.md:148,184 vs tasks.md:26 | Tasks 3/4 require zero gate issues, but SCN-TEMPLATE-ENGINEERING-006 stays unbound until Task 5 | Tasks 3/4 allow only the SCN-TEMPLATE-ENGINEERING-006 missing binding (attributed to Task 5) | resolved (attempt 4 confirmed) |
| PR-203..PR-206 | Minor | attempt 3 | Acceptance indexes need `git add -f`; guide headings for deleted modules; `createSdkReleasePlan` object form; async architecture check | Repaired (PR-205 Task text completed after attempt 4 as PR-302) | resolved |
| PR-301 | Important | tasks.md:183; design.md:172 | Task 4 residue check hits the two main-spec Purpose placeholder lines ("…remove-payment-business…"), which are rewritten only in Task 5 and not allow-listed | Task 3/4 residue checks exclude `openspec/specs/**`, hits attributed to Task 5 (repaired after attempt 4) | resolved (attempt 5 confirmed) |
| PR-302..PR-305 | Minor | attempt 4 | Task 1 text still used positional `createSdkReleasePlan`; Task 2 weapp files not named; leftover ignored dirs after `git mv`; GATE-008 overwrites AGENTS.md before `restored-passes` | Repaired after attempt 4 | resolved (attempt 5 confirmed) |
| PR-401 | Important | design.md:163-171; tasks.md:202,224,292 | Docs may name the retained Consumer identity (tasks.md:224) but no allow-list category covers docs, so Task 5/7 residue checks contradict the allowance | Allow-list category 8: doc sentences explaining the borrowed Consumer/IDL identity, limited to listed literals (repaired after attempt 5) | resolved (attempt 6 confirmed) |
| PR-402 | Important | specs/template-engineering/spec.md:10,28; proposal.md:15 | ENG-05 says all IDL obligations use integration+platform projects; the error-code obligation is integration-only (contract-inventory.ts:242) | Spec, checkpoint and proposal split: route/field/shared → integration+platform, error code → integration (repaired after attempt 5) | resolved (attempt 6 confirmed) |
| PR-403..PR-405 | Minor | attempt 5 | ENG-005 spec must adopt the guide fixture; ENG-004 drift/valid/order cases must run in temp roots after the placeholder; test titles/comments in Task 4 rename | Repaired after attempt 5 | resolved (attempt 6 confirmed) |
| PR-501..PR-504 | Minor | attempt 6 | 运行平台 map omits product-side binding (example/factory.ts, contracts.ts ExampleRuntime, ENG-003 fixture); guide must also drop `pnpm` commands and `manifest.` fields of deleted modules; engine-no-generated-cli must use a temp copy or new probe file, never edit server.ts in place; new SCN-005/006 and PC-004 integration cases bind via `cliEvidence` (no Fixture) | To be handled during Apply (Task 2, 5, 6); not repaired in the plan to keep the reviewed digest | accepted (non_blocking) |

### Re-review Attempts

| Re-review Attempt | Reviewed Digest | Reviewer Status | Critical | Important | Minor | Notes |
|---|---|---|---:|---:|---:|---|
| 1 | 7266faa8c3b97f48d6f0fe5433a765d0cec01d3ac64bdd38e784d1aba7d04355 | Issues Found | 0 | 5 | 7 | Digest unchanged; all findings confirmed and repaired. |
| 2 | 16b130b9336c23e21bf94f251f60ee5fd4dbf2f42448c57c8dd79c4581a51e32 | Issues Found | 0 | 3 | 4 | Digest unchanged; attempt-1 findings resolved; 5 → 3; all confirmed and repaired. |
| 3 | 63994bb0b818cb766e20ae4e1353b8650520466a3fca5fec8efc23ef49f9307d | Issues Found | 0 | 2 | 4 | Digest unchanged; attempt-2 findings resolved; 3 → 2; both remaining are acceptance-wording defects. Attempt limit reached. |
| 4 | 8aadefbdabafb6d0a05f951a3d499f67ceb8c71ea3544eced563d7ba44208a3f | Issues Found | 0 | 1 | 4 | Authorized by the user. Digest unchanged; PR-201/202 resolved; 2 → 1 (PR-301, residue-check exclusion). Repaired afterwards (digest 5deaca9e…). |
| 5 | 5deaca9e97b0c094b50c9d15655ae3ab1e8abca20c17ba543958fae3217b94c5 | Issues Found | 0 | 2 | 3 | Authorized by the user. Digest unchanged; PR-301..305 resolved; 1 → 2 new narrow wording defects (PR-401 doc allow-list, PR-402 obligation environments). Repaired afterwards (current digest 2bb108e6…); re-reviewed in attempt 6. |
| 6 | 2bb108e6d6fdbd03f538734e00252b2ad1718172f2bb09dbee8000b9e581fabd | Approved | 0 | 0 | 4 | Authorized by the user. Digest unchanged; PR-401..405 resolved; no Critical or Important findings. |

## Gate Decision

- Decision: PASS
- Blocking reason: None. Attempt 6 Approved with Critical=0 and Important=0; reviewed digest equals current digest.
- Accepted Minor findings: PR-501..PR-504 (non-blocking; handled during Apply). Reviewer notes for Apply: give `scripts/check-scenarios.test.ts:276-286` a manifest; `checkTemplateGuide` should use only registered IDs, not surface effective-spec issues.
- Freshness check command: `/Users/liyongning/.claude/skills/change/scripts/plan-review-digest.py openspec/changes/generalize-template --check-review openspec/changes/generalize-template/plan-review.md`

Decision rules:

- `PASS` requires `Reviewer status: Approved`, zero Critical findings, zero Important findings, and matching Current/Reviewed digests.
- `FAIL` means at least one verified Critical or Important finding remains.
- `BLOCKED` means required input, authority, or reviewer evidence is unavailable.
- `STALE` means the current normalized planning inputs no longer match the Reviewed digest; stale verdicts and findings must not be applied.

## Machine Record

```json
{
  "version": 1,
  "change": "generalize-template",
  "schema": "openspec-workflow",
  "reviewer": "independent general-purpose subagent (read-only), attempt 6",
  "prompt_provenance": "skill/change/references/plan-reviewer-prompt.md",
  "reviewed_at": "2026-10-02T00:00:00+08:00",
  "canonicalization_version": 1,
  "reviewed_sha256": "2bb108e6d6fdbd03f538734e00252b2ad1718172f2bb09dbee8000b9e581fabd",
  "current_sha256": "2bb108e6d6fdbd03f538734e00252b2ad1718172f2bb09dbee8000b9e581fabd",
  "reviewer_status": "Approved",
  "gate": "PASS",
  "critical": 0,
  "important": 0,
  "minor": 4
}
```

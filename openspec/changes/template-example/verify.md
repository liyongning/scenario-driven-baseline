# Verification

## Metadata

- Change: template-example
- Schema: openspec-workflow
- Verified Git revision: `f7ed0eeba27f5ccc3d6eb80356c247dfa8e9aca6` (branch `template-example-apply`) plus the uncommitted fixes from this verification round: the TC-PAYSDK-CONTRACT-021 digest re-record and the deletion of `HANDOFF.md`
- Verification input manifest digest: `4a322e8e6986a3cf1d257f6a379813f9e85eb6859d2af798468b4409c3e45d63`
- Manifest includes: 644 files. These are the sorted tracked files plus untracked files not ignored by git, including code, tests, config, fixtures, and proposal/specs/design/tasks/plan-review. Each entry records the path, the type (file/symlink), the SHA-256 of the content and the executable bit. Git-ignored `artifacts/` is not included.
- Plan Review verdict: PASS
- Reviewed digest: `0ccb6e00cb571b89c4a6ebb84b50394f4d82724d295dee9ae95d1110969ae2c8`
- Current digest: `0ccb6e00cb571b89c4a6ebb84b50394f4d82724d295dee9ae95d1110969ae2c8`
- Plan Review digest match: yes
- Unresolved Plan Review findings: 0 Critical, 0 Important. 28 Minor findings were accepted as non-blocking: PR-008..PR-015, PR-103..PR-111, PR-202..PR-209, PR-301..PR-303.
- Untracked inputs included: None
- Excluded lifecycle paths: `openspec/changes/template-example/verify.md`, which is this file itself
- Verified at: 2026-09-30T09:13:22Z
- Verification environment: macOS 26.2; Node v22.21.1; pnpm 10.20.0; OpenSpec CLI 1.6.0; WeChat DevTools at `/Applications/wechatwebdevtools.app` driven by miniprogram-automator 0.12.1

## Apply Gate

- Fresh Apply state: all_done
- Apply progress: 6/6
- Unchecked tasks: 0
- Final Code Review: PASS. This review covered the second Apply round (`f7ed0ee`) and the fixes made during this verification. See "Review Findings and Resolutions".
- Unresolved Critical findings: 0
- Unresolved Important findings: 0
- Accepted Minor findings: 28. These are the Plan Review Minor findings listed above, recorded in `plan-review.md`. The code review added no new Minor findings.

## Verification Summary

| Dimension | Status | Evidence |
|---|---|---|
| Completeness | PASS | 6/6 tasks done. Every Requirement and all 19 Scenarios plus 1 FLOW in this Change have run evidence (see Completeness). |
| Correctness | WARNING | V-001 to V-004 pass. After excluding payment, the scenario gate reports 0 issues. The warnings are W1 to W3 (see Archive Readiness). |
| Coherence | PASS | Proposal, Specs, Design, Tasks, Plan Review, implementation and this Verification describe the same scope. The first-round baseline defect and its correction are recorded below. |

## Completeness

### Artifact and Task Completion

| Item | Authority | Expected | Observed | Status |
|---|---|---|---|---|
| proposal / specs / design / tasks | `openspec status` | done | done | PASS |
| plan-review | `plan-review.md` + `--check-review` | PASS, freshness PASS | PASS; freshness PASS, digest `0ccb6e00…` | PASS |
| Task 1–6 | `openspec instructions apply` | all_done | all_done, 6/6 | PASS |

### Requirement Coverage

| Requirement | Spec Source | Implementation Evidence | Verification IDs | Status |
|---|---|---|---|---|
| GATE-01 OpenSpec-driven precheck | `specs/scenario-gate/spec.md` | `scripts/check-scenarios.ts` prechecks; `tests/tooling/SCN-SCENARIO-GATE-001.spec.ts` | V-001, V-004 | PASS |
| GATE-02 Unique Scenario ID precheck | same | `scripts/lib/spec-inventory.ts`, `scenario-config.ts`; `SCN-SCENARIO-GATE-002.spec.ts` | V-001, V-004 | PASS |
| GATE-03 Spec source discovery and lifecycle merge | same | `scripts/lib/spec-sources.ts`; `SCN-SCENARIO-GATE-003/004/007.spec.ts` | V-001, V-004 | PASS |
| GATE-04 Configurable ID formats and migration invariance | same | `scenario-gate.config.json`; `SCN-SCENARIO-GATE-005.spec.ts` + payment baseline fixture | V-001, V-004 | PASS |
| GATE-05 Mandatory verification metadata | same | `spec-inventory.ts`; `SCN-SCENARIO-GATE-006.spec.ts` | V-001, V-004 | PASS |
| GATE-06 Schemas are sole authority with field descriptions | same | three schemas + `scripts/lib/schema-docs.ts`; `SCN-SCENARIO-GATE-008.spec.ts` | V-001, V-004 | PASS |
| EX-01 to EX-08 | `specs/template-example/spec.md` | `packages/payment-sdk/src/example/**`, `testing/shadow/example/**`, `tests/example/**`, `tests/weapp/example/**`, Live example page | V-001, V-003, V-004 | PASS |
| payment-sdk MODIFIED SDK-14 (FLOW table moved into Requirement body) | `specs/payment-sdk/spec.md` | The inventory reads the 8 payment FLOWs from the Requirement body; the payment inventory equals the baseline | V-001 (SCN-SCENARIO-GATE-005) | PASS |

### Scenario Coverage

All cases below come from this round's reports (`artifacts/verify-final-20260930/reports/`). Each case passed, and each record has an assertion count greater than 0.

| Scenario ID | Required cases (environment) | Verification IDs | Status |
|---|---|---|---|
| SCN-SCENARIO-GATE-001 | precheck-rules (test-tools-unit), missing-specs-dir-cli, missing-openspec-cli (integration) | V-001, V-004 | PASS |
| SCN-SCENARIO-GATE-002 | id-rules (test-tools-unit), missing-id-cli, pattern-mismatch-cli, duplicate-across-sources-cli (integration) | V-001, V-004 | PASS |
| SCN-SCENARIO-GATE-003 | lifecycle-merge (test-tools-unit), active-change-cli (integration) | V-001, V-004 | PASS |
| SCN-SCENARIO-GATE-004 | unknown-reference-rules (test-tools-unit), lost-flow-table-cli (integration) | V-001, V-004 | PASS |
| SCN-SCENARIO-GATE-005 | pattern-config (test-tools-unit), payment-baseline-cli, removed-pattern-cli (integration) | V-001, V-004 | PASS |
| SCN-SCENARIO-GATE-006 | metadata-rules (test-tools-unit), missing/multiple/invalid-metadata-cli (integration) | V-001, V-004 | PASS |
| SCN-SCENARIO-GATE-007 | flow-placement-rules (test-tools-unit), invalid-flow-row-cli, outside-flow-table-cli (integration) | V-001, V-004 | PASS |
| SCN-SCENARIO-GATE-008 | schema-description-rules (test-tools-unit), schema-documentation-cli (integration) | V-001, V-004 | PASS |
| SCN-TEMPLATE-EXAMPLE-001 | factory-validation (sdk-unit), node-import, package-consumer (integration) | V-001, V-004 | PASS |
| SCN-TEMPLATE-EXAMPLE-002 | create-mapping (sdk-unit), create-success (integration, weapp) | V-001, V-003, V-004 | PASS |
| SCN-TEMPLATE-EXAMPLE-003 | create-error-mapping (sdk-unit), invalid-input, create-failures (integration) | V-001, V-004 | PASS |
| SCN-TEMPLATE-EXAMPLE-004 | observe-completed (integration, weapp), observe-closed (integration) | V-001, V-003, V-004 | PASS |
| SCN-TEMPLATE-EXAMPLE-005 | observation-budget (sdk-unit), window-and-timeout (integration) | V-001, V-004 | PASS |
| SCN-TEMPLATE-EXAMPLE-006 | cancellation-rules (sdk-unit), host-cancel (integration) | V-001, V-004 | PASS |
| SCN-TEMPLATE-EXAMPLE-007 | status-mapping-table (sdk-unit), core-neutrality (integration) | V-001, V-004 | PASS |
| SCN-TEMPLATE-EXAMPLE-008 | dependency-violations (integration) | V-001, V-004 | PASS |
| SCN-TEMPLATE-EXAMPLE-009 | shadow-create-route (protocol-unit), shadow-excluded (integration) | V-001, V-004 | PASS |
| SCN-TEMPLATE-EXAMPLE-010 | live-example-build, live-example-evidence (integration) | V-001, V-004 | PASS |
| SCN-TEMPLATE-EXAMPLE-011 | normal (integration, weapp) | V-001, V-003, V-004 | PASS |
| FLOW-TEMPLATE-EXAMPLE-001 | normal (integration, weapp), each proven by one continuous run | V-001, V-003, V-004 | PASS |

## Correctness

### Fresh Command Evidence

#### V-001: Fast gate (lint, build, typecheck, architecture, unit + coverage, fixtures, integration, package)

- Command: `PAYMENT_RUN_ID=verify-final-20260930 pnpm check:fast`
- Working directory: `/Users/liyongning/.codex/worktrees/template-example-apply/sdk-template`
- Executed at: 2026-09-30T09:03:51Z
- Exit code: 0
- Failure count: 0
- Result: PASS
- Output reference: `artifacts/verify-final-check-fast.log`; reports `artifacts/verify-final-20260930/reports/unit.json`, `integration.json`
- Key observations: unit 63 files / 784 tests; integration 48 files / 236 tests; statements 3231/3231, branches 2489/2489, functions 573/573, lines 2334/2334 (all 100%); `check:fixtures` covered 61 manifests with no issues; `check:package` reported no issues. Among the passing cases is `TC-PAYSDK-CONTRACT-021`, which this round's re-record restored (see R-1).

#### V-002: Planning validity and Plan Review freshness

- Command: `openspec validate template-example --strict`; `python3 /Users/liyongning/.claude/skills/change/scripts/plan-review-digest.py openspec/changes/template-example --check-review openspec/changes/template-example/plan-review.md`; `openspec instructions apply --change template-example --json`
- Working directory: same as above
- Executed at: 2026-09-30T09:04:52Z
- Exit code: 0 / 0 / 0
- Failure count: 0
- Result: PASS
- Output reference: terminal output from this verification
- Key observations: the Change is valid; freshness is PASS with matching digests `0ccb6e00…`; Apply is `all_done` 6/6.

#### V-003: Example weapp (real WeChat DevTools + real `wx.request` → Shadow)

- Command: for each of the 3 files under `packages/e2e/tests/weapp/example/`, following `packages/e2e/AGENTS.md` "微信开发者工具自动化的注意事项": `cli quit` → `pkill -f wechatwebdevtools.app` → `cli open --project <worktree>/packages/e2e/host/weapp` warm-up → `PAYMENT_RUN_ID=verify-final-20260930 PAYMENT_REPORT_FILE=artifacts/verify-final-20260930/reports/weapp/<file>.json pnpm exec vitest run --project weapp <file>`. A file that fails is rerun as a whole, up to 4 times.
- Working directory: same as above
- Executed at: 2026-09-30T09:05Z–09:12Z
- Exit code: final attempt 0 for each of the 3 files
- Failure count: 0 (final attempts)
- Result: PASS
- Output reference: `artifacts/verify-final-20260930/weapp-attempts.json`, `weapp-*-attempt*.log`, `reports/weapp/*.json`
- Key observations: `SCN-TEMPLATE-EXAMPLE-002` and `-004` passed on the first attempt. `FLOW-TEMPLATE-EXAMPLE-001` hung at the 120-second test timeout on attempts 1 and 2 (`Test timed out in 120000ms`, no assertion errors, which is the known DevTools hang) and passed on attempt 3. Only the passing report is used as evidence. The warm-up `cli open` returned 255 on 4 of the 5 attempts, including attempts that then passed, so its exit code is not a reliable readiness signal (see W3).

#### V-004: Scenario gate (effective Specs vs. this run's reports)

- Command: `PAYMENT_RUN_ID=verify-final-20260930 node_modules/.bin/tsx scripts/check-scenarios.ts --report artifacts/verify-final-20260930/reports/unit.json --report …/integration.json --report …/weapp/example__FLOW-TEMPLATE-EXAMPLE-001.json --report …/weapp/example__SCN-TEMPLATE-EXAMPLE-002.json --report …/weapp/example__SCN-TEMPLATE-EXAMPLE-004.json`
- Working directory: same as above
- Executed at: 2026-09-30T09:12:40Z
- Exit code: 1
- Failure count: 445 issues in total, all belonging to the payment scenarios (`TC-PAYSDK-*`, `FLOW-PAYSDK-*`) and payment IDL obligations (`infra.trade.v1.*`). Issues for this Change's scenarios: 0.
- Result: PASS within this Change's scope; the command exits 1 because of excluded payment content (W1)
- Output reference: `artifacts/verify-final-20260930/check-scenarios.json`
- Key observations: the inventory contains 19 `SCN-*` scenarios and `FLOW-TEMPLATE-EXAMPLE-001`. No issue references them. The digests (source `46cb7a0d…`, spec `6c72fbcb…`, IDL `14addb4b…`, fixture `a0779b83…`) match the reports.

#### V-005: Live CLI build and check (not executed)

- Command: `pnpm live:build`
- Working directory: same as above
- Executed at: 2026-09-30T09:12:49Z
- Exit code: 1
- Failure count: N/A. This is a missing prerequisite, not an implementation failure.
- Result: NOT EXECUTED (W2)
- Output reference: `artifacts/verify-final-20260930/live-build.log`: `ENOENT … .env.live`
- Key observations: the Live CLI needs a user-supplied, git-ignored `.env.live` and a `project.live.config.json` with a real, non-tourist `appid`. Neither exists on this machine, and inventing values would not produce valid evidence. The EX-07 obligation ("build and evidence checks can run offline") is covered by `SCN-TEMPLATE-EXAMPLE-010` (`live-example-build`, `live-example-evidence`), which runs in integration under a controlled temporary config and passed in V-001.

### Behavioral Results

| Behavior / Claim | Evidence | Result |
|---|---|---|
| The gate builds the inventory from effective Specs and runs four prechecks | GATE-01..06, V-001, V-004 | PASS |
| Payment inventory, case obligations and reconciliation output are unchanged | SCN-SCENARIO-GATE-005 `payment-baseline-cli` (V-001); the baseline output was confirmed with the pre-change gate (see Coherence) | PASS |
| The example create/observe behavior is correct in Node and in the real mini-program | EX-02/03/08, V-001, V-003 | PASS |
| The example is isolated from payment in both directions, and the core does not use `wx` | EX-05, SCN-TEMPLATE-EXAMPLE-008 counterexamples (V-001) | PASS |
| Example package consumption works for ESM, CJS and type declarations | SCN-TEMPLATE-EXAMPLE-001 `package-consumer` (V-001) | PASS |
| `check:fast` passes | V-001 | PASS |

## Coherence

| Proposal / Design Decision | Source | Implementation Evidence | Status / Notes |
|---|---|---|---|
| Add first, then delete; payment untouched | proposal non-goals; tasks Global Constraints | Payment test logic and business code are unchanged. The only payment fixture change is the routine CONTRACT-021 digest re-record (R-1). | PASS |
| Four OpenSpec hard rules and schema ownership | design "格式约定的归属" | root AGENTS.md hard-rule section, the three schemas, `schema-docs` check | PASS |
| Long-lived conventions have project-level carriers | design "长期约定的项目级载体与 AGENTS 结构" | All four AGENTS.md files have "模板通用规则" and "当前业务：支付" sections. The WeChat DevTools notes found during this verification are written into the generic section of `packages/e2e/AGENTS.md`. | PASS |
| Payment baseline equivalence | design "支付基线等价验证" | The first-round `payment-coverage-output.json` was generated incorrectly: it had `required: 0` and `issues: 0`, so reconciliation equivalence was checked against almost nothing. The second round (`f7ed0ee`) replaced it. I ran the pre-change gate (`sdk-template/main` scripts, identical to `020e582`) on the same input, and its output is byte-for-byte identical to the new fixture, so the correction is valid. | PASS (defect corrected; recorded) |
| Live does not run for real | proposal non-goals | Not run; this is not a warning | PASS |
| Example evidence comes only from Shadow | proposal/design | V-001 and V-003 exercise Shadow only | PASS |

## Review Findings and Resolutions

| Finding ID | Severity | Finding | Resolution | Re-verification IDs | Status |
|---|---|---|---|---|---|
| R-1 | Important | After the second Apply round, `check:fast` failed at `TC-PAYSDK-CONTRACT-021 semantic-review-evidence`: source code changed but the source digest recorded in the fixture was not re-recorded. The previous verify.md wrongly blamed "a fixed digest predating this Change"; commit `62e6e29` in this same Change had already re-recorded it once. | Routine re-record of `sourceDigest` (`8ee85ac4…` → `46cb7a0d…`) and the manifest sha256. No payment source changed this round, so the semantic entry line anchors stay the same. The test logic was not modified. | V-001 | resolved |
| R-2 | Important | The previous verify.md did not follow the template. It judged READY WITH WARNINGS while a required command was failing, and it listed Live not running for real (a non-goal) as a warning. | This verify.md has been rewritten. | V-001..V-005 | resolved |
| R-3 | Minor | The handoff note `HANDOFF.md` was committed to the repository. | Deleted. | — | resolved |
| R-4 | Minor | The second round corrected the first-round payment baseline defect without saying so. | Checked and recorded in Coherence. | V-001 | resolved |

## Unverified Areas and Remaining Risks

- Payment scenarios and payment IDL obligations (445 gate issues) were not run or fixed. This follows the user's decision: they will be cleaned up when payment is deleted. Payment weapp was also not run in this round.
- The Live CLI (`pnpm live:build` / `live:check`) was not run: there is no real `.env.live` or real `appid` (W2). Real Live execution is a non-goal of this Change.
- The WeChat DevTools automation instability is known and was not fixed in this Change. Evidence was obtained with the procedure in `packages/e2e/AGENTS.md` (W3).

## Archive Readiness

- Decision: READY WITH WARNINGS (W1 and W3 follow the user's existing decisions; W2 takes effect once the user accepts it)
- Plan Review verdict: PASS
- Plan Review freshness: PASS; reviewed and current digest are both `0ccb6e00…9ae2c8`
- Fresh Apply state: all_done
- Completed tasks: 6/6
- Failed required commands: 0 within this Change's scope. The scenario gate exits 1 only because of the payment content the user excluded (W1).
- Unresolved Critical findings: 0
- Unresolved Important findings: 0
- Accepted Minor findings: 28 (Plan Review PR-008..PR-015, PR-103..PR-111, PR-202..PR-209, PR-301..PR-303)
- Verification input manifest matches current inputs: yes (`4a322e8e…`, computed after the fixes in this round)
- Requirements without evidence: 0
- Warnings and rationale:
  - W1: the aggregate scenario gate exits 1, and all 445 issues are payment or payment IDL. Impact: the gate cannot go green before payment is deleted. Rationale: the user decided to exclude payment and clean it up during the later payment deletion. Accepted.
  - W2: the Live CLI build and check were not executed because the real, non-sensitive config and a real `appid` are missing. Impact: the real Live build is not proven on this machine. Rationale: the EX-07 offline build and evidence obligations are covered by the SCN-TEMPLATE-EXAMPLE-010 integration cases. Awaiting user acceptance.
  - W3: WeChat DevTools automation is unstable. `FLOW-TEMPLATE-EXAMPLE-001` passed only on its third whole-file attempt, and the warm-up command's exit code is unreliable. Impact: weapp evidence needs retries. Rationale: the user confirmed this is a known issue that will not be fixed now, and the procedure is recorded in `packages/e2e/AGENTS.md`. Accepted.
- Blockers: None

# Verification

## Metadata

- Change: <!-- From latest OpenSpec status -->
- Schema: <!-- From latest OpenSpec status -->
- Verified Git revision: <!-- Git commit SHA; provenance only, not the freshness equality key -->
- Verification input manifest digest: <!-- Stable digest of sorted paths, file types, contents, executable bits, and symlink targets -->
- Manifest includes: <!-- Code, tests, config, untracked implementation files, and proposal/specs/design/tasks/plan-review contextFiles -->
- Plan Review verdict: <!-- PASS / FAIL / BLOCKED / STALE -->
- Reviewed digest: <!-- Digest recorded by plan-review.md -->
- Current digest: <!-- Fresh normalized proposal/specs/design/tasks digest -->
- Plan Review digest match: <!-- yes / no -->
- Unresolved Plan Review findings: <!-- Critical/Important count and references -->
- Untracked inputs included: <!-- Explicit path list or None -->
- Excluded lifecycle paths: <!-- Verification Artifact itself and explicitly listed later Sync/Archive-only outputs -->
- Verified at: <!-- ISO 8601 timestamp -->
- Verification environment: <!-- OS/runtime/tool versions relevant to reproduction -->

## Apply Gate

- Fresh Apply state: <!-- all_done / ready / blocked -->
- Apply progress: <!-- complete/total -->
- Unchecked tasks: <!-- count -->
- Final Code Review: <!-- PASS / FAIL / BLOCKED -->
- Unresolved Critical findings: <!-- count -->
- Unresolved Important findings: <!-- count -->
- Accepted Minor findings: <!-- count and references -->

<!-- Verify may proceed only when fresh Apply state is all_done, total > 0,
complete == total, and Final Code Review has no unresolved Critical or Important finding.
Every retained Minor finding must be explicitly accepted and recorded. -->

## Verification Summary

| Dimension | Status | Evidence |
|---|---|---|
| Completeness | <!-- PASS / FAIL --> | <!-- Section or evidence references --> |
| Correctness | <!-- PASS / FAIL / WARNING --> | <!-- Section or evidence references --> |
| Coherence | <!-- PASS / FAIL / WARNING --> | <!-- Section or evidence references --> |

## Completeness

### Artifact and Task Completion

| Item | Authority | Expected | Observed | Status |
|---|---|---|---|---|
| <!-- Artifact or task --> | <!-- status/apply/tasks source --> | <!-- expected state --> | <!-- actual state --> | <!-- PASS / FAIL --> |

### Requirement Coverage

| Requirement | Spec Source | Implementation Evidence | Verification IDs | Status |
|---|---|---|---|---|
| <!-- Exact requirement name --> | <!-- spec path:line --> | <!-- code/test path:line --> | <!-- V-IDs --> | <!-- PASS / FAIL --> |

### Scenario Coverage

| Scenario ID | Scenario | Requirement | Test or Runtime Evidence | Verification IDs | Status |
|---|---|---|---|---|---|
| <!-- SCN-<CAPABILITY>-<NUMBER>; existing no-ID scenario may use None --> | <!-- Exact scenario name --> | <!-- parent requirement --> | <!-- test path:line or observation --> | <!-- V-IDs --> | <!-- PASS / WARNING / FAIL --> |

## Correctness

### Fresh Command Evidence

<!-- Every required command must be executed during this verification run.
Historical output, an agent's success claim, or a previous CI result is not fresh evidence. -->

#### V-<!-- number -->: <!-- purpose -->

- Command: <!-- Exact command -->
- Working directory: <!-- Exact cwd -->
- Executed at: <!-- ISO 8601 timestamp -->
- Exit code: <!-- Integer -->
- Failure count: <!-- Integer, or N/A with reason -->
- Result: <!-- PASS / FAIL -->
- Output reference: <!-- Complete inline output or durable log/artifact reference -->
- Key observations: <!-- What the output proves; do not replace exit code with prose -->

### Behavioral Results

| Behavior / Claim | Evidence | Result |
|---|---|---|
| <!-- Observable behavior or completion claim --> | <!-- Requirement/scenario and V-ID --> | <!-- PASS / FAIL --> |

## Coherence

| Proposal / Design Decision | Source | Implementation Evidence | Status / Notes |
|---|---|---|---|
| <!-- Scope, constraint, or decision --> | <!-- proposal/design path:line --> | <!-- code/config/test path:line --> | <!-- PASS / WARNING / FAIL --> |

<!-- Coherence covers Proposal, Specs, Design, Tasks, Plan Review, Implementation, and Verification. Confirm every layer describes the same behavior and approved planning revision. -->

## Review Findings and Resolutions

| Finding ID | Severity | Finding | Resolution | Re-verification IDs | Status |
|---|---|---|---|---|---|
| <!-- R-ID --> | <!-- Critical / Important / Minor --> | <!-- Final review finding --> | <!-- Actual fix or explicitly accepted Minor rationale --> | <!-- V-IDs --> | <!-- resolved / accepted / open --> |

## Unverified Areas and Remaining Risks

- <!-- Omitted checks, external blockers, accepted warnings, or remaining risk; write `None` when empty. -->

## Archive Readiness

- Decision: <!-- READY / READY WITH WARNINGS / NOT READY -->
- Plan Review verdict: <!-- Must be PASS for READY states -->
- Plan Review freshness: <!-- Reviewed digest must match current digest -->
- Fresh Apply state: <!-- Must be all_done for READY states -->
- Completed tasks: <!-- complete/total -->
- Failed required commands: <!-- count -->
- Unresolved Critical findings: <!-- count -->
- Unresolved Important findings: <!-- count -->
- Accepted Minor findings: <!-- count and references -->
- Verification input manifest matches current inputs: <!-- yes / no -->
- Requirements without evidence: <!-- count -->
- Warnings and rationale: <!-- List or None -->
- Blockers: <!-- List or None -->

<!-- Archive Readiness is NOT READY when Plan Review is FAIL, STALE, or BLOCKED.
Decision rules:
- NOT READY when Apply is not all_done, total is zero, a required command fails,
  a requirement lacks evidence, a Critical/Important finding remains unresolved,
  or the recorded verification input manifest differs from current inputs.
- READY WITH WARNINGS only when all hard gates pass and every retained Minor finding
  or warning is explicitly accepted with impact and rationale.
- READY only when all hard gates pass and no unresolved warning remains.
-->

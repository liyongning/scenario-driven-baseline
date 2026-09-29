# Plan Review

## Metadata

- Change: <!-- From latest OpenSpec status -->
- Schema: <!-- From latest OpenSpec status -->
- Reviewer: <!-- Independent reviewer identity/type -->
- Prompt provenance: <!-- skill/change/references/plan-reviewer-prompt.md and Superpowers version -->
- Reviewed at: <!-- ISO 8601 timestamp -->

## Input Manifest

- Reviewed input paths: <!-- proposal.md, sorted specs/**/*.md, design.md, tasks.md -->
- Canonicalization version: 1
- Reviewed digest: <!-- lowercase SHA-256 -->
- Current digest: <!-- lowercase SHA-256 recomputed before recording and Apply -->

## Review Summary

- Reviewer status: <!-- Approved | Issues Found | Blocked -->
- Gate: <!-- PASS | FAIL | BLOCKED | STALE -->
- Critical findings: 0
- Important findings: 0
- Minor findings: 0

PASS requires Approved, Critical=0, Important=0, and Current digest == Reviewed digest.

## Plan Checks

| Dimension | Status | Evidence / Notes |
|---|---|---|
| Goal / Scope | <!-- PASS / FAIL --> | <!-- Proposal goals, non-goals, impact --> |
| Acceptance | <!-- PASS / FAIL --> | <!-- Observable, reproducible PASS/FAIL criteria --> |
| Cross-Artifact Coverage | <!-- PASS / FAIL --> | <!-- Proposal → Specs → Design → Tasks → evidence --> |
| Design Feasibility | <!-- PASS / FAIL --> | <!-- Evidence from the Reviewer's applicable Design feasibility checks --> |
| Task Buildability | <!-- PASS / FAIL --> | <!-- Files, RED, GREEN, commands, acceptance --> |
| Execution Constraints | <!-- PASS / FAIL --> | <!-- Worktree, executor, commit, parallelism, environment --> |

## Findings and Re-review

| Finding ID | Severity | Artifact / Reference | Finding | Fix | Status |
|---|---|---|---|---|---|
| <!-- PR-001 --> | <!-- Critical / Important / Minor --> | <!-- path:line --> | <!-- Specific issue and implementation impact --> | <!-- Accepted correction or rationale --> | <!-- open / resolved / accepted --> |

### Re-review Attempts

| Re-review Attempt | Reviewed Digest | Reviewer Status | Critical | Important | Minor | Notes |
|---|---|---|---:|---:|---:|---|
| 1 | <!-- sha256 --> | <!-- Approved / Issues Found / Blocked --> | 0 | 0 | 0 | <!-- Result --> |

## Gate Decision

- Decision: <!-- PASS / FAIL / BLOCKED / STALE -->
- Blocking reason: <!-- None or exact blocker -->
- Accepted Minor findings: <!-- IDs and rationale, or None -->
- Freshness check command: <!-- Exact plan-review-digest.py invocation -->

Decision rules:

- `PASS` requires `Reviewer status: Approved`, zero Critical findings, zero Important findings, and matching Current/Reviewed digests.
- `FAIL` means at least one verified Critical or Important finding remains.
- `BLOCKED` means required input, authority, or reviewer evidence is unavailable.
- `STALE` means the current normalized planning inputs no longer match the Reviewed digest; stale verdicts and findings must not be applied.

## Machine Record

```json
{
  "version": 1,
  "change": "<change>",
  "schema": "openspec-workflow",
  "reviewer": "<reviewer>",
  "prompt_provenance": "skill/change/references/plan-reviewer-prompt.md",
  "reviewed_at": "<ISO-8601>",
  "canonicalization_version": 1,
  "reviewed_sha256": "<reviewed-sha256>",
  "current_sha256": "<current-sha256>",
  "reviewer_status": "Approved|Issues Found|Blocked",
  "gate": "PASS|FAIL|BLOCKED|STALE",
  "critical": 0,
  "important": 0,
  "minor": 0
}
```

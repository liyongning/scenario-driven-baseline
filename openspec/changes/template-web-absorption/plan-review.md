# Plan Review

## Metadata

- Change: template-web-absorption
- Schema: openspec-workflow
- Reviewer: 独立只读 general-purpose subagent（每次审查派发一个全新实例，共 4 次；第 4 次经用户裁决授权）；最终放行依据为用户裁决（2026-10-10，确认 R4-I1 修正 diff 后通过）
- Prompt provenance: skill/change/references/plan-reviewer-prompt.md；finding 准入按 skill/change/references/review-finding-admission.md
- Reviewed at: 2026-10-10T00:00:00Z

## Input Manifest

- Reviewed input paths: proposal.md, specs/browser-platform/spec.md, specs/openapi-contract/spec.md, specs/protocol-contract/spec.md, specs/scenario-gate/spec.md, specs/template-engineering/spec.md, specs/web-app/spec.md, specs/web-example/spec.md, design.md, tasks.md
- Canonicalization version: 1
- Reviewed digest: 106601c8184cff00759ae13748ead222175bc4b8916c974a5f98884806054288
- Current digest: 106601c8184cff00759ae13748ead222175bc4b8916c974a5f98884806054288

## Review Summary

- Reviewer status: Approved（用户裁决）
- Gate: PASS
- Critical findings: 0
- Important findings: 0
- Minor findings: 7

PASS requires Approved, Critical=0, Important=0, and Current digest == Reviewed digest.

## Plan Checks

| Dimension | Status | Evidence / Notes |
|---|---|---|
| Goal / Scope | PASS | 范围与用户裁决一致；Web 作为第二套具体实现，不做模块化框架 |
| Acceptance | PASS | R3-I1 已改为"移除一条绑定"演练，第 4 次审查确认解决 |
| Cross-Artifact Coverage | PASS | 112 个 Scenario 均被任务引用；反馈核对范围表完整 |
| Design Feasibility | PASS | R3-I3 已解决：纯引擎部分归 test-tools-unit，校验器部分留在协议包单测 |
| Task Buildability | PASS | 中途运行允许的两类预期失败已定义并与登记任务对应（R3-I2、R4-I1），design 与 tasks 一致 |
| Execution Constraints | PASS | worktree、逐任务提交、衔接判定标准已定义 |

## Findings and Re-review

| Finding ID | Severity | Artifact / Reference | Finding | Fix | Status |
|---|---|---|---|---|---|
| R1-I1 ~ R1-I6 | Important | 见第 1 次审查 | 任务依赖倒置；OpenAPI browser case 无承担；预览模式与 defineCase 矛盾；占位资源无被测页面；交叉复刻限制；反馈核对范围 | 15 步新顺序与推迟交付；任务 10 承担；预览单独构造入口；协议宿主最小页面；先删 template-example 且协议宿主通用；design 范围表 | resolved |
| R2-I1 | Important | design Shadow 引擎、ENG-11 | Shadow 引擎留在 IDL 协议包，删除绑定后 Web 组合失效 | 引擎迁到 packages/e2e/src/shadow/；新增 SCN-TEMPLATE-ENGINEERING-017；绑定独占内容由清单确定；packages[].checks | resolved（017 的可达性见 R3-I1） |
| R2-I2 | Important | tasks Global Constraints | 衔接检查必然失败 | 三条判定标准与 fixtures:refresh | resolved（SCN-008 中途失败见 R3-I2） |
| R3-I1 | Important | ENG-11 / SCN-TEMPLATE-ENGINEERING-017 | 单组合真实副本证据不可达 | 用户裁决"不依赖核心 Change 结论则修复后做第 4 次评审"；017 改为"移除一条绑定"演练，指南新增该节含 Spec 清理，事实核验用例按清单派生；第 4 次审查确认解决 | resolved |
| R3-I2 | Important | tasks 共同完成条件；SCN-TEMPLATE-ENGINEERING-008 | 中途 check:fast 必然失败 | 定义唯一允许的预期失败并归属任务 14；第 4 次审查认为允许范围过窄，见 R4-I1 | resolved（细化见 R4-I1） |
| R3-I3 | Important | PC-04 / SCN-006、007，PC-05 / SCN-010；任务 2 | 引擎相关 case 运行项目未定 | 纯引擎部分改 test-tools-unit，校验器部分留协议包单测且不构造引擎；第 4 次审查确认解决 | resolved |
| R4-I1 | Important | design 衔接判定与"中途运行时的示例删除用例"；tasks Global Constraints 3(b) 与共同完成条件 8 | 允许的中途失败只认"缺少绑定"，漏了副本清单模式必然报出的"requiredIn 引用尚未登记的测试项目"；design 与 tasks 对衔接预期失败的类别数不一致 | 允许输出扩为两种并写明 openapi-unit/app-unit/browser 的登记任务；design 衔接判定与 tasks 统一为两类；同时按 R4-M2 写明先单独运行 check:fixtures 再运行完整 check:fast；用户确认 diff | resolved |
| R4-M1、R4-M3 ~ R4-M7 | Minor | 见第 4 次审查 | 混合 Requirement 的 Spec 清理需 MODIFIED、事实核验用例中的绑定目录名、WEX-08 白名单路径、删除示例后空断言、交叉复刻产品包来源、OpenAPI 业务码义务环境 | 不触发修复，记录为 advisory | accepted |
| R3-M1 ~ R3-M6 | Minor | 见第 3 次审查 | 承接 case 列表遗漏、OpenAPI checks 登记、ENG-05 字段清单、衔接判定的串联观察、declared-routes 归属、node.ts 文档时差 | 不触发修复，记录为 advisory | accepted |

### Re-review Attempts

| Re-review Attempt | Reviewed Digest | Reviewer Status | Critical | Important | Minor | Notes |
|---|---|---|---:|---:|---:|---|
| 1 | 06742774be43565040550c2935d057ae87fbec681e879ca2cd1ac14f4f0aa47d | Issues Found | 0 | 6 | 6 | 全部核实并修复 |
| 2 | ac350901c6df15d6bbbe6052e5516ce12d4a9b1f71c28070fb91fd065ec60f8a | Issues Found | 0 | 2 | 9 | 第 1 次问题确认解决；2 条新问题修复 |
| 3 | 74a2e50c91c71f0bcc1273bc887209e00b7e00ad3a6fc3faff043265bd85839c | Issues Found | 0 | 3 | 6 | 第 2 次问题主体解决；3 条新问题集中在副本证据与引擎迁移的边界；已达三次上限，且阻塞项 2→3，触发 Review Non-Convergence |
| 4 | 38eeee6f0fb75de68e8388a2754737ade17595536250b7f917ddd13824e578f9 | Issues Found | 0 | 1 | 7 | 用户授权的额外审查；R3-I1、R3-I3 确认解决；R3-I2 的允许范围需细化（R4-I1），修正只涉及 design 与 tasks 的三处表述 |
| 用户裁决 | 106601c8184cff00759ae13748ead222175bc4b8916c974a5f98884806054288 | Approved（用户裁决） | 0 | 0 | 7 | 用户确认 R4-I1（含 R4-M2）修正 diff 后放行；`openspec validate --strict` 通过 |

## Gate Decision

- Decision: PASS
- Blocking reason: None。第 4 次审查后的 R4-I1 已按最小修正改完（design 与 tasks 三处表述），用户确认 diff 后放行；放行依据为用户裁决，而非第 5 次独立审查。
- Apply 前提：`template-core-hardening` 归档并合并之后才进入 Apply。核心 Change 在 Apply 期间经用户裁决修订了请求 ID 的随机源（A1，改为 `Math.random`）和 SCN-TEMPLATE-ENGINEERING-008 的副本门禁口径（A2，精确扣除防递归排除项）。衔接时，本 Change 中途允许的两类预期失败，叠加在 A2 已扣除的排除项之上判定。
- Accepted Minor findings: 第 2 次 M-1~M-7、M-9，第 3 次 M-1~M-6，第 4 次 M-1、M-3~M-7（M-2 已随 R4-I1 修正），不阻塞 Apply。
- Freshness check command: `/Users/liyongning/.claude/skills/change/scripts/plan-review-digest.py openspec/changes/template-web-absorption --check-review openspec/changes/template-web-absorption/plan-review.md`

## Machine Record

```json
{
  "version": 1,
  "change": "template-web-absorption",
  "schema": "openspec-workflow",
  "reviewer": "user decision after independent review attempt 4",
  "prompt_provenance": "skill/change/references/plan-reviewer-prompt.md",
  "reviewed_at": "2026-10-10T00:00:00Z",
  "canonicalization_version": 1,
  "reviewed_sha256": "106601c8184cff00759ae13748ead222175bc4b8916c974a5f98884806054288",
  "current_sha256": "106601c8184cff00759ae13748ead222175bc4b8916c974a5f98884806054288",
  "reviewer_status": "Approved",
  "gate": "PASS",
  "critical": 0,
  "important": 0,
  "minor": 7
}
```

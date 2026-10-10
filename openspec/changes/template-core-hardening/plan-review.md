# Plan Review

## Metadata

- Change: template-core-hardening
- Schema: openspec-workflow
- Reviewer: 独立只读 general-purpose subagent（每次审查派发一个全新实例，共 4 次；第 4 次经用户裁决授权）；最终放行依据为用户裁决（2026-10-09，确认 R4-I1/I2 修正 diff 后通过）
- Prompt provenance: skill/change/references/plan-reviewer-prompt.md；finding 准入按 skill/change/references/review-finding-admission.md
- Reviewed at: 2026-10-10T00:00:00Z（Apply 期间用户裁决修订）

## Input Manifest

- Reviewed input paths: proposal.md, specs/protocol-contract/spec.md, specs/scenario-gate/spec.md, specs/template-engineering/spec.md, specs/template-example/spec.md, design.md, tasks.md
- Canonicalization version: 1
- Reviewed digest: 284e4d098bae6ef4992b4daf0bc2db19ae9a50faea67d7efe5ad1dee00334303
- Current digest: 284e4d098bae6ef4992b4daf0bc2db19ae9a50faea67d7efe5ad1dee00334303

## Review Summary

- Reviewer status: Approved（用户裁决）
- Gate: PASS
- Critical findings: 0
- Important findings: 0
- Minor findings: 13

PASS requires Approved, Critical=0, Important=0, and Current digest == Reviewed digest.

## Plan Checks

| Dimension | Status | Evidence / Notes |
|---|---|---|
| Goal / Scope | PASS | Proposal 的目标、范围与不做事项与用户裁决一致；Web 能力划入后续 Change |
| Acceptance | PASS | R3-I1 已解决；R4-I1/I2 的措辞矛盾已按用户确认的修正解决；验收命令与运行约定一致 |
| Cross-Artifact Coverage | PASS | 第 3 次审查的覆盖表除任务 18 外均为 OK；44 个 Scenario 均被任务引用 |
| Design Feasibility | PASS | 第 1、2 次指出的不可行点（meta 无包名、integration 经 dist、副本链接、矩阵写死等）已核实解决 |
| Task Buildability | PASS | 18 个任务的 Files、RED/GREEN、命令与提交信息齐全；中途 verify 判定已修正 |
| Execution Constraints | PASS | 独立 worktree、逐任务提交、不 merge/push、weapp 逐文件约定一致 |

## Findings and Re-review

| Finding ID | Severity | Artifact / Reference | Finding | Fix | Status |
|---|---|---|---|---|---|
| R1-I1 | Important | tasks.md 任务 6/7 | 任务 6 依赖任务 7 才交付的 `--change` | 作用域 API 与 `check:fixtures --change` 并入任务 6 | resolved |
| R1-I2 | Important | GATE-11 | 反向对账未定义多 cover 绑定与协议义务 checkpoint | 以绑定为对账单位，义务 checkpoint 来自派生清单 | resolved |
| R1-I3 | Important | design 协议义务、PC-01 | `RpcMethodMeta` 无 IDL 包名，派生器写死 trade.ts | 前缀与类型源文件由声明元素的 generated 声明位置推导 | resolved |
| R1-I4 | Important | design 按需测试、GATE-13 | integration 经 dist 导入，`vitest related` 失效 | depcruise `--reaches` + 分析专用路径映射，产品/协议 src 改动先 build | resolved |
| R1-I5 | Important | design 源码清单、ENG-07 | 测试支撑代码进入覆盖率后无法达到 100% | test 角色包 `tests/` 全部归为 test；限定四个 host 文件可登记排除 | resolved |
| R1-I6 | Important | design 示例解耦、ENG-06 | 白名单与迁出表不完整 | 补齐迁出表、片段标记 `template-example:begin/end`、`discoverDeclaredRoutes` | resolved |
| R1-I7 | Important | ENG-06/008、GATE-026 | 删除副本构造、active Change 处理与递归未定义 | 副本构造步骤、归档作用域内 Change、`TEMPLATE_COPY` 防递归、固定 OpenSpec CLI 1.6.0 | resolved |
| R1-I8 | Important | GATE-15 | 与 EX-012、PC-001、ENG-005/003 的真实仓库核验矛盾 | 区分门禁逻辑自测与模板事实核验 | resolved |
| R1-I9 | Important | design 去写死、ENG-05 | 根 scripts 与 vitest projects 的写死无方案 | `run-by-manifest.ts` 与 `testProjects[].config`；扫描值不扫键名 | resolved |
| R1-I10 | Important | design X-Request-Id、PC-05 | 协议包公共选项 `nextRequestId` 仍允许覆盖 | 删除该公共选项，测试改用 `headerPatterns` 与内部注入 | resolved |
| R1-I11 | Important | design verify、GATE-14 | verify 平台步骤与 weapp 逐文件约定冲突 | `perFile`/`prepare`、逐文件报告与续跑 | resolved |
| R1-I12 | Important | design verify、GATE-12/14 | `--change` 未作用到 `check:fast` 内的 `check:fixtures` | `SCENARIO_GATE_CHANGES` 环境变量传递 | resolved |
| R2-I1 | Important | design 示例解耦、任务 10/15 | 漏 `idl-routes.test.ts`，子模块列表未加标记 | 改用 generated 常量；子模块示例条目加 Markdown 标记 | resolved |
| R2-I2 | Important | ENG-06、任务 5/17 | 副本 `node_modules` 链接回原仓库，可能假绿 | 副本内 `pnpm install --offline --frozen-lockfile` 并断言 realpath | resolved |
| R2-I3 | Important | ENG-06、任务 17/18 | 副本作用域与环境变量不一致 | 运行约定带作用域；副本归档后清除变量 | resolved |
| R2-I4 | Important | tasks 任务 8/13 | 中途 verify 要求全部通过不可达 | 第 1、2 步通过，第 3 步问题须归属后续任务 | resolved |
| R2-I5 | Important | design 协议义务、PC-01、任务 10 | 请求字段策略与协议矩阵写死示例方法 | `requestFields` 迁入声明；矩阵按声明遍历、Fixture 以接口名为键 | resolved |
| R3-I1 | Important | tasks.md 任务 18 GREEN；design"复刻验收方法与本次验收" | 复刻副本要求"不带作用域的 `pnpm verify` 全绿"，与 ENG-06 运行约定冲突 | 用户裁决"修正后再审一次"；运行约定扩展到 `test:affected` 与演练副本，任务 18 同步；第 4 次审查确认解决 | resolved |
| R4-I1 | Important | protocol-contract PC-01、PC-01/SCN-002 矩阵、ENG-06/SCN-008；design 协议义务 | "声明为空时义务清单为空"与"错误码义务来自 `businessErrors`"冲突，删除副本中必然失败 | 用户裁决"修正后由用户认可通过"；统一改为"按消费接口派生的义务为空"，写明业务错误码义务不受影响；用户确认 diff | resolved |
| R4-I2 | Important | design 技术架构文档、ENG-10、任务 16 | 架构文档演进记录链接到 Change 目录，会随归档与演练删目录断链，长期约定每次归档都会触发门禁失败 | 演进记录只写 Change 名称纯文本，相对链接只指向已存在的归档目录；用户确认 diff | resolved |
| A1 | Important | protocol-contract PC-05、SCN-PROTOCOL-CONTRACT-009；design X-Request-Id | Apply 任务 13 实测小程序宿主（基础库 3.10.3）没有 `crypto`，"由 `crypto.getRandomValues` 生成"不可实现；公司规范只规定格式，并未要求随机数的生成方式 | 用户裁决：默认随机源改为 `Math.random`，全平台同一实现，不设平台点位，生成器保持同步；注明请求 ID 只用于链路追踪、不要求密码学安全；格式、头名、与 `BaseReq.requestId` 同值、宿主不可覆盖、内部注入参数均不变 | resolved |
| A2 | Important | template-engineering SCN-TEMPLATE-ENGINEERING-008 `scenario-gate-green`；design 示例删除验收 | Apply 任务 17 发现：副本中按防递归规则排除的会创建副本的用例没有运行报告，门禁必然报缺少绑定，"问题数为 0"按字面不可达 | 用户裁决"精确扣除排除项"：问题集合须恰好等于由 `vitest.config.ts` 排除列表推导出的缺失项，多一条或少一条均失败，其余为 0；实施中发现平台项目（weapp）在副本中同样不可能产生绑定，按 WHEN 中"清单模式不要求平台报告"补入由清单 `class=platform` 派生的缺失绑定（A2 补充） | resolved |
| A3 | Important | template-engineering ENG-06、SCN-TEMPLATE-ENGINEERING-008；template-example；scenario-gate SCN-026 | 第二次示例删除演练发现：SCN-008 自身依赖示例存在，示例真正删除后必然失败，且每次集成测试都要建副本，对使用方是长期开销 | 用户裁决"随示例一起删"：SCN-008（ID 不变）移入 template-example 新增的 EX-10；其用例、Fixture 与排除列表条目加入删除白名单；ENG-06 保留删除保证与副本构造规定；SCN-026 改为引用 ENG-06 的副本规定 | resolved |
| A4 | Important | Final Code Review I-4；EX-09、PC-01 | 实施中在 SDK 根入口新增 `consumedOperations` 及三个类型的公共导出，Spec 与 design 未要求 | 用户裁决"不导出"：用例改为读源码；design 只要求声明模块导出，不构成规划修订，仅登记 | resolved |
| A5 | Important | template-example EX-09、SCN-TEMPLATE-EXAMPLE-012；design 迁出表 | 支付 SDK 复刻演练发现：EX-09 要求整份消费接口声明"恰好"是示例的两个接口，使用方新增接口时示例用例必然失败，与"先加后删"矛盾 | 用户裁决：只约束标记内的示例条目恰好是 CreateTrade、QueryTrade，声明允许标记外的使用方条目；派生接口集合由"恰好为"改为"包含" | resolved |
| A6 | Important | template-engineering ENG-06 白名单；design 白名单 | 支付 SDK 复刻演练第 2 轮发现：第四轮新增的"新增消费接口"回归用例写死 `CreateTradePay` 并追加到真实声明，使用方声明同一接口时重复、替换 IDL 后必然失败，挡住"先加后删" | 用户裁决"随示例删除"：该用例加入删除白名单，且只基于标记内示例条目与示例键构造数据 | resolved |
| R3-M1 ~ R3-M10 | Minor | 见第 3 次审查记录 | outdated 例外、`testProjects[].config` 可选时机、`test:affected` 作用域、排除理由措辞、proposal 未列 `nextRequestId` 破坏性变更、`environmentClass` 强制条件、EX-012 纳入 GATE-026 的任务归属、请求体 requestId 的写死点、proposal 中 verify 参数写法、`check:project-map` 脚本 | 不触发修复，记录为 advisory | accepted |

### Re-review Attempts

| Re-review Attempt | Reviewed Digest | Reviewer Status | Critical | Important | Minor | Notes |
|---|---|---|---:|---:|---:|---|
| 1 | 0f8ff68a20304db2c76acc42800da0a1d7af591d83f17c983dd2e1f7c78dab19 | Issues Found | 0 | 12 | 9 | 12 条 Important 均核实为 confirmed / introduced / in_scope / blocking，全部修复 |
| 2 | f80f71e534388daed1fc67ac0977827114576d30465bc0d65f343a80c7da36d9 | Issues Found | 0 | 5 | 9 | 第 1 次问题全部确认解决；新 5 条 Important 全部修复（R2-I5 经 Bridge 判定属于已批准的"义务由产品声明派生"范围） |
| 3 | f8e82934f0df8f5473f9322a853032916e92c60ee68a2ee26069e26c9239383f | Issues Found | 0 | 1 | 10 | 第 2 次问题全部确认解决；剩 1 条 Important；已达三次审查上限，记录 BLOCKED |
| 4 | 7ea018b48dd632a3537c3a25d5947a6f2820f55c4dc6cc2f7fd3508f3fe308f4 | Issues Found | 0 | 2 | 13 | 用户授权的额外审查；R3-I1 确认解决；新增 2 条 Important（均为措辞级矛盾）。admitted blockers 由 1 增至 2，触发 Review Non-Convergence，停止并请用户决定 |
| 用户裁决 | f42e312797a3460a7e0399ff430c959e77f0505ee57838855836f15747682dd8 | Approved（用户裁决） | 0 | 0 | 13 | 用户选择"修正后由用户认可通过"；Bridge 修正 R4-I1、R4-I2 及 R4-M1、M2、M4、M6，`openspec validate --strict` 通过，用户确认 diff 后放行 |
| Apply 期间用户裁决修订 | 14514624116f04e0780771215b4ab6166504df3c9afd402dbacb44706d2a8fa1 | Approved（用户裁决） | 0 | 0 | 13 | 任务 13 发现小程序宿主没有 `crypto`；用户裁决改用 `Math.random`，修订 PC-05、SCN-009 与 design 的随机源措辞（A1），`openspec validate --strict` 通过 |
| Apply 期间用户裁决修订 2 | 8ddc5d01b814f19fe2ab3ecb0d9d9e37ef903763a61430a6cd1fe9ed5f3bc15b | Approved（用户裁决） | 0 | 0 | 13 | 任务 17 发现 SCN-008 的场景门禁口径与防递归排除冲突；用户裁决精确扣除排除项（A2），`openspec validate --strict` 通过 |
| Apply 期间修订 2 补充 | 4d72484291f3f8493ec8f3932d68e13aa740dcbdcb27a3d5605147e2199523bd | Approved（用户裁决范围内的措辞补充） | 0 | 0 | 13 | 期望集合补入清单平台项目的缺失绑定，与 SCN-008 WHEN"不要求平台报告"一致；`openspec validate --strict` 通过 |
| Apply 期间用户裁决修订 3 | 39e9fbf67b392fb075c81f8e65579f0d05b6be1e153688ba0d55e22ed929f501 | Approved（用户裁决） | 0 | 0 | 13 | SCN-008 随示例一起删除（A3）；登记根入口不导出的裁决（A4）；`openspec validate --strict` 通过 |
| Apply 期间用户裁决修订 4 | 6ef30dcf6cd2dc7a7e15c9c579e9b39d09198a61300bba89944a18a2ce81cb0a | Approved（用户裁决） | 0 | 0 | 13 | EX-09 只约束示例条目（A5）；`openspec validate --strict` 通过 |
| Apply 期间用户裁决修订 5 | 2c0181c8a3f61f8250ba0b45cf64f2daf4f8a4c2165d0d0ddd7fb01cc9cfe026 | Approved（用户裁决） | 0 | 0 | 13 | "新增消费接口"回归用例随示例删除（A6）；`openspec validate --strict` 通过 |
| 任务 18 计划内修订 | 284e4d098bae6ef4992b4daf0bc2db19ae9a50faea67d7efe5ad1dee00334303 | Approved（用户确认） | 0 | 0 | 13 | 按任务 18 契约关闭 design OI-CH-02，结论经用户 2026-10-10 确认（维持现节奏，并增加交付前无作用域完整运行）；只改开放问题表，不改需求与任务契约 |

## Gate Decision

- Decision: PASS
- Blocking reason: None。第 4 次审查后的两条 Important 已按用户裁决修正并经用户确认；放行依据为用户裁决，而非第 5 次独立审查。2026-10-10 Apply 期间按用户裁决修订随机源措辞（A1），同日按用户裁决修订 SCN-008 场景门禁口径（A2），并将 SCN-008 移入 template-example、随示例一起删除（A3），并将 EX-09 改为只约束示例条目（A5），将"新增消费接口"回归用例加入删除白名单（A6），按任务 18 契约关闭 OI-CH-02，digest 随之更新。
- Accepted Minor findings: R3-M1、M2、M4、M6、M8、M10 与 R4-M3、M5（outdated 例外、`testProjects[].config` 可选时机、排除理由措辞、`environmentClass` 强制条件、请求体 requestId 写死点、`check:project-map` 脚本、scripts 值中的命令名、任务 4 副本 helper 时机），实施方可在 Apply 中直接处理；R3-M3/M5/M7/M9 与 R4-M1/M2/M4/M6 已修正。
- Freshness check command: `/Users/liyongning/.claude/skills/change/scripts/plan-review-digest.py openspec/changes/template-core-hardening --check-review openspec/changes/template-core-hardening/plan-review.md`

## Machine Record

```json
{
  "version": 1,
  "change": "template-core-hardening",
  "schema": "openspec-workflow",
  "reviewer": "user decision after independent review attempt 4; amended by user decision during apply (A1, A2, A3, A5, A6)",
  "prompt_provenance": "skill/change/references/plan-reviewer-prompt.md",
  "reviewed_at": "2026-10-10T00:00:00Z",
  "canonicalization_version": 1,
  "reviewed_sha256": "284e4d098bae6ef4992b4daf0bc2db19ae9a50faea67d7efe5ad1dee00334303",
  "current_sha256": "284e4d098bae6ef4992b4daf0bc2db19ae9a50faea67d7efe5ad1dee00334303",
  "reviewer_status": "Approved",
  "gate": "PASS",
  "critical": 0,
  "important": 0,
  "minor": 13
}
```

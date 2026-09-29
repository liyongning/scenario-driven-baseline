# 技术选型会话复核记录（临时）

记录日期：2026-09-06。任务：支付 SDK _ plan，ID：01a074b6-d6f4-7670-a57a-b9baf070f1b6。

本文件仅保存会话复核证据，供后续上下文恢复核对；不是第二份方案、需求来源或 SDK-P 待办表，不参与覆盖分母或验收判定。正式结论已写入同 Change 的 Proposal、Design、两份 Spec 和 Tasks。正式产物以当前内容为准；本备忘完成用途后可删除。

## 复核范围

通过 Codex 任务历史接口连续读取到会话起点，核对用户消息和对应最终答复。重点逐轮复核从首次提出技术选型，到三包架构、测试、场景 ID、AGENTS、官方脚手架和 Skill 备忘的讨论；同时回看此前 SDK 网络、等待、身份和 TODO 归属，避免将早期候选或已撤回方案恢复为结论。

| 沟通主题 | 关键用户轮次 ID | 核对结论及正式落点 |
| --- | --- | --- |
| 初始 Monorepo、Proto/transport、Shadow、pnpm/Vitest 与用例来源 | 01a0760c-752d-7dc0-85ce-8f9f41b82750 | 两个产品职责边界保持；三包以之后用户总结为准。Design Packaging、Scenario-driven tests |
| 100% 的统计范围；Rslib/tsdown/Vite | 01a07628-581e-72a3-8392-c4a5c016acbf | 全部手写实现四项 100%；ProtoGen 生成代码排除。现有 Rslib 只作参考，新工程使用 Vite；不另设生成算法覆盖项目 |
| Vue 口误及 Vite 声明输出 | 01a076e1-031b-7fa2-a978-3a414cdbe915、01a076e5-c536-75e1-a849-b261a4613478 | Vite 库模式与声明插件，纯 TS、不引入 Vue；tsc --noEmit 独立类型检查，声明不再另走 tsc 管线 |
| 用户总结三包架构与工程基建 | 01a076eb-2358-7193-a5a0-b2dea29f5328 | payment-sdk、payment-protocol、private e2e；Spec/IDL 两类输入；AI 编写后保存测试与 Fixture，Vitest 执行。Design 工程基线表与架构图 |
| 场景门禁、testing/Fixture 归属、AGENTS | 01a07731-c96f-7671-a191-a6a9a0a3e24b | 单测就近；协议 testing 是工具；跨包测试和数据在 E2E 分目录；Spec/IDL、绑定、本次报告三方核对 |
| 模拟器与真实渠道边界 | 01a07737-ed2d-7181-8b78-eb01f66e41e7 | Node 集成及开发者工具自动化使用 Shadow；渠道 API 使用独立替身；不能以此声称真实收银台/支付验收通过 |
| 场景 ID 实际可行性；Fixture 不等于完整用例 | 01a07741-9ed1-7ea1-877f-bb11dae33085 | 当前 36 个 Scenario 有项目 TC ID；现有静态 checker 不等于新 SDK 门禁。Spec 是期望，测试代码是步骤/断言，Fixture 是数据 |
| 规划阶段完整目录/AGENTS、脚手架、组合流程、Skill 临时记录 | 01a0774d-3fdd-7352-afce-d3c843b420ae | 四份 AGENTS 正文与官方初始化步骤在 Design；TC/case 多对多，FLOW 同次运行；Skill 后续事项仅保留独立临时备忘 |

## 本次发现并修订的遗漏/矛盾

- SDK-P05 将已明确架构、初始化登记和验收证据混在一起。正式待决表只保留未确认的输出格式和双包版本策略；仓库、工具版本、Consumer/Profile、迁移和 CI 取证进入工程交付输入与相应 Task。
- HTTP 端口示例复用带 PaymentError 的 SDK PortResult，与单向依赖冲突。协议包拥有 CommunicationResult/通信错误与 Cancellation，SDK 统一映射为支付结果；ProtoClient 使用现有 generated RpcMethodMeta，不复制元数据类型或配置全局 handler。
- 文件布局中生成目录仍有“建议”字样，任务对测试入口/驱动等仍重复等待 P05。已固定路径及责任，并同步 Task 的创建/修改顺序。
- 场景元数据的格式尚未具体说明。已定义版本、case、检查点、环境、依赖字段及测试/Fixture/报告绑定，在 CORE-003 登记实例；其余逐场景用例设计由 Task 6 基于事实完成并评审，缺失仍计入覆盖缺口。
- Task 8 曾把业务权益和部署安排写成 SDK 自动化的通用前置。已拆开 SDK 自动化、真实渠道验收与业务联调；真实环境缺失不得伪称验收通过，也不妨碍按 Shadow 设计自动化。

## 尚未确认与状态

输出 ESM + CJS 或仅 ESM、双包独立或同步版本，历史中均未找到明确用户结论。本轮已给用户提供选项；未收到答复时不把建议当作已确认决策。SDK-P01/P02/P04 仍按正式待决表等待联合契约，不因工程选型整理而关闭。

本次仅更新规划文档，未创建 SDK 仓库或运行脚手架；36 个 TC、6 类 FLOW 保持 draft。工具版本兼容、门禁实施、真实支付与 CI 保护仍需按 Tasks 取证。

后续 Skill 工作仍在 [Change Skill 临时备忘](change-skill-followups.tmp.md)，本轮不修改 Skill。

补记（2026-09-07）：用户已确认 ESM + CommonJS 双格式及类型声明，正式方案与任务已同步。SDK-P05 现仅保留双包版本策略，用户正在了解其含义，尚未作出选择。

补记（2026-09-07，版本规则确认）：用户确认独立版本，发布统一以 SDK 为维度；协议包无独立发布工作流，只作为 SDK 依赖随同一流程处理。开发 workspace:*、打包固定精确依赖的方案获确认。正式 SDK-P05 待决行已移除，剩 SDK-P01/P02/P04 三项；技术选型关闭不代表方案评审、实施或验收完成。

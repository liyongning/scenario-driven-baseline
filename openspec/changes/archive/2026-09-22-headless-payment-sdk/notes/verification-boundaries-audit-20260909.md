# 场景验证边界及 Task 6 元数据核对（2026-09-09）

本文件是核对/交接记录，不是第二份规范；正式事实在两份 Spec、Design 和 Tasks。

## 用户裁决与原始上下文

用户本轮明确：“E2e是覆盖所有的场景，这个场景呢，是指说可见的行为产生的影响和结果……而单元测试呢，它覆盖的是每个模块的这种正确性。”
历史原话：“需要覆盖所有 Scenario 场景，或者多个场景组合，关注的是行为、过程和结果。”

Apply 候选将内部假端口 case 统一归入 integration，与既定公共 E2E 入口边界矛盾。Bridge 先核对原始 CORE-001/002/010、CONTRACT-001 与 Design，向用户提出 META-SCOPE-001，未以独立评审或“无需确认”措辞替代授权。用户裁决后才写入正式分类规则。

## 采用的结论

- 全部 46 个 Scenario 留在 Spec。verification v2 按 case 明确 behavior/module/engineering；含 behavior 的场景共 39 项。
- 205 个必需 case：150 behavior、5 module、50 engineering；项目义务 197 integration、5 sdk-unit、63 weapp（同一 case 可要求多个项目）。
- behavior 验证公共可见的行为、过程影响、结果；module 使用就近单测；engineering 验证产物/CLI/来源或任务证据。三类均为必需，内部/工程证据不抵扣支付 E2E、HTTP 协议或连续 FLOW。
- 原 Scenario WHEN/THEN、公共 TS 片段、整个八条 FLOW 章节与八个任务 checkbox 均与 083b517 相同。只补验证设计及其实施责任，不改产品流程、公共 API、协议包重试/网络职责或技术路线。
- 不默认接受 Apply 候选；依据正文纠正了有效 status_code 与冗余提示冲突的判定、observe 阶段断言、平台与双格式/声明证据混用、内部调用标记读写、缺失参数/平台/非法信封分支和人工验收的证据边界。

## 实施交接范围

Task 6 更新 verification schema/清单、reporter/绑定、分类门禁及受影响 AGENTS；为五项内部 case 在既有 SDK 就近单测补 meta/实际断言证据。使用已有 Vitest meta/annotate，不让产品测试反向依赖 E2E helper，不新建 SDK 生产测试出口。无外部数据的 module 明确 fixtureCase/Fixture 来源 null，仍检查测试源码 freshness；其他情况保留实际来源。

协议/Shadow部分继续依赖 Task 1–3，五项内部 case 的证据还依赖已交付 Task 4/5；不反向等待 Task 7 公共工厂。Task 6 inventory 保留尚未交付的公共测试、FLOW 和实际仓库证据缺口。Task 7/8 继续交付公共消费、全部支付流程、实际平台/仓库和最终验收。CORE-017 的目标仓库保护不能由受控工具样例抵扣。CONTRACT-026 原五个运行时 case 保留，声明产物单列工程 case。

## 核验边界

已用独立结构审计检查 46 块的 JSON、字段/唯一键、检查点引用、kind/project、全部检查点绑定及上述不变项；严格 OpenSpec 验证和 diff whitespace 检查通过。结构审计不证明断言语义或测试运行。当前未实施这些解析器变更，未运行 SDK 工程/支付，不修改 Apply 产品文件或任务状态。

最终独立评审及 freshness 以同目录 plan-review.md 为准。

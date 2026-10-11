# Template Web Absorption 验收记录

## 逐任务记录

### Task 1 清单多包与组合绑定

**规划与输入**

- 起始 HEAD：`94357d4`
- 起始 freshness：`PASS`，digest `2424baeafe3c4ac6e197e4c92feb8faf01eacdef2204aea49ad94cdb9e3a94e3`
- 结束 freshness：`PASS`，digest 与起始值一致。
- `openspec validate template-web-absorption --strict`：退出码 0。
- `pnpm install`：退出码 0；lockfile 已是最新状态。

**RED / GREEN**

- RED 覆盖第二个 product 或 protocol 包、绑定引用、用例环境、Fixture 协议声明与 owner 协议一致性；旧实现分别因“角色唯一”假设、未校验绑定拓扑和未声明协议而失败。
- GREEN 后，`SCN-SCENARIO-GATE-029`、`SCN-SCENARIO-GATE-030`、`SCN-TEMPLATE-ENGINEERING-013`、`SCN-TEMPLATE-ENGINEERING-014/no-unique-role-lookup` 均随本轮 `check:fast` 通过。
- 当前仓库只登记 `sdk-idl-weapp`，旧 IDL 行为未发生声明式回归。

**Fixture 与摘要**

- 19 个既有 IDL Fixture 补写 `"protocol": "protocol"`；新增数据集 schema 与预览数据集协议字段，不参与 owner 解析。
- `pnpm check:fixtures`：退出码 0，`manifests: 23`，`issues: []`。
- 本任务与规格对齐后实际刷新来源摘要的 owner 为：`SCN-PROTOCOL-CONTRACT-002`、`SCN-PROTOCOL-CONTRACT-008`、`SCN-SCENARIO-GATE-009`、`SCN-TEMPLATE-ENGINEERING-001`、`SCN-TEMPLATE-ENGINEERING-003`、`SCN-TEMPLATE-ENGINEERING-008`。按 R5-M4，owner 列表已明确包含 `SCN-TEMPLATE-ENGINEERING-008`。

**Verification**

- `SCENARIO_GATE_CHANGES=template-web-absorption pnpm check:fast`：退出码 1。
  - 前台 59/60 个集成文件通过、124/125 个用例通过；其余 unit、build、typecheck、coverage、fixtures、package 步骤通过，四项覆盖率均为 100%。
  - 唯一失败为 SCN-TEMPLATE-ENGINEERING-008 的 `example-removal-scenarios`，`example-removal-fast` 通过。
- `pnpm check:scenarios --change template-web-absorption`：退出码 1，共 45 条问题、涉及 32 个本 Change Scenario。
  - `openapi-unit` 未登记：11 条，归属任务 5。
  - `app-unit` 未登记：13 条，归属任务 8。
  - `browser` 未登记：20 条，归属任务 10。
  - `FLOW-WEB-EXAMPLE-001` 的 browser 环境未登记：1 条，归属任务 10。
  - 按 R5-M1，上述问题全部属于 A2 期望集合之外的两类允许问题；没有缺失绑定、非本 Change Scenario 或其他问题。
- `SCENARIO_GATE_CHANGES=template-web-absorption pnpm test:affected`：退出码 1，原因仍仅为上述允许的 `example-removal-scenarios`。
  - 计划 run id：`affected-20261011T045804Z`。
  - 改动命中 `eslint.config.js`、`package.json`、`project.manifest.json`，按规则全量触发 `pnpm check:fast`。
  - unit 实际执行 72 个文件、401 个用例并全部通过；覆盖率四项 100%。

**Review / Acceptance**

- 6 处唯一角色读取已完成改造：清单加载校验、`check-architecture`、`check-package`、`check-release`、`contract-inventory`、`run-by-manifest` 均按包集合或绑定遍历；测试包保持唯一。
- `defineCase` 支持 `binding` 字段，按字段、`tests/<binding>/` 目录、无绑定三级判定；已登记 IDL 用例均声明 `sdk-idl-weapp`。
- 架构检查会拒绝导入绑定独占包但未声明绑定的测试文件；临时根反例通过。
- 发布范围限定为 SDK 形态产品包及其绑定协议包；Web 产品包骨架尚未登记。
- `git diff --check` 退出码 0。
- 未发现需要在后续任务继续处理的缺陷；未执行任务 14、15 的演练，也未修改其 checkbox。

**Commit**

- `feat(template): support multiple packages per role with product bindings`

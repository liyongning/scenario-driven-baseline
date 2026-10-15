# Verification

## Metadata

- Change: template-web-absorption
- Schema: openspec-workflow
- Verified Git revision: `264933a39d85c0712ae9589ab111dc7d759209c2`（worktree 分支 `template-web-absorption-apply`）
- Verification input manifest digest: `13f5cae9139a6eb09d90ad0636aec208331a6fe1df2720418d1fd591f09bf535`（979 个路径）
- Manifest includes: `git ls-files -co --exclude-standard` 的全部路径（代码、测试、配置、文档、proposal/specs/design/tasks/plan-review），按路径排序，逐个计入路径、类型、可执行位、内容或符号链接目标；排除 Verification Artifact 自身。算法：验收方会话临时目录 `scratchpad/final/manifest-digest.py`（sha256，路径\0类型\0可执行位\0 + 内容 sha256）
- Plan Review verdict: PASS
- Reviewed digest: `3a9dec29eb49f620a46db1644eb7e399ef94b14fa7f93e71e08039096e1dafa5`
- Current digest: `3a9dec29eb49f620a46db1644eb7e399ef94b14fa7f93e71e08039096e1dafa5`
- Plan Review digest match: yes
- Unresolved Plan Review findings: Critical 0 / Important 0（Minor 7 条按 plan-review.md 记录为 advisory）
- Untracked inputs included: None
- Excluded lifecycle paths: `openspec/changes/template-web-absorption/verify.md`（本文件）；Sync 将改写的 `openspec/specs/**` 与 Archive 移动的 Change 目录属于后续阶段输出
- Verified at: 2026-10-15T05:59:39Z（V-1 起于 2026-10-15T04:58:34Z，见 V-1 说明）
- Verification environment: macOS（Darwin 25.2.0，arm64）、Node v22.21.1、pnpm 10.20.0、Vitest 5.0.3、OpenSpec CLI 1.6.0、微信开发者工具（正式版）2.01.2510290

## Apply Gate

- Fresh Apply state: all_done
- Apply progress: 16/16
- Unchecked tasks: 0
- Final Code Review: PASS（首轮评审于 `6e4d0c2`，修复提交 `d88f788`；增量评审覆盖 `d88f788..2ecf5b9`，FCR2-1 Critical、FCR2-2/3 Important 已修复于 `264933a`，验收方逐条核对 RED/GREEN 证据，见附录"Final Code Review 第 2 轮（增量）"）
- Unresolved Critical findings: 0
- Unresolved Important findings: 0
- Accepted Minor findings: 12（Plan Review Minor 7 条，见 plan-review.md；增量评审 M4–M8 共 5 条）

## Verification Summary

| Dimension | Status | Evidence |
|---|---|---|
| Completeness | PASS | 6 个 Artifact 均为 done，16/16 Task 完成；54 条 Requirement、113 个 Scenario 均有用例与门禁证据（见 Completeness） |
| Correctness | PASS | V-1 全量 verify 各步退出码 0（weapp 经同 run id 续跑，原因为环境阻塞，见 V-1）；V-2 独立场景门禁 complete、0 问题；V-3 validate --strict 通过；V-4 规划摘要 PASS；V-5 归档演练合并无丢失 |
| Coherence | WARNING | 各层与已批准规划（含 Apply 中途修订一、二）一致；保留风险为微信开发者工具挂起（V-1）与已登记的 Minor 与只登记项（见 Coherence、Unverified Areas） |

## Completeness

### Artifact and Task Completion

| Item | Authority | Expected | Observed | Status |
|---|---|---|---|---|
| proposal | `openspec status --change template-web-absorption --json` | done | done | PASS |
| specs | 同上 | done | done | PASS |
| design | 同上 | done | done | PASS |
| tasks | 同上 | done | done | PASS |
| plan-review | 同上 | done | done | PASS |
| verification | 同上 | done | done | PASS |
| Tasks 1–16 | `openspec instructions apply --change template-web-absorption --json` | all_done，16/16 | all_done，16/16 | PASS |
| Plan Review | `plan-review-digest.py --check-review` | freshness=PASS | freshness=PASS | PASS |

### Requirement Coverage

| Requirement | Spec Source | Implementation Evidence | Verification IDs | Status |
|---|---|---|---|---|
| BRW-01 浏览器驱动与执行约定 | `openspec/changes/template-web-absorption/specs/browser-platform/spec.md:3`（ADDED） | `packages/e2e/src/drivers/browser.test.ts`；`packages/e2e/tests/web-openapi-browser/browser-platform.browser.spec.ts` 等 3 个文件；Scenario SCN-BROWSER-PLATFORM-001, SCN-BROWSER-PLATFORM-002 | V-1, V-2 | PASS |
| BRW-02 协议宿主与应用宿主 | `openspec/changes/template-web-absorption/specs/browser-platform/spec.md:54`（ADDED） | `packages/e2e/src/hosts/protocol-host.test.ts`；`packages/e2e/tests/web-openapi-browser/browser-platform.browser.spec.ts` 等 5 个文件；Scenario SCN-BROWSER-PLATFORM-003, SCN-BROWSER-PLATFORM-004, SCN-BROWSER-PLATFORM-016 | V-1, V-2 | PASS |
| BRW-03 共用代理中间件与浏览器网络故障 | `openspec/changes/template-web-absorption/specs/browser-platform/spec.md:130`（ADDED） | `packages/e2e/src/hosts/proxy.test.ts`；`packages/e2e/tests/web-openapi-browser/browser-platform.browser.spec.ts`；Scenario SCN-BROWSER-PLATFORM-005, SCN-BROWSER-PLATFORM-006 | V-1, V-2 | PASS |
| BRW-04 dist 新鲜度校验 | `openspec/changes/template-web-absorption/specs/browser-platform/spec.md:181`（ADDED） | `packages/e2e/src/hosts/freshness.test.ts`；`packages/e2e/tests/tooling/browser-engineering.spec.ts`；Scenario SCN-BROWSER-PLATFORM-007 | V-1, V-2 | PASS |
| BRW-05 浏览器用例组织与驱动辅助 | `openspec/changes/template-web-absorption/specs/browser-platform/spec.md:209`（ADDED） | `packages/e2e/tests/web-openapi-browser/browser-platform.browser.spec.ts`；`packages/e2e/src/harness.test.ts` 等 3 个文件；Scenario SCN-BROWSER-PLATFORM-008, SCN-BROWSER-PLATFORM-009, SCN-BROWSER-PLATFORM-010 | V-1, V-2 | PASS |
| BRW-06 browser 测试项目与浏览器命令登记 | `openspec/changes/template-web-absorption/specs/browser-platform/spec.md:276`（ADDED） | `packages/e2e/tests/tooling/browser-engineering.spec.ts`；Scenario SCN-BROWSER-PLATFORM-011 | V-1, V-2 | PASS |
| BRW-07 本地预览 | `openspec/changes/template-web-absorption/specs/browser-platform/spec.md:304`（ADDED） | `packages/e2e/tests/web-openapi-browser/SCN-BROWSER-PLATFORM-012.browser.spec.ts`；`packages/e2e/src/preview/preview-launcher.test.ts`；Scenario SCN-BROWSER-PLATFORM-012, SCN-BROWSER-PLATFORM-013 | V-1, V-2 | PASS |
| BRW-08 开发代理与三种模式 | `openspec/changes/template-web-absorption/specs/browser-platform/spec.md:359`（ADDED） | `packages/e2e/src/preview/dev-remote.test.ts`；`packages/e2e/tests/tooling/SCN-BROWSER-PLATFORM-015.spec.ts`；Scenario SCN-BROWSER-PLATFORM-014, SCN-BROWSER-PLATFORM-015 | V-1, V-2 | PASS |
| OAS-01 契约登记与同步命令 | `openspec/changes/template-web-absorption/specs/openapi-contract/spec.md:3`（ADDED） | `packages/e2e/tests/tooling/SCN-OPENAPI-CONTRACT-001.spec.ts`；`scripts/api-contract.test.ts` 等 5 个文件；Scenario SCN-OPENAPI-CONTRACT-001, SCN-OPENAPI-CONTRACT-002, SCN-OPENAPI-CONTRACT-003, SCN-OPENAPI-CONTRACT-004 | V-1, V-2 | PASS |
| OAS-02 生成物与生产导入图 | `openspec/changes/template-web-absorption/specs/openapi-contract/spec.md:94`（ADDED） | `scripts/api-contract.test.ts`；`packages/e2e/tests/tooling/SCN-OPENAPI-CONTRACT-006.spec.ts`；Scenario SCN-OPENAPI-CONTRACT-005, SCN-OPENAPI-CONTRACT-006 | V-1, V-2 | PASS |
| OAS-03 REST 执行器 | `openspec/changes/template-web-absorption/specs/openapi-contract/spec.md:151`（ADDED） | `packages/e2e/tests/web-openapi-browser/SCN-OPENAPI-CONTRACT-007.spec.ts`；`packages/e2e/tests/web-openapi-browser/openapi-wire.browser.spec.ts` 等 8 个文件；Scenario SCN-OPENAPI-CONTRACT-007, SCN-OPENAPI-CONTRACT-008, SCN-OPENAPI-CONTRACT-009, SCN-OPENAPI-CONTRACT-010, SCN-OPENAPI-CONTRACT-011, SCN-OPENAPI-CONTRACT-012, SCN-OPENAPI-CONTRACT-013, SCN-OPENAPI-CONTRACT-014 | V-1, V-2 | PASS |
| OAS-04 OpenAPI 协议适配器 | `openspec/changes/template-web-absorption/specs/openapi-contract/spec.md:323`（ADDED） | `packages/e2e/tests/tooling/SCN-OPENAPI-CONTRACT-015.spec.ts`；`scripts/openapi-adapter.test.ts` 等 6 个文件；Scenario SCN-OPENAPI-CONTRACT-015, SCN-OPENAPI-CONTRACT-016, SCN-OPENAPI-CONTRACT-030 | V-1, V-2 | PASS |
| OAS-05 接口粒度的协议义务派生 | `openspec/changes/template-web-absorption/specs/openapi-contract/spec.md:405`（ADDED） | `packages/e2e/src/preview/openapi-obligation-matrix.test.ts`；`packages/e2e/tests/tooling/openapi-matrix-temporary.spec.ts` 等 8 个文件；Scenario SCN-OPENAPI-CONTRACT-017, SCN-OPENAPI-CONTRACT-018, SCN-OPENAPI-CONTRACT-019, SCN-OPENAPI-CONTRACT-020, SCN-OPENAPI-CONTRACT-021 | V-1, V-2 | PASS |
| OAS-06 响应校验与 Fixture 认领 | `openspec/changes/template-web-absorption/specs/openapi-contract/spec.md:540`（ADDED） | `packages/openapi/testing/schema.test.ts`；`packages/e2e/tests/web-openapi-browser/SCN-OPENAPI-CONTRACT-023.spec.ts` 等 4 个文件；Scenario SCN-OPENAPI-CONTRACT-022, SCN-OPENAPI-CONTRACT-023, SCN-OPENAPI-CONTRACT-024, SCN-OPENAPI-CONTRACT-025, SCN-OPENAPI-CONTRACT-026 | V-1, V-2 | PASS |
| OAS-07 OpenAPI 协议包形态与浏览器网络适配器 | `openspec/changes/template-web-absorption/specs/openapi-contract/spec.md:655`（ADDED） | `packages/e2e/tests/tooling/SCN-OPENAPI-CONTRACT-027.spec.ts`；`packages/e2e/tests/web-openapi-browser/SCN-OPENAPI-CONTRACT-028.spec.ts` 等 4 个文件；Scenario SCN-OPENAPI-CONTRACT-027, SCN-OPENAPI-CONTRACT-028 | V-1, V-2 | PASS |
| OAS-08 引擎测试契约与证据载体 | `openspec/changes/template-web-absorption/specs/openapi-contract/spec.md:708`（ADDED） | `packages/e2e/tests/tooling/SCN-OPENAPI-CONTRACT-029.spec.ts`；`packages/openapi/testing/engine/generated.test.ts`；Scenario SCN-OPENAPI-CONTRACT-029 | V-1, V-2 | PASS |
| PC-07 协议适配器 | `openspec/changes/template-web-absorption/specs/protocol-contract/spec.md:3`（ADDED） | `packages/e2e/tests/tooling/SCN-PROTOCOL-CONTRACT-014.spec.ts`；`scripts/lib/protocol-adapters.test.ts` 等 6 个文件；Scenario SCN-PROTOCOL-CONTRACT-014, SCN-PROTOCOL-CONTRACT-015, SCN-PROTOCOL-CONTRACT-016 | V-1, V-2 | PASS |
| PC-08 IDL 协议包的浏览器网络适配器 | `openspec/changes/template-web-absorption/specs/protocol-contract/spec.md:85`（ADDED） | `packages/protocol/src/adapters/network/fetch.test.ts`；`packages/e2e/tests/protocol/SCN-PROTOCOL-CONTRACT-018.spec.ts` 等 3 个文件；Scenario SCN-PROTOCOL-CONTRACT-017, SCN-PROTOCOL-CONTRACT-018, SCN-PROTOCOL-CONTRACT-021 | V-1, V-2 | PASS |
| PC-01 基于 IDL 的协议义务派生 | `openspec/changes/template-web-absorption/specs/protocol-contract/spec.md:169`（MODIFIED） | `packages/e2e/tests/tooling/SCN-PROTOCOL-CONTRACT-001.spec.ts`；`scripts/lib/contract-inventory.scan.test.ts` 等 8 个文件；Scenario SCN-PROTOCOL-CONTRACT-001, SCN-PROTOCOL-CONTRACT-002, SCN-PROTOCOL-CONTRACT-005 | V-1, V-2 | PASS |
| PC-03 Shadow 路由使用中立描述 | `openspec/changes/template-web-absorption/specs/protocol-contract/spec.md:272`（MODIFIED） | `packages/e2e/src/shadow/routes.test.ts`；`packages/e2e/tests/tooling/SCN-PROTOCOL-CONTRACT-004.spec.ts` 等 3 个文件；Scenario SCN-PROTOCOL-CONTRACT-004 | V-1, V-2 | PASS |
| PC-04 Fixture 响应与协议同形 | `openspec/changes/template-web-absorption/specs/protocol-contract/spec.md:300`（MODIFIED） | `packages/e2e/src/shadow/response-shape.test.ts`；`packages/protocol/testing/response-shape.test.ts`；Scenario SCN-PROTOCOL-CONTRACT-006, SCN-PROTOCOL-CONTRACT-007 | V-1, V-2 | PASS |
| PC-05 X-Request-Id 按公司规范生成 | `openspec/changes/template-web-absorption/specs/protocol-contract/spec.md:358`（MODIFIED） | `packages/e2e/tests/protocol/SCN-PROTOCOL-CONTRACT-008.spec.ts`；`packages/e2e/tests/weapp/SCN-PROTOCOL-CONTRACT-008.spec.ts` 等 8 个文件；Scenario SCN-PROTOCOL-CONTRACT-008, SCN-PROTOCOL-CONTRACT-009, SCN-PROTOCOL-CONTRACT-010 | V-1, V-2 | PASS |
| PC-06 Shadow 请求记录、路径转换与有界轮询 | `openspec/changes/template-web-absorption/specs/protocol-contract/spec.md:438`（MODIFIED） | `packages/e2e/src/shadow/records-and-polling.test.ts`；`packages/e2e/src/preview/preview-server.test.ts` 等 4 个文件；Scenario SCN-PROTOCOL-CONTRACT-011, SCN-PROTOCOL-CONTRACT-012, SCN-PROTOCOL-CONTRACT-013, SCN-PROTOCOL-CONTRACT-019, SCN-PROTOCOL-CONTRACT-020 | V-1, V-2 | PASS |
| GATE-16 Fixture 与预览数据集按声明的协议委托协议适配器检查 | `openspec/changes/template-web-absorption/specs/scenario-gate/spec.md:3`（ADDED） | `packages/e2e/tests/tooling/SCN-SCENARIO-GATE-028.spec.ts`；`scripts/check-fixtures.protocol.test.ts` 等 4 个文件；Scenario SCN-SCENARIO-GATE-028, SCN-SCENARIO-GATE-030 | V-1, V-2 | PASS |
| GATE-17 用例运行环境按组合绑定校验 | `openspec/changes/template-web-absorption/specs/scenario-gate/spec.md:59`（ADDED） | `packages/e2e/src/cases/define-case-binding.test.ts`；`packages/e2e/tests/tooling/SCN-SCENARIO-GATE-029.spec.ts`；Scenario SCN-SCENARIO-GATE-029 | V-1, V-2 | PASS |
| GATE-07 覆盖清单由事实源生成且缺绑定被阻断 | `openspec/changes/template-web-absorption/specs/scenario-gate/spec.md:94`（MODIFIED） | `packages/e2e/tests/tooling/SCN-SCENARIO-GATE-009.spec.ts`；`packages/e2e/tests/tooling/SCN-SCENARIO-GATE-027.spec.ts` 等 3 个文件；Scenario SCN-SCENARIO-GATE-009, SCN-SCENARIO-GATE-027 | V-1, V-2 | PASS |
| GATE-10 Fixture 来源绑定以 owner ID 与 Requirement 块摘要为准 | `openspec/changes/template-web-absorption/specs/scenario-gate/spec.md:147`（MODIFIED） | `packages/e2e/tests/tooling/SCN-SCENARIO-GATE-012.spec.ts`；`scripts/check-fixtures.test.ts` 等 5 个文件；Scenario SCN-SCENARIO-GATE-012, SCN-SCENARIO-GATE-013, SCN-SCENARIO-GATE-014, SCN-SCENARIO-GATE-015 | V-1, V-2 | PASS |
| ENG-11 清单多包与组合绑定 | `openspec/changes/template-web-absorption/specs/template-engineering/spec.md:3`（ADDED） | `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-013.spec.ts`；`scripts/lib/project-manifest-binding.test.ts` 等 4 个文件；Scenario SCN-TEMPLATE-ENGINEERING-013, SCN-TEMPLATE-ENGINEERING-014 | V-1, V-2 | PASS |
| ENG-12 按产品形态区分的工程检查 | `openspec/changes/template-web-absorption/specs/template-engineering/spec.md:79`（ADDED） | `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-015.spec.ts`；`scripts/engineering-form.test.ts`；Scenario SCN-TEMPLATE-ENGINEERING-015 | V-1, V-2 | PASS |
| ENG-01 三包边界与产品交付 | `openspec/changes/template-web-absorption/specs/template-engineering/spec.md:122`（MODIFIED） | `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-001.spec.ts`；Scenario SCN-TEMPLATE-ENGINEERING-001 | V-1, V-2 | PASS |
| ENG-03 公共类型中文注释随双格式声明交付 | `openspec/changes/template-web-absorption/specs/template-engineering/spec.md:161`（MODIFIED） | `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-003.spec.ts`；`scripts/lib/public-doc.test.ts` 等 4 个文件；Scenario SCN-TEMPLATE-ENGINEERING-003, SCN-TEMPLATE-ENGINEERING-016 | V-1, V-2 | PASS |
| ENG-05 项目清单驱动工程门禁 | `openspec/changes/template-web-absorption/specs/template-engineering/spec.md:211`（MODIFIED） | `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-005.spec.ts`；`scripts/lib/project-manifest.test.ts`；Scenario SCN-TEMPLATE-ENGINEERING-005 | V-1, V-2 | PASS |
| ENG-06 使用指南与替换点地图 | `openspec/changes/template-web-absorption/specs/template-engineering/spec.md:274`（MODIFIED） | `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-006.spec.ts`；`scripts/check-architecture.test.ts`；Scenario SCN-TEMPLATE-ENGINEERING-006 | V-1, V-2 | PASS |
| ENG-07 覆盖率完整性 | `openspec/changes/template-web-absorption/specs/template-engineering/spec.md:339`（MODIFIED） | `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-009.spec.ts`；`scripts/check-coverage.test.ts`；Scenario SCN-TEMPLATE-ENGINEERING-009 | V-1, V-2 | PASS |
| ENG-08 代码风格与规模基线 | `openspec/changes/template-web-absorption/specs/template-engineering/spec.md:382`（MODIFIED） | `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-010.spec.ts`；`scripts/lib/dependency-rules.test.ts`；Scenario SCN-TEMPLATE-ENGINEERING-010 | V-1, V-2 | PASS |
| ENG-10 技术架构文档 | `openspec/changes/template-web-absorption/specs/template-engineering/spec.md:416`（MODIFIED） | `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-012.spec.ts`；`scripts/check-architecture-doc.test.ts`；Scenario SCN-TEMPLATE-ENGINEERING-012 | V-1, V-2 | PASS |
| EX-10 示例删除的自动化验收 | `openspec/changes/template-web-absorption/specs/template-example/spec.md:3`（MODIFIED） | `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-006.spec.ts`；`packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-008.spec.ts` 等 4 个文件；Scenario SCN-TEMPLATE-ENGINEERING-008 | V-1, V-2 | PASS |
| WEB-01 Web 应用产品包的初始化与对齐 | `openspec/changes/template-web-absorption/specs/web-app/spec.md:3`（ADDED） | `packages/e2e/tests/tooling/SCN-WEB-APP-001.spec.ts`；`scripts/web-app.test.ts`；Scenario SCN-WEB-APP-001 | V-1, V-2 | PASS |
| WEB-03 应用包目录结构与组件树 | `openspec/changes/template-web-absorption/specs/web-app/spec.md:39`（ADDED） | `packages/e2e/tests/tooling/SCN-WEB-APP-004.spec.ts`；`scripts/check-component-tree.test.ts`；Scenario SCN-WEB-APP-004 | V-1, V-2 | PASS |
| WEB-04 状态分层与全局 store 约束 | `openspec/changes/template-web-absorption/specs/web-app/spec.md:86`（ADDED） | `packages/e2e/tests/tooling/SCN-WEB-APP-005.spec.ts`；`scripts/web-app.test.ts`；Scenario SCN-WEB-APP-005 | V-1, V-2 | PASS |
| WEB-05 应用包依赖方向 | `openspec/changes/template-web-absorption/specs/web-app/spec.md:124`（ADDED） | `packages/e2e/tests/tooling/SCN-WEB-APP-006.spec.ts`；`scripts/web-app.test.ts`；Scenario SCN-WEB-APP-006 | V-1, V-2 | PASS |
| WEB-06 核心层 DOM 禁令与部署配置读取 | `openspec/changes/template-web-absorption/specs/web-app/spec.md:159`（ADDED） | `packages/e2e/tests/tooling/SCN-WEB-APP-007.spec.ts`；`scripts/web-app.test.ts` 等 3 个文件；Scenario SCN-WEB-APP-007, SCN-WEB-APP-008 | V-1, V-2 | PASS |
| WEB-07 应用包的 lint 配置与覆盖率纪律 | `openspec/changes/template-web-absorption/specs/web-app/spec.md:205`（ADDED） | `packages/e2e/tests/tooling/SCN-WEB-APP-009.spec.ts`；`scripts/web-app.test.ts`；Scenario SCN-WEB-APP-009 | V-1, V-2 | PASS |
| WEB-08 应用包测试环境与覆盖完整性 | `openspec/changes/template-web-absorption/specs/web-app/spec.md:232`（ADDED） | `packages/e2e/tests/tooling/SCN-WEB-APP-010.spec.ts`；`packages/e2e/tests/tooling/removal-expected.spec.ts` 等 4 个文件；Scenario SCN-WEB-APP-010, SCN-WEB-APP-011 | V-1, V-2 | PASS |
| WEB-09 Web 产物边界检查 | `openspec/changes/template-web-absorption/specs/web-app/spec.md:276`（ADDED） | `packages/e2e/tests/tooling/SCN-WEB-APP-012.spec.ts`；`packages/e2e/tests/tooling/removal-expected.spec.ts` 等 5 个文件；Scenario SCN-WEB-APP-012, SCN-WEB-APP-013, SCN-WEB-APP-014 | V-1, V-2 | PASS |
| WEX-01 示例页面的交易功能 | `openspec/changes/template-web-absorption/specs/web-example/spec.md:3`（ADDED） | `packages/e2e/tests/web-openapi-browser/SCN-WEB-EXAMPLE.browser.spec.ts`；`packages/web/src/trade-create/example.test.ts` 等 4 个文件；Scenario SCN-WEB-EXAMPLE-001, SCN-WEB-EXAMPLE-002, SCN-WEB-EXAMPLE-003, SCN-WEB-EXAMPLE-004, SCN-WEB-EXAMPLE-005 | V-1, V-2 | PASS |
| WEX-02 示例的必需浏览器流程 | `openspec/changes/template-web-absorption/specs/web-example/spec.md:118`（ADDED） | `packages/e2e/tests/web-openapi-browser/SCN-WEB-EXAMPLE.browser.spec.ts`；`packages/web/src/__tests__/support.test.ts`；Scenario SCN-WEB-EXAMPLE-006 | V-1, V-2 | PASS |
| WEX-03 示例的状态分层示范 | `openspec/changes/template-web-absorption/specs/web-example/spec.md:145`（ADDED） | `packages/web/src/store/example.test.ts`；`packages/web/src/trade-create/example.test.ts`；Scenario SCN-WEB-EXAMPLE-007 | V-1, V-2 | PASS |
| WEX-04 示例的组件树与共享区 | `openspec/changes/template-web-absorption/specs/web-example/spec.md:179`（ADDED） | `packages/e2e/tests/tooling/SCN-WEB-EXAMPLE-facts.spec.ts`；`packages/web/src/shared/components/example.test.ts`；Scenario SCN-WEB-EXAMPLE-008 | V-1, V-2 | PASS |
| WEX-05 示例的运行辅助 | `openspec/changes/template-web-absorption/specs/web-example/spec.md:203`（ADDED） | `packages/web/src/runtime/__tests__/runtime.test.ts`；Scenario SCN-WEB-EXAMPLE-009 | V-1, V-2 | PASS |
| WEX-06 示例的消费接口、业务码完备性与不可达分支写法 | `openspec/changes/template-web-absorption/specs/web-example/spec.md:227`（ADDED） | `packages/e2e/tests/tooling/SCN-WEB-EXAMPLE-facts.spec.ts`；`packages/web/src/trade-create/example.test.ts`；Scenario SCN-WEB-EXAMPLE-010, SCN-WEB-EXAMPLE-011 | V-1, V-2 | PASS |
| WEX-07 示例的预览数据集 | `openspec/changes/template-web-absorption/specs/web-example/spec.md:271`（ADDED） | `packages/e2e/tests/tooling/SCN-WEB-EXAMPLE-facts.spec.ts`；Scenario SCN-WEB-EXAMPLE-013 | V-1, V-2 | PASS |
| WEX-08 Web 示例的删除白名单 | `openspec/changes/template-web-absorption/specs/web-example/spec.md:294`（ADDED） | `packages/e2e/tests/tooling/SCN-WEB-EXAMPLE-facts.spec.ts`；`scripts/lib/example-markers.test.ts`；Scenario SCN-WEB-EXAMPLE-014 | V-1, V-2 | PASS |
| WEX-09 示例替换演示：产品契约与协议约定可替换 | `openspec/changes/template-web-absorption/specs/web-example/spec.md:321`（ADDED） | `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-006.spec.ts`；`packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-008.spec.ts` 等 4 个文件；Scenario SCN-WEB-EXAMPLE-015 | V-1, V-2 | PASS |

### Scenario Coverage

| Scenario ID | Scenario | Requirement | Test or Runtime Evidence | Verification IDs | Status |
|---|---|---|---|---|---|
| SCN-BROWSER-PLATFORM-001 | 驱动默认上下文参数与 case 隔离 | BRW-01 | `packages/e2e/src/drivers/browser.test.ts`；`packages/e2e/tests/web-openapi-browser/browser-platform.browser.spec.ts` | V-1, V-2 | PASS |
| SCN-BROWSER-PLATFORM-002 | 浏览器依赖版本与自动化边界登记 | BRW-01 | `packages/e2e/tests/tooling/browser-engineering.spec.ts` | V-1, V-2 | PASS |
| SCN-BROWSER-PLATFORM-003 | 协议宿主按绑定加载执行器，只加载协议包产物并执行下发的计划步骤 | BRW-02 | `packages/e2e/src/hosts/protocol-host.test.ts`；`packages/e2e/tests/web-openapi-browser/browser-platform.browser.spec.ts` | V-1, V-2 | PASS |
| SCN-BROWSER-PLATFORM-004 | 应用宿主以本机回环地址与随机端口托管产物 | BRW-02 | `packages/e2e/src/hosts/app-host.test.ts`；`packages/e2e/tests/web-openapi-browser/browser-platform.browser.spec.ts` | V-1, V-2 | PASS |
| SCN-BROWSER-PLATFORM-016 | 宿主逻辑位于 e2e 源码目录，宿主配置由 schema 约束 | BRW-02 | `packages/e2e/src/hosts/web-config.test.ts`；`packages/e2e/tests/tooling/browser-engineering.spec.ts` | V-1, V-2 | PASS |
| SCN-BROWSER-PLATFORM-005 | 代理中间件原样转发并在上游提前断开时返回不完整响应 | BRW-03 | `packages/e2e/src/hosts/proxy.test.ts` | V-1, V-2 | PASS |
| SCN-BROWSER-PLATFORM-006 | 浏览器网络错误的两道防线与对照证据 | BRW-03 | `packages/e2e/tests/web-openapi-browser/browser-platform.browser.spec.ts` | V-1, V-2 | PASS |
| SCN-BROWSER-PLATFORM-007 | 产物摘要不一致时宿主拒绝启动 | BRW-04 | `packages/e2e/src/hosts/freshness.test.ts`；`packages/e2e/tests/tooling/browser-engineering.spec.ts` | V-1, V-2 | PASS |
| SCN-BROWSER-PLATFORM-008 | 占位资源域名由本地资源兑现 | BRW-05 | `packages/e2e/tests/web-openapi-browser/browser-platform.browser.spec.ts` | V-1, V-2 | PASS |
| SCN-BROWSER-PLATFORM-009 | waitForCalls 由 harness 统一提供 | BRW-05 | `packages/e2e/src/harness.test.ts`；`packages/e2e/tests/tooling/browser-engineering.spec.ts` | V-1, V-2 | PASS |
| SCN-BROWSER-PLATFORM-010 | 浏览器用例目录与已知行为文档 | BRW-05 | `packages/e2e/tests/tooling/browser-engineering.spec.ts` | V-1, V-2 | PASS |
| SCN-BROWSER-PLATFORM-011 | browser 项目按清单登记并被命令与门禁识别 | BRW-06 | `packages/e2e/tests/tooling/browser-engineering.spec.ts` | V-1, V-2 | PASS |
| SCN-BROWSER-PLATFORM-012 | 预览模式经共用代理把数据集交付给浏览器 | BRW-07 | `packages/e2e/tests/web-openapi-browser/SCN-BROWSER-PLATFORM-012.browser.spec.ts` | V-1, V-2 | PASS |
| SCN-BROWSER-PLATFORM-013 | 预览启动前校验数据集、默认数据集与占位资源 | BRW-07 | `packages/e2e/src/preview/preview-launcher.test.ts` | V-1, V-2 | PASS |
| SCN-BROWSER-PLATFORM-014 | 开发代理目标只来自环境变量 | BRW-08 | `packages/e2e/src/preview/dev-remote.test.ts` | V-1, V-2 | PASS |
| SCN-BROWSER-PLATFORM-015 | 三种模式只在宿主与代理层切换且无混合模式 | BRW-08 | `packages/e2e/tests/tooling/SCN-BROWSER-PLATFORM-015.spec.ts` | V-1, V-2 | PASS |
| SCN-OPENAPI-CONTRACT-001 | api:validate 校验 lint 与契约自洽 | OAS-01 | `packages/e2e/tests/tooling/SCN-OPENAPI-CONTRACT-001.spec.ts`；`scripts/api-contract.test.ts` | V-1, V-2 | PASS |
| SCN-OPENAPI-CONTRACT-002 | api:sync 由参数传入来源，lock 覆盖全部生成物 | OAS-01 | `packages/e2e/tests/tooling/SCN-OPENAPI-CONTRACT-002.spec.ts`；`scripts/api-contract.test.ts` | V-1, V-2 | PASS |
| SCN-OPENAPI-CONTRACT-003 | api:status 检出契约与生成物漂移 | OAS-01 | `packages/e2e/tests/tooling/SCN-OPENAPI-CONTRACT-003.spec.ts`；`scripts/api-contract.test.ts` | V-1, V-2 | PASS |
| SCN-OPENAPI-CONTRACT-004 | redocly 规则只保留有理由的调整，引擎测试契约零告警 | OAS-01 | `packages/e2e/tests/tooling/SCN-OPENAPI-CONTRACT-004.spec.ts` | V-1, V-2 | PASS |
| SCN-OPENAPI-CONTRACT-005 | 生成物精简且由契约决定 | OAS-02 | `scripts/api-contract.test.ts` | V-1, V-2 | PASS |
| SCN-OPENAPI-CONTRACT-006 | 完整契约不进入生产导入图与产物 | OAS-02 | `packages/e2e/tests/tooling/SCN-OPENAPI-CONTRACT-006.spec.ts` | V-1, V-2 | PASS |
| SCN-OPENAPI-CONTRACT-007 | 结果为判别联合，信封按默认约定解析 | OAS-03 | `packages/e2e/tests/web-openapi-browser/SCN-OPENAPI-CONTRACT-007.spec.ts`；`packages/e2e/tests/web-openapi-browser/openapi-wire.browser.spec.ts` 等 3 个 | V-1, V-2 | PASS |
| SCN-OPENAPI-CONTRACT-008 | 信封约定可由项目配置 | OAS-03 | `packages/openapi/src/rest/client.test.ts` | V-1, V-2 | PASS |
| SCN-OPENAPI-CONTRACT-009 | 路径参数编码替换，缺参不发请求 | OAS-03 | `packages/e2e/tests/web-openapi-browser/SCN-OPENAPI-CONTRACT-009.spec.ts`；`packages/e2e/tests/web-openapi-browser/openapi-wire.browser.spec.ts` 等 3 个 | V-1, V-2 | PASS |
| SCN-OPENAPI-CONTRACT-010 | 身份头按 securitySchemes 映射，匿名接口不发身份头 | OAS-03 | `packages/e2e/tests/web-openapi-browser/SCN-OPENAPI-CONTRACT-010.spec.ts`；`packages/e2e/tests/web-openapi-browser/openapi-wire.browser.spec.ts` 等 3 个 | V-1, V-2 | PASS |
| SCN-OPENAPI-CONTRACT-011 | HTTP 方法按契约发送 | OAS-03 | `packages/e2e/tests/web-openapi-browser/SCN-OPENAPI-CONTRACT-011.spec.ts`；`packages/e2e/tests/web-openapi-browser/openapi-wire.browser.spec.ts` 等 3 个 | V-1, V-2 | PASS |
| SCN-OPENAPI-CONTRACT-012 | X-Request-Id 遵守 PC-05 且不可覆盖 | OAS-03 | `packages/e2e/tests/web-openapi-browser/SCN-OPENAPI-CONTRACT-012.spec.ts`；`packages/e2e/tests/web-openapi-browser/openapi-wire.browser.spec.ts` 等 3 个 | V-1, V-2 | PASS |
| SCN-OPENAPI-CONTRACT-013 | 运行时忽略成功响应中的未知字段 | OAS-03 | `packages/openapi/src/rest/client.test.ts` | V-1, V-2 | PASS |
| SCN-OPENAPI-CONTRACT-014 | 传输失败按原因区分 | OAS-03 | `packages/e2e/tests/web-openapi-browser/SCN-OPENAPI-CONTRACT-014.spec.ts`；`packages/e2e/tests/web-openapi-browser/openapi-wire.browser.spec.ts` | V-1, V-2 | PASS |
| SCN-OPENAPI-CONTRACT-015 | resolveDeclaration 以契约名为前缀并拒绝非法元素 | OAS-04 | `packages/e2e/tests/tooling/SCN-OPENAPI-CONTRACT-015.spec.ts`；`scripts/openapi-adapter.test.ts` | V-1, V-2 | PASS |
| SCN-OPENAPI-CONTRACT-016 | scanCalls 支撑声明与调用双向对账 | OAS-04 | `packages/e2e/tests/tooling/SCN-OPENAPI-CONTRACT-016.spec.ts`；`scripts/openapi-adapter.test.ts` | V-1, V-2 | PASS |
| SCN-OPENAPI-CONTRACT-030 | 运行时契约按 OAS 3.0 继承顶层安全要求并合并 path item 级参数 | OAS-04 | `packages/e2e/src/preview/openapi-obligation-matrix.test.ts`；`packages/e2e/tests/tooling/SCN-OPENAPI-CONTRACT-030.spec.ts` 等 3 个 | V-1, V-2 | PASS |
| SCN-OPENAPI-CONTRACT-017 | 按接口粒度派生完整义务清单 | OAS-05 | `packages/e2e/src/preview/openapi-obligation-matrix.test.ts`；`packages/e2e/tests/tooling/openapi-matrix-temporary.spec.ts` 等 3 个 | V-1, V-2 | PASS |
| SCN-OPENAPI-CONTRACT-018 | presence 派生对联合类型做包含判定，否则报待定 | OAS-05 | `scripts/openapi-adapter.test.ts` | V-1, V-2 | PASS |
| SCN-OPENAPI-CONTRACT-019 | 未实现接口进入消费集合时提示不阻断 | OAS-05 | `packages/e2e/tests/tooling/SCN-OPENAPI-CONTRACT-019.spec.ts`；`scripts/openapi-adapter.test.ts` | V-1, V-2 | PASS |
| SCN-OPENAPI-CONTRACT-020 | 业务码完备性在编译期穷尽并与契约对账 | OAS-05 | `packages/openapi/testing/engine/generated.test.ts` | V-1, V-2 | PASS |
| SCN-OPENAPI-CONTRACT-021 | 声明接口的协议义务都有运行证据 | OAS-05 | `packages/e2e/tests/tooling/SCN-WEB-EXAMPLE-015.spec.ts`；`packages/e2e/tests/tooling/openapi-matrix-temporary.spec.ts` 等 4 个 | V-1, V-2 | PASS |
| SCN-OPENAPI-CONTRACT-022 | 规范化钩子在校验前转换 3.0 写法 | OAS-06 | `packages/openapi/testing/schema.test.ts` | V-1, V-2 | PASS |
| SCN-OPENAPI-CONTRACT-023 | Shadow 响应严格同形，不提供宽松认领 | OAS-06 | `packages/e2e/tests/web-openapi-browser/SCN-OPENAPI-CONTRACT-023.spec.ts`；`packages/openapi/testing/schema.test.ts` | V-1, V-2 | PASS |
| SCN-OPENAPI-CONTRACT-024 | Fixture 中每个信封必须被认领 | OAS-06 | `packages/e2e/tests/tooling/SCN-OPENAPI-CONTRACT-024.spec.ts`；`scripts/openapi-fixture-validation.test.ts` | V-1, V-2 | PASS |
| SCN-OPENAPI-CONTRACT-025 | malformed 认领必须经反证 | OAS-06 | `scripts/openapi-fixture-validation.test.ts` | V-1, V-2 | PASS |
| SCN-OPENAPI-CONTRACT-026 | 被认领信封的业务码必须属于该接口 | OAS-06 | `scripts/openapi-fixture-validation.test.ts` | V-1, V-2 | PASS |
| SCN-OPENAPI-CONTRACT-027 | 双格式产物与根入口具名导出 createFetchHttp | OAS-07 | `packages/e2e/tests/tooling/SCN-OPENAPI-CONTRACT-027.spec.ts` | V-1, V-2 | PASS |
| SCN-OPENAPI-CONTRACT-028 | createFetchHttp 行为义务与 IDL fetch 适配器一致 | OAS-07 | `packages/e2e/tests/web-openapi-browser/SCN-OPENAPI-CONTRACT-028.spec.ts`；`packages/e2e/tests/web-openapi-browser/openapi-wire.browser.spec.ts` 等 3 个 | V-1, V-2 | PASS |
| SCN-OPENAPI-CONTRACT-029 | 引擎测试契约包含四个接口与必需的顶层结构 | OAS-08 | `packages/e2e/tests/tooling/SCN-OPENAPI-CONTRACT-029.spec.ts`；`packages/openapi/testing/engine/generated.test.ts` | V-1, V-2 | PASS |
| SCN-PROTOCOL-CONTRACT-014 | 门禁经清单与绑定加载协议适配器 | PC-07 | `packages/e2e/tests/tooling/SCN-PROTOCOL-CONTRACT-014.spec.ts`；`scripts/lib/protocol-adapters.test.ts` | V-1, V-2 | PASS |
| SCN-PROTOCOL-CONTRACT-015 | IDL 适配器迁移后行为不变 | PC-07 | `packages/e2e/tests/tooling/SCN-PROTOCOL-CONTRACT-015.spec.ts`；`packages/protocol/testing/adapter.test.ts` 等 3 个 | V-1, V-2 | PASS |
| SCN-PROTOCOL-CONTRACT-016 | 协议适配器不进入生产产物 | PC-07 | `packages/e2e/tests/tooling/SCN-PROTOCOL-CONTRACT-016.spec.ts` | V-1, V-2 | PASS |
| SCN-PROTOCOL-CONTRACT-017 | fetch 适配器遵守网络适配器行为义务 | PC-08 | `packages/protocol/src/adapters/network/fetch.test.ts` | V-1, V-2 | PASS |
| SCN-PROTOCOL-CONTRACT-018 | integration 经生产 fetch 实现访问 Shadow | PC-08 | `packages/e2e/tests/protocol/SCN-PROTOCOL-CONTRACT-018.spec.ts` | V-1, V-2 | PASS |
| SCN-PROTOCOL-CONTRACT-021 | IDL 浏览器步骤执行器按计划步骤执行并回传结果 | PC-08 | `packages/protocol/testing/browser-runner.test.ts` | V-1, V-2 | PASS |
| SCN-PROTOCOL-CONTRACT-001 | 义务清单只针对产品声明的消费接口 | PC-01 | `packages/e2e/tests/tooling/SCN-PROTOCOL-CONTRACT-001.spec.ts`；`scripts/lib/contract-inventory.scan.test.ts` | V-1, V-2 | PASS |
| SCN-PROTOCOL-CONTRACT-002 | 声明接口的协议义务都有运行证据 | PC-01 | `packages/e2e/tests/protocol/SCN-PROTOCOL-CONTRACT-002-extension.spec.ts`；`packages/e2e/tests/protocol/SCN-PROTOCOL-CONTRACT-002.spec.ts` 等 5 个 | V-1, V-2 | PASS |
| SCN-PROTOCOL-CONTRACT-005 | 消费接口声明与实际调用双向对账 | PC-01 | `packages/e2e/tests/tooling/SCN-PROTOCOL-CONTRACT-005.spec.ts`；`scripts/lib/contract-inventory.scan.test.ts` | V-1, V-2 | PASS |
| SCN-PROTOCOL-CONTRACT-004 | Shadow 引擎与协议来源解耦 | PC-03 | `packages/e2e/src/shadow/routes.test.ts`；`packages/e2e/tests/tooling/SCN-PROTOCOL-CONTRACT-004.spec.ts` 等 3 个 | V-1, V-2 | PASS |
| SCN-PROTOCOL-CONTRACT-006 | 同形响应被接受、不同形响应在构造时被拒绝 | PC-04 | `packages/e2e/src/shadow/response-shape.test.ts`；`packages/protocol/testing/response-shape.test.ts` | V-1, V-2 | PASS |
| SCN-PROTOCOL-CONTRACT-007 | 非法响应必须显式认领，动态类型报待定 | PC-04 | `packages/e2e/src/shadow/response-shape.test.ts`；`packages/protocol/testing/response-shape.test.ts` | V-1, V-2 | PASS |
| SCN-PROTOCOL-CONTRACT-008 | 每次请求携带规范格式的 X-Request-Id | PC-05 | `packages/e2e/tests/protocol/SCN-PROTOCOL-CONTRACT-008.spec.ts`；`packages/e2e/tests/weapp/SCN-PROTOCOL-CONTRACT-008.spec.ts` 等 4 个 | V-1, V-2 | PASS |
| SCN-PROTOCOL-CONTRACT-009 | 标准生成器按北京时间生成且不依赖宿主时区 | PC-05 | `packages/openapi/src/transport/request-id.test.ts`；`packages/protocol/src/transport/request-id.test.ts` | V-1, V-2 | PASS |
| SCN-PROTOCOL-CONTRACT-010 | Shadow 与协议义务按头名和格式校验请求 ID | PC-05 | `packages/e2e/src/shadow/header-patterns.test.ts`；`scripts/lib/contract-inventory.scan.test.ts` | V-1, V-2 | PASS |
| SCN-PROTOCOL-CONTRACT-011 | 未编排与未注册的请求被记录并报出 | PC-06 | `packages/e2e/src/shadow/records-and-polling.test.ts` | V-1, V-2 | PASS |
| SCN-PROTOCOL-CONTRACT-012 | 路径参数模板转换为路由参数 | PC-06 | `packages/e2e/src/shadow/records-and-polling.test.ts` | V-1, V-2 | PASS |
| SCN-PROTOCOL-CONTRACT-013 | 有界轮询只在平台环境可用且次数有界 | PC-06 | `packages/e2e/src/shadow/records-and-polling.test.ts` | V-1, V-2 | PASS |
| SCN-PROTOCOL-CONTRACT-019 | 预览模式按序列返回响应且不判问题 | PC-06 | `packages/e2e/src/preview/preview-server.test.ts`；`packages/e2e/tests/tooling/SCN-PROTOCOL-CONTRACT-019.spec.ts` | V-1, V-2 | PASS |
| SCN-PROTOCOL-CONTRACT-020 | 部分响应后断开故障 | PC-06 | `packages/e2e/src/shadow/partial-disconnect.test.ts` | V-1, V-2 | PASS |
| SCN-SCENARIO-GATE-028 | check:fixtures 按声明的协议委托适配器检查 Fixture 与预览数据集 | GATE-16 | `packages/e2e/tests/tooling/SCN-SCENARIO-GATE-028.spec.ts`；`scripts/check-fixtures.protocol.test.ts` | V-1, V-2 | PASS |
| SCN-SCENARIO-GATE-030 | owner 的 Fixture 协议必须与绑定该 owner 的用例所属绑定一致 | GATE-16 | `packages/e2e/tests/tooling/SCN-SCENARIO-GATE-030.spec.ts`；`scripts/check-fixtures.bindings.test.ts` | V-1, V-2 | PASS |
| SCN-SCENARIO-GATE-029 | defineCase 的环境必须属于所属绑定 | GATE-17 | `packages/e2e/src/cases/define-case-binding.test.ts`；`packages/e2e/tests/tooling/SCN-SCENARIO-GATE-029.spec.ts` | V-1, V-2 | PASS |
| SCN-SCENARIO-GATE-009 | 新增场景或协议义务未绑定测试 | GATE-07 | `packages/e2e/tests/tooling/SCN-SCENARIO-GATE-009.spec.ts` | V-1, V-2 | PASS |
| SCN-SCENARIO-GATE-027 | 协议义务的运行环境按组合绑定取值 | GATE-07 | `packages/e2e/tests/tooling/SCN-SCENARIO-GATE-027.spec.ts`；`scripts/lib/binding-environments.test.ts` | V-1, V-2 | PASS |
| SCN-SCENARIO-GATE-012 | 按 owner ID 解析当前生效 Requirement 并校验摘要 | GATE-10 | `packages/e2e/tests/tooling/SCN-SCENARIO-GATE-012.spec.ts`；`scripts/check-fixtures.test.ts` | V-1, V-2 | PASS |
| SCN-SCENARIO-GATE-013 | fixtures:refresh 重算来源摘要 | GATE-10 | `packages/e2e/tests/tooling/SCN-SCENARIO-GATE-013.spec.ts`；`scripts/check-fixtures.test.ts` | V-1, V-2 | PASS |
| SCN-SCENARIO-GATE-014 | 多个 active Change 修改同一 Requirement 时报歧义 | GATE-10 | `packages/e2e/tests/tooling/SCN-SCENARIO-GATE-014.spec.ts`；`scripts/check-fixtures.test.ts` | V-1, V-2 | PASS |
| SCN-SCENARIO-GATE-015 | 归档 Change 不需要改动 Fixture | GATE-10 | `packages/e2e/tests/tooling/SCN-SCENARIO-GATE-015.spec.ts` | V-1, V-2 | PASS |
| SCN-TEMPLATE-ENGINEERING-013 | 清单多包字段与绑定约束被校验 | ENG-11 | `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-013.spec.ts`；`scripts/lib/project-manifest-binding.test.ts` | V-1, V-2 | PASS |
| SCN-TEMPLATE-ENGINEERING-014 | 门禁按包与绑定遍历，不假定唯一包 | ENG-11 | `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-014.spec.ts`；`scripts/lib/binding-readers.test.ts` | V-1, V-2 | PASS |
| SCN-TEMPLATE-ENGINEERING-015 | 工程检查按产品形态选择 | ENG-12 | `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-015.spec.ts`；`scripts/engineering-form.test.ts` | V-1, V-2 | PASS |
| SCN-TEMPLATE-ENGINEERING-001 | 产品包与协议包的产物边界与消费 | ENG-01 | `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-001.spec.ts` | V-1, V-2 | PASS |
| SCN-TEMPLATE-ENGINEERING-003 | 公共类型注释随源码与声明交付 | ENG-03 | `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-003.spec.ts`；`scripts/lib/public-doc.test.ts` | V-1, V-2 | PASS |
| SCN-TEMPLATE-ENGINEERING-016 | web-app 形态按源码模式检查中文注释 | ENG-03 | `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-016.spec.ts`；`scripts/lib/public-doc-source.test.ts` | V-1, V-2 | PASS |
| SCN-TEMPLATE-ENGINEERING-005 | 门禁按项目清单工作 | ENG-05 | `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-005.spec.ts`；`scripts/lib/project-manifest.test.ts` | V-1, V-2 | PASS |
| SCN-TEMPLATE-ENGINEERING-006 | 使用指南缺失或不完整 | ENG-06 | `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-006.spec.ts`；`scripts/check-architecture.test.ts` | V-1, V-2 | PASS |
| SCN-TEMPLATE-ENGINEERING-009 | 覆盖率报告缺席手写文件被拒绝 | ENG-07 | `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-009.spec.ts`；`scripts/check-coverage.test.ts` | V-1, V-2 | PASS |
| SCN-TEMPLATE-ENGINEERING-010 | 格式与行数基线被门禁执行 | ENG-08 | `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-010.spec.ts`；`scripts/lib/dependency-rules.test.ts` | V-1, V-2 | PASS |
| SCN-TEMPLATE-ENGINEERING-012 | 技术架构文档缺失或与能力地图不一致 | ENG-10 | `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-012.spec.ts`；`scripts/check-architecture-doc.test.ts` | V-1, V-2 | PASS |
| SCN-TEMPLATE-ENGINEERING-008 | 按白名单删除模板示例后门禁仍全绿 | EX-10 | `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-006.spec.ts`；`packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-008.spec.ts` 等 4 个 | V-1, V-2 | PASS |
| SCN-WEB-APP-001 | 应用包与模板对齐 | WEB-01 | `packages/e2e/tests/tooling/SCN-WEB-APP-001.spec.ts`；`scripts/web-app.test.ts` | V-1, V-2 | PASS |
| SCN-WEB-APP-004 | 组件树五条规则被机械执行 | WEB-03 | `packages/e2e/tests/tooling/SCN-WEB-APP-004.spec.ts`；`scripts/check-component-tree.test.ts` | V-1, V-2 | PASS |
| SCN-WEB-APP-005 | 组件写入全局 store 在类型与 lint 两层被拦截 | WEB-04 | `packages/e2e/tests/tooling/SCN-WEB-APP-005.spec.ts`；`scripts/web-app.test.ts` | V-1, V-2 | PASS |
| SCN-WEB-APP-006 | 依赖方向违规被拒绝 | WEB-05 | `packages/e2e/tests/tooling/SCN-WEB-APP-006.spec.ts`；`scripts/web-app.test.ts` | V-1, V-2 | PASS |
| SCN-WEB-APP-007 | 核心层使用 DOM 被类型与 lint 拒绝 | WEB-06 | `packages/e2e/tests/tooling/SCN-WEB-APP-007.spec.ts`；`scripts/web-app.test.ts` | V-1, V-2 | PASS |
| SCN-WEB-APP-008 | 部署配置只在装配入口整体读取 | WEB-06 | `packages/e2e/tests/tooling/SCN-WEB-APP-008.spec.ts`；`scripts/web-app.test.ts` | V-1, V-2 | PASS |
| SCN-WEB-APP-009 | 覆盖率忽略注释与未登记的组件命名例外被拒绝 | WEB-07 | `packages/e2e/tests/tooling/SCN-WEB-APP-009.spec.ts`；`scripts/web-app.test.ts` | V-1, V-2 | PASS |
| SCN-WEB-APP-010 | 未被测试导入的 .vue 被覆盖率门禁报出 | WEB-08 | `packages/e2e/tests/tooling/SCN-WEB-APP-010.spec.ts`；`packages/e2e/tests/tooling/removal-expected.spec.ts` 等 3 个 | V-1, V-2 | PASS |
| SCN-WEB-APP-011 | 装配入口计入覆盖率 | WEB-08 | `packages/web/src/main.test.ts` | V-1, V-2 | PASS |
| SCN-WEB-APP-012 | 模块清单写在部署目录之外并与源码对账 | WEB-09 | `packages/e2e/tests/tooling/SCN-WEB-APP-012.spec.ts`；`packages/e2e/tests/tooling/removal-expected.spec.ts` 等 3 个 | V-1, V-2 | PASS |
| SCN-WEB-APP-013 | 测试设施、契约与样式残留不得进入产物 | WEB-09 | `packages/e2e/tests/tooling/SCN-WEB-APP-013.spec.ts`；`scripts/lib/bundle-scenario.test.ts` | V-1, V-2 | PASS |
| SCN-WEB-APP-014 | 产品摘要只随产物输入变化 | WEB-09 | `packages/e2e/tests/tooling/SCN-WEB-APP-014.spec.ts`；`scripts/lib/bundle-scenario.test.ts` | V-1, V-2 | PASS |
| SCN-WEB-EXAMPLE-001 | 提交创建表单后展示当前交易 | WEX-01 | `packages/e2e/tests/web-openapi-browser/SCN-WEB-EXAMPLE.browser.spec.ts`；`packages/web/src/trade-create/example.test.ts` | V-1, V-2 | PASS |
| SCN-WEB-EXAMPLE-002 | 交易状态轮询到终态后停止 | WEX-01 | `packages/e2e/tests/web-openapi-browser/SCN-WEB-EXAMPLE.browser.spec.ts`；`packages/web/src/trade-status/example.test.ts` | V-1, V-2 | PASS |
| SCN-WEB-EXAMPLE-003 | 交易列表按 URL 中的商户加载 | WEX-01 | `packages/e2e/tests/web-openapi-browser/SCN-WEB-EXAMPLE.browser.spec.ts`；`packages/web/src/trade-list/example.test.ts` | V-1, V-2 | PASS |
| SCN-WEB-EXAMPLE-004 | 业务失败按业务码呈现 | WEX-01 | `packages/e2e/tests/web-openapi-browser/SCN-WEB-EXAMPLE.browser.spec.ts`；`packages/web/src/trade-create/example.test.ts` | V-1, V-2 | PASS |
| SCN-WEB-EXAMPLE-005 | 传输失败以共享加载失败组件呈现 | WEX-01 | `packages/e2e/tests/web-openapi-browser/SCN-WEB-EXAMPLE.browser.spec.ts`；`packages/web/src/trade-list/example.test.ts` | V-1, V-2 | PASS |
| SCN-WEB-EXAMPLE-006 | 创建到列表可见的连续流程 | WEX-02 | `packages/e2e/tests/web-openapi-browser/SCN-WEB-EXAMPLE.browser.spec.ts`；`packages/web/src/__tests__/support.test.ts` | V-1, V-2 | PASS |
| SCN-WEB-EXAMPLE-007 | 三层状态各在其位且 store 写入可审计 | WEX-03 | `packages/web/src/store/example.test.ts`；`packages/web/src/trade-create/example.test.ts` | V-1, V-2 | PASS |
| SCN-WEB-EXAMPLE-008 | 示例组件树与共享组件 | WEX-04 | `packages/e2e/tests/tooling/SCN-WEB-EXAMPLE-facts.spec.ts`；`packages/web/src/shared/components/example.test.ts` | V-1, V-2 | PASS |
| SCN-WEB-EXAMPLE-009 | 假时钟驱动的轮询与取消 | WEX-05 | `packages/web/src/runtime/__tests__/runtime.test.ts` | V-1, V-2 | PASS |
| SCN-WEB-EXAMPLE-010 | 业务码映射与契约对账 | WEX-06 | `packages/e2e/tests/tooling/SCN-WEB-EXAMPLE-facts.spec.ts`；`packages/web/src/trade-create/example.test.ts` | V-1, V-2 | PASS |
| SCN-WEB-EXAMPLE-011 | 不可达分支改写后完整覆盖 | WEX-06 | `packages/e2e/tests/tooling/SCN-WEB-EXAMPLE-facts.spec.ts`；`packages/web/src/trade-create/example.test.ts` | V-1, V-2 | PASS |
| SCN-WEB-EXAMPLE-013 | 两个示例数据集通过契约校验 | WEX-07 | `packages/e2e/tests/tooling/SCN-WEB-EXAMPLE-facts.spec.ts` | V-1, V-2 | PASS |
| SCN-WEB-EXAMPLE-014 | web-example 标记成对校验 | WEX-08 | `packages/e2e/tests/tooling/SCN-WEB-EXAMPLE-facts.spec.ts`；`scripts/lib/example-markers.test.ts` | V-1, V-2 | PASS |
| SCN-WEB-EXAMPLE-015 | 替换产品契约与约定后通用基线仍全绿 | WEX-09 | `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-006.spec.ts`；`packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-008.spec.ts` 等 4 个 | V-1, V-2 | PASS |

## Correctness

### Fresh Command Evidence

#### V-1: 统一验收入口（全量）

- Command: `pnpm verify --change template-web-absorption --run-id template-web-absorption-verify-20261015`；weapp 起续跑 `pnpm verify --from test:e2e:weapp --run-id template-web-absorption-verify-20261015 --change template-web-absorption`
- Working directory: `/Users/liyongning/orca/workspaces/sdk-template/template-web-absorption-apply`
- Executed at: 2026-10-15T04:58:34Z（首跑）；2026-10-15T05:58:12Z（重启后续跑，结束于 05:59:23Z）
- Exit code: 首跑 1（weapp 步骤环境阻塞）；续跑 0
- Failure count: 0（代码层面）；环境层面 2 次：weapp `SCN-PROTOCOL-CONTRACT-008` 首次 30s 超时、整文件重跑 10.1s 通过；随后 `weapp:prepare` 就绪探测超时（新启动的开发者工具主进程卡成 UE 状态、无法清除），重启设备后用同一 run id 续跑
- Result: PASS
- Output reference: 验收方会话临时日志 `scratchpad/final/v1.log`、`v1c.log`（设备重启已清除首跑日志）；报告目录 `artifacts/template-web-absorption-verify-20261015/reports/`（unit、integration、integration-heavy、weapp/ 5 个文件、browser）
- Key observations: check:fast 通过（823965ms）：unit 149/149 文件、608/608 用例，integration 92/92 文件、152/152 用例，integration-heavy 14/14 文件、40/40 用例，覆盖率 100%；weapp 5 个文件全部通过（4 个在首跑、`SCN-TEMPLATE-EXAMPLE-004` 在续跑）；browser 4 个文件、20 个用例通过；check:scenarios 通过、issues 0

#### V-2: 场景门禁（独立复核）

- Command: `VERIFY_RUN_ID=template-web-absorption-verify-20261015 SCENARIO_GATE_CHANGES=template-web-absorption pnpm check:scenarios`
- Working directory: 同 V-1
- Executed at: 2026-10-15T05:59:33Z
- Exit code: 0
- Failure count: 0
- Result: PASS
- Output reference: `scratchpad/final/v2.log`
- Key observations: mode=complete，Scenario 149，FLOW 2，契约字段 83，协议义务 232，issues 0

#### V-3: OpenSpec 严格校验

- Command: `openspec validate template-web-absorption --strict --json`
- Working directory: 同 V-1
- Executed at: 2026-10-15T05:59:39Z
- Exit code: 0
- Failure count: 0
- Result: PASS
- Output reference: 内联：`{"totals":{"items":1,"passed":1,"failed":0}}`
- Key observations: Change 结构与 delta 合法

#### V-4: 规划摘要新鲜度

- Command: `python3 ~/.claude/skills/change/scripts/plan-review-digest.py openspec/changes/template-web-absorption --check-review openspec/changes/template-web-absorption/plan-review.md`
- Working directory: 同 V-1
- Executed at: 2026-10-15T05:59:39Z
- Exit code: 0
- Failure count: 0
- Result: PASS
- Output reference: 内联：`freshness=PASS`，reviewed=current=`3a9dec29…1dafa5`
- Key observations: Apply 期间两次规划修订（修订一 `c6f8860`、修订二 `9942202`）均已重新评审并由用户裁决放行，之后规划未变

#### V-5: 归档合并演练

- Command: 在临时目录 `git archive 264933a` 展开后运行 `pnpm exec openspec archive template-web-absorption -y` 与 `openspec validate --specs --strict --json`
- Working directory: 验收方会话临时目录 `scratchpad/archive-dryrun`（设备重启前）
- Executed at: 2026-10-15T05:3x（设备重启前）
- Exit code: 0 / 0
- Failure count: 0
- Result: PASS
- Output reference: 日志随设备重启清除；结论：`Totals: + 39, ~ 15, - 0`，8 份主 Spec 严格校验通过
- Key observations: 合并前主 Spec 61 个 Scenario ID 与本 Change 113 个 ID 的并集（149）与合并后完全一致，无丢失、无多余；与 V-2 的 149 一致

### Behavioral Results

| Behavior / Claim | Evidence | Result |
|---|---|---|
| 模板提供 SDK + IDL + 小程序与 Web 应用 + OpenAPI + 浏览器两套可运行实现 | ENG/WEX/BRW 各 Requirement；V-1（weapp 与 browser 均通过） | PASS |
| 替换产品契约无需修改引擎代码与门禁（OAS-01） | SCN-WEB-EXAMPLE-015（5 个 checkpoint）；xueshan 第 4 轮演练（附录 Task 16）；V-1 | PASS |
| 同时删除两个示例后门禁全绿 | SCN-TEMPLATE-ENGINEERING-008；示例删除演练（附录 Task 15/16）；V-1 | PASS |
| 移除一条绑定后回到单组合工作（ENG-11） | SCN-TEMPLATE-ENGINEERING-014；"移除一条绑定"演练（附录 Task 16）；V-1 | PASS |
| 三个复刻演练与 xueshan 反馈核对 | 附录 Task 16 演练记录与 62 条核对表 | PASS |

## Coherence

| Proposal / Design Decision | Source | Implementation Evidence | Status / Notes |
|---|---|---|---|
| 清单多包与组合绑定 | `design.md:77` | `project.manifest.json` bindings；GATE-17 按 binding 字段优先、目录推断（`packages/e2e/src/cases/define-case.ts`） | PASS |
| 协议适配器、Shadow 引擎归属测试包 | `design.md:125`、`design.md:146` | `packages/*/testing/adapter.ts`；`packages/e2e/src/shadow/` | PASS |
| Web 应用产品包与产物边界 | `design.md:178`、`design.md:274` | `packages/web`；`check:bundle`、`check:component-tree` | PASS |
| OpenAPI 协议包与引擎证据/产品契约分离（Apply 修订一） | `design.md:287`；`specs/openapi-contract` OAS-01/04/08 | `packages/openapi/contracts/`、`packages/openapi/testing/engine/`；SCN-OPENAPI-CONTRACT-029（范围收窄到引擎契约目录） | PASS |
| OAS-06 钩子由约定模块登记、运行时契约继承规则（Apply 修订二） | `specs/openapi-contract` OAS-04/05/06；SCN-OPENAPI-CONTRACT-030 | `packages/openapi/testing/{contract,schema,adapter}.ts`；`packages/e2e/src/preview/openapi-obligation-matrix*.ts` | PASS（M4–M8 已接受） |
| 浏览器平台点位与本地预览 | `design.md:357`、`design.md:390` | `packages/e2e/host/browser`、`scripts/preview-local.ts` | WARNING：预览打印的示例地址写死 token/merchant（只登记） |
| IDL 侧同类拆分为后续 Change | `design.md:441`、OI-WA-04 | 指南替换点地图"协议来源（IDL）"一行 | PASS（本 Change 不实施） |
| 验收（三个复刻、示例删除、移除绑定、反馈核对） | `design.md:500` | 附录 Task 16；五个演练副本的完整 `pnpm verify` 均全绿 | PASS |

## Review Findings and Resolutions

| Finding ID | Severity | Finding | Resolution | Re-verification IDs | Status |
|---|---|---|---|---|---|
| FCR-1~ | Important/Minor | 首轮 Final Code Review（`6e4d0c2`） | 修复于 `d88f788`，见附录"Final Code Review 第 1 轮修复" | V-1, V-2 | resolved |
| FCR2-1 | Critical | 响应校验器缓存按 operationId 串用产品/引擎契约 | `WeakMap` 以运行时接口对象为键（`264933a`） | V-1, V-2 | resolved |
| FCR2-2 | Important | 解引用 bundle 上按组件登记的钩子不生效、指南骨架无效 | 指南改为递归遍历骨架；SCN-OPENAPI-CONTRACT-022 用真实 bundle 证明（`264933a`） | V-1, V-2 | resolved |
| FCR2-3 | Important | 义务矩阵无条件编排 `data:null` | 按成功响应 data schema 条件编排（`264933a`） | V-1, V-2 | resolved |
| FCR2-M4~M8 | Minor | 引擎约定包装、直接接口对象缺钩子、缺省载体、钩子调用范围、hook-extensible 加载链 | 接受：当前生产路径不触发，见附录 | — | accepted |

## Unverified Areas and Remaining Risks

- 微信开发者工具挂起：本次 V-1 中新启动的主进程卡成 UE 状态，需重启设备才能清除；属本机环境，按运行约定以同一 run id 续跑。
- 演练副本、各副本完整 `pnpm verify` 日志与演练报告摘录位于验收方会话临时目录，设备重启后已清除；附录 Task 16 记录中引用的这些路径不再可访问，结论以附录记录为准。
- 只登记项（附录 Task 16"只登记、不修的已知风险"）：OpenAPI 执行器与矩阵身份只取 `security[0]`；信封额外字段写死；预览示例地址写死；Web 示例白名单删除通用辅助；IDL 浏览器证据两项为近似取证等。
- IDL 侧引擎证据与产品 IDL 来源未拆分，换 IDL 来源时需改写相关引擎用例（后续 Change OI-WA-04）。

## Archive Readiness

- Decision: READY WITH WARNINGS
- Plan Review verdict: PASS
- Plan Review freshness: PASS（reviewed = current）
- Fresh Apply state: all_done
- Completed tasks: 16/16
- Failed required commands: 0
- Unresolved Critical findings: 0
- Unresolved Important findings: 0
- Accepted Minor findings: 12（Plan Review 7；FCR2-M4~M8）
- Verification input manifest matches current inputs: yes（`13f5cae9…bf535`，979 个路径）
- Requirements without evidence: 0
- Warnings and rationale: 微信开发者工具环境挂起（不影响代码结论）；只登记项与后续 Change OI-WA-04 已记录影响与保留理由
- Blockers: None

---

> 以下为 Apply 期间的原始记录（执行方逐任务记录、Final Code Review 与各轮修复、演练），标题已下调一级。

## Template Web Absorption 验收记录

### 逐任务记录

#### Task 1 清单多包与组合绑定

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
- 未发现需要在后续任务继续处理的缺陷；未执行任务 15、16 的演练，也未修改其 checkbox。

**Commit**

- `feat(template): support multiple packages per role with product bindings`

#### Task 2 协议适配器接口、IDL 适配器迁移与 Shadow 引擎迁入测试包

**规划与输入**

- 起始 HEAD：`ac6cdf2`。
- 起始 freshness：`PASS`，digest `2424baeafe3c4ac6e197e4c92feb8faf01eacdef2204aea49ad94cdb9e3a94e3`。
- 当前 freshness：`PASS`，digest 与起始值一致。
- `pnpm proto:status`：退出码 0，`up_to_date`，resolvedCommit `5a78672`；此前两次 SSH `Connection closed`，按已授权方式重试后恢复，网络失败不计业务失败或 OI。

**RED / GREEN**

- RED 覆盖 `SCN-PROTOCOL-CONTRACT-014/015/016/027/028` 与 `SCN-TEMPLATE-ENGINEERING-014` 的 `binding-readers-rules`、`multi-package-cli`、`single-binding-cli`：旧实现分别暴露 IDL 硬编码、跨绑定义务串线、Fixture 未委托协议适配器、引擎位置与别名未拆分等问题。
- GREEN 后，014–016、027、028 与 ENG-014 全部 case 通过；SCN-004、006、007、010、011、012、013 在引擎迁移后的项目边界内通过。
- IDL 义务迁移对照为 177 条，归一化后 sha256 为 `46417e0f18bb012791eca67959ed6d4bab2ca0711ff952966f5f4a0f34638eca`，与迁移前一致。
- Shadow 引擎已迁至 `packages/e2e/src/shadow/`；`idl-routes.ts` 与 `example/` 留在 `packages/protocol/testing/shadow/`，协议 testing 入口不再转导出引擎接口。IDL 解析、派生与校验已迁至 `packages/protocol/testing/adapter.ts` 和 `packages/protocol/testing/idl/`。
- 新增 `scripts/lib/protocol-adapters.ts`，按清单 `packages[].protocolKind` 与绑定加载适配器；`check-fixtures` 与 contract inventory 已改为通过声明协议委托适配器。

**Verification**

- `SCENARIO_GATE_CHANGES=template-web-absorption pnpm check:fast`：退出码 1。
  - unit：80/80 文件、409/409 用例通过；四项覆盖率均为 100%。
  - integration：64 个文件通过、1 个文件失败，132/133 个用例通过。
  - 唯一失败为 SCN-TEMPLATE-ENGINEERING-008 的 `example-removal-scenarios`；`example-removal-fast` 通过。按 R5-M1 仅为任务 1–13 中途允许的后续未登记测试项目问题，归属任务 15。
  - 日志：`/tmp/task2-check-fast.log`。
- `SCENARIO_GATE_CHANGES=template-web-absorption pnpm test:affected`：退出码 1，计划 run id `affected-20261011T071950Z`。
  - 因工具配置变化按规则全量触发；unit 80/80 文件、409/409 用例通过。
  - integration 除上述允许失败外，`SCN-TEMPLATE-ENGINEERING-002/gate-reduction-review-evidence` 在并行负载下命中 5 秒超时。单独复跑该文件：10/10 用例通过，目标用例 1392ms；登记为本轮“时败时过”1 次，按验收方口径不计 OI，也不属于 Task 2 业务失败。
  - 日志：`/tmp/task2-test-affected.log`；单独复跑日志：`/tmp/task2-scn002-rerun.log`。
- 最终复跑 `SCENARIO_GATE_CHANGES=template-web-absorption pnpm test:affected`：退出码 1，计划 run id `affected-20261011T123629Z`；按规则全量触发 `pnpm check:fast`。
  - unit：80/80 文件、409/409 用例通过。
  - integration：64 个文件通过、仅 SCN-TEMPLATE-ENGINEERING-008 的允许项失败；132/133 个用例通过。先前的 SCN-002 超时未复现，当前“时败时过”累计 1 次且已关闭；按验收方口径 OI 仍为 0。
  - 日志：`/tmp/task2-test-affected-final.log`。
- `pnpm check:scenarios --change template-web-absorption`：退出码 1，共 45 条问题，涉及 33 个本 Change Scenario/FLOW。
  - `openapi-unit` 未登记：11 条，归属任务 5。
  - `app-unit` 未登记：13 条，归属任务 8。
  - `browser` 未登记：21 条（含 `FLOW-WEB-EXAMPLE-001` 的 1 条），归属任务 10。
  - 全部问题均属于 A2 期望集合之外的两类允许问题；没有缺失绑定、非本 Change Scenario 或其他问题。
- 登录异常的正式版环境阻塞记录：早期 run id `task2-weapp`、`task2-weapp-retry1` 均在 `weapp:prepare` 的 180 秒预算内等待开发者工具就绪失败；验收方确认 `cli islogin` 返回 `{"login":false}`。失败发生在用例前，不计业务失败或 OI，日志为 `/tmp/task2-weapp.log`、`/tmp/task2-weapp-retry1.log`。
- Nightly 尝试记录：按验收方指定带 `WECHAT_DEVTOOLS_CLI` / `WECHAT_DEVTOOLS_CLI_PATH` 运行两次，均卡在 Nightly `cli open`，未进入就绪探测或用例；验收方确认 Nightly 与 `miniprogram-automator` 存在兼容问题。后续按验收方要求撤销两个变量，改回正式版，日志为 `/tmp/task2-weapp-nightly.log`、`/tmp/task2-weapp-nightly-retry1.log`。
- `pnpm verify --change template-web-absorption --from test:e2e:weapp`：weapp 步骤通过，退出码 0，耗时 426605ms；run id `template-web-absorption-apply-20261011T122644Z`。
  - 5 个 weapp 文件全部通过；SCN-002 11384ms、SCN-008 12670ms、FLOW-001 11209ms、SCN-002 示例 11682ms、SCN-004 10804ms。
  - `SCN-TEMPLATE-EXAMPLE-002` 首次运行在 30 秒上限超时，按逐文件重跑约定重新 prepare 后 11682ms 通过，不计业务失败或 OI。
  - 日志：`/tmp/task2-weapp-official-final.log`。

**Review / Acceptance**

- 引擎导入点已按新边界拆分；协议包 `testing/` 不导出引擎，协议源码、testing 与测试文件不导入 `packages/e2e/`。
- `shadow-engine-no-generated` 反例已实际命中，撤销反例后架构检查通过；依赖规则覆盖协议包 testing 导入引擎与引擎入口转导出预览构造器两类绕过路径。
- 大型分析用例仅补充合理超时（`adapter.test.ts` 30 秒、SCN-004 30 秒、contract-inventory derivation 120 秒），断言未改变。
- weapp 的 5 个 case 外层超时由默认 5 秒调整为 30 秒。正式版下实际成功耗时约 10.7–13.1 秒，原 5 秒会稳定截断；断言、步骤和请求次数均未改变。
- 补齐并实际执行 adapter、路由、异常、命名导出、dataset 等单测；新增检查已用反例证明可失败。
- freshness 与场景门禁在 weapp 通过后复核仍为预期状态；未执行任务 15、16 的演练，也未修改其 checkbox。

**Commit**

- `refactor(template): extract protocol adapters and move the shadow engine into the test package`

#### Task 3 按产品形态区分的工程检查骨架

**规划与输入**

- 起始 HEAD：`69f9139`。
- 起始 freshness：`PASS`，digest `2424baeafe3c4ac6e197e4c92feb8faf01eacdef2204aea49ad94cdb9e3a94e3`。
- 本任务选择结果：`sdk` 形态产品包使用 `tsc -p packages/<directory>/tsconfig.build.json --noEmit`；`web-app` 形态产品包使用 `vue-tsc --build` 检查 `tsconfig.app.json`、`tsconfig.core.json`、`tsconfig.vitest.json`。形态来自清单，不按包名或目录名判断。
- 精确新增依赖：`@vitejs/plugin-vue` `6.0.9`、`vue-tsc` `3.3.12`、`eslint-plugin-vue` `10.11.1`、`vue-eslint-parser` `10.4.1`。

**RED / GREEN**

- RED：web-app 形态仍由 `tsc` 检查时，`.vue` 类型错误未被发现；源码模式注释发现仍按入口，无法发现 `core`、`ports`、全局 store、消费接口与 `InjectionKey` 目标；`.vue` 未进入源码清单和行数规则。对应 015 的 form/typecheck 与 checks、016 的 source-mode、010 的 `.vue` max-lines checkpoint 先失败。
- GREEN：`typecheck` 按 `form` 分派；`check:package` 只处理 SDK 形态；`check:bundle` 与 `check:component-tree` 只枚举 web-app 形态；`.vue` 已进入源码清单和 ESLint `max-lines`，并由 `vue-eslint-parser` 计入 template、script、style。
- 新增受控 Fixture 在同一清单上互换两个产品的形态，证明 `tsc`/`vue-tsc`、产物检查与发布范围均随 `form` 变化，不依赖 `sdk`/`web` 名称。

**Fixture 与摘要**

- 已执行 `pnpm fixtures:refresh SCN-TEMPLATE-ENGINEERING-015 SCN-TEMPLATE-ENGINEERING-016`：退出码 0。
- Fixture owner：`SCN-TEMPLATE-ENGINEERING-015`、`SCN-TEMPLATE-ENGINEERING-016`；原因：本任务新增两个 owner 的用例、Fixture 与来源摘要。
- `pnpm check:fixtures`：退出码 0，`manifests: 30`，`issues: []`。

**Verification**

- 目标 unit：`SCENARIO_GATE_CHANGES=template-web-absorption pnpm exec vitest run --project test-tools-unit scripts/engineering-form.test.ts scripts/lib/public-doc-source.test.ts`：退出码 0，2/2 文件、2/2 用例通过。
- 目标 integration：`SCENARIO_GATE_CHANGES=template-web-absorption pnpm exec vitest run --project integration packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-015.spec.ts packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-016.spec.ts packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-010.spec.ts`：退出码 0，3/3 文件、6/6 用例通过。
  - 015 实测 `typecheck-by-form`、`vue-type-error-caught`、`artifact-check-by-form`、`release-by-form`、`selection-not-by-name`、`checks-registered` 均通过。
  - 016 逐项删除 `core`、全局 store、`InjectionKey`、消费接口与端口字段注释，确认每项都会失败；恢复输入后再次通过。
  - 010 的 `.vue` 反例确认 301 有效行触发 `max-lines`，template、script、style 三段均计入。
- `SCENARIO_GATE_CHANGES=template-web-absorption pnpm check:fast`：退出码 1，仅 SCN-TEMPLATE-ENGINEERING-008 的允许失败。
  - format、lint、build、typecheck、architecture 通过；unit 82/82 文件、411/411 用例通过，statements/branches/functions/lines 均为 100%；fixtures 30 个 manifest 通过。
  - integration 66/67 文件、136/137 用例通过；唯一失败为 `example-removal-scenarios`，`example-removal-fast` 通过。按 R5-M1 归属任务 15。
  - 因该允许失败会截断 `check:fast` 后续步骤，另行执行 `pnpm check:package`、`pnpm check:bundle`、`pnpm check:component-tree`：退出码均为 0，当前 SDK 仓库分别得到 package `issues: []` 与两个 web-app 检查的 `checked: []`。
- `pnpm check:scenarios --change template-web-absorption`：退出码 1，共 45 条问题；全部属于 A2 期望集合之外的两类允许问题。
  - `openapi-unit` 未登记 11 条，归属任务 5；`app-unit` 未登记 13 条，归属任务 8；`browser` 未登记 21 条（含 `FLOW-WEB-EXAMPLE-001`），归属任务 10。
- `SCENARIO_GATE_CHANGES=template-web-absorption pnpm test:affected`：第一次 run id `affected-20261011T131556Z` 因工具配置变化全量触发 `check:fast`；SCN-SCENARIO-GATE-026 在并行负载下失败，单独以相同作用域复跑该文件通过。登记“时败时过”1 次，按验收方口径不计 OI，也不属于 Task 3 业务失败。
- 最终复跑 `SCENARIO_GATE_CHANGES=template-web-absorption pnpm test:affected`：退出码 1，run id `affected-20261011T132434Z`；按规则全量触发 `pnpm check:fast`。
  - unit 82/82 文件、411/411 用例通过；integration 66/67 文件、136/137 用例通过；SCN-SCENARIO-GATE-026 通过（130.6 秒）。
  - 唯一失败仍为 SCN-TEMPLATE-ENGINEERING-008 的允许项，归属任务 15；先前 SCN-026 波动未复现，本轮“时败时过”累计为 2、均已关闭；按验收方口径 OI 仍为 0。
- freshness：结束检查 `PASS`，digest 与起始值一致；`git diff --check` 退出码 0。

**Review / Acceptance**

- `check:package` 在没有 SDK 形态产品包时直接成功；有 SDK 时仍只检查 SDK 与其绑定协议包。
- `check:bundle`、`check:component-tree` 已登记为根命令与清单必需命令，并串入 `check:fast`；当前骨架无 web-app 包时按空检查通过，具体产物与组件树规则留给任务 8、9。
- SCN-TEMPLATE-ENGINEERING-016 中“对模板自身清单运行注释门禁、web-app 包走源码模式”的模板事实推迟到任务 8；SCN-TEMPLATE-ENGINEERING-009 的模板排除事实推迟到任务 10。两项均已在任务 3 实现机制，承接任务负责模板自身 GREEN。
- 未执行任务 15、16 的演练，也未修改其 checkbox。

**Commit**

- `feat(template): select engineering checks by product form`

#### Task 4 IDL 浏览器网络适配器、浏览器步骤执行器与生产实现集成

**规划与输入**

- 起始 HEAD：`5330379`。
- 起始 freshness：`PASS`，digest `2424baeafe3c4ac6e197e4c92feb8faf01eacdef2204aea49ad94cdb9e3a94e3`。
- 结束 freshness：`PASS`，digest 与起始值一致；`git diff --check` 退出码 0。

**RED / GREEN**

- RED 覆盖 SCN-PROTOCOL-CONTRACT-017、018、021：`createFetchHttp` 尚不存在，integration 仍导入测试专用 `createNodeHttpDriver`，浏览器步骤执行器也尚不存在时，各行为义务先失败。
- GREEN：新增浏览器 fetch 适配器，发送时才读取 `globalThis.fetch`；发送前取消与零/负预算不访问平台；超时与取消通过自有计时器与 `AbortController` 区分并中止请求；响应体读取计入预算；结果只交付一次；HTTP 非 2xx 保留为有效响应，平台拒绝映射为 `NETWORK_ERROR`；请求选项固定 `credentials: 'same-origin'`、`cache: 'no-store'`，不重放。
- 浏览器步骤执行器只经协议包根入口导入公共客户端与 `createFetchHttp`，按 generated 方法元数据扫描并执行可序列化计划，不写死接口名；无法解析的方法回传 `UNRESOLVED_METHOD` 和原方法名。
- 协议包根入口具名导出 `createFetchHttp`，SDK 根入口不转导出；integration 协议矩阵与 SCN-008 已改用生产实现，测试专用 Node 驱动及其单测已删除。

**Fixture 与摘要**

- 新增 SCN-PROTOCOL-CONTRACT-018 的两个 Fixture case，并执行 `pnpm fixtures:refresh`。
- `pnpm check:fixtures`：退出码 0，`manifests: 31`，`issues: []`。

**Verification**

- 目标 protocol unit：`pnpm exec vitest run --project protocol-unit packages/protocol/src/adapters/network/fetch.test.ts packages/protocol/testing/browser-runner.test.ts`：退出码 0，2/2 文件、4/4 用例通过。
- 目标 integration：`SCN-PROTOCOL-CONTRACT-002`、`008`、`018` 共退出码 0，3/3 文件、4/4 用例通过；SCN-018 的成功、HTTP 状态、超时、取消与零字节断开五类请求均只记录一次且 Shadow 无剩余问题。
- `pnpm lint`、`pnpm typecheck`、`pnpm check:architecture`：退出码均为 0；架构检查输出 `no dependency violations found`。
- `SCENARIO_GATE_CHANGES=template-web-absorption pnpm check:fast`：退出码 1，仅 SCN-TEMPLATE-ENGINEERING-008 的允许失败。
  - format、build、typecheck、architecture 通过；unit 83/83 文件、413/413 用例通过，statements/branches/functions/lines 均为 100%；fixtures 31 个 manifest 通过。
  - integration 67/68 文件、138/139 用例通过；`example-removal-fast` 通过，唯一失败为 `example-removal-scenarios`，输出问题仍全部是 `openapi-unit`、`app-unit`、`browser` 未登记项，按 R5-M1 归属后续任务 5、8、10 与任务 15。
  - 单独以 protocol-unit 覆盖率参数运行新增文件时，全局阈值会因其他 unit 项目未纳入而退出 1；完整 `pnpm test:unit` 已证明全部手写代码四项覆盖率 100%，新增两个文件无未覆盖行，该命令作用域问题不记业务失败。
- `SCENARIO_GATE_CHANGES=template-web-absorption pnpm test:affected`：退出码 1，run id `affected-20261011T141144Z`；因适配器与驱动目录变化全量触发 `check:fast`。
  - unit 83/83 文件、413/413 用例通过；integration 67/68 文件、138/139 用例通过；唯一失败仍为上述允许的 SCN-008，归属任务 15。
- weapp 段补跑：`pnpm verify --change template-web-absorption --from test:e2e:weapp`，run id `template-web-absorption-apply-20261012T023104Z`，整体退出码 1；`check:fast` 按计划跳过，`test:e2e:weapp` 退出码 0（306891ms），`check:scenarios` 退出码 1（1353ms）。
  - 运行前确认正式版 `islogin=true`；未读取或复制本地凭据，也未触碰同时运行的 Nightly 实例。`weapp:prepare` 与 5 个 weapp 文件均通过，实际执行 5/5 文件、5/5 用例：SCN-PROTOCOL-CONTRACT-002、SCN-PROTOCOL-CONTRACT-008、FLOW-TEMPLATE-EXAMPLE-001、SCN-TEMPLATE-EXAMPLE-002、SCN-TEMPLATE-EXAMPLE-004。
  - `check:scenarios` 剩余 21 条问题全部是尚未登记 `browser` 测试项目的预期中间态，归属任务 10，与 Task 4 无关。
  - 先前环境阻塞 run id `template-web-absorption-apply-20261011T141758Z` 的状态已由本次补跑关闭，不计业务失败或 OI。

**Review / Acceptance**

- 已对照小程序适配器逐项核对网络行为义务；新增断言的超时等待均通过假计时器触发，响应体读取期间取消与超时分别有独立证据。
- 执行器源码检查确认不写死业务接口名，只经协议包包名根入口导入公共客户端与网络工厂，不以相对路径导入 `src/`。
- 未执行任务 15、16 的演练，未修改对应 checkbox；Task 4 的 weapp 段已补跑通过。

**Commit**

- `feat(template): add fetch network adapter and browser runner to the IDL protocol package`

#### Task 5 OpenAPI 协议包与契约命令

**规划与输入**

- 起始 HEAD：`02c6eb9`。
- 起始与结束 freshness：`PASS`，digest `2424baeafe3c4ac6e197e4c92feb8faf01eacdef2204aea49ad94cdb9e3a94e3`。
- 新增精确依赖 `@redocly/cli@2.62.1`、`openapi-typescript@7.13.0`；`pnpm install` 退出码 0。Redocly 正式版本按任务要求记录，关闭 OI-WA-02。

**RED / GREEN**

- RED 为 `api:validate`、`api:sync`、`api:status` 与 `@daqian/template-openapi` 尚不存在；`SCN-OPENAPI-CONTRACT-001～004、006、029` 不能解析命令或生成物而失败。
- 边界反例在 lock 漏登 `src/generated/operations.ts` 时，`api:status` 明确报告未知生成物并非零退出。
- GREEN 后，命令按清单中带 `contract` 的协议包工作：`validate` 运行 Redocly 与契约一致性检查，`sync` 原子写入 bundle、lock、三个生成物，`status` 逐项比较来源、lock 与生成物摘要。
- 运行时代码不读取 `protocolKind` 分支；`protocolKind` 只参与清单 schema 约束，契约能力由 `contract` 登记派生。OpenAPI 生产入口只导出 `OperationCodes` 类型，完整契约 bundle 仅留在 `testing/`，不进入生产导入图。

**Fixture 与摘要**

- 新增 `SCN-OPENAPI-CONTRACT-001～004、006、029` 六个 Fixture 数据集并执行摘要刷新；owner 范围与 R5-M4 一致。
- `pnpm check:fixtures` 随 `check:fast` 通过：37 个 manifest，`issues: []`。
- 补齐旧受控根的 OpenAPI `contract` 与 `protocolInputs` 声明，包括协议适配器、Fixture 绑定、清单规则与工程组合夹具，避免 schema 有效但拓扑校验失败的跨任务回归。

**Verification**

- 定向 unit：`test-tools-unit` 的契约与清单 12/12 用例通过；`openapi-unit` 的生成物类型与业务码 1/1 用例通过。
- `SCENARIO_GATE_CHANGES=template-web-absorption pnpm check:fast`：退出码 0。
  - unit 86/86 文件、424/424 用例通过；statements/branches/functions/lines 均为 100%。
  - integration 74/74 文件、145/145 用例通过；SCN-008 的两个 case 均通过。
  - format、lint、build、typecheck、architecture、fixtures、package、bundle 与 component-tree 均退出 0。
- `SCENARIO_GATE_CHANGES=template-web-absorption pnpm test:affected`：退出码 0，run id `affected-20261011T161506Z`；因清单、构建输入与协议来源变化全量触发 `check:fast`。
- 独立 `pnpm check:scenarios --change template-web-absorption`：退出码 1，34 条问题均为已登记测试项目尚未到实现任务造成的中间态。
  - `browser` 未登记：21 条，其中 20 条 Scenario 元数据与 1 条 `FLOW-WEB-EXAMPLE-001` 行；归属任务 10。
  - `app-unit` 未登记：13 条；归属任务 8。
  - `openapi-unit` 的 11 条问题已随本任务登记消失；没有缺失绑定、非本 Change Scenario 或其他问题，符合 R5-M1 的 A2 增量口径。
- SCN-008 的期望集合按门禁真实阶段处理：预检存在尚未登记项目时门禁会在覆盖评估前返回，因此只比对精确预检问题；共享绑定缺失反例在预检清空后继续执行，任务 15 必须使用 A2 的精确 GREEN 口径。此调整只修正测试夹具的阶段判定，不改变规划语义。

**Review / Acceptance**

- 对照 xueshan 契约脚本完成三处修正：来源与输出路径参数化；lock 覆盖三个生成物并在 `status` 中反查未知条目；运行接口表只读取生成方法元数据，不复制契约全文。
- 架构检查确认 `packages/openapi/src` 的生产图不含 `testing/`、示例契约或生成 bundle；跨包路径继续只允许公开入口。
- `git diff --check` 退出码 0；未执行任务 15、16 的演练，也未修改对应 checkbox。

**Commit**

- `feat(template): add OpenAPI protocol package with contract commands and generators`

#### Task 6 OpenAPI 执行器与协议适配器

**规划与输入**

- 起始 HEAD：`6e9a2be`。
- 起始与结束 freshness：`PASS`，digest `2424baeafe3c4ac6e197e4c92feb8faf01eacdef2204aea49ad94cdb9e3a94e3`。

**RED / GREEN**

- RED 覆盖 OpenAPI 声明解析、接口义务、presence 联合判定、响应严格同形、信封认领、业务码、调用扫描、OpenAPI 路由与浏览器步骤执行器；旧工作区没有对应 OpenAPI 执行器、适配器和 Shadow 路由而失败。
- GREEN 后，SCN-OPENAPI-CONTRACT-007～014、028 的 integration 用例，015～020 的 openapi-unit 用例，以及 027 的包形态与消费边界通过；021 的受控产品矩阵以临时根声明运行通过。
- SCN-TEMPLATE-ENGINEERING-007 的依赖副本会在巡航前构建全部协议包，使 OpenAPI testing 的公共包名导入可在无提交产物的副本内解析；SCN-029 在 `web-openapi-browser` 尚未登记的当前阶段只核对 Web 用例目录，任务 8 登记绑定后继续核对目录派生绑定。受控 Fixture 根清除了外层 `SCENARIO_GATE_CHANGES`，避免把仓库的 Change 作用域泄漏到临时根。

**Verification**

- `SCENARIO_GATE_CHANGES=template-web-absorption pnpm check:fast`：退出码 0。
  - unit 99/99 文件、470/470 用例通过；statements/branches/functions/lines 均为 100%。
  - integration 87/87 文件、158/158 用例通过；SCN-008 的两个 case 均通过。
  - format、lint、build、typecheck、architecture、coverage、fixtures、package、bundle 与 component-tree 均退出 0；fixtures 共 45 个 manifest、`issues: []`。
- `SCENARIO_GATE_CHANGES=template-web-absorption pnpm test:affected`：退出码 0，run id `affected-20261011T173637Z`。因包清单、构建输入、工具配置和平台适配目录变化全量触发 `check:fast`，实际执行结果与上一条相同。
- 独立 `pnpm check:scenarios --change template-web-absorption`：退出码 1，34 条问题全部为尚未到实现任务的已登记测试项目中间态。
  - `browser` 未登记：21 条，其中 20 条 Scenario 元数据与 1 条 `FLOW-WEB-EXAMPLE-001` 行；归属任务 10。
  - `app-unit` 未登记：13 条；归属任务 8。
  - 没有缺失绑定、非本 Change Scenario 或其他问题，符合 R5-M1 的 A2 增量口径。
- 本周期全量 `pnpm verify --change template-web-absorption`：run id `template-web-absorption-apply-20261011T174045Z`。
  - `check:fast`：通过（234550ms）。
  - `test:e2e:weapp`：当时环境阻塞待补跑（190098ms）。`weapp:prepare` 在 180000ms 预算内未就绪，错误为“第 9 次微信开发者工具就绪探测 超过 11602ms 未返回”；未进入 weapp 用例。正式版此前已确认 `islogin=false`，外部 Nightly 实例仍在使用；按验收方口径未重试、不计业务失败或 OI；Task 4 后续补跑已通过。
  - 使用同一 run id 从 `check:scenarios` 续跑：`check:fast` 与 weapp 跳过，`check:scenarios` 退出码 1（1069ms）；问题集合与上述独立的 34 条完全一致，仍归属任务 8、10。

**Review / Acceptance**

- 对照 xueshan 的 REST 执行器、契约清单、契约 schema 与 Fixture 检查实现完成吸收：保留可配置信封、路径参数、身份头、请求 ID、契约方法校验和严格 Fixture/响应同形；未引入宽松认领路径。
- OpenAPI 生产入口只导出公共执行器、网络端口与生成物；完整契约 bundle 和测试适配器不进入生产导入图。OpenAPI 浏览器 runner 经根入口消费公共客户端，不硬编码业务接口。
- 新增检查均以反例验证：非法声明、未知请求字段策略、未认领或悬空 Fixture、错误业务码、响应 schema 不符、传输失败与取消均有明确非零或判别结果。
- 高并发下 AST 分支用例曾超过原 30 秒预算；将单例预算调整为 120 秒后连续三轮完整 unit 与两轮副本 `check:fast` 均通过。该调整只解决测试负载预算，不放宽断言。
- 本轮 Task 6 自发现并修复的门禁回归均在提交前关闭，不新增“时败时过”；按验收方口径 Tasks 2、3 的两次也不是 OI，当前新增 OI 为 0。`git diff --check` 退出码 0。
- 未执行任务 15、16 的演练，未修改对应 checkbox；本次全量 verify 的 weapp 段当时等待环境恢复，Task 4 后续补跑已通过。

**Commit**

- `feat(template): add OpenAPI REST executor and protocol adapter`

#### Task 7 Shadow 扩展：预览模式与部分响应后断开

**规划与输入**

- 起始 HEAD：`49b37ea`。
- 起始与结束 freshness：`PASS`，digest `2424baeafe3c4ac6e197e4c92feb8faf01eacdef2204aea49ad94cdb9e3a94e3`。

**RED / GREEN**

- RED 时新建的预览用例因独立模块尚不存在而失败；`partial-then-disconnect` 仍返回完整 JSON，尚未产生客户端可观察的响应不完整；依赖边界用例也先证明预览构造入口既未隔离，引擎入口转导出绕过也未被拒绝。
- GREEN 后，预览模式按接口加实际路径参数独立推进序列，声明 `pathParams` 的条目精确匹配，未声明条目匹配任意参数，序列末尾无限重复；已注册未编排与未注册请求返回 404、写入记录并打印警告，`verify()` 保持无问题；预览响应在构造期执行与测试模式相同的同形校验。
- 测试模式入口要求 `environmentClass` 并拒绝 `mode: 'preview'`；`createPreviewShadowServer` 位于独立模块且未被引擎入口转导出。`partial-then-disconnect` 先发送响应头和部分响应体再销毁连接，零字节 `disconnect` 保持未发送响应字节的对照，两类请求均记录。

**Verification**

- 定向预览、部分响应与故障单测：退出码 0，5/5 用例通过；Shadow、预览与依赖规则定向测试：退出码 0，31/31 用例通过；SCN-PROTOCOL-CONTRACT-019 的 integration 边界用例：退出码 0，1/1 通过。
- `SCENARIO_GATE_CHANGES=template-web-absorption pnpm check:fast`：退出码 0。
  - unit 101/101 文件、474/474 用例通过；statements/branches/functions/lines 均为 100%。
  - integration 88/88 文件、159/159 用例通过；SCN-PROTOCOL-CONTRACT-019、020 均通过。
  - architecture、typecheck、format、lint、build、package、bundle 与 component-tree 均退出 0。
- `SCENARIO_GATE_CHANGES=template-web-absorption pnpm test:affected`：计划 run id `affected-20261011T180108Z`。第 1 步 related 10/10 文件、29/29 用例通过；固定计划的第 2 步进入 `weapp:prepare` 后，因 Task 4 已登记的环境阻塞且当前要求不重试 weapp，在准备完成前中止，退出码 130，没有把它记为业务失败。
  - 为避免再次触发 weapp，另运行 `pnpm test:affected --dry-run`：退出码 0，run id `affected-20261011T180201Z`；完整计划仍选择 18 个 ID、22 个测试文件和 12 个固定步骤，其中 5 个 weapp 文件继续受 Task 4 环境阻塞影响。
  - 手动执行同一计划中不涉及 weapp 的 integration 步骤：退出码 0，17/17 文件、20/20 用例通过；报告写入 `artifacts/affected-20261011T180108Z/reports/integration.json`。
- 独立 `pnpm check:scenarios --change template-web-absorption`：退出码 1，34 条问题仍全部为尚未到实现任务的已登记测试项目中间态；`browser` 未登记 21 条归属任务 10，`app-unit` 未登记 13 条归属任务 8，没有 Task 7 相关问题。

**Review / Acceptance**

- 依赖检查用受控临时根逐一验证：`packages/e2e/src/preview/` 导入通过；用例、harness 直接导入被拒绝；引擎入口临时转导出后，由用例经入口导入仍被拒绝并指出中转文件。恢复引擎入口后用 `depcruise` 复核通过，确认规则不能靠重导出绕过。
- `shadow-engine-no-generated` 继续覆盖新增预览模块；预览构造模块只复用中立路由、步骤与共享同形校验，不导入任何协议包 generated 或 testing 模块。
- 新增断言均核对实际用例数而非只看退出码；预览未命中与部分响应故障都有可观察结果，不是恒真检查。Task 7 未新增 OI，未执行任务 15、16 的演练，未修改对应 checkbox。
- `pnpm format:check`、`git diff --check` 退出码均为 0。

**Commit**

- `feat(template): add shadow preview mode and partial-then-disconnect fault`

#### Task 8 Web 应用包骨架、前端架构规则与绑定 `web-openapi-browser`

**规划与输入**

- 起始 HEAD：`27c25e6`。
- 起始与结束 freshness：`PASS`，digest `2424baeafe3c4ac6e197e4c92feb8faf01eacdef2204aea49ad94cdb9e3a94e3`。
- 按清单新增 `packages/web` 产品包（`form: web-app`、私有、`globalStore: src/store/index.ts`）、`app-unit` 测试项目与 `web-openapi-browser` 绑定；该绑定的 `platforms` 保持为空，浏览器测试项目按任务 10 再登记。

**RED / GREEN**

- RED 阶段在规则未生效时，核心层 DOM 使用、store 直接写入、别名或 `Object.assign`、组件树越层、未测试 Vue 文件与环境配置越界均未被拒绝；受控临时根中的反例用例因此失败。未登记绑定时，SCN-OPENAPI-CONTRACT-021 的 `openapi-matrix-empty` 也没有派生对象。
- GREEN 后，Vue flat ESLint 配置、按清单生成的 dependency-cruiser 规则、组件树检查、覆盖率完整性检查与 Vitest root 修正均已生效；违规反例被拒绝，恢复后通过。`packages/web` 骨架本身通过架构、类型、格式、lint、build、package、bundle 与组件树检查。
- 定向用例覆盖 `SCN-WEB-APP-001、004～011`：构造临时仓库验证环境变量越界、核心层 DOM、store 写入、别名、组件树、未测试 Vue、覆盖率恢复以及入口约束；不是只检查脚本退出码。
- 完整门禁暴露并修复了三个实现问题：无 Web 包时 ESLint 为空 `files` 数组、临时根未按清单生成 `tsconfig.core.json`、空 `consumedOperations` 无法被契约派生器识别；另将 ENG-015 的 Vue 类型错误断言对齐到 `AppRoot.vue`。

**Verification**

- `pnpm lint`、`pnpm format:check`、`pnpm typecheck`、`pnpm check:architecture`、`pnpm check:fixtures`：退出码均为 0。
- unit：108/108 文件、490/490 用例通过；statements、branches、functions、lines 均为 100%。
- 定向复跑：`SCN-TEMPLATE-ENGINEERING-008` 2/2、`SCN-SCENARIO-GATE-026` 1/1、`SCN-OPENAPI-CONTRACT-014` 1/1、`SCN-WEB-APP-010` 1/1 均通过；最后一项隔离复跑用时 77265ms。
- `SCENARIO_GATE_CHANGES=template-web-absorption pnpm check:fast`：integration 92/96 文件、165/169 用例通过；`SCN-TEMPLATE-ENGINEERING-001`、`SCN-OPENAPI-CONTRACT-014`、`SCN-WEB-APP-010`、`SCN-SCENARIO-GATE-026` 在并发负载下失败，四项隔离复跑均通过，登记 Task 8“时败时过”4 次。
- `SCENARIO_GATE_CHANGES=template-web-absorption pnpm test:affected`：计划 run id `affected-20261011T192233Z`。unit 108/108 文件、490/490 用例通过；integration 94/96 文件、167/169 用例通过，仅 `SCN-WEB-APP-010` 与 `SCN-SCENARIO-GATE-026` 在并发负载下失败。`SCN-WEB-APP-010` 隔离复跑 1/1 通过，`SCN-SCENARIO-GATE-026` 此前隔离复跑 1/1 通过，登记 Task 8“时败时过”2 次。
- Task 8 共新增 6 次“时败时过”，全部为“聚合运行失败、隔离复跑通过”，已关闭；全局“时败时过”累计为 8 次、均已关闭。按验收方口径“时败时过”不计 OI；当前新增 OI 为 0。时败时过与 OI 均不计业务失败。
- 独立 `pnpm check:scenarios --change template-web-absorption`：退出码 1，剩余 21 条问题全部是尚未登记 `browser` 测试项目的预期中间态，归属任务 10；Task 8 的 `app-unit` 问题已关闭。
- Task 4 的 weapp 段当时为环境阻塞待补跑，run id `template-web-absorption-apply-20261011T141758Z`；后续补跑已通过，见 Task 4，Task 8 本身未运行 weapp。

**Review / Acceptance**

- 对照 create-vue 生成物，保留明确依赖的 `@vue/devtools-api`、精确版本、根级 lint/format 配置和 Vue 工具链；去除包级配置与脚手架残留，并按模板清单接入 `globalStore`、绑定、测试项目、模块根和核心 tsconfig。
- 新增检查均通过反例或真实仓库运行观察到失败后再恢复，未用恒真断言替代行为证据。Task 8 未执行任务 15、16 的演练，也未勾选对应 Task。
- `git diff --check` 退出码 0。

**Commit**

- `feat(template): add web app package skeleton with frontend architecture rules`

#### Task 9 Web 产物边界检查

**规划与输入**

- 起始 HEAD：`fd6b8bb`。
- 起始 freshness：`PASS`，digest `2424baeafe3c4ac6e197e4c92feb8faf01eacdef2204aea49ad94cdb9e3a94e3`。
- 交付范围为 WEB-09 / `SCN-WEB-APP-012～014`：Vite 构建写出模块清单，`check:bundle` 对账模块来源、产物摘要、入口与相对资源、CSS 伪选择器残留及产品摘要新鲜度。

**RED / GREEN**

- RED 时插件与完整 `check:bundle` 尚未实现，012～014 均失败；受控反例分别把协议契约、测试设施来源、`:deep(` / `:global(` 编译残留、绝对资源路径与过期产品摘要放进输入，均观察到非零退出和对应问题文本，恢复合法输入后退出码回到 0。
- GREEN 后，模块清单写入 `artifacts/build/<产品目录>/bundle-manifest.json`；模块来源按清单中的 test 包、协议包 `testing/` 与实际契约文件判定，入口必须来自产品手写源码，所有 dist 输出必须登记且 sha256 一致，`base: './'` 对应资源必须为相对路径。
- 产品摘要只覆盖产品包手写源码、绑定协议包非 testing 源码和清单 `buildInputs`；测试、门禁脚本、`packages/web/index.html` 与 `.gitignore` 排除的本地文件不会误触发过期，但源码、协议源码和构建输入变化均会使摘要过期。
- 定向用例：`SCN-WEB-APP-012` 1/1 通过、20 个断言；`SCN-WEB-APP-013` 1/1 通过、21 个断言；`SCN-WEB-APP-014` 1/1 通过、12 个断言；相关 bundle unit 4 个文件、25 个用例通过；`SCN-TEMPLATE-ENGINEERING-008` 在正确 Change 作用域下 2/2 通过（126.64s）。

**Verification**

- `SCENARIO_GATE_CHANGES=template-web-absorption VITEST_MAX_WORKERS=1 pnpm test:affected`：退出码 0，run id `affected-20261011T203159Z`。
  - unit 111/111 文件、507/507 用例通过；statements 5190/5190、branches 3429/3429、functions 1016/1016、lines 4560/4560 均为 100%。
  - integration 99/99 文件、172/172 用例通过；其中 012～014 与 `SCN-TEMPLATE-ENGINEERING-008` 均通过。
  - `check:fixtures` 45 个 manifest、`issues: []`；`check:bundle` 检查 `packages/web`、`issues: []`；`check:package`、`check:component-tree` 均退出 0。
- 独立复核：`pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm check:fixtures`、`pnpm check:bundle` 均退出 0。
- 独立 `SCENARIO_GATE_CHANGES=template-web-absorption pnpm check:scenarios --change template-web-absorption`：退出码 1，剩余 21 条问题全部是尚未登记 `browser` 测试项目的预期中间态（`SCN-BROWSER-PLATFORM` 6 条、`SCN-OPENAPI-CONTRACT` 8 条、`SCN-WEB-EXAMPLE` 6 条及 `FLOW-WEB-EXAMPLE-001` 1 条），统一归属任务 10；Task 9 无相关问题。
- Task 9 标准并发全量：`pnpm verify --change template-web-absorption`，run id `template-web-absorption-apply-20261012T023622Z`，整体退出码 1。
  - `check:fast`：退出码 1（323402ms）。unit 111/111 文件、507/507 用例通过，四项覆盖率均为 100%；integration 95/99 文件、168/172 用例通过。
  - 失败用例为 `SCN-TEMPLATE-ENGINEERING-001/protocol-network-types-consumer`、`SCN-OPENAPI-CONTRACT-014/transport-failure-wire`、`SCN-WEB-APP-010/untested-vue-cli`（160031ms）与 `SCN-SCENARIO-GATE-026/self-test-isolation-cli`（205280ms）。四个文件隔离复跑分别通过（6/6、1/1、1/1、1/1；约 6.11s、4.45s、84.47s、79.19s）；四文件定向并发复跑 4/4 文件、9/9 用例通过（138.07s）。
  - 因 `check:fast` 退出码 1，`test:e2e:weapp` 与 `check:scenarios` 跳过。
- Task 9 单 worker 全量：`VITEST_MAX_WORKERS=1 pnpm verify --change template-web-absorption`，run id `template-web-absorption-apply-20261012T024936Z`，整体退出码 1。
  - `check:fast`：退出码 0（728200ms）。unit 111/111 文件、507/507 用例通过，四项覆盖率均为 100%；integration 99/99 文件、172/172 用例通过；四类先前时败用例均通过。
  - `test:e2e:weapp`：退出码 0（308641ms），5/5 文件、5/5 用例通过。
  - `check:scenarios`：退出码 1（1291ms），仍为 21 条预期 browser 中间态问题并归属任务 10；因此全量命令整体退出码 1，不归因于 Task 9。
- `git diff --check`：退出码 0。

**Review / Acceptance**

- 对照 Design 中 xueshan `check-bundle` 的泛化点落实：产品目录来自清单，测试设施与协议契约按精确来源判定而非子串匹配；模块清单移出 dist；摘要范围排除测试和门禁并遵守 `.gitignore`；入口、相对资源、CSS 残留与输出哈希均有可失败反例。
- 实施偏离与兼容修复：统一构建入口现在为所有 `build` 步骤强制 `NODE_ENV=production`，避免外层 Vitest 的 `NODE_ENV=test` 泄漏到副本构建并让 Vue 把绝对源码路径写进产物；`SCN-WEB-APP-012` 加入副本排除清单以避免递归复制；受控构建副本测试补复制 `packages/web/index.html` 并接入统一构建计划，均是测试/构建环境接线，不改变规划语义。
- “时败时过”：Task 9 原有 7 次，分别为首轮 `check:fast` 的 `SCN-WEB-APP-010`、`SCN-SCENARIO-GATE-026`；默认并发 affected 的 `SCN-SCENARIO-GATE-018`、`SCN-WEB-APP-010`、`SCN-SCENARIO-GATE-026`；低并发 affected 的 `SCN-OPENAPI-CONTRACT-014` 及其在 `SCN-TEMPLATE-ENGINEERING-008` 中传播出的副本快门禁失败。本次标准并发全量新增 4 次，Task 9 累计 11 次，全局累计 19 次。
  - `SCN-TEMPLATE-ENGINEERING-001`：用例复制候选包并运行构建、安装与 `tsc` 子进程；99 个 integration 文件并发时受 CPU 和进程压力影响失败。未发现共享端口、固定临时目录或主仓库全局状态冲突，隔离及四文件并发均通过。
  - `SCN-OPENAPI-CONTRACT-014`：取消路径依赖 1ms 轮询与事件循环顺序，高负载下请求可能先完成再触发取消，形成时序竞态；隔离复跑稳定通过。
  - `SCN-WEB-APP-010`：副本内连续执行多次 build/test/coverage 子进程，全量负载下超过用例预算并失败；隔离 84.47s 通过，未命中共享端口、临时目录或全局状态。
  - `SCN-SCENARIO-GATE-026`：副本内完整 unit 的两个 CPU 密集用例 `resolve-declaration-unit`（30s）与契约声明点派生（5s）在全量争用下超时；带 `SCENARIO_GATE_CHANGES` 隔离复跑 79.19s 通过，不是共享端口、临时目录或主仓库全局状态冲突。
  - 上述时败时过均已通过隔离和单 worker 全量关闭；按验收方口径不计 OI，单列统计。本轮按“按需通过但全量失败”口径新增 OI 为 0。
- Task 4 的 weapp 段补跑已通过，run id `template-web-absorption-apply-20261012T023104Z`；Task 9 本次全量也已运行 weapp 5/5。未执行任务 15、16 的演练，未修改对应 checkbox。

**Commit**

- `feat(template): add web bundle boundary check`

#### Task 9 后置修复：默认并发稳定性

**问题与根因**

- `SCN-OPENAPI-CONTRACT-014` 的取消路径依赖 1ms 轮询与事件循环顺序，高负载时可能在第三次请求写入前先停止，形成时序竞态。
- `SCN-TEMPLATE-ENGINEERING-001`、`SCN-WEB-APP-010`、`SCN-SCENARIO-GATE-026` 都在副本内执行构建、安装、`tsc` 或完整 unit 子进程；与普通 integration 文件一起默认并发时争用 CPU、进程与文件系统，原先只能通过单 worker 或整体串行稳定通过。

**修复**

- 取消轮询改为显式事件推进：`SCN-OPENAPI-CONTRACT-014` 等待 Shadow 第 3 条请求记录后停止，`RunningTestShadowServer.waitForRecords` 仅用于测试 Shadow，不污染生产预览接口；等待成功与关闭拒绝均有单测。
- 新增 Vitest `integration-heavy` 物理项目，仅让上述三个构建/安装/`tsc`/完整 unit 用例 `fileParallelism: false`；普通 integration 保持默认并行。`integration-heavy` 的逻辑环境复用 `integration`，因此协议义务、场景证据和报告仍归属原环境，不改变规划语义。
- 单例预算复核后将 `packages/openapi/testing/ast-branches.test.ts` 与 `scripts/lib/contract-inventory.derivation.test.ts` 从 120s 收回 60s；默认并发下实测分别约 20～30s、约 30～33s。
- `test:affected` 选择 integration 文件时同时覆盖普通与重型项目；副本中重型文件全部被排除时允许重型项目零文件，但独立报告仍会拦截选中文件却零用例的情况。

**连续默认并发验证**

- 第一次：run id `template-web-absorption-apply-20261012T105442Z`，整体退出码 1 仅因 Task 10 预期 browser 中间态。
  - `check:fast`：退出码 0（395813ms）。unit 111/111 文件、510/510 用例通过，四项覆盖率 100%；普通 integration 96/96 文件、164/164 用例通过；integration-heavy 3/3 文件、8/8 用例通过。
  - `test:e2e:weapp`：退出码 0（308327ms），5/5 文件、5/5 用例通过。
  - `check:scenarios`：退出码 1（1245ms），恰好 21 条未登记 `browser` 环境问题（20 条 Scenario 与 1 条 FLOW），全部归属 Task 10。
- 第二次：run id `template-web-absorption-apply-20261012T110637Z`，整体退出码 1 仅因 Task 10 预期 browser 中间态。
  - `check:fast`：退出码 0（395224ms）。unit 111/111 文件、510/510 用例通过，四项覆盖率 100%；普通 integration 96/96 文件、164/164 用例通过；integration-heavy 3/3 文件、8/8 用例通过。
  - `test:e2e:weapp`：退出码 0（307738ms），5/5 文件、5/5 用例通过。
  - `check:scenarios`：退出码 1（1253ms），问题集合与第一次完全相同，仍为 21 条 Task 10 预期项。
- 耗时对照：旧整体串行方案 `check:fast` 为 873390ms，当前重型拆分约 395.5s，缩短约 55%；单 worker 对照为 728200ms。

**验收统计**

- 两次默认并发全量均未出现 `SCN-OPENAPI-CONTRACT-014` 或三个重型用例失败；本轮“按需通过但全量失败”的新增 OI 为 0。
- 拆分首次落位曾把 `integration-heavy` 当作独立义务环境，导致 IDL 归一化摘要从 `46417e0f...` 变为 `fc5dbeb9...`；改为逻辑环境复用后摘要恢复原值，协议义务数量与内容未变。
- 新增逻辑环境、回退与校验分支均有单测覆盖；完整 unit 恢复到 statements 5223/5223、branches 3448/3448、functions 1025/1025、lines 4587/4587。

#### Task 10 浏览器平台点位

**规划与输入**

- 收尾提交起点 HEAD：`db18dae`；freshness 为 `PASS`，digest `2424baeafe3c4ac6e197e4c92feb8faf01eacdef2204aea49ad94cdb9e3a94e3`。
- 本任务交付浏览器平台、Playwright 驱动、共用代理、协议与应用宿主、OpenAPI 浏览器矩阵，并承接 `SCN-TEMPLATE-ENGINEERING-013/template-bindings-fact`。

**Task 10 收尾补证据**

- `SCN-TEMPLATE-ENGINEERING-013/template-bindings-fact`：integration case 实际执行 16 个断言，覆盖 `template-bindings`、`schema-descriptions`。合法输入从真实 `project.manifest.json` 派生产品与协议绑定事实，不写死绑定条数；反例把 binding 指向不存在的产品，`validateManifest` 必须报出 `product must reference a product package directory`。schema 反例使用缺少中文 `bindings` 描述的临时 schema，必须报出对应缺失说明。
- `SCN-WEB-APP-010/vitest-project-config`：`test-tools-unit` case 实际执行 3 个断言，覆盖 `vitest-root-fixed`。合法输入直接加载真实 `packages/web/vitest.config.ts`，确认 `app-unit`、`jsdom` 与仓库根；反例把 root 改成 `packages/`，检查必须报出 `root must be the repository root`。
- `SCN-PROTOCOL-CONTRACT-015/idl-adapter-validator`：`protocol-unit` case 实际执行 12 个断言，覆盖 `validator-unchanged`。合法响应通过，HTTP 200 与 503 得到同一结论；未知字段、字段类型错误与非法入参三个反例均得到非空错误，证明验证器断言并非恒真。
- 上述三处均进入正式报告：`template-bindings-fact` 16 个断言且两个 checkpoint 均为 passed；`vitest-project-config` 3 个断言且 checkpoint passed；`idl-adapter-validator` 12 个断言且 checkpoint passed。两次 `responseValidator(CreateTrade.meta)` 调用保留，以继续覆盖缓存分支和完整覆盖率。

**Verification**

- Task 10 收尾默认并发全量：`pnpm verify --change template-web-absorption --run-id template-web-absorption-apply-20261013T032958Z`，整体退出码 1，仅因场景门禁保留后续任务问题。
  - `check:fast`：退出码 0（410596ms）。unit 124/124 文件、535/535 用例通过；普通 integration 94/94 文件、168/168 用例通过；integration-heavy 6/6 文件、11/11 用例通过；statements 5436/5436、branches 3561/3561、functions 1083/1083、lines 4774/4774 均为 100%。
  - `test:e2e:weapp`：退出码 0（307096ms），5/5 文件、5/5 用例通过，场景报告合计 650 个断言。
  - `test:e2e:browser`：退出码 0（8665ms），2/2 文件、13/13 用例通过，场景报告合计 70 个断言。
  - `check:scenarios`：退出码 1（1892ms），恰好剩余 33 条问题，全部归属 Task 11–13：27 条归 Task 11（25 条 `SCN-WEB-EXAMPLE`/`FLOW-WEB-EXAMPLE`，`SCN-OPENAPI-CONTRACT-017`、021），4 条归 Task 12（`SCN-BROWSER-PLATFORM-012`～015），2 条归 Task 13（`SCN-TEMPLATE-ENGINEERING-012`、`SCN-OPENAPI-CONTRACT-019/unimplemented-hint-gate`）。
- 独立复核：`SCENARIO_GATE_CHANGES=template-web-absorption VERIFY_RUN_ID=template-web-absorption-apply-20261013T032958Z pnpm check:scenarios --change template-web-absorption` 退出码 1，问题清单与全量完全一致，仍为上述 33 条；收尾前 36 条中的 `SCN-TEMPLATE-ENGINEERING-013/template-bindings-fact`、`SCN-WEB-APP-010/vitest-project-config`、`SCN-PROTOCOL-CONTRACT-015/idl-adapter-validator` 均已消失。
- `SCENARIO_GATE_CHANGES=template-web-absorption pnpm check:fast` 与 `pnpm test:affected` 均为退出码 0；因清单、构建输入和工具配置变化，`test:affected` 正确触发完整 `check:fast`。期间 `proto:status` 两次因 SSH `Connection closed` 失败，各等待约 60 秒后重试成功，不计业务失败或 OI。
- 收尾后 freshness 仍为 `PASS`，digest 为 `2424baeafe3c4ac6e197e4c92feb8faf01eacdef2204aea49ad94cdb9e3a94e3`。

**遗漏归因（实施偏离）**

- Task 2 提交时只登记了 `SCN-PROTOCOL-CONTRACT-015/idl-adapter-regression` 的 `test-tools-unit` 证据，未登记本 Spec 独立要求的 `protocol-unit/idl-adapter-validator`。验收时依赖 `check:fast` 的总体退出码，未逐项核对 case→环境覆盖矩阵，因此漏掉了这条独立 missing binding。
- Task 8 提交时只在 integration 的 `SCN-WEB-APP-010/untested-vue-cli` 内覆盖了 `vitest-root-fixed`，未建立 `test-tools-unit/vitest-project-config` 独立证据。阶段总结把剩余问题概括为 browser 中间态，漏列了这条非 browser 的 missing binding；归因是环境覆盖矩阵核对不完整，不是被 browser 问题掩盖。
- 两项漏交付均属验收证据接线缺失，不改 proposal/spec/design/tasks 语义；本次在 Task 10 收尾内修复并把“逐 case 与环境核对”补入本记录。任务 15、16 的演练与 checkbox 未执行、未修改。

**Commit**

- `feat(template): add browser platform with playwright driver and shared proxy`

#### Task 11 Web 示例

**规划与输入**

- 本任务起点 HEAD：`23a24d0`；freshness 为 `PASS`，digest `2424baeafe3c4ac6e197e4c92feb8faf01eacdef2204aea49ad94cdb9e3a94e3`。
- 本任务交付 Web 交易创建、状态轮询、交易列表与业务/传输失败呈现；OpenAPI 消费声明与义务矩阵；`app-unit`、integration、browser 三层证据；以及 `SCN-TEMPLATE-ENGINEERING-008` 的双示例删除适配。

**实施偏离与修复**

- `SCN-TEMPLATE-ENGINEERING-008.spec.ts` 超过文件行数上限且含未使用导入。将副本删除的辅助逻辑抽到 `packages/e2e/tests/tooling/example-removal-support.ts`，加入 `example-removal.json` 白名单，并同步 `docs/template-guide.md` 与 SCN-008 Fixture 摘要；断言、删除范围和场景语义未改变。
- `packages/web/src/main.ts` 的 `||` 分支使定向入口覆盖率为 99.97%。改为显式 `resolveGatewayBaseUrl()` 结果赋回 `config.apiBaseUrl`，再读取局部值，消除不可覆盖分支；定向入口测试恢复 100%，行为不变。
- `SCN-SCENARIO-GATE-026` 删除 FLOW 后改变了含 FLOW 表的 Requirement 摘要，导致 `SCN-WEB-EXAMPLE-006` 摘要过期。测试在删除 FLOW 后同步刷新现存 `SCN-*` Fixture 摘要，使副本内摘要按新输入自洽；不改 Spec 语义。
- `SCN-TEMPLATE-ENGINEERING-008` 会再次创建副本并运行完整 `check:fast`，默认并发下与 `SCN-TEMPLATE-EXAMPLE-005` 竞争出现 5 秒超时。将该文件纳入 `integration-heavy` 的 `fileParallelism:false` 项目，不放宽单例超时；后续默认并发普通 integration 保持在约 87 秒。
- `SCN-WEB-EXAMPLE-005` 的浏览器证据原以 `createTrade` 零字节断开代替 Spec 要求的 `listTrades` 传输失败，并把 checkpoint 写成 `no-automatic-retry`。改为创建并轮询到终态后，对 `listTrades` 使用 `partial-then-disconnect`，执行 `failure-component-shown` 与 `no-replay`，断言列表请求恰好一次且 Shadow 无问题。
- `FLOW-WEB-EXAMPLE-001` 的阶段值必须与 Spec 表格经门禁解析后的完整字符串一致。浏览器用例现按 `打开页面`、`提交创建表单`、`createTrade`、`getTrade 轮询（非终态`、`终态）`、`停止轮询`、`listTrades`、`列表...调用顺序和次数一致` 原样上报；实现未改 FLOW 解析器或规划语义。

**Task 11 定向绿**

- `SCENARIO_GATE_CHANGES=template-web-absorption VERIFY_RUN_ID=task11-check-fast-20261013T145204Z pnpm check:fast`：退出码 0（约 522 秒）。unit 138/138 文件、566/566 用例；普通 integration 94/94 文件、173/173 用例；integration-heavy 7/7 文件、13/13 用例；statements 5770/5770、branches 3777/3777、functions 1169/1169、lines 5065/5065 均 100%。
- `SCENARIO_GATE_CHANGES=template-web-absorption VERIFY_RUN_ID=task11-check-fast-20261013T151800Z pnpm test:e2e:browser`：退出码 0（36.12 秒），3/3 文件、19/19 用例通过；其中 `SCN-WEB-EXAMPLE` 6/6，包含修正后的 partial-then-disconnect 与 FLOW 用例。
- 同一 run id 独立运行 `pnpm check:scenarios`：退出码 1。共 338 条问题，其中 320 条为本任务尚未运行的 weapp 证据缺失；非 weapp 仅 18 条：Task 12 四条、Task 13 两条、Task 15 的 SCN-008 重型副本因本轮外部负载失败十二条。Task 11 相关 `SCN-WEB-EXAMPLE`、`FLOW-WEB-EXAMPLE-001`、`SCN-OPENAPI-CONTRACT-017`、021 已无问题。
- 最终 freshness 复核为 `PASS`，digest 仍为 `2424baeafe3c4ac6e197e4c92feb8faf01eacdef2204aea49ad94cdb9e3a94e3`。

**外部负载导致的时败时过**

- 同机另一个 `fe_app/esm15-backfill-apply` 任务持续运行大量 Vitest 文件期间，系统负载约 8–16。run `task11-check-fast-20261013T150900Z` 出现单个 fork worker 握手超时，少执行 `scripts/check-fixtures.protocol.test.ts`，unit 137/137 文件、565/565 用例，覆盖率不足 100%；run `151000Z` unit 已通过，但普通 integration 在负载下出现 8 个 5–30 秒超时及 SCN-008 嵌套命令失败；run `151800Z` 普通 integration、unit 均通过，但 SCN-008 副本内 `SCN-PROTOCOL-CONTRACT-018` 在并发负载下出现 `records` 1→0，副本 `check:fast` 失败。
- 上述均为外部高负载下的进程握手/超时竞争，非 Task 11 业务断言回归，也不计入 OI；`task11-check-fast-20261013T145204Z` 已在同一源码主体上默认并发全绿。当前最终源码相较该绿运行仅增加 FLOW 阶段字符串对齐和 SCN-005 partial-then-disconnect 修正，两者已由 `151800Z` browser 19/19 独立复验。

**Task 11 收尾全量**

- 最终源码默认并发全量：`pnpm verify --change template-web-absorption --run-id template-web-absorption-apply-task11-20261013T172500Z`，整体退出码 1，仅因 Task 12/13 尚未实现的场景绑定缺失。
  - `check:fast`：退出码 0（475432ms）。unit 138/138 文件、566/566 用例通过；普通 integration 94/94 文件、173/173 用例通过；integration-heavy 7/7 文件、13/13 用例通过；statements 5770/5770、branches 3777/3777、functions 1169/1169、lines 5065/5065 均为 100%。
  - `test:e2e:weapp`：退出码 0（283264ms），5/5 文件、5/5 用例通过。`packages/e2e/tests/weapp/SCN-PROTOCOL-CONTRACT-002.spec.ts` 实跑 1/1，9.46 秒。
  - `test:e2e:browser`：退出码 0（32545ms），3/3 文件、19/19 用例通过。
  - `check:scenarios`：退出码 1（2072ms），恰好剩余 6 条 missing binding：`SCN-BROWSER-PLATFORM-012`（browser）、`SCN-BROWSER-PLATFORM-013`（test-tools-unit）、`SCN-BROWSER-PLATFORM-014`（test-tools-unit）、`SCN-BROWSER-PLATFORM-015`（integration）归 Task 12；`SCN-TEMPLATE-ENGINEERING-012/web-capability-sections-fact`（integration）与 `SCN-OPENAPI-CONTRACT-019/unimplemented-hint-gate`（integration）归 Task 13。
- 独立场景门禁复核：`SCENARIO_GATE_CHANGES=template-web-absorption VERIFY_RUN_ID=template-web-absorption-apply-task11-20261013T172500Z pnpm check:scenarios` 退出码 1，问题集合与全量完全一致，仅上述 6 条缺失绑定；没有 `requiredIn` 引用未登记项目、非本 Change Scenario 或其他问题。
- Task 11 核对的三项重点均为通过：`SCN-TEMPLATE-ENGINEERING-008` 两个 case 均通过且没有门禁问题；`SCN-PROTOCOL-CONTRACT-018` 在本轮低负载默认并发下 2/2 通过，`records` 1→0 未复现；weapp `SCN-PROTOCOL-CONTRACT-002` 已实跑并通过。
- `SCENARIO_GATE_CHANGES=template-web-absorption pnpm test:affected`：退出码 0；计划因工具配置与构建输入变化触发完整 `check:fast`，未选择 weapp 步骤。
- 最终 freshness 复核为 `PASS`，digest 仍为 `2424baeafe3c4ac6e197e4c92feb8faf01eacdef2204aea49ad94cdb9e3a94e3`。此前 run `template-web-absorption-apply-task11-20261013T170900Z` 及更早尝试中的 `weapp:prepare` 未就绪、正式版掉登录和副本内 `proto:status` SSH 瞬断均为环境问题，不计业务失败或 OI；本记录以 `172500Z` 的全量结果为准。

#### Task 12 本地预览与开发代理

**规划与输入**

- 起点 HEAD 为 `a45da6c`；本任务开始时 freshness 为 `PASS`，digest 为 `2424baeafe3c4ac6e197e4c92feb8faf01eacdef2204aea49ad94cdb9e3a94e3`。
- 交付本地预览启动器、`preview:local`、`dev:remote`、浏览器平台预览数据集及 `SCN-BROWSER-PLATFORM-012`～015 的证据用例，并复核 `SCN-BROWSER-PLATFORM-011` 的命令组合与 `SCN-BROWSER-PLATFORM-016` 的目录边界。

**RED / GREEN**

- RED 阶段确认 `SCN-BROWSER-PLATFORM-012`～015 缺少实现与绑定，`SCN-BROWSER-PLATFORM-011/command-composed` 缺少 `preview:local`、`dev:remote` 命令。
- GREEN 后，`SCN-BROWSER-PLATFORM-013` 的默认数据集、未知数据集、数据集 schema、响应校验与占位资源反例均实际执行；`SCN-BROWSER-PLATFORM-014` 覆盖缺失目标、非法代理前缀、请求转发与双层 `/api` 路径；`SCN-BROWSER-PLATFORM-015` 用产品源码中的模式分支、混合模式配置和缺失 AGENTS 声明三类反例证明检查会失败。
- `SCN-BROWSER-PLATFORM-012` 在真实 Chromium 中验证数据集驱动页面结果、最后一条响应重复、同一宿主代理、未编排请求日志与启动器边界，不使用预览模式请求次数作为证据。

**Verification**

- `SCENARIO_GATE_CHANGES=template-web-absorption VERIFY_RUN_ID=task12-20261013T183500Z pnpm check:fast`：退出码 0。unit 140/140 文件、570/570 用例；普通 integration 95/95 文件、174/174 用例；integration-heavy 7/7 文件、13/13 用例；statements、branches、functions、lines 均为 100%。`SCN-TEMPLATE-ENGINEERING-008` 的 `example-removal-fast` 与 `example-removal-scenarios` 均通过。
- `SCENARIO_GATE_CHANGES=template-web-absorption VERIFY_RUN_ID=task12-20261013T183500Z pnpm test:e2e:browser`：退出码 0，4/4 文件、20/20 用例通过，包含 `SCN-BROWSER-PLATFORM-012`。
- `pnpm format:check`、`pnpm typecheck`、`pnpm lint`、`pnpm check:fixtures --change template-web-absorption` 均通过；lint 仍只有既有 Vue warnings。
- `SCENARIO_GATE_CHANGES=template-web-absorption VERIFY_RUN_ID=task12-20261013T183500Z pnpm check:scenarios --inventory`：退出码 1，共 322 条问题；其中 320 条为当前阶段尚未运行 weapp 的证据缺失，非 weapp 问题恰好两条 Task 13 缺失绑定：`SCN-TEMPLATE-ENGINEERING-012/web-capability-sections-fact` 与 `SCN-OPENAPI-CONTRACT-019/unimplemented-hint-gate`。本任务四条 Scenario 的缺失绑定均已消除。
- 手工执行 `pnpm preview:local --dataset trade-in-progress` 观察到页面状态 `进行中 → 已完成`；`pnpm preview:local --dataset trade-completed` 直接显示 `已完成`。截图仅保存在本机临时目录，未入库。
- 按验收阶段的开发者工具独占约束，本任务未运行 `weapp:prepare`、weapp 用例或含 weapp 的 `pnpm verify`；也因此未运行可能选中 weapp 项目的 `test:affected`。

**Review / Acceptance**

- 默认预览数据集为平台自有的 `platform-openapi-primary`，不依赖 Web 示例；示例删除白名单只移除 `trade-completed` 与 `trade-in-progress` 两个示例数据集，不删除整个 `_datasets`。
- 产品代码无预览/Shadow 模式分支，预览 Shadow 只能经 `packages/e2e/src/preview/` 的启动器构造；`dev:remote` 只按配置允许的路径前缀转发，不形成真实服务端与替身混合模式。
- 实施偏离：为覆盖 `SCN-SCENARIO-GATE-029` 内串行启动三个 Vitest 子进程的完整断言，将用例预算由默认 5 秒调整为 30 秒；未减少用例或断言，不改规划语义。

**Commit**

- `feat(template): add local preview and remote dev proxy modes`

#### Task 13 文档与地图

**规划与输入**

- 起点 HEAD 为 `d01c594`；本任务开始时 freshness 为 `PASS`，digest 为 `2424baeafe3c4ac6e197e4c92feb8faf01eacdef2204aea49ad94cdb9e3a94e3`。
- 交付更新后的能力地图、技术架构章节、替换点地图、移除模板示例白名单、“移除一条绑定”和“跨源部署”指南，以及对应的 SCN-TEMPLATE-ENGINEERING-006、012 与 SCN-OPENAPI-CONTRACT-019 证据。

**RED / GREEN**

- RED 阶段沿用 Task 12 结束时场景门禁中的两条非 weapp 缺失绑定：`SCN-TEMPLATE-ENGINEERING-012/web-capability-sections-fact` 与 `SCN-OPENAPI-CONTRACT-019/unimplemented-hint-gate`。新增检查同时要求指南出现“移除一条绑定”“跨源部署”“产品形态”“本地预览”，并让 web-example 删除白名单成为必需项。
- GREEN 阶段补齐指南与架构文档，并为三处新 checkpoint 增加非恒真反例：SCN-012 向临时指南加入未登记能力后必须报告缺少同名架构章节；SCN-006 删除章节或 web-example 白名单项后检查必须失败；SCN-019 改写“开发代理连接真实服务端时”的说明后 `guide-documented` 必须失败。
- 实施偏离：为让 `scripts/check-architecture.ts` 保持清单登记的文件行数上限，把删除白名单派生逻辑抽到 `scripts/lib/example-whitelist.ts`，断言、白名单范围与检查语义未变。

**Verification**

- `SCENARIO_GATE_CHANGES=template-web-absorption VERIFY_RUN_ID=task13-20261013T191100Z pnpm check:fast`：退出码 0。unit 140/140 文件、570/570 用例；普通 integration 95/95 文件、175/175 用例；integration-heavy 7/7 文件、13/13 用例；statements 5914/5914、branches 3849/3849、functions 1207/1207、lines 5199/5199 均为 100%。`SCN-TEMPLATE-ENGINEERING-008` 的 `example-removal-fast` 与 `example-removal-scenarios` 均通过。
- 同一 run id 复核 `pnpm check:coverage`：退出码 0。`pnpm check:fixtures --change template-web-absorption`：71 个 manifest、0 条问题；`pnpm check:project-map`：0 条问题；`pnpm check:component-tree`：0 条问题。
- `SCENARIO_GATE_CHANGES=template-web-absorption VERIFY_RUN_ID=task13-final-browser-20261013T194500Z pnpm test:e2e:browser`：退出码 0，4/4 文件、20/20 用例、231 个断言通过。
- 场景门禁复核：`SCENARIO_GATE_CHANGES=template-web-absorption VERIFY_RUN_ID=task13-20261013T191100Z pnpm check:scenarios --inventory` 退出码 1，共 320 条问题，全部为 `missing binding for weapp`；非 weapp 问题为 0，Task 10～12 的推迟项与 Task 13 两条缺失绑定均已消失。按验收阶段约束，本任务禁止运行 weapp，因此该 320 条 evidence 缺失明确留给交回前全量关闭，不归前序任务。
- 外部负载复跑不计 OI：run `task13-final-20261013T193500Z` 与上述绿运行使用相同的 source、Spec、协议和 Fixture 摘要，但同机另一个 `fe_app` 的完整 `pnpm test` 正在运行，load average 约 13；复跑中出现 `scripts/test-affected.test.ts` 30 秒预算超时，以及 SCN-008、SCN-WEB-APP-010 重型副本超时。该轮不用于 GREEN，作为外部负载导致的时败时过单独登记。
- 无上下文 Agent 只读 `docs/architecture.md` 后，能够说明协议适配器把 IDL/OpenAPI 差异封装在协议包 `testing/`、组合绑定统一产品/协议/平台/证据关系，以及测试、本地预览、开发代理三种模式只在宿主或代理层整体切换；符合任务的文档可理解性要求。
- 最终 freshness 复核为 `PASS`，digest 仍为 `2424baeafe3c4ac6e197e4c92feb8faf01eacdef2204aea49ad94cdb9e3a94e3`。

**Review / Acceptance**

- 替换点地图逐点位核对文件、清单项、Scenario 与门禁；产品形态、协议来源、运行平台、本地预览和包发布均给出当前实现、涉及文件、清单修改点与验收入口。
- “移除一条绑定”明确删除范围、保留 Shadow 测试基础设施，并说明事实核验用例按清单派生、Spec 清理由使用方 Change 承担；模板示例删除白名单同时覆盖 `template-example` 与 `web-example`。

**Commit**

- `docs(template): document web capabilities, bindings and replacement points`

### Final Code Review 第 1 轮修复

- 起点 HEAD 为 `6e4d0c2`；本轮只修代码与验收记录，未修改 proposal、specs、design、tasks 语义。开始时 freshness 为 `PASS`，digest 为 `2424baeafe3c4ac6e197e4c92feb8faf01eacdef2204aea49ad94cdb9e3a94e3`。

**FCR-1 报告环境可信性**

- RED 反例：在物理 `integration` 项目中声明 `environment: 'weapp'` 时，旧 reporter 会把报告记为 weapp 并可能让 Node 证据冒充 weapp 证据。
- GREEN：`scenario-reporter.ts` 改为始终从 `testCase.project.name` 取物理项目，再按清单 `testProjects[].environment` 映射逻辑环境；声明环境与映射不一致时记录 `status: failed` 和包含声明值、物理项目、映射值的错误。`vitest.config.ts` 注入清单映射。
- 定向验证：`pnpm exec vitest run --config vitest.config.ts packages/e2e/src/reporters/scenario-reporter.test.ts`，1 文件、8 用例通过；重跑 `check:fast` 时 reporter 分支覆盖率为 100%。

**FCR-2 创建交易三类业务码**

- RED 反例：app-unit 只覆盖 `INVALID_REQUEST`、`TRADE_CONFLICT`，browser 只编排 40901，不能证明 `createTrade` 特有码、冲突码、通用业务码三类均按映射表呈现。
- GREEN：契约与 `createTrade` 结果映射补入 `TRADE_NOT_FOUND`；app-unit 与 browser 均逐一覆盖三类码，每个分支断言呈现类别、恰好一次创建请求、不发出 `getTrade`，且不更新当前交易。Fixture 与摘要按生成物同步。
- 定向验证：`pnpm exec vitest run --config packages/web/vitest.config.ts` 为 18 文件、34 用例通过；`pnpm exec vitest run --config packages/e2e/vitest.config.browser.ts packages/e2e/tests/web-openapi-browser/SCN-WEB-EXAMPLE.browser.spec.ts` 为 1 文件、6 用例通过。

**FCR-2 二次修订**

- 修订原因：首轮把 `TRADE_NOT_FOUND` 当作 `createTrade` 特有码不成立；该码同时属于 `getTrade` 与 `cancelTrade`，且“交易不存在”不符合创建接口语义。契约示例改为 `AMOUNT_LIMIT_EXCEEDED: 42201`，页面结果为 `amount-limit-exceeded`，文案为“金额超限”。
- SCN-WEB-EXAMPLE-004 的三类码按“新特有码、冲突码、通用码”改为 `AMOUNT_LIMIT_EXCEEDED`、`TRADE_CONFLICT`、`INVALID_REQUEST`；app-unit 与 browser 均逐个断言呈现结果，并保持每次恰好一次 `createTrade`、不发出 `getTrade`、不设置当前交易。
- 反例恢复：`SCN-OPENAPI-CONTRACT-026/foreign-code-rejected` 重新用 `getTrade` 特有码 `40401` 作为外部接口码，断言 Fixture 校验和响应校验器均拒绝；`SCN-OPENAPI-CONTRACT-017` 的义务集合改为三条新 `createTrade` 业务码义务。
- RED 证据：修改期望但未同步实现时，`packages/web/src/trade-create/adapters/outcomes.test.ts` 失败，新码被旧实现映射为 `trade-not-found`；`scripts/openapi-fixture-validation.test.ts` 失败，旧契约拒绝 `42201`。
- GREEN 证据：`pnpm api:sync 本仓库` 已同步契约 lock、bundle、`schema.d.ts`、`operations.ts`、`codes.ts`；`pnpm api:validate`、`pnpm api:status`、`pnpm check:fixtures --change template-web-absorption`（71 个 manifest）均退出码 0。
- 定向验证：Web 2 文件 8 用例、OpenAPI 1 文件 1 用例、Fixture/义务 2 文件 8 用例、契约工具 2 文件 2 用例、browser `SCN-WEB-EXAMPLE.browser.spec.ts` 1 文件 6 用例全部通过。
- `pnpm build`、`pnpm format:check`、`pnpm typecheck`、`pnpm lint`（仅既有 Vue warnings）通过；`SCENARIO_GATE_CHANGES=template-web-absorption pnpm check:fast` 默认并发全绿：unit 140/140 文件、571/571 用例，普通 integration 96/96 文件、176/176 用例，integration-heavy 7/7 文件、13/13 用例，四类覆盖率均为 100%。本轮未复现 `SCN-TEMPLATE-ENGINEERING-002` 的 5 秒超时。
- 按开发者工具独占约束，本轮未运行 `weapp:prepare`、weapp 用例或完整 `pnpm verify`；F8 仍需在交回前默认并发全量中继续观察。

**FCR-3 写入审计与真实 AbortSignal**

- RED 反例：`write-audit-catches-extra` 原先只对手写对象调用 `changedKeys`，未经过 `auditAction` 的失败分支；导航测试原先只验证调用顺序，没有验证旧请求的 `AbortSignal`。
- GREEN：审计用例通过 `auditAction` 实际写入清单外键，失败信息必须包含 action 名 `setCurrentTrade` 和键名 `hidden`。浏览器取消源创建真实 `AbortController`，`beginAttempt()` 收到取消函数；导航或卸载时 abort，signal 经 `TradeStatusPort`、OpenAPI 适配器和 REST 执行器传到 `fetch`。用例断言旧 signal、`fetch` 收到的 signal 均变为 aborted。
- 定向验证：`pnpm exec vitest run --config packages/web/vitest.config.ts` 全部通过，其中 SCN-WEB-EXAMPLE-007 的审计失败与导航中止断言均执行；OpenAPI 与 web typecheck 通过。

**FCR-4 PATCH 方法大小写**

- RED 反例：生成物 `meta.method` 为小写 `patch`，旧执行器把原值交给 `fetch`，mock 收到的也是小写；旧单测手写大写 `PATCH`，未覆盖真实生成物形状。
- GREEN：在 REST 执行器边界统一执行 `operation.meta.method.toUpperCase()` 后再传给 `http.send`；生成物继续保留小写。单测改用与生成物一致的 `meta.method: 'patch'`，mock 收到的必须是 `PATCH`。
- 定向验证：`pnpm exec vitest run --config packages/openapi/vitest.config.ts`，12 文件、40 用例通过。

**本轮回归记录**

- `pnpm format:check`、`pnpm typecheck`、`pnpm check:fixtures --change template-web-absorption`、`pnpm api:validate`、`pnpm api:status` 均退出码 0。
- `SCENARIO_GATE_CHANGES=template-web-absorption pnpm check:fast` 已跑到单元覆盖率 100%、普通 integration 96/96 文件与 176/176 用例通过；默认并发下 `integration-heavy` 仅因 F8 暴露的 `SCN-TEMPLATE-ENGINEERING-002/gate-reduction-review-evidence` 5 秒默认超时而失败。副本内 `SCN-008` 的 `check:fast` 也仅因同一条 5 秒超时失败。单跑 `SCN-TEMPLATE-ENGINEERING-002.spec.ts` 为 10/10 通过；带正确归档作用域单跑 `SCN-008` 为 2/2 通过（190.68s）。该失败不归因于本轮四条 FCR 修复，按验收要求只登记 F8，不修改。
- freshness 复核仍为 `PASS`，digest 未变化。

**已知风险（只登记，不修）**

- F5：`browser.ts` 多条占位规则使用 `route.continue`，可能绕过先注册的处理器。
- F6：业务失败终态下 `TradeStatus` 会无限轮询，可见性切换时没有在途保护。
- F7：`preview-local.ts` 写死示例接口，复用或替换产品时需要同步调整。
- F8：`defineCase` 默认 5 秒覆盖项目级 `testTimeout`，并发负载下会让较慢的真实验证产生非业务超时。

### Task 14 OpenAPI 引擎证据与产品契约分离

**规划与输入**

- 初始实施 HEAD：`c6f8860`，freshness `PASS`，digest `3610b85a4dc7f8073bfc84bc5061a1fcc717c3e9ae05ea7de31e690e01d62ed0`。规划修订二定稿后以 `9942202` 继续，freshness `PASS`，digest `3a9dec29eb49f620a46db1644eb7e399ef94b14fa7f93e71e08039096e1dafa5`；原 Task 14/15 的示例删除与复刻演练记录顺延为 Task 15/16。
- 未修改 proposal、specs、design、tasks 的语义，只勾选 Task 14 checkbox。

**RED / GREEN**

- `SCN-WEB-EXAMPLE-015` 先在副本中替换产品契约并删除 Web 示例，RED 暴露引擎用例仍读取 `packages/openapi/contracts/` 与 `src/generated/`、开放数据载体仍从产品契约派生、OpenAPI 平台用例与契约命令彼此耦合、Whitelist 与删除清单分散等问题；迁移后 `product-contract-replacement` 通过，改动只落在 WEX-09 允许的范围。
- 引擎测试载体新增 `packages/openapi/testing/engine/` 下的 `trade-v1.yaml`、约定模块、同源 generated 与 bundle；产品侧新增 `packages/openapi/contracts/conventions.ts`。契约加载、业务码解释、Shadow 路由、响应校验和浏览器执行器改为显式接收契约来源或描述，不再按模块位置读取产品契约。
- 载体迁移的完整文件面包括：`packages/openapi/testing/engine/**`、`packages/openapi/contracts/conventions.ts`、`packages/openapi/testing/**`、`scripts/api-contract.ts`、`scripts/lib/openapi-contract-core.ts`、`scripts/openapi-*.test.ts`、`scripts/api-contract*.test.ts`、`packages/e2e/tests/web-openapi-browser/**`、`packages/e2e/tests/tooling/openapi-*.ts` 与 `SCN-OPENAPI-CONTRACT-*.spec.ts`、`packages/e2e/tests/fixtures/SCN-OPENAPI-CONTRACT-*`、`packages/e2e/tests/fixtures/_datasets/platform-openapi-*`、`packages/e2e/src/preview/preview-launcher.ts` 及其单测、`packages/openapi/vitest.config.ts`、`project.manifest.json`、相关 AGENTS/CLAUDE、架构与使用指南。Fixture 与数据集 schema 新增可选 `contractCarrier`，所有引擎证据声明 `contractCarrier: "engine"` 并刷新来源摘要；产品事实用例继续从清单、契约和声明派生，不写死接口名、契约名或码值。
- OAS/BRW 载体核对：OpenAPI 引擎用例与浏览器平台用例均从 `testing/engine/` 或平台登记入口取得契约描述，不导入 `@daqian/template-openapi` 的产品生成常量，也不读取 `contracts/` 或 `src/generated/`；Fixture 与平台数据集的 `contractCarrier` 为 `engine`。`src/generated/` 只保留 lock 登记的生成物，任务 6 遗留的 `declarations.ts` 已删除。
- 删除辅助逻辑迁到不带示例标记的 `removal-support.ts`；模板示例与 Web 示例的删除清单、白名单和标记剥离均各自由自己的 Fixture 派生。SCN-008 在 Web 删除清单不存在时只删除 template-example，并只在 Web 清单存在时按标记外消费声明核对 OpenAPI 义务，与 EX-10 精确口径一致。
- SCN-OPENAPI-CONTRACT-029 的 `engine-artifacts-fresh` 原先只有 integration engineering 断言，没有登记 `openapi-unit` 证据。现将真实 generated/bundle 比对迁入 `packages/openapi/testing/engine/generated.test.ts` 并由 `openapi-unit` 覆盖，integration 只保留结构事实；定向验证 openapi-unit 2/2、SCN-029 integration 1/1。
- 第二批复刻发现一并处理：SCN-OPENAPI-CONTRACT-027 改为“引用 OpenAPI 的绑定都属于 web-app，sdk 不引用 OpenAPI”；IDL 浏览器执行器新增可选网关基地址、令牌和请求上下文；`SCN-PROTOCOL-CONTRACT-004/016` 按清单遍历全部协议包；IDL 绑定独占用例按指南随绑定删除，不再在整份 skip 时登记 cover；项目清单样例包名改为不与真实清单冲突的生成名；指南补充共用接口删除顺序、weapp 依赖处理、归档删除 Scenario 的限制和新增绑定接线点。
- 默认并发稳定性修复使用 Vitest project 隔离：构建、安装、完整 unit 与密集 CLI 子进程用例进入 `integration-heavy` 逐文件串行；`SCN-SCENARIO-GATE-026` 的嵌套 unit 仅在受限副本中显式使用 `TEMPLATE_UNIT_MAX_WORKERS=1`。未减少用例、断言或测试项目，未用扩大等待时间掩盖竞态。

**第 3 轮 xueshan 纵切片修复**

- 规划修订二起点为 `9942202`，freshness 复核为 `PASS`，digest `3a9dec29eb49f620a46db1644eb7e399ef94b14fa7f93e71e08039096e1dafa5`；本轮未修改 proposal、specs、design 或 tasks 语义。
- OAS-04：`createOpenApiContract` 未声明 `security` 的接口继承顶层安全要求，接口级 `security: []` 保持匿名；path item 与 operation 级 `parameters` 按 `in + name` 合并，operation 级覆盖同名参数。生成器 `meta.security` 的顶层继承由 `scripts/api-contract.boundaries.test.ts` 的反例锁定。
- OAS-05：矩阵样例、输入、身份与 Shadow 编排的纯派生函数迁到 `packages/e2e/src/preview/openapi-obligation-matrix.ts`，浏览器用例改为复用该模块；`matrix-samples` 按内置规范化后的 schema 生成，不应用产品钩子，并保留 `allOf` 分支中的 `type`、`pattern` 等约束。
- OAS-06：产品侧约定模块可通过具名 `schemaNormalizers` 登记钩子；适配器按 `contractCarrier` 加载，并在内置规范化之后分别处理响应 schema 根与每个 `$defs` 组件。Fixture 认领也改用带同一组钩子的响应校验器，新增就近单测同时证明无钩子时 `note: null` 失败、有钩子时通过；引擎侧约定模块不导出额外钩子。
- 路由辅助只接受 `contractCarrier`，缺省 `product`；预览启动器按清单产品契约发现路由，浏览器平台与引擎用例显式传 `engine`。SCN-WEB-EXAMPLE-015 的替换 Fixture 已覆盖顶层 security、path item 参数、`{code, meaning, message}` 数组码表、产品侧组件 schema 钩子和产品契约预览启动前校验。
- 第 3 轮第 7 项实复现：在隔离副本中只按 Web 白名单删除 Web 示例、保留 `template-example`，场景清单模式 exit 1，共 959 条问题；其中包含 `SCN-WEB-APP-001/template-alignment-fact`、`SCN-WEB-APP-001/alignment-violation-cli`、`SCN-WEB-APP-010/untested-vue-cli`、`SCN-WEB-APP-012/bundle-manifest-cli` 四条 integration missing binding。根因是副本会归档作用域内 active Change，并排除会再次创建副本的 `copyCreatingSpecs`，这些尚未执行的 integration 用例必然缺报告；这是 SCN-008 已按同口径扣除的预期中间态，不是模板缺陷。指南已写明该行为及示例。
- 指南另补充：示例标记删除的“全仓库”包括 `scripts/` 下带标记的测试片段；产品契约替换前先运行 Prettier；`schemaNormalizers` 只在产品侧约定模块登记且作用于响应 schema 根与 `$defs`；浏览器用例按清单产品契约发现路由，不需要额外传契约对象。

**第 3 轮移除绑定追加修复**

- 追加项 A：移除绑定演练独立复现了 `SCN-WEB-APP-001/010/012` 的 integration missing binding。受控根反例先失败：`copyCreatingSpecs` 中的 `cliEvidence` 用例没有 `environment:` / `ownerId:` 字面量，`expectedMissingBindings` 因而返回空集合；修复后同一反例准确得到两条 expected issue。改动同时让该推导读取 `cliEvidence` owner，并把其固定运行环境识别为 `integration`。
- 追加项 B：IDL 删除后 `fingerprints.protocolInputs[0]` 可能落入 `sourceRoots`，`SCN-TEMPLATE-ENGINEERING-005/digest-inputs-cli` 不能再用“修改协议输入后源码摘要不变”断言。现已把文档变更与协议输入变更拆成两步，只断言文档不进入源码摘要、协议输入进入协议摘要；目标文件 5/5 通过。
- 追加项 C：指南更正 `SCN-PROTOCOL-CONTRACT-004/016` 在仅剩 OpenAPI 时仍可保留，`SCN-004` 只退役 `idl-route-source` case；补充 `SCN-001/002/003/005/015` 及 Fixture 的 IDL 独占处理、删除测试项目后的 `requiredIn` 中间态与建 Change 顺序、IDL/weapp 根工程接线和命令删除范围，并修正并不存在的 `node.ts` 描述。[技术架构文档](architecture.md) 的示例正文同步要求也补入「移除模板示例」。

**第 3 轮定向验证**

- `pnpm typecheck`、`pnpm format:check`、`pnpm check:fixtures --change template-web-absorption`、`pnpm check:architecture` 均退出码 0；Fixture 共 73 个 manifest、0 条问题，架构检查 206 个模块、532 条依赖无违规。
- 新 Fixture 钩子反例、契约继承单测与 schema 正规化单测共 3 个文件、9 个用例通过；矩阵纯函数单测 1 个文件、5 个用例通过，模块覆盖率 100%。
- SCN-OPENAPI-CONTRACT-001 独立复跑 1/1 通过；副本内 `check:fast` 曾在该用例 30 秒预算下受外部高负载超时，独立复跑 18.58 秒通过，按外部负载下的时败时过登记，不计业务失败或 OI。
- A/B 最新反例：`removal-expected.spec.ts` 1/1 通过（29ms），`SCN-TEMPLATE-ENGINEERING-005` 5/5 通过（14.49s）。
- 最新重型副本定向：`SCN-WEB-EXAMPLE-015/product-contract-replacement` 1/1 通过（322.77s），`SCN-WEB-APP-010/untested-vue-cli` 1/1 通过（100.72s），`SCN-TEMPLATE-ENGINEERING-008` 2/2 通过（179.55s）；未运行 weapp 或完整 verify。
- Task 14 提交前默认并发 `SCENARIO_GATE_CHANGES=template-web-absorption pnpm check:fast` 退出码 0：unit 149/149 文件、604/604 用例，普通 integration 92/92 文件、152/152 用例，integration-heavy 14/14 文件、40/40 用例，四项覆盖率均为 100%；构建、typecheck、架构、Fixture、打包、bundle 与 component-tree 均通过，integration-heavy 段耗时 793.52s。

**Verification**

- 提交后首次重跑 `template-web-absorption-apply-20261014T152844Z`：`check:fast` exit 1（948273ms）；unit 149/149 文件、604/604 用例与普通 integration 92/92 文件、152/152 用例通过，integration-heavy 13/14 文件、38/40 用例通过。`SCN-TEMPLATE-ENGINEERING-008/example-removal-fast` 的副本内 `check:fast` 因 `spawnAffectedStep` 5s 超时、`SCN-OPENAPI-CONTRACT-002/sync-lock-writer` 20s 超时及两处 Vitest forks worker 启动超时而失败，`example-removal-scenarios` 随后级联失败；weapp、browser 与场景门禁未进入。验收方根据提交前同代码默认并发全绿、运行时负载 11+ 和外部演练副本仍在运行，判定为环境负载问题，不计业务失败或 OI。
- 负载恢复后从头重跑 `template-web-absorption-apply-20261014T155052Z`：`check:fast` exit 0（799035ms），heavy 用例 `SCN-TEMPLATE-ENGINEERING-008/example-removal-fast`、`SCN-SCENARIO-GATE-026/self-test-isolation-cli` 与 `SCN-WEB-EXAMPLE-015/product-contract-replacement` 均通过。`test:e2e:weapp` exit 0（394334ms）；`SCN-TEMPLATE-EXAMPLE-002/weapp-create-success` 首次 30005ms 超时，per-file-retry 重新 prepare 后以 9483ms 通过，按通过计。`test:e2e:browser` exit 0（33314ms）。`check:scenarios` exit 1（1926ms），问题为 `integration/product-contract-replacement` 的 `preview-from-product` 与 `product-hook-applied` 两个 Spec checkpoint 未执行：用例报告的 `checks` 与已执行 checkpoint 仅有 `replace-contract-and-conventions`、`baseline-green-after-replace`、`engine-untouched`。该缺口属于 Task 14 自身证据登记，未归入 Task 15/16；本轮 verify 最终非零，停止等待处理。
- final1 run id `template-web-absorption-apply-task14-20261014T092800Z-final1`，`pnpm verify --change template-web-absorption` 整轮通过。
  - `check:fast`：exit 0，827013ms；unit 147/147 文件、594/594 用例，普通 integration 90/90 文件、150/150 用例，integration-heavy 14/14 文件、40/40 用例，覆盖率 100%。
  - `test:e2e:weapp`：exit 0，309625ms；6/6 文件、6/6 用例。`FLOW-TEMPLATE-EXAMPLE-001/weapp-normal` 首次 30008ms 超时，按 verify 的 per-file-retry 重新 prepare 后以 9666ms 通过；按验收方修订口径按通过计，不归为 OI。
  - `test:e2e:browser`：exit 0，44333ms；4/4 文件、20/20 用例。
  - `check:scenarios`：exit 0，2085ms；本 Change 场景对账通过，`issues: []`。
- final2 run id `template-web-absorption-apply-task14-20261014T094850Z-final2`，`check:fast` 通过（864380ms；unit 147/147、594/594，普通 integration 90/90、150/150，heavy 14/14、40/40），weapp 前两个文件 `SCN-PROTOCOL-CONTRACT-002` 与 `SCN-PROTOCOL-CONTRACT-008` 均为 1/1 通过；随后 `weapp:prepare` 报“180000ms 内未就绪：第 6 次探测超过 4983ms 未返回”，该步骤最终 exit 1，browser 与场景门禁未进入。
- final2 的中断归因于正式版微信开发者工具主进程僵死（PID 40334 状态 `UE`，`kill -9` 无效），不是模板缺陷、业务失败或 OI；续跑待环境恢复后使用 `--from test:e2e:weapp` 补跑。

**SCN-WEB-EXAMPLE-015 checkpoint 补齐与 GATE-17 修复**

- `SCN-WEB-EXAMPLE-015` 先以 `check:scenarios` RED：Spec 要求的 `preview-from-product`、`product-hook-applied` 两个 checkpoint 未登记也未执行。补齐后，定向运行 `pnpm exec vitest run --project integration-heavy packages/e2e/tests/tooling/SCN-WEB-EXAMPLE-015.spec.ts` 在 run id `template-web-absorption-apply-20261014T155052Z` 下 1/1 通过（331.75s、18 assertions、5 个 checkpoint）；两个新 checkpoint 分别读取命令的 `RESULT:` JSON，实际断言产品契约预览路由与产品侧 `schemaNormalizers` 生效。
- 使用同一 run id 补跑 `check:scenarios --change template-web-absorption` 后，015 的两个 missing checkpoint 已消失；退出码 1 的 1142 条问题全部是测试源码变更后旧报告过期，包括 1141 条逐用例 stale 和 1 条报告 envelope/record 摘要不一致，非 stale 问题为 0。`integration-heavy.json` 中该用例记录已包含 5 个 checkpoint；完整证据需由后续在最终源码上的全量验证重建。
- GATE-17 RED：`define-case-execution.test.ts` 新增两个反例后，绑定目录 `tests/sample-product-protocol/` 中未写 `binding` 的 platform 用例在模块加载期被错误拒绝，原文件 9 个用例中 2 个失败。
- GREEN：加载期保留绑定名、环境和 owner 等校验，只通过显式的 `deferUnboundPlatform` 延后“platform 未归属绑定”判定；运行期仍以 Vitest 提供的真实 `testFile` 完成严格校验。绑定目录内的 platform 用例可由目录推断并通过，`tests/tooling/` 下的同形用例仍在运行期报 `environment platform is platform but case is not bound`，不会放过真正未绑定的用例。
- GATE-17 定向验证：`define-case.test.ts`、`define-case-binding.test.ts`、`define-case-execution.test.ts` 共 3 文件、15 用例通过；`pnpm exec eslint`、`pnpm typecheck`、Prettier 与 freshness digest 检查均退出码 0，freshness `PASS`。

**已知风险（只登记，不修）**

- Web 示例删除白名单会一并删除通用轮询基建（`runtime/poller.ts`、`runtime/generation.ts` 等）；删除 Web 示例后若仍需这些能力，应保留或重新提供实现。
- 预览与开发代理仍选择第一个可用协议/Web 包，并保留 `?token=preview-token&merchant=1001` 示例提示；多包替换时需同步调整。
- 高负载下 integration-heavy 副本用例与 `contract-inventory.derivation.test.ts` 仍可能受外部机器负载影响；`fixtures:refresh` 需要目标 manifest 已存在，缺失时要先写占位文件。
- web-app 的 integration 行为证据落位尚未在指南中写明；`openspec new change` 可能生成 `openspec/config.yaml`，属于 Change Skill 问题。
- F5–F8 仍按前述条目登记；IDL 执行器缺少执行选项的问题已由本次可选 `BrowserRunnerOptions` 修复。
- `TEMPLATE_UNIT_MAX_WORKERS` 未在指南中登记，integration-heavy 也没有面向使用方的降并发开关；高负载下 `SCN-OPENAPI-CONTRACT-001/api-validate-cli` 等近 30 秒预算用例可能时败时过。
- OpenAPI 执行器遇到多个 `apiKey` 方案二选一（OR）时仍只取首项；本轮只保证继承与匿名语义，不扩展多方案选择。
- `eslint-plugin-vue` 与 Prettier 对部分 `.vue` 文件的格式规则会产生 warning，模板自带 Vue 文件同样存在。
- 预览提示仍写死 `?token=preview-token&merchant=1001`，替换产品身份或宿主约定时需要同步调整。
- 第 3 轮移除绑定演练登记：[repository-copy.ts](packages/e2e/tests/tooling/repository-copy.ts) 的 `copyEnvironment` 会剥离全部 `VITEST*` 变量，调用方设置的 `VITEST_MAX_WORKERS` 在副本内失效；高负载（演练负载 20–48）下重型用例容易时败时过。
- 第 3 轮移除绑定演练登记：`TEMPLATE_UNIT_MAX_WORKERS` 未写入指南；场景门禁清单模式依赖已有的 unit/integration 报告；`openspec new change` 会额外生成 `openspec/config.yaml`。这些均按已知工具/文档缺口登记，不在本 Change 扩大范围。
- 第 3 轮移除绑定演练登记：删除唯一 `sdk` 形态产品包后，`manifest.release` 等发布模块应如何退役尚未形成指南步骤。

### Task 15 示例删除演练

**规划与输入**

- 第 1 轮无上下文 Agent 在 `d411879` 的隔离副本中按指南同时删除 `template-example` 与 `web-example`，`check:fast` 在 typecheck 失败：`packages/web/src/app/platform/openapi-ports.ts` 与 `packages/web/src/store/example.test.ts` 仍引用已删除的示例模块或状态。
- 失败说明指南的两份删除白名单只覆盖了部分删除面，使用方照字面操作会留下共享文件引用；Task 15 checkbox 保持未勾选，本轮只修复指南与机械一致性门禁。

**根因与修复**

- 根因是 `SCN-TEMPLATE-ENGINEERING-008/example-removal.json` 已是副本删除演练的权威清单，但指南白名单和 `scripts/lib/example-whitelist.ts` 各自手写维护；原架构检查只核对静态条目是否出现在整篇指南中，不读取 Fixture，因此两者漂移时副本用例仍会全绿，而使用方按指南删除必然失败。
- 指南已补齐 Fixture 中遗漏的 Web 测试目录、平台运行文件、runtime 文件、组件测试、store 测试与 `SCN-WEB-EXAMPLE-facts.spec.ts`，并把模板与 Web 两段的目录、文件、glob 逐项写清。
- `example-whitelist.ts` 现在读取 SCN-008 Fixture；目录统一按尾斜杠、glob 展开为完整前缀路径，再分别校验它们是否出现在指南的 template-example 段与 Web 示例段。Fixture 不存在时不派生这些白名单要求。
- RED 反例在临时 Fixture 加入指南未登记的 `packages/web/src/fixture-only.ts`，原实现没有报错；GREEN 后架构检查报出 `missing removal whitelist entry packages/web/src/fixture-only.ts`，删除 Fixture 后同一临时根恢复无问题。

**Verification**

- 在 `9e9eab5` 上以 `SCENARIO_GATE_CHANGES=template-web-absorption VERIFY_RUN_ID=task15-20261015T003000Z pnpm exec vitest run --project integration-heavy packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-008.spec.ts` 执行交付状态复核：退出码 0，1/1 文件、2/2 用例通过，耗时 162.02s。该用例已在副本中同时删除 `template-example` 与 `web-example`。
- 副本内 `pnpm check:fast` 退出码 0：unit 131/131 文件、527/527 用例，普通 integration 76/76 文件、125/125 用例，integration-heavy 8/8 文件、28/28 用例；所有确定性门禁均通过。
- 副本内 `pnpm check:scenarios --inventory` 得到 32 条问题，逐条等于清单 platform 项目和 `TEMPLATE_COPY=1` 排除的会创建副本用例所对应的缺失绑定，没有指向已删除示例的悬空 Scenario、FLOW、Fixture、预览数据集或用例绑定。反例探针删除一条共享 Scenario 绑定后，问题集合恰好多出该条并保持非零退出。
- `SCENARIO_GATE_CHANGES=template-web-absorption VERIFY_RUN_ID=task15-affected-20261015T003000Z pnpm test:affected` 退出码 0：工作区相对基线没有修改文件，选择 0 个测试步骤；本任务没有新增代码或 Fixture 语义，008 与 Web 删除清单已随 `de25fbe` 的引擎/产品契约拆分交付，本轮补齐的是实际删除态验证证据。
- Task 15 的 checkbox 已勾选。Task 16 的无上下文 Agent 完整示例删除演练与最终 `pnpm verify` 仍按原排期执行。

- `pnpm exec vitest run --config packages/e2e/vitest.config.unit.ts scripts/check-architecture.test.ts`：退出码 0，1/1 文件、16/16 用例通过。
- `pnpm check:architecture`：退出码 0，196 个模块、495 条依赖无违规，白名单 issues 为空。
- `pnpm format:check`、`pnpm typecheck`、`pnpm lint`：退出码 0；lint 仅保留既有 Vue warnings。
- `SCENARIO_GATE_CHANGES=template-web-absorption pnpm check:fast`：构建、typecheck、架构及 unit 570/571 通过后，`scripts/lib/contract-inventory.derivation.test.ts` 在 60s 预算超时，退出码 1。该文件与本次改动无关；当时 1 分钟负载约 11.29，单独复跑 1/1 用例 4.02s 通过。按外部负载下的“时败时过”登记，不计 OI，不归因本次修复。
- freshness 在修复前后均为 `PASS`，digest 保持 `2424baeafe3c4ac6e197e4c92feb8faf01eacdef2204aea49ad94cdb9e3a94e3`。

**第 2 轮阻塞与修复**

- 覆盖率回归：上一版 `example-whitelist.ts` 只在真实 SCN-008 Fixture 存在时覆盖 `directories`、`globs` 与 `prefixes` 分支；副本删除示例后，测试自造的 Fixture 又为空，导致分支覆盖率降至 100% 以下。现改为单测在受控临时根中构造非空删除 Fixture，显式覆盖目录、文件、glob、矩阵和前缀分支，不依赖真实 Fixture 是否仍在。
- browser 空声明：`SCN-OPENAPI-CONTRACT-021` 原来无论消费接口声明是否为空都要求 `expectedKeys.length > 0`。删除 Web 示例后声明合法为空，因此副本会失败。现与 integration 保持一致：声明为空时断言派生义务为空并结束，只有存在声明时才要求义务非空。
- 指南矩阵遗漏：Web 白名单缺少 `example-removal.json` 中 `matrices` 指向的 `SCN-OPENAPI-CONTRACT-021/openapi-matrix.json` 示例键。现由 Fixture 的 `matrices` 派生并核对，指南模板段的 `protocol-matrix` 键也同步保持；指南“示例用例另在 `packages/e2e/tests/example/**`”说明已放入 template-example 标记。
- 反例验证：在受控 Fixture 中加入非空目录、文件和 glob 后，指南缺少任一项都会报 `missing removal whitelist entry`；矩阵条目缺失同样使架构检查失败。browser 空声明分支以删除 Web 示例后的受控副本验证，原断言失败，修复后通过。

**受控冒烟**

- 从 `git ls-files` 复制工作区到 `/tmp/template-web-topology-smoke-vpv6x4`，按清单新增 `packages/player-api`、`packages/player-web` 和 `player-web-browser` 绑定；未修改门禁代码。
- `pnpm test:unit`：退出码 0，173 个文件、649 个用例全部通过。
- `pnpm exec vitest run --config packages/e2e/vitest.config.integration.ts` 下的目标 tooling 用例：退出码 0，8 个文件、21 个用例全部通过。
- 构建新增 OpenAPI 协议包后 `pnpm check:architecture`：退出码 0，0 条违规。
- 副本首次 `pnpm test:unit` 仅因合成新增包尚无覆盖率归属而使全局覆盖率未达 100%，没有拓扑或门禁断言失败；该结果不是业务或模板门禁失败。

**Review / Acceptance**

- 本轮未修改 proposal、specs、design 或 tasks 语义，也未执行任务 16 的任何演练。
- 验收方在新隔离副本中重跑“移除模板示例”演练后接受本节结果，Task 15 checkbox 已在 `f915e68` 勾选并提交。

### Task 16 历史阻塞修复（保留）

**规划与输入**

- 交叉复刻演练在按清单新增 `packages/web-idl` 与 `web-idl-browser` 后被模板自测的写死拓扑阻断；xueshan 纵切片在新增 `packages/player-api`、`packages/player-web` 与 `player-web-browser` 后又被相同模式阻断。
- 这些失败来自门禁测试读取真实仓库或临时复制真实清单时仍写死包名、绑定名、包数量、协议契约数量、目录布局或固定重定向调用次数，违反 AGENTS.md 的“门禁只从清单读取”和指南的“替换点地图”约定。Task 16 checkbox 保持未勾选。

**交叉复刻修复**

- `check-architecture`、`project-manifest`、`dependency-rules` 的期望值改为从 `project.manifest.json` 派生包、角色、模块根、绑定和巡航目标；受控临时根按清单复制全部包，不再只创建五个根包。
- `SCN-SCENARIO-GATE-029`、`SCN-BROWSER-PLATFORM-010`、`SCN-WEB-EXAMPLE-014`、`SCN-TEMPLATE-ENGINEERING-006/011/012` 等模板自测改为只检查自己负责的绑定或包事实，清单中额外出现的使用方产品包、协议包和绑定不会导致失败。
- `SCN-WEB-APP-012`、bundle Fixture 按清单选择需要构建或检查的 Web 产品与绑定协议；临时根构建不再假定唯一 Web 包或唯一 OpenAPI 包。
- `example-whitelist` 的 Web 示例派生不再遍历每个 Web 产品包生成 `trade-*` 白名单，已改为由 SCN-008 Fixture 派生；新增 Web 产品包不再要求同步模板示例条目。
- 新增受控清单反例：额外登记一个 Web 产品包和一条浏览器绑定后，修复前 `check-architecture`、`project-manifest`、`SCENARIO-GATE-029`、`BROWSER-PLATFORM-010` 均会失败，修复后通过。

**xueshan 纵切片修复**

- `scripts/api-contract.boundaries.test.ts` 的 redocly mock 从 `mockReturnValueOnce` 改为持续返回成功结果，并新增第二个 OpenAPI 协议包反例，确保所有登记的契约都经过 mock 边界，不再让第二次调用落到真实 redocly 而超时。
- `scripts/lib/dependency-rules.test.ts` 不再把工作区正则写死为 `(?:sdk|web)`，而是按清单中的产品包、协议包和测试包模块根派生；额外 `player-api`、`player-web` 与绑定参与反例断言。
- `SCN-OPENAPI-CONTRACT-001/002/003`、`SCN-WEB-EXAMPLE-014` 及 `SCN-TEMPLATE-ENGINEERING-006/011/012` 的临时根现在按真实清单复制包和契约，不再出现新增包缺失导致的 ENOENT 或“清单无效”。
- `packages/e2e/src/preview/dev-remote.test.ts` 不再只删除 `web` 目录，而是从清单找出所有 `form: web-app` 产品；反例验证多 Web 产品时无 Web 绑定路径仍可按清单工作。
- `SCN-SCENARIO-GATE-018` 与 `SCN-SCENARIO-GATE-008` 的失败随临时根清单/契约完整性修复后不再复现；没有通过放宽超时或跳过用例掩盖问题。

**Verification**

- 真实工作区最终运行 `SCENARIO_GATE_CHANGES=template-web-absorption pnpm check:fast`：退出码 0；默认并发下 unit、96 个普通 integration 文件、7 个 integration-heavy 文件与 13 个重型用例、构建、typecheck、架构和打包/产物检查全部通过。
- 最终定向复核：本轮相关 unit 8 个文件、36 个用例通过；相关 tooling integration 13 个文件、28 个用例通过；`pnpm test:e2e:browser` 4 个文件、20 个用例通过，其中实际执行了 `SCN-OPENAPI-CONTRACT-021/openapi-matrix`。
- 受控副本冒烟：新增一个 Web 产品包、一个 OpenAPI 协议包和一条绑定后，`pnpm test:unit` 173 个文件、649 个用例通过；目标 tooling integration 8 个文件、21 个用例通过；构建协议包后 `pnpm check:architecture` 为 0 违规。
- 所有新增反例均在修复前实际失败、修复后通过；没有减少用例、断言或测试项目，也没有修改 proposal、specs、design、tasks 或 archive。
- freshness 复核为 `PASS`，digest `2424baeafe3c4ac6e197e4c92feb8faf01eacdef2204aea49ad94cdb9e3a94e3`。

**已知风险（只登记，不修）**

- OpenAPI 测试适配器不读取路径级 `parameters`，只取 `security[0]`；`nullable + allOf` 不接受 `null`；契约声明的额外信封字段会被拒绝。
- F7 已部分收窄：`preview-local.ts` 改为按清单寻找可提供 `shadow-routes.ts` 的协议包；多协议时仍选择第一个可用包，`dev:remote` 仍选择第一个 Web 应用，复用或替换时需同步调整。
- `check:fast` 会按协议包数量重复执行 `api:validate` 与 `api:status`，多协议清单会增加重复校验时间。
- 架构文档仍称可按 `tests/<绑定名>/` 推断绑定，但当前注册期必须显式填写 `binding`；文档与实现的这一差异继续登记。
- 指南尚未说明重型 integration 用例会复制工作区，运行中编辑源文件可能污染其副本或结果。

**追加修复（A/B，2026-10-14）**

**A. Web 首业务替换顺序例外**

- 指南「移除模板示例」已写明：Web 侧第一个业务直接替换 `packages/openapi/contracts/trade-v1.yaml` 时，允许在同一次提交完成契约替换与 Web 示例删除，不要求先基于旧示例单独跑通一次完整门禁。
- 「替换点地图·协议来源」已同步该例外；只修改指南，没有改 proposal、specs、design 或 tasks。

**B. 移除 `sdk-idl-weapp` 后的去写死**

- 项目清单、依赖规则、架构检查、公开文档发现、协议适配器、临时仓库复制与场景门禁 helper 改为按清单中的全部包和绑定派生；只在受控清单中构造所需的最小包，不再复制真实清单后假定五种根包仍存在。
- `SCN-TEMPLATE-ENGINEERING-001` 在没有 `sdk` 形态产品与绑定协议时执行空条件断言，不再在模块加载时假定 `sdk-idl-weapp` 必然存在；有 SDK 时仍执行原 ESM/CJS/类型声明/打包消费检查。
- `SCN-TEMPLATE-ENGINEERING-005/006/009/011/012`、`SCN-SCENARIO-GATE-026/029/030`、`SCN-OPENAPI-CONTRACT-027`、`SCN-WEB-EXAMPLE-facts`、spec inventory 与通用门禁自测的 Fixture/期望值改为与当前清单或受控输入一致，不再要求已删除的 SDK、IDL 包或 weapp 项目仍存在。
- `ENG-005/no-hardcoded-topology` 从只检查每种角色第一个包改为扫描全部包，并据此修掉 `scripts/preview-local.ts` 对 `packages/openapi` 与示例接口的写死；预览路由现在从清单中支持 `shadow-routes.ts` 的协议包发现。
- `example-whitelist` 在 SCN-008 Fixture 不存在时不再要求指南保留 Fixture 原文；删除绑定后的增量 unit 回归证明此项不会再阻塞。
- 反例使用全新隔离副本 `/tmp/sdk-template-unbind-smoke.phgIFh`，只保留 `web-openapi-browser` 一条绑定，清单中没有 `sdk`、IDL `protocol` 与 weapp 项目。副本严格按指南删除绑定独占内容，没有修改任何事实核验用例或公共辅助模块。
- 冒烟副本 `pnpm test:unit` 退出码 0：118 个文件通过、3 个跳过，418 个用例通过、15 个跳过，四项覆盖率均为 100%。`SCENARIO_GATE_CHANGES=template-web-absorption pnpm test:integration` 退出码 0：普通 integration 72/72 文件、141/141 用例，heavy 6/6 文件、11/11 用例；未运行 weapp。

**追加 Verification**

- 最终源码执行 `SCENARIO_GATE_CHANGES=template-web-absorption pnpm check:fast` 退出码 0：unit 144/144 文件、579/579 用例且覆盖率 100%；普通 integration 96/96 文件、176/176 用例；heavy 7/7 文件、13/13 用例；构建、typecheck、架构、Fixture、覆盖率、打包、bundle 与 component-tree 均通过；未运行 weapp。
- 首轮 `check:fast` 曾发现 `scripts/lib/dependency-rules.test.ts` 格式未同步，SCN-008 副本又发现 `dependency-rules.cjs` 超过 300 行上限与 `SCN-TEMPLATE-ENGINEERING-001` 的闭包窄化 typecheck 错误；修正后单跑 SCN-008 为 2/2 通过，最终完整 `check:fast` 全绿。
- 主工作区与冒烟副本均没有减少用例、断言或测试项目；未修改 `openspec/changes/archive/`，没有运行 weapp、开发者工具或完整 `pnpm verify`。

**Review / Acceptance**

- 本轮未执行 Task 15/16 的正式演练，也未勾选 Task 15、Task 16 的 checkbox；绑定删除冒烟仅用于验证模板侧去写死，不作为演练验收结论。
- 由验收方在修复提交后的新隔离副本中重跑 Task 15 示例删除、交叉复刻、xueshan 纵切片和移除绑定演练。

**Commit**

- `fix(template): unblock example removal and cross replication rehearsals`

### Task 16 复刻演练、移除绑定与最终验收

**规划与输入**

- 本任务消费五份无上下文 Agent 演练记录与验收方补跑日志：
  - 支付 SDK：`/private/tmp/claude-501/-Users-liyongning-Projects-workspace-sdk-template/f9f56b99-68ab-4be9-a947-7e43849bb047/scratchpad/drill-records/pay.md`，副本 `drill-r3-pay/repo`，全量日志 `final-pay.log`。
  - xueshan 纵切片：第 3 轮 `xs-r3.md` 记录阻塞；第 4 轮 `xs-r4.md`、副本 `drill-r4-xs/repo`、全量日志 `final-xs.log`。
  - 交叉复刻：`cross.md`、副本 `drill-r3-cross/repo`、全量日志 `final-cross.log`。
  - 移除一条绑定：`unbind.md`、副本 `drill-r3-unbind/repo`、演练日志 `drill-r3-unbind/verify17.log`。
  - 示例删除：`w14.md`、副本 `drill-r3-w14/repo`、全量日志 `final-w14.log`。
- freshness 在修改前后均为 `PASS`，digest 为 `3a9dec29eb49f620a46db1644eb7e399ef94b14fa7f93e71e08039096e1dafa5`。未修改 proposal、specs、design、tasks 语义，未修改 `openspec/changes/archive/`。

**五个隔离副本的完整验收**

- 支付 SDK 任务（SDK + IDL + 小程序）在验收方补充 `removal-expected.ts` 的 `de25fbe..9e9eab5` 同文件修复后，`pnpm verify --change add-payment-sdk --run-id final-pay` 退出码 0：`check:fast` 652492ms、`test:e2e:weapp` 441563ms、`test:e2e:browser` 36173ms、`check:scenarios` 1971ms，场景问题 0。该补丁只用于让早于 `9e9eab5` 的演练提交具备后续模板的 `cliEvidence` 推导能力。
- xueshan 第 3 轮在旧提交上因引擎与拓扑问题阻塞；暴露的问题已由 `2953a52`、`9e9eab5` 修复。第 4 轮基于 `2953a52`，替换产品契约后没有修改任何引擎或门禁代码，`pnpm verify --change game-slice --run-id final-xs` 退出码 0：`check:fast` 662577ms、`test:e2e:weapp` 380984ms、`test:e2e:browser` 53453ms、`check:scenarios` 2071ms，场景问题 0。`FLOW-TEMPLATE-EXAMPLE-001/weapp-normal` 首次 30009ms 超时，按逐文件重试重新 prepare 后 9584ms 通过，按通过计。
- 交叉复刻（Web 应用 + IDL + 浏览器）`pnpm verify --change web-idl-trade --run-id final-cross` 退出码 0：`check:fast` 488300ms、`test:e2e:weapp` 127039ms、`test:e2e:browser` 12877ms、`check:scenarios` 2061ms，场景问题 0。
- 移除 `sdk-idl-weapp` 绑定的演练 `pnpm verify --change remove-sdk-idl-weapp-binding --run-id drill-r3-v17` 退出码 0，无 weapp 步骤；`check:fast` 842315ms、`test:e2e:browser` 56803ms、`check:scenarios` 2338ms，场景问题 0。
- 同时删除 `template-example` 与 `web-example` 的示例删除演练 `pnpm verify --run-id final-w14` 退出码 0：`check:fast` 447588ms、`test:e2e:weapp` 127166ms、`test:e2e:browser` 8895ms、`check:scenarios` 1619ms，场景问题 0。

**猜测记录分类**

| 演练 | 猜测 | 分类 | 处理 |
|---|---|---|---|
| 支付 SDK | 1–10、12：支付字段、错误码、结果形态、FLOW、替身注入等 | 合理的自主判断；其中 weapp 渠道替身限制属于已知风险 | 保留在演练记录；不改规划语义 |
| 支付 SDK | 11：用 `TEMPLATE_UNIT_MAX_WORKERS` 控制嵌套 unit 并发 | 指南缺失需修订 | 已在本任务写入“从方案到验收” |
| xueshan 第 4 轮 | 1、2、4、9、10、11：切片范围、身份存储、阶段语义、来源标签、文案与 Fixture 封装 | 合理的自主判断 | 不属于模板缺口 |
| xueshan 第 4 轮 | 3：Web 页面行为应落 browser、模块逻辑落 unit | 指南缺失需修订 | 已在“从方案到验收”写明 |
| xueshan 第 4 轮 | 5：`security[0]` 限制 | 模板限制/已知风险 | 已在下方风险登记，不在 Task 16 扩大范围 |
| xueshan 第 4 轮 | 6、7：其他 Redocly 规则与 `schemaNormalizers` 精确登记 | 指南缺失需修订 | 已在“协议来源”补规则类别、执行顺序、精确登记警告与最小示例 |
| xueshan 第 4 轮 | 8：从历史恢复被 Web 白名单删除的通用辅助 | 已知风险 | 已在下方风险登记 |
| 交叉复刻 | 1–6：新增产品包、测试 include、矩阵、浏览器近似取证与 Spec 边界 | 合理的自主判断；IDL browser-runner 限制属于已知风险 | 保留在演练记录 |
| 交叉复刻 | 7：`TEMPLATE_UNIT_MAX_WORKERS` 与 `openspec/config.yaml` | 前者为指南缺失、后者为工具已知风险 | 前者已修订；后者已登记 |
| 移除绑定 | 1–10：IDL 独占文件、命令、发布入口、Spec 清理与 MODIFIED 顺序 | 多数为合理判断；遗漏项已转为指南修订或已知风险 | 指南删除清单和 OpenSpec 限制已同步；唯一 SDK 发布入口风险已登记 |
| 示例删除 | 1–6：`scripts/` 标记、`.vue` 标记、Spec 正文、空矩阵、负载超时与等待节奏 | 1 已补指南“全仓库”；其余为已覆盖边界、合理判断或已知风险 | 不扩大范围 |

**事实核验用例与指南缺口**

- 移除绑定演练发现两处事实核验缺口：`SCN-TEMPLATE-ENGINEERING-005/digest-inputs-cli` 假定 `protocolInputs[0]` 一定在源码目录外；`removal-expected.ts` 不识别 `cliEvidence` 声明的用例。两者已分别在 `2953a52` 修复并把反例纳入自测。
- `packages/protocol/testing/bootstrap.test.ts` 当前以 `existsSync` 探测可选的 weapp 驱动；删除 weapp 后不会因直接读取被删文件而失败。本任务复核无需再改。
- 第 3 轮演练暴露的写死拓扑已由 Task 14 的派生改造修复：临时根按清单复制或使用受控清单，场景门禁不再要求固定 `sdk-idl-weapp`，OpenAPI/协议包自测遍历清单中的全部协议包。新增反例覆盖多一个 Web 产品包、OpenAPI 协议包和绑定，以及只保留 `web-openapi-browser` 的删除绑定状态。

**本任务修订项**

- `SCN-OPENAPI-CONTRACT-029/neutral-and-valid`：RED 在受控副本的产品侧路径加入 `products/xueshan/contract.yaml` 后，旧实现扫描整个仓库并稳定失败；GREEN 后只校验引擎契约并只扫描引擎测试契约目录，原仓库与反例副本均通过。定向 `pnpm exec vitest run --project integration packages/e2e/tests/tooling/SCN-OPENAPI-CONTRACT-029.spec.ts` 为 1/1 文件、1/1 用例通过。
- 指南“协议来源”已写明 `schemaNormalizers` 接收内置规范化后的 schema、不可按 `nullable` 一刀切、应精确按 schema/字段登记，并列出 `info-license`、`no-required-schema-properties-undefined`、`no-invalid-media-type-examples` 的处理流程和最小示例。
- 指南“从方案到验收”已登记 `TEMPLATE_UNIT_MAX_WORKERS`、负载类超时的单文件复跑判定，以及 Web 页面行为落 browser、模块单测落 unit；新增“新增一条绑定”章节，覆盖包骨架、清单、两个 Vitest include、AGENTS、能力地图和 `tests/<绑定名>/` 目录推断。
- `TEMPLATE_UNIT_MAX_WORKERS` 已加入指南环境变量白名单。先改测试加入允许变量，旧实现退出码 1 并报 `unknown environment variable TEMPLATE_UNIT_MAX_WORKERS`；加入白名单后定向 unit 10/10 通过，`pnpm check:architecture` 退出码 0（206 个模块、532 条依赖、issues 为空）。

**xueshan 62 条反馈核对表**

| # | 判定 | 证据或排除理由 |
|---|---|---|
| 1 | 未复现 | 五份演练均使用 `--change` 限定作用域，支付与 xueshan 的多 active Change 状态未污染对账。 |
| 2 | 未复现 | 演练从既有 OpenSpec 根起步，Fixture 与归档来源均通过最终门禁。 |
| 3 | 未复现 | 支付与 xueshan 修改协议输入、构建输入后 `check:fast` 全绿。 |
| 4 | 未复现 | 交叉复刻新增 `web-idl-browser` 测试项目，未修改门禁平台名。 |
| 5 | 排除 | IDL 网关头替换点问题已由核心 Change 去写死覆盖。 |
| 6 | 未复现 | xueshan 第 4 轮 `.vue` 覆盖率四项均为 100%。 |
| 7 | 排除 | 视觉验收按用户决定单独立项。 |
| 8 | 未复现 | 版本对齐章节已形成约定，支付与 xueshan 搭包后门禁通过。 |
| 9 | 未复现 | 脚手架与成熟方案优先规则已写入模板执行规则。 |
| 10 | 未复现 | 初始化与适配评估顺序已在指南明确，演练按该顺序完成。 |
| 11 | 未复现 | schema 忽略项已由指南说明；演练未因 schema 文件静默缺失失败。 |
| 12 | 未复现 | 反馈日志要求已改为只登记实际遇到并核实的问题。 |
| 13 | 未复现 | 支付与 xueshan 的 Shadow 请求记录、未注册路由与场景问题均为 0。 |
| 14 | 未复现 | 协议义务 `requiredIn` 从清单测试项目派生，新增 browser 后门禁通过。 |
| 15 | 未复现 | xueshan 路径参数按产品契约正确进入 Shadow 与矩阵。 |
| 16 | 未复现 | 全量 `format:check` 在五个副本均通过。 |
| 17 | 排除 | 项目自身把覆盖率 glob 挪进 scripts 引发，属项目代码。 |
| 18 | 未复现 | 副本归档和来源路径变化后 `check:fixtures` 通过。 |
| 19 | 未复现 | 交叉与移除绑定演练按清单处理自定义包，没有写死包名复制错误。 |
| 20 | 未复现 | 门禁自测使用受控输入，不再依赖仓库中的未完成 Branch。 |
| 21 | 未复现 | xueshan 的 Web 产物按模块检查测试设施，`check:bundle` 通过。 |
| 22 | 未复现 | `.vue`、构建配置与 lock 变化均进入摘要，证据无假新鲜。 |
| 23 | 未复现 | Web 资源与构建输入纳入摘要，产物模块对账通过。 |
| 24 | 未复现 | 状态分层文档与全量格式化一致。 |
| 25 | 未复现 | 示例删除后没有 FLOW 的覆盖率分支仍由受控输入覆盖，门禁全绿。 |
| 26 | 未复现 | presence 联合分支判定已有正反例，xueshan 第 4 轮未出现待定或 TypeError。 |
| 27 | 未复现 | 一个 Fixture 文件多个信封的声明与同形校验通过。 |
| 28 | 未复现 | 联合类型内联成员与同名字段的注释锚点已被门禁覆盖。 |
| 29 | 未复现 | 消费接口单一来源与依赖规则兼容，交叉复刻架构检查通过。 |
| 30 | 排除 | 项目自身代码问题，不属于模板。 |
| 31 | 未复现 | `SuccessData` 不再推导为 `never`，xueshan 产品适配器类型检查通过。 |
| 32 | 排除 | 项目自身代码问题，不属于模板。 |
| 33 | 排除 | 空 Fixture 目录报错可当场定位，摩擦可见，按筛选标准不吸收。 |
| 34 | 未复现 | Vue ESLint 配置支持项目所需组件命名，xueshan lint 通过。 |
| 35 | 排除 | 新增请求回填既有 Fixture 可在门禁当场暴露，按筛选标准不吸收。 |
| 36 | 未复现 | 模块根装配方式已有明确规则，xueshan 依赖检查通过。 |
| 37 | 未复现 | 不可达分支按可辨识联合与纯函数改写，覆盖率 100%。 |
| 38 | 未复现 | 互斥条件已按反馈方式改写，组件分支覆盖通过。 |
| 39 | 未复现 | `aria-disabled` 的真实交互行为已写入 browser AGENTS 并用于用例。 |
| 40 | 排除 | 项目业务代码问题，不属于模板。 |
| 41 | 排除 | 项目业务代码问题，不属于模板。 |
| 42 | 未复现 | xueshan 的真实时间轮询由 Shadow 记录和门禁验证，未出现固定步数冲突。 |
| 43 | 未复现 | 点击自动滚动的影响已写入 browser AGENTS，xueshan 滚动断言通过。 |
| 44 | 排除 | 门禁能当场暴露缺断言，摩擦可见，按筛选标准不吸收。 |
| 45 | 未复现 | `fill` 清空路径的真实按键行为已写入 browser AGENTS。 |
| 46 | 未复现 | 非场景数据集使用 `_datasets/`，xueshan 数据集门禁通过。 |
| 47 | 未复现 | 浏览器宿主校验 dist 新鲜度，过期产物会明确失败。 |
| 48 | 未复现 | 多信封 Fixture 契约同形已支持，xueshan `check:fixtures` 通过。 |
| 49 | 排除 | 使用方已撤回，不计入模板反馈。 |
| 50 | 未复现 | 占位资源域名由驱动拦截并兑现本地资源，图片用例通过。 |
| 51 | 排除 | 请求合并与等待窗口属用例时序判断，门禁能当场暴露，按筛选标准不吸收。 |
| 52 | 未复现 | 编译 CSS 的 `:deep(` 残留会被 `check:bundle` 拦截，xueshan 通过。 |
| 53 | 未复现 | 轮询形态由 Shadow 记录，xueshan 第 4 轮无 `unexpected request`。 |
| 54 | 未复现 | ESLint 已忽略 `.local/`，xueshan lint 通过。 |
| 55 | 未复现 | dist 新鲜度已在应用宿主校验，browser 用例未验旧产物。 |
| 56 | 未复现 | scroll anchoring 已写入 browser AGENTS，xueshan 浏览器用例通过。 |
| 57 | 未复现 | 宿主显式绑定 `127.0.0.1` 与随机端口，xueshan browser 全绿。 |
| 58 | 未复现 | 执行但未声明的 checkpoint 会被门禁报出，最终场景问题为 0。 |
| 59 | 未复现 | 示例替换后的文档引用已同步，架构与文档链接检查通过。 |
| 60 | 未复现 | OpenSpec 归档限制已写入指南，示例删除与移除绑定演练完成。 |
| 61 | 未复现 | 共享平台适配器的纯逻辑/装配分层已明确，依赖检查通过。 |
| 62 | 未复现 | Fixture 来源与生效 Spec 的身份核验通过，归档路径无悬空来源。 |
| FCR2-I1 | 未复现 | 产品新增消费接口会派生义务；支付演练的 `CreateTradePay` 证据通过。 |

**只登记、不修的已知风险**

- OpenAPI 执行器与矩阵身份只取 `security[0]`；多个 apiKey 方案二选一时仍需装配层映射，来源 xueshan 第 4 轮。
- 响应信封校验的 `error_detail`、`extra` 等额外字段未改为从契约 `Envelope.properties` 派生，来源 xueshan 第 4 轮。
- `preview-local.ts` 打印的示例 token/merchant 地址仍是固定提示，来源支付与 xueshan 演练。
- Web 示例白名单会删除 `poller`、`generation`、`runtime` 等通用辅助；使用方需从历史恢复并自行补测，来源 xueshan 第 4 轮。
- Fixture manifest 必须写 `protocol`，形似信封的字段会要求认领；错误可由 `check:fixtures` 当场发现，来源 xueshan 第 4 轮。
- IDL 浏览器证据的 `provider-timeout`、`codec-error` 只能近似取证，来源交叉复刻。
- lint 会把 `use` 开头的局部变量误报为组合式函数命名，来源交叉复刻。
- `requestFields` 的 `authority` 对象字面量注意事项仍埋在使用说明长段落中，来源交叉复刻。
- `openspec new change` 会生成 `openspec/config.yaml`，来源交叉与 xueshan 演练。
- 仓库副本 helper 会剥离 `VITEST*`，`VITEST_MAX_WORKERS` 在副本内失效；`TEMPLATE_UNIT_MAX_WORKERS` 已补文档，但 integration-heavy 没有通用降并发开关。
- 唯一 `sdk` 形态产品包删除后，发布模块如何处理仍未说明，来源移除绑定演练。
- 高负载下重型 integration、副本内 `api:validate` 和 60 秒 unit 仍可能时败时过；按单文件复跑通过并与 OI 分开统计。

**OI 与时败时过**

- Task 16 新增“按需通过但全量失败”的 OI 为 0。本任务的最终全量结果为 exit 0；此前五份副本全量也均为 exit 0。
- xueshan 第 4 轮 `FLOW-TEMPLATE-EXAMPLE-001/weapp-normal` 首次 30 秒超时、逐文件重试通过，登记 1 次“时败时过”，不计 OI。
- Task 16 最终全量中 `packages/e2e/tests/weapp/example/SCN-TEMPLATE-EXAMPLE-002.spec.ts` 首次在 30.49s 后失败，按 verify 的 per-file-retry 机制重新 prepare 并执行，第二次以约 9.68s 通过；首次失败发生在 30s 单例预算边界附近，终端长输出截断了具体错误文本，重试结果和最终步骤结果均按通过计，登记 1 次“时败时过”，不计 OI。
- 支付、交叉、移除绑定和示例删除演练中的超时均发生在外部副本与高负载时段，单独复跑或逐文件重试通过；作为演练执行噪声记录，不计 OI。

**最终全量**

- 在最终源码上执行 `pnpm verify --change template-web-absorption --run-id template-web-absorption-apply-task16-20261015T114035Z`：退出码 0。
- 各步结果：`check:fast` 通过（989244ms）、`test:e2e:weapp` 通过（372361ms）、`test:e2e:browser` 通过（36659ms）、`check:scenarios` 通过（2091ms）。
- 使用同一 run id 独立执行 `VERIFY_RUN_ID=template-web-absorption-apply-task16-20261015T114035Z pnpm check:scenarios --change template-web-absorption`：退出码 0，`issues` 为 0。
- 该轮 `SCN-TEMPLATE-EXAMPLE-002` 的首次失败与 per-file retry 已在上节登记；最终没有步骤非零退出，不新增 OI。

### Final Code Review 第 2 轮（增量）

Task 14 的 checkbox 已按评审结论重新取消勾选；本轮只修复已准入 blocker 与指南事实，不改 proposal、specs、design、tasks 的语义。初始 HEAD 为 `2ecf5b9`。

**四轴准入**

| Finding | Severity | Technical Validity | Attribution | Scope | Blocking | Disposition |
|---|---|---|---|---|---|---|
| FCR2-1 校验器缓存串用契约 | Critical | confirmed：模块级 `Map` 仅以 `operation.id:status` 为键，两份同 operationId 契约复用先编译 validator | introduced | in_scope：OAS-04 要求按契约来源接收运行时契约，OAS-06 要求严格同形 | blocking | admitted_blocker |
| FCR2-2 解引用 bundle 的组件钩子无效 | Important | confirmed：真实 `contract.bundle.json` 为 `--dereferenced`，响应根内联，原指南按 `title === 'Trade'` 无法命中；钩子只改 `$defs` 也不会影响已内联响应 | introduced | in_scope：OAS-06 要求产品侧钩子修正组件 schema 且无需改引擎代码 | blocking | admitted_blocker |
| FCR2-3 矩阵无条件编排 `data:null` | Important | confirmed：`matrixScenario`/`matrixPlan` 与浏览器断言按固定偏移编排 nullable 步骤 | introduced | in_scope：OAS-05 禁止对象 data 生成 null，WEX-09 要求替换契约无需改测试设施 | blocking | admitted_blocker |

**RED 证据**

- FCR2-1：在 `packages/openapi/testing/schema.test.ts` 加入同 operationId、响应 `data` 分别为 string/integer 的两份运行时契约。修复前 `pnpm exec vitest run --config packages/openapi/vitest.config.ts packages/openapi/testing/schema.test.ts -t "response validators are isolated"` 失败：`expected '' to contain 'data'`，证明第二份契约复用了第一份 validator。
- FCR2-2：在同一用例中用真实 `productContract().bundle` 和旧指南的 `title === 'Trade'` 骨架构造产品载体校验器。修复前 `SCN-OPENAPI-CONTRACT-022` 失败：`createTrade: $/data/amount must be integer`，证明解引用响应根上的组件修正未生效。
- FCR2-3：在 `SCN-OPENAPI-CONTRACT-017/matrix-samples` 加入 `data` 为不可空对象的受控契约，修复前期望 4 个 Shadow 响应但实得 5 个，证明无条件追加了 `data:null`。

**GREEN 修复与证据**

- FCR2-1：`validatorFor` 的无 hooks 缓存改为以实际 `OpenApiOperationContract` 对象为键的 `WeakMap`，同进程内不同契约不再串用；hooks 路径继续每次编译，避免钩子或契约漂移复用旧 validator。定向 `openapi-unit` 全量为 16/16 文件、56/56 用例通过，`schema.ts` 覆盖率 statements/branches/functions/lines 均 100%。
- FCR2-2：指南“协议来源”改为说明产品 bundle 由 `api-contract.ts --dereferenced` 生成，不应依赖组件名或 `title`；钩子在响应根上递归处理内联子 schema，并按稳定字段或 `x-` 标记精确定位。`SCN-OPENAPI-CONTRACT-022/hook-extensible` 使用真实产品 bundle 证明：无钩子时 `amount: 'x'` 被拒，产品钩子递归修正后通过，引擎载体仍被拒；原 `$ref` 根/组件调用与引擎侧无钩子的断言继续保留。
- FCR2-3：矩阵结果布局提取到 `openapi-obligation-matrix-layout.ts`，由成功响应 data schema 解析 `nullable`、`type: null`、`enum: null`、`oneOf`/`anyOf` 与 `allOf`；不可空时从客户端计划、Shadow 响应序列、浏览器结果切片和请求记录切片中同步移除 nullable 步骤，避免固定偏移错位。受控契约新增可空对象与不可空对象反例；现有产品契约仍保留 nullable 步骤。定向 `test-tools-unit` 全量为 94/94 文件、380/380 用例通过，新布局模块四项覆盖率均 100%；矩阵 integration 为 1/1 文件、3/3 用例通过；浏览器 `openapi-wire.browser.spec.ts` 为 1/1 文件、8/8 用例通过。
- `pnpm typecheck` 退出码 0；`pnpm lint` 退出码 0（仅保留仓库既有 Vue 格式 warning，无 error）。

**只登记、不修（Minor）**

- M4：`packages/openapi/testing/contract.ts` 的 `engineContract` 直接调用共享 `normalizeStandardContractConventions`，没有经 `testing/engine/conventions.ts` 的 `normalizeContractConventions` 包装；当前两实现等价，保留为一致性风险。
- M5：`packages/openapi/testing/adapter.ts` 的 `responseValidator(directOperation)` 路径未传 `schemaNormalizers`；当前仅测试内部路径使用，产品/引擎 manifest 路径已传。
- M6：`adapter.ts` 对仅含 `id` 的 meta 先查引擎契约；`ast.ts resolveOpenApiDeclaration` 与 `fixture-check.ts checkOpenApiFixture` 的缺省载体仍为 engine，当前生产调用方均显式传入。
- M7：规范化钩子对全部组件调用，而非只调用响应实际引用的组件；当前契约规模下无错误，仅存在额外计算与副作用面。
- M8：`hook-extensible` 未覆盖真实“约定模块导出 → 适配器模块加载”链；本轮只覆盖真实解引用 bundle 与注入钩子，模块加载仍由 `contract-branches.test.ts` 的 mock 覆盖。

**全量验证（FCR2 修复）**

- 在 DevTools 空闲后执行 `pnpm verify --change template-web-absorption --run-id template-web-absorption-apply-task14-fcr2-20261015T1235Z`：整体退出码 0。
- 各步结果：`check:fast` 退出码 0（814634ms），其中 unit 149/149 文件、608/608 用例通过，`check:fixtures` 检查 73 个 manifest 且 issues 为空，integration 92/92 文件、152/152 用例通过，integration-heavy 14/14 文件、40/40 用例通过；`test:e2e:weapp` 退出码 0（313468ms，5/5 用例通过）；`test:e2e:browser` 退出码 0（35301ms，4/4 文件、20/20 用例通过）；`check:scenarios` 退出码 0（1999ms，问题数 0）。
- 使用同一 run id 独立执行 `SCENARIO_GATE_CHANGES=template-web-absorption VERIFY_RUN_ID=template-web-absorption-apply-task14-fcr2-20261015T1235Z pnpm check:scenarios --change template-web-absorption`：退出码 0，问题数 0。
- 全量完成后使用正式版 CLI `quit` 正常退出 DevTools；除既有僵死 PID `40334` 外，`pgrep -fl wechatwebdevtools` 无其他进程。
- Task 14 已重新勾选并创建本轮修复提交。

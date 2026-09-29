# 模板示例与通用场景门禁实施计划

**Goal:** 把场景门禁改为通用门禁，并新增一个中立示例"资源创建与状态观察"，覆盖模板要保留的 A–G 各项能力，为后续删除支付业务做准备。

**Architecture:** 门禁从有效 Spec（主 Spec 加 active change）构建清单，先执行四条前置检查，再对账；三份格式 schema 是格式的唯一权威。示例位于 `packages/payment-sdk/src/example/`，按工厂 → 核心 → 端口 → 适配器分层，只经协议包公开入口与 generated 通信；Shadow 为其提供证据。

**Tech Stack:** 沿用仓库现有栈：pnpm workspace、Vite、Vitest、ESLint、dependency-cruiser、remark、Ajv、tsx、Express Shadow、miniprogram-automator。不新增依赖。

**Spec:** [scenario-gate](specs/scenario-gate/spec.md)、[template-example](specs/template-example/spec.md)、[payment-sdk delta](specs/payment-sdk/spec.md)、[设计](design.md)。

## Global Constraints

- 不删除、不改动支付业务代码及其测试。支付与示例共用的测试宿主与构建文件（`host/weapp/app.js`、`host/weapp/vite.config.ts`、`host/weapp/vite.live.config.ts`、`src/live/build.ts` 等）只允许只增不改的扩展，支付相关行为和产物保持不变；支付 Spec 只通过 delta MODIFIED SDK-14 搬入 FLOW 表，原文、场景和 verification 块逐字不变。
- 不修改 IDL、`proto-gen.yaml`、`proto-gen.lock`、包名、scope、registry；不实际发布。
- 示例代码、用例和 Fixture 不引用支付的 core、backend 适配器、contracts、测试用例或 Fixture；只可共用 `runtime/default` 与协议包公开入口。
- 格式约定以三份 schema 为唯一权威；Spec、Design、AGENTS 不另写字段定义。
- 手写代码四项覆盖率保持 100%；新代码包括门禁脚本与示例全部文件。
- 不新增依赖；若确需新增，先更新 Design 并重新评审。
- 本 Change 不做 Live 真实运行；示例的行为证据全部来自 Shadow。
- 长期生效的约定必须落在项目级载体上（AGENTS.md、schema、配置、脚本），载体清单见 Design 的"长期约定的项目级载体与 AGENTS 结构"；Change 文档不能是唯一出处。

## 每个任务的共同完成条件

1. Files 中列出的产物齐全，行为与所列 Requirement/Scenario 及 Design 决定一致。
2. `pnpm check:fast` 退出码为 0。
3. 本任务的 RED 已先失败、GREEN 后通过；Verification 中的命令与反例符合预期。
4. 支付基线等价（Design"支付基线等价验证"）成立：支付子集的清单与 case 义务与 `payment-inventory.json` 一致，对 `payment-coverage-input.json` 的对账输出与 `payment-coverage-output.json` 一致。本条不比较实时报告的执行数或通过数。示例场景在其实现任务完成前如实显示为缺口，不用 skip、空断言或缩小分母制造通过。
5. 在 `artifacts/<run-id>/tasks/task-<n>.md` 保存验收索引：实际命令与退出码、原始报告路径、方案与实际的差异、预期失败的反例单列。
6. 本任务引入的长期约定已写入 Design 载体清单所列的项目级文件，且 AGENTS 中通用规则位于"模板通用规则"部分、支付内容位于"当前业务：支付"部分。
7. 任务评审确认职责边界、断言与 Spec 一致后才勾选。

## Implementation Tasks

**Tracking rule:** One independently implementable and reviewable task maps to one unindented top-level checkbox. RED, GREEN, verification, and review steps are indented plain bullets, not additional tracked checkboxes.

- [x] 1. 门禁从有效 Spec 构建清单：来源发现、ID 配置与 FLOW 登记

  **Files**
  - Create `packages/e2e/tests/fixtures/SCN-SCENARIO-GATE-005/`（manifest.json、payment-inventory.json、payment-coverage-input.json、payment-coverage-output.json）：改造前用现有门禁生成的支付基线，`current` 指纹在输入中固定。
  - Create `scripts/lib/spec-sources.ts`、`scripts/lib/spec-sources.test.ts`：发现主 Spec 与 active change 的 delta，按 Requirement 合并。
  - Create `scenario-gate.config.json`、`scenario-gate.config.schema.json`（每个属性带中文 description）。
  - Create `scripts/lib/scenario-config.ts`、`scripts/lib/scenario-config.test.ts`。
  - Create `scripts/flow.schema.json`（每个属性带中文 description）。
  - Modify `scripts/lib/spec-inventory.ts`、`scripts/lib/spec-inventory.test.ts`：按配置匹配 ID；不合规的 Scenario 以标题占位保留在清单中；只登记 Requirement 正文内的 FLOW 表，逐行按 `flow.schema.json` 校验。
  - Modify `scripts/check-scenarios.ts`：改用 `spec-sources`，删除写死的归档路径。
  - Modify `scripts/lib/fingerprints.ts`、`scripts/lib/fingerprints.test.ts`：`specDigest` 覆盖 `spec-sources` 发现的全部文件。
  - Modify `scripts/check-fixtures.ts`、`packages/e2e/tests/fixtures/fixture.schema.json`：ownerId 格式改由配置校验。
  - Modify `packages/e2e/src/cases/define-case.ts` 及其测试：ownerId 只校验非空的大写 ID 形态。
  - Create `packages/e2e/tests/tooling/SCN-SCENARIO-GATE-002.spec.ts`、`SCN-SCENARIO-GATE-003.spec.ts`、`SCN-SCENARIO-GATE-005.spec.ts`、`SCN-SCENARIO-GATE-007.spec.ts`，以及对应 Fixture 目录（受控的临时 OpenSpec 根样例）。

  **Requirements / Scenarios**
  - GATE-02：SCN-SCENARIO-GATE-002
  - GATE-03：SCN-SCENARIO-GATE-003、SCN-SCENARIO-GATE-007
  - GATE-04：SCN-SCENARIO-GATE-005
  - payment-sdk：MODIFIED SDK-14（FLOW 表经 delta 合并后，支付 FLOW 集合不变）

  **Design Decisions**
  - Decision: 有效 Spec 的发现与合并
  - Decision: 前置检查与 ID 配置
  - Decision: 格式约定的归属：schema 为权威，AGENTS 指路，Spec 定义门禁行为
  - Decision: 支付基线等价验证

  **Interfaces**
  - Consumes: `openspec/specs/**`、`openspec/changes/*/specs/**`（不含 archive）、`scenario-gate.config.json`、现有运行报告。
  - Produces: `readEffectiveSpecs(root)` 返回合并后的 Requirement/Scenario/FLOW 及来源；`loadScenarioConfig(root)`；门禁输出新增问题类别（ID 缺失、ID 格式、ID 重复、FLOW 位置、FLOW 行格式、合并冲突）。

  **RED**
  - 改造前，先在当前代码上：以 `pnpm exec tsx scripts/check-scenarios.ts --inventory` 导出清单，过滤支付子集后保存为 `payment-inventory.json`；取一次真实运行的支付子集绑定与报告，连同固定写死的 `current` 指纹组成 `payment-coverage-input.json`，以 `pnpm exec tsx scripts/check-scenarios.ts --input <payment-coverage-input.json>` 运行，把输出保存为 `payment-coverage-output.json`。
  - 新增 `spec-sources.test.ts`（ADDED、MODIFIED、REMOVED、RENAMED、冲突、忽略 archive）、`scenario-config.test.ts`、`spec-inventory.test.ts` 中的 ID 与 FLOW 用例，以及 tooling 用例。运行 `pnpm exec vitest run --project test-tools-unit scripts/lib` 与 `pnpm exec vitest run --project integration packages/e2e/tests/tooling/SCN-SCENARIO-GATE-*`，预期因模块不存在或仍读取写死路径而失败。

  **GREEN**
  - 实现上述模块并接入 `check-scenarios`、`fingerprints`、`check-fixtures`。同一组命令通过。

  **Verification**
  - `pnpm check:fast` 通过。
  - `pnpm exec vitest run --project integration packages/e2e/tests/tooling/SCN-SCENARIO-GATE-005.spec.ts`：新门禁导出的支付子集清单与 `payment-inventory.json` 相等；对 `payment-coverage-input.json` 的 `--input` 输出与 `payment-coverage-output.json` 相等。
  - 反例：受控样例中缺 ID、ID 格式不符、重复 ID、FLOW 表位于 Requirement 之外、FLOW 行列数错误，各自非零退出并指出位置；从配置中移除某个格式后，对应 Scenario 报错而非被跳过。
  - `openspec validate template-example --strict` 通过。

  **Review / Acceptance**
  - 验收索引记录基线生成命令、基线摘要、改造后对比结果，以及每个反例的输出。
  - 评审确认门禁代码中不再出现具体 change、capability 或 Spec 路径。

  **Commit**
  - `feat(scenario-gate): build inventory from effective OpenSpec specs`

- [x] 2. 门禁前置检查、schema 字段说明与根 AGENTS 硬规则

  **Files**
  - Modify `scripts/check-scenarios.ts`、`scripts/check-scenarios.test.ts`：固定前置检查顺序（OpenSpec 存在 → ID → FLOW 位置与行格式 → verification 块），在读取报告前失败；新增"绑定引用未登记的 FLOW"检查。CLI 调用通过可注入的执行函数完成。`--input` 模式不执行任何前置检查，只做对账（含未知引用检查）；现有支付门禁用例及 `packages/e2e/tests/tooling/helpers.ts` 不做修改。
  - Modify `scripts/lib/spec-inventory.ts`：每个 Scenario 恰好一个 verification 块，多个块时报错。
  - Modify `scripts/verification.schema.json`：为每个属性补中文 description；`blockedBy` 元素放宽为非空字符串。
  - Create `scripts/lib/schema-docs.ts`、`scripts/lib/schema-docs.test.ts`：检查三份 schema 每个属性的 description，以及根 AGENTS.md 是否引用三份 schema 路径；接入 `scripts/check-architecture.ts`。
  - Modify `AGENTS.md`：拆为"模板通用规则"与"当前业务：支付"两部分；原支付条款与写死到归档 Change 的必读链接原样移入支付部分；通用"必读"改为 `openspec/specs/` 与 `openspec list`。通用部分新增"OpenSpec 硬规则"（四条规则，每条一句说明、schema 路径与最小示例，注明第 2 条格式沿用 Change Skill、第 3、4 条是项目扩展）与"场景门禁与归档"（读取哪些 Spec、ID 格式配置位置、归档必做事项）。
  - Modify `packages/payment-sdk/AGENTS.md`、`packages/payment-protocol/AGENTS.md`、`packages/e2e/AGENTS.md`：同样拆为两部分，原条款原样移入支付部分；`payment-protocol/AGENTS.md` 第 7 条改为"Shadow 路由按业务登记，支付登记 CreateTradePay/QueryTrade"。通用部分先留"按示例扩展新业务"标题，由 Task 3～6 填写。
  - Create `packages/e2e/tests/tooling/SCN-SCENARIO-GATE-001.spec.ts`、`SCN-SCENARIO-GATE-004.spec.ts`、`SCN-SCENARIO-GATE-006.spec.ts`、`SCN-SCENARIO-GATE-008.spec.ts` 及对应 Fixture。
  - Create `packages/e2e/tests/tooling/openspec-stub.ts`：在临时目录生成受控 `openspec` stub 并构造 `PATH` 的测试辅助；Modify Task 1 的全部 tooling 用例改用它。所有经过真实门禁 CLI 的 integration 用例都不得依赖本机安装的 `openspec`。

  **Requirements / Scenarios**
  - GATE-01：SCN-SCENARIO-GATE-001
  - GATE-03：SCN-SCENARIO-GATE-004
  - GATE-05：SCN-SCENARIO-GATE-006
  - GATE-06：SCN-SCENARIO-GATE-008

  **Design Decisions**
  - Decision: 前置检查与 ID 配置
  - Decision: 格式约定的归属：schema 为权威，AGENTS 指路，Spec 定义门禁行为

  **Interfaces**
  - Consumes: Task 1 的清单与配置；本机 `openspec` CLI。
  - Produces: 门禁在前置检查失败时不读取报告、不输出覆盖结论；`check:architecture` 新增 schema 文档完整性检查。

  **RED**
  - 新增单测与 tooling 用例：`--input` 模式在 CLI 不可用时仍完成对账、缺 `openspec/specs`、`PATH` 中无 `openspec`、缺 verification 块、多个 verification 块、schema 不合规、引用未声明的 checkpoint、绑定引用未登记的 FLOW、schema 属性缺 description、AGENTS 未引用 schema。运行 `pnpm exec vitest run --project test-tools-unit scripts` 与 `pnpm exec vitest run --project integration packages/e2e/tests/tooling/SCN-SCENARIO-GATE-00{1,4,6,8}.spec.ts`，预期失败。

  **GREEN**
  - 实现前置检查、多块检测、未知 FLOW 引用检查、schema 文档检查，补全 schema 描述并更新 AGENTS.md。同一组命令通过。

  **Verification**
  - `pnpm check:fast` 通过（含 `check:architecture` 的 schema 文档检查）；在 `PATH` 中不含 `openspec` 的 shell 中运行 `pnpm check:fast` 同样通过，证明它不依赖本机 CLI。
  - 支付基线等价成立（共同完成条件 4）；`pnpm check:scenarios`（需本机 CLI）中 scenario-gate 场景已有绑定，template-example 场景如实显示为缺口。
  - 每个反例各自非零退出，恢复后通过。

  **Review / Acceptance**
  - 评审核对 AGENTS.md 四条规则的措辞与示例能通过门禁本身的校验；三份 schema 的 description 准确描述约束。
  - 评审核对四份 AGENTS 中支付条款只移动未改写（`payment-protocol` 第 7 条除外），通用部分不含任何写死的 Change 路径；`pnpm check:architecture` 的链接检查通过。

  **Commit**
  - `feat(scenario-gate): enforce OpenSpec prechecks and document format schemas`

- [x] 3. 示例 SDK：公共契约、工厂、核心、端口、适配器与依赖规则

  **Files**
  - Create `packages/payment-sdk/src/example/contracts.ts`（中文 JSDoc）、`factory.ts`、`core/client.ts`、`ports/backend.ts`、`adapters/trade-backend.ts`，以及各自就近的 `*.test.ts`（module 用例，带 `meta.paymentCase` 绑定）。
  - Modify `packages/payment-sdk/src/index.ts`：导出示例类型、`createExampleClient`、`ExampleConfigurationError`。
  - Modify `.dependency-cruiser.cjs`：新增 `example-core-no-generated`、`example-no-payment`、`payment-no-example`。
  - Modify `eslint.config.js`：`packages/payment-sdk/src/example/{core,ports}/**` 禁用全局 `wx`。
  - Create `packages/e2e/tests/tooling/SCN-TEMPLATE-EXAMPLE-008.spec.ts`：三条依赖规则与 lint 规则各一个违规反例。
  - Create `packages/e2e/tests/tooling/SCN-TEMPLATE-EXAMPLE-007.spec.ts`：核心不引用交易枚举（`core-neutrality`）。
  - Modify `packages/payment-sdk/AGENTS.md`"按示例扩展新业务"：以 `src/example/` 为参照说明分层（工厂 → 核心 → 端口 → 适配器）、只有适配器接触 generated、业务之间互不导入、可共用的只有 `runtime/` 与协议包公开入口，并解释三条依赖规则与 `wx` lint 规则各自防止什么。`.dependency-cruiser.cjs` 与 `eslint.config.js` 中新规则的注释引用这一节。

  **Requirements / Scenarios**
  - EX-01：SCN-TEMPLATE-EXAMPLE-001（factory-validation）
  - EX-02：SCN-TEMPLATE-EXAMPLE-002（create-mapping）、SCN-TEMPLATE-EXAMPLE-003（create-error-mapping）
  - EX-03：SCN-TEMPLATE-EXAMPLE-005（observation-budget）、SCN-TEMPLATE-EXAMPLE-006（cancellation-rules）
  - EX-04：SCN-TEMPLATE-EXAMPLE-007（status-mapping-table、core-neutrality）
  - EX-05：SCN-TEMPLATE-EXAMPLE-008

  **Design Decisions**
  - Decision: 示例在 SDK 中的结构与公共契约
  - Decision: 中立模型到交易接口的映射
  - Decision: 观察循环、预算与取消
  - Decision: 依赖方向与 lint 规则

  **Interfaces**
  - Consumes: `@daqian/payment-protocol` 的 `createProtocolClient`、`createWechatMiniappHttp`、错误码目录、`Cancellation` 类型；generated `CreateTrade`、`QueryTrade`、`GoodsType`；`runtime/default`。
  - Produces: SDK 根入口的 `createExampleClient(options): ExampleClient`，以及 Design 中列出的公共类型。

  **RED**
  - 先写 module 用例：配置校验、输入校验、字段映射表（含条目级与整单级六个金额字段满足 IDL 的求和关系）、错误映射与 `retryable` 标记、状态映射（含 unknown）、引用不一致、观察循环（终态、窗口结束、单次超时后继续、预算与宿主取消的区分、单次结果闩锁、迟到响应丢弃）。运行 `pnpm exec vitest run --project sdk-unit packages/payment-sdk/src/example`，预期因模块不存在而失败。
  - 依赖规则反例：运行 `pnpm exec vitest run --project integration packages/e2e/tests/tooling/SCN-TEMPLATE-EXAMPLE-008.spec.ts`，预期在规则添加前失败。

  **GREEN**
  - 实现示例模块、根入口导出与依赖/lint 规则。同一组命令通过。

  **Verification**
  - `pnpm check:fast` 通过，示例全部文件覆盖率 100%，`check:package` 在不修改的情况下仍通过（示例代码进入产物，不含测试路径）。
  - `pnpm check:architecture` 与 `pnpm lint` 对合法代码通过，对四个反例各自失败。

  **Review / Acceptance**
  - 评审核对公共类型的中文 JSDoc 与 Spec EX-03 的语义表一致；示例目录中除 `adapters/trade-backend.ts` 外不出现交易字段名。

  **Commit**
  - `feat(payment-sdk): add neutral resource example client`

- [x] 4. 示例的 Shadow 路由与 integration 行为、FLOW 用例

  **Files**
  - Create `packages/payment-protocol/testing/shadow/example/routes.ts` 及 `routes.test.ts`（protocol-unit）。
  - Modify `packages/payment-protocol/testing/shadow/server.ts` 及测试：`createShadowServer` 增加可选 `routes`，默认值仍为支付路由。
  - Create `packages/e2e/tests/example/SCN-TEMPLATE-EXAMPLE-001.spec.ts`（node-import）、`-002`、`-003`、`-004`、`-005`、`-006`、`-009`（shadow-excluded）、`FLOW-TEMPLATE-EXAMPLE-001.spec.ts`。
  - Create `packages/e2e/tests/fixtures/SCN-TEMPLATE-EXAMPLE-00x/`、`FLOW-TEMPLATE-EXAMPLE-001/`（manifest.json 与 case 数据；`sources.spec.path` 指向本 Change 的 delta spec）。
  - Modify `packages/e2e/vitest.config.integration.ts`：include 纳入 `packages/e2e/tests/example/**/*.spec.ts`。示例的 weapp 用例放在 `tests/weapp/example/`（Task 5），不在该目录下，因此不会被 integration 项目收录。
  - Modify `packages/payment-protocol/AGENTS.md`"按示例扩展新业务"：说明如何为新业务登记 Shadow 路由（从 generated metadata 发现、传给 `createShadowServer({ routes })`），Shadow 引擎不写业务场景。
  - Modify `packages/e2e/AGENTS.md`"按示例扩展新业务"：说明 integration 用例、FLOW 用例、Fixture 目录与 manifest 的放置和绑定方式，以示例为参照。

  **Requirements / Scenarios**
  - EX-01：SCN-TEMPLATE-EXAMPLE-001（node-import）
  - EX-02：SCN-TEMPLATE-EXAMPLE-002（create-success，integration）、SCN-TEMPLATE-EXAMPLE-003（invalid-input、create-failures）
  - EX-03：SCN-TEMPLATE-EXAMPLE-004（observe-completed integration、observe-closed）、SCN-TEMPLATE-EXAMPLE-005（window-and-timeout）、SCN-TEMPLATE-EXAMPLE-006（host-cancel）
  - EX-06：SCN-TEMPLATE-EXAMPLE-009
  - EX-08：SCN-TEMPLATE-EXAMPLE-011（normal，integration）；FLOW-TEMPLATE-EXAMPLE-001（integration）

  **Design Decisions**
  - Decision: 协议 testing 与 Shadow
  - Decision: E2E 的布局与绑定

  **Interfaces**
  - Consumes: Task 3 的示例公共入口；Shadow step/fault/record 机制。
  - Produces: `discoverExampleRoutes()`；integration 报告中示例场景与 FLOW 的运行证据。

  **RED**
  - 先写 Shadow 路由单测与 integration 用例，运行 `pnpm exec vitest run --project protocol-unit packages/payment-protocol/testing/shadow` 与 `pnpm exec vitest run --project integration packages/e2e/tests/example`，预期因路由不存在而失败。

  **GREEN**
  - 实现示例路由与 `routes` 参数，补齐 Fixture 与 manifest。同一组命令通过；`pnpm check:fixtures` 通过。

  **Verification**
  - `pnpm check:fast` 通过；支付 integration 用例全部保持通过。
  - 支付基线等价成立；`pnpm check:scenarios` 中示例场景仅 weapp 与 Live/包消费相关 case 仍显示为缺口；FLOW-TEMPLATE-EXAMPLE-001 的 integration case 由同一连续运行证明。

  **Review / Acceptance**
  - 评审核对 Fixture 只包含中立语义所需的输入与响应序列，不复用支付 Fixture；FLOW 证据未拼接多个测试。

  **Commit**
  - `test(e2e): cover example client through shadow gateway`

- [ ] 5. 示例的 weapp 运行证据

  **Files**
  - Create `packages/e2e/host/weapp/example-runner.ts`。
  - Modify `packages/e2e/host/weapp/vite.config.ts`：在 `protocol-runner` 之外增加 `example-runner` 构建入口（只增不改）。
  - Modify `packages/e2e/host/weapp/app.js`：增加注册 `runExampleCase`，现有三个支付函数不变。
  - Modify `packages/e2e/src/drivers/weapp-host.test.ts`（`test-tools-unit`）：覆盖 `example-runner.ts` 与 `app.js` 的新增分支，`app.js` 保持 100% 覆盖。
  - Create `packages/e2e/tests/weapp/example/`：SCN-TEMPLATE-EXAMPLE-002（create-success）、SCN-TEMPLATE-EXAMPLE-004（observe-completed）、FLOW-TEMPLATE-EXAMPLE-001（normal）的 weapp 用例。现有 weapp include（`packages/e2e/tests/weapp/**`）已收录，不修改 `vitest.config.weapp.ts`。
  - Modify `packages/e2e/AGENTS.md`"按示例扩展新业务"：补充 weapp runner 与 weapp 用例的放置方式。

  **Requirements / Scenarios**
  - EX-02：SCN-TEMPLATE-EXAMPLE-002（weapp）
  - EX-03：SCN-TEMPLATE-EXAMPLE-004（weapp）
  - EX-06：weapp 通过真实 `wx.request` 访问 Shadow
  - EX-08：SCN-TEMPLATE-EXAMPLE-011 与 FLOW-TEMPLATE-EXAMPLE-001（weapp）

  **Design Decisions**
  - Decision: E2E 的布局与绑定
  - Decision: 协议 testing 与 Shadow

  **Interfaces**
  - Consumes: 现有 weapp driver 与本机微信开发者工具；Task 4 的示例 Shadow 路由与 Fixture。
  - Produces: weapp 报告中示例场景与 FLOW 的运行证据。

  **RED**
  - 先写 weapp 用例，运行 `pnpm test:e2e:weapp`，预期因 runner 不存在而失败。

  **GREEN**
  - 实现 `example-runner.ts`，同一命令通过。

  **Verification**
  - `pnpm check:fast` 通过；`pnpm test:e2e:weapp` 通过，支付 weapp 用例保持通过。

  **Review / Acceptance**
  - 验收索引记录开发者工具版本与运行环境；确认请求经真实 `wx.request` 发往 Shadow。

  **Commit**
  - `test(e2e): run example client in weapp`

- [ ] 6. 示例的 Live 页面、证据门禁与包消费，并完成全量验证

  **Files**
  - Create `packages/e2e/host/weapp/pages/live/example/`、`packages/e2e/host/weapp/live/example-controller.ts` 及测试。
  - Modify `packages/e2e/host/weapp/app.live.json`、`packages/e2e/host/weapp/live/config.ts`、`.env.live.example`：新增示例白名单键。
  - Modify `packages/e2e/host/weapp/vite.live.config.ts`：增加示例页面构建入口（只增不改）。
  - Modify `packages/e2e/src/live/evidence.schema.json`、`check-evidence.ts`、`build.ts`（`liveOutputFiles`/`liveSourceFiles` 加入示例页面）、`check.ts` 及测试：新增 `LIVE-TEMPLATE-EXAMPLE-001` 记录，拒绝包含支付调用的记录；支付 Live 页面的构建产物不变。
  - Create `packages/e2e/tests/example/SCN-TEMPLATE-EXAMPLE-010.spec.ts`（live-example-build、live-example-evidence）。
  - Modify `packages/e2e/AGENTS.md`"按示例扩展新业务"：补充 Live 页面、白名单配置与证据记录的扩展方式。
  - Create `packages/e2e/tests/example/SCN-TEMPLATE-EXAMPLE-001.package.spec.ts`（package-consumer）：按 Design"包与发布"打包两个产品包，在临时 ESM、CommonJS 消费工程中安装并调用示例导出，并用 `tsc --noEmit` 校验 `.ts`/`.cts` 类型消费。`scripts/check-package.ts` 及其测试不修改。

  **Requirements / Scenarios**
  - EX-07：SCN-TEMPLATE-EXAMPLE-010
  - EX-01：SCN-TEMPLATE-EXAMPLE-001（package-consumer）

  **Design Decisions**
  - Decision: Live 示例页面
  - Decision: 包与发布

  **Interfaces**
  - Consumes: Task 3 的生产 SDK 入口；现有 Live 构建与证据工具。
  - Produces: Live 构建产物中的示例页面；证据检查对示例记录的校验；包消费验证覆盖示例导出。

  **RED**
  - 先写 Live 构建、证据检查与包消费用例（包消费用例在示例导出存在前即失败），运行 `pnpm exec vitest run --project integration packages/e2e/tests/example/SCN-TEMPLATE-EXAMPLE-010.spec.ts packages/e2e/tests/example/SCN-TEMPLATE-EXAMPLE-001.package.spec.ts`，预期失败。

  **GREEN**
  - 实现页面、控制器、证据 schema 与检查，以及包消费用例。同一组命令通过；`TC-PAYSDK-CORE-014/016/017` 保持不变并通过。

  **Verification**
  - `pnpm check` 全量通过：`check:fast`、`test:e2e:weapp` 与 `check:scenarios`。场景门禁中支付部分与基线一致，scenario-gate 与 template-example 全部场景和 FLOW 覆盖且通过。
  - `pnpm live:build` 与 `pnpm live:check` 离线通过，产物中无 Token、无支付调用。
  - 不执行 Live 真实运行。

  **Review / Acceptance**
  - 验收索引汇总六个任务的证据；确认本 Change 中不存在 skip、空断言或缩减的分母。
  - 逐项核对 Design 载体清单：每条长期约定都能在所列项目级文件中找到。
  - 提醒：归档本 Change 时，须在同一提交中把示例 Fixture manifest 的 `sources.spec.path` 改为归档路径，并运行 `pnpm check:fixtures`（见 Design 风险项）。

  **Commit**
  - `feat(e2e): add example live page and complete template example verification`

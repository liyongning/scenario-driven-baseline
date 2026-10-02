# 模板通用化实施计划

**Goal:** 让门禁只依赖项目清单，去掉全部支付身份，Shadow 与协议来源解耦，并交付使用指南与替换点地图，使仓库成为使用方可直接演进的 SDK 领域模板。最终验收三项（`check:fast`、逐文件 weapp、以全部报告运行的场景门禁）退出码 0，门禁问题数 0。

**Architecture:** 先用项目清单收拢门禁中写死的形态（任务 1），再做 Shadow 中立化（任务 2）、改名（任务 3、4），最后交付文档与指南检查（任务 5）和最终验收（任务 6）。见 Design"执行顺序"。

**Tech Stack:** 沿用现有工具链（pnpm、Vite、Vitest、Ajv、dependency-cruiser、ProtoGen 0.1.2），不新增依赖。

**Spec:** [template-engineering](specs/template-engineering/spec.md)、[scenario-gate](specs/scenario-gate/spec.md)、[protocol-contract](specs/protocol-contract/spec.md)、[设计](design.md)。

## Global Constraints

- 每个任务结束时 `pnpm check:fast` 必须通过，手写代码四项覆盖率保持 100%，不新增覆盖率豁免。
- 不修改已归档 Change、`artifacts/` 下已有证据、ProtoGen Consumer 登记（`consumerId`、source id、output id）与 IDL。
- 已有用例的断言语义不变；只允许 Design 明确列出的适配（类型、路径、名称、清单输入）。新行为只通过本 Change Spec 中的新 case 验证。
- 场景门禁结论必须来自本次实际运行的 `scripts/check-scenarios.ts`，禁止凭推断声称"已有绑定"或"门禁通过"。
- weapp 按 `packages/e2e/AGENTS.md`"微信开发者工具自动化的注意事项"执行：每个文件前退出主进程并预热（约 25 秒）；失败时整文件重跑；不用 `-t`。
- 长期约定必须落在项目级载体上（AGENTS.md、schema、清单、脚本、指南）；Change 文档不能是唯一出处。
- 工作区与提交：Apply 在独立 worktree 与分支中进行；用户授权 `--commit` 时按各任务的 Commit 逐任务提交，否则保持未提交；不 merge、不 push。

## 每个任务的共同完成条件

1. Files 中的产物齐全，行为与所列 Requirement/Scenario 及 Design 决定一致。
2. `pnpm check:fast` 退出码为 0。
3. RED 已先失败、GREEN 后通过；Verification 中的命令与反例符合预期。
4. 实际运行一次场景门禁（unit、integration 报告，加本任务受影响的 weapp 文件报告；任务 6 用全部 weapp 报告），每个问题写明归属的后续任务，无法归属即为回归。
5. 在 `artifacts/<run-id>/tasks/task-<n>.md` 保存验收索引：实际命令与退出码、报告路径、方案与实际的差异、预期失败的反例、weapp 重跑记录。
6. 任务评审确认职责边界、断言与 Spec 一致后才勾选。

## Implementation Tasks

**Tracking rule:** One independently implementable and reviewable task maps to one unindented top-level checkbox. RED, GREEN, verification, and review steps are indented plain bullets, not additional tracked checkboxes.

- [ ] 1. 项目清单驱动门禁

  **Files**
  - Create：`project.manifest.schema.json`（按 Design"项目清单的格式与读取方"的字段表；每个属性带中文 `description`）；`project.manifest.json`（登记当前事实：`payment-sdk`/`@daqian/payment-sdk`/product、`payment-protocol`/`@daqian/payment-protocol`/protocol、`e2e`/`@daqian/payment-e2e`/test/private；现有允许目录与必需命令；测试项目 `sdk-unit`、`protocol-unit`、`test-tools-unit`（unit）、`integration`（integration）、`weapp`（platform）；`fingerprints` 取现有目录；`release.registry` 为现有项目 245 地址，`tagPrefix` 为 `payment-sdk-v`）。
  - Create：`scripts/lib/project-manifest.ts` 与 `scripts/lib/project-manifest.test.ts`（加载、Ajv 校验、按角色/类别查询；绑定 SCN-TEMPLATE-ENGINEERING-005 的 `manifest-rules`）。
  - Modify：`scripts/check-architecture.ts`（包、允许目录、包名、私有、协议包依赖、必需命令、AGENTS 路径取自清单；`checkSchemaDocumentation` 纳入清单 schema）及 `scripts/check-architecture.test.ts`。
  - Modify：`scripts/verification.schema.json`、`scripts/flow.schema.json`（`requiredIn` 改为字符串格式，删除按 kind 枚举项目的 `allOf`，说明改为"取值必须是 project.manifest.json 登记的测试项目"）；`scripts/lib/spec-inventory.ts` 与测试（按清单校验 `requiredIn` 登记与 kind/类别匹配，FLOW 行只允许 integration/platform 类）；`scripts/check-scenarios.ts` 与测试（`Project` 改为 `string`）。
  - Modify：`scripts/lib/contract-inventory.ts` 与测试（义务环境取自清单）；`scripts/lib/fingerprints.ts` 与测试（摘要目录取自清单）；`scripts/check-package.ts` 与测试（按角色取包）。
  - Modify：`scripts/check-release.ts`、`scripts/sdk-release.ts` 与测试（按 Design"发布目标来自清单"：registry、tag 前缀、包名取自清单；占位值拒绝；`.npmrc` 的 scope 与主机由包名和 URL 解析）。
  - Modify：`packages/e2e/tests/tooling/scenario-gate-helpers.ts`、`packages/e2e/tests/tooling/helpers.ts` 及其他在临时根目录运行门禁的 helper：写入一份最小清单。
  - Modify：`packages/e2e/tests/tooling/SCN-SCENARIO-GATE-006.spec.ts`（`invalid-metadata-cli` 增加"引用清单未登记的测试项目"与"kind 与类别不匹配"两条输入）。
  - Modify：`packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-004.spec.ts` 与 Fixture `SCN-TEMPLATE-ENGINEERING-004/`（新增 `preflight-rejects-placeholder`：临时根目录写入含 `<PROJECT_ID>` 的清单，断言预检拒绝；manifest 增加该 case）。
  - Create：`packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-005.spec.ts`（`rename-by-manifest-cli`：临时副本中按清单把 `e2e` 以外的一个包改名并同步目录与 package.json，架构检查通过；`architecture-violations-cli`：未登记目录、包名不一致、缺少必需命令逐项报告；`unregistered-project-cli`：场景门禁报告未登记项目；`no-hardcoded-topology`：按 Design 的守护规则扫描 `scripts/**/*.ts` 非测试文件）。

  **Requirements / Scenarios**
  - template-engineering：ENG-05 / SCN-TEMPLATE-ENGINEERING-005；ENG-04 / SCN-TEMPLATE-ENGINEERING-004（`preflight-rejects-placeholder`）
  - scenario-gate：GATE-05 / SCN-SCENARIO-GATE-006

  **Design Decisions**
  - Decision: 项目清单的格式与读取方；Decision: 发布目标来自清单

  **Interfaces**
  - Consumes: 现有门禁脚本与两份格式 schema。
  - Produces: `project.manifest.json`、`project.manifest.schema.json`、`scripts/lib/project-manifest.ts`；门禁错误信息 `requiredIn project <x> is not registered in project.manifest.json`、`kind <k> cannot run in <class> project <x>`、`release registry is a template placeholder; set release.registry in project.manifest.json`。

  **RED**
  - 新增 `project-manifest.test.ts` 与 `SCN-TEMPLATE-ENGINEERING-005.spec.ts` 后运行 `pnpm test:unit` 与 `pnpm test:integration`：模块不存在、改名副本被旧架构检查拒绝、未登记项目未被报告、扫描发现 `scripts/` 中的包名字面量，均失败。
  - `preflight-rejects-placeholder` 先失败（现有预检不认识占位值）。

  **GREEN**
  - 按 Files 实现；`pnpm check:fast` 通过。

  **Verification**
  - `git grep -nE "payment-sdk|payment-protocol|payment-e2e|projects/245|sdk-unit|protocol-unit|test-tools-unit|'weapp'" -- 'scripts/*.ts' 'scripts/lib/*.ts' ':!*.test.ts'` 零命中。
  - 场景门禁对 SCN-TEMPLATE-ENGINEERING-004/005、SCN-SCENARIO-GATE-006 无问题。

  **Review / Acceptance**
  - 验收索引列出每个读取方改动前后的对照，以及 RED 失败输出。

  **Commit**
  - `feat(template): drive engineering gates from the project manifest`

- [ ] 2. Shadow 路由中立化

  **Files**
  - Modify：`packages/payment-protocol/testing/shadow/routes.ts`（中立 `ShadowRoute`）；`testing/shadow/example/routes.ts`（导出 `exampleRpcMethods` 与 `discoverExampleRoutes`）；`testing/index.ts`（导出 `routesFromRpcMethods`、`ShadowRoute`）；`testing/shadow/bootstrap.test.ts`、`example/routes.test.ts`、`server.test.ts`（类型适配，断言语义不变）。
  - Create：`packages/payment-protocol/testing/shadow/idl-routes.ts`；`testing/shadow/idl-routes.test.ts`（绑定 SCN-PROTOCOL-CONTRACT-004 `idl-route-source`）；`testing/shadow/routes.test.ts`（绑定 `neutral-route`：手写中立路由启动 Shadow、按场景响应并记录请求，测试文件不导入 generated）。
  - Modify：`scripts/lib/contract-inventory.ts` 与测试（改用 `exampleRpcMethods`）。
  - Modify：`.dependency-cruiser.cjs`（新增 `shadow-engine-no-generated`）。
  - Create：`packages/e2e/tests/tooling/SCN-PROTOCOL-CONTRACT-004.spec.ts`（`engine-no-generated-cli`：临时副本中让 `server.ts` 导入 generated，运行 dependency-cruiser，断言报告该规则）。

  **Requirements / Scenarios**
  - protocol-contract：PC-03 / SCN-PROTOCOL-CONTRACT-004

  **Design Decisions**
  - Decision: Shadow 路由中立化

  **Interfaces**
  - Consumes: 现有 Shadow 服务器与示例路由。
  - Produces: `ShadowRoute = { methodName; httpMethod; path }`；`routesFromRpcMethods(required, candidates)`；`exampleRpcMethods`。

  **RED**
  - 先写 `routes.test.ts`、`idl-routes.test.ts` 与 `SCN-PROTOCOL-CONTRACT-004.spec.ts`：`idl-routes.ts` 不存在、依赖规则不存在，测试失败。

  **GREEN**
  - 实现后 `pnpm check:fast` 通过。

  **Verification**
  - `git grep -n "generated" packages/payment-protocol/testing/shadow/server.ts packages/payment-protocol/testing/shadow/faults.ts packages/payment-protocol/testing/shadow/requests.ts packages/payment-protocol/testing/shadow/routes.ts` 零命中。
  - 场景门禁对 SCN-PROTOCOL-CONTRACT-001～004、SCN-TEMPLATE-EXAMPLE-009 无问题。

  **Review / Acceptance**
  - 确认示例与协议矩阵用例的 Shadow 行为不变（integration 报告与改动前一致）。

  **Commit**
  - `refactor(protocol): decouple shadow routes from generated metadata`

- [ ] 3. 包与项目改名，ProtoGen 输出路径迁移

  **Files**
  - Modify：`proto-gen.yaml`（输出路径改为 `packages/protocol/src/generated`）；运行 `pnpm proto:sync` 生成新的 `proto-gen.lock`（按 Design"中立命名与 ProtoGen 输出路径迁移"的顺序：先改配置、旧目录仍在原位时同步）。
  - Move：`packages/payment-sdk` → `packages/sdk`；`packages/payment-protocol` 其余文件 → `packages/protocol`（生成目录已由工具迁移）。
  - Modify：三个包的 `package.json`（包名、依赖名、`publishConfig.registry` 改为清单中的占位值）；根 `package.json`（`name`、`description`）；`pnpm-lock.yaml`（`pnpm install` 刷新 workspace 名称）。
  - Modify：`project.manifest.json`（目录、包名、`release.registry` 占位值、`tagPrefix: template-sdk-v`、`fingerprints` 目录）。
  - Modify：`tsconfig.base.json`、`tsconfig.test.json`、`vitest.config.ts`、`vitest.shared.ts`、各包 Vitest 配置、`eslint.config.js`、`.dependency-cruiser.cjs`（路径、包名、别名 `@template-test/protocol`）；`packages/e2e/host/weapp/project.config.json`、`vite.config.ts` 及宿主中引用包名的文件。
  - Modify：全部源码与测试中的包名导入与路径（以 `git grep -l "payment-sdk\|payment-protocol\|payment-e2e\|@payment-test"` 为准，排除 Design"残留允许清单"第 1、3、4 类）。
  - Modify：`packages/e2e/tests/fixtures/SCN-PROTOCOL-CONTRACT-003/manifest.json`（`generatedCurrent.output.path`、`configDigest`、`provenance.sha256` 中 `current.lock` 的摘要）与 `provenance/current.lock`（替换为新的 `proto-gen.lock`）；其他 Fixture manifest 中的源文件路径与摘要。
  - Modify：`packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-004.spec.ts` 等直接读取包路径或 registry 的测试（正例在临时根写入具体 registry 的清单）。

  **Requirements / Scenarios**
  - template-engineering：ENG-01 / SCN-TEMPLATE-ENGINEERING-001（改名后的产物与消费）；ENG-04 / SCN-TEMPLATE-ENGINEERING-004；ENG-05 / SCN-TEMPLATE-ENGINEERING-005（清单与改名后的仓库一致）
  - protocol-contract：PC-02 / SCN-PROTOCOL-CONTRACT-003（生成来源基线更新）

  **Design Decisions**
  - Decision: 中立命名与 ProtoGen 输出路径迁移；Decision: 发布目标来自清单

  **Interfaces**
  - Consumes: 任务 1 的清单与门禁、任务 2 的中立路由。
  - Produces: 新包名与目录；占位 registry；新的 `proto-gen.lock`（仅路径与 `configDigest` 变化）。

  **RED**
  - 先改 `project.manifest.json` 为新目录与包名，运行 `pnpm check:architecture`：报告未登记目录 `payment-sdk`、`payment-protocol` 与包名不一致，非零退出。

  **GREEN**
  - 按 Files 完成迁移；`pnpm proto:status` 为 `up_to_date`；`pnpm check:fast` 通过。

  **Verification**
  - `git diff HEAD~ -- proto-gen.lock` 只有 `path` 与 `configDigest` 两行变化；生成目录内容与迁移前逐字节一致（`git diff -M --stat` 显示纯重命名）。
  - `git grep -nE "payment-sdk|payment-protocol|payment-e2e|@payment-test|projects/245"` 的每处命中都属于"残留允许清单"。
  - 4 个 weapp 文件逐文件运行通过；场景门禁以 unit、integration 与这 4 份 weapp 报告运行，问题数为 0。

  **Review / Acceptance**
  - 验收索引记录 `proto:sync` 输出、锁文件 diff、weapp 重跑记录。

  **Commit**
  - `refactor(template): rename packages to neutral template names`

- [ ] 4. 内部标识中立化与遗留代码小项

  **Files**
  - Modify：按 Design"中立命名与 ProtoGen 输出路径迁移"表中的内部标识逐项改名：`package.json` 脚本与 `vitest.config.ts`、`scripts/check-scenarios.ts` 及测试中的 `PAYMENT_RUN_ID`/`PAYMENT_REPORT_FILE`；`packages/e2e/src/cases/define-case.ts`、`packages/e2e/src/reporters/scenario-reporter.ts`、`scripts/check-scenarios.ts` 及全部用例中的 `paymentCase`、`payment-evidence`、`payment-flow`；`scripts/check-scenarios.ts` 的 `paymentBehavior`；协议包 `src/errors/business-codes.ts`、`src/index.ts` 及用例中的 `paymentBusinessErrors*`、`PaymentBusinessErrorDescriptor`；`packages/e2e/host/weapp/app.js`、`app.json` 与 `src/drivers/weapp-host.test.ts` 中的 `__PAYMENT_TEST_RUNNER__` 与标题；脚本与测试中的临时目录前缀与局部名。
  - Modify：`packages/e2e/tests/fixtures/SCN-TEMPLATE-ENGINEERING-003/source-and-dual-declarations.json`（`ExampleClientOptions` 增加 `productId`、`lane`、`appVersion`）及 manifest 摘要。
  - Modify：`packages/protocol/src/adapters/network/wechat-miniapp.test.ts`（删除引用已删除支付场景的第 6 行注释）。

  **Requirements / Scenarios**
  - scenario-gate：GATE-07 / SCN-SCENARIO-GATE-009、GATE-08 / SCN-SCENARIO-GATE-010（绑定与证据格式改名后仍工作）
  - template-engineering：ENG-03 / SCN-TEMPLATE-ENGINEERING-003
  - protocol-contract：PC-02 / SCN-PROTOCOL-CONTRACT-003

  **Design Decisions**
  - Decision: 中立命名与 ProtoGen 输出路径迁移；Decision: 上一步遗留小项

  **Interfaces**
  - Consumes: 任务 3 的仓库。
  - Produces: `VERIFY_RUN_ID`、`VERIFY_REPORT_FILE`；`meta.scenarioCase`；`scenario-evidence`、`scenario-flow`；`summaries.publicBehavior`；`businessErrors`、`businessErrorsIdlCommit`、`BusinessErrorDescriptor`；`__TEMPLATE_TEST_RUNNER__`。

  **RED**
  - 先修改 `define-case.test.ts`、`scenario-reporter.test.ts`、`check-scenarios.test.ts` 中的期望为新名称，运行 `pnpm test:unit` 失败。

  **GREEN**
  - 完成改名后 `VERIFY_RUN_ID=<run-id> pnpm check:fast` 通过。

  **Verification**
  - `git grep -niE "payment|PAYMENT_|paysdk"` 的每处命中都属于"残留允许清单"，验收索引逐类列出。
  - 4 个 weapp 文件逐文件运行通过（宿主全局与标题改名）；场景门禁问题数为 0。

  **Review / Acceptance**
  - 确认报告格式只改名称、不改结构；旧名称不再被门禁接受（例如只有 `paymentCase` 的报告被判缺绑定）。

  **Commit**
  - `refactor(template): neutralize internal identifiers`

- [ ] 5. 使用指南、替换点地图与文档

  **Files**
  - Create：`docs/template-guide.md`（按 Design"使用指南与替换点地图"的规定章节与内容）。
  - Modify：`scripts/check-architecture.ts` 与测试（新增 `checkTemplateGuide`；module case `guide-rules` 绑定 SCN-TEMPLATE-ENGINEERING-006）。
  - Create：`packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-006.spec.ts`（`guide-violations-cli`：临时副本中分别删除指南、删除 AGENTS/README 链接、删除一个规定章节、加入断链，逐项报告；恢复后通过）。
  - Modify：`AGENTS.md`、`packages/sdk/AGENTS.md`、`packages/protocol/AGENTS.md`、`packages/e2e/AGENTS.md`、`README.md`、`docs/engineering/bootstrap.md`（按 Design"文档改写"）。
  - Modify：`.gitignore`（加入 `openspec/schemas/`）；执行 `git rm -r --cached openspec/schemas/openspec-workflow`（本地副本保留）。
  - Modify：`openspec/specs/template-engineering/spec.md`、`openspec/specs/protocol-contract/spec.md` 的 `## Purpose`（直接编辑，验收索引记录为有意例外）。

  **Requirements / Scenarios**
  - template-engineering：ENG-06 / SCN-TEMPLATE-ENGINEERING-006；ENG-02 / SCN-TEMPLATE-ENGINEERING-002（AGENTS 链接检查）
  - scenario-gate：GATE-06 / SCN-SCENARIO-GATE-008（AGENTS 仍引用三份格式 schema）

  **Design Decisions**
  - Decision: 使用指南与替换点地图；Decision: 文档改写；Decision: 工作流 schema 不随模板提交

  **Interfaces**
  - Consumes: 任务 1～4 的最终文件布局与名称。
  - Produces: `docs/template-guide.md`；架构检查对指南的守护；不再提交的工作流 schema。

  **RED**
  - 先加 `checkTemplateGuide` 的测试与 `SCN-TEMPLATE-ENGINEERING-006.spec.ts`，在指南不存在时运行，`check:architecture` 报告指南缺失，测试失败。

  **GREEN**
  - 写入指南与文档后 `pnpm check:fast` 通过。

  **Verification**
  - `git ls-files openspec/schemas` 为空，且 `openspec status --change generalize-template --json` 的 `schemaName` 仍为 `openspec-workflow`（本地副本可用）。
  - 替换点地图中列出的每个文件路径都存在（由指南链接检查保证，路径以相对链接书写）。
  - `git grep -nE "infra-payment-sdk|/Users/|projects/245|当前业务：支付" -- AGENTS.md 'packages/*/AGENTS.md' README.md docs/` 中，`infra-payment-sdk` 只允许出现在说明 ProtoGen Consumer 身份的句子里，其余零命中。

  **Review / Acceptance**
  - 逐节核对指南的能力地图与上一步能力保全清单一一对应；替换点地图三项各有"涉及文件、清单改动、验收门禁"。

  **Commit**
  - `docs(template): add template guide and replacement-point map`

- [ ] 6. 最终验收

  **Files**
  - 无代码改动；验收索引 `artifacts/<run-id>/tasks/task-6.md`。

  **Requirements / Scenarios**
  - 本 Change 全部场景：SCN-TEMPLATE-ENGINEERING-004/005/006、SCN-SCENARIO-GATE-006、SCN-PROTOCOL-CONTRACT-004；以及全部既有场景不回归。

  **Design Decisions**
  - Decision: 验证方式

  **Interfaces**
  - Consumes: 任务 1～5 的产物。
  - Produces: 最终验收证据。

  **RED**
  - N/A — 验收任务，不新增行为。

  **GREEN**
  - N/A — 同上。

  **Verification**
  - `VERIFY_RUN_ID=<run-id> pnpm check:fast` 退出码 0。
  - 按 `packages/e2e/AGENTS.md` 逐文件运行全部 weapp 文件，每文件一份报告。
  - 以 unit、integration 与全部 weapp 报告运行 `scripts/check-scenarios.ts`，退出码 0，问题数 0。
  - 残留检查：`git grep -niE "payment|PAYMENT_|paysdk"` 每处命中归属到"残留允许清单"的某一类。
  - 逐项核对指南"能力地图"中每项能力的承载文件存在且其验证场景或命令在本次运行中通过。

  **Review / Acceptance**
  - 汇总 6 个任务的证据；确认 OI-01 登记与指南"已知限制"一致。

  **Commit**
  - `test(template): record final template acceptance`

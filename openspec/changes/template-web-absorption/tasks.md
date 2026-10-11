# 模板 Web 能力吸收实施计划

**Goal:** 在核心加固之上，把 Web 应用 + OpenAPI + 浏览器作为第二套具体实现并列放进模板，同时让门禁、清单与 Shadow 对产品形态、协议种类、运行平台无写死；以三个复刻演练加 xueshan 反馈核对完成本轮迭代的最终验收。最终验收：`pnpm verify --change template-web-absorption` 全部步骤退出码 0，场景门禁问题数 0；示例删除演练、三个复刻演练与"移除一条绑定"演练通过。

**Architecture:** 按 Design"实施顺序"的 15 步执行。先建两个共享契约：清单多包与组合绑定（任务 1，只登记现有 `sdk-idl-weapp`），协议适配器与 IDL 适配器迁移（任务 2，临时根中用桩协议包验证两种 `protocolKind`，同时把 Shadow 引擎迁到测试包 `packages/e2e/src/shadow/`）；再做按形态区分的工程检查骨架并引入 Vue 工具链依赖（任务 3）；然后依次落地 IDL `fetch` 适配器与浏览器步骤执行器（任务 4）、OpenAPI 协议包（任务 5）、OpenAPI 执行器与适配器（任务 6）、Shadow 扩展（任务 7）、Web 应用包骨架与绑定 `web-openapi-browser`（任务 8，`platforms` 为空）、Web 产物边界（任务 9）、浏览器平台点位并把 browser 加入绑定（任务 10）、Web 示例（任务 11）、本地预览与开发代理（任务 12）、文档（任务 13），最后做示例删除验证（任务 14）以及三个复刻演练、"移除一条绑定"演练加最终验收（任务 15）；单组合承诺由受控临时根证据（SCN-TEMPLATE-ENGINEERING-014）与"移除一条绑定"演练共同验证，不另设真实副本 Scenario。依赖后续任务产物的"模板自身事实"类 checkpoint 按 Design 由产物就绪的任务交付，各任务中逐项写明"推迟到任务 N / 承接自任务 M"；推迟期间该 checkpoint 的门禁问题归属到承接任务。

**Tech Stack:** 核心 Change 交付后的工具链；新增依赖见 Design"依赖版本"。

**Spec:** [protocol-contract](specs/protocol-contract/spec.md)、[template-engineering](specs/template-engineering/spec.md)、[scenario-gate](specs/scenario-gate/spec.md)、[openapi-contract](specs/openapi-contract/spec.md)、[browser-platform](specs/browser-platform/spec.md)、[web-app](specs/web-app/spec.md)、[web-example](specs/web-example/spec.md)、[设计](design.md)。

## Global Constraints

- **前提与衔接**：核心 Change `template-core-hardening` 已归档并合回主线。Apply 开始前，本分支 rebase 到该主线，按 Design"实施顺序"中的衔接一段（OI-WA-03）逐条判定，三条全部满足才开始任务 1：
  1. `openspec validate template-web-absorption --strict` 通过；
  2. 本 Change 每个 MODIFIED 块的基准部分（被修改前的原文）与归档后主 Spec 中对应 Requirement 逐块一致；不一致说明核心 Change 实施中改过 Spec，停止，先同步并返回 Plan Review 重新评审受影响部分；
  3. 先单独运行 `SCENARIO_GATE_CHANGES=template-web-absorption pnpm check:fixtures` 判定（a），任务 1 刷新摘要后再运行完整 `check:fast` 判定其余步骤（串联命令在第一个失败步骤后停止，不能一次观察全部结果）。预期失败只有两类：（a）"Fixture 来源摘要过期，且 owner 属于本 Change MODIFIED 的 Requirement"（按 GATE-10，本 Change 修改了这些 Requirement 块，其 Fixture 摘要必然变化），记录实际检出的 owner 列表，交任务 1 处理；（b）核心 Change 交付的 SCN-TEMPLATE-ENGINEERING-008 的 `example-removal-scenarios` 失败，且失败输出中的问题只能是以下两种：（i）本 Change 新增或修改的 Scenario 缺少绑定；（ii）本 Change 的 Scenario 的 `requiredIn` 引用了尚未登记的测试项目（`openapi-unit` 在任务 5 登记、`app-unit` 在任务 8 登记、`browser` 在任务 10 登记，登记之后该项目不再允许出现在这类问题中）（副本归档本 Change 后，尚未实现的 Scenario 必然未绑定，见 Design"实施顺序"中"中途运行时的示例删除用例"），记录原始输出，归属任务 14。出现其他任何失败（包括 SCN-TEMPLATE-ENGINEERING-008 的 `example-removal-fast`）都按衔接失败处理，停止并返回 Plan Review。
- 手写代码四项覆盖率保持 100%；覆盖率排除只允许 Design 列出的类别并登记理由；组件命名例外与行数豁免只经清单登记。
- 不修改已归档 Change、ProtoGen Consumer 登记与 IDL。
- 已有用例的断言语义不变，除非本 Change Spec 改写了对应 checkpoint（以本 Change Spec 为准）；新行为只通过本 Change Spec 中的新 case 或新 checkpoint 验证。
- 场景门禁结论必须来自本次实际运行。
- weapp 按 `packages/e2e/AGENTS.md` 的逐文件约定执行；浏览器用例首次运行前执行 `pnpm exec playwright install chromium`。
- 运行约定（核心 Change ENG-06）：本 Change active 期间，凡可能触发副本用例的运行一律带作用域：`pnpm verify --change template-web-absorption`，单独运行 `check:fast` 或 `test:affected` 时设置 `SCENARIO_GATE_CHANGES=template-web-absorption`。
- 遵循根 AGENTS"优先采用现成方案"：需要通用能力时先查官方文档与社区方案（Vite/Vitest 插件、dependency-cruiser、Ajv、Playwright、redocly、openapi-typescript 的库 API），自研须在验收记录中说明理由。
- 密钥、Token、会话凭据不写入代码、日志或提交；复刻 xueshan 时不复制其 `.env.local` 等本地文件。
- 工作区与提交：Apply 在独立 worktree 与分支中进行；用户授权 `--commit` 时按各任务的 Commit 逐任务提交，否则保持未提交；不 merge、不 push。
- **推迟交付的约定**：任务中标注"推迟到任务 N"的 case 或 checkpoint，在本任务实现其用例与机制，模板自身事实在任务 N 产物就绪后才成立；本任务运行场景门禁时，该项的问题归属任务 N，不视为回归。承接任务的 GREEN 必须包含该项通过。

## 每个任务的共同完成条件

1. Files 中的产物齐全，行为与所列 Requirement/Scenario 及 Design 决定一致。
2. 任务结束时运行 `SCENARIO_GATE_CHANGES=template-web-absorption pnpm test:affected` 并记录选择结果；至少每 3 个任务运行一次全量 `pnpm verify --change template-web-absorption`，浏览器平台任务（任务 10）、Web 示例任务（任务 11）与最终任务（任务 15）结束时必须全量。
3. RED 已先失败、GREEN 后通过；Verification 中的命令与反例符合预期。
4. 实际运行一次 `pnpm check:scenarios --change template-web-absorption`，每个问题写明归属的后续任务（含各任务"推迟到任务 N"所列项），无法归属即为回归。中途任务的全量 verify 只要求第 1、2 步退出码 0，第 3 步问题须全部可归属；"全部步骤通过"只用于最终任务（任务 15）。
5. 验收记录写入本 Change 的 `verify.md` 草稿章节"逐任务记录"：实际命令与退出码、报告路径、方案与实际的差异、预期失败的反例、weapp 与浏览器重跑记录、按需选择结果、推迟项与承接项的状态。
6. 任务改动了 Requirement 块或 Fixture 时（含因 Spec 修订导致 Fixture 来源摘要变化），对受影响的 owner 运行 `pnpm fixtures:refresh <owner...>`，并在验收记录中写明 owner 列表与原因。
7. 任务评审确认职责边界、断言与 Spec 一致后才勾选。
8. 中途运行时的示例删除用例（Design"实施顺序"中"中途运行时的示例删除用例"）：任务 1–13 的 `check:fast` 中，只允许 SCN-TEMPLATE-ENGINEERING-008 的 `example-removal-scenarios` 失败，且失败输出中的问题只能是以下两种：（i）本 Change 新增或修改的 Scenario 缺少绑定；（ii）本 Change 的 Scenario 的 `requiredIn` 引用了尚未登记的测试项目（`openapi-unit` 在任务 5 登记、`app-unit` 在任务 8 登记、`browser` 在任务 10 登记，登记之后该项目不再允许出现在这类问题中）；该失败归属任务 14，验收记录附原始输出并逐条核对每个问题都属于这两种且涉及的 Scenario 都属于本 Change。其他任何失败（包括 SCN-TEMPLATE-ENGINEERING-008 的 `example-removal-fast`，以及输出中出现非本 Change 的 Scenario）按回归处理。任务 14 起该项必须通过。SCN-SCENARIO-GATE-026 中运行副本的 case 不归档作用域内的 Change，不适用本条。各任务 Verification 中"`check:fast` 通过"均按本条理解。

## Implementation Tasks

**Tracking rule:** One independently implementable and reviewable task maps to one unindented top-level checkbox. RED, GREEN, verification, and review steps are indented plain bullets, not additional tracked checkboxes.

- [x] 1. 清单多包与组合绑定（只登记 `sdk-idl-weapp`）

  **Files**
  - Modify：`project.manifest.schema.json`、`project.manifest.json`（每角色多包、test 唯一、`form`、`protocolKind`、`globalStore`、`bindings`、`quality.componentNameExemptions`，新属性带中文说明；现有包补 `form: sdk`、`protocolKind: idl`；只登记绑定 `sdk-idl-weapp`）；`scripts/lib/project-manifest.ts` 及单测（约束：product 与 protocol 各至少一个、绑定名唯一、每个 product 恰好一条绑定、platforms 只引用 platform 类、产品包以 workspace 依赖声明绑定的协议包）。
  - Modify：`scripts/check-architecture.ts`、`scripts/check-package.ts`、`scripts/check-release.ts`、`scripts/lib/contract-inventory.ts`、`scripts/run-by-manifest.ts` 及单测：全部按包或绑定遍历，不再按角色取唯一包；`contract-inventory` 在本任务仍只调用现有 IDL 派生逻辑（经适配器派生在任务 2）；发布范围只含 sdk 形态及其绑定协议包。
  - Modify：`packages/e2e/src/cases/define-case.ts` 及单测（`binding` 字段；按字段、目录、无绑定三级判定环境）；现有 IDL 用例补 `binding: 'sdk-idl-weapp'`。
  - Modify：Fixture manifest schema 与全部现有 IDL Fixture（补 `protocol: "protocol"`）；数据集 manifest schema（`protocol` 字段）；`scripts/check-fixtures.ts`（`protocol` 指向清单 protocol 包、owner 协议一致性；按协议委托 `checkFixture` 在任务 2）。
  - Create：tooling 用例 `SCN-TEMPLATE-ENGINEERING-013/014.spec.ts`、`SCN-SCENARIO-GATE-029/030.spec.ts` 及 Fixture。
  - Modify（衔接预期失败的处理）：对衔接检查检出的 owner 执行 `pnpm fixtures:refresh <owner...>`，至少包括 SCN-PROTOCOL-CONTRACT-002、SCN-SCENARIO-GATE-009、SCN-TEMPLATE-ENGINEERING-001、SCN-TEMPLATE-ENGINEERING-003，以及衔接检查实际检出的其余 owner；与上面补写 Fixture 的 `protocol` 字段一并完成，刷新后的摘要覆盖补字段后的 Fixture 内容。

    - Modify：清单 schema 与 `project.manifest.json` 新增 `packages[].checks`（IDL 协议包登记 `proto:validate`、`proto:status`），`scripts/run-by-manifest.ts` 按清单组装 `check:fast` 中的协议包前置检查；架构检查新增"导入绑定独占包的测试文件必须声明该绑定"，现有 IDL 相关的 tooling、协议与 weapp 用例补 `binding: 'sdk-idl-weapp'`（SCN-TEMPLATE-ENGINEERING-014 `binding-exclusive-rules-cli`，与 014 其余 case 一并承接到任务 2）。

**Requirements / Scenarios**
  - template-engineering：ENG-11 / SCN-TEMPLATE-ENGINEERING-013（`binding-schema-rules`、`binding-violations-cli`）、014（`no-unique-role-lookup`）；ENG-05 / SCN-TEMPLATE-ENGINEERING-005（回归）
  - scenario-gate：GATE-07 / SCN-SCENARIO-GATE-009（回归）；GATE-16 / SCN-SCENARIO-GATE-030；GATE-17 / SCN-SCENARIO-GATE-029；GATE-10 / SCN-SCENARIO-GATE-012（数据集 checkpoint）、013、014、015（回归）
  - 推迟：SCN-TEMPLATE-ENGINEERING-013 的 `template-bindings-fact`（断言按清单事实派生、不写死绑定条数，本任务实现；模板当前事实"两条绑定且 `web-openapi-browser` 含 browser"在任务 10 成立）推迟到任务 10；SCN-TEMPLATE-ENGINEERING-014 的 `binding-readers-rules`、`multi-package-cli`、`single-binding-cli`（临时根中 `openapi` 协议包的义务派生需要适配器加载）推迟到任务 2；SCN-SCENARIO-GATE-027（第二种协议的义务派生需要适配器）推迟到任务 2。
  - 持续成立：SCN-SCENARIO-GATE-030 的 `template-fixtures-declared` 与 SCN-SCENARIO-GATE-029 的 `template-case-bindings` 在本任务以 IDL 部分成立；Web 部分在任务 6、8、10、11 新增 Fixture 与用例时随之成立，各任务 GREEN 复核。

  **Design Decisions**
  - Decision: 共享契约：清单多包与组合绑定

  **Interfaces**
  - Consumes: 核心 Change 交付的清单、`run-by-manifest`、`defineCase` 与 Fixture 来源模型。
  - Produces: `bindingsOf(manifest)`、`bindingOfCase(binding)`；清单新字段；Fixture 与数据集 manifest 的 `protocol` 字段。

  **RED**
  - 清单登记第二个 product 包时 schema 报错；临时根两条绑定下 `tests/b1/` 的用例声明 `b2` 的平台未被拒绝 → 029 失败；漏声明 `protocol` 的 owner 未被报出 → 030 失败。

  **GREEN**
  - 实现后用例通过；仓库中只有一条绑定时行为与之前一致。
  - 衔接检查记录的全部 owner 已执行 `fixtures:refresh`（与补 `protocol` 字段一并完成），`check:fixtures` 不再报 Fixture 来源摘要过期；验收记录列出刷新的 owner 与衔接检查原始输出的对照。

  **Verification**
  - `pnpm verify --change template-web-absorption` 第 1、2 步通过；场景门禁问题中 SCN-TEMPLATE-ENGINEERING-013 `template-bindings-fact` 归属任务 10，SCN-TEMPLATE-ENGINEERING-014 三个 case 与 SCN-SCENARIO-GATE-027 归属任务 2。

  **Review / Acceptance**
  - 列出 6 处"唯一包"读取方的改造对照。

  **Commit**
  - `feat(template): support multiple packages per role with product bindings`

- [x] 2. 协议适配器接口、IDL 适配器迁移与 Shadow 引擎迁入测试包

  **Files**
  - Create：`packages/protocol/testing/adapter.ts`（IDL 协议适配器：`resolveDeclaration`、`deriveObligations`、`responseValidator`、`checkFixture`、`scanCalls`）及单测；`scripts/lib/protocol-adapters.ts`（按清单 `packages[].protocolKind` 与绑定加载适配器）及单测。
  - Move：Shadow 引擎 `packages/protocol/testing/shadow/{server,faults,routes,requests}.ts` 及其单测（含 `bootstrap.test.ts` 中针对引擎导出的断言）→ `packages/e2e/src/shadow/`，新增引擎入口模块；核心 Change 交付的引擎原样迁移、行为不变，单测随之在 test-tools-unit 中运行（`packages/e2e/vitest.config.unit.ts` 已包含 `packages/e2e/src/**/*.test.ts`）。`idl-routes.ts`、`example/` 留在 `packages/protocol/testing/shadow/`，路由构造器只产出中立路由描述，不导入引擎（输出与引擎中立路由类型按结构兼容，由类型测试核对）。
  - Modify：测试别名 `@template-test/protocol` 拆分（`vitest.shared.ts`、`tsconfig.test.json`、`packages/e2e/vitest.config.integration.ts`、`packages/e2e/vitest.config.weapp.ts`、`packages/protocol/vitest.config.ts` 等各 Vitest 配置同步）：引擎从 `packages/e2e/src/shadow/` 的入口导入；`packages/protocol/testing/index.ts` 只导出路由构造器、适配器与执行器（执行器在任务 4 加入），不再导出 `createShadowServer`、`compareJsonPresence` 等引擎接口；现有导入点（`packages/e2e/tests/protocol/`、`tests/weapp/`、`tests/example/` 下的用例与 `example-harness.ts`）改为分别从引擎入口与协议包 testing 入口导入。
  - Modify：`.dependency-cruiser.cjs` 的 `shadow-engine-no-generated` 改为作用于 `packages/e2e/src/shadow/` 的非测试文件：引擎导入任何协议包 `src/generated/` 或 `testing/` 模块被拒绝；确认"协议包不得依赖测试包"规则覆盖协议包 `testing/` 导入引擎；`check:architecture` 的 depcruise 扫描目标同步；`packages/protocol/AGENTS.md` 与 `packages/e2e/AGENTS.md` 中引擎位置与规则路径同步。
  - Modify：`scripts/lib/contract-inventory.ts`、`scripts/check-fixtures.ts`（按声明的 `protocol` 委托 `checkFixture`）、`packages/protocol/testing/shadow/idl-routes.ts` 及单测、迁移后的 `packages/e2e/src/shadow/server.ts`、`routes.ts` 及单测：核心 Change 中的 IDL 专用逻辑迁入适配器；`validateResponse` 签名扩为 `(body, status)`（在迁移完成后的新位置修改）；义务运行环境按绑定取值。
  - Create：tooling 用例 `SCN-PROTOCOL-CONTRACT-014.spec.ts`、`SCN-PROTOCOL-CONTRACT-016.spec.ts`、`SCN-SCENARIO-GATE-027/028.spec.ts`；补齐 `SCN-TEMPLATE-ENGINEERING-014.spec.ts` 的其余 case；protocol-unit 中 SCN-PROTOCOL-CONTRACT-015 的回归对照。受控临时根中登记 `protocolKind` 为 `idl` 与 `openapi` 的两个桩协议包。
  - Modify：`packages/e2e/tests/tooling/SCN-PROTOCOL-CONTRACT-004.spec.ts`（引擎路径改为新目录；补引擎导入协议包 testing 模块、协议包 testing 模块导入引擎两个反例与协议包 testing 入口导出核对）。
  - Modify（引擎相关证据的运行项目，Design"Shadow 引擎归属测试基础设施"）：验证引擎自身行为的单测迁到 test-tools-unit（`packages/e2e/src/shadow/` 下），只用中立路由加注入的校验函数，不导入任何协议包：SCN-PROTOCOL-CONTRACT-006 `shadow-construction`（`issues-reject-construction`、`error-location`、`both-sources`、`status-passed`）、SCN-PROTOCOL-CONTRACT-007 `malformed-claim-rules`（`claimed-skipped`、`unclaimed-rejected`）、SCN-PROTOCOL-CONTRACT-010 `shadow-header-patterns`。验证 IDL 校验器本身的单测留在 protocol-unit，只调用 IDL 路由构造器与校验器、不构造引擎：SCN-PROTOCOL-CONTRACT-006 `idl-validator-rules`（新增 `idl-issue-path`）、SCN-PROTOCOL-CONTRACT-007 新增 case `idl-dynamic-pending`。协议包的测试文件中不得再有对引擎的导入。

  **Requirements / Scenarios**
  - protocol-contract：PC-07 / SCN-PROTOCOL-CONTRACT-014、015、016；PC-01 / SCN-PROTOCOL-CONTRACT-001、002、005（回归）；PC-03 / SCN-PROTOCOL-CONTRACT-004（引擎迁移后的位置、`engine-in-test-infra` 与规则路径；`neutral-route` 改在 test-tools-unit 运行）；PC-04 / SCN-PROTOCOL-CONTRACT-006（`shadow-construction` 改在 test-tools-unit，`idl-validator-rules` 留在 protocol-unit）、007（`malformed-claim-rules` 改在 test-tools-unit，`idl-dynamic-pending` 在 protocol-unit）；PC-05 / SCN-PROTOCOL-CONTRACT-010（`shadow-header-patterns` 改在 test-tools-unit）；PC-06 / SCN-PROTOCOL-CONTRACT-011、012、013（回归：引擎原样迁移后在 test-tools-unit 中通过，断言不变）
  - scenario-gate：GATE-07 / SCN-SCENARIO-GATE-027（承接自任务 1）；GATE-16 / SCN-SCENARIO-GATE-028
  - template-engineering：ENG-11 / SCN-TEMPLATE-ENGINEERING-014 的 `binding-readers-rules`、`multi-package-cli`、`single-binding-cli`（承接自任务 1）

  **Design Decisions**
  - Decision: 共享契约：协议适配器；Decision: 共享契约：清单多包与组合绑定（按绑定取值的读取方）；Decision: Shadow 引擎归属测试基础设施

  **Interfaces**
  - Consumes: 任务 1 的 `bindingsOf` 与 `protocolKind`；核心 Change 交付的义务派生、Shadow 校验与 Fixture 检查。
  - Produces: 协议适配器接口；`loadProtocolAdapter(manifest, protocolDir)`；`validateResponse(body, status)`；`packages/e2e/src/shadow/` 引擎入口（任务 7、10、12 与 OpenAPI 用例从此导入引擎）；只导出协议相关部分的协议包 testing 入口。

  **RED**
  - 临时根中登记桩协议包后，门禁仍走 IDL 硬编码路径、不调用桩适配器 → 014 失败；两条绑定下 IDL 义务要求了另一绑定的平台 → 027 失败；声明 `protocol: A` 的 Fixture 未调用 A 的 `checkFixture` → 028 失败；`validateResponse` 收不到 status → 相应单测失败；引擎仍在 `packages/protocol/testing/shadow/` 时，SCN-PROTOCOL-CONTRACT-004 的 `engine-in-test-infra` 失败。

  **GREEN**
  - 迁移后 014–016、027、028 与 ENG-014 全部 case 通过；改造前后 IDL 义务清单逐条一致（015 对照），协议矩阵与 Shadow 校验用例全部通过。
  - 引擎迁移后 SCN-PROTOCOL-CONTRACT-004、011、012、013 在新位置通过且断言未改；SCN-PROTOCOL-CONTRACT-006、007、010 的引擎相关 case 在 test-tools-unit 中以中立路由通过，IDL 校验器 case 在 protocol-unit 中不构造引擎即通过；协议包 `testing/` 下不再有引擎文件，协议包 testing 入口不导出引擎接口；协议包源码、testing 与测试文件中不存在对 `packages/e2e/` 的导入。

  **Verification**
  - `pnpm verify --change template-web-absorption` 第 1、2 步通过；depcruise 证明适配器不进入协议包生产产物；临时让 `packages/e2e/src/shadow/server.ts` 导入协议包 generated 或 `testing/idl-routes.ts` 时 `check:architecture` 报 `shadow-engine-no-generated`，撤销后通过（改动不提交）。

  **Review / Acceptance**
  - 记录迁移前后义务清单 diff（应为空）；记录引擎迁移的文件对照与别名拆分后的全部导入点。

  **Commit**
  - `refactor(template): extract protocol adapters and move the shadow engine into the test package`

- [x] 3. 按产品形态区分的工程检查骨架与 Vue 工具链依赖

  **Files**
  - Modify：根 `package.json`、`pnpm-lock.yaml`：以精确版本引入 Vue 工具链依赖 `@vitejs/plugin-vue` 6.0.9、`vue-tsc` 3.3.12、`eslint-plugin-vue` 10.11.1、`vue-eslint-parser` 10.4.1（Design"依赖版本"），使 `.vue` 的类型检查、行数与覆盖率规则可在受控临时根中验证；其余 Web 依赖随任务 8 的 `packages/web` 引入。
  - Modify：`scripts/run-by-manifest.ts`（`typecheck` 按 `form` 组装：sdk 用 `tsc`，web-app 用 `vue-tsc --build`）；注释门禁（web-app 源码模式发现规则）；`check:package` 只处理 sdk 形态及其绑定协议包；新增 `check:bundle`、`check:component-tree` 的命令入口（无 web-app 包时直接通过，具体规则在任务 8、9 实现）；根 `package.json`、清单 `requiredCommands`、`check:fast` 串联。
  - Modify：源码清单 `code` 类加入 `.vue`；ESLint `max-lines` 对 `.vue` 计入 template、script、style（经 `vue-eslint-parser` 解析）。
  - Create：`SCN-TEMPLATE-ENGINEERING-015.spec.ts`、`SCN-TEMPLATE-ENGINEERING-016.spec.ts` 及 Fixture（受控临时根中构造 web-app 形态包）。

  **Requirements / Scenarios**
  - template-engineering：ENG-12 / SCN-TEMPLATE-ENGINEERING-015；ENG-03 / SCN-TEMPLATE-ENGINEERING-003（回归）、016；ENG-07 / SCN-TEMPLATE-ENGINEERING-009；ENG-08 / SCN-TEMPLATE-ENGINEERING-010；ENG-01 / SCN-TEMPLATE-ENGINEERING-001（回归）
  - 推迟：SCN-TEMPLATE-ENGINEERING-016 中"对模板自身清单运行注释门禁，`web-app` 形态包走源码模式"的模板事实（`source-mode-cli` 的 `mode-by-form` 针对模板自身）推迟到任务 8；SCN-TEMPLATE-ENGINEERING-009 的 `template-exclusions-fact`（断言按清单事实派生、不写死项数，本任务实现；`packages/e2e/host/browser/runner.ts` 的登记在任务 10）推迟到任务 10。

  **Design Decisions**
  - Decision: 按产品形态区分的工程检查；Decision: 依赖版本

  **Interfaces**
  - Consumes: 任务 1 的 `form`。
  - Produces: `check:bundle`、`check:component-tree` 命令骨架；根级 Vue 工具链。

  **RED**
  - 临时根中的 web-app 包被 `tsc` 检查而失败、`.vue` 中的类型错误未被发现、注释门禁按入口发现找不到对象 → 015、016 失败；`.vue` 未计入源码清单 → 009 的 `.vue` checkpoint 失败。

  **GREEN**
  - 按形态选择后通过；当前仓库（只有 sdk 形态）行为不变；新增依赖无 peer 警告。

  **Verification**
  - `SCENARIO_GATE_CHANGES=template-web-absorption pnpm check:fast` 通过。

  **Review / Acceptance**
  - 记录各检查在两种形态下的选择结果与新增依赖的精确版本。

  **Commit**
  - `feat(template): select engineering checks by product form`

- [x] 4. IDL 协议包的浏览器网络适配器、浏览器步骤执行器与生产实现集成

  **Files**
  - Create：`packages/protocol/src/adapters/network/fetch.ts` 及单测（以规划阶段 V2 实验实现为底稿）；`packages/protocol/src/index.ts` 具名导出 `createFetchHttp` 并补导出测试与"导入时不读 fetch"测试。
  - Create：`packages/protocol/testing/browser-runner.ts`（协议宿主页面内的步骤执行器：只经协议包根入口导入公共客户端与 `createFetchHttp`，按计划步骤执行并回传可序列化结果，不写死接口）及 protocol-unit 单测；执行器的步骤与结果接口作为任务 6 的 OpenAPI 执行器与任务 10 的协议宿主共同遵循的约定。
  - Modify：`packages/e2e/tests/protocol/SCN-PROTOCOL-CONTRACT-002.spec.ts` 等 integration 用例改用 `createFetchHttp`；删除 `packages/e2e/src/drivers/node.ts` 及其单测。
  - Modify：`packages/protocol/AGENTS.md`（浏览器传输层重发说明、浏览器步骤执行器）。
  - Create：SCN-PROTOCOL-CONTRACT-017、018、021 的用例。

  **Requirements / Scenarios**
  - protocol-contract：PC-08 / SCN-PROTOCOL-CONTRACT-017、018、021；PC-01 / SCN-PROTOCOL-CONTRACT-002（回归）
  - template-engineering：ENG-01 / SCN-TEMPLATE-ENGINEERING-001（协议包网络工厂导出）

  **Design Decisions**
  - Decision: IDL 协议包的浏览器网络适配器；Decision: 浏览器平台点位（宿主：协议宿主对协议种类通用）

  **Interfaces**
  - Consumes: `HttpPort` 契约。
  - Produces: `createFetchHttp()`；`testing/browser-runner.ts` 的步骤执行器接口。

  **RED**
  - 017 的行为义务用例失败（适配器不存在）；018 检查到 integration 仍使用测试专用驱动；021 失败（执行器不存在）。

  **GREEN**
  - 适配器与执行器单测覆盖率 100%；协议矩阵在 integration 中经 `createFetchHttp` 通过。

  **Verification**
  - `pnpm verify --change template-web-absorption` 第 1、2 步通过（含逐文件 weapp）。

  **Review / Acceptance**
  - 对照小程序适配器逐条核对行为义务；确认执行器不写死接口。

  **Commit**
  - `feat(template): add fetch network adapter and browser runner to the IDL protocol package`

- [x] 5. OpenAPI 协议包：契约命令、生成器与示例契约

  **Files**
  - Create：`packages/openapi/`（`package.json`、tsconfig、构建配置，双格式产物）；`packages/openapi/contracts/trade-v1.yaml`（Design"Web 示例与示例契约"中的四个接口与顶层结构，身份方案按 OAS-08 分配：createTrade、getTrade 用方案一，cancelTrade 用方案二，listTrades 匿名；lint 零告警）与 lock；`redocly.yaml`（只保留有理由的调整）。
  - Create：`scripts/api-contract.ts` 及单测（`api:validate`、`api:sync <来源>`、`api:status`，lock 覆盖全部生成物）；根 `package.json` 与清单登记命令、包、`contract`、`protocolInputs`、`protocolKind: openapi`（本任务不登记绑定，该包尚无产品引用，门禁不加载其适配器）。
  - Create：`packages/openapi/src/generated/`（`schema.d.ts`、精简 `operations.ts`、`codes.ts`，由 `api:sync` 生成）；`packages/openapi/testing/` 中 bundle 后的完整契约。
  - Create：`SCN-OPENAPI-CONTRACT-001` 至 `006`、`029` 的用例与 Fixture；openapi-unit 测试项目登记（清单 `testProjects` 与 `config`）。

  **Requirements / Scenarios**
  - openapi-contract：OAS-01 / SCN-OPENAPI-CONTRACT-001、002、003、004；OAS-02 / SCN-OPENAPI-CONTRACT-005、006；OAS-08 / SCN-OPENAPI-CONTRACT-029
  - 推迟：SCN-OPENAPI-CONTRACT-029 中"cancelTrade 不在 Web 示例的消费接口声明中"一项在本任务因声明不存在而不构成证据，推迟到任务 11 在示例声明就绪后复核。

  **Design Decisions**
  - Decision: OpenAPI 协议包（契约与同步、生成物）；Decision: Web 示例与示例契约（示例契约）；Decision: 依赖版本

  **Interfaces**
  - Consumes: 任务 1 的清单字段。
  - Produces: `pnpm api:validate|api:sync|api:status`；生成物。

  **RED**
  - 001–006、029 用例失败（命令与包不存在）；故意让 lock 漏登一个生成物时 `api:status` 未报错的反例。

  **GREEN**
  - 命令与生成物到位；完整契约不进入生产导入图（006）。

  **Verification**
  - `SCENARIO_GATE_CHANGES=template-web-absorption pnpm check:fast` 通过；记录 @redocly/cli 选定版本（关闭 OI-WA-02）。

  **Review / Acceptance**
  - 对照 xueshan `scripts/api-contract.ts` 列出修正点（来源参数化、lock 覆盖全部生成物、精简接口表）。

  **Commit**
  - `feat(template): add OpenAPI protocol package with contract commands and generators`

- [x] 6. OpenAPI 执行器与协议适配器

  **Files**
  - Create：`packages/openapi/src/rest/`（执行器：判别联合结果、可配置信封约定、路径参数、身份头映射、方法按契约、X-Request-Id 标准生成器、运行时忽略未知字段）、`src/transport/`、`src/adapters/network/fetch.ts`、根入口导出 `createFetchHttp`，以及全部单测。
  - Create：`packages/openapi/testing/adapter.ts`（OpenAPI 协议适配器：声明解析、接口粒度义务、presence 联合判定、`x-implemented` 提示、规范化钩子加 Ajv 响应校验、信封认领与 `malformed` 反证、业务码核对、调用扫描）及单测；`packages/openapi/testing/shadow-routes.ts`（OpenAPI 路由构造器，注入 `responseValidator`）；`packages/openapi/testing/browser-runner.ts`（遵循任务 4 的步骤执行器接口）及 openapi-unit 单测。
  - Create：OpenAPI 协议矩阵 integration 用例（`tests/web-openapi-browser/`，按绑定协议包的产品声明遍历接口）及 SCN-OPENAPI-CONTRACT-007 至 028 其余用例与 Fixture（Fixture 声明 `protocol: "openapi"`）；`OperationCodes` 类型测试。受控临时根中构造绑定 `packages/openapi` 的最小 web-app 产品包，用于 015、016、017、019 的门禁与 CLI 证据。
  - Modify：`packages/openapi/AGENTS.md`（生成物边界、信封约定、严格同形）。

  **Requirements / Scenarios**
  - openapi-contract：OAS-03 / SCN-OPENAPI-CONTRACT-007～014；OAS-04 / SCN-OPENAPI-CONTRACT-015、016；OAS-05 / SCN-OPENAPI-CONTRACT-017～021；OAS-06 / SCN-OPENAPI-CONTRACT-022～026；OAS-07 / SCN-OPENAPI-CONTRACT-027、028
  - protocol-contract：PC-05 / SCN-PROTOCOL-CONTRACT-009（openapi-unit case）、008、010（回归：规则扩展到全部协议包后 IDL 行为不变）
  - 本任务交付：007～014、028 的 integration 与 openapi-unit case；015 的 `resolve-declaration-unit` 与 `adapter-loading`（临时根）；016 全部；017 的 `derive-obligations-unit`；018；019 的 `unimplemented-hint-unit`；020；021 的矩阵用例代码（以临时根产品声明运行并记入验收记录）；022～026；027 中除宿主导入外的部分。
  - 推迟：SCN-OPENAPI-CONTRACT-007、009、010、011、012、014、021、028 的 browser case 推迟到任务 10；027 `consumers-use-dist` 中"浏览器宿主从产物导入"推迟到任务 10；015 中"以模板 Web 示例的消费接口声明调用 `resolveDeclaration`"的模板事实、017 的 `derive-obligations-gate`（示例声明的义务清单与 integration + browser 运行环境）、021 `openapi-matrix` 的 integration case（obligations-covered 针对 `packages/web` 的声明）推迟到任务 11；021 的 `openapi-matrix-empty`（`packages/web` 骨架声明为空）推迟到任务 8；019 的 `unimplemented-hint-gate`（含 `guide-documented`）推迟到任务 13。

  **Design Decisions**
  - Decision: OpenAPI 协议包（REST 执行器、消费接口声明与义务派生、响应校验与 Fixture 认领、包形态）

  **Interfaces**
  - Consumes: 任务 2 的适配器接口与 `packages/e2e/src/shadow/` 引擎入口（OpenAPI 路由构造器只产出中立描述，不导入引擎）；任务 4 的步骤执行器接口；任务 5 的生成物。
  - Produces: `createRestClient`、`createFetchHttp`、OpenAPI 适配器、OpenAPI 路由构造器与浏览器步骤执行器。

  **RED**
  - 各 Scenario 用例先失败；presence 联合判定吸收 xueshan 反馈 #26 的正例、反例后先失败。

  **GREEN**
  - 本任务交付项通过；推迟项在场景门禁中归属任务 8、10、11、13。

  **Verification**
  - `pnpm verify --change template-web-absorption` 第 1、2 步通过。

  **Review / Acceptance**
  - 对照 xueshan `packages/api/src/rest/`、`contract-inventory.ts`、`contract-schema.ts`、`check-fixtures.ts` 列出吸收与修正点；确认无宽松认领路径。

  **Commit**
  - `feat(template): add OpenAPI REST executor and protocol adapter`

- [x] 7. Shadow 扩展：预览模式与部分响应后断开

  **Files**
  - Modify：`packages/e2e/src/shadow/server.ts`、`faults.ts` 及单测（任务 2 迁移后的引擎；`mode: 'test' | 'preview'`；测试模式入口 `createShadowServer` 拒绝 `mode: 'preview'`；序列游标按"条目 + 实际路径参数"、精确条目优先、最后一条重复、不判问题；`partial-then-disconnect` 故障）。
  - Create：`packages/e2e/src/shadow/` 下导出 `createPreviewShadowServer` 的独立模块及单测；该模块不被引擎入口转导出，引擎入口导出清单的单测断言其中不含 `createPreviewShadowServer`。
  - Modify：`.dependency-cruiser.cjs`：按模块限定只有 `packages/e2e/src/preview/` 可以导入预览构造模块；用例、harness 与其他位置直接导入被拒绝（该目录在任务 12 创建，规则先行，以临时根反例验证）。
  - Create：SCN-PROTOCOL-CONTRACT-019、020 的用例。

  **Requirements / Scenarios**
  - protocol-contract：PC-06 / SCN-PROTOCOL-CONTRACT-019、020；SCN-PROTOCOL-CONTRACT-011、012、013（回归）；PC-03 / SCN-PROTOCOL-CONTRACT-004（回归：新增预览模块后 `shadow-engine-no-generated` 仍成立）

  **Design Decisions**
  - Decision: 本地预览（Shadow 预览模式）；Decision: 浏览器平台点位（Shadow 新增故障）；Decision: Shadow 引擎归属测试基础设施（预览构造函数为独立模块）

  **Interfaces**
  - Consumes: 任务 2 迁移到 `packages/e2e/src/shadow/` 的引擎；核心 Change 的 `environmentClass`。
  - Produces: `createPreviewShadowServer`（独立模块）与依赖规则；新故障。

  **RED**
  - 019、020 失败；临时根中用例文件或 harness 直接导入预览构造模块未被依赖检查拒绝；引擎入口转导出 `createPreviewShadowServer` 后用例经入口导入未被拒绝（反例：规则若只按入口判定即可被绕过）。

  **GREEN**
  - 实现后通过；test 模式行为不变。

  **Verification**
  - `SCENARIO_GATE_CHANGES=template-web-absorption pnpm check:fast` 通过。

  **Review / Acceptance**
  - 核对 test 模式的严格计数未受影响；`createPreviewShadowServer` 只定义在一个独立模块，引擎入口不导出它。

  **Commit**
  - `feat(template): add shadow preview mode and partial-then-disconnect fault`

- [x] 8. Web 应用包骨架、前端架构规则与绑定 `web-openapi-browser`

  **Files**
  - Create：`packages/web/`（按 Design"Web 应用产品包"用 create-vue 3.24.0 初始化后对齐：删除 oxlint、包内 ESLint/Prettier、`.vscode`、脚手架残留；依赖按 Design 版本表；workspace 依赖 `@daqian/template-openapi`；tsconfig 三件套与 `tsconfig.core.json`；目录骨架 `main.ts`、`app/`、`app/platform/`、`app/consumed-operations.ts`（空声明）、`runtime/ports/`、`shared/{components,composables,utils}`、`store/`；`store/` 含全局 store 骨架：唯一的 setup store，对外只暴露 `readonly()` 状态与 action，示例切片在任务 11 加入，删除示例后骨架仍满足 WEB-04）。
  - Modify：清单登记 `packages/web`（`form: web-app`、私有、`globalStore`）、`app-unit` 测试项目与绑定 `web-openapi-browser`（product `web`、protocol `openapi`，`platforms` 为空）。
  - Modify：`eslint.config.js`（eslint-plugin-vue flat 配置；核心层 DOM 禁令；store 写入与别名、`Object.assign` 拦截；`import.meta.env` 只在 `main.ts`；覆盖率忽略注释禁用；组件命名例外读清单）；`.dependency-cruiser.cjs`（Web 规则按清单与绑定生成）；Vitest 项目配置（root 在仓库根）；`check:component-tree` 规则实现。
  - Create：SCN-WEB-APP-001、004～011 的用例（受控临时根中构造违规反例）；`packages/web/AGENTS.md`（状态分层、组件树、全局 store 约束、不可达分支写法）与模块级 AGENTS/CLAUDE。

  **Requirements / Scenarios**
  - web-app：WEB-01 / SCN-WEB-APP-001；WEB-03 / SCN-WEB-APP-004；WEB-04 / SCN-WEB-APP-005；WEB-05 / SCN-WEB-APP-006；WEB-06 / SCN-WEB-APP-007、008；WEB-07 / SCN-WEB-APP-009；WEB-08 / SCN-WEB-APP-010、011
  - openapi-contract：OAS-05 / SCN-OPENAPI-CONTRACT-021 的 `openapi-matrix-empty`（承接自任务 6：骨架声明为空，矩阵断言按接口派生的义务为空）
  - scenario-gate：SCN-SCENARIO-GATE-030 `template-fixtures-declared`（复核：任务 6 的 OpenAPI Fixture 在 `web-openapi-browser` 绑定登记后声明 `protocol: "openapi"`）
  - template-engineering：ENG-03 / SCN-TEMPLATE-ENGINEERING-016 对模板自身清单运行注释门禁时 `packages/web` 走源码模式（承接自任务 3）
  - 推迟：SCN-TEMPLATE-ENGINEERING-013 `template-bindings-fact` 仍推迟到任务 10（本任务登记两条绑定，但 `web-openapi-browser` 的 `platforms` 为空）。

  **Design Decisions**
  - Decision: Web 应用产品包；Decision: 共享契约：清单多包与组合绑定（`platforms` 可以为空）；Decision: 依赖版本

  **Interfaces**
  - Consumes: 任务 1 的绑定；任务 3 的形态检查骨架与 Vue 工具链；任务 6 的 OpenAPI 客户端与适配器。
  - Produces: `packages/web` 骨架；绑定 `web-openapi-browser`；`check:component-tree` 规则实现。

  **RED**
  - 各反例在规则未生效时不被拦截 → 用例失败；未登记绑定时 021 `openapi-matrix-empty` 无对象。

  **GREEN**
  - 规则生效后反例被拦截、恢复后通过；骨架本身满足全部规则；`web-openapi-browser` 的 OpenAPI 义务为空且只要求 integration。

  **Verification**
  - `SCENARIO_GATE_CHANGES=template-web-absorption pnpm check:fast` 通过。

  **Review / Acceptance**
  - 记录 create-vue 生成物与对齐后的差异。

  **Commit**
  - `feat(template): add web app package skeleton with frontend architecture rules`

- [ ] 9. Web 产物边界检查

  **Files**
  - Create：`scripts/lib/vite-plugins/bundle-manifest.ts`（模块清单写到 `artifacts/build/<产品目录>/bundle-manifest.json`）；`scripts/check-bundle.ts`、`scripts/lib/bundle.ts` 及单测（测试设施按模块来源判定、协议 bundle 不进产物、模块与摘要对账、入口与相对资源、CSS 伪选择器残留、产品摘要新鲜度）；`buildInputs` 通配排除被忽略文件。
  - Modify：`packages/web/vite.config.ts` 接入插件。
  - Create：SCN-WEB-APP-012、013、014 的用例与 Fixture。

  **Requirements / Scenarios**
  - web-app：WEB-09 / SCN-WEB-APP-012、013、014

  **Design Decisions**
  - Decision: Web 产物边界

  **Interfaces**
  - Consumes: 核心 Change 的源码清单；任务 3 的命令骨架；任务 8 的 `packages/web`。
  - Produces: `check:bundle` 完整实现；产品摘要（供任务 10 的应用宿主新鲜度校验使用）。

  **RED**
  - 012–014 失败；构造把契约 JSON 打进产物、CSS 残留 `:deep(` 的反例。

  **GREEN**
  - 实现后通过；只改测试文件不改变产品摘要。

  **Verification**
  - `SCENARIO_GATE_CHANGES=template-web-absorption pnpm check:fast` 通过。

  **Review / Acceptance**
  - 对照 xueshan `check-bundle.ts` 列出泛化点。

  **Commit**
  - `feat(template): add web bundle boundary check`

- [ ] 10. 浏览器平台点位

  **Files**
  - Modify：根 `package.json`（`playwright` 1.63.0 精确版本）；清单（`browser` 测试项目、绑定 `web-openapi-browser` 的 `platforms` 改为 `["browser"]`、`requiredCommands` 加 `test:e2e:browser`）。
  - Create：`packages/e2e/src/drivers/browser.ts`、`src/hosts/`（共用代理中间件、协议宿主与应用宿主启动器、按绑定加载协议包 `testing/browser-runner.ts`、产物新鲜度校验）及单测；`packages/e2e/host/browser/`（最小页面、页面入口脚本 `runner.ts`、按 Fixture 渲染 `<img>` 的入口）、`packages/e2e/host/app/`、`packages/e2e/host/web.config.json`（本任务登记占位资源域名兑现规则）与 `web.config.schema.json`；`packages/e2e/vitest.config.browser.ts`。
  - Modify：harness（`waitForCalls`、占位资源域名本地兑现）；`packages/e2e/AGENTS.md`（浏览器一节、已知行为、首次安装浏览器）；根 AGENTS 执行规则 11 扩展到浏览器；`quality.coverageExclusions` 登记 `host/browser/runner.ts`。
  - Create：SCN-BROWSER-PLATFORM-001～011、016 的用例与 Fixture（008 的 Fixture 归 SCN-BROWSER-PLATFORM-008 所有，图片地址使用登记的占位域名，声明 `protocol: "openapi"`，不依赖 Web 示例）；OpenAPI 协议矩阵与 OAS-03、OAS-07 的 browser 用例（在协议宿主页面内经 OpenAPI 执行器与同源代理执行）。

  **Requirements / Scenarios**
  - browser-platform：BRW-01 / SCN-BROWSER-PLATFORM-001、002；BRW-02 / SCN-BROWSER-PLATFORM-003、004、016；BRW-03 / SCN-BROWSER-PLATFORM-005、006；BRW-04 / SCN-BROWSER-PLATFORM-007；BRW-05 / SCN-BROWSER-PLATFORM-008、009、010；BRW-06 / SCN-BROWSER-PLATFORM-011
  - openapi-contract（承接自任务 6）：SCN-OPENAPI-CONTRACT-007、009、010、011、012、014、028 的 browser case；SCN-OPENAPI-CONTRACT-021 `openapi-matrix` 的 browser case（本任务以当时的 `packages/web` 声明运行，示例声明下的义务覆盖在任务 11 重跑交付）；SCN-OPENAPI-CONTRACT-027 `consumers-use-dist` 中浏览器宿主从产物导入
  - template-engineering：ENG-11 / SCN-TEMPLATE-ENGINEERING-013 的 `template-bindings-fact`（承接自任务 1）；ENG-07 / SCN-TEMPLATE-ENGINEERING-009 的 `template-exclusions-fact`（承接自任务 3，本任务登记 `host/browser/runner.ts`）
  - 推迟：SCN-BROWSER-PLATFORM-011 `command-composed` 中 `preview:local`、`dev:remote` 两项登记推迟到任务 12（命令在该任务实现）；SCN-BROWSER-PLATFORM-016 `logic-in-src` 中"预览数据集装载与 `dev:remote` 配置解析位于 `packages/e2e/src/` 并由 test-tools-unit 覆盖"两项推迟到任务 12（本任务的 `web.config.json` 只登记占位资源兑现规则，代理前缀列表与默认数据集在任务 12 补入）。

  **Design Decisions**
  - Decision: 浏览器平台点位；Decision: 依赖版本

  **Interfaces**
  - Consumes: 任务 1 的绑定；任务 4 与任务 6 的浏览器步骤执行器；任务 6 的 OpenAPI 客户端；任务 7 的新故障；任务 8 的 `packages/web` 与绑定；任务 9 的产品摘要。
  - Produces: `pnpm test:e2e:browser`；共用代理中间件；两个宿主；协议宿主的 `<img>` 渲染入口。

  **RED**
  - 各 Scenario 先失败；006 的对照证据：不带防护的普通代理下 Shadow 记到两次请求；绑定协议包缺少执行器时宿主未报错 → 003 失败。

  **GREEN**
  - 实现后通过；浏览器网络错误用例经主防线与兜底都只计一次请求；承接自任务 1、6 的项通过。

  **Verification**
  - 全量 `pnpm verify --change template-web-absorption`：第 1、2 步通过（含逐文件 weapp 与 browser）；第 3 步剩余问题只归属任务 11、12、13。

  **Review / Acceptance**
  - 记录 Chromium 重发对照的实际观测；确认宿主与启动器源码不按 `protocolKind` 分支。

  **Commit**
  - `feat(template): add browser platform with playwright driver and shared proxy`

- [ ] 11. Web 示例

  **Files**
  - Create：`packages/web/src/` 中示例模块（交易创建、状态轮询、列表；`store/` 全局 store 用切片函数组合并 readonly 暴露；`runtime/` 轮询器与代际；`app/platform/` 中从 URL 读取 token 与 merchant 的适配器；`shared/components/` 加载中与加载失败组件；两级 `components/` 组件树；`app/consumed-operations.ts` 登记 createTrade、getTrade、listTrades）及全部单测（入口覆盖、store 写入审计、代际丢弃、假时钟轮询、业务码完备性对账、不可达分支改写正例）。
  - Create：浏览器用例 `packages/e2e/tests/web-openapi-browser/` 中 SCN-WEB-EXAMPLE-001～006 与 FLOW-WEB-EXAMPLE-001；Fixture（声明 `protocol: "openapi"`）；预览数据集 `_datasets/trade-in-progress/`、`_datasets/trade-completed/`（声明 `protocol`）。
  - Modify：OpenAPI 协议矩阵 Fixture 按示例声明补齐接口数据。
  - Modify：全部示例内容加 `web-example:begin/end` 标记或列入白名单；`openspec/specs/web-example/` 在白名单内。

  **Requirements / Scenarios**
  - web-example：WEX-01 / SCN-WEB-EXAMPLE-001～005；WEX-02 / SCN-WEB-EXAMPLE-006、FLOW-WEB-EXAMPLE-001；WEX-03 / SCN-WEB-EXAMPLE-007；WEX-04 / SCN-WEB-EXAMPLE-008；WEX-05 / SCN-WEB-EXAMPLE-009；WEX-06 / SCN-WEB-EXAMPLE-010、011；WEX-07 / SCN-WEB-EXAMPLE-013；WEX-08 / SCN-WEB-EXAMPLE-014
  - openapi-contract（承接自任务 5、6、10）：SCN-OPENAPI-CONTRACT-015 以示例声明调用 `resolveDeclaration`（prefix 为 `trade.v1`）；017 的 `derive-obligations-gate`；021 `openapi-matrix` 在 integration 与 browser 中对示例声明的全部义务通过；029 中 cancelTrade 不在示例声明中的复核
  - scenario-gate：SCN-SCENARIO-GATE-029 `template-case-bindings`、030 `template-fixtures-declared`（复核示例用例与 Fixture）

  **Design Decisions**
  - Decision: Web 示例与示例契约；Decision: Web 应用产品包（状态分层、全局 store、组件树）

  **Interfaces**
  - Consumes: 任务 6、8、9、10 的产物。
  - Produces: 可运行的 Web 示例；两个预览数据集。

  **RED**
  - 各 Scenario 用例先失败；示例声明登记后、矩阵 Fixture 补齐前 021 指出缺少的接口。

  **GREEN**
  - 实现后通过；示例满足组件树、依赖方向、行数与覆盖率全部规则；承接自任务 5、6、10 的项通过。

  **Verification**
  - 全量 `pnpm verify --change template-web-absorption`：第 1、2 步通过；第 3 步剩余问题只归属任务 12、13。

  **Review / Acceptance**
  - 评审三层状态归属与组件树划分是否符合包级 AGENTS。

  **Commit**
  - `feat(template): add web example on OpenAPI and browser`

- [ ] 12. 本地预览与开发代理

  **Files**
  - Create：`packages/e2e/src/preview/`（预览启动器：唯一导入 `createPreviewShadowServer` 所在模块的位置；数据集装载与校验、默认数据集、资源占位域名替换、`dev:remote` 配置解析）及单测；根命令 `preview:local`、`dev:remote`；清单 `requiredCommands` 加入 `preview:local`、`dev:remote`；`packages/e2e/host/web.config.json` 补入 `dev:remote` 代理前缀列表与默认预览数据集。
  - Create：浏览器平台自带的预览数据集（基于 OpenAPI 协议包当前契约）；SCN-BROWSER-PLATFORM-012～015 的用例（012 经启动器 API 取得预览模式 Shadow，不以预览模式断言请求次数）。
  - Modify：根与 e2e AGENTS 中"Shadow 只服务测试"改为"服务测试与本地预览，均不进入生产产物"，写明三种模式与不提供混合模式。

  **Requirements / Scenarios**
  - browser-platform：BRW-07 / SCN-BROWSER-PLATFORM-012、013；BRW-08 / SCN-BROWSER-PLATFORM-014、015
  - browser-platform：BRW-06 / SCN-BROWSER-PLATFORM-011 `command-composed` 的 `preview:local`、`dev:remote`（承接自任务 10）；BRW-02 / SCN-BROWSER-PLATFORM-016 `logic-in-src` 的预览数据集装载与 `dev:remote` 配置解析（承接自任务 10）
  - protocol-contract：PC-06 / SCN-PROTOCOL-CONTRACT-019 `preview-entry-boundary`（回归：启动器目录真实存在后依赖规则仍只允许该目录导入预览构造模块）

  **Design Decisions**
  - Decision: 本地预览

  **Interfaces**
  - Consumes: 任务 7 的 `createPreviewShadowServer` 与依赖规则、任务 10 的共用代理与协议宿主、任务 11 的示例数据集。
  - Produces: `pnpm preview:local [--dataset <name>]`、`pnpm dev:remote`；预览启动器 API。

  **RED**
  - 012–015 失败；011 的 `command-composed` 失败。

  **GREEN**
  - 实现后通过；手工执行 `pnpm preview:local --dataset trade-in-progress` 与 `--dataset trade-completed`，在浏览器中看到两种状态的示例页面，截图存本机临时目录（不入库）并在验收记录中描述。

  **Verification**
  - `SCENARIO_GATE_CHANGES=template-web-absorption pnpm check:fast` 通过。

  **Review / Acceptance**
  - 确认产品代码中没有任何模式分支；预览模式 Shadow 只经启动器构造。

  **Commit**
  - `feat(template): add local preview and remote dev proxy modes`

- [ ] 13. 文档与地图

  **Files**
  - Modify：`docs/template-guide.md`（能力地图新增 8 项；替换点地图三点位两选项加本地预览点位，标注交叉组合验证状态，写明 Shadow 引擎属于测试基础设施、不随协议选项删除；"移除模板示例"加入 web-example 白名单；新增"移除一条绑定"一节（按 Design"绑定的独占内容与删除"与 ENG-06 的顺序：删除独占包、平台测试项目与宿主、声明该绑定的用例与 Fixture；同步清单；同步文档；事实核验用例按清单派生不需改动；按路径引用独占包的单测与 helper 改为受控临时根输入或声明所属绑定；Shadow 引擎不删除；Spec 清理属于使用方自己的 Change）；"跨源部署"一节；版本表；`x-implemented: false` 接口在开发代理下返回未实现错误、应改用本地预览；浏览器传输层重发说明；更正 xueshan 反馈 #6 描述）；`docs/architecture.md`（新能力各有同名章节，演进记录按核心 Change 规则只写 Change 名称）；根与各包 AGENTS.md、模块级 AGENTS/CLAUDE。
  - Modify：SCN-TEMPLATE-ENGINEERING-006、012 的检查与 Fixture（新章节与能力；006 的 `guide-sections` 纳入"移除一条绑定"）。

  **Requirements / Scenarios**
  - template-engineering：ENG-06 / SCN-TEMPLATE-ENGINEERING-006；ENG-10 / SCN-TEMPLATE-ENGINEERING-012
  - openapi-contract：OAS-05 / SCN-OPENAPI-CONTRACT-019 的 `unimplemented-hint-gate`（含 `guide-documented`，承接自任务 6）

  **Design Decisions**
  - Decision: 文档与地图

  **Interfaces**
  - Consumes: 全部前序产物。
  - Produces: 更新后的指南、架构文档与 AGENTS。

  **RED**
  - 006、012 的新 checkpoint 失败；019 `guide-documented` 失败。

  **GREEN**
  - 文档补齐后通过；`check:project-map` 通过。

  **Verification**
  - `SCENARIO_GATE_CHANGES=template-web-absorption pnpm check:fast` 通过；场景门禁中已无归属前序推迟的问题；无上下文 Agent 只读架构文档，能讲清协议适配器、组合绑定与本地预览三种模式。

  **Review / Acceptance**
  - 评审替换点地图每个点位的文件、清单项、Scenario 与门禁齐全。

  **Commit**
  - `docs(template): document web capabilities, bindings and replacement points`

- [ ] 14. 示例删除验证

  **Files**
  - Modify：`SCN-TEMPLATE-ENGINEERING-008.spec.ts` 及 Fixture（同时删除 template-example 与 web-example，副本内 `check:fast` 与 `check:scenarios --inventory`，核对两个产品包依赖在副本内）。

  **Requirements / Scenarios**
  - template-engineering：ENG-06（删除保证与副本构造）；template-example：EX-10 / SCN-TEMPLATE-ENGINEERING-008（`example-removal-scenarios` 承接自任务 1–13 的中途预期失败，见共同完成条件第 8 条）

  **Design Decisions**
  - Decision: Web 示例与示例契约（删除白名单）；Decision: 实施顺序（中途运行时的示例删除用例）

  **Interfaces**
  - Consumes: 两个示例的白名单与标记；核心 Change 的仓库副本 helper。
  - Produces: 删除后仍全绿的证据（含 SCN-BROWSER-PLATFORM-008、012 等平台证据不依赖 Web 示例）。

  **RED**
  - 先运行 008，记录删除后失败的门禁；非 0 即为待迁出的通用证据，回到负责的任务处理。

  **GREEN**
  - 008 全部 case 通过，`example-removal-scenarios` 不再报本 Change 的 Scenario 缺少绑定；此后任何任务的 `check:fast` 不再允许该项失败。

  **Verification**
  - 示例删除演练：按指南"复刻验收"准备隔离副本（归档作用域内 Change、移除其余 active Change、删除本 Change 归档目录与 `artifacts/`），由无上下文 Agent 同时删除两个示例，副本中按运行约定运行完整 `pnpm verify` 全绿（含逐文件 weapp 与 browser）。

  **Review / Acceptance**
  - 演练记录写入 `verify.md`。

  **Commit**
  - `test(template): prove gates stay green after removing both examples`

- [ ] 15. 复刻演练、"移除一条绑定"演练与最终验收

  **Files**
  - 无仓库内代码产物（演练在隔离副本中进行，副本不提交）；按演练发现修订的指南、AGENTS 或门禁随本任务提交。

  **Requirements / Scenarios**
  - 本 Change 全部 Requirement 与 Scenario（最终全量验收）

  **Design Decisions**
  - Decision: 验收（本轮迭代的最终验收）

  **Interfaces**
  - Consumes: 本 Change 与核心 Change 全部产物；支付 SDK 子集（同核心 Change）；xueshan 子集（ENTRY-01、02、05，PLATFORM-02、05，NOTIF-01、02，输入为 xueshan 契约与 Spec，不复制本地文件）；IDL 包的 `testing/browser-runner.ts`；指南"移除一条绑定"一节（任务 13）。
  - Produces: 四份演练记录；最终 `pnpm verify` 证据；xueshan 反馈核对表。

  **RED**
  - N/A — 演练任务，以猜测记录与门禁结果为判定依据。

  **GREEN**
  - 四个演练均由无上下文 Agent 在隔离副本中完成，副本中按运行约定执行的 `pnpm verify` 全绿，猜测记录全部分类，"指南缺失需修订"类在本任务修订并复核：
    - 支付 SDK 复刻重跑（SDK + IDL + 小程序）；
    - xueshan 纵切片复刻（Web 应用 + OpenAPI + 浏览器）；
    - 交叉复刻（Web 应用 + IDL + 浏览器）：起始状态按 Design"验收"——在隔离副本中先按白名单删除 `template-example`（sdk 包消费接口声明随之为空，避免义务 ID 重复的已知限制），再新增绑定 Web 应用 + IDL 协议包 + browser；接口为 CreateTrade、QueryTrade，使用 IDL 包 `createFetchHttp`；IDL 的浏览器证据经协议宿主按该绑定加载 IDL 包 `testing/browser-runner.ts` 取得；
    - "移除一条绑定"演练（ENG-11 单组合承诺的真实仓库证据，来自 Design"Shadow 引擎归属测试基础设施"的证据要求，对应 Design"验收"第 5 条；Design"验收"第 2 条的"三个复刻演练"不含本项）：无上下文 Agent 在隔离副本中照指南"移除一条绑定"一节删除 `sdk-idl-weapp`（独占的 `packages/sdk`、`packages/protocol`、`sdk-unit`、`protocol-unit`、`weapp` 测试项目、weapp 宿主、声明该绑定的用例与 Fixture），允许按指南同步清单、文档、事实核验用例与按路径引用 IDL 包的测试，按指南最后一步在副本中建立一个 Change，以 REMOVED 删除只适用于 IDL 绑定的 Requirement，不修改门禁代码、门禁配置与 `packages/e2e/src/shadow/`，最后完整 `pnpm verify` 全绿；记录 Agent 的全部猜测与指南缺失，并单列"事实核验用例是否需要改动"（按 ENG-11 应为无需改动，需要改动即为缺口，回到负责的任务修正）。

  **Verification**
  - 在本仓库执行最终 `pnpm verify --change template-web-absorption`（全新 run id），全部步骤退出码 0，场景门禁问题数 0。
  - xueshan 反馈核对：以 Design"验收"第 3 条的反馈范围表为准，对"本 Change"与"核心 Change"两行中的每一个编号逐条判定"未复现"或"复现（附证据）"，证据为复刻演练记录中对应的操作或门禁结果；"排除"行的编号逐条照录表中理由，不做判定。核对表按编号列出，每条一行，缺任一编号即未完成。

  **Review / Acceptance**
  - `verify.md` 记录三份复刻演练、"移除一条绑定"演练（含删除清单、猜测记录与指南缺失）、示例删除演练、反馈核对表与最终 verify 证据。

  **Commit**
  - `test(template): record replication drills and final acceptance for web absorption`

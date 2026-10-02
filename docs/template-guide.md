# 模板使用指南

本指南是使用方（含 Agent）基于本模板演进的入口。工程形态的唯一事实来源是根目录 [project.manifest.json](../project.manifest.json)（[schema](../project.manifest.schema.json)）：改包、命令、测试项目或发布设置时先改清单，再改代码。四份 `AGENTS.md` 给出分层的硬约束，本指南给出能力清单、推进流程与替换点地图。

## 能力地图

下表沿用模板通用化的能力保全清单：示例业务被删除或被替换后，每项能力仍由以下文件承载，并由仍会运行的测试或门禁证明。

| 能力 | 承载文件 | 验证方式 |
| --- | --- | --- |
| pnpm workspace、Vite 双格式与声明、TS 分层配置、ESLint | 根 [package.json](../package.json)、各包 `vite.config.ts`、`tsconfig.*.json`、[eslint.config.js](../eslint.config.js) | `pnpm build`、`pnpm typecheck`、`pnpm lint` |
| 三包边界与产品交付 | `template-engineering` ENG-01、[scripts/check-package.ts](../scripts/check-package.ts) | `SCN-TEMPLATE-ENGINEERING-001`、`SCN-TEMPLATE-EXAMPLE-001` |
| 分层、端口、依赖方向、`wx` lint、业务目录隔离 | [.dependency-cruiser.cjs](../.dependency-cruiser.cjs)、[eslint.config.js](../eslint.config.js)、[packages/sdk/AGENTS.md](../packages/sdk/AGENTS.md) | `SCN-TEMPLATE-EXAMPLE-008`、`SCN-TEMPLATE-ENGINEERING-002` |
| 架构与质量门禁、使用指南守护 | `template-engineering` ENG-02/ENG-06、[scripts/check-architecture.ts](../scripts/check-architecture.ts) | `SCN-TEMPLATE-ENGINEERING-002`、`SCN-TEMPLATE-ENGINEERING-005`、`SCN-TEMPLATE-ENGINEERING-006` |
| 公共类型中文注释进入双格式声明 | `template-engineering` ENG-03 | `SCN-TEMPLATE-ENGINEERING-003` |
| 编译期公共类型契约测试（`@ts-expect-error` 反例、联合类型 `never` 穷尽、只读字段） | [packages/sdk/src/example/contracts.test.ts](../packages/sdk/src/example/contracts.test.ts) | `SCN-TEMPLATE-EXAMPLE-001` |
| ProtoGen 生成与来源状态 | [proto-gen.yaml](../proto-gen.yaml)、[proto-gen.lock](../proto-gen.lock)、`proto:*` 命令 | `pnpm proto:validate`、`pnpm proto:status` |
| IDL 协议义务派生与覆盖 | `protocol-contract` PC-01、[scripts/lib/contract-inventory.ts](../scripts/lib/contract-inventory.ts) | `SCN-PROTOCOL-CONTRACT-001`、`SCN-PROTOCOL-CONTRACT-002` |
| 手写错误码事实与 Go 来源校验 | `protocol-contract` PC-02、[packages/protocol/src/errors](../packages/protocol/src/errors)、[SCN-PROTOCOL-CONTRACT-003 Fixture](../packages/e2e/tests/fixtures/SCN-PROTOCOL-CONTRACT-003) | `SCN-PROTOCOL-CONTRACT-003` |
| 协议执行器（公共上下文、Token、预算、取消） | [packages/protocol/src/client.ts](../packages/protocol/src/client.ts)、[packages/protocol/src/transport](../packages/protocol/src/transport) | `packages/protocol/src/client.test.ts`、`SCN-PROTOCOL-CONTRACT-002` |
| 四条 OpenSpec 硬规则与三份格式 schema | [AGENTS.md](../AGENTS.md)、[scenario-gate.config.schema.json](../scenario-gate.config.schema.json)、[scripts/verification.schema.json](../scripts/verification.schema.json)、[scripts/flow.schema.json](../scripts/flow.schema.json) | `SCN-SCENARIO-GATE-001`、`SCN-SCENARIO-GATE-002`、`SCN-SCENARIO-GATE-003`、`SCN-SCENARIO-GATE-004`、`SCN-SCENARIO-GATE-006`、`SCN-SCENARIO-GATE-007`、`SCN-SCENARIO-GATE-008` |
| 覆盖对账与证据有效性（三类验证、FLOW 连续性、skip、过期） | `scenario-gate` GATE-07/GATE-08、[scripts/check-scenarios.ts](../scripts/check-scenarios.ts) | `SCN-SCENARIO-GATE-009`、`SCN-SCENARIO-GATE-010` |
| 可配置 ID 格式 | `scenario-gate` GATE-09、[scenario-gate.config.json](../scenario-gate.config.json) | `SCN-SCENARIO-GATE-011` |
| Scenario/case/FLOW 绑定、Fixture、报告器 | [define-case.ts](../packages/e2e/src/cases/define-case.ts)、[fixture-loader.ts](../packages/e2e/src/cases/fixture-loader.ts)、[scenario-reporter.ts](../packages/e2e/src/reporters/scenario-reporter.ts)、[scripts/check-fixtures.ts](../scripts/check-fixtures.ts) | `pnpm check:fixtures`、`pnpm test:integration`、`FLOW-TEMPLATE-EXAMPLE-001` |
| 手写代码 100% 覆盖 | [vitest.config.ts](../vitest.config.ts) | `pnpm test:unit` |
| Shadow 网关与外部交互替身标准 | [packages/protocol/testing](../packages/protocol/testing)、[packages/e2e/AGENTS.md](../packages/e2e/AGENTS.md) | `SCN-TEMPLATE-EXAMPLE-009`、`SCN-PROTOCOL-CONTRACT-002` |
| 微信开发者工具自动化与执行约定 | [packages/e2e/src/drivers](../packages/e2e/src/drivers)、[packages/e2e/AGENTS.md](../packages/e2e/AGENTS.md) | `SCN-TEMPLATE-EXAMPLE-002`、`SCN-TEMPLATE-EXAMPLE-004` |
| 统一发布入口与版本策略 | `template-engineering` ENG-04、[scripts/sdk-release.ts](../scripts/sdk-release.ts)、[scripts/check-release.ts](../scripts/check-release.ts) | `SCN-TEMPLATE-ENGINEERING-004` |
| OpenSpec 工作流与长期约定载体 | 四份 `AGENTS.md`、本指南、[docs/engineering/bootstrap.md](./engineering/bootstrap.md) | 本模板 Change 的生命周期 |

## 从方案到验收

模板把"规划 → 评审 → 实现 → 验收 → 归档"固化成一条链，每一步都有可运行的门禁与证据。

1. **OpenSpec 规划**：用 `/change plan <change>` 在 `openspec/changes/<change>/` 下写 proposal、specs、design、tasks。需求与场景先进 Spec；每个 Scenario 带 `json verification` 元数据，FLOW 行必须符合格式 schema。
2. **Plan Review**：`/change plan-review <change>` 冻结规划 digest 并派发独立评审；digest 变化即作废本轮结论。未通过不得实施。
3. **实现**：`/change apply <change> --commit` 在独立 worktree 中按 Task 实施；每个 Task 的验收索引写入 `artifacts/<run-id>/tasks/`。
4. **快速门禁**：`VERIFY_RUN_ID=<run-id> pnpm check:fast`。它依次运行 `pnpm proto:validate`、`pnpm proto:status`、`pnpm lint`、`pnpm build`、`pnpm typecheck`、`pnpm check:architecture`、`pnpm test:unit`、`pnpm check:fixtures`、`pnpm test:integration` 与 `pnpm check:package`，手写代码四项覆盖率要求 100%。
5. **平台用例**：按 [packages/e2e/AGENTS.md](../packages/e2e/AGENTS.md) 的约定逐文件运行小程序用例，每个文件前退出开发者工具主进程并预热约 25 秒；每个文件一份报告。
6. **场景门禁**：`VERIFY_RUN_ID=<run-id> pnpm check:scenarios`，用 unit、integration 与全部 weapp 报告对账 Spec、绑定与证据；退出码 0 且问题数为 0 才算通过。默认读取 `artifacts/<run-id>/reports/`，也可用 `--report` 逐个指定报告。
7. **归档**：`/change archive <change>`。归档前确认清单、绑定、报告与来源摘要仍然一致。

证据位置：报告、覆盖率与验收索引都在 `artifacts/<run-id>/`（`reports/`、`coverage/`、`tasks/`）。`VERIFY_RUN_ID` 决定 `artifacts/<run-id>/reports/` 下各报告的文件名，生成报告与对账必须使用同一个 run-id；未设置时回退到 `local`。

## 初始化方式

1. **复制模板（不带历史）**：以本仓库内容为基线创建使用方仓库，不带原仓库的历史与远端。
2. **安装工作流**：安装 Change Skill 或等价的 `openspec-workflow` 工作流。工作流 schema 不随模板提交，需要在使用方安装；本模板只要求 OpenSpec 根与 4 条硬规则。
3. **新建第一个 Change**：在使用方仓库里用一个 Change 完成改造：
   - 改根 [project.manifest.json](../project.manifest.json)：包目录与包名（`manifest.packages[].directory`、`manifest.packages[].name`）、允许目录、必需命令、测试项目与摘要目录；发布能力仍在时还要改 `manifest.release` 的项（如 `tagPrefix`）。改名范围自定：只改产品包，或连 protocol/e2e 包一起改，改后都要让清单、锁文件与门禁一致。
   - 包名或目录改动后同步：各包 `package.json` 与 `publishConfig`、[pnpm-lock.yaml](../pnpm-lock.yaml)（跑一次 `pnpm install` 更新软链与锁文件）；根 [package.json](../package.json) 的 build 过滤与脚本；[tsconfig.base.json](../tsconfig.base.json)、[tsconfig.test.json](../tsconfig.test.json)、[vitest.config.ts](../vitest.config.ts)、[eslint.config.js](../eslint.config.js)、[.dependency-cruiser.cjs](../.dependency-cruiser.cjs) 中含旧包名或旧路径的 glob（注意 `(sdk|e2e)` 这类交替组，按字面替换会漏改）；以及 [AGENTS.md](../AGENTS.md)、[README.md](../README.md) 中作为示例出现的包路径。
   - 按"替换点地图"替换或删除可替换点：协议来源、运行平台、包发布。
   - 以 [packages/sdk/src/example](../packages/sdk/src/example) 与 [packages/e2e/tests/example](../packages/e2e/tests/example) 为样板新增自己的业务模块：按工厂 → 核心 → 端口 → 适配器分层，业务目录之间不得互相导入，就近单测覆盖新代码以满足手写代码 100% 阈值。
   - 分层守卫按目录模式自动覆盖 `src/` 下除 `runtime/` 外的全部业务模块，新增模块无需修改配置：[.dependency-cruiser.cjs](../.dependency-cruiser.cjs) 的 `domain-core-no-generated`（core/ports 不得导入 generated）、`core-no-platform-or-node`（不得依赖 Node 内置模块）、`domain-isolation`（业务模块互不导入），以及 [eslint.config.js](../eslint.config.js) 的 `no-restricted-globals: wx`。业务模块须使用 `core/`、`ports/` 目录名才受约束。需要对外时在 [packages/sdk/src/index.ts](../packages/sdk/src/index.ts) 导出。
4. **先加后删**：自己的业务覆盖到示例承担的能力后，再删除示例；删除时对应的 Scenario、FLOW、Fixture 与用例一并处理。
5. **验收**：用"从方案到验收"的三项证明收尾：`pnpm check:fast`、逐文件 weapp、场景门禁。

五条维护规则：

- 删除或替换"替换点地图"中的某一项后，对应的三级标题仍要保留，正文改写为"本项目已删除……"或"本项目已替换为……"，不要删掉标题本身。
- 指南中引用、但已随该项删除的 Scenario ID 必须同时删除，否则事实一致性检查会报"未登记的 Scenario ID"；能力地图中对应行的承载文件与验证方式也要同步。
- 删除代码常会让"手写代码 100% 覆盖"失去覆盖来源，`pnpm test:unit` 的覆盖率阈值会失败；删除后同步处理受影响的单测与用例，不要靠豁免覆盖率。
- 仓库里还有未归档 Change 时，主 Spec 与它的 Spec delta 必须一致：删除主 Spec 的 Requirement 会让引用它的 `MODIFIED`/`REMOVED` delta 失效，`pnpm check:fast` 的 Spec 清单校验随之失败；先同步处理或先归档该 Change。
- 删除能力后同步更新 [README.md](../README.md) 与各 `AGENTS.md` 中声明该能力的句子，以及根 [package.json](../package.json)、[vitest.config.ts](../vitest.config.ts)、[.gitignore](../.gitignore) 等引用已删文件的工程配置。

**扩展更多包**：清单 schema 与读取方当前认定 product、protocol、test 三种角色各一个包；角色、包数量与允许目录由 [project.manifest.schema.json](../project.manifest.schema.json) 与 [scripts/lib/project-manifest.ts](../scripts/lib/project-manifest.ts) 共同约束，扩展时同步修改两处与对应门禁。

**已知限制**：小程序自动化仍不稳定，开发者工具在同一主进程上重复 `launch` 可能挂起，预热约 25 秒只能消除冷启动超时；平台能力替身目前只有文字标准（[packages/e2e/src/drivers](../packages/e2e/src/drivers)），没有代码样例；替换点地图尚未在真实使用方验证，首次真实使用前请把发现登记为新 Change。

## 替换点地图

模板里有三类使用方通常需要改动的点：两个可替换实现点（协议来源、运行平台）与一个可删除模块（包发布）。每项列出涉及文件、清单中需要修改的项与验收门禁；项目内路径都写成相对链接，架构检查会保证它们存在。

### 协议来源

当前实现：IDL + ProtoGen。

- **涉及文件**：配置 [proto-gen.yaml](../proto-gen.yaml)、[proto-gen.lock](../proto-gen.lock) 与根 [package.json](../package.json) 的 `proto:*` 脚本/devDependency；生成代码 [packages/protocol/src/generated](../packages/protocol/src/generated) 及其消费方 [packages/protocol/src/client.ts](../packages/protocol/src/client.ts)（`RpcMethodMeta`）、[packages/protocol/testing/index.ts](../packages/protocol/testing/index.ts)、[packages/protocol/testing/shadow/idl-routes.ts](../packages/protocol/testing/shadow/idl-routes.ts)、[packages/protocol/testing/shadow/example/routes.ts](../packages/protocol/testing/shadow/example/routes.ts)、[scripts/lib/contract-inventory.ts](../scripts/lib/contract-inventory.ts)、[packages/protocol/src/errors](../packages/protocol/src/errors)（Go 来源校验）、[packages/sdk/src/example/adapters/trade-backend.ts](../packages/sdk/src/example/adapters/trade-backend.ts)、[packages/e2e/host/weapp/protocol-runner.ts](../packages/e2e/host/weapp/protocol-runner.ts)，以及引用生成类型的 e2e 用例（`SCN-PROTOCOL-CONTRACT-002`、`SCN-PROTOCOL-CONTRACT-003`、`SCN-PROTOCOL-CONTRACT-004`、`SCN-TEMPLATE-EXAMPLE-008`）；工程接线 [packages/protocol/package.json](../packages/protocol/package.json) 的 `./generated/*` 导出、[packages/protocol/vite.config.ts](../packages/protocol/vite.config.ts)、[vitest.shared.ts](../vitest.shared.ts) 的 `generated` 别名、[vitest.config.ts](../vitest.config.ts) 的覆盖率排除、[eslint.config.js](../eslint.config.js) 的忽略与 [.dependency-cruiser.cjs](../.dependency-cruiser.cjs) 的 `sdk-cross-package-exports-only`/`*-no-generated` 规则；证据 [packages/e2e/tests/fixtures/SCN-PROTOCOL-CONTRACT-003](../packages/e2e/tests/fixtures/SCN-PROTOCOL-CONTRACT-003) 的来源摘要；Spec [openspec/specs/protocol-contract/spec.md](../openspec/specs/protocol-contract/spec.md) 与文档 [AGENTS.md](../AGENTS.md)、[packages/protocol/AGENTS.md](../packages/protocol/AGENTS.md)。
- **清单需要修改的项**：`manifest.requiredCommands` 中的 `proto:validate`、`proto:status`、`proto:sync`；`manifest.fingerprints.sourceRoots`（覆盖新来源的源码目录）。换 IDL 时改 ProtoGen Consumer 登记（不在清单内）；换 OpenAPI 时新增路由来源，并替换协议义务派生与错误码来源校验，或明确不启用并修改 `protocol-contract` Spec。
- **验收门禁**：`SCN-PROTOCOL-CONTRACT-001`、`SCN-PROTOCOL-CONTRACT-002`、`SCN-PROTOCOL-CONTRACT-003`、`SCN-PROTOCOL-CONTRACT-004`，以及 `pnpm proto:validate`、`pnpm proto:status` 与 `pnpm check:fast`。

### 运行平台

当前实现：微信小程序。

- **涉及文件（测试侧）**：[packages/e2e/src/drivers](../packages/e2e/src/drivers)、[packages/e2e/host/weapp](../packages/e2e/host/weapp)、[packages/e2e/tests/weapp](../packages/e2e/tests/weapp)、[packages/e2e/vitest.config.weapp.ts](../packages/e2e/vitest.config.weapp.ts)、根 [package.json](../package.json) 的 `test:e2e:weapp` 脚本与 `check` 串联、[vitest.config.ts](../vitest.config.ts) 的 projects 列表。
- **涉及文件（生产侧）**：[packages/protocol/src/adapters/network/wechat-miniapp.ts](../packages/protocol/src/adapters/network/wechat-miniapp.ts) 与协议包根导出。生产网络工厂是 SDK 工厂与全部集成用例唯一的 `HttpPort`，根 `AGENTS.md` 硬规则 7 要求它具名导出；只去掉平台测试项目时保留它。替换或删除生产适配器属于更大的改动：要改公共 API、协议导出、Fixture 与多条 Spec（`SCN-TEMPLATE-ENGINEERING-001` 等），先决定目标再动手。
- **涉及文件（产品侧绑定）**：[packages/sdk/src/example/factory.ts](../packages/sdk/src/example/factory.ts)（导入 `createWechatMiniappHttp`，按 `runtime === 'wechat-miniapp'` 装配网络）、[packages/sdk/src/example/contracts.ts](../packages/sdk/src/example/contracts.ts) 的 `ExampleRuntime` 取值，以及 [SCN-TEMPLATE-ENGINEERING-003 Fixture](../packages/e2e/tests/fixtures/SCN-TEMPLATE-ENGINEERING-003/source-and-dual-declarations.json) 中 `ExampleRuntime` 的取值。换平台时同时调整这三处与示例的公共类型契约测试（[contracts.test.ts](../packages/sdk/src/example/contracts.test.ts)）；只去掉平台测试项目时保持不变。
- **清单需要修改的项**：`manifest.testProjects`（删除 platform 类项目或替换为新平台项目）、`manifest.fingerprints.hostRoots`、`manifest.requiredCommands` 中的 `test:e2e:weapp`、e2e 包 `manifest.packages[].allowedDirectories` 中的 `host`；Spec 中 `requiredIn` 含 `weapp` 的 case 与正文表述随之调整。
- **验收门禁**：`pnpm check:fast` 与替代平台项目的报告；保留小程序时按逐文件约定运行 weapp 用例。

### 包发布

当前实现：可删除模块。

- **涉及文件**：[scripts/sdk-release.ts](../scripts/sdk-release.ts)、[scripts/check-release.ts](../scripts/check-release.ts)、`template-engineering` ENG-04、[SCN-TEMPLATE-ENGINEERING-004 Fixture](../packages/e2e/tests/fixtures/SCN-TEMPLATE-ENGINEERING-004)、根 [package.json](../package.json) 的 `release:preflight` 与 `sdk-release` 脚本、各包 `publishConfig`，以及 [README.md](../README.md) 与各 `AGENTS.md` 声明发布能力的句子。注意 [scripts/check-package.ts](../scripts/check-package.ts) 只做打包产物与依赖边界检查，承载 `SCN-TEMPLATE-ENGINEERING-001`，不属于发布模块，不要删除。
- **清单需要修改的项**：删除 `manifest.release`。清单中只需删这一项：`release:preflight` 与 `sdk-release` 不在 `manifest.requiredCommands` 里，删除脚本后无需改其它清单字段；清单 schema 与读取类型保留可选 `manifest.release`，缺省即表示不再发布。
- **验收门禁**：`pnpm check:fast`；删除后同步删去指南、能力地图与 Spec 中引用的 `SCN-TEMPLATE-ENGINEERING-004`，并把本三级标题正文改写为"本项目已删除……"。

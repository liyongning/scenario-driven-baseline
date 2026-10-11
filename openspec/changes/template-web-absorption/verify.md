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

### Task 2 协议适配器接口、IDL 适配器迁移与 Shadow 引擎迁入测试包

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
  - 唯一失败为 SCN-TEMPLATE-ENGINEERING-008 的 `example-removal-scenarios`；`example-removal-fast` 通过。按 R5-M1 仅为任务 1–13 中途允许的后续未登记测试项目问题，归属任务 14。
  - 日志：`/tmp/task2-check-fast.log`。
- `SCENARIO_GATE_CHANGES=template-web-absorption pnpm test:affected`：退出码 1，计划 run id `affected-20261011T071950Z`。
  - 因工具配置变化按规则全量触发；unit 80/80 文件、409/409 用例通过。
  - integration 除上述允许失败外，`SCN-TEMPLATE-ENGINEERING-002/gate-reduction-review-evidence` 在并行负载下命中 5 秒超时。单独复跑该文件：10/10 用例通过，目标用例 1392ms；登记为本轮 OI 1 次，不属于 Task 2 业务失败。
  - 日志：`/tmp/task2-test-affected.log`；单独复跑日志：`/tmp/task2-scn002-rerun.log`。
- 最终复跑 `SCENARIO_GATE_CHANGES=template-web-absorption pnpm test:affected`：退出码 1，计划 run id `affected-20261011T123629Z`；按规则全量触发 `pnpm check:fast`。
  - unit：80/80 文件、409/409 用例通过。
  - integration：64 个文件通过、仅 SCN-TEMPLATE-ENGINEERING-008 的允许项失败；132/133 个用例通过。先前的 SCN-002 超时未复现，当前 OI 总数为 1、已关闭。
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
- freshness 与场景门禁在 weapp 通过后复核仍为预期状态；未执行任务 14、15 的演练，也未修改其 checkbox。

**Commit**

- `refactor(template): extract protocol adapters and move the shadow engine into the test package`

### Task 3 按产品形态区分的工程检查骨架

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
  - integration 66/67 文件、136/137 用例通过；唯一失败为 `example-removal-scenarios`，`example-removal-fast` 通过。按 R5-M1 归属任务 14。
  - 因该允许失败会截断 `check:fast` 后续步骤，另行执行 `pnpm check:package`、`pnpm check:bundle`、`pnpm check:component-tree`：退出码均为 0，当前 SDK 仓库分别得到 package `issues: []` 与两个 web-app 检查的 `checked: []`。
- `pnpm check:scenarios --change template-web-absorption`：退出码 1，共 45 条问题；全部属于 A2 期望集合之外的两类允许问题。
  - `openapi-unit` 未登记 11 条，归属任务 5；`app-unit` 未登记 13 条，归属任务 8；`browser` 未登记 21 条（含 `FLOW-WEB-EXAMPLE-001`），归属任务 10。
- `SCENARIO_GATE_CHANGES=template-web-absorption pnpm test:affected`：第一次 run id `affected-20261011T131556Z` 因工具配置变化全量触发 `check:fast`；SCN-SCENARIO-GATE-026 在并行负载下失败，单独以相同作用域复跑该文件通过。登记 OI 1 次，不属于 Task 3 业务失败。
- 最终复跑 `SCENARIO_GATE_CHANGES=template-web-absorption pnpm test:affected`：退出码 1，run id `affected-20261011T132434Z`；按规则全量触发 `pnpm check:fast`。
  - unit 82/82 文件、411/411 用例通过；integration 66/67 文件、136/137 用例通过；SCN-SCENARIO-GATE-026 通过（130.6 秒）。
  - 唯一失败仍为 SCN-TEMPLATE-ENGINEERING-008 的允许项，归属任务 14；先前 SCN-026 波动未复现，本轮 OI 总数累计为 2、均已关闭。
- freshness：结束检查 `PASS`，digest 与起始值一致；`git diff --check` 退出码 0。

**Review / Acceptance**

- `check:package` 在没有 SDK 形态产品包时直接成功；有 SDK 时仍只检查 SDK 与其绑定协议包。
- `check:bundle`、`check:component-tree` 已登记为根命令与清单必需命令，并串入 `check:fast`；当前骨架无 web-app 包时按空检查通过，具体产物与组件树规则留给任务 8、9。
- SCN-TEMPLATE-ENGINEERING-016 中“对模板自身清单运行注释门禁、web-app 包走源码模式”的模板事实推迟到任务 8；SCN-TEMPLATE-ENGINEERING-009 的模板排除事实推迟到任务 10。两项均已在任务 3 实现机制，承接任务负责模板自身 GREEN。
- 未执行任务 14、15 的演练，也未修改其 checkbox。

**Commit**

- `feat(template): select engineering checks by product form`

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
- 未发现需要在后续任务继续处理的缺陷；未执行任务 15、16 的演练，也未修改其 checkbox。

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

### Task 4 IDL 浏览器网络适配器、浏览器步骤执行器与生产实现集成

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

### Task 5 OpenAPI 协议包与契约命令

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

### Task 6 OpenAPI 执行器与协议适配器

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

### Task 7 Shadow 扩展：预览模式与部分响应后断开

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

### Task 8 Web 应用包骨架、前端架构规则与绑定 `web-openapi-browser`

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

### Task 9 Web 产物边界检查

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

### Task 9 后置修复：默认并发稳定性

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

### Task 10 浏览器平台点位

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

### Task 11 Web 示例

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

### Task 12 本地预览与开发代理

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

### Task 13 文档与地图

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

## Final Code Review 第 1 轮修复

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

## Task 14 OpenAPI 引擎证据与产品契约分离

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

- final1 run id `template-web-absorption-apply-task14-20261014T092800Z-final1`，`pnpm verify --change template-web-absorption` 整轮通过。
  - `check:fast`：exit 0，827013ms；unit 147/147 文件、594/594 用例，普通 integration 90/90 文件、150/150 用例，integration-heavy 14/14 文件、40/40 用例，覆盖率 100%。
  - `test:e2e:weapp`：exit 0，309625ms；6/6 文件、6/6 用例。`FLOW-TEMPLATE-EXAMPLE-001/weapp-normal` 首次 30008ms 超时，按 verify 的 per-file-retry 重新 prepare 后以 9666ms 通过；按验收方修订口径按通过计，不归为 OI。
  - `test:e2e:browser`：exit 0，44333ms；4/4 文件、20/20 用例。
  - `check:scenarios`：exit 0，2085ms；本 Change 场景对账通过，`issues: []`。
- final2 run id `template-web-absorption-apply-task14-20261014T094850Z-final2`，`check:fast` 通过（864380ms；unit 147/147、594/594，普通 integration 90/90、150/150，heavy 14/14、40/40），weapp 前两个文件 `SCN-PROTOCOL-CONTRACT-002` 与 `SCN-PROTOCOL-CONTRACT-008` 均为 1/1 通过；随后 `weapp:prepare` 报“180000ms 内未就绪：第 6 次探测超过 4983ms 未返回”，该步骤最终 exit 1，browser 与场景门禁未进入。
- final2 的中断归因于正式版微信开发者工具主进程僵死（PID 40334 状态 `UE`，`kill -9` 无效），不是模板缺陷、业务失败或 OI；续跑待环境恢复后使用 `--from test:e2e:weapp` 补跑。

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

## Task 15 示例删除演练

**规划与输入**

- 第 1 轮无上下文 Agent 在 `d411879` 的隔离副本中按指南同时删除 `template-example` 与 `web-example`，`check:fast` 在 typecheck 失败：`packages/web/src/app/platform/openapi-ports.ts` 与 `packages/web/src/store/example.test.ts` 仍引用已删除的示例模块或状态。
- 失败说明指南的两份删除白名单只覆盖了部分删除面，使用方照字面操作会留下共享文件引用；Task 15 checkbox 保持未勾选，本轮只修复指南与机械一致性门禁。

**根因与修复**

- 根因是 `SCN-TEMPLATE-ENGINEERING-008/example-removal.json` 已是副本删除演练的权威清单，但指南白名单和 `scripts/lib/example-whitelist.ts` 各自手写维护；原架构检查只核对静态条目是否出现在整篇指南中，不读取 Fixture，因此两者漂移时副本用例仍会全绿，而使用方按指南删除必然失败。
- 指南已补齐 Fixture 中遗漏的 Web 测试目录、平台运行文件、runtime 文件、组件测试、store 测试与 `SCN-WEB-EXAMPLE-facts.spec.ts`，并把模板与 Web 两段的目录、文件、glob 逐项写清。
- `example-whitelist.ts` 现在读取 SCN-008 Fixture；目录统一按尾斜杠、glob 展开为完整前缀路径，再分别校验它们是否出现在指南的 template-example 段与 Web 示例段。Fixture 不存在时不派生这些白名单要求。
- RED 反例在临时 Fixture 加入指南未登记的 `packages/web/src/fixture-only.ts`，原实现没有报错；GREEN 后架构检查报出 `missing removal whitelist entry packages/web/src/fixture-only.ts`，删除 Fixture 后同一临时根恢复无问题。

**Verification**

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
- Task 15 checkbox 暂不勾选；需由验收方使用新隔离副本重跑“移除模板示例”演练后决定。

## Task 16 复刻演练阻塞修复（交回前）

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

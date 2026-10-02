## Why

这是模板演进的第三步，也是收尾的一步。前两步（`2026-09-30-template-example`、`2026-10-02-remove-payment-business`）新增了中立示例，删除了全部支付业务，质量体系在示例与通用 Spec 上完整运行。但仓库仍然有两类问题，使它还不能作为模板交给使用方：

1. **项目形态写死在门禁代码里。** 三个包的目录名、包名、允许目录、必需命令、测试项目名、发布 registry、发布 tag 前缀、源码摘要目录，分别硬编码在 `scripts/check-architecture.ts`、`check-scenarios.ts`、`spec-inventory.ts`、`contract-inventory.ts`、`fingerprints.ts`、`check-package.ts`、`check-release.ts`、`sdk-release.ts` 与 `verification.schema.json`、`flow.schema.json` 的枚举里。使用方只要改名、换平台或去掉发布，就必须改门禁脚本，只能靠猜。
2. **仍带着支付身份。** 包名 `@daqian/payment-*`、目录 `packages/payment-*`、根包名 `infra-payment-sdk`、发布目标是支付 SDK 的 GitLab 项目 245、环境变量 `PAYMENT_RUN_ID`、用例元数据 `paymentCase` 等内部标识，以及 README 中的本机路径。

模板定位（用户确认）：AI 时代的前端项目模板，当前只交付 **SDK 领域模板**；其他场景（Web/Node SDK、普通 Web 项目、跨端项目）由使用方在此基础上演进。**质量体系是模板的核心。** 交付形态是一个大而全、可直接运行的模板，以"最小可运行"为标准；不做交互式脚手架、生成器或选项开关。使用方（主要是 Agent）照着样例删减、替换或扩展。

## What Changes

### 1. 项目清单驱动门禁

- 新增根目录 `project.manifest.json` 与其格式 schema `project.manifest.schema.json`（每个字段带中文说明）。清单登记：三个包（目录、包名、角色、是否私有、允许目录）、必需命令、测试项目及其类别（unit / integration / platform）、源码摘要目录、发布设置（registry、tag 前缀）。
- 上述门禁脚本改为从清单读取；`verification.schema.json`、`flow.schema.json` 不再枚举具体项目名，`requiredIn` 的合法取值与 kind 的匹配由门禁按清单中的项目类别校验；IDL 协议义务的运行环境由清单中 integration 与 platform 类项目推出。
- 使用方改名、去掉 weapp、去掉发布时，只改清单与对应文件，不改门禁代码。

### 2. 中立化

- 包目录改为 `packages/sdk`、`packages/protocol`、`packages/e2e`；包名改为 `@daqian/template-sdk`、`@daqian/template-protocol`、`@daqian/template-e2e`（私有）；根包名 `sdk-template`。ProtoGen 输出路径随之迁移（已在副本上验证：先改配置再 `proto:sync`，生成内容逐字节不变，锁文件只变路径与配置摘要）。
- 发布 registry 改为清单中的占位值（项目号 `<PROJECT_ID>`），预检遇到占位值拒绝发布；tag 前缀改为 `template-sdk-v`。
- 内部标识中立化：`PAYMENT_RUN_ID`/`PAYMENT_REPORT_FILE` → `VERIFY_RUN_ID`/`VERIFY_REPORT_FILE`；`paymentCase`、`payment-evidence`、`payment-flow`、`paymentBehavior`、`paymentBusinessErrors*`、`PaymentBusinessErrorDescriptor`、`__PAYMENT_TEST_RUNNER__`、测试别名 `@payment-test/*`、临时目录前缀与 weapp 宿主标题等一并改名。
- ProtoGen Consumer 身份（`consumerId: infra-payment-sdk`、source/output id）与 IDL 中原样生成的名称保留（用户决定：Consumer 与示例绑定，使用方替换的正是它）。

### 3. Shadow 路由与协议来源解耦

- Shadow 网关只接收中立的路由描述（方法名、HTTP 方法、路径），不再依赖 ProtoGen 生成的 `RpcMethodMeta`；IDL 只是其中一种路由来源，由独立的适配函数把生成的描述转换为中立路由。以后换成 OpenAPI 时，只需新增一种路由来源，Shadow 引擎不变。依赖规则禁止 Shadow 引擎导入 generated 代码。

### 4. 工作流 schema 交还使用方

- `openspec/schemas/openspec-workflow/` 不再随模板提交（加入 `.gitignore`）。门禁只依赖 4 条硬规则与 3 份格式 schema，不依赖工作流 schema；工作流由使用方提供（例如由 Change Skill 安装）。AGENTS 与 README 中的相应表述同步修改。

### 5. 使用指南与替换点地图

- 新增 `docs/template-guide.md`：能力地图（每项能力的承载文件与验证方式）、从方案到验收的流程、初始化方式（使用方在自己仓库中以第一个 Change 完成删改增，并由同一套门禁验收），以及**替换点地图**：可替换的实现点"协议来源"（当前为 IDL + ProtoGen）、"运行平台"（当前为微信小程序），可删除模块"包发布"。每项列出涉及文件、清单需改的项与验收门禁。
- 根 AGENTS.md 与 README 链接指南；架构门禁检查指南存在、被链接、链接可解析且包含规定章节。
- 根与各包 AGENTS.md、README 去掉支付身份与本机路径；修正两份主 Spec 的 Purpose 占位文字。

### 6. 上一步遗留的小项

- weapp 预热时长改为约 25 秒；ENG-003 注释检查补上 `requestContext` 的子字段；删除引用已删除场景的过时注释。

### 非目标

- 不做交互式脚手架、生成器、选项开关；不实现 OpenAPI 路由来源、Web/Node 平台或业务应用骨架，只标清接缝。
- 不替换 IDL，不修改 ProtoGen Consumer 登记；不修改已归档 Change。
- 不修复微信开发者工具自动化的已知不稳定问题。
- 不改变三类包角色"各一个"的骨架；需要更多包时由使用方扩展清单与门禁（指南说明）。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `template-engineering`：新增 ENG-05（项目清单驱动工程门禁）、ENG-06（使用指南与替换点地图）；修改 ENG-04（发布目标来自清单，占位值拒绝发布）。
- `scenario-gate`：修改 GATE-05（kind 与运行环境的匹配改为按清单中的项目类别校验，不再写死项目名）。
- `protocol-contract`：新增 PC-03（Shadow 路由使用中立描述，协议来源可替换）。

## Impact

- 门禁脚本与两份格式 schema：改为读取项目清单；新增清单 schema。
- 三个包：目录与包名改名；ProtoGen 输出路径迁移；协议包 testing 的 Shadow 路由类型与来源拆分。
- 测试与 Fixture：改名带来的路径与绑定更新；新增清单、指南、Shadow 中立路由的用例；Fixture manifest 中的源文件路径与摘要随改名刷新。
- 文档：新增使用指南；根与各包 AGENTS.md、README、`docs/engineering/bootstrap.md` 更新。
- 运行要求：每个任务后 `pnpm check:fast` 通过；最终验收为 `check:fast`、逐文件 weapp、以全部报告运行的场景门禁三者退出码 0。

## Why

模板目前只有一套具体实现：Headless SDK + IDL（ProtoGen）+ 小程序。第一个真实使用方 xueshan_fe 的形态是 Web 应用 + OpenAPI + 浏览器，它在模板之外自行补齐了应用骨架、OpenAPI 协议链路、Playwright 浏览器平台、产物边界检查和本地 Mock 预览，并沉淀出状态分层、组件拆分等前端架构规范。如果模板不吸收这些能力，下一个 Web 项目还得再造一遍。

同一真实项目只有一个样本，现在就抽象"核心 + 产品/协议/平台三维度模块框架"有抽错边界的风险。所以本 Change 不做模块化框架，而是把 Web 能力作为**第二套具体实现**并列放进模板，沿用替换点地图的写法：每个替换点从"一种做法"变成"两种可选"。等第三个真实项目出现后，再决定是否抽象。

本 Change 以 `template-core-hardening` 为前提，复用其中的清单扩展、手写源码清单、Fixture 来源模型、契约同形校验接口、Shadow 改造、按需测试、验收入口与复刻验收方法。

## What Changes

**清单与组合绑定**
- 清单允许每种角色有多个包。模板仓库自己同时包含两个产品包和两个协议包，使用方通常每种角色各留一个。
- 新增"产品 ↔ 协议 ↔ 平台"的组合绑定：协议义务、`defineCase` 运行环境、默认报告与命令组成都按绑定取值，避免 IDL 义务要求浏览器证据、OpenAPI 义务要求小程序证据这类交叉误报。
- 依赖与平台规则按角色和绑定生成，覆盖新增的包。

**Web 应用产品包（与 `sdk` 并列）**
- 用官方脚手架（create-vue）初始化，技术栈 Vue 3 + Vite + Pinia；`.vue` 接入覆盖率、tsconfig、vue-tsc、ESLint 单一根配置与 depcruise，Vitest `root` 固定在仓库根。
- 前端架构规范写入包级 AGENTS.md 并尽量机械化：
  - 树形结构与就近原则（组件目录：入口、hook、样式、`components/` 子树、就近工具）；
  - 状态分层（组件 / 模块 / 全局 store），全局 store 只能由自身 action 修改，组件写 store 由 lint 拦截；
  - UI 层与核心层分层、核心层 DOM 禁令；
  - `domain-isolation` 下共享代码、装配根、跨模块平台适配器的放置模型（在装配点注入）；
  - 产品代码不得有 Mock 分支，部署配置只允许在装配入口读取 `import.meta.env`。
  - Vue 结构上不可达分支的处理方式（改写结构或抽成纯函数），保持 100% 覆盖率。
- 产物边界检查 `check:bundle`：按模块来源判定测试设施是否进入产物、产物模块与源码摘要对账、编译后 CSS 不得残留 `:deep(` 等伪选择器；模块清单生成到 `dist/` 之外，不随部署公开。
- 中文注释门禁的源码模式（应用不产出声明文件）。

**OpenAPI 协议包（与 IDL `protocol` 并列）**
- 契约同步命令（`api:validate`、`api:status`、`api:sync`）与 lock，作为协议来源登记到清单。
- openapi-typescript 生成类型；接口表与业务错误码表从契约生成，错误码处理完备性检查；REST 执行器（路径参数、身份头、响应信封解析、`X-Request-Id`）。
- 协议义务按接口粒度派生（路由、身份头、请求 ID、信封、每个业务码、传输失败、请求体等），不派生叶子字段义务；消费接口按产品声明派生并双向检查（沿用核心 Change 的机制）。
- OpenAPI 路由来源与响应校验器接入 Shadow；Fixture 多信封"必须认领"模型（不提供"只放过多出字段"的宽松认领）；契约已知缺陷的规范化钩子。
- 精简接口表由生成器产出，完整契约不进入生产产物。

**浏览器平台点位（`e2e` 包内，与小程序并列）**
- Playwright 驱动、`vite preview` 同源代理宿主（`/api` → Shadow，固定 `127.0.0.1`）、`browser` 测试项目及清单登记。
- 执行约定：精确版本、视口与 DPR、时区与 locale、每个 case 独立 context；运行前校验 dist 与源码摘要一致，避免测旧产物。

**IDL 协议包补浏览器网络适配器**
- 基于 `fetch` 的 `HttpPort` 实现，使"Web 应用 + IDL + 浏览器"组合可用。

**本地预览**
- 核心部分：Shadow 预览模式（只做序列状态：按顺序取响应、最后一条重复、按路径参数匹配；不严格计数，不模拟业务状态）与预览数据集（Fixture 下的非场景数据目录，同样做契约同形校验）。
- 浏览器接线：一条启动命令，以 Fixture 数据驱动页面，供开发者与用户本地查看效果；预览与开发代理（转发到真实服务端）作为两种独立模式。
- AGENTS 中"Shadow 只服务测试"改为"服务测试与本地预览，均不进入生产产物"，三种模式只在宿主或代理层切换。

**文档与地图**
- 能力地图、替换点地图（产品、协议、平台三个点位各两种选项，新增本地预览点位）、技术架构文档同步。
- 各新包与模块的 AGENTS.md / CLAUDE.md 按核心 Change 的项目地图规则补齐。

**验收（本轮迭代的最终验收）**
- 确定性门禁：最终提交上 `pnpm verify` 全绿，场景门禁问题数为 0。
- 三个复刻演练（方法见核心 Change 沉淀的指南"复刻验收"）：
  1. 支付 SDK 复刻重跑（SDK + IDL + 小程序），证明 SDK 形态未退化；
  2. xueshan 纵切片复刻（Web 应用 + OpenAPI + 浏览器）：一个页面、2–3 个接口，含轮询、状态分层与本地预览；
  3. 交叉复刻（Web 应用 + IDL + 浏览器）：一个页面、1–2 个接口。
- 对照 xueshan 的 62 条反馈，逐条核对已纳入两个 Change 范围的问题在演练中均未复现。

## Capabilities

### New Capabilities

- `web-app`：Web 应用产品包的结构、前端架构规范、产物边界与本地预览。
- `openapi-contract`：OpenAPI 协议来源、生成、执行器、义务派生、错误码与 Shadow 接入。
- `browser-platform`：浏览器平台点位的驱动、宿主、执行约定与证据。
- `web-example`：Web 应用示例（中立的交易领域，Web 应用 + OpenAPI + 浏览器），与 `template-example` 一样可按白名单删除。

### Modified Capabilities

- `template-engineering`：清单多包与组合绑定、按产品形态区分的工程检查（typecheck、注释发现、产物边界）、依赖规则按绑定生成、能力地图与替换点地图的两种选项。
- `protocol-contract`：义务派生、响应校验与 Fixture 检查改为按协议适配器插拔（核心 Change 中的 IDL 实现作为第一种适配器）；IDL 协议包的浏览器网络适配器；Shadow 预览模式与"部分响应后断开"故障。
- `scenario-gate`：协议义务与运行环境按组合绑定取值；预览数据集的 Fixture 校验。

## Impact

- **新增包**：Web 应用产品包、OpenAPI 协议包（目录名与包名在 design 中确定）。
- **修改**：`packages/e2e`（浏览器驱动、宿主、用例、预览数据集）、`packages/protocol`（浏览器适配器、Shadow 预览模式）、清单与 schema、依赖规则、ESLint/Vitest/tsconfig 配置、根 scripts、文档。
- **依赖**：新增 vue、pinia、@vitejs/plugin-vue、@vue/test-utils、jsdom、vue-tsc、eslint-plugin-vue、openapi-typescript、playwright（库，由 Vitest 驱动，不引入 @playwright/test）等，版本以规划阶段实验结果为准；TypeScript 保持 5.x（openapi-typescript 与 typescript-eslint 的 peer 范围）。
- **前提**：`template-core-hardening` 完成并归档。
- **不在范围**：UI 还原与一次性验收能力（单独立项）、服务端状态管理、模块化框架、存量项目升级工具。

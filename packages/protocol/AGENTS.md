# packages/protocol/AGENTS.md

## 模板通用规则

### 必读

- [根 AGENTS](../../AGENTS.md)、[有效能力 Spec](../../openspec/specs/)、[仓库与跨仓库参考](../../README.md)、[模板使用指南](../../docs/template-guide.md)。

### 按示例扩展新业务

新业务只通过协议包公开入口消费生产能力；generated 由获准工具维护，`testing/` 与 Shadow 负责测试宿主，不把业务场景写进通用协议引擎。

- `src/generated/` 只由获准 ProtoGen 管理；不在其中增加手写 index、测试或 AGENTS，不编辑生成 DTO、codec 或 metadata。
- ProtoGen 是项目根 devDependency，经项目 `pnpm proto:*` 命令或 `pnpm exec` 执行；安装/升级查私有 registry 最新正式版并保存精确版本与锁文件，不使用全局工具。生成顺序为 proto:version → proto:validate → proto:status；需要更新时 proto:sync → proto:status。
- 客户端按实例绑定配置/provider/transport，消费 generated method.meta 与 codec；`transport/` 维护公共 Header/BaseReq 与通信错误；网络适配只封装平台 HTTP。不配置全局 handler、不刷新登录态、不自动重放请求。
- 协议包不引用 SDK/E2E 类型，不解释业务结果；返回 decoded 协议、只供校验的 wire 与 HTTP 上下文供上层映射，且不得把原文输出到诊断。生成契约保留 optional 字段的 presence，codec 区分省略与显式值；不手写数字常量、DTO 或 codec，不在网络层选择环境。
- `testing/` 只供测试：测试依赖不得进入生产导入图和 tarball；Shadow 引擎只执行 E2E 提供的步骤与故障，不保存业务场景。Shadow 路由来自协议来源（当前由 IDL 生成描述转换）：新增业务路由时在 `testing/shadow/<业务>/routes.ts` 从该来源发现方法，并通过 `createShadowServer({ routes })` 注入；依赖规则 `shadow-engine-no-generated` 保证引擎文件不导入 ProtoGen 生成代码，生成描述只出现在 `idl-routes.ts` 与 `example/`。
- `src/` 与 `testing/` 内手写逻辑就近维护单测；协议集成与 Fixture 在 E2E。修改本包执行 protocol-unit、生成状态、类型/构建及受影响协议/流程测试；交付前执行根 `pnpm check:fast`。
- generated lock 来源与手写错误目录的事实来源分别验收：`src/errors/*.ts` 以 IDL Go 原文为唯一来源，并配 E2E 的独立 Go 样例与一致性/漂移校验；不得从 canonical 名称、文案或位段推断细分码，也不得反向改写固定样例。

### 外部交互替身的设计标准

服务端接口由 Shadow 网关承载：路由从 generated metadata 发现，按 Fixture 编排响应与故障。平台或第三方能力（例如小程序收银台、系统能力）由平台能力替身承载：在产品包中定义端口，适配器调用真实平台 API，替身放在 `packages/e2e/src/drivers/`，经用例注入。不提供“真实服务端 + 替身”或“替身服务端 + 真实平台能力”的混合模式；真实外部验收由真实消费方项目承担。weapp 用例仍通过真实 `wx.request` 访问 Shadow。

### IDL 协议义务派生

协议义务派生的方法集合来自示例协议的 `CreateTrade`、`QueryTrade`；字段策略与待定项以 `protocol-contract` 的 PC-01 为准，派生器“待定字段为 0”是完成条件。新增 IDL 字段不能只刷新来源摘要而跳过覆盖。

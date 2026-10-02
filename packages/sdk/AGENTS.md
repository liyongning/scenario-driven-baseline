# packages/payment-sdk/AGENTS.md

## 模板通用规则

### 必读

- [根 AGENTS](../../AGENTS.md)、[有效能力 Spec](../../openspec/specs/)、[仓库与跨仓库参考](../../README.md)。

### 按示例扩展新业务

新业务以 `src/example/` 为参照，按工厂 → 核心 → 端口 → 适配器分层。

- `src/index.ts` 是唯一公共导出：工厂校验配置并装配客户端，内部测试工厂不进入公共 exports。
- 核心只编排内部端口；端口定义边界；适配器是外部协议映射的唯一位置，也是唯一接触 generated 的位置。业务目录之间不得互相导入，可共用的只有 `runtime/` 与协议包公开入口。
- HTTP 执行与公共请求上下文由协议包负责，SDK 不另写 HTTP 层；核心不依赖平台全局（wx/DOM/Node），平台调用只在对应适配边界按调用读取。
- 宿主只提供已定义的配置与 provider；SDK 不做登录、Token 刷新、OpenID 输入、签名生成与 UI/权益/导航逻辑。
- 每个手写模块的 `*.test.ts` 就近维护，module case 用现有 Vitest meta 绑定检查点；不新增 SDK 公共测试导出，也不反向依赖 E2E helper。跨包行为证据在 `packages/e2e`，不能用内部假端口的单测代替。
- 修改本包执行 sdk-unit、类型、构建及相关受影响场景；交付前执行根 `pnpm check:fast`。契约缺口先更新 Spec 再评审，不在实现中猜测。

### 依赖规则与平台限制

`example-core-no-generated` 防止核心和端口绑定传输模型，`domain-isolation` 防止产品包内不同业务模块目录互相导入。`eslint.config.js` 中 core/ports 的 `wx` 限制防止平台全局穿透核心层；平台调用必须留在适配器边界。

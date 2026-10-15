# packages/openapi/AGENTS.md

## 模板通用规则

### 必读

- [根 AGENTS](../../AGENTS.md)、[有效能力 Spec](../../openspec/specs/)、[仓库与跨仓库参考](../../README.md)、[模板使用指南](../../docs/template-guide.md)。

### OpenAPI 协议包

契约、来源 lock 与生成物只按清单登记消费；完整契约只供测试证据和适配器使用，不进入生产入口或产物。产品契约与其约定位于 `contracts/`，引擎测试契约与其约定位于 `testing/engine/`，产品替换不得迫使引擎用例或 `scripts/` 门禁改写。

- `contracts/` 保存可替换的产品契约、lock 与 `conventions.ts`；契约和 lock 的路径只从 `project.manifest.json` 的 `packages[].contract` 读取，业务码约定只经同目录约定模块解释。
- `src/generated/` 只由 `pnpm api:sync` 生成，包含 schema 类型、精简接口描述与业务码表；不得手工编辑，不含描述、示例、Fixture 标记或完整契约。
- `testing/` 保存产品 bundle、测试适配器与独立的 `engine/` 测试载体；生产源码、根入口与构建产物不得导入该目录或 `contracts/`。
- 运行时信封只按可配置的 `code`、`message`、`data` 字段与成功状态码判定；未知响应字段可由执行器忽略，但 Fixture、Shadow 响应与契约校验必须严格同形，不得提供宽松认领开关。
- 根入口与 `./generated/*` 是唯一公开入口，必须同时产出 ESM、CommonJS 与两套类型声明；不得新增平台子路径或测试出口。
- `api:validate` 负责 redocly lint 与码表自洽；`api:sync` 的来源必须由参数传入；`api:status` 校验版本、契约摘要、生成物集合与每个文件摘要。
- 修改契约后依次运行 `pnpm api:sync <来源>`、`pnpm api:validate`、`pnpm api:status`，再执行类型检查、构建与受影响用例；密钥、Token 与会话凭据不得写入契约、Fixture 或日志。

### 子模块

- `packages/openapi/src/adapters`：浏览器网络工厂与 `HttpPort` 实现。
- `packages/openapi/src/ports`：网络端口与取消边界。
- `packages/openapi/src/rest`：REST 执行器与公共客户端。
- `packages/openapi/src/transport`：请求 ID 等传输辅助能力。
- `packages/openapi/testing/engine`：与产品契约分离的引擎测试契约、约定与生成物。

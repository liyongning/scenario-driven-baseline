# packages/openapi/AGENTS.md

## 模板通用规则

### 必读

- [根 AGENTS](../../AGENTS.md)、[有效能力 Spec](../../openspec/specs/)、[仓库与跨仓库参考](../../README.md)、[模板使用指南](../../docs/template-guide.md)。

### OpenAPI 协议包

契约、来源 lock 与生成物只按清单登记消费；完整契约只供测试证据和适配器使用，不进入生产入口或产物。

- `contracts/` 保存 OpenAPI 契约及其 lock；契约和 lock 的路径只从 `project.manifest.json` 的 `packages[].contract` 读取。
- `src/generated/` 只由 `pnpm api:sync` 生成，包含 schema 类型、精简接口描述与业务码表；不得手工编辑，不含描述、示例、Fixture 标记或完整契约。
- `testing/` 保存 bundle 后的完整契约与后续测试适配器；生产源码、根入口与构建产物不得导入该目录或 `contracts/`。
- `api:validate` 负责 redocly lint 与码表自洽；`api:sync` 的来源必须由参数传入；`api:status` 校验版本、契约摘要、生成物集合与每个文件摘要。
- 修改契约后依次运行 `pnpm api:sync <来源>`、`pnpm api:validate`、`pnpm api:status`，再执行类型检查、构建与受影响用例；密钥、Token 与会话凭据不得写入契约、Fixture 或日志。

### 子模块

无。

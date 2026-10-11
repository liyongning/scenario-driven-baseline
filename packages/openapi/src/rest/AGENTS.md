# packages/openapi/src/rest/AGENTS.md

## 职责

按生成描述构造 OpenAPI REST 请求，映射路径、身份头与请求 ID，并把响应转换为判别联合结果。

## 对外入口

- `client.ts` 导出 `createRestClient`、默认信封约定与公共请求、结果、身份类型。

## 允许依赖

- 依赖 `../ports/`、`../transport/` 与生成的精简描述；不导入完整契约、Shadow、Fixture 或测试适配器。

## 本地约束

- 不写死接口名、身份头名或成功业务码；方法、路径、安全方案与业务码只读生成描述。
- 运行时忽略成功响应中的契约外字段，但测试数据严格同形由协议测试适配器承担。

## 子模块

无

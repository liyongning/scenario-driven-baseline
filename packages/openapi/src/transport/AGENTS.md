# packages/openapi/src/transport/AGENTS.md

## 职责

为 OpenAPI 请求生成标准 `X-Request-Id`，不解释业务结果。

## 对外入口

- `request-id.ts` 导出 `createRequestId`。

## 允许依赖

- 只使用 ECMAScript 标准能力；不依赖平台全局、生成代码、契约 bundle 或测试代码。

## 本地约束

- 每次请求生成新值并保持协议约定格式；公共入口不提供覆盖请求 ID 的注入通道。

## 子模块

无

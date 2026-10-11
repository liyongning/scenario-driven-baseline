# packages/openapi/src/adapters/AGENTS.md

## 职责

封装浏览器网络能力并实现 `HttpPort`；本模块是 OpenAPI 包中唯一接触平台全局的位置。

## 对外入口

- `network/fetch.ts` 导出 `createFetchHttp`，由 `src/index.ts` 具名转导出为平台网络工厂。

## 允许依赖

- 只依赖 `../ports/` 与 `../transport/` 的类型；不导入契约 bundle、生成描述或测试适配器。

## 本地约束

- 工厂构造时不读取 `globalThis.fetch`，只在发送时读取；不自动重放请求，不解释业务信封。
- 请求固定使用同源凭据与禁用缓存策略；超时和取消以自有计时器及 `AbortController` 区分，结果只交付一次。

## 子模块

- `network/`：浏览器网络适配实现。

# packages/openapi/src/ports/AGENTS.md

## 职责

定义 REST 执行器与宿主之间的网络端口和取消边界。

## 对外入口

- `http.ts` 导出 `HttpPort`、`HttpRequest`、`HttpResponse` 与 `Cancellation`。

## 允许依赖

- 只声明公共类型与调用契约；不依赖生成代码、平台全局、Node 内置模块或测试代码。

## 本地约束

- 端口只声明能力，不实现平台调用；公共类型与字段维护中文注释并保留公共 JSDoc。

## 子模块

无

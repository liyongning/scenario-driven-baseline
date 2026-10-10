# packages/protocol/src/ports/AGENTS.md

## 职责

定义协议引擎与宿主之间的边界：网络端口与公共请求上下文。

## 对外入口

- `http.ts` 导出 `HttpPort`、`HttpRequest`、`HttpResponse`；`context.ts` 导出 `Cancellation`、`OperationContext`。

## 允许依赖

- 只依赖 `../transport/errors` 的结果类型；不依赖生成代码、平台全局与 Node 内置模块。

## 本地约束

- 端口只声明能力，不实现平台调用；平台调用留在 `../adapters/`。
- 公共类型与字段维护中文注释，保留公共 JSDoc。

## 子模块

无

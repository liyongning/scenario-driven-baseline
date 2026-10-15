# packages/protocol/testing/shadow/AGENTS.md

## 职责

把各协议来源转换为中立 Shadow 路由，不构造或执行引擎。

## 对外入口

- `idl-routes.ts` 从 generated 方法描述构造 IDL 路由；`declared-routes.ts` 从消费接口声明构造路由；`routes.ts` 定义协议侧中立路由类型；`example/` 提供示例路由来源。

## 允许依赖

- 可导入本协议包 generated 与 `testing/idl` 适配器，不得导入 `packages/e2e/`。
- 输出必须与 E2E 引擎的中立路由结构兼容，校验函数由适配器注入。

## 本地约束

- 缺少方法、路径、HTTP 方法或响应校验器时立即报错，不静默跳过。

## 子模块

- `example/`：示例协议的路由来源。

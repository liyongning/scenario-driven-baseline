# packages/protocol/src/errors/AGENTS.md

## 职责

把标识为业务失败的响应码映射为可读的业务错误，保留原始 IDL 错误描述，不解释业务结果。

## 对外入口

- `business-codes.ts` 导出 `businessErrors`、`getBusinessError`、`businessErrorsIdlCommit` 与 `BusinessErrorDescriptor` 类型。

## 允许依赖

- 只依赖生成代码（`../generated/idl/common/v1/enums`）的枚举；事实来源是 IDL 的 `error_code.go` 与 `error_contract.go` 原文。

## 本地约束

- 不从 canonical 名称、文案或位段推断细分码，也不反向改写固定样例；业务错误码保留 int64 精度。
- `retryable` 只描述服务端属性，不授权 SDK 自动重放。

## 子模块

无

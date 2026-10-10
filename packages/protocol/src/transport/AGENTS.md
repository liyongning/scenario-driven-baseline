# packages/protocol/src/transport/AGENTS.md

## 职责

维护公共 Header/BaseReq 与通信错误，装配协议客户端上下文，并按公司规范生成动态 `X-Request-Id`。

## 对外入口

- `context.ts` 导出协议上下文构造；`errors.ts` 导出 `CommunicationError` 与 `CommunicationResult`；`request-id.ts` 导出 `createRequestId`。

## 允许依赖

- 依赖生成代码（`../generated/idl/base`）与 `../ports/`；不引用 SDK/E2E 类型，不在网络层选择环境。

## 本地约束

- 请求 ID 按协议契约 PC-05：26 位 `yyyyMMdd_HHmmss_SSS_abcdef`，时间按北京时间，末尾 6 位小写字母默认由 `Math.random` 生成；小程序、浏览器、Node 共用一份同步实现，不按平台分支，也不引入运行时依赖。
- 生成契约保留 optional 字段 presence，codec 区分省略与显式值；不手写数字常量、DTO 或 codec。

## 子模块

无

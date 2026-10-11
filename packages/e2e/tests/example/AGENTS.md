# packages/e2e/tests/example/AGENTS.md

## 职责

`template-example` 能力的集成与流程用例，验证示例客户端从公共入口到结果的行为。

## 对外入口

- 各 `SCN-TEMPLATE-EXAMPLE-*.spec.ts` 与 `FLOW-TEMPLATE-EXAMPLE-001.spec.ts` 即用例；`example-harness.ts` 提供共享装配。

## 允许依赖

- 消费 SDK 包与协议包构建后的公开入口；仅替换外部 HTTP 服务与端侧平台 API，不 mock 协议执行器与 codec。

## 本地约束

- 测试期望来自有效 Spec、IDL 与 Design；每例独立场景状态，响应序列固定，额外/缺失请求必须断言。
- Fixture 在 `tests/fixtures/<owner-id>/`，步骤与断言写在 `*.spec.ts`。

## 子模块

无

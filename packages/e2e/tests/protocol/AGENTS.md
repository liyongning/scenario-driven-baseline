# packages/e2e/tests/protocol/AGENTS.md

## 职责

协议集成用例，验证协议包公共入口在真实网络替身下的请求、响应与错误行为。

## 对外入口

- `SCN-PROTOCOL-CONTRACT-*.spec.ts` 即用例；协议矩阵 Fixture 提供各接口的数据。

## 允许依赖

- 消费协议包构建后的公开入口；仅替换外部 HTTP 服务，Shadow 负责按 Fixture 编排响应与故障。

## 本地约束

- 测试期望来自协议 Spec、IDL 与 Design；成功流程检查交易引用、调用顺序/次数与最终结果，错误分支同时检查后续动作没有发生。
- 动态请求 ID 只记录并核验格式，不与请求头逐字段比对写死的固定值。

## 子模块

无

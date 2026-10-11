# packages/e2e/src/drivers/AGENTS.md

## 职责

外部交互替身的驱动：只替换端侧平台 API，保留协议执行器与 codec。

## 对外入口

- `weapp.ts` 导出连接、执行宿主函数与断开的驱动；集成网络经协议包根入口的 `createFetchHttp` 使用生产实现。

## 允许依赖

- 只实现协议包 `HttpPort` 或调用 `miniprogram-automator`；不 mock SDK 核心、基建映射、协议客户端或 codec。

## 本地约束

- helper 只负责连接、执行 SDK 测试函数、取回结果与必要清理，不自研连接协议、工具控制器、UI 交互框架或执行引擎。
- 就近维护 `*.test.ts`，纳入四项 100% 覆盖。

## 子模块

无

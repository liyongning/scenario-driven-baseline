# packages/e2e/tests/weapp/AGENTS.md

## 职责

小程序平台用例：在真实微信开发者工具中经 `wx.request` 访问 Shadow，证明平台网络适配的真实性。

## 对外入口

- 顶层 `SCN-PROTOCOL-CONTRACT-*.spec.ts` 与 `example/` 下示例用例；执行依赖宿主 runner 与 weapp driver。

## 允许依赖

- 从已构建的协议包根使用生产网络适配；SDK 用例调用 SDK 公共工厂，不自写 HttpPort 绕过生产网络适配。

## 本地约束

- 按 `packages/e2e/AGENTS.md` 的“微信开发者工具自动化的注意事项”执行：每个文件前退出主进程并预热，失败整文件重跑，不用 `-t`。
- 平台用例中的固定间隔轮询使用 Shadow 的 `poll` 只断言最终结果，次数证据由集成用例承担。

## 子模块

- `example/`：模板示例的 weapp 用例。

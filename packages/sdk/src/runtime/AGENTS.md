# packages/sdk/src/runtime/AGENTS.md

## 职责

跨业务模块共用的运行辅助：只暴露时间读取与可取消等待，供核心与适配器共用。

## 对外入口

- `port.ts` 导出 `RuntimePort` 类型；`default.ts` 导出 `createDefaultRuntime` 默认实现。

## 允许依赖

- 只依赖协议包公开入口的类型（例如 `Cancellation`）；不依赖生成代码与平台全局。
- 定时器以 `declare function` 声明跨宿主能力，不引入 DOM 或 Node 类型。

## 本地约束

- `runtime/` 是共享运行辅助，不建立 `core/`、`ports/` 子目录。
- 停止与计时器只接纳先到者；迟到通知不再交付或保留活动等待。用户可提供自己的 `RuntimePort` 实现替换默认实现。

## 子模块

无

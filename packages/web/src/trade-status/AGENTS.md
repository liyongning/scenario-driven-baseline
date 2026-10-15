## 职责

提供交易状态轮询示例的 UI、端口与 OpenAPI 适配。

## 对外入口

`ui/TradeStatus/TradeStatus.vue` 是模块根组件；`ports/` 定义状态查询端口，`adapters/` 提供 OpenAPI 实现。

## 允许依赖

UI 可以依赖运行时端口、共享组件与全局 store；核心端口不依赖 DOM、Vue 或协议生成物。

## 本地约束

轮询通过注入的时钟、可见性与取消端口实现，终态必须停止；业务码映射留在适配器。

## 子模块

- `adapters/`
- `ports/`
- `ui/`

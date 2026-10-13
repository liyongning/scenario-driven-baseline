## 职责

提供交易列表示例的 UI、端口与 OpenAPI 适配。

## 对外入口

`ui/TradeList/TradeList.vue` 是模块根组件；`ports/` 定义列表端口，`adapters/` 提供 OpenAPI 实现。

## 允许依赖

UI 只依赖模块端口与共享组件；适配器可以依赖 OpenAPI 生成物，端口不依赖协议实现。

## 本地约束

列表只读取全局当前交易，不写入全局 store；业务码映射留在适配器。

## 子模块

- `adapters/`
- `ports/`
- `ui/`

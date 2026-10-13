## 职责

提供交易创建表单的示例 UI、模块状态、核心纯函数与 OpenAPI 端口适配。

## 对外入口

`ui/TradeCreate/TradeCreate.vue` 是模块根组件；`ports/` 定义页面端口，`adapters/` 提供 OpenAPI 实现。

## 允许依赖

UI 只依赖模块端口、共享组件与 Vue；核心与端口不依赖 Vue、DOM、协议包生成物或适配器。

## 本地约束

草稿状态留在模块根组件，输入焦点留在输入组件；业务码映射和协议调用只放在适配器。

## 子模块

- `adapters/`
- `core/`
- `ports/`
- `ui/`

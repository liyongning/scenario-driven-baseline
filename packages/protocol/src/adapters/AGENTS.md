# packages/protocol/src/adapters/AGENTS.md

## 职责

封装平台网络能力并实现 `HttpPort`；本模块是协议包中唯一接触平台全局的位置。

## 对外入口

- `network/wechat-miniapp.ts` 导出 `createWechatMiniappHttp`，经 `src/index.ts` 具名导出为平台网络工厂。

## 允许依赖

- 只依赖 `../ports/` 与 `../transport/` 的类型；平台接口在本模块内自己声明，不把微信、DOM 或 Node 类型引入核心。

## 本地约束

- 网络适配只封装平台 HTTP，不刷新登录态、不解释业务结果、不自动重放请求；工厂本身不在构造时读取全局。
- 就近维护 `*.test.ts`，平台适配的单测留在本模块。

## 子模块

- `network/`：各平台网络适配，逐个平台一个文件。

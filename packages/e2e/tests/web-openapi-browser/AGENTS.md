# packages/e2e/tests/web-openapi-browser/AGENTS.md

## 职责

验证 OpenAPI 协议包在 integration 与浏览器平台下的公共客户端、真实 fetch、Shadow 路由与响应行为。

## 对外入口

- `SCN-OPENAPI-CONTRACT-*.spec.ts` 即用例；`openapi-wire.ts` 提供公共入口装配，`openapi-matrix.ts` 按声明遍历接口执行矩阵。

## 允许依赖

- 消费 OpenAPI 协议包构建后的根入口与 generated 公共入口；只替换外部 HTTP 服务，不 mock REST 执行器或网络适配器。

## 本地约束

- 用例绑定 `web-openapi-browser`，Fixture 声明 `protocol: "openapi"`；矩阵代码不写死业务接口名。
- integration 直接访问 Shadow；browser 经协议宿主与同源代理访问，不复制公共行为证据。

## 子模块

无

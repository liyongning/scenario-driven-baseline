# packages/e2e/host/weapp/AGENTS.md

## 职责

最小微信小程序测试宿主：提供页面容器，并构建、暴露执行用例所需的两个 runner。

## 对外入口

- `protocol-runner.ts` 是注入小程序页面后调用的宿主函数；`app.js` 与 `pages/index/` 是小程序本身。

## 允许依赖

- runner 只按产品包的消费接口声明解析接口、调用生产 SDK 与协议包；宿主不写死任何具体接口，新增消费接口只改声明与矩阵 Fixture。
- 不经宿主注入替身绕过生产网络适配，weapp 用例必须真实经过 `wx.request`。

## 本地约束

- `setup.ts`、`vite.config.ts`、`protocol-runner.ts` 只在微信开发者工具宿主中执行，行为证据由 weapp 用例承担，是 Design 允许的覆盖率排除项。
- 示例相关的宿主代码与构建段用 `<!-- template-example:begin/end -->` 或 `// template-example:begin/end` 包裹。

## 子模块

- `pages/`：小程序页面与页面配置。

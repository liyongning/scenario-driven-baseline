# Payment SDK Live 验收

Live 使用仓库内最小微信小程序连接真实交易创建网关、生产 SDK、支付基建和微信虚拟支付。业务应用的 UI、权益和上线不属于本 Change 的通过条件。

## 本机配置

1. 将 `.env.live.example` 复制为根 `.env.live`，只填写其中列出的非敏感配置。
2. 将 `packages/e2e/host/weapp/project.live.example.json` 复制为同目录的 `packages/e2e/host/weapp/project.live.config.json`，填写获准的真实 appId，保持 `urlCheck: true`。
3. 先执行产品构建，再执行 `pnpm live:build`。生成项目位于 `packages/e2e/host/weapp/.generated-live`，与 Shadow 输出隔离。
4. 使用微信开发者工具导入该目录并真机预览。Token 只能在页面掩码输入框确认保存，不通过 env、CLI 或日志传递。另行填写与 Token 同账号的 `user_id`；它只保留在页面内存并进入创建请求 body。

## 操作边界

控制台允许保存/替换/清除 Token，手填 `user_id`，编辑默认商品和金额表单，选择省略、sandbox 或 prod，创建真实测试交易，发起支付，查询当前交易并导出脱敏记录。完整 tradeNo 只保留在页面内存；导出记录使用本次页面 executionId 和逐笔脱敏 correlationId 串联创建、阶段、Outcome 与查询。创建失败后显式重试保留同一业务单号；“新建测试草稿”才清除当前交易并生成新号。清除记录会同时清除当前交易，后续支付前必须重新创建。prod 服务和 prod 选择都可能真实扣款，执行前必须取得账号、环境和金额授权。

`pnpm live:check` 检查构建隔离、契约登记和 generated CreateTrade binding；`pnpm check:live -- --run-dir artifacts/<run-id>/live` 校验人工记录的结构、九项矩阵和附件摘要。工具退出码不能替代评审人对真实服务版本、有效环境、渠道与最终查单关联的核验。

每个 `manifest.json` 必须列出九个独立 execution：LIVE-PAYSDK-001 绑定各自 Android/iOS 设备、服务构建、xpayEnv 和执行时间，LIVE-PAYSDK-002 绑定各自 test/prod 服务构建、xpayEnv 和执行时间。`matrix.json` 每项用唯一 executionId 引用对应执行；001 必须有同 executionId 的 `trade_created` 和同一 correlationId 的 `confirmed/PAID` Outcome。每项至少附一个类型化 JSON 索引记录，只允许 `mode`、`id`、`caseKey`、`executionId` 四个字段；截图等材料以 `visual-proof` 追加。`manifest.json` 还须记录当前 `live-build-manifest.json` 摘要，以绑定 SDK/协议产物 hash。

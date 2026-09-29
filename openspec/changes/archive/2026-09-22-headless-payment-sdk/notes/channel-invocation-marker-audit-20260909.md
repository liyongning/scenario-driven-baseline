# 渠道实际调用标记：反馈核验与范围判断

本记录非规范性。正式接口、行为和任务以本 Change 为准。

## 原始依据与技术核验

- Apply 反馈来自 Task 4 独立评审的第二项 Important；反馈基线为 Apply 提交 1b192e041d390caaf04908db75436faba4949f94。主规划基线为 fb3269eb36336eff8b82e0e361a185ceeb244eda。
- 旧公共契约:517–521 已定义 not_invoked 为本次未实际调用，unknown 为已调用但结果未知；:553–558 已要求 beforeInvoke 返回 true 后适配器再次检查停止，再置位实际调用标记。旧 Design:366 和 Task 5 RED/GREEN 同样要求这个顺序。
- 实际 ports/channel.ts 的 ChannelContext 只有 attemptId/cancellation/beforeInvoke，kind=stopped 无实际调用信息。core/client.ts:157–164 在 beforeInvoke 内将 channelSignal 改为 unknown，早于适配器的第二次检查及平台调用；核心停止订阅:123–126 可直接交付结果，不能等待 adapter Promise 事后更正。
- Apply 报告独立 reviewer 已运行复现：beforeInvoke=true 后第二次检查命中，平台0次却得到 stopped/unknown。主区只读检查确认该控制流与类型缺口；本次没有在主区或 Apply 工作区运行这项工程测试，不把 Apply 的复现报告写成主区新测试证据。

## 准入与范围

| 轴 | 判断 | 依据 |
| --- | --- | --- |
| Technical Validity | confirmed | 原始类型没有同步状态通路，核心提前置位且可先结束；公开信号定义明确 |
| Attribution | exposed | 实施暴露已评审内部端口未承接既有文字规则的缺口 |
| Scope | in_scope | 原公共契约、SDK-15、CORE-019 与 Task 4/5 的调用前停止规则 |
| Blocking | blocking | 不修复会把平台0次错误表述为已调用未知；不能通过改测试期望解决 |

该 Important 是 admitted_blocker，须补内部契约并重新 Plan Review。保留既有业务规则，不更改 public API、阶段、原生等待、查询策略、IDL、三包或发布方案。内部同步 markInvoked 的选择由规划侧核验后作出，不以 Apply 的推荐或“无需确认”作为授权。若后续评审要求改变上述既定方向，先向用户报告确认。

内部同步标记是一次方法调用；只增加核心与渠道之间的状态通路，不建立事件总线或状态管理模块。异步结果带标记不能解决核心先结束的竞态；把 beforeInvoke 当标记违背既有通知后停止规则。

只更新受影响的根、SDK、E2E AGENTS 条款；通信协议包不参与渠道调用，不因交接列举了四份文件就修改其职责。Task 4 承接已交付端口类型的增量，不重做 Task 1/2/3。FLOW-007 保留原九个 case，增加通知后未调用/已调用停止两项，维持真实 SDK + 外部替身边界；其运行及证据由 Apply 后续任务交付。

## 后续主区独立复现

写入上述只读结论后，在 `/tmp/payment-channel-marker-audit-20260909/repro.ts` 以现有项目 tsx 直接导入 Apply 当前真实 createCoreClient/createDefaultRuntime，使用内部假 backend/channel 与可同步停止的 Cancellation 复现。未调用假平台时计数0、query0，结果 stopped/unknown（预期 not_invoked）；调用假平台后计数1、query0，结果 stopped/unknown（正确对照）。脚本断言“缺口仍存在”和“对照成立”，退出0；这不是修复绿色测试、公开 FLOW 或真实微信证据，未修改 Apply 产品文件。

第一次完整 Plan Review 发现 PR-MARKER-001：新增 FLOW-007 验收误放 Task 7，但测试创建原由后置 Task 8 承担。核对旧提交 fb3269e 的 Task 7/8 与 Design 后，Technical Validity=confirmed、Attribution=introduced、Scope=in_scope、Blocking=blocking，Important/admitted_blocker。仅将完整条目移回 Task 8，保留十一项与两个环境，不改变既有任务分工，再审完整规划。marker 方案本身未被发现重大范围冲突。

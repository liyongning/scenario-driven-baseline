# 协议包网络工厂导出：反馈核验与范围判断

本文件仅保留核验过程，正式要求以 Spec/Design/Tasks 为准。

## 事实与原始依据

- 规划基线：16f304cd8bfde434e5ab76459a3fe9e2484957eb；Apply 报告并只读核对基线：3250a1941e9e9e5d45da5af6fafcd5e156e5aa6a。
- SDK-09 规定网络实现属于协议包；SDK-13 规定 SDK 通过 package exports 消费其平台网络能力。旧 Design 的 SDK-owned networking、包职责表和包间访问规则，以及 Task 6 真实 wx.request → Shadow / Task 7 自动装配，是原始 authority。
- Apply 已有 createWechatMiniappHttp(): HttpPort，导入/创建无 wx 访问；协议根 index.ts 只导出客户端/通信类型/错误目录，package exports 仅根及 generated，Vite 入口也未包含可消费的平台入口。
- 主区在 Apply 的协议包目录只读执行 Node：从 @daqian/payment-protocol import 已构建根入口成功，hasNetworkFactory=false；尝试深层 src/adapters/network/wechat-miniapp.ts 返回 ERR_PACKAGE_PATH_NOT_EXPORTED。进程退出 0 仅代表缺口复现成功，不是修复或真实微信链路通过。未调用 wx.request、未修改 Apply 代码/构建/锁文件。

## 独立范围判断

| 轴 | 结论 | 依据 |
| --- | --- | --- |
| Technical Validity | confirmed | 实现存在但生产包导出不可访问，SDK 无法合法装配 |
| Attribution | exposed | 原计划未把已要求的平台能力列入生产出口清单，实施暴露缺口 |
| Scope | in_scope | SDK-09/13、CONTRACT-08、既定包间 exports 边界及 Task 6/7 |
| Blocking | blocking | 不补齐会迫使深层 import、自写 HttpPort 或跳过真实生产网络验证 |

按 Important/admitted_blocker 纳入本轮规划，重新完整 Plan Review。反馈中给出的根/子入口方案并非自动采纳；规划侧选择既有根的单一具名重导出，工厂签名沿用已实现零参数 HttpPort，不新增通用平台入口、浏览器能力或第二套网络实现。

这是协议依赖包具名 API 的补全，需要规范和产物验收，但不改变用户已确认的 SDK 公共接口、宿主接入方式、职责分层或技术路线。未发现须另行裁决的重大冲突；独立 Review 不能替代未来范围变更的用户授权。协议构建/exports/files 已能承载根重导出时只验收，不为交接列出的文件而制造配置改动。

Task 2 增量完成出口/类型/构建与规则，Task 6 真实 weapp 等待该前置；Task 6 无依赖部分继续。Task 7/8 承担实际产品消费与全量流程，不能把其验收前移而制造任务依赖冲突。主区不实施或合并 Apply 工程，不覆盖其 checkbox/WIP。

## 同期测试元数据反馈的处理

独立盘点两份 Spec：46 个唯一 TC；CORE-003、CONTRACT-024/025/026 含 verification 块，另外 42 个尚未登记。八个 FLOW 权威表仍完整，FLOW-007 为十一项。本轮未改变任一已有机器块、FLOW key 或运行环境。

Design 的 Executable scenario coverage gate 已明确“每个 Scenario 在测试设计时附一个 json verification fenced block”；Task 6 已负责逐项测试设计、登记后评审、绑定及清单结构完整。缺块是必须完成的既定 Task 6 交付，不能跳过后勾选，也不能靠改变摘要/忽略 metadata_missing 解决。它不构成新增产品契约或额外设计 TODO。

该批候选设计由 Apply 在临时材料中按原 Scenario/FLOW/IDL 事实整理，再由规划侧独立核对、纳入正式 Spec 和完整复审；不与已完成的根出口小范围修正强行合并。Scenario ID 沿用标题，ownerId 属于测试绑定，FLOW 使用原表，IDL 清单按 Consumer 及获准补充规则派生。结构完整、绑定完整、实际运行通过分别判定，Task 7/8 未运行始终保留覆盖缺口。未经核对的实现/Fixture 不能决定必需 case 或环境。

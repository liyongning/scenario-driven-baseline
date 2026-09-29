# SDK Change 迁移记录（非规范）

日期：2026-09-07。用户确认三包名称，并授权将现有 SDK Change 迁入已创建的独立仓库。

- 来源：/Users/liyongning/Projects/workspace/esm/fe_app/openspec/changes/headless-payment-sdk/
- 目标：/Users/liyongning/Projects/workspace/infra-payment-sdk/openspec/changes/headless-payment-sdk/
- 目标远端：git@gitlab.daqian369.com:esm/infra/infra-payment-sdk.git
- Change ID/schema 保持 headless-payment-sdk / openspec-workflow；未执行 Plan Review、Apply、commit 或 push。
- 10 个源文件复制时逐字节一致；之后仅更新正式文档的已确认包名、仓库/迁移状态、跨仓库引用及 Task 对已有规划文件的处理。临时历史/Skill 备忘、发送原文和回执内容不改写。
- ESM 业务四个规划文件与迭代记录仅更新 SDK 契约引用；旧仓库 openspec/migrations/headless-payment-sdk.md 保留迁移指针。
- 原仓库既有暂存区保持不变；迁移只操作工作树。后续提交须同时审阅源仓库删除/引用更新和目标仓库新增。
- 36 个 TC、6 类 FLOW、8 个未完成任务及 P01/P02/P04 pending 状态保持。创建 README/规划 AGENTS 和安装项目级 schema 不代表工程门禁落地。

## 源文件 SHA-256

以下是迁移前快照摘要，用于核对搬迁完整性，不作为测试或评审通过证据。

| 源文件 | SHA-256 |
| --- | --- |
| .openspec.yaml | cfda3ea19d4d19107303c7446775a8296af291a7e4cb71a8ce0f0fa475a6ecaf |
| design.md | 4fc14151e72385537dab020a4b7786be1ce56ac1e4d1dce2007e5b9450d91ad6 |
| notes/change-skill-followups.tmp.md | 1a2e2ffbb864865f0531bb8e14fc98701707ccf3a7a1ae37237a0acbff941449 |
| notes/payment-backend-collaboration-20260907.md | 5e4f1f00ccb2ad56950dc1720501cc7d36528706176daeda2bb8133b42593add |
| notes/payment-backend-collaboration-20260907.receipt.json | 619712e911d50f521953168d57f45e68a9c7986840f841588ccd60bab2844f4e |
| notes/technical-selection-recap.tmp.md | 9a3d7d90f31ccb2f55ebb943afaf243e711786983cd996c8b3b15ba224470107 |
| proposal.md | 23fd53e4f3a526159c0865a3c83de3e55a3d692f43a534209f826604c47e4a33 |
| specs/payment-sdk/spec.md | 3780a1cc56b6ba5e883a2f99101c5f98e19f5eec1d25098dc1c13b0ecb5d2ffc |
| specs/payment-sdk-contract/spec.md | 021574f308af164ec403ffe5b50a0994292723100e7a82c80f0fa4ed744accef |
| tasks.md | 1088adc1a5faba1b233a1f3683dd82a777c2f3e2b98e77122fe0d875dd3959c0 |

## 后续工程输入

- registry：目标发布地址、@daqian 两个产品包的发布/消费权限；已有 proto-gen 包来源为 GitLab project 216 的 npm 仓库，这不自动授权新 SDK 使用同一发布位置。
- ProtoGen：支付 Consumer/Profile、来源分支/锁定和生成范围。已核对 IDL 基线 285f1be60fb218c5f34908faa8ca6b033963cd65 的 Producer 登记未含本新仓库；不能复制 ESM Consumer 代替。
- CI/验收：GitLab Runner（尤其开发者工具执行环境）、指定维护者/审批规则、测试小程序/渠道环境。按 Task 1/6/8 分阶段落实，真实渠道账号不阻塞当前规范迁移。
- 工具精确版本与兼容范围由实施方核对官方依据并登记，无须业务方逐项选补丁版本。

# GitLab registry 与执行环境核对（2026-09-07）

本文件是只读调查记录，结论性要求维护在 Design/Tasks；不代表工程初始化、Runner 实跑、发布或渠道验收已经完成。

## GitLab 页面事实

- [SDK 项目](https://gitlab.daqian369.com/esm/infra/infra-payment-sdk)：Private，Project ID 245，核对时只有初始 README。
- [Package registry](https://gitlab.daqian369.com/esm/infra/infra-payment-sdk/-/packages)：页面可用，显示 0 Packages / There are no packages yet。
- 项目级 npm endpoint 为 https://gitlab.daqian369.com/api/v4/projects/245/packages/npm/，格式按 [GitLab npm 官方说明](https://docs.gitlab.com/user/packages/npm_registry/)；SDK 与其协议依赖共用此发布项目。
- [SDK CI/CD 设置](https://gitlab.daqian369.com/esm/infra/infra-payment-sdk/-/settings/ci_cd)：项目专属 Runner 为 0；已启用三个组 Runner：#3 Mac Mini CI/CD Runner (Shell Executor)，标签 mac-mini-tester / macos / shell；#12 ESM K8S Group Runner，标签 k8s / service-ci；#18 Mac Mini CI/CD Runner，标签 macos。未见自定义 CI 配置路径，仓库尚无 SDK 流水线文件。
- [ESM 前端 CI/CD 设置](https://gitlab.daqian369.com/esm/esm_fe_app/-/settings/ci_cd)：专属 Runner #4，名称“测试gitlab CI/CD管道 by sqy”；同样启用上述三个组 Runner。当前本地检出未发现 GitLab CI 文件。登记存在不证明当前在线或目标测试已经成功执行。
- SDK 项目默认 Auto DevOps 已启用，首页提示 Container registry 未启用。该提示针对容器构建能力；npm 使用上述 Package registry。SDK 实施时提供本项目 .gitlab-ci.yml，不依赖默认 Auto DevOps 证明质量门禁已具备。

调查仅浏览项目和设置，没有启停 Runner、修改权限/变量、触发流水线或上传包。Runner 当前在线状态、微信工具安装及会话/端口、完整 CI 检查和合入保护仍需 Task 1/6/8 的运行证据。

## 本地参考

- ESM 仓库 proto-gen.yaml 的 Consumer 为 esm-miniapp-fe，Profile 为 generated-idl2-compatible/v1，生成目录 packages/esm-proto-generated/src。支付 SDK 需独立 Consumer 登记；Profile 可复用，但须验证支付 metadata/codecs 的需求。
- 所核对支付 IDL 基线 285f1be 的 Producer 登记中尚无本 SDK Consumer；此记录仅描述该版本，不能断言后续服务端分支没有变化。
- ESM pnpm-lock.yaml 中 @daqian/proto-gen@0.1.3 的来源是 GitLab 项目 216；该工具来源不能被误替换为 SDK 的发布项目 245。
- ESM packages/e2e/src/devtools-paths.ts 提供 MINIAPP_DEVTOOLS_APP / MINIAPP_DEVTOOLS_BIN / MINIAPP_CLI_PATH；proto-foundation-smoke.ts 使用 miniprogram-automator、开发者工具 CLI/端口及关闭清理机制。SDK 测试复用这些可分离机制，运行本仓库最小测试小程序。

## 本轮落实边界

自动化在 SDK 仓库独立闭环；真实渠道与 ESM 业务最终联调可以共享一次执行与证据。CI 不可用时允许在本地按相同质量、版本及产物规则执行 SDK 发布流程；发布地点不改变 npm 目标，也不等于 CI 合入保护已验证。支付后端 P01/P02/P04 三个协作事项不因本次环境核对而关闭。

## 后续沟通补充：Consumer 与本地执行环境

- 用户确认：Consumer 在 IDL 仓库按 SDK 依赖的契约配置，业务侧 Consumer/IDL 不在本 Change 维护；该配置明确列入 Task 1，无需再让业务调用方确定范围。
- 用户确认：本地已有可经 miniprogram-automator 连接的微信开发者工具。本机检查 /Applications/wechatwebdevtools-nightly.app 及 Contents/MacOS/cli 均存在；ESM 的现有接入源码也使用 automator.connect。此次未启动业务应用或运行尚未实现的 SDK 测试。
- 平台接入定位为 SDK 执行与真实 wx.request 环境：复用现成连接、函数执行、结果获取能力，最小小程序不承担点击/导航流程，不自研工具控制器或连接协议。方案与 Task 6 已明确此边界。
- 环境核对中 /usr/local/bin/proto-gen version 返回 0.1.0（commit 411a3c9），其 config validate 无法识别现有 Producer 的 protoFile 选择器；这是全局旧工具与当前配置格式不匹配，此次结果不作为 Producer 交付证据。Task 1 使用既定项目锁版工具，IDL 校验遵循其 ci/producer_check.sh 固定官方版本要求，不修改全局工具或将旧版本报错误判为 IDL 契约缺陷。
- 本次更新属于方案细化，未写入 IDL Consumer、未生成 Proto 或搭建 SDK 工程；实际登记与生成按已明确的 Task 1 执行。

## 后续落实：项目内最新 ProtoGen

用户随后明确要求在项目内安装最新 ProtoGen。已在 SDK 根 devDependencies 安装 registry 当前 latest 0.1.2，保存精确版本与 pnpm-lock.yaml，通过项目命令执行。项目内工具的 version 和现有 IDL Producer config validate 均通过，前述全局旧版本问题已解决，不作为后续缺口。根工具准备与验证详见 [bootstrap](../../../../docs/engineering/bootstrap.md)；SDK Consumer/生成及三个 workspace 仍按 Task 1 落实。

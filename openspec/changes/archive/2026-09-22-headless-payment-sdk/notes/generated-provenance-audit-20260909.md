# 生成来源与固定错误事实的门禁核验

本文件为本次事实核验记录；规范以公共契约“生成来源与错误事实来源分别校验”、Design 与 Tasks 为准。

- 主区 HEAD：0f0ed30062d7c5cbf7515d36d34be660e746ba72。
- 固定 Go 错误事实：IDL 5539be8f09323709fa65f6568efe22896ec35d24。
- 已观察的新生成来源：fa352692de4577bd1538a4175fa835b51d52dd92，非以后操作的固定 current 目标。
- 只读比较 Apply 的已提交 lock 与受控 sync 后 lock：仅 resolvedCommit 与 producerInputDigest 变化。contract/projection、12 项完整 descriptor、工具/profile/config/tree 均逐字不变；generated 相对 HEAD 无 diff。
- base.proto、common/v1/enums.proto、infra/pay/v1/pay.proto、infra/trade/v1/trade.proto 在两版本间无 diff。
- error_code.go/error_contract.go 有其他业务变更，不能声称整份 Go 文件未变。对 fa352 的临时 Git archive 直接运行引用 Go 常量与 DescribeErrorCode 的审计程序，17 项完整数值、canonicalCode、bizCodeName、source、retryable 与 5539 审计输出逐项一致。
- 审计命令：在 fa352 的临时 archive 模块根运行 `go run /tmp/payment-sdk-error-contract-audit-20260909/inspect_errors.go`，退出 0；输出 `/tmp/payment-sdk-provenance-audit-20260909/errors-fa352.json`。两份 JSON 直接比较通过；此临时审计不替代 Task 3 正式取数/回归证据。
- 现有 CONTRACT-024 直接断言 lock.resolvedCommit 等于错误目录来源，并把整锁 SHA 与固定 manifest 比较。refresh-manifests.py 对全部受管理 manifest 也有整锁相等检查。故只修改测试中的一个提交号比较不足以消除门禁耦合，必须同步迁移 manifest 维护规则。

本次只修订主工作区的规划；不修改 Apply 工作区或 IDL checkout。初次临时解包因 Python 版本不支持 tarfile filter 参数失败，改用路径校验后解包；Go 审计在正确的临时模块根重新运行成功。未把失败命令计为验收通过。

## 原始同步证据与临时快照边界

Apply 保存的有效证据位于 `.worktrees/headless-payment-sdk/artifacts/20260909-task3-provenance-refresh/`：

- `before-lock.yaml` 与 `lock.diff` 保存同步前原锁及完整两字段差异；`before.json`、`after.json` 记录 generated/core 的实际文件摘要。
- `proto-sync.log`、`proto-status.log`、`proto-validate.log` 是原始工具输出；`command-results.json` 记录 sync/status/validate 均退出 0，集成测试因旧来源耦合退出 1。该次同步不能称为完整门禁通过。
- `restored.json` 和 `restored-status.txt` 证明 Apply 在审查失败原因后恢复原锁。主区临时 `/tmp/payment-sdk-provenance-audit-20260909/{before.lock,after.lock}` 取到了恢复后的同一份 5539 锁，不能作为前后版本不同的正例。以上来源变化结论以保存的原锁、完整 diff 和工具日志为据。
- 独立 Reviewer 已核对原始 sync/status 的 fa352、up_to_date、完整描述及生成树，另行比较两份 17 项 Go 审计 JSON 一致。Task 3 仍须保存正式正确的前后 lock 及当次新鲜同步证据，不能直接复制临时重复快照。

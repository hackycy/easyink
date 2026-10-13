Prompt schema: `goal-loop/prompt-v3`
Effort path: `.scratch/material-plugin-refactor`

推进这个 effort，直到全部 Gate 通过。每次启动自行读取当前状态，本次 Goal 锁定启动时的 Gate，Gate 通过后本轮结束。固定正文供用户反复使用，Gate、Revision、slice 和 checkpoint 由 agent 读取，不生成下一轮提示词。

在目标仓库根目录执行：

```text
python -X utf8 ".scratch/material-plugin-refactor/goal/goal_loop_ctl.py" context ".scratch/material-plugin-refactor"
```

这是完整的执行入口；正常接续使用 effort 内的脚本和下述规则。脚本参数不明确时只查询对应子命令的 `--help`。

开始时：

1. `context` 已校验 pending transaction、合同 baseline 和运行记录，并返回 Revision、Gate 状态、checkpoint、过期检查和当前合同。长输出按 `Next page` 的 offset 由 agent 继续读取，直到 `Context complete` 再实现；分页期间 Revision 改变则从头读取。无需重复运行 status/validate 或读取原始 runbook、baseline、脚本源码和 skill。
2. pending transaction 时先用同一入口执行 `recover`，然后重新读取 context；baseline 漂移或其他校验错误时停止实现并报告。全部 Gate 已通过则报告 effort complete。
3. 读取适用的仓库指令、当前 Gate 必要代码和相关合同来源。history 只在具体检查或交接信息不足时按需读取相关片段；默认不读取 passed Gate history。
4. blocked 时确认恢复条件后使用 `resume`。Manual acceptance pending 时，只在收到对应验收编号的明确结果后使用 `check finish`；否则报告待验事项并结束，不轮询。

执行当前 Gate：

1. 连续完成多个最小 slice。每个稳定 slice 使用 `record --kind slice|checkpoint|failure` 更新 history 和替换 checkpoint，然后继续下一 slice。仅在 Gate 通过、人工验收等待、合同 Stop condition，或确需中断交接时结束 Goal；slice 完成本身不是结束条件。
2. 后续命令沿用上面的解释器、脚本路径和 effort 参数。写入时携带最新 `--expected-revision <n>`；成功输出的 Revision 用于下一次写入，冲突时重新读取 context。
3. Directed 使用 `check start --kind Directed --check D<n>`，执行检查后 `check finish`；Repository 使用 `check run --check R<n>`；Manual acceptance 使用 `check start --kind "Manual acceptance" --check M<n>`，向用户提供验收编号、入口与最小清单，收到明确结果后 `check finish`。
4. 普通检查失败进入修复和重新验证。只有合同声明的 Stop condition 才使用 `block`。检查过期后重新验证；必要时用 `status` 查看新鲜度。
5. 不创建、修改或回滚 Git commit；不把代码回滚作为 Goal Loop 状态。代码提交和代码回退由用户按仓库流程处理。

Gate 通过：

- `pass-gate` 检查全部 Exit、最新检查结果、evidence fingerprint 新鲜度和未完成的 Manual acceptance。
- 通过后只激活直接后继并创建其 history，结束本轮；最后一个 Gate 通过后报告 effort complete。
- 用户下次发送同一份固定正文，由 agent 自动读取最新状态继续。

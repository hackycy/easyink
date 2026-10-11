Prompt schema: `goal-loop/prompt-v2`
Effort path: `.scratch/material-plugin-refactor`

推进 `.scratch/material-plugin-refactor/goal/runbook.md` 中唯一 `active` 的 Gate。本次 Goal 锁定当前 Gate，不进入后继 Gate。

开始时：

1. 运行 `goal_loop_ctl.py status .scratch/material-plugin-refactor` 和 `context .scratch/material-plugin-refactor`。
2. 若存在 pending transaction，只运行 `recover`；若合同 baseline 漂移，停止实现并报告漂移文件。
3. 读取当前 Gate 合同、checkpoint 和必要代码；默认不读取 passed Gate history。
4. 当前 Gate 需要诊断时才读取对应 `goal/history/G<n>.md`。

执行当前 Gate：

1. 在当前 Gate 内连续完成多个最小 slice。
2. 每个稳定 slice 使用 `record --kind slice|checkpoint|failure` 更新当前 Gate history 和 checkpoint。
3. Directed 使用 `check start --kind Directed --check D<n>`；Repository 使用 `check run --check R<n>`；Manual acceptance 使用 `check start --kind "Manual acceptance" --check M<n>`，收到明确结果后使用 `check finish`。
4. 普通检查失败进入修复和重新验证。只有合同声明的 Stop condition 才使用 `block`；`resume` 恢复后继续当前 Gate。
5. 不创建、修改或回滚 Git commit；不把代码回滚作为 Goal Loop 状态。代码提交和代码回退由用户按仓库流程处理。
6. 在稳定 slice 后替换 checkpoint，结束当前 Goal；不要轮询人工验收。

Gate 通过：

- `pass-gate` 会检查全部 Exit、最新检查结果、evidence fingerprint 新鲜度和未完成的 Manual acceptance。
- 通过后当前 Gate 标记为 `passed`，只激活直接后继并创建其 history；最后一个 Gate 通过后报告 effort complete。
- 不在同一 Goal 中执行后继 Gate。

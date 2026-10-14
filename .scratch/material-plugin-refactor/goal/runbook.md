# 物料能力装配层重构 Goal Runbook

Schema: `goal-loop/runbook-v2`
Revision: `550`

## Contract Baseline

- Manifest: `goal/contract-baseline.json`
- Manifest SHA-256: `62502bc0c116cf135087b12bd18c18fb43f05a1922f24e13be252cc67ea099d3`

## State Rules

- `implementation-plan.md` 是 Gate 合同唯一来源；runbook 只保存当前执行状态和最新 checkpoint。
- `goal/contract-baseline.json` 声明合同输入集合及内容哈希；合同输入漂移时停止执行。
- 每个已激活 Gate 只有一个 `goal/history/G<n>.md`；history 仅用于追溯，不参与默认状态重放。
- 一次只允许唯一 `active` 或 `blocked` Gate；`blocked` 只对应计划声明的 Stop condition。
- 所有运行态修改使用 goal-loop control script 并携带当前 runbook Revision；陈旧 Revision 的写入必须拒绝。
- 稳定 slice 替换 runbook checkpoint；Gate 保持 `active`，后续 Goal 从 checkpoint 恢复。
- 人工验收 pending 时 Gate 保持 `active`；当前 Goal 结束且不轮询，只在收到对应 acceptance id 的明确结果后继续。
- Gate 通过时只激活直接后继；最后一个 Gate 通过后 effort complete。

## Goal Ledger

| Gate | Status | Depends on | Plan contract | History | History head | Unlock evidence |
| --- | --- | --- | --- | --- | --- | --- |
| G0: 冻结行为与消费基线 | passed | none | `implementation-plan.md -> G0: 冻结行为与消费基线` | `goal/history/G0.md` | `G0-E0031` | `G0@G0-E0031` |
| G1: 契约与唯一装配内核 | passed | G0 | `implementation-plan.md -> G1: 契约与唯一装配内核` | `goal/history/G1.md` | `G1-E0098` | `G1@G1-E0098` |
| G2: text 与 image 双宿主完整切片 | passed | G1 | `implementation-plan.md -> G2: text 与 image 双宿主完整切片` | `goal/history/G2.md` | `G2-E0051` | `G2@G2-E0051` |
| G3: Designer UI 与受控服务迁移 | passed | G2 | `implementation-plan.md -> G3: Designer UI 与受控服务迁移` | `goal/history/G3.md` | `G3-E0016` | `G3@G3-E0016` |
| G4: Render Session 与输出所有权 | passed | G3 | `implementation-plan.md -> G4: Render Session 与输出所有权` | `goal/history/G4.md` | `G4-E0137` | `G4@G4-E0137` |
| G5: 全部物料与实际宿主切换 | passed | G4 | `implementation-plan.md -> G5: 全部物料与实际宿主切换` | `goal/history/G5.md` | `G5-E0130` | `G5@G5-E0130` |
| G6: 0.1.0 候选制品与手动发布交接 | passed | G5 | `implementation-plan.md -> G6: 0.1.0 候选制品与手动发布交接` | `goal/history/G6.md` | `G6-E0086` | `G6@G6-E0086` |

## Current Checkpoint

- Gate: `none`
- History: `none`
- History head: `G6-E0086`
- Last completed slice: `none`
- Current slice: `none`
- Checks: `all pass`
- Satisfied exits: `all`
- Manual acceptance: `none`
- Blocker: `none`
- Risks: `none`
- Next action: `effort complete`
- Contract revision: `G6 实际候选/平台/文档验收完成后更新地图和路线的已落地实施摘要；保持全部有效决议、Gate 检查和发布边界不变。`

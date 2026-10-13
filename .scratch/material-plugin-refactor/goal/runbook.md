# 物料能力装配层重构 Goal Runbook

Schema: `goal-loop/runbook-v2`
Revision: `434`

## Contract Baseline

- Manifest: `goal/contract-baseline.json`
- Manifest SHA-256: `a5552574f39fdb4f540ef9a01c077624a46761bbbdf14f1542ce54e75035acf6`

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
| G5: 全部物料与实际宿主切换 | blocked | G4 | `implementation-plan.md -> G5: 全部物料与实际宿主切换` | `goal/history/G5.md` | `G5-E0102` | `G4@G4-E0137` |
| G6: 0.1.0 候选制品与手动发布交接 | planned | G5 | `implementation-plan.md -> G6: 0.1.0 候选制品与手动发布交接` | `—` | `—` | `G5 pending` |

## Current Checkpoint

- Gate: `G5: 全部物料与实际宿主切换`
- History: `goal/history/G5.md`
- History head: `G5-E0102`
- Last completed slice: `none`
- Current slice: `Directed`
- Checks: `D1=pass, R1=pass, R2=pass, R3=pass, R4=pass, R5=pass, R6=pass, D2=pass, D4=pass, D3=fail`
- Satisfied exits: `E1`
- Manual acceptance: `none`
- Blocker: `SC2: Go/Android、浏览器或实际宿主环境缺失，完成独立迁移后仍有必需验收无法执行。; G5独立迁移与所有可执行验证已完成。R1-R6/D1/D2/D4最新pass，D3浏览器/Go/API均pass，仅Android缺环境：gradlew --version exit9009，JAVA_HOME/java和ANDROID_HOME/ANDROID_SDK_ROOT/adb/emulator均无，未找到SDK/设备，AAR/sample APK不存在。缺Android真实构建、WebView PDF/图片与await cleanup验收，G5 E2不能满足。`
- Risks: `不得以缺环境/skip视为通过；G6保持未激活`
- Next action: `恢复条件：配置可用JDK、匹配当前工程的Gradle/Android SDK35、adb真机或带WebView模拟器；resume后重读context并构建AAR/sample核对runtime资产，运行HTML/Schema PDF与图片及cleanup，补验stale检查和D3再pass-gate`
- Contract revision: `Include remaining Designer extension developer guidance in G5 evidence`

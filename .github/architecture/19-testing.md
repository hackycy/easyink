# 19. 测试策略

## 19.1 单元测试（Vitest）

覆盖核心引擎的所有纯逻辑模块：

| 模块 | 测试重点 |
|------|----------|
| SchemaStore | DocumentSchema CRUD、校验、遍历、序列化 |
| PagePlanner / LayoutEngine | 页面计划、区域划分、表格分页、overflow 诊断 |
| DataSourceResolver | 路径解析、usage 解释、数据源容错策略 |
| CommandManager | 撤销/重做、命令合并、事务 |
| UnitManager | 单位转换精度 |
| MigrationRegistry | 版本迁移链路 |

## 19.2 E2E 测试（Playwright）

覆盖关键用户路径：

```
1. 加载模板 → 传入数据源/调试数据 → 打开 Viewer → 验证页面预览输出
2. 设计器打开 → 添加元素 → 设置属性 → 导出 Schema
3. 设计器打开 → 绑定字段 → 删除绑定 → 验证静态值恢复显示
4. 设计器打开 → `table-data` 绑定集合字段 → 验证主数据源和相对字段约束
5. 加载多页模板 → 验证 Viewer 分页结果、重复表头与 overflow 提示
6. 设计器打开 → 多次操作 → 撤销/重做 → 验证状态
```

## 19.3 明确不测的核心职责

- 模板动态计算
- 具体 PDF 引擎实现
- 具体图片导出引擎实现
- 物理打印设备可扫描性

这些能力不属于当前核心承诺，应由各业务输出链路自行验证。

## 19.4 测试工具

```jsonc
// vitest.config.ts
{
  "test": {
    "workspace": [
      "packages/core",
      "packages/viewer",
      "packages/designer"
    ]
  }
}
```

## 19.5 强制覆盖（核心交互回归）

下列测试是 PR 准入护栏，删除或绕过将被拒绝合并：

- `packages/designer/src/interactions/canvas-interaction-controller.test.ts` — 覆盖画布手势仲裁全部决策路径（Cmd 多选、drag-then-click、dblclick 进入 editing-session、pointerdown 不进入、background pointerdown 退出顺序、右键保留、editing-session 路由 owner pointerdown）。对应审计 `.github/audit/202605010152.md` 与 `202605011431.md`。
- `packages/shared/src/pointer-gesture.test.ts` — 覆盖 pointercancel 与 pointerup 走同一 teardown 路径，capture acquire/release throw 不影响 onEnd 单次触发。对应 `202605011431.md` item 3。
- `packages/designer/src/editing/transaction-service.test.ts` / `behavior-dispatcher.test.ts` — 校验失败路径推送到 `DiagnosticsChannel` 而不是 silent console.error。
- `packages/core/src/page-planner.test.ts` / `binding-utils.test.ts` / `font.test.ts` — 协议边界回归。

新增交互/行为类协议时必须同步加测试；只改实现不加用例的 PR 默认拒绝。

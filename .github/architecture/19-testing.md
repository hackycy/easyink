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

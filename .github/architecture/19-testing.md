# 19. 测试策略

## 19.1 单元测试（Vitest）

覆盖核心引擎的所有纯逻辑模块：

| 模块 | 测试重点 |
|------|----------|
| SchemaEngine | Schema CRUD、校验、遍历、序列化 |
| LayoutEngine | y 排序、累计推移、位置锁定、auto height 估算、overflow 诊断 |
| DataResolver | 扁平路径解析、点路径解析、同源约束、容错策略 |
| CommandManager | 撤销/重做、命令合并、事务 |
| UnitManager | 单位转换精度 |
| MigrationRegistry | 版本迁移链路 |

## 19.2 E2E 测试（Playwright）

覆盖关键用户路径：

```
1. 加载模板 → 传入展示值数据 → 渲染预览 → 验证 DOM 输出
2. 设计器打开 → 添加物料 → 设置属性 → 导出 Schema
3. 设计器打开 → 绑定字段 → 删除绑定 → 验证静态值恢复显示
4. 设计器打开 → data-table 绑定对象数组列 → 验证同源约束
5. 加载动态高度模板 → 验证后续物料整体下推与 overflow 提示
6. 设计器打开 → 多次操作 → 撤销/重做 → 验证状态
```

## 19.3 明确不测的核心职责

- 模板动态计算
- PDF 产物生成
- 图片导出产物
- 物理打印设备可扫描性

这些能力不属于当前核心承诺，应由各业务输出链路自行验证。

## 19.4 测试工具

```jsonc
// vitest.config.ts
{
  "test": {
    "workspace": [
      "packages/core",
      "packages/renderer",
      "packages/designer"
    ]
  }
}
```

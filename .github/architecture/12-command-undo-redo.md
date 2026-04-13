# 12. Command 与撤销/重做

EasyInk 的历史系统只服务文档编辑，不服务工作台编排。

## 12.1 历史边界

进入撤销/重做栈的内容：

- 页面配置修改
- 辅助线修改
- 元素增删改
- 绑定修改
- 表格行列和单元格编辑
- 动画配置修改

不进入撤销/重做栈的内容：

- 面板显隐
- 面板位置与尺寸
- 缩放比例
- 当前活动抽屉
- 预览窗口状态

## 12.2 Command 模型

```typescript
interface Command {
  id: string
  type: string
  description: string
  execute(): void
  undo(): void
  merge?(next: Command): Command | null
}
```

## 12.3 CommandManager

```typescript
class CommandManager {
  execute(command: Command): void
  undo(): void
  redo(): void
  beginTransaction(description: string): void
  commitTransaction(): void
  rollbackTransaction(): void
  clear(): void
}
```

## 12.4 手势合并策略

历史系统按“一次可感知手势”入栈，而不是按每次瞬时变化入栈。

### 可合并场景

- 连续拖拽移动
- 连续缩放
- 连续旋转
- 滑杆调整
- 颜色拖拽

### 失焦或确认后入栈场景

- 文本输入
- 数值输入
- 选择器切换
- 页面设置修改

### 事务场景

- union 一拖多投放
- 多选对齐/分布
- 批量删除
- 模板库导入模板

## 12.5 关键命令类型

### 文档基础命令

- `AddMaterialCommand`
- `RemoveMaterialCommand`
- `MoveMaterialCommand`
- `ResizeMaterialCommand`
- `RotateMaterialCommand`
- `UpdateMaterialPropsCommand`
- `UpdatePageCommand`
- `UpdateGuidesCommand`

### 数据相关命令

- `BindFieldCommand`
- `ClearBindingCommand`
- `UpdateUsageCommand`
- `UnionDropCommand`
- `BindStaticCellCommand`（设置 cell 的 staticBinding，同时清除 content.text。用于 table-static 和 table-data 的 header/footer/normal 行）
- `ClearStaticCellBindingCommand`（清除 cell 的 staticBinding，恢复可手动编辑状态）

### 表格相关命令

- `InsertTableRowCommand`（table-data 中若 header/footer 区域已有 1 行则拒绝在该区域插入）
- `RemoveTableRowCommand`
- `InsertTableColumnCommand`
- `RemoveTableColumnCommand`
- `ResizeTableColumnCommand`（列 ratio 修改，支持 merge）
- `ResizeTableRowCommand`（行高修改，支持 merge）
- `MergeTableCellsCommand`（双层防护：校验选区内所有行 role 一致，跨 role 合并拒绝执行。table-data 数据区(repeat-template)完全禁止合并。table-data header/footer 仅允许列方向合并(rowSpan 必须为 1)）
- `SplitTableCellCommand`（拆分已合并单元格）
- `UpdateTableCellCommand`（支持写入 cell.typography 字段）
- `UpdateTableCellBorderCommand`（单边边框显隐）
- `UpdateTableRowRoleCommand`（修改行角色，仅 table-data。修改后若违反单行约束则拒绝执行）
- `UpdateTableVisibilityCommand`（切换 table-data 的 showHeader/showFooter）

### 组合命令

- `CompositeCommand` -- 将多个子命令打包成一条原子操作，undo/redo 时整体回滚/重做
- `BatchCommand`
- `ImportTemplateCommand`

## 12.6 CompositeCommand 模型

表格的许多操作涉及多个数据修改（如插入一列需要同时修改 columns[]、更新每行的 cells[]、调整合并单元格的 colSpan），这些必须作为一条原子命令进入历史栈。

```typescript
class CompositeCommand implements Command {
  id: string
  type = 'composite'
  description: string
  private children: Command[]

  constructor(description: string, children: Command[]) {
    this.id = generateId()
    this.description = description
    this.children = children
  }

  execute(): void {
    for (const child of this.children) {
      child.execute()
    }
  }

  undo(): void {
    // 逆序 undo
    for (let i = this.children.length - 1; i >= 0; i--) {
      this.children[i].undo()
    }
  }
}
```

### 使用 CompositeCommand 的场景

- **插入列**：修改 columns[] + 每行插入新 cell + 调整受影响的合并单元格 colSpan
- **删除列**：修改 columns[] + 每行删除 cell + 调整受影响的合并单元格 colSpan（colSpan 减到 1 变普通单元格）
- **插入行**：修改 rows[] + 根据列定义生成 cells + 重新计算 element.height
- **删除行**：修改 rows[] + 调整受影响的合并单元格 rowSpan + 重新计算 element.height
- **合并单元格**：修改目标 cell 的 colSpan/rowSpan + 标记被合并的 cells

### 与事务的区别

`CompositeCommand` 是命令组合，在 execute 之前就确定了所有子命令。事务（`beginTransaction/commitTransaction`）适用于运行时才能确定步骤的场景（如拖拽投放多个元素）。两者不冲突，事务提交时可以将收集到的命令包装成 `CompositeCommand`。

## 12.7 历史面板

Designer 底部历史面板至少提供：

- 历史列表
- 当前游标位置
- 操作描述
- 跳转回指定历史点

跳转历史点时，应触发：

- Schema 更新
- 选区刷新
- Viewer 预览刷新

## 12.8 失败语义

命令执行失败时：

- 不应留下半更新状态
- 事务命令需要可回滚
- 失败信息要进入诊断或调试面板

这套机制的目标是让复杂的报表编辑行为仍然保持可预期和可撤销。

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

### 表格相关命令

- `InsertTableRowCommand`
- `RemoveTableRowCommand`
- `ResizeTableColumnCommand`
- `UpdateTableCellCommand`
- `UpdateTableSectionCommand`

### 组合命令

- `BatchCommand`
- `ImportTemplateCommand`

## 12.6 历史面板

Designer 底部历史面板至少提供：

- 历史列表
- 当前游标位置
- 操作描述
- 跳转回指定历史点

跳转历史点时，应触发：

- Schema 更新
- 选区刷新
- Viewer 预览刷新

## 12.7 失败语义

命令执行失败时：

- 不应留下半更新状态
- 事务命令需要可回滚
- 失败信息要进入诊断或调试面板

这套机制的目标是让复杂的报表编辑行为仍然保持可预期和可撤销。

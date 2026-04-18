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
- 宿主触发的模板替换

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
- `UpdateGeometryCommand`（属性面板 X/Y/W/H/rotation/opacity 修改，支持 merge 和 precomputedOldValues）

### 数据相关命令

- `BindFieldCommand`
- `ClearBindingCommand`
- `UpdateUsageCommand`
- `UnionDropCommand`

### 表格相关命令

> **注意**：所有表格相关命令（包括 DatasourceDrop 绑定操作）已全部迁移至 [22 章 编辑行为架构](./22-editing-behavior.md) 的 `tx.run()` 模式，不再作为独立 Command 类存在。
>
> - behavior 中间件通过 `ctx.tx.run(nodeId, draft => { ... })` 修改 draft
> - DatasourceDrop 通过 `context.tx.run(nodeId, draft => { ... })` 修改 draft
> - `TransactionAPI` 自动生成 `PatchCommand` 进入历史栈

原有独立命令的操作语义（insert-row, remove-col, merge-cells, bind-cell 等）现在由 `table.command-handler` behavior 中间件和 `DatasourceDropHandler.onDrop` 内的 `tx.run()` 实现。

### 组合命令

- `CompositeCommand` -- 将多个子命令打包成一条原子操作，undo/redo 时整体回滚/重做
- `BatchCommand`

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

## 12.7 PatchCommand 与 TransactionAPI

22 章编辑行为架构引入了 `TransactionAPI`，它是 behavior 中间件修改文档的标准方式。

### 工作流程

```
ctx.tx.run(nodeId, draft => { draft.props.color = 'red' })
       |
       v
  mutative create(state, recipe, { enablePatches: true })
       |
       v
  patches + inversePatches
       |
       v
  new PatchCommand(getNode, patches, inversePatches, options)
       |
       v
  commitCommand(patchCmd) --> 进入 CommandManager 历史栈
```

### PatchCommand

```typescript
class PatchCommand implements Command {
  execute(): void   // applyJsonPatches(node, patches)
  undo(): void      // applyJsonPatches(node, inversePatches)
  merge(next): Command | null  // 同 mergeKey + 时间窗口内合并
}
```

### mergeKey 合并

连续的同类操作（如拖拽 resize 每帧产生一次 `tx.run`）通过 `mergeKey` 合并为一条历史记录：

```typescript
ctx.tx.run(nodeId, draft => {
  draft.table.topology.columns[colIndex].ratio = newRatio
}, { mergeKey: `resize-col-${colIndex}`, mergeWindowMs: 300 })
```

### batch

`tx.batch(() => { ... })` 将多次 `tx.run` 合并为一条 `CompositeCommand`。

### 与旧 Command 类的关系

所有表格 Command 类（InsertTableRow, MergeTableCells, BindStaticCellCommand, UpdateTableCellCommand 等）已全部迁移至 `tx.run()` 调用——behavior 中间件使用 `ctx.tx.run()`，DatasourceDrop 使用 `context.tx.run()`。

## 12.8 `@easyink/ui` 表单组件事件协议

所有 `@easyink/ui` 包中的 `Ei*` 表单组件必须同时暴露两个事件：

| 事件 | 语义 | 触发时机 | 消费方用途 |
|------|------|----------|-----------|
| `update:modelValue` | 实时预览 | 每次值变化（按键、拖拽 tick、交互） | 直接修改模型用于画布实时预览，不产生 Command |
| `commit` | 最终提交 | 用户完成一次编辑手势 | 创建 Command 进入 undo 栈 |

### 组件分类与触发规则

**连续输入类**（EiInput、EiTextarea、EiNumberInput）：

- `update:modelValue`：每次按键触发
- `commit`：blur 或 Enter 时触发，携带最终值
- 值变更守卫：组件在 focus 时快照当前值，commit 时比较最终值与快照，相同则不 emit commit
- EiNumberInput 的 commit 值经过 clamp/precision 处理

**离散输入类**（EiSelect、EiCheckbox、EiSwitch、EiFontPicker、EiBorderToggle）：

- 每次用户交互同时 emit `update:modelValue` 和 `commit`（每次交互必然产生值变化）

**复合类**（EiColorPicker）：

- 拖拽调色：`update:modelValue` 每个 tick，`commit` 在 pointerup 时
- 预设色点击/Hex 输入提交/清除：同时 emit 两者

### 新增组件时的必要约规

新增 `Ei*` 表单组件时，**必须**同时声明 `update:modelValue` 和 `commit` 两个 emit。如果组件只 emit `update:modelValue` 而缺少 `commit`，上层 PropSchemaEditor/PagePropertyEditor 将无法正确区分预览与命令提交，导致 undo 栈出现多余记录或缺失记录。

### precomputedOldValues 机制

由于 preview 路径直接修改了 node.props / page / document，commit 时创建 Command 需要知道编辑前的原始值。`UpdateMaterialPropsCommand`、`UpdatePageCommand`、`UpdateDocumentCommand`、`UpdateGeometryCommand` 均接受可选的 `precomputedOldValues` 参数。上层在首次 preview 时快照原始值，commit 时传入 Command 构造函数。

## 12.9 历史面板

Designer 底部历史面板至少提供：

- 历史列表
- 当前游标位置
- 操作描述
- 跳转回指定历史点

跳转历史点时，应触发：

- Schema 更新
- 选区刷新
- Viewer 预览刷新

## 12.10 失败语义

命令执行失败时：

- 不应留下半更新状态
- 事务命令需要可回滚
- 失败信息要进入诊断或调试面板

这套机制的目标是让复杂的报表编辑行为仍然保持可预期和可撤销。

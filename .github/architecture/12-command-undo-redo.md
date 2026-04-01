# 12. Command 与撤销/重做

## 12.1 Command 模式

每个用户操作封装为 Command 对象，包含 execute 和 undo 两个方法：

```typescript
interface Command {
  /** 命令唯一标识 */
  readonly id: string
  /** 命令类型 */
  readonly type: string
  /** 命令描述（用于 UI 显示，如"移动文本元素"） */
  readonly description: string
  /** 执行命令 */
  execute(): void
  /** 撤销命令 */
  undo(): void
  /** 是否可与下一个相同类型的命令合并（如连续输入文字） */
  mergeable?: boolean
  /** 尝试合并命令，返回合并后的命令或 null */
  merge?(next: Command): Command | null
}
```

## 12.2 命令管理器

```typescript
class CommandManager {
  private undoStack: Command[] = []
  private redoStack: Command[] = []
  private maxStackSize: number = 100

  /**
   * 执行命令并压入撤销栈
   * - 清空重做栈
   * - 尝试与栈顶命令合并（如连续拖拽）
   */
  execute(command: Command): void

  /** 撤销最近的命令 */
  undo(): void

  /** 重做最近撤销的命令 */
  redo(): void

  /** 是否可撤销 */
  get canUndo(): boolean

  /** 是否可重做 */
  get canRedo(): boolean

  /** 清空历史 */
  clear(): void

  /** 开始事务（多个操作合并为一个撤销步骤） */
  beginTransaction(description: string): void

  /** 提交事务 */
  commitTransaction(): void

  /** 回滚事务 */
  rollbackTransaction(): void
}
```

## 12.2.1 非命令态工作台状态

以下状态明确不进入 `CommandManager`：

- 工作台窗口的显示/隐藏
- 工作台窗口的最小化状态
- 工作台窗口的位置与层级
- 当前激活窗口

这些状态属于设计器工作台偏好，只影响编辑环境，不影响模板 Schema。

## 12.2.2 属性编辑命令生成策略

属性编辑不采用“每次键入一个字符就生成一个命令”的策略，而是按交互完成点生成命令：

- 文本输入：失焦时生成一次 `UpdatePropsCommand` 或 `UpdateStyleCommand`
- 离散控件：值确认时立即生成一次命令
- 连续控件：拖拽结束、颜色面板确认、步进交互结束时生成一次命令

这样可以避免命令栈被瞬时输入噪声污染，同时保持“无草稿层”的直接编辑体验。

## 12.2.3 键盘事件边界

v1 不新增设计器级全局快捷键注册：

- 工具栏承担撤销、重做、删除、缩放等显式入口
- 输入控件保留浏览器原生编辑快捷键语义
- 命令系统不依赖键盘事件作为唯一触发源

## 12.3 内置命令类型

| 命令 | 说明 | 合并策略 |
|------|------|----------|
| `MoveElementCommand` | 移动元素位置 | 连续拖拽合并 |
| `ResizeElementCommand` | 调整元素尺寸 | 连续缩放合并 |
| `RotateElementCommand` | 旋转元素 | 连续旋转合并 |
| `UpdatePropsCommand` | 修改元素属性 | 同属性连续修改合并 |
| `UpdateStyleCommand` | 修改元素样式 | 同样式连续修改合并 |
| `AddElementCommand` | 添加元素 | 不合并 |
| `RemoveElementCommand` | 删除元素 | 不合并 |
| `ReorderElementCommand` | 调整层级 | 不合并 |
| `GroupElementsCommand` | 组合元素 | 不合并 |
| `UpdateBindingCommand` | 修改数据绑定 | 不合并 |
| `UpdatePageSettingsCommand` | 修改页面设置 | 不合并 |
| `BatchCommand` | 批量操作（事务） | 不合并 |

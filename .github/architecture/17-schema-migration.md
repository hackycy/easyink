# 17. Schema 版本迁移

## 17.1 SemVer 语义

- `DocumentSchema` 的版本语义服务于库内部持久化格式迁移，而不是面向外部生态的长期公共 DSL 兼容承诺。
- **Patch**（0.0.x）：bug fix，Schema 完全兼容
- **Minor**（0.x.0）：新增功能，Schema 向后兼容（additive only）
- **Major**（x.0.0）：可能存在 breaking change，提供迁移函数

## 17.2 迁移注册表

```typescript
/**
 * 迁移函数类型
 * 接收旧版 Schema（untyped），返回迁移后的 DocumentSchema。
 * 迁移函数负责更新 version 字段。
 */
type MigrationFunction = (schema: Record<string, unknown>) => DocumentSchema

/**
 * MigrationRegistry -- Schema 版本迁移注册表
 * 管理 major 版本间的迁移函数，支持自动链式迁移。
 * Minor/Patch 升级（同 major 内）视为向后兼容，无需迁移。
 */
class MigrationRegistry {
  /**
   * 注册版本迁移函数
   * @param fromMajor - 源 major 版本号（精确匹配，如 0、1、2）
   * @param to - 目标版本（完整 SemVer，如 "2.0.0"）
   * @param migrate - 迁移函数
   */
  register(fromMajor: number, to: string, migrate: MigrationFunction): void

  /**
   * 迁移 schema 到当前库版本 (SCHEMA_VERSION)
   * 自动构建链式迁移路径：fromMajor → to → ... → SCHEMA_VERSION
   */
  migrate(schema: Record<string, unknown>): DocumentSchema

  /** 检查是否可从指定版本迁移到当前版本 */
  canMigrate(fromVersion: string): boolean

  /** 获取从指定版本到当前版本的迁移路径 */
  getMigrationPath(fromVersion: string): string[]

  /** 清空所有已注册迁移 */
  clear(): void
}

/**
 * Schema 加载流程（SchemaStore.load）：
 *
 * 1. 读取 schema.version
 * 2. 如果顶层结构损坏或关键字段不满足最小读取要求：拒绝加载
 * 3. 如果 version > currentVersion：best-effort 打开，保留原始字段并发出 schema 诊断
 * 4. 如果同 major 版本（含 minor/patch 差异）：直接使用（向后兼容）
 * 5. 如果 version major < currentVersion major：
 *    a. 有 MigrationRegistry → 自动链式迁移
 *    b. 无 MigrationRegistry → 抛出错误
 * 6. 迁移后更新 schema.version 为当前版本
 * 7. 若迁移后仍存在未知 element.type 或缺失编辑器，不阻断加载；保留原节点并进入只读占位降级
 *
 * MigrationRegistry 通过 schema 模块或上层宿主注入。
 */
```

### 17.2.1 拒绝加载与 best-effort 的边界

- 拒绝加载只用于两类情况：顶层结构已损坏到无法建立最小 `DocumentSchema` 视图，或解析过程中命中恶意路径等安全红线。
- `schema.version` 高于当前库版本本身不再视为拒绝条件，只要顶层结构仍可读，就进入 best-effort 打开。
- best-effort 模式下应尽量保留未知字段与未知节点，并通过诊断告知“当前库版本低于模板版本，结果仅为尽力回放”。

> **设计决策**：`fromMajor` 使用 `number` 类型精确匹配 major 版本号，不引入 semver 库，保持 @easyink/core 零外部依赖。

## 17.3 迁移示例

```typescript
const registry = new MigrationRegistry()

// 从 major 1 迁移到 v2：将 materials/layout 结构迁移到当前 elements 模型
registry.register(1, '2.0.0', (oldSchema) => {
  return {
    ...oldSchema,
    version: '2.0.0',
    elements: (oldSchema.materials ?? []).map((material: any) => ({
      id: material.id,
      type: material.type,
      name: material.name,
      x: material.layout?.x ?? material.x ?? 0,
      y: material.layout?.y ?? material.y ?? 0,
      width: material.layout?.width ?? material.width ?? 0,
      height: material.layout?.height ?? material.height ?? 0,
      rotation: material.layout?.rotation ?? material.rotation ?? 0,
      props: material.props ?? {},
      binding: material.binding,
      hidden: material.hidden,
      locked: material.locked,
    })),
  }
})

// 使用
const schema = registry.migrate(oldV1Schema) // 自动迁移到当前版本
```

# 17. Schema 版本迁移

## 17.1 SemVer 语义

- `TemplateSchema` 的版本语义服务于库内部持久化格式迁移，而不是面向外部生态的长期公共 DSL 兼容承诺。
- **Patch**（0.0.x）：bug fix，Schema 完全兼容
- **Minor**（0.x.0）：新增功能，Schema 向后兼容（additive only）
- **Major**（x.0.0）：可能存在 breaking change，提供迁移函数

## 17.2 迁移注册表

```typescript
/**
 * 迁移函数类型
 * 接收旧版 Schema（untyped），返回迁移后的 TemplateSchema。
 * 迁移函数负责更新 version 字段。
 */
type MigrationFunction = (schema: Record<string, unknown>) => TemplateSchema

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
  migrate(schema: Record<string, unknown>): TemplateSchema

  /** 检查是否可从指定版本迁移到当前版本 */
  canMigrate(fromVersion: string): boolean

  /** 获取从指定版本到当前版本的迁移路径 */
  getMigrationPath(fromVersion: string): string[]

  /** 清空所有已注册迁移 */
  clear(): void
}

/**
 * Schema 加载流程（SchemaEngine.loadSchema）：
 *
 * 1. 读取 schema.version
 * 2. 如果 version > currentVersion：拒绝加载，提示升级库版本
 * 3. 如果同 major 版本（含 minor/patch 差异）：直接使用（向后兼容）
 * 4. 如果 version major < currentVersion major：
 *    a. 有 MigrationRegistry → 自动链式迁移
 *    b. 无 MigrationRegistry → 抛出错误
 * 5. 迁移后更新 schema.version 为当前版本
 * 6. 若迁移后仍存在未知 material.type 或缺失编辑器，不阻断加载；保留原节点并进入只读占位降级
 *
 * MigrationRegistry 通过 SchemaEngineOptions 或 EasyInkEngineOptions 传入。
 */
```

> **设计决策**：`fromMajor` 使用 `number` 类型精确匹配 major 版本号，不引入 semver 库，保持 @easyink/core 零外部依赖。

## 17.3 迁移示例

```typescript
const registry = new MigrationRegistry()

// 从 major 1 迁移到 v2：物料布局结构变更
registry.register(1, '2.0.0', (oldSchema) => {
  return {
    ...oldSchema,
    version: '2.0.0',
    materials: oldSchema.materials.map((material: any) => ({
      ...material,
      // v1 中 x/y/width/height 在物料顶层，v2 移入 layout 对象
      layout: {
        x: material.x,
        y: material.y,
        width: material.width,
        height: material.height,
        rotation: material.rotation ?? 0,
      },
    })),
  }
})

// 使用
const engine = new EasyInkEngine({ migrationRegistry: registry })
engine.loadSchema(oldV1Schema) // 自动迁移到当前版本
```

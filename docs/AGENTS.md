# 文档维护 Agent 指引

## 适用范围与开始工作

本文件适用于 `docs/` 及其子目录。修改文档相关的仓库脚本、README 生成源或 Pages 工作流时，也应核对这里的构建约定。以下命令均在仓库根目录执行，路径也相对于仓库根目录。

开始任务前：

1. 阅读根目录的 `CLAUDE.md`，遵守仓库的代码和验证要求。
2. 读取 `docs/.vitepress/series.json` 确认当前工作区的文档系列，读取主分支的 `docs/versions.json` 确认默认系列及各系列的 Git ref。不要根据 npm 包版本推断文档系列。
3. 核对当前分支的实际 SDK 实现及相关指南，确保示例使用该分支提供的 API。
4. 检查工作区已有改动，只修改任务涉及的文件，保留其他未提交内容。

## 系列与分支维护

- 将 `docs/versions.json` 作为系列清单的唯一来源。`default` 决定默认入口；每个系列的 `id`、`label`、`ref` 分别决定 URL、菜单名称和构建来源。仅在增加系列、调整默认系列或结束维护时修改清单。
- 在所属系列的分支维护正文、导航、主题、交互组件和资源。不要在主分支创建 `docs/0.0/`、`versioned_docs/` 等历史源码副本。
- 在独立工作区修改旧系列。通用内容、主题和构建修正按适用范围回移；涉及不同 API 的示例分别编写。保留各分支自己的依赖和锁文件。
- 补丁发布继续完善同一系列的文档，不创建补丁版本快照。系列内新增功能只在需要的位置注明最低适用版本。
- 准备下一个有破坏性变化的系列时，先从尚未引入该变化的主分支保留当前系列的维护分支，再调整主分支的系列标识和清单。为新系列接入下述构建协议。
- 结束持续维护时，将该系列的 `ref` 固定到最后验收的提交，继续保留网站。恢复整站时，将各系列的 `ref` 固定到上一次验收通过的提交组合，再通过中央流程构建部署。

## 正文与链接

- 普通指南和 API 参考直接描述所属系列的接口、行为、限制和示例。将旧调用、新调用、移除项和迁移步骤集中在迁移指南，将发行差异集中在发行说明。
- 按语义整理“现在”“不再”等历史叙述，不建立词语黑名单；保留“更新数据”等正常功能描述。
- 将构建、分支维护和发布操作保留在本文件中，不混入普通指南或用户发行说明。历史重构地图、验收记录和架构审查保留其历史语境；架构说明描述所属分支的实现。
- 保留已有迁移指南、发行说明及其他页面地址，保留仍有意义的显式锚点。沿用 `.html` 页面和目录首页，不顺带改造 clean URL。
- 站内页面使用 VitePress 相对链接；运行时资源地址使用 `withBase()`。资源必须归属当前系列，检查 canonical、Open Graph 图片和 sitemap 地址，避免重复路径或跨系列引用。
- 修改包 README 的文档入口时，同时修改 `scripts/sync-package-readmes.mjs`；从本地系列标识生成链接，不硬编码 npm 版本。运行生成器后审查差异，避免带入无关内容变化。
- 本文件供 agent 使用。通过 VitePress 的 `srcExclude` 排除各级 `AGENTS.md`，不要将其加入站内导航、搜索、sitemap 或页面版本索引。需要引用时链接仓库源文件。

## 开发与构建

使用 Node.js 24 和各分支 `packageManager` 指定的 pnpm，按该分支锁文件安装依赖。

| 命令 | 用途 |
| --- | --- |
| `pnpm docs:dev` | 开发当前工作区的文档，默认端口 8533 |
| `pnpm docs:build` | 构建当前工作区的单系列文档 |
| `pnpm docs:preview` | 预览单系列产物 |
| `pnpm docs:build:all` | 在主分支工作区构建并汇总全部系列 |
| `pnpm docs:preview:all` | 按生产路径预览汇总产物，默认端口 8534 |

单系列开发时，其他系列入口指向线上首页；使用整站预览验收完整切换行为。

整站构建默认使用当前工作区作为其系列来源，包含未提交修改；其他系列从本地 Git ref 导出到 `.cache/docs-sources/`。先确保对应 ref 存在，且已包含基础设施接入补丁。未合入的旧系列改动通过工作区覆盖验收：

```sh
pnpm docs:build:all --source 0.0=/absolute/path/to/legacy-workspace
pnpm docs:preview:all
```

先在覆盖工作区执行 `pnpm install --frozen-lockfile`。默认汇总目录是 `.cache/docs-site`；指定 `--out PATH` 时，构建、预览和校验命令使用同一路径。临时源码、依赖和产物留在忽略目录，不提交到 Git。

中央构建先固定全部来源 SHA，再构建和校验，整个运行使用同一组提交：

```sh
node scripts/docs-versions.mjs resolve --git-sources --sources-file .cache/docs-sources.json
pnpm docs:build:all --sources-file .cache/docs-sources.json --out .pages/docs
node scripts/docs-versions.mjs check --out .pages/docs
```

修改构建基础设施时，保持以下协议：

- `EASYINK_DOCS_BASE`：所属系列的站点 base；`EASYINK_DOCS_VERSION`：预期系列标识。
- `EASYINK_DOCS_SOURCE_SHA`：固定来源提交；`EASYINK_DOCS_VERSIONS_FILE`：中央清单的绝对路径。
- 各分支输出 `docs-build.json`，包含 `id`、`base`、`source` 和页面路径到锚点列表的 `pages` 映射。
- 汇总后的公开 `versions.json` 包含默认系列、各系列的名称、base、来源 SHA、本地修改标识及页面映射；它是构建产物，不手动维护。
- 任一 Git ref 缺失、系列构建失败或产物不完整时，整体失败。不要跳过出错系列或用陈旧产物补齐发布。

## 导航与部署约定

- 保持 `/easyink/docs/` 为默认系列跳转入口，`/easyink/docs/<系列>/` 为系列站点。
- 跨系列使用完整页面导航，加载目标系列自己的主题和脚本。同路径存在则进入该页，仅保留目标支持的锚点；页面缺失则进入目标首页并提示“该系列没有对应页面”。保留查询参数。
- 索引加载失败时保留普通的系列首页链接。桌面和移动端均展示当前系列及切换入口。
- 原地址优先跳转到默认系列的同路径页面；仅旧系列有该页时跳转到旧系列。两个系列都没有的页面保留 404。跳转页使用固定目标、`noindex`、普通链接和无 JavaScript 回退。
- 主分支持有中央构建和部署逻辑，旧系列的 Pages 入口调用主分支中央工作流。所有入口共用 Pages 并发组，避免旧系列独立部署覆盖整站。
- 保留手动触发和 npm 发布成功后的调用，不增加普通 push 自动部署。Playground 使用中央流程检出的主分支提交，与全部文档系列校验后一次上传部署。
- 首次接入按“主分支中央流程 → 旧分支接入补丁 → 手动部署”顺序推进，两条维护线齐备后再部署。

## 验证与交付

按根目录要求依次执行 `pnpm build` → `pnpm lint` → `pnpm typecheck`。正文调整通过人工审阅和文档构建验证，不为每处改字增加测试。

修改版本索引、页面映射、跳转或汇总逻辑时，运行行为测试，并构建两个系列、校验完整产物：

```sh
pnpm exec vitest run scripts/docs-site.test.mjs docs/.vitepress/versioning.test.ts
pnpm docs:build:all --source 0.0=/absolute/path/to/legacy-workspace
node scripts/docs-versions.mjs check
```

旧分支接入补丁还需在其工作区运行 `pnpm docs:build` 和 `pnpm --filter @easyink/docs typecheck`。

修改导航、主题或汇总行为时，用真实浏览器检查：

- 桌面与移动端菜单、同页切换、刷新和前进后退。
- 页面存在或缺失、有效或无效锚点、查询参数、原地址深链接及 404。
- 两个系列的图片、样式、首页和 JSON 数据源工具，以及各自对应的 API 示例。
- 索引加载失败时的首页链接，以及缺失页面的回退提示。

交付时说明修改了哪个系列或工作区、执行了哪些检查、哪些尚未验证，以及是否已经部署。记录本地覆盖来源和固定提交，区分带未提交修改的验收产物与正式发布来源。

## npm 发布相关任务

文档维护不要求修改 npm 包版本、Changesets 或锁文件。仅在任务明确涉及包发布时处理这些文件，并以实际 manifest、exports、依赖和工作流为准，不把发行包数量或临时开发版本写成本文件的固定规则。

准备包发行时，除常规检查外执行 `pnpm test`、`pnpm docs:build` 和 `pnpm render:manifest`，核对迁移与移除清单、Go/Android 内嵌 runtime、构建 HEAD、平台运行结果和制品 checksum。源码或平台制品变化后重新核验，不能以构建成功代替平台验收。

核对首次 npm 发布前提、账户及 scope 权限、新增公共包的发布权限，以及 Changesets 分组是否覆盖目标包。`pnpm release` 会推进版本并执行 commit、tag、push，不把它当作验证命令。既有 `npm-v*` tag 工作流发布成功会触发 Pages，发布包含 assistant-orchestrator 时还会触发镜像构建。保持仓库既有人工发布流程，按任务授权执行实际发布操作。

# EasyInk Skills

这里存放 EasyInk 开发工作流用的 skills。可以不安装，直接在提示词里指定对应的 `SKILL.md` 使用。

## Skills 列表

| Skill | 路径 | 描述 |
|-------|------|------|
| **easyink-material-dev** | [SKILL.md](./easyink-material-dev/SKILL.md) | 新增或修改可保存到 Schema 的可视物料，覆盖 MaterialNode、Designer、Viewer、绑定、i18n、AI descriptor 等完整流程 |
| **easyink-contribution-dev** | [SKILL.md](./easyink-contribution-dev/SKILL.md) | 扩展 Designer 能力（面板、工具栏、命令、诊断、AI 面板等），不新增物料类型 |

## 直接使用

新增或修改一种会保存到 Schema 的可视元素时，使用物料开发 skill：

```text
[$easyink-material-dev](packages/skills/easyink-material-dev/SKILL.md)
帮我新增一个可保存到 Schema 的评分星级物料，Designer 可编辑，Viewer 可渲染，并支持绑定。
```

只扩展设计器能力、不新增物料类型时，使用贡献扩展 skill：

```text
[$easyink-contribution-dev](packages/skills/easyink-contribution-dev/SKILL.md)
帮我加一个模板审查面板：顶部工具栏按钮打开面板，面板读取当前 schema 并展示问题。
```

如果客户端不支持 Markdown skill 链接，也可以直接写文件路径：

```text
使用 packages/skills/easyink-material-dev/SKILL.md，帮我实现一个 table-like 物料。
```

```text
使用 packages/skills/easyink-contribution-dev/SKILL.md，帮我实现一个 toolbar 按钮和 panel。
```

## 职责边界

- `easyink-material-dev`：新增或修改可保存到 `schema.elements[]` 的物料，覆盖 `MaterialNode`、`createDefaultNode`、Designer 注册、Viewer 渲染、绑定、measure、深度编辑、i18n 和 AI descriptor。
- `easyink-contribution-dev`：扩展 Designer 能力但不新增物料类型，覆盖 `Contribution`、面板、工具栏动作、命令、诊断订阅、宿主业务状态、AI 面板、审查面板和资产面板。

简单判断：能不能成为模板里的一个新可视元素。能，就是 material；不能，只是设计器工作台能力，就是 contribution。

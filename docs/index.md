---
layout: home

hero:
  name: EasyInk
  text: Print is Easy
  tagline: 面向开发者的文档/报表设计器框架。Schema 驱动、设计器与预览器分离、物料体系可扩展，以 Vue 组件形式嵌入你的应用。
  image:
    src: /logo.png
    alt: EasyInk Logo
  actions:
    - theme: brand
      text: 快速上手
      link: /guide/getting-started
    - theme: alt
      text: 在线演示
      link: https://hackycy.github.io/easyink
    - theme: alt
      text: Designer
      link: /designer/
    - theme: alt
      text: Viewer
      link: /viewer/

features:
  - icon: 🎨
    title: 设计器开箱即用
    details: 内置画布编辑、物料拖放、数据绑定、撤销重做、自动保存。一个 Vue 组件即可嵌入你的应用，零配置启动。
  - icon: 👁
    title: 预览器独立运行
    details: 接收 Schema + 数据即可渲染、分页、打印、导出 PDF。iframe 样式隔离，自定义打印驱动，插件化导出。
  - icon: 🧩
    title: 可扩展的物料体系
    details: 每个物料由 Schema 定义、设计器交互、Viewer 渲染三部分组成。通过 registerMaterialBundle 注册自定义物料。
  - icon: 🔌
    title: 贡献扩展机制
    details: VS Code 风格 Contribution API，向设计器注入自定义面板、工具栏按钮和命令，零侵入扩展设计器能力。
  - icon: 📐
    title: Schema 驱动
    details: 文档模板是唯一数据源。支持版本化、SemVer 迁移、无损导入导出，兼容对标产品的历史 JSON 格式。
  - icon: 📊
    title: 一等公民表格系统
    details: 静态表格与数据表格均为完整结构系统。单元格级绑定、合并拆分、行角色、排版继承、分页感知渲染。
  - icon: 🤖
    title: AI 模板生成
    details: 基于 MCP 协议集成，意图优先生成管线。LLM 输出 TemplateIntent，schema-tools 确定性构建 Schema，避免幻觉。
  - icon: 📦
    title: 插件化导出
    details: 导出建模为状态机运行时 + 插件注册表。内置 DOM-to-PDF 插件，支持自定义打印驱动和导出格式，依赖按需加载。
---

<HomeShowcase />

<div class="ei-stats-row">
  <div class="ei-stats-wrap">
    <div class="ei-stat">
      <span class="ei-stat-number">19+</span>
      <span class="ei-stat-label">软件包</span>
    </div>
    <div class="ei-stat-divider"></div>
    <div class="ei-stat">
      <span class="ei-stat-number">4</span>
      <span class="ei-stat-label">架构层次</span>
    </div>
    <div class="ei-stat-divider"></div>
    <div class="ei-stat">
      <span class="ei-stat-number">8+</span>
      <span class="ei-stat-label">内置物料</span>
    </div>
    <div class="ei-stat-divider"></div>
    <div class="ei-stat">
      <span class="ei-stat-number">MCP</span>
      <span class="ei-stat-label">AI 协议</span>
    </div>
  </div>
</div>

<div class="ei-section">
  <h2 class="ei-section-title">四层架构</h2>
  <p class="ei-section-desc">从宿主应用到基础模型，每一层职责清晰、依赖单向。</p>

  <div class="ei-arch-layers">
    <div class="ei-arch-layer ei-arch-layer--l0">
      <span class="ei-arch-layer-name">宿主应用</span>
      <div class="ei-arch-layer-pkgs">
        <code>host-app</code>
      </div>
    </div>
    <div class="ei-arch-arrow">▼</div>
    <div class="ei-arch-layer ei-arch-layer--l1">
      <span class="ei-arch-layer-name">设计器 / 预览器</span>
      <div class="ei-arch-layer-pkgs">
        <code>@easyink/designer</code>
        <code>@easyink/viewer</code>
        <code>@easyink/builtin</code>
      </div>
    </div>
    <div class="ei-arch-arrow">▼</div>
    <div class="ei-arch-layer ei-arch-layer--l2">
      <span class="ei-arch-layer-name">核心能力</span>
      <div class="ei-arch-layer-pkgs">
        <code>@easyink/core</code>
        <code>@easyink/datasource</code>
        <code>@easyink/export-runtime</code>
        <code>@easyink/ui</code>
      </div>
    </div>
    <div class="ei-arch-arrow">▼</div>
    <div class="ei-arch-layer ei-arch-layer--l3">
      <span class="ei-arch-layer-name">基础模型</span>
      <div class="ei-arch-layer-pkgs">
        <code>@easyink/schema</code>
        <code>@easyink/material-*</code>
        <code>@easyink/shared</code>
        <code>@easyink/icons</code>
      </div>
    </div>
  </div>
</div>

<div class="ei-section ei-section--from-right">
  <h2 class="ei-section-title">技术栈</h2>
  <p class="ei-section-desc">现代前端工程体系，类型安全、高内聚、低耦合。</p>

  <div class="ei-marquee" aria-label="技术栈">
    <div class="ei-marquee-track">
      <span class="ei-marquee-item"><span class="ei-marquee-dot"></span>Vue 3 Composition API</span>
      <span class="ei-marquee-item"><span class="ei-marquee-dot"></span>TypeScript Strict</span>
      <span class="ei-marquee-item"><span class="ei-marquee-dot"></span>pnpm Monorepo</span>
      <span class="ei-marquee-item"><span class="ei-marquee-dot"></span>tsdown Build</span>
      <span class="ei-marquee-item"><span class="ei-marquee-dot"></span>Vitest Unit Tests</span>
      <span class="ei-marquee-item"><span class="ei-marquee-dot"></span>Playwright E2E</span>
      <span class="ei-marquee-item"><span class="ei-marquee-dot"></span>CSS Variables Theme</span>
      <span class="ei-marquee-item"><span class="ei-marquee-dot"></span>ESLint Linting</span>
      <span class="ei-marquee-item"><span class="ei-marquee-dot"></span>Vue 3 Composition API</span>
      <span class="ei-marquee-item"><span class="ei-marquee-dot"></span>TypeScript Strict</span>
      <span class="ei-marquee-item"><span class="ei-marquee-dot"></span>pnpm Monorepo</span>
      <span class="ei-marquee-item"><span class="ei-marquee-dot"></span>tsdown Build</span>
      <span class="ei-marquee-item"><span class="ei-marquee-dot"></span>Vitest Unit Tests</span>
      <span class="ei-marquee-item"><span class="ei-marquee-dot"></span>Playwright E2E</span>
      <span class="ei-marquee-item"><span class="ei-marquee-dot"></span>CSS Variables Theme</span>
      <span class="ei-marquee-item"><span class="ei-marquee-dot"></span>ESLint Linting</span>
    </div>
  </div>
</div>

<div class="ei-section ei-section--from-left">
  <h2 class="ei-section-title">生态系统</h2>
  <p class="ei-section-desc">围绕 EasyInk Schema 构建的完整工具链。</p>

  <div class="ei-eco-grid">
    <div class="ei-eco-card">
      <div class="ei-eco-card-name">@easyink/designer</div>
      <div class="ei-eco-card-desc">完整的设计工作台 Vue 组件。画布编辑、物料拖放、属性面板、撤销重做、自动保存，开箱即用。</div>
    </div>
    <div class="ei-eco-card">
      <div class="ei-eco-card-name">@easyink/viewer</div>
      <div class="ei-eco-card-desc">独立的渲染/打印/导出运行时。iframe 隔离，接收 Schema + 数据即可预览、分页、打印、导出 PDF。</div>
    </div>
    <div class="ei-eco-card">
      <div class="ei-eco-card-name">@easyink/ai</div>
      <div class="ei-eco-card-desc">浏览器端 AI 对话面板。MCP Client + Designer Contribution，通过意图优先管线生成模板。</div>
    </div>
    <div class="ei-eco-card">
      <div class="ei-eco-card-name">@easyink/mcp-server</div>
      <div class="ei-eco-card-desc">Node 端 MCP Server。LLM Provider 抽象（Claude / OpenAI），支持 Docker 部署，可独立运行。</div>
    </div>
    <div class="ei-eco-card">
      <div class="ei-eco-card-name">@easyink/schema</div>
      <div class="ei-eco-card-desc">文档 Schema 类型定义、默认值、版本迁移和序列化。EasyInk 的核心数据模型。</div>
    </div>
    <div class="ei-eco-card">
      <div class="ei-eco-card-name">@easyink/schema-tools</div>
      <div class="ei-eco-card-desc">Schema 校验与 DataSource 对齐工具。Node + 浏览器双运行时，AI 管线的确定性构建层。</div>
    </div>
    <div class="ei-eco-card">
      <div class="ei-eco-card-name">@easyink/core</div>
      <div class="ei-eco-card-desc">命令管理器、选区、几何运算、吸附对齐、分页引擎、参考线。设计器与预览器的共享内核。</div>
    </div>
    <div class="ei-eco-card">
      <div class="ei-eco-card-name">@easyink/datasource</div>
      <div class="ei-eco-card-desc">字段树协议、数据源引用、绑定规则、格式化规则。支持运行时动态注册和 MCP 数据源注入。</div>
    </div>
  </div>
</div>

<div class="ei-section ei-section--last">
  <h2 class="ei-section-title">三种状态，各司其职</h2>
  <p class="ei-section-desc">EasyInk 明确区分模板状态、工作台状态和运行时状态，避免状态混乱。</p>

  <div class="ei-eco-grid ei-state-grid">
    <div class="ei-eco-card">
      <div class="ei-eco-card-name ei-state-name--template">模板状态</div>
      <div class="ei-eco-card-desc">存储在 Schema 中，支持撤销重做，可持久化、可导入导出。页面、元素、绑定、分页配置均属此类。</div>
    </div>
    <div class="ei-eco-card">
      <div class="ei-eco-card-name ei-state-name--workbench">工作台状态</div>
      <div class="ei-eco-card-desc">窗口布局、缩放参数、面板开关。用户偏好，静默持久化，不进入 Schema，不影响撤销重做。</div>
    </div>
    <div class="ei-eco-card">
      <div class="ei-eco-card-name ei-state-name--runtime">运行时状态</div>
      <div class="ei-eco-card-desc">Viewer 当前页、缩略图缓存、字体加载、打印任务。生命周期短，不持久化，随 Viewer 实例销毁。</div>
    </div>
  </div>
</div>

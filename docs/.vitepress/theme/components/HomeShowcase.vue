<template>
  <div class="ei-section ei-showcase-section">
    <div class="ei-showcase">
      <div class="ei-showcase-copy">
        <span class="ei-kicker">Designer → Schema → Viewer → Printer</span>
        <h2 class="ei-section-title">
          把复杂打印链路收进一个清晰工作流
        </h2>
        <p class="ei-section-desc">
          从可视化设计、结构化模板、数据绑定到预览打印，EasyInk 用同一份 Schema 串起设计态与运行态。
        </p>

        <div class="ei-route-pills">
          <a class="ei-route-pill" href="/designer/"><span>01</span>Designer</a>
          <a class="ei-route-pill" href="/viewer/"><span>02</span>Viewer</a>
          <a class="ei-route-pill" href="/printing/"><span>03</span>Printing</a>
        </div>
      </div>

      <div class="ei-showcase-visual" aria-hidden="true">
        <div class="ei-grid-plane" />
        <div class="ei-accent-stripe" />
        <div class="ei-window">
          <div class="ei-window-bar">
            <span />
            <span />
            <span />
            <strong>invoice.eink</strong>
          </div>
          <div class="ei-designer-stage">
            <div class="ei-tool-rail">
              <span />
              <span />
              <span />
              <span />
            </div>
            <div class="ei-paper">
              <div class="ei-paper-head" />
              <div class="ei-paper-line ei-paper-line--wide" />
              <div class="ei-paper-line" />
              <div class="ei-table">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <div class="ei-data-chip ei-data-chip--name">
                customer.name
              </div>
              <div class="ei-data-chip ei-data-chip--total">
                order.total
              </div>
            </div>
            <div class="ei-side-panel">
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>

        <div class="ei-flow-nodes">
          <div class="ei-flow-node">
            Schema
          </div>
          <div class="ei-flow-line" />
          <div class="ei-flow-node">
            Render
          </div>
          <div class="ei-flow-line" />
          <div class="ei-flow-node">
            Print
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

(function () {
  function readPayload() {
    const node = document.getElementById('easyink-payload')
    if (!node) {
      throw new Error('easyink payload is missing')
    }
    return JSON.parse(node.textContent || '{}')
  }

  function normalizeNumber(value, fallback) {
    const number = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(number) ? number : fallback
  }

  function mm(value) {
    return `${normalizeNumber(value, 0)}mm`
  }

  function getProps(element) {
    return element && typeof element.props === 'object' && element.props ? element.props : {}
  }

  function resolvePath(data, path) {
    if (!path || typeof path !== 'string') {
      return undefined
    }
    const parts = path.split(/[./]/).filter(Boolean)
    let cursor = data
    for (const part of parts) {
      if (cursor == null || typeof cursor !== 'object') {
        return undefined
      }
      cursor = cursor[part]
    }
    return cursor
  }

  function primaryBinding(element) {
    if (Array.isArray(element.binding)) {
      return element.binding.find(binding => !binding.bindIndex) || element.binding[0]
    }
    return element.binding
  }

  function boundValue(element, data) {
    const binding = primaryBinding(element)
    if (!binding || typeof binding !== 'object') {
      return undefined
    }
    return resolvePath(data, binding.fieldPath)
  }

  function textValue(element, data) {
    const props = getProps(element)
    const value = boundValue(element, data)
    if (value != null) {
      return String(value)
    }
    if (props.content != null) {
      return String(props.content)
    }
    if (element.text != null) {
      return String(element.text)
    }
    return ''
  }

  function styleMaterial(node, element) {
    node.className = `easyink-material easyink-material-${materialType(element)}`
    node.style.left = mm(element.x)
    node.style.top = mm(element.y)
    node.style.width = mm(element.width)
    node.style.height = mm(element.height)
    if (element.zIndex != null) {
      node.style.zIndex = String(element.zIndex)
    }
    if (element.rotation) {
      node.style.transform = `rotate(${normalizeNumber(element.rotation, 0)}deg)`
    }
    if (element.alpha != null) {
      node.style.opacity = String(Math.max(0, Math.min(1, normalizeNumber(element.alpha, 1))))
    }
    node.setAttribute('data-easyink-material-type', materialType(element))
    if (element.id) {
      node.setAttribute('data-easyink-material-id', String(element.id))
    }
  }

  function materialType(element) {
    return typeof element.type === 'string' && element.type ? element.type : 'unknown'
  }

  function applyBoxStyles(node, props) {
    if (props.backgroundColor) {
      node.style.background = props.backgroundColor
    }
    if (props.borderWidth) {
      node.style.border = `${mm(props.borderWidth)} ${props.borderType || 'solid'} ${props.borderColor || '#000000'}`
    }
  }

  function renderText(element, data) {
    const props = getProps(element)
    const node = document.createElement('section')
    styleMaterial(node, element)
    node.classList.add('easyink-text')
    node.textContent = `${props.prefix || ''}${textValue(element, data)}${props.suffix || ''}`
    node.style.fontSize = mm(props.fontSize || 4.23)
    node.style.fontFamily = props.fontFamily || 'Arial, sans-serif'
    node.style.fontWeight = props.fontWeight || 'normal'
    node.style.fontStyle = props.fontStyle || 'normal'
    node.style.color = props.color || '#000000'
    node.style.textAlign = props.textAlign || 'left'
    node.style.lineHeight = String(props.lineHeight || 1.5)
    node.style.letterSpacing = mm(props.letterSpacing || 0)
    node.style.whiteSpace = props.wrapMode === 'nowrap' || props.autoWrap === false ? 'pre' : 'pre-wrap'
    node.style.overflowWrap = props.wrapMode === 'anywhere' ? 'anywhere' : 'normal'
    node.style.justifyContent = verticalAlign(props.verticalAlign)
    if (props.writingMode === 'vertical') {
      node.style.writingMode = 'vertical-rl'
      node.style.textOrientation = 'mixed'
    }
    if (props.overflow === 'visible') {
      node.style.overflow = 'visible'
    }
    else if (props.overflow === 'ellipsis') {
      node.style.whiteSpace = 'nowrap'
      node.style.textOverflow = 'ellipsis'
    }
    applyBoxStyles(node, props)
    return node
  }

  function verticalAlign(value) {
    if (value === 'middle') {
      return 'center'
    }
    if (value === 'bottom') {
      return 'flex-end'
    }
    return 'flex-start'
  }

  function renderRect(element) {
    const props = getProps(element)
    const node = document.createElement('section')
    styleMaterial(node, element)
    node.style.background = props.fillColor || 'transparent'
    if (props.borderWidth) {
      node.style.border = `${mm(props.borderWidth)} ${props.borderType || 'solid'} ${props.borderColor || '#000000'}`
    }
    if (props.borderRadius) {
      node.style.borderRadius = mm(props.borderRadius)
    }
    return node
  }

  function renderEllipse(element) {
    const node = renderRect(element)
    node.classList.add('easyink-ellipse')
    node.style.borderRadius = '50%'
    return node
  }

  function renderLine(element) {
    const props = getProps(element)
    const node = document.createElement('section')
    styleMaterial(node, element)
    node.classList.add('easyink-line')
    node.style.height = mm(element.height || props.lineWidth || 0.26)
    node.style.background = props.lineColor || '#000000'
    if (props.lineType === 'dashed') {
      node.style.backgroundImage = 'repeating-linear-gradient(90deg,currentColor 0 3mm,transparent 3mm 5mm)'
      node.style.color = props.lineColor || '#000000'
      node.style.backgroundColor = 'transparent'
    }
    if (props.lineType === 'dotted') {
      node.style.backgroundImage = 'repeating-linear-gradient(90deg,currentColor 0 0.6mm,transparent 0.6mm 2mm)'
      node.style.color = props.lineColor || '#000000'
      node.style.backgroundColor = 'transparent'
    }
    return node
  }

  function renderImage(element, data) {
    const props = getProps(element)
    const node = document.createElement('section')
    styleMaterial(node, element)
    node.classList.add('easyink-image')
    applyBoxStyles(node, props)
    const src = boundValue(element, data) || props.src
    if (!src) {
      node.textContent = '[Image]'
      return node
    }
    const image = document.createElement('img')
    image.src = String(src)
    image.alt = props.alt || ''
    image.style.objectFit = props.fit || 'contain'
    node.appendChild(image)
    return node
  }

  function renderQrcode(element, data) {
    const props = getProps(element)
    const node = document.createElement('section')
    styleMaterial(node, element)
    node.classList.add('easyink-qrcode')
    applyBoxStyles(node, {
      borderWidth: props.borderWidth,
      borderType: props.borderType,
      borderColor: props.borderColor,
      backgroundColor: props.background,
    })

    const value = formatValue(boundValue(element, data) ?? props.value)
    if (!value) {
      node.textContent = '[QRCode]'
      node.style.background = props.background || '#ffffff'
      node.style.color = props.foreground || '#000000'
      return node
    }
    if (typeof window.qrcode !== 'function') {
      node.textContent = '[QRCode runtime missing]'
      return node
    }

    const qr = window.qrcode(0, normalizeQrcodeErrorCorrectionLevel(props.errorCorrectionLevel))
    qr.addData(value)
    qr.make()
    node.appendChild(createQrcodeSvg(qr, props))
    return node
  }

  function normalizeQrcodeErrorCorrectionLevel(value) {
    return value === 'L' || value === 'Q' || value === 'H' ? value : 'M'
  }

  function createQrcodeSvg(qr, props) {
    const count = qr.getModuleCount()
    const margin = 2
    const size = count + margin * 2
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`)
    svg.setAttribute('width', '100%')
    svg.setAttribute('height', '100%')
    svg.setAttribute('shape-rendering', 'crispEdges')

    const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    background.setAttribute('width', String(size))
    background.setAttribute('height', String(size))
    background.setAttribute('fill', props.background || '#ffffff')
    svg.appendChild(background)

    const parts = []
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (qr.isDark(row, col)) {
          parts.push(`M${col + margin},${row + margin}h1v1h-1z`)
        }
      }
    }
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', parts.join(''))
    path.setAttribute('fill', props.foreground || '#000000')
    svg.appendChild(path)
    return svg
  }

  function renderBarcode(element, data) {
    const props = getProps(element)
    const node = document.createElement('section')
    styleMaterial(node, element)
    node.classList.add('easyink-barcode')
    applyBoxStyles(node, {
      borderWidth: props.borderWidth,
      borderType: props.borderType,
      borderColor: props.borderColor,
      backgroundColor: props.backgroundColor,
    })

    const value = formatValue(boundValue(element, data) ?? props.value)
    if (!value) {
      node.textContent = '[Barcode]'
      node.style.background = props.backgroundColor || '#ffffff'
      node.style.color = props.lineColor || '#000000'
      return node
    }
    if (typeof window.JsBarcode !== 'function') {
      node.textContent = '[Barcode runtime missing]'
      return node
    }

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    try {
      window.JsBarcode(svg, value, {
        format: props.format || 'CODE128',
        width: normalizeNumber(props.lineWidth, 2),
        height: 60,
        margin: 4,
        displayValue: props.showText !== false,
        font: 'monospace',
        fontSize: 11,
        background: props.backgroundColor || '#ffffff',
        lineColor: props.lineColor || '#000000',
      })
      svg.style.width = '100%'
      svg.style.height = '100%'
      svg.style.display = 'block'
      node.appendChild(svg)
    }
    catch {
      node.textContent = `Invalid: ${value}`
      node.style.background = props.backgroundColor || '#ffffff'
      node.style.color = '#e53e3e'
      node.style.border = '0.2mm dashed #e53e3e'
    }
    return node
  }

  function renderTable(element, data) {
    const node = document.createElement('section')
    styleMaterial(node, element)
    node.classList.add('easyink-table')
    const topology = element.table && element.table.topology ? element.table.topology : null
    if (!topology || !Array.isArray(topology.rows) || !Array.isArray(topology.columns)) {
      node.textContent = element.type === 'table-data' ? '[Data Table]' : '[Table]'
      return node
    }
    const table = document.createElement('table')
    const colgroup = document.createElement('colgroup')
    const total = columnTotal(topology.columns)
    for (const column of topology.columns) {
      const col = document.createElement('col')
      const ratio = normalizeNumber(column.ratio, 1)
      col.style.width = `${((ratio / total) * 100).toFixed(2)}%`
      colgroup.appendChild(col)
    }
    table.appendChild(colgroup)
    for (const row of tableRows(element, topology.rows, data)) {
      table.appendChild(renderTableRow(row, element, data))
    }
    node.appendChild(table)
    return node
  }

  function renderFlowRow(element, data) {
    const props = getFlowRowProps(element)
    const node = document.createElement('section')
    styleMaterial(node, element)
    node.classList.add('easyink-flow-row')
    node.style.gap = mm(Math.max(0, props.gap))
    node.style.minHeight = mm(element.height)
    node.style.fontSize = mm(props.typography.fontSize)
    node.style.fontFamily = props.typography.fontFamily || 'inherit'
    node.style.fontWeight = props.typography.fontWeight || 'normal'
    node.style.fontStyle = props.typography.fontStyle || 'normal'
    node.style.lineHeight = String(props.typography.lineHeight)
    node.style.letterSpacing = mm(props.typography.letterSpacing)
    node.style.color = props.typography.color || '#000000'
    if (props.backgroundColor) {
      node.style.background = props.backgroundColor
    }

    const records = flowRecords(element, props, data)
    for (const record of records) {
      node.appendChild(renderFlowRecord(element, props, record, data))
    }
    return node
  }

  function renderChart(element, data) {
    const props = getProps(element)
    const node = document.createElement('section')
    styleMaterial(node, element)
    node.classList.add('easyink-chart')
    node.style.background = props.backgroundColor || 'transparent'
    const chart = normalizeChartData(boundValue(element, data) ?? props.data)
    if (chart.series.length === 0 || chart.labels.length === 0) {
      node.appendChild(renderChartEmpty(props))
      return node
    }
    node.appendChild(renderChartSvg(props.chartType || 'bar', chart, props))
    return node
  }

  function renderChartEmpty(props) {
    const label = document.createElement('span')
    label.className = 'easyink-chart__empty'
    label.textContent = `[Chart: ${props.chartType || 'bar'}]`
    return label
  }

  function normalizeChartData(value) {
    if (Array.isArray(value)) {
      return normalizeChartArray(value)
    }
    if (!value || typeof value !== 'object') {
      return { labels: [], series: [] }
    }
    if (Array.isArray(value.datasets)) {
      const labels = normalizeChartLabels(value.labels, longestDatasetLength(value.datasets))
      return {
        labels,
        series: value.datasets
          .map((dataset, index) => normalizeChartSeries(dataset, labels, index))
          .filter(series => series.values.length > 0),
      }
    }
    if (Array.isArray(value.series)) {
      const labels = normalizeChartLabels(value.labels, longestDatasetLength(value.series))
      return {
        labels,
        series: value.series
          .map((series, index) => normalizeChartSeries(series, labels, index))
          .filter(item => item.values.length > 0),
      }
    }
    if (Array.isArray(value.values)) {
      const labels = normalizeChartLabels(value.labels, value.values.length)
      return {
        labels,
        series: [normalizeChartSeries({ data: value.values, label: value.label }, labels, 0)].filter(series => series.values.length > 0),
      }
    }
    return { labels: [], series: [] }
  }

  function normalizeChartArray(value) {
    if (value.length === 0) {
      return { labels: [], series: [] }
    }
    if (value.every(item => typeof item === 'number' || typeof item === 'string')) {
      const labels = normalizeChartLabels(null, value.length)
      return {
        labels,
        series: [{ label: '', values: value.map(item => normalizeNumber(item, 0)), color: chartColor(0), stroke: chartColor(0) }],
      }
    }
    const labels = value.map((item, index) => {
      if (item && typeof item === 'object') {
        return String(item.label ?? item.name ?? item.x ?? index + 1)
      }
      return String(index + 1)
    })
    const values = value.map((item) => {
      if (item && typeof item === 'object') {
        return normalizeNumber(item.value ?? item.y ?? item.count ?? item.amount, 0)
      }
      return normalizeNumber(item, 0)
    })
    return {
      labels,
      series: [{ label: '', values, color: chartColor(0), stroke: chartColor(0) }],
    }
  }

  function normalizeChartLabels(labels, length) {
    const source = Array.isArray(labels) ? labels : []
    const result = []
    for (let index = 0; index < length; index += 1) {
      result.push(String(source[index] ?? index + 1))
    }
    return result
  }

  function longestDatasetLength(datasets) {
    return datasets.reduce((length, dataset) => {
      const values = Array.isArray(dataset) ? dataset : Array.isArray(dataset?.data) ? dataset.data : []
      return Math.max(length, values.length)
    }, 0)
  }

  function normalizeChartSeries(dataset, labels, index) {
    const source = Array.isArray(dataset) ? dataset : Array.isArray(dataset?.data) ? dataset.data : []
    return {
      label: String(dataset?.label ?? ''),
      values: labels.map((_, valueIndex) => normalizeChartValue(source[valueIndex])),
      color: chartColor(index, dataset?.backgroundColor),
      stroke: chartColor(index, dataset?.borderColor),
    }
  }

  function normalizeChartValue(value) {
    if (value && typeof value === 'object') {
      return normalizeNumber(value.y ?? value.value ?? value.count ?? value.amount, 0)
    }
    return normalizeNumber(value, 0)
  }

  function chartColor(index, value) {
    const palette = ['#2563eb', '#16a34a', '#f97316', '#dc2626', '#7c3aed', '#0891b2', '#ca8a04', '#be123c']
    if (Array.isArray(value)) {
      return String(value[index % value.length] || palette[index % palette.length])
    }
    if (typeof value === 'string' && value) {
      return value
    }
    return palette[index % palette.length]
  }

  function renderChartSvg(type, chart, props) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 100 70')
    svg.setAttribute('preserveAspectRatio', 'none')
    svg.setAttribute('role', 'img')
    svg.setAttribute('aria-label', `${type} chart`)

    const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    background.setAttribute('width', '100')
    background.setAttribute('height', '70')
    background.setAttribute('fill', props.backgroundColor || '#ffffff')
    svg.appendChild(background)

    if (type === 'pie') {
      renderPieChart(svg, chart)
    }
    else if (type === 'line') {
      renderCartesianFrame(svg)
      renderLineChart(svg, chart)
    }
    else if (type === 'scatter') {
      renderCartesianFrame(svg)
      renderScatterChart(svg, chart)
    }
    else if (type === 'radar') {
      renderRadarChart(svg, chart)
    }
    else {
      renderCartesianFrame(svg)
      renderBarChart(svg, chart)
    }
    renderChartLabels(svg, chart.labels)
    return svg
  }

  function renderCartesianFrame(svg) {
    appendSvgLine(svg, 10, 6, 10, 56, '#d1d5db', 0.3)
    appendSvgLine(svg, 10, 56, 94, 56, '#d1d5db', 0.3)
    for (let index = 1; index <= 3; index += 1) {
      const y = 56 - index * 12.5
      appendSvgLine(svg, 10, y, 94, y, '#e5e7eb', 0.2)
    }
  }

  function renderBarChart(svg, chart) {
    const range = chartRange(chart)
    const seriesCount = Math.max(chart.series.length, 1)
    const band = 84 / Math.max(chart.labels.length, 1)
    chart.series.forEach((series, seriesIndex) => {
      series.values.forEach((value, valueIndex) => {
        const barWidth = Math.max(1.2, band / seriesCount - 1)
        const x = 11 + valueIndex * band + seriesIndex * (band / seriesCount)
        const y = scaleChartY(value, range)
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
        rect.setAttribute('x', roundPoint(x))
        rect.setAttribute('y', roundPoint(y))
        rect.setAttribute('width', roundPoint(barWidth))
        rect.setAttribute('height', roundPoint(56 - y))
        rect.setAttribute('fill', series.color)
        svg.appendChild(rect)
      })
    })
  }

  function renderLineChart(svg, chart) {
    const range = chartRange(chart)
    chart.series.forEach((series) => {
      const points = series.values.map((value, index) => `${roundPoint(chartX(index, chart.labels.length))},${roundPoint(scaleChartY(value, range))}`)
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline')
      line.setAttribute('points', points.join(' '))
      line.setAttribute('fill', 'none')
      line.setAttribute('stroke', series.stroke)
      line.setAttribute('stroke-width', '0.8')
      line.setAttribute('vector-effect', 'non-scaling-stroke')
      svg.appendChild(line)
      series.values.forEach((value, index) => appendSvgCircle(svg, chartX(index, chart.labels.length), scaleChartY(value, range), 1.1, series.stroke))
    })
  }

  function renderScatterChart(svg, chart) {
    const range = chartRange(chart)
    chart.series.forEach((series) => {
      series.values.forEach((value, index) => {
        appendSvgCircle(svg, chartX(index, chart.labels.length), scaleChartY(value, range), 1.4, series.color)
      })
    })
  }

  function renderPieChart(svg, chart) {
    const values = chart.series[0].values.map(value => Math.max(0, value))
    const total = values.reduce((sum, value) => sum + value, 0)
    if (total <= 0) {
      appendSvgCircle(svg, 50, 33, 20, '#e5e7eb')
      return
    }
    let start = -Math.PI / 2
    values.forEach((value, index) => {
      const angle = (value / total) * Math.PI * 2
      const end = start + angle
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute('d', piePath(50, 33, 22, start, end))
      path.setAttribute('fill', chartColor(index, chart.series[0].color))
      svg.appendChild(path)
      start = end
    })
  }

  function renderRadarChart(svg, chart) {
    const values = chart.series[0].values
    const max = Math.max(...values.map(value => Math.max(0, value)), 1)
    for (let ring = 1; ring <= 3; ring += 1) {
      appendSvgPolygon(svg, radarPoints(chart.labels.length, (ring / 3) * 22), 'none', '#e5e7eb', 0.3)
    }
    appendSvgPolygon(svg, radarPoints(chart.labels.length, 22), 'none', '#d1d5db', 0.35)
    const points = values.map((value, index) => radarPoint(index, values.length, (Math.max(0, value) / max) * 22))
    appendSvgPolygon(svg, points, 'rgba(37, 99, 235, 0.18)', chart.series[0].stroke, 0.6)
  }

  function renderChartLabels(svg, labels) {
    const visibleLabels = labels.slice(0, 8)
    visibleLabels.forEach((label, index) => {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      text.setAttribute('x', roundPoint(chartX(index, Math.max(visibleLabels.length, 1))))
      text.setAttribute('y', '66')
      text.setAttribute('text-anchor', 'middle')
      text.setAttribute('font-size', '3')
      text.setAttribute('fill', '#6b7280')
      text.textContent = truncateLabel(label)
      svg.appendChild(text)
    })
  }

  function truncateLabel(label) {
    const value = String(label)
    return value.length > 8 ? `${value.slice(0, 7)}...` : value
  }

  function chartRange(chart) {
    const values = chart.series.flatMap(series => series.values)
    const max = Math.max(...values, 1)
    const min = Math.min(...values, 0)
    return { min: Math.min(0, min), max: max === min ? max + 1 : max }
  }

  function scaleChartY(value, range) {
    const ratio = (value - range.min) / Math.max(range.max - range.min, Number.EPSILON)
    return 56 - ratio * 48
  }

  function chartX(index, count) {
    if (count <= 1) {
      return 52
    }
    return 12 + (index / (count - 1)) * 80
  }

  function appendSvgLine(svg, x1, y1, x2, y2, stroke, width) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    line.setAttribute('x1', roundPoint(x1))
    line.setAttribute('y1', roundPoint(y1))
    line.setAttribute('x2', roundPoint(x2))
    line.setAttribute('y2', roundPoint(y2))
    line.setAttribute('stroke', stroke)
    line.setAttribute('stroke-width', String(width))
    line.setAttribute('vector-effect', 'non-scaling-stroke')
    svg.appendChild(line)
  }

  function appendSvgCircle(svg, cx, cy, radius, fill) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    circle.setAttribute('cx', roundPoint(cx))
    circle.setAttribute('cy', roundPoint(cy))
    circle.setAttribute('r', roundPoint(radius))
    circle.setAttribute('fill', fill)
    svg.appendChild(circle)
  }

  function appendSvgPolygon(svg, points, fill, stroke, strokeWidth) {
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
    polygon.setAttribute('points', points.map(point => `${roundPoint(point.x)},${roundPoint(point.y)}`).join(' '))
    polygon.setAttribute('fill', fill)
    polygon.setAttribute('stroke', stroke)
    polygon.setAttribute('stroke-width', String(strokeWidth))
    polygon.setAttribute('vector-effect', 'non-scaling-stroke')
    svg.appendChild(polygon)
  }

  function piePath(cx, cy, radius, start, end) {
    const startPoint = {
      x: cx + Math.cos(start) * radius,
      y: cy + Math.sin(start) * radius,
    }
    const endPoint = {
      x: cx + Math.cos(end) * radius,
      y: cy + Math.sin(end) * radius,
    }
    const largeArc = end - start > Math.PI ? 1 : 0
    return `M${cx},${cy} L${roundPoint(startPoint.x)},${roundPoint(startPoint.y)} A${radius},${radius} 0 ${largeArc},1 ${roundPoint(endPoint.x)},${roundPoint(endPoint.y)} Z`
  }

  function radarPoints(count, radius) {
    const points = []
    for (let index = 0; index < count; index += 1) {
      points.push(radarPoint(index, count, radius))
    }
    return points
  }

  function radarPoint(index, count, radius) {
    const angle = -Math.PI / 2 + (index / Math.max(count, 1)) * Math.PI * 2
    return {
      x: 50 + Math.cos(angle) * radius,
      y: 32 + Math.sin(angle) * radius,
    }
  }

  function getFlowRowProps(element) {
    const props = getProps(element)
    const legacyPadding = normalizeNumber(props.padding, 1)
    return {
      columns: normalizeFlowColumns(props.columns),
      gap: normalizeNumber(props.gap, 1),
      paddingX: normalizeNumber(props.paddingX, legacyPadding),
      paddingY: normalizeNumber(props.paddingY, legacyPadding),
      typography: {
        fontFamily: '',
        fontSize: 3.18,
        color: '#000000',
        fontWeight: 'normal',
        fontStyle: 'normal',
        lineHeight: 1.2,
        letterSpacing: 0,
        textAlign: 'left',
        verticalAlign: 'top',
        ...(props.typography || {}),
      },
      backgroundColor: props.backgroundColor || '',
    }
  }

  function normalizeFlowColumns(columns) {
    const source = Array.isArray(columns) && columns.length > 0
      ? columns
      : [
          { ratio: 0.44, textAlign: 'left', verticalAlign: 'middle', wrapMode: 'block', content: 'Item name' },
          { ratio: 0.12, textAlign: 'center', verticalAlign: 'middle', wrapMode: 'inline', content: '1' },
          { ratio: 0.20, textAlign: 'right', verticalAlign: 'middle', wrapMode: 'inline', content: '12.00' },
          { ratio: 0.24, textAlign: 'right', verticalAlign: 'middle', wrapMode: 'inline', content: '12.00' },
        ]
    return source.map(column => ({
      ratio: normalizeNumber(column.ratio, 1) > 0 ? normalizeNumber(column.ratio, 1) : 1,
      textAlign: column.textAlign === 'center' || column.textAlign === 'right' ? column.textAlign : 'left',
      verticalAlign: column.verticalAlign === 'top' || column.verticalAlign === 'bottom' ? column.verticalAlign : 'middle',
      wrapMode: column.wrapMode === 'block' ? 'block' : 'inline',
      content: typeof column.content === 'string' ? column.content : '',
      binding: column.binding && typeof column.binding === 'object' ? column.binding : null,
    }))
  }

  function flowRecords(element, props, data) {
    const collectionPath = flowCollectionPath(element, props)
    if (!collectionPath) {
      return [data]
    }
    const source = resolvePath(data, collectionPath)
    if (Array.isArray(source)) {
      return source.length > 0
        ? source.map(item => item && typeof item === 'object' ? item : {})
        : [{}]
    }
    const hasColumnBindings = props.columns.some(column =>
      column.binding && typeof column.binding.fieldPath === 'string' && column.binding.fieldPath.startsWith(`${collectionPath}/`),
    )
    return hasColumnBindings ? [{}] : [data]
  }

  function flowCollectionPath(element, props) {
    const binding = primaryBinding(element)
    if (binding && typeof binding.fieldPath === 'string' && binding.fieldPath) {
      return binding.fieldPath
    }
    const paths = props.columns
      .map(column => column.binding && typeof column.binding.fieldPath === 'string' ? column.binding.fieldPath : '')
      .filter(Boolean)
    return commonCollectionPath(paths)
  }

  function commonCollectionPath(paths) {
    if (paths.length === 0) {
      return ''
    }
    const split = paths.map(path => path.split(/[./]/).filter(Boolean))
    const common = []
    for (let index = 0; ; index += 1) {
      const part = split[0][index]
      if (!part || !split.every(parts => parts[index] === part)) {
        break
      }
      common.push(part)
    }
    if (common.length === 0) {
      return ''
    }
    return common.join('/')
  }

  function renderFlowRecord(element, props, record, data) {
    const row = document.createElement('div')
    row.className = 'easyink-flow-row__record'
    row.style.gap = mm(Math.max(0, props.gap))
    for (const segment of flowSegments(props.columns)) {
      row.appendChild(renderFlowSegment(element, props, segment, record, data))
    }
    return row
  }

  function flowSegments(columns) {
    const segments = []
    let inline = null
    columns.forEach((column, index) => {
      if (column.wrapMode === 'block') {
        if (inline) {
          segments.push(inline)
          inline = null
        }
        segments.push({ kind: 'block', columns: [{ column, index }] })
        return
      }
      if (!inline) {
        inline = { kind: 'inline', columns: [] }
      }
      inline.columns.push({ column, index })
    })
    if (inline) {
      segments.push(inline)
    }
    return segments
  }

  function renderFlowSegment(element, props, segment, record, data) {
    if (segment.kind === 'block') {
      const item = segment.columns[0]
      return renderFlowCell(element, props, item.column, item.index, '100%', record, data)
    }
    const group = document.createElement('div')
    group.className = 'easyink-flow-row__inline'
    group.style.gap = mm(Math.max(0, props.gap))
    const ratioTotal = segment.columns.reduce((sum, item) => sum + Math.max(0.0001, item.column.ratio), 0) || 1
    for (const item of segment.columns) {
      const width = `${((Math.max(0.0001, item.column.ratio) / ratioTotal) * 100).toFixed(6)}%`
      group.appendChild(renderFlowCell(element, props, item.column, item.index, width, record, data))
    }
    return group
  }

  function renderFlowCell(element, props, column, index, width, record, data) {
    const cell = document.createElement('div')
    cell.className = 'easyink-flow-row__cell'
    cell.setAttribute('data-flow-row-column', String(index))
    if (column.binding) {
      cell.setAttribute('data-flow-row-bound', column.binding.fieldLabel || column.binding.fieldPath || '')
    }
    cell.style.justifyContent = flowVerticalAlign(column.verticalAlign)
    cell.style.width = width
    cell.style.textAlign = column.textAlign
    cell.style.padding = `${mm(props.paddingY)} ${mm(props.paddingX)}`
    const text = document.createElement('span')
    text.textContent = flowCellText(element, column, record, data)
    cell.appendChild(text)
    return cell
  }

  function flowVerticalAlign(value) {
    if (value === 'bottom') {
      return 'flex-end'
    }
    if (value === 'middle') {
      return 'center'
    }
    return 'flex-start'
  }

  function flowCellText(element, column, record, data) {
    if (!column.binding || typeof column.binding.fieldPath !== 'string') {
      return column.content || ''
    }
    const collectionPath = commonCollectionPath([column.binding.fieldPath, flowCollectionPath(element, getFlowRowProps(element))].filter(Boolean))
    if (collectionPath && column.binding.fieldPath.startsWith(`${collectionPath}/`)) {
      return formatValue(resolvePath(record, column.binding.fieldPath.slice(collectionPath.length + 1)))
    }
    return formatValue(resolvePath(data, column.binding.fieldPath))
  }

  function formatValue(value) {
    if (value == null) {
      return ''
    }
    if (value instanceof Date) {
      return value.toISOString()
    }
    if (typeof value === 'object') {
      return JSON.stringify(value)
    }
    return String(value)
  }

  function renderPageNumber(element, pageContext) {
    const props = getProps(element)
    const node = document.createElement('section')
    styleMaterial(node, element)
    node.classList.add('easyink-page-number')
    node.style.alignItems = verticalAlign(props.verticalAlign)
    node.style.background = props.backgroundColor || 'transparent'

    const text = document.createElement('span')
    text.textContent = formatPageNumber(
      props.format,
      pageContext.currentPage,
      pageContext.totalPages,
    )
    text.style.width = '100%'
    text.style.textAlign = props.textAlign || 'center'
    text.style.fontSize = mm(props.fontSize || 3.53)
    text.style.fontFamily = props.fontFamily || 'Arial, sans-serif'
    text.style.fontWeight = props.fontWeight || 'normal'
    text.style.fontStyle = props.fontStyle || 'normal'
    text.style.color = props.color || '#000000'
    text.style.lineHeight = String(props.lineHeight || 1.5)
    text.style.letterSpacing = mm(props.letterSpacing || 0)
    node.appendChild(text)
    return node
  }

  function renderContainer(element) {
    const props = getProps(element)
    const node = document.createElement('section')
    styleMaterial(node, element)
    node.classList.add('easyink-container')
    node.style.flexDirection = props.direction === 'row' ? 'row' : 'column'
    node.style.gap = mm(props.gap || 0)
    node.style.padding = mm(props.padding || 0)
    node.style.background = props.fillColor || 'transparent'
    if (props.borderWidth) {
      node.style.border = `${mm(props.borderWidth)} ${props.borderType || 'solid'} ${props.borderColor || '#000000'}`
    }
    return node
  }

  function renderSvgStar(element) {
    const props = getProps(element)
    const node = document.createElement('section')
    styleMaterial(node, element)
    node.classList.add('easyink-svg-shape', 'easyink-svg-star')

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 100 100')
    svg.setAttribute('preserveAspectRatio', 'none')
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
    polygon.setAttribute('points', starPoints(props))
    polygon.setAttribute('fill', props.fillColor || 'transparent')
    polygon.setAttribute('stroke', props.borderWidth ? (props.borderColor || '#000000') : 'transparent')
    polygon.setAttribute('stroke-width', mm(props.borderWidth || 0))
    polygon.setAttribute('vector-effect', 'non-scaling-stroke')
    svg.appendChild(polygon)
    node.appendChild(svg)
    return node
  }

  function renderSvgHeart(element) {
    const props = getProps(element)
    const node = document.createElement('section')
    styleMaterial(node, element)
    node.classList.add('easyink-svg-shape', 'easyink-svg-heart')

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 100 100')
    svg.setAttribute('preserveAspectRatio', 'none')
    const outerPath = heartPath(props)
    const innerScale = {
      x: clamp((normalizeNumber(element.width, 100) - normalizeNumber(props.borderWidth, 0) * 2) / Math.max(normalizeNumber(element.width, 100), Number.EPSILON), 0, 1),
      y: clamp((normalizeNumber(element.height, 90) - normalizeNumber(props.borderWidth, 0) * 2) / Math.max(normalizeNumber(element.height, 90), Number.EPSILON), 0, 1),
    }
    const hasBorder = normalizeNumber(props.borderWidth, 0) > 0 && innerScale.x > 0 && innerScale.y > 0
    if (hasBorder) {
      const innerPath = heartPath(props, innerScale)
      appendSvgPath(svg, `${outerPath} ${innerPath}`, props.borderColor || '#000000', 'evenodd')
      if (props.fillColor && props.fillColor !== 'transparent') {
        appendSvgPath(svg, innerPath, props.fillColor)
      }
    }
    else {
      appendSvgPath(svg, outerPath, props.fillColor || 'transparent')
    }
    node.appendChild(svg)
    return node
  }

  function renderSvgCustom(element) {
    const props = normalizeSvgCustomProps(getProps(element))
    const node = document.createElement('section')
    styleMaterial(node, element)
    node.classList.add('easyink-svg-custom')

    if (!props.content) {
      node.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#bbb" stroke-width="1.5" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>'
      node.style.border = '0.2mm dashed #d0d0d0'
      return node
    }

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', props.viewBox)
    svg.setAttribute('preserveAspectRatio', props.preserveAspectRatio)
    svg.setAttribute('fill', props.fillColor)
    for (const child of sanitizeSvgFragment(props.content)) {
      svg.appendChild(child)
    }
    node.appendChild(svg)
    return node
  }

  function normalizeSvgCustomProps(props) {
    const parsed = parseSvgInput(props.content || '')
    return {
      content: parsed ? parsed.content : (props.content || ''),
      viewBox: parsed && parsed.viewBox ? parsed.viewBox : (props.viewBox || '0 0 100 100'),
      preserveAspectRatio: props.preserveAspectRatio || 'none',
      fillColor: props.fillColor || '#000000',
    }
  }

  function parseSvgInput(content) {
    const trimmed = String(content || '').trim()
    if (!trimmed || !/^<svg[\s>]/i.test(trimmed)) {
      return null
    }
    const parsed = parseSvgInputWithDom(trimmed)
    return parsed || parseSvgInputWithPattern(trimmed)
  }

  function parseSvgInputWithDom(content) {
    const parser = new DOMParser()
    const parsedDocument = parser.parseFromString(content, 'image/svg+xml')
    if (parsedDocument.getElementsByTagName('parsererror').length > 0) {
      return null
    }
    const root = parsedDocument.documentElement
    if (!root || root.localName.toLowerCase() !== 'svg') {
      return null
    }

    const serializer = new XMLSerializer()
    const contentRoot = parsedDocument.createElementNS('http://www.w3.org/2000/svg', 'g')
    let hasRootAttrs = false
    const dropped = new Set(['xmlns', 'viewbox', 'width', 'height', 'preserveaspectratio', 'version'])
    for (const attr of Array.from(root.attributes)) {
      if (!dropped.has(attr.name.toLowerCase())) {
        contentRoot.setAttribute(attr.name, attr.value)
        hasRootAttrs = true
      }
    }
    const children = Array.from(root.childNodes).filter(child => !isParserArtifact(child))
    for (const child of children) {
      contentRoot.appendChild(child.cloneNode(true))
    }
    return {
      content: hasRootAttrs
        ? serializer.serializeToString(contentRoot)
        : children.map(child => serializer.serializeToString(child)).join(''),
      viewBox: readRootViewBox(root),
    }
  }

  function parseSvgInputWithPattern(content) {
    const match = content.match(/^\s*<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/i)
    if (!match) {
      return null
    }
    const attrs = match[1] || ''
    return {
      content: match[2] || '',
      viewBox: readAttribute(attrs, 'viewBox') || deriveViewBox(readAttribute(attrs, 'width'), readAttribute(attrs, 'height')),
    }
  }

  function readRootViewBox(root) {
    return root.getAttribute('viewBox') || deriveViewBox(root.getAttribute('width'), root.getAttribute('height'))
  }

  function deriveViewBox(width, height) {
    const parsedWidth = parseSvgLength(width)
    const parsedHeight = parseSvgLength(height)
    if (parsedWidth == null || parsedHeight == null) {
      return undefined
    }
    return `0 0 ${parsedWidth} ${parsedHeight}`
  }

  function parseSvgLength(value) {
    const match = String(value || '').trim().match(/^[+-]?(?:\d+\.?\d*|\.\d+)/)
    return match ? match[0] : undefined
  }

  function readAttribute(attrs, name) {
    const pattern = new RegExp(`${name}\\s*=\\s*(["'])(.*?)\\1`, 'i')
    const match = attrs.match(pattern)
    return match ? match[2] : undefined
  }

  function sanitizeSvgFragment(content) {
    const parser = new DOMParser()
    const sourceDocument = parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${content}</svg>`, 'image/svg+xml')
    if (sourceDocument.getElementsByTagName('parsererror').length > 0) {
      return [document.createTextNode(content)]
    }
    const outputDocument = document.implementation.createDocument('http://www.w3.org/2000/svg', 'svg', null)
    const nodes = []
    for (const child of Array.from(sourceDocument.documentElement.childNodes)) {
      if (isParserArtifact(child)) {
        continue
      }
      const sanitized = sanitizeSvgNode(child, outputDocument)
      if (sanitized) {
        nodes.push(document.importNode(sanitized, true))
      }
    }
    return nodes
  }

  function sanitizeSvgNode(node, outputDocument) {
    if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) {
      return outputDocument.createTextNode(node.textContent || '')
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null
    }
    const source = node
    const tag = source.localName.toLowerCase()
    if (!allowedSvgElements().has(tag)) {
      return null
    }
    const target = outputDocument.createElementNS('http://www.w3.org/2000/svg', source.localName)
    for (const attr of Array.from(source.attributes)) {
      if (isAllowedSvgAttribute(tag, attr)) {
        target.setAttribute(attr.name, attr.value)
      }
    }
    for (const child of Array.from(source.childNodes)) {
      const sanitized = sanitizeSvgNode(child, outputDocument)
      if (sanitized) {
        target.appendChild(sanitized)
      }
    }
    return target
  }

  function isParserArtifact(node) {
    return node.nodeType === Node.ELEMENT_NODE
      && node.namespaceURI === 'http://www.w3.org/1999/xhtml'
      && (node.localName === 'head' || node.localName === 'body')
  }

  function isAllowedSvgAttribute(tag, attr) {
    const name = attr.name.toLowerCase()
    const allowedForElement = svgElementAttributes()[tag]
    if (name.startsWith('on') || name === 'style') {
      return false
    }
    if (!globalSvgAttributes().has(name) && !(allowedForElement && allowedForElement.has(name))) {
      return false
    }
    if (hrefSvgAttributes().has(name)) {
      return isAllowedSvgHref(tag, attr.value)
    }
    if (paintUrlSvgAttributes().has(name) && attr.value.toLowerCase().includes('url(')) {
      return /^url\(\s*#[a-z][\w:.-]*\s*\)(?:\s+[#\w(),.%+-]+)?$/i.test(attr.value.trim())
    }
    return !hasDangerousProtocol(attr.value)
  }

  function isAllowedSvgHref(tag, value) {
    const trimmed = value.trim()
    if (/^#[a-z][\w:.-]*$/i.test(trimmed)) {
      return true
    }
    if (tag !== 'image') {
      return false
    }
    try {
      const url = new URL(trimmed, 'https://easyink.local')
      return url.protocol === 'http:' || url.protocol === 'https:'
    }
    catch {
      return false
    }
  }

  function hasDangerousProtocol(value) {
    let normalized = ''
    for (const char of value) {
      const code = char.charCodeAt(0)
      if (code <= 0x20 || code === 0x7F) {
        continue
      }
      normalized += char.toLowerCase()
    }
    return normalized.includes('javascript:') || normalized.includes('vbscript:') || normalized.includes('data:text/html')
  }

  function allowedSvgElements() {
    return new Set(['svg', 'g', 'defs', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'textpath', 'image', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask', 'pattern', 'marker', 'symbol', 'use', 'title', 'desc'])
  }

  function globalSvgAttributes() {
    return new Set(['id', 'class', 'transform', 'opacity', 'fill', 'fill-opacity', 'fill-rule', 'clip-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'vector-effect', 'clip-path', 'mask', 'filter', 'marker-start', 'marker-mid', 'marker-end', 'role', 'aria-label'])
  }

  function svgElementAttributes() {
    return {
      svg: new Set(['x', 'y', 'width', 'height', 'viewbox', 'preserveaspectratio']),
      path: new Set(['d', 'pathlength']),
      rect: new Set(['x', 'y', 'width', 'height', 'rx', 'ry']),
      circle: new Set(['cx', 'cy', 'r']),
      ellipse: new Set(['cx', 'cy', 'rx', 'ry']),
      line: new Set(['x1', 'y1', 'x2', 'y2']),
      polyline: new Set(['points']),
      polygon: new Set(['points']),
      text: new Set(['x', 'y', 'dx', 'dy', 'rotate', 'textlength', 'lengthadjust', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'alignment-baseline', 'letter-spacing']),
      tspan: new Set(['x', 'y', 'dx', 'dy', 'rotate', 'textlength', 'lengthadjust', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'alignment-baseline', 'letter-spacing']),
      textpath: new Set(['href', 'xlink:href', 'startoffset', 'method', 'spacing']),
      image: new Set(['x', 'y', 'width', 'height', 'href', 'xlink:href', 'preserveaspectratio', 'crossorigin']),
      lineargradient: new Set(['x1', 'y1', 'x2', 'y2', 'gradientunits', 'gradienttransform', 'spreadmethod', 'href', 'xlink:href']),
      radialgradient: new Set(['cx', 'cy', 'r', 'fx', 'fy', 'fr', 'gradientunits', 'gradienttransform', 'spreadmethod', 'href', 'xlink:href']),
      stop: new Set(['offset', 'stop-color', 'stop-opacity']),
      clippath: new Set(['id', 'clippathunits']),
      mask: new Set(['id', 'x', 'y', 'width', 'height', 'maskunits', 'maskcontentunits']),
      pattern: new Set(['id', 'x', 'y', 'width', 'height', 'patternunits', 'patterncontentunits', 'patterntransform', 'viewbox', 'preserveaspectratio', 'href', 'xlink:href']),
      marker: new Set(['id', 'viewbox', 'preserveaspectratio', 'refx', 'refy', 'markerwidth', 'markerheight', 'markerunits', 'orient']),
      symbol: new Set(['id', 'viewbox', 'preserveaspectratio']),
      use: new Set(['x', 'y', 'width', 'height', 'href', 'xlink:href']),
    }
  }

  function hrefSvgAttributes() {
    return new Set(['href', 'xlink:href'])
  }

  function paintUrlSvgAttributes() {
    return new Set(['fill', 'stroke', 'clip-path', 'mask', 'filter', 'marker-start', 'marker-mid', 'marker-end'])
  }

  function appendSvgPath(svg, d, fill, fillRule) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', d)
    path.setAttribute('fill', fill)
    if (fillRule) {
      path.setAttribute('fill-rule', fillRule)
    }
    svg.appendChild(path)
  }

  function heartPath(props, scale) {
    return serializePath(scaleHeartPoints(heartPoints(props), scale || { x: 1, y: 1 }))
  }

  function heartPoints(props) {
    const shoulderScale = mapRange(clamp(normalizeNumber(props.heartShoulderWidth, 18), 10, 30), 10, 30, 0.88, 1.12)
    const cleftScale = mapRange(clamp(normalizeNumber(props.heartCleftDepth, 18), 6, 34), 6, 34, 0.72, 1.28)
    const points = []
    for (let index = 0; index < 72; index += 1) {
      const theta = (Math.PI * 2 * index) / 72
      const rawX = 16 * Math.sin(theta) ** 3
      const rawY = 13 * Math.cos(theta) - 5 * Math.cos(2 * theta) - 2 * Math.cos(3 * theta) - Math.cos(4 * theta)
      points.push({
        x: rawX * shoulderScale,
        y: rawY * (rawY > 0 ? cleftScale : 1),
      })
    }
    return normalizeHeartPoints(points)
  }

  function normalizeHeartPoints(points) {
    const bounds = pointBounds(points)
    return points.map(point => ({
      x: ((point.x - bounds.minX) / Math.max(bounds.maxX - bounds.minX, Number.EPSILON)) * 100,
      y: ((bounds.maxY - point.y) / Math.max(bounds.maxY - bounds.minY, Number.EPSILON)) * 100,
    }))
  }

  function scaleHeartPoints(points, scale) {
    return points.map(point => ({
      x: 50 + (point.x - 50) * scale.x,
      y: 50 + (point.y - 50) * scale.y,
    }))
  }

  function serializePath(points) {
    if (points.length === 0) {
      return ''
    }
    const commands = [`M ${roundPoint(points[0].x)} ${roundPoint(points[0].y)}`]
    for (let index = 1; index < points.length; index += 1) {
      commands.push(`L ${roundPoint(points[index].x)} ${roundPoint(points[index].y)}`)
    }
    commands.push('Z')
    return commands.join(' ')
  }

  function starPoints(props) {
    const count = clamp(Math.round(normalizeNumber(props.starPoints, 5)), 3, 24)
    const innerRatio = clamp(normalizeNumber(props.starInnerRatio, 0.381966), 0.08, 0.95)
    const rotation = normalizeNumber(props.starRotation, -90)
    const points = []
    for (let index = 0; index < count * 2; index += 1) {
      const radius = index % 2 === 0 ? 50 : 50 * innerRatio
      const angle = ((rotation + (index * 180) / count) * Math.PI) / 180
      points.push({
        x: 50 + Math.cos(angle) * radius,
        y: 50 + Math.sin(angle) * radius,
      })
    }
    return normalizeStarPoints(points)
      .map(point => `${roundPoint(point.x)},${roundPoint(point.y)}`)
      .join(' ')
  }

  function normalizeStarPoints(points) {
    const bounds = pointBounds(points)
    return points.map(point => ({
      x: ((point.x - bounds.minX) / Math.max(bounds.maxX - bounds.minX, Number.EPSILON)) * 100,
      y: ((point.y - bounds.minY) / Math.max(bounds.maxY - bounds.minY, Number.EPSILON)) * 100,
    }))
  }

  function pointBounds(points) {
    return points.reduce((acc, point) => ({
      minX: Math.min(acc.minX, point.x),
      minY: Math.min(acc.minY, point.y),
      maxX: Math.max(acc.maxX, point.x),
      maxY: Math.max(acc.maxY, point.y),
    }), {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    })
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value))
  }

  function mapRange(value, inputMin, inputMax, outputMin, outputMax) {
    const ratio = (value - inputMin) / Math.max(inputMax - inputMin, Number.EPSILON)
    return outputMin + ratio * (outputMax - outputMin)
  }

  function roundPoint(value) {
    return value.toFixed(2).replace(/\.00$/, '')
  }

  function formatPageNumber(format, current, total) {
    return String(format || '{current}/{total}')
      .replace(/\{current\}/g, String(current))
      .replace(/\{total\}/g, String(total))
  }

  function columnTotal(columns) {
    let total = 0
    for (const column of columns) {
      total += Math.max(0, normalizeNumber(column.ratio, 1))
    }
    return total || 1
  }

  function tableRows(element, rows, data) {
    if (element.type !== 'table-data') {
      return rows
    }
    const expanded = []
    for (const row of rows) {
      if (row.role !== 'repeat-template') {
        expanded.push(row)
        continue
      }
      const collectionPath = repeatCollectionPath(row)
      const collection = collectionPath ? resolvePath(data, collectionPath) : null
      if (!Array.isArray(collection) || collection.length === 0) {
        expanded.push(row)
        continue
      }
      for (const item of collection) {
        expanded.push({
          ...row,
          role: 'normal',
          __easyinkRecord: item && typeof item === 'object' ? item : {},
        })
      }
    }
    return expanded
  }

  function repeatCollectionPath(row) {
    for (const cell of row.cells || []) {
      if (cell.binding && typeof cell.binding.fieldPath === 'string') {
        const parts = cell.binding.fieldPath.split(/[./]/).filter(Boolean)
        if (parts.length > 1) {
          return parts.slice(0, -1).join('/')
        }
      }
    }
    return ''
  }

  function renderTableRow(row, element, data) {
    const tr = document.createElement('tr')
    tr.style.height = mm(row.height || 8)
    if (element.type === 'table-data' && row.role === 'header') {
      tr.style.background = getProps(element).headerBackground || '#f0f0f0'
    }
    if (element.type === 'table-data' && row.role === 'footer') {
      tr.style.background = getProps(element).summaryBackground || '#f9f9f9'
    }
    for (const cell of row.cells || []) {
      tr.appendChild(renderTableCell(cell, row, element, data))
    }
    return tr
  }

  function renderTableCell(cell, row, element, data) {
    const props = getProps(element)
    const td = document.createElement('td')
    if (cell.rowSpan > 1) {
      td.rowSpan = cell.rowSpan
    }
    if (cell.colSpan > 1) {
      td.colSpan = cell.colSpan
    }
    td.textContent = tableCellText(cell, row, data)
    td.style.border = `${mm(props.borderWidth || 0.26)} ${props.borderType || 'solid'} ${props.borderColor || '#000000'}`
    td.style.padding = mm(props.cellPadding || 1)
    const typography = { ...(props.typography || {}), ...((cell.typography || {})) }
    td.style.fontSize = mm(typography.fontSize || 3.2)
    td.style.color = typography.color || '#000000'
    td.style.fontWeight = typography.fontWeight || 'normal'
    td.style.fontStyle = typography.fontStyle || 'normal'
    td.style.textAlign = typography.textAlign || 'left'
    td.style.lineHeight = String(typography.lineHeight || 1.3)
    return td
  }

  function tableCellText(cell, row, data) {
    if (row.__easyinkRecord && cell.binding && typeof cell.binding.fieldPath === 'string') {
      const parts = cell.binding.fieldPath.split(/[./]/).filter(Boolean)
      return String(resolvePath(row.__easyinkRecord, parts[parts.length - 1]) ?? '')
    }
    if (cell.staticBinding) {
      return String(resolvePath(data, cell.staticBinding.fieldPath) ?? '')
    }
    if (cell.binding) {
      return String(resolvePath(data, cell.binding.fieldPath) ?? '')
    }
    if (cell.content && cell.content.text != null) {
      return String(cell.content.text)
    }
    return ''
  }

  function renderFallback(element) {
    const node = document.createElement('section')
    styleMaterial(node, element)
    node.classList.add('easyink-fallback')
    const type = document.createElement('strong')
    type.textContent = materialType(element)
    const body = document.createElement('pre')
    body.textContent = JSON.stringify(element, null, 2)
    node.append(type, body)
    return node
  }

  function materialRegistry(payload) {
    const registry = new Set()
    const materials = payload.materials && Array.isArray(payload.materials.materials)
      ? payload.materials.materials
      : []
    for (const material of materials) {
      if (material && typeof material.type === 'string') {
        registry.add(material.type)
      }
    }
    return registry
  }

  function renderMaterial(element, data, registry, pageContext) {
    const type = materialType(element)
    if (!registry.has(type)) {
      return renderFallback(element)
    }
    if (type === 'text') {
      return renderText(element, data)
    }
    if (type === 'rect') {
      return renderRect(element)
    }
    if (type === 'line') {
      return renderLine(element)
    }
    if (type === 'image') {
      return renderImage(element, data)
    }
    if (type === 'qrcode') {
      return renderQrcode(element, data)
    }
    if (type === 'barcode') {
      return renderBarcode(element, data)
    }
    if (type === 'ellipse') {
      return renderEllipse(element)
    }
    if (type === 'table-static' || type === 'table-data') {
      return renderTable(element, data)
    }
    if (type === 'flow-row') {
      return renderFlowRow(element, data)
    }
    if (type === 'chart') {
      return renderChart(element)
    }
    if (type === 'page-number') {
      return renderPageNumber(element, pageContext)
    }
    if (type === 'container') {
      return renderContainer(element)
    }
    if (type === 'svg-star') {
      return renderSvgStar(element)
    }
    if (type === 'svg-heart') {
      return renderSvgHeart(element)
    }
    if (type === 'svg') {
      return renderSvgCustom(element)
    }
    return renderFallback(element)
  }

  function render(payload) {
    const root = document.getElementById('easyink-root')
    if (!root) {
      throw new Error('easyink root is missing')
    }
    const schema = payload.schema || {}
    const data = payload.data || {}
    const elements = Array.isArray(schema.elements) ? schema.elements : []
    const registry = materialRegistry(payload)
    const pageContext = {
      currentPage: normalizeNumber(payload.currentPage, 1),
      totalPages: normalizeNumber(payload.totalPages, 1),
    }
    const page = document.createElement('article')
    page.className = 'easyink-page easyink-ready'
    page.setAttribute('data-easyink-runtime', payload.runtimeVersion || 'embedded')
    page.setAttribute('data-easyink-materials', Array.from(registry).join(','))
    for (const element of elements) {
      if (element && element.hidden !== true) {
        page.appendChild(renderMaterial(element, data, registry, pageContext))
      }
    }
    root.replaceChildren(page)
    window.easyinkReady = true
    document.dispatchEvent(new CustomEvent('easyink:ready'))
  }

  try {
    render(readPayload())
  }
  catch (error) {
    window.easyinkReady = false
    console.error(error)
  }
}())

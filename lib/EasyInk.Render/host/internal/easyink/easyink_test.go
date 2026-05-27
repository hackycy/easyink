package easyink

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"easyink/render/host/internal/protocol"

	"github.com/chromedp/chromedp"
)

func TestRenderHTMLBuildsReadyDocumentAndPDFOptions(t *testing.T) {
	schema := json.RawMessage(`{"version":"1.0","page":{"width":80,"height":120,"unit":"mm"},"elements":[{"id":"title","type":"text","x":4,"y":4,"width":40,"height":8,"props":{"content":"hello"}},{"id":"rule","type":"line","x":4,"y":14,"width":72,"height":0.3,"props":{"lineColor":"#111111"}}]}`)
	html, pdf, err := RenderHTML(protocol.Source{
		Type:   "easyink",
		Schema: schema,
		Data:   json.RawMessage(`{"receipt":{"no":"R-001"}}`),
	})
	if err != nil {
		t.Fatalf("render html: %v", err)
	}
	if !strings.Contains(html, "easyink-ready") {
		t.Fatal("expected generated html to include easyink-ready")
	}
	if !strings.Contains(html, `data-easyink-runtime="viewer-js"`) {
		t.Fatal("expected generated html to include embedded viewer js")
	}
	if !strings.Contains(html, RuntimeVersion) {
		t.Fatal("expected generated html to include runtime version")
	}
	if !strings.Contains(html, `"materials":[{"type":"text"`) {
		t.Fatal("expected generated html to include materials manifest payload")
	}
	if !strings.Contains(html, `data-easyink-materials`) {
		t.Fatal("expected generated html to include material registry support")
	}
	if !strings.Contains(html, `"type":"text"`) {
		t.Fatal("expected generated html to include schema payload")
	}
	if pdf.PaperWidthMm != 80 || pdf.PaperHeightMm != 120 {
		t.Fatalf("unexpected page size: %#v", pdf)
	}
}

func TestRenderHTMLIncludesMaterialRuntimeRenderers(t *testing.T) {
	schema := json.RawMessage(`{"version":"1.0","page":{"width":80,"height":120,"unit":"mm"},"elements":[{"id":"customer","type":"text","x":4,"y":4,"width":72,"height":8,"binding":{"sourceId":"root","fieldPath":"customer/name"},"props":{"fontSize":4}},{"id":"box","type":"rect","x":4,"y":16,"width":20,"height":10,"props":{"fillColor":"#eeeeee"}},{"id":"logo","type":"image","x":28,"y":16,"width":12,"height":12,"props":{"src":"data:image/gif;base64,R0lGODlhAQABAAAAACw="}},{"id":"qr","type":"qrcode","x":4,"y":32,"width":18,"height":18,"binding":{"sourceId":"root","fieldPath":"customer/name"},"props":{"foreground":"#000000","background":"#ffffff","errorCorrectionLevel":"M"}},{"id":"barcode","type":"barcode","x":26,"y":32,"width":40,"height":18,"props":{"value":"A-001","format":"CODE128","showText":true,"lineWidth":2,"lineColor":"#000000","backgroundColor":"#ffffff"}}]}`)
	html, _, err := RenderHTML(protocol.Source{
		Type:   "easyink",
		Schema: schema,
		Data:   json.RawMessage(`{"customer":{"name":"Ada"}}`),
	})
	if err != nil {
		t.Fatalf("render html: %v", err)
	}
	for _, expected := range []string{
		"function renderText",
		"function renderRect",
		"function renderImage",
		"function renderQrcode",
		"function renderBarcode",
		"function createViewer",
		"function normalizeDocumentSchema",
		"function resolveBindingValue",
		`"fieldPath":"customer/name"`,
		`"name":"Ada"`,
	} {
		if !strings.Contains(html, expected) {
			t.Fatalf("expected runtime html to include %q", expected)
		}
	}
}

func TestRenderHTMLIncludesSvgCustomRuntimeRenderer(t *testing.T) {
	schema := json.RawMessage(`{"version":"1.0","page":{"width":80,"height":120,"unit":"mm"},"elements":[{"id":"custom","type":"svg","x":4,"y":4,"width":24,"height":16,"props":{"content":"<svg width=\"24\" height=\"16\" fill=\"none\"><path d=\"M0 0H24V16Z\" onclick=\"alert(1)\" /><script>alert(2)</script></svg>","fillColor":"#111111","preserveAspectRatio":"xMidYMid meet"}}]}`)
	html, _, err := RenderHTML(protocol.Source{
		Type:   "easyink",
		Schema: schema,
		Data:   json.RawMessage(`{}`),
	})
	if err != nil {
		t.Fatalf("render html: %v", err)
	}
	for _, expected := range []string{
		`"type":"svg"`,
		"function renderSvgCustom",
		"function sanitizeSvgContent",
		"function buildSvgCustomMarkup",
		`"preserveAspectRatio":"xMidYMid meet"`,
	} {
		if !strings.Contains(html, expected) {
			t.Fatalf("expected runtime html to include %q", expected)
		}
	}
}

func TestRenderHTMLIncludesTableRuntimeRenderers(t *testing.T) {
	schema := json.RawMessage(`{"version":"1.0","page":{"width":80,"height":120,"unit":"mm"},"elements":[{"id":"items","type":"table-data","x":4,"y":4,"width":72,"height":24,"props":{"borderWidth":0.2,"cellPadding":1},"table":{"kind":"data","showHeader":true,"showFooter":false,"topology":{"columns":[{"ratio":0.7},{"ratio":0.3}],"rows":[{"height":8,"role":"header","cells":[{"content":{"text":"Item"}},{"content":{"text":"Qty"}}]},{"height":8,"role":"repeat-template","cells":[{"binding":{"sourceId":"root","fieldPath":"items/name"}},{"binding":{"sourceId":"root","fieldPath":"items/qty"}}]}]},"layout":{}}}]}`)
	html, _, err := RenderHTML(protocol.Source{
		Type:   "easyink",
		Schema: schema,
		Data:   json.RawMessage(`{"items":[{"name":"Paper","qty":2},{"name":"Ink","qty":1}]}`),
	})
	if err != nil {
		t.Fatalf("render html: %v", err)
	}
	for _, expected := range []string{
		`"type":"table-data"`,
		"function renderTable",
		"function renderTableData",
		"const tableDataFragmentPaginator",
		`"fieldPath":"items/name"`,
		`"name":"Paper"`,
	} {
		if !strings.Contains(html, expected) {
			t.Fatalf("expected runtime html to include %q", expected)
		}
	}
}

func TestRenderHTMLIncludesFlowRowRuntimeRenderer(t *testing.T) {
	html, _, err := RenderHTML(protocol.Source{
		Type:   "easyink",
		Schema: flowRowSchema(),
		Data:   json.RawMessage(`{"items":[{"name":"Paper","qty":2,"price":"12.00"},{"name":"Ink","qty":1,"price":"45.00"}]}`),
	})
	if err != nil {
		t.Fatalf("render html: %v", err)
	}
	for _, expected := range []string{
		`"type":"flow-row"`,
		"function renderFlowRow",
		"function resolveFlowRows",
		`data-flow-row-column`,
		`"fieldPath":"items/name"`,
		`"name":"Paper"`,
	} {
		if !strings.Contains(html, expected) {
			t.Fatalf("expected runtime html to include %q", expected)
		}
	}
}

func TestRenderHTMLIncludesChartRuntimeRenderer(t *testing.T) {
	html, _, err := RenderHTML(protocol.Source{
		Type:   "easyink",
		Schema: json.RawMessage(`{"version":"1.0","page":{"width":80,"height":120,"unit":"mm"},"elements":[{"id":"sales","type":"chart","x":4,"y":4,"width":72,"height":40,"props":{"chartType":"bar","backgroundColor":"#ffffff","data":{"labels":["Jan","Feb","Mar"],"datasets":[{"label":"Sales","data":[12,30,22]}]},"options":{}}}]}`),
		Data:   json.RawMessage(`{}`),
	})
	if err != nil {
		t.Fatalf("render html: %v", err)
	}
	for _, expected := range []string{
		`"type":"chart"`,
		"function renderChart",
		"[Chart:",
		`"chartType":"bar"`,
		`"Jan"`,
	} {
		if !strings.Contains(html, expected) {
			t.Fatalf("expected runtime html to include %q", expected)
		}
	}
}

func TestRenderHTMLRendersChartSvgInBrowser(t *testing.T) {
	browserPath := os.Getenv("EASYINK_RENDER_BROWSER_PATH")
	if browserPath == "" {
		t.Skip("EASYINK_RENDER_BROWSER_PATH is not set")
	}
	html, _, err := RenderHTML(protocol.Source{
		Type:   "easyink",
		Schema: json.RawMessage(`{"version":"1.0","page":{"width":100,"height":120,"unit":"mm"},"elements":[{"id":"bar","type":"chart","x":4,"y":4,"width":42,"height":30,"props":{"chartType":"bar","backgroundColor":"#ffffff","data":{"labels":["Jan","Feb","Mar"],"datasets":[{"label":"Sales","data":[12,30,22]}]}}},{"id":"line","type":"chart","x":50,"y":4,"width":42,"height":30,"props":{"chartType":"line","backgroundColor":"#ffffff","data":{"labels":["Jan","Feb","Mar"],"datasets":[{"label":"Sales","data":[12,30,22]}]}}},{"id":"pie","type":"chart","x":4,"y":40,"width":42,"height":30,"props":{"chartType":"pie","backgroundColor":"#ffffff","data":{"labels":["A","B","C"],"values":[3,2,1]}}}]}`),
		Data:   json.RawMessage(`{}`),
	})
	if err != nil {
		t.Fatalf("render html: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	allocator, allocatorCancel := chromedp.NewExecAllocator(ctx,
		chromedp.ExecPath(browserPath),
		chromedp.NoFirstRun,
		chromedp.NoDefaultBrowserCheck,
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.Flag("disable-gpu", true),
		chromedp.Flag("headless", "new"),
		chromedp.Flag("no-sandbox", true),
	)
	defer allocatorCancel()
	browserCtx, browserCancel := chromedp.NewContext(allocator)
	defer browserCancel()

	var chartCount int
	var barRects int
	var linePolylines int
	var piePaths int
	var placeholderText string
	err = chromedp.Run(browserCtx,
		chromedp.Navigate("data:text/html;base64,"+base64.StdEncoding.EncodeToString([]byte(html))),
		chromedp.WaitReady(".easyink-ready", chromedp.ByQuery),
		chromedp.Evaluate(`document.querySelectorAll('[data-element-type="chart"]').length`, &chartCount),
		chromedp.Evaluate(`document.querySelectorAll('[data-element-id="bar"] div').length`, &barRects),
		chromedp.Evaluate(`document.querySelectorAll('[data-element-id="line"] div').length`, &linePolylines),
		chromedp.Evaluate(`document.querySelectorAll('[data-element-id="pie"] div').length`, &piePaths),
		chromedp.Text(".ei-viewer-page", &placeholderText, chromedp.ByQuery),
	)
	if err != nil {
		t.Fatalf("load runtime html: %v", err)
	}
	if chartCount != 3 {
		t.Fatalf("expected 3 chart SVGs, got %d", chartCount)
	}
	if barRects == 0 {
		t.Fatalf("expected bar chart element, got %d", barRects)
	}
	if linePolylines == 0 {
		t.Fatal("expected line chart element")
	}
	if piePaths == 0 {
		t.Fatal("expected pie chart element")
	}
	if !strings.Contains(placeholderText, "[Chart:") {
		t.Fatalf("chart placeholder text missing: %q", placeholderText)
	}
}

func TestRenderHTMLFlowRowExpandsRecordsInBrowser(t *testing.T) {
	browserPath := os.Getenv("EASYINK_RENDER_BROWSER_PATH")
	if browserPath == "" {
		t.Skip("EASYINK_RENDER_BROWSER_PATH is not set")
	}
	html, _, err := RenderHTML(protocol.Source{
		Type:   "easyink",
		Schema: flowRowSchema(),
		Data:   json.RawMessage(`{"items":[{"name":"Paper","qty":2,"price":"12.00"},{"name":"Ink","qty":1,"price":"45.00"}]}`),
	})
	if err != nil {
		t.Fatalf("render html: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	allocator, allocatorCancel := chromedp.NewExecAllocator(ctx,
		chromedp.ExecPath(browserPath),
		chromedp.NoFirstRun,
		chromedp.NoDefaultBrowserCheck,
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.Flag("disable-gpu", true),
		chromedp.Flag("headless", "new"),
		chromedp.Flag("no-sandbox", true),
	)
	defer allocatorCancel()
	browserCtx, browserCancel := chromedp.NewContext(allocator)
	defer browserCancel()

	var text string
	var records int
	err = chromedp.Run(browserCtx,
		chromedp.Navigate("data:text/html;base64,"+base64.StdEncoding.EncodeToString([]byte(html))),
		chromedp.WaitReady(".easyink-ready", chromedp.ByQuery),
		chromedp.Text(`[data-easyink-material="flow-row"]`, &text, chromedp.ByQuery),
		chromedp.Evaluate(`document.querySelectorAll('[data-easyink-material="flow-row"] > div').length`, &records),
	)
	if err != nil {
		t.Fatalf("load runtime html: %v", err)
	}
	if records != 2 {
		t.Fatalf("expected 2 flow-row records, got %d", records)
	}
	for _, expected := range []string{"Paper", "Ink", "12.00", "45.00"} {
		if !strings.Contains(text, expected) {
			t.Fatalf("expected browser-rendered flow-row text to include %q, got %q", expected, text)
		}
	}
}

func TestRenderHTMLRendersCodeAndSanitizedSvgMaterialsInBrowser(t *testing.T) {
	browserPath := os.Getenv("EASYINK_RENDER_BROWSER_PATH")
	if browserPath == "" {
		t.Skip("EASYINK_RENDER_BROWSER_PATH is not set")
	}
	html, _, err := RenderHTML(protocol.Source{
		Type:   "easyink",
		Schema: json.RawMessage(`{"version":"1.0","page":{"width":90,"height":120,"unit":"mm"},"elements":[{"id":"qr","type":"qrcode","x":4,"y":4,"width":20,"height":20,"binding":{"sourceId":"root","fieldPath":"code"},"props":{"foreground":"#111111","background":"#ffffff","errorCorrectionLevel":"M"}},{"id":"barcode","type":"barcode","x":4,"y":30,"width":70,"height":18,"props":{"value":"A-001","format":"CODE128","showText":true,"lineWidth":2,"lineColor":"#111111","backgroundColor":"#ffffff"}},{"id":"custom","type":"svg","x":4,"y":54,"width":24,"height":16,"props":{"content":"<svg width=\"24\" height=\"16\"><g onload=\"alert(1)\"><path d=\"M0 0H24V16Z\" onclick=\"alert(2)\" fill=\"url(https://example.com/x)\" /><script>alert(3)</script></g></svg>","fillColor":"#111111","preserveAspectRatio":"xMidYMid meet"}}]}`),
		Data:   json.RawMessage(`{"code":"https://easyink.dev"}`),
	})
	if err != nil {
		t.Fatalf("render html: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	allocator, allocatorCancel := chromedp.NewExecAllocator(ctx,
		chromedp.ExecPath(browserPath),
		chromedp.NoFirstRun,
		chromedp.NoDefaultBrowserCheck,
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.Flag("disable-gpu", true),
		chromedp.Flag("headless", "new"),
		chromedp.Flag("no-sandbox", true),
	)
	defer allocatorCancel()
	browserCtx, browserCancel := chromedp.NewContext(allocator)
	defer browserCancel()

	var qrPaths int
	var barcodeRects int
	var svgPathCount int
	var unsafeAttributes int
	err = chromedp.Run(browserCtx,
		chromedp.Navigate("data:text/html;base64,"+base64.StdEncoding.EncodeToString([]byte(html))),
		chromedp.WaitReady(".easyink-ready", chromedp.ByQuery),
		chromedp.Evaluate(`document.querySelectorAll('[data-element-id="qr"] svg path').length`, &qrPaths),
		chromedp.Evaluate(`document.querySelectorAll('[data-element-id="barcode"] svg rect').length`, &barcodeRects),
		chromedp.Evaluate(`document.querySelectorAll('[data-element-id="custom"] svg path').length`, &svgPathCount),
		chromedp.Evaluate(`Array.from(document.querySelectorAll('[data-element-id="custom"] *')).filter((node) => Array.from(node.attributes || []).some((attr) => attr.name.startsWith("on") || attr.value.includes("https://example.com") || attr.value.includes("javascript:"))).length`, &unsafeAttributes),
	)
	if err != nil {
		t.Fatalf("load runtime html: %v", err)
	}
	if qrPaths == 0 {
		t.Fatal("expected qrcode to render SVG path")
	}
	if barcodeRects == 0 {
		t.Fatal("expected barcode to render SVG rects")
	}
	if svgPathCount != 1 {
		t.Fatalf("expected one sanitized custom SVG path, got %d", svgPathCount)
	}
	if unsafeAttributes != 0 {
		t.Fatalf("expected custom SVG sanitizer to remove unsafe attributes, got %d", unsafeAttributes)
	}
}

func TestRenderHTMLIncludesPageNumberRuntimeRenderer(t *testing.T) {
	schema := json.RawMessage(`{"version":"1.0","page":{"width":80,"height":120,"unit":"mm"},"elements":[{"id":"page","type":"page-number","x":27,"y":108,"width":26,"height":8,"placement":{"mode":"fixed"},"repeat":{"scope":"every-output-page"},"props":{"format":"Page {current} of {total}","fontSize":3.53,"textAlign":"center","verticalAlign":"middle"}}]}`)
	html, _, err := RenderHTML(protocol.Source{
		Type:   "easyink",
		Schema: schema,
		Data:   json.RawMessage(`{}`),
	})
	if err != nil {
		t.Fatalf("render html: %v", err)
	}
	for _, expected := range []string{
		`"type":"page-number"`,
		"function renderPageNumber",
		"function formatPageNumber",
		`"format":"Page {current} of {total}"`,
		`"page-number"`,
	} {
		if !strings.Contains(html, expected) {
			t.Fatalf("expected runtime html to include %q", expected)
		}
	}
}

func flowRowSchema() json.RawMessage {
	return json.RawMessage(`{"version":"1.0","page":{"width":80,"height":120,"unit":"mm"},"elements":[{"id":"items","type":"flow-row","x":4,"y":4,"width":72,"height":26.3,"binding":{"sourceId":"root","fieldPath":"items"},"props":{"gap":1,"paddingX":1,"paddingY":1,"typography":{"fontSize":3.18,"lineHeight":1.2,"letterSpacing":0,"color":"#000000"},"columns":[{"ratio":0.44,"textAlign":"left","verticalAlign":"middle","wrapMode":"block","binding":{"sourceId":"root","fieldPath":"items/name"}},{"ratio":0.12,"textAlign":"center","verticalAlign":"middle","wrapMode":"inline","binding":{"sourceId":"root","fieldPath":"items/qty"}},{"ratio":0.20,"textAlign":"right","verticalAlign":"middle","wrapMode":"inline","binding":{"sourceId":"root","fieldPath":"items/price"}}]}}]}`)
}

func TestRenderHTMLIncludesContainerRuntimeRenderer(t *testing.T) {
	schema := json.RawMessage(`{"version":"1.0","page":{"width":80,"height":120,"unit":"mm"},"elements":[{"id":"group","type":"container","x":4,"y":4,"width":72,"height":24,"props":{"padding":2.12,"gap":1.06,"direction":"row","fillColor":"#ffffff","borderWidth":0.26,"borderColor":"#111111","borderType":"dashed"}}]}`)
	html, _, err := RenderHTML(protocol.Source{
		Type:   "easyink",
		Schema: schema,
		Data:   json.RawMessage(`{}`),
	})
	if err != nil {
		t.Fatalf("render html: %v", err)
	}
	for _, expected := range []string{
		`"type":"container"`,
		"function renderContainer",
		`"direction":"row"`,
	} {
		if !strings.Contains(html, expected) {
			t.Fatalf("expected runtime html to include %q", expected)
		}
	}
}

func TestRenderHTMLIncludesSvgStarRuntimeRenderer(t *testing.T) {
	schema := json.RawMessage(`{"version":"1.0","page":{"width":80,"height":120,"unit":"mm"},"elements":[{"id":"star","type":"svg-star","x":24,"y":24,"width":24,"height":24,"props":{"fillColor":"#facc15","borderWidth":0.26,"borderColor":"#111111","starPoints":5,"starInnerRatio":0.381966,"starRotation":-90}}]}`)
	html, _, err := RenderHTML(protocol.Source{
		Type:   "easyink",
		Schema: schema,
		Data:   json.RawMessage(`{}`),
	})
	if err != nil {
		t.Fatalf("render html: %v", err)
	}
	for _, expected := range []string{
		`"type":"svg-star"`,
		"function renderSvgStar",
		"function buildStarSvgMarkup",
		"function getRawStarPolygonPoints",
		`"fillColor":"#facc15"`,
	} {
		if !strings.Contains(html, expected) {
			t.Fatalf("expected runtime html to include %q", expected)
		}
	}
}

func TestRenderHTMLIncludesSvgHeartRuntimeRenderer(t *testing.T) {
	schema := json.RawMessage(`{"version":"1.0","page":{"width":80,"height":120,"unit":"mm"},"elements":[{"id":"heart","type":"svg-heart","x":24,"y":24,"width":24,"height":22,"props":{"fillColor":"#E5484D","borderWidth":0.26,"borderColor":"#111111","heartCleftDepth":18,"heartShoulderWidth":18}}]}`)
	html, _, err := RenderHTML(protocol.Source{
		Type:   "easyink",
		Schema: schema,
		Data:   json.RawMessage(`{}`),
	})
	if err != nil {
		t.Fatalf("render html: %v", err)
	}
	for _, expected := range []string{
		`"type":"svg-heart"`,
		"function renderSvgHeart",
		"function buildSvgHeartMarkup",
		"function buildHeartPoints",
		`"fillColor":"#E5484D"`,
	} {
		if !strings.Contains(html, expected) {
			t.Fatalf("expected runtime html to include %q", expected)
		}
	}
}

func TestRuntimeFilesIncludesViewerAssetsAndMaterialsManifest(t *testing.T) {
	files, err := RuntimeFiles()
	if err != nil {
		t.Fatalf("runtime files: %v", err)
	}
	for _, expected := range []string{
		"runtime/easyink-viewer/index.html",
		"runtime/easyink-viewer/assets/viewer.css",
		"runtime/easyink-viewer/assets/viewer.js",
		"runtime/easyink-viewer/assets/materials/manifest.json",
	} {
		found := false
		for _, file := range files {
			if file == expected {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("expected runtime file %s in %#v", expected, files)
		}
	}
}

func TestRenderHTMLEscapesScriptBreakingPayload(t *testing.T) {
	schema := json.RawMessage(`{"version":"1.0","page":{"width":80,"height":120,"unit":"mm"},"elements":[]}`)
	html, _, err := RenderHTML(protocol.Source{
		Type:   "easyink",
		Schema: schema,
		Data:   json.RawMessage(`{"value":"</script><script>alert(1)</script>"}`),
	})
	if err != nil {
		t.Fatalf("render html: %v", err)
	}
	if strings.Contains(html, `</script><script>alert`) {
		t.Fatalf("payload can break script tag: %s", html)
	}
	if !strings.Contains(html, `\u003c/script\u003e`) {
		t.Fatalf("expected script-safe JSON escape: %s", html)
	}
}

package render

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"html"
	"math"
	"strings"
	"sync"
	"time"

	"easyink/render/host/internal/browser"
	"easyink/render/host/internal/diagnostics"
	"easyink/render/host/internal/easyink"
	"easyink/render/host/internal/protocol"
	"easyink/render/host/internal/security"

	"github.com/chromedp/cdproto/fetch"
	"github.com/chromedp/cdproto/network"
	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/cdproto/runtime"
	"github.com/chromedp/chromedp"
	pdfparse "github.com/ledongthuc/pdf"
)

const defaultMaxInputBytes int64 = 50 * 1024 * 1024

type Service struct {
	browser *browser.Manager
}

type Result struct {
	PDF         []byte
	Diagnostics protocol.Diagnostics
	PageCount   int
	Attachments DiagnosticAttachments
	PDFMetadata PDFMetadata
}

type DiagnosticAttachments struct {
	HTMLSnapshot []byte
	Screenshot   []byte
}

type PDFMetadata struct {
	Title    string
	Author   string
	Creator  string
	Producer string
}

type CodedError struct {
	Code    string
	Message string
	Details map[string]any
}

func (e *CodedError) Error() string {
	return e.Message
}

func NewService(browserManager *browser.Manager) *Service {
	return &Service{browser: browserManager}
}

func (s *Service) RenderPrintPDF(ctx context.Context, req protocol.PrintPDFRequest) (Result, error) {
	if strings.TrimSpace(req.RequestID) == "" {
		return Result{}, coded(protocol.ErrInvalidRequest, "requestId is required", nil)
	}
	if strings.TrimSpace(req.Source.Type) == "" {
		return Result{}, coded(protocol.ErrInvalidRequest, "source.type is required", nil)
	}
	collector := diagnostics.New(req.RequestID, req.Source.Type, s.browserVersion())
	var result Result
	var err error
	switch req.Source.Type {
	case "html":
		result, err = s.renderHTML(ctx, req, collector)
	case "pdf":
		result, err = s.normalizePDF(req)
	case "easyink":
		result, err = s.renderEasyInk(ctx, req, collector)
	default:
		err = coded(protocol.ErrUnsupportedSource, "unsupported source.type", map[string]any{"sourceType": req.Source.Type})
	}
	if err != nil {
		result.Diagnostics = collector.Snapshot()
		return result, normalizeError(err)
	}
	if req.Source.Type == "pdf" {
		collector.SetPDFMetadata(
			result.PDFMetadata.Title,
			result.PDFMetadata.Author,
			result.PDFMetadata.Creator,
			result.PDFMetadata.Producer,
		)
	}
	pageCount := result.PageCount
	if pageCount == 0 {
		pageCount = countPDFPages(result.PDF)
	}
	collector.SetPageCount(pageCount)
	result.Diagnostics = collector.Snapshot()
	result.PageCount = pageCount
	return result, nil
}

func (s *Service) browserVersion() string {
	if s == nil || s.browser == nil {
		return "not-required"
	}
	return s.browser.Version()
}

func (s *Service) renderEasyInk(ctx context.Context, req protocol.PrintPDFRequest, collector *diagnostics.Collector) (Result, error) {
	htmlDoc, pdfDefaults, err := easyink.RenderHTML(req.Source)
	if err != nil {
		return Result{}, coded(protocol.ErrInvalidRequest, err.Error(), nil)
	}
	if req.PDF.PaperWidthMm == 0 {
		req.PDF.PaperWidthMm = pdfDefaults.PaperWidthMm
	}
	if req.PDF.PaperHeightMm == 0 {
		req.PDF.PaperHeightMm = pdfDefaults.PaperHeightMm
	}
	if req.PDF.MarginMm == nil {
		req.PDF.MarginMm = pdfDefaults.MarginMm
	}
	if req.PDF.PrintBackground == nil {
		req.PDF.PrintBackground = pdfDefaults.PrintBackground
	}
	req.Source = protocol.Source{Type: "html", HTML: htmlDoc}
	if req.Wait.Until == "" {
		req.Wait.Until = "easyinkReady"
	}
	if req.Wait.Selector == "" {
		req.Wait.Selector = ".easyink-ready"
	}
	return s.renderHTML(ctx, req, collector)
}

func (s *Service) renderHTML(ctx context.Context, req protocol.PrintPDFRequest, collector *diagnostics.Collector) (Result, error) {
	if strings.TrimSpace(req.Source.HTML) == "" {
		return Result{}, coded(protocol.ErrInvalidRequest, "source.html is required", nil)
	}
	if err := security.ValidateBaseURL(req.Source.BaseURL, req.Security.AllowFileAccess, req.Security.AllowedOrigins); err != nil {
		return Result{}, coded(protocol.ErrSecurityBlocked, err.Error(), nil)
	}
	wait, err := resolveWaitPlan(req.Wait)
	if err != nil {
		return Result{}, coded(protocol.ErrInvalidRequest, err.Error(), map[string]any{"field": "wait.until"})
	}
	pageCtx, cancel, err := s.browser.NewPage(ctx)
	if err != nil {
		return Result{}, coded(protocol.ErrRenderFailed, fmt.Sprintf("browser is not ready: %v", err), map[string]any{"stage": "newPage"})
	}
	defer cancel()

	timeoutMs := req.Wait.TimeoutMs
	if timeoutMs <= 0 {
		timeoutMs = 30000
	}
	renderCtx, timeoutCancel := context.WithTimeout(pageCtx, time.Duration(timeoutMs)*time.Millisecond)
	defer timeoutCancel()

	tracker := newPageTracker(renderCtx, req, collector)
	chromedp.ListenTarget(renderCtx, tracker.handleEvent)

	loadedHTML := htmlWithBaseURL(req.Source.HTML, req.Source.BaseURL)
	htmlDataURL := "data:text/html;base64," + base64.StdEncoding.EncodeToString([]byte(loadedHTML))
	setupActions := []chromedp.Action{
		network.Enable(),
		runtime.Enable(),
		fetch.Enable().WithPatterns([]*fetch.RequestPattern{
			{URLPattern: "*", RequestStage: fetch.RequestStageRequest},
			{URLPattern: "*", RequestStage: fetch.RequestStageResponse},
		}),
		chromedp.Navigate(htmlDataURL),
		chromedp.WaitReady("body", chromedp.ByQuery),
	}
	if err := chromedp.Run(renderCtx, setupActions...); err != nil {
		attachments := s.captureFailureAttachments(pageCtx, loadedHTML, DiagnosticAttachments{})
		if errors.Is(renderCtx.Err(), context.DeadlineExceeded) {
			return Result{Attachments: attachments}, coded(protocol.ErrRenderTimeout, fmt.Sprintf("Render timeout after %dms", timeoutMs), map[string]any{"stage": "load"})
		}
		return Result{Attachments: attachments}, coded(protocol.ErrRenderFailed, err.Error(), nil)
	}

	baselineAttachments := s.captureFailureAttachments(pageCtx, loadedHTML, DiagnosticAttachments{})
	actions := []chromedp.Action{}
	for _, selector := range wait.selectors {
		actions = append(actions, chromedp.WaitReady(selector, chromedp.ByQuery))
	}
	if wait.networkIdle {
		actions = append(actions, chromedp.ActionFunc(func(ctx context.Context) error {
			return tracker.waitForNetworkIdle(ctx, 500*time.Millisecond)
		}))
	}
	var pdf []byte
	var finalURL string
	actions = append(actions,
		chromedp.Location(&finalURL),
		chromedp.ActionFunc(func(ctx context.Context) error {
			collector.SetFinalURL(finalURL)
			buf, _, err := printPDF(req.PDF).Do(ctx)
			if err != nil {
				return err
			}
			pdf = buf
			return nil
		}),
	)
	if err := chromedp.Run(renderCtx, actions...); err != nil {
		attachments := s.captureFailureAttachments(pageCtx, loadedHTML, baselineAttachments)
		if errors.Is(renderCtx.Err(), context.DeadlineExceeded) {
			return Result{Attachments: attachments}, coded(protocol.ErrRenderTimeout, fmt.Sprintf("Render timeout after %dms", timeoutMs), map[string]any{"stage": "printToPDF"})
		}
		return Result{Attachments: attachments}, coded(protocol.ErrRenderFailed, err.Error(), nil)
	}
	return Result{PDF: pdf}, nil
}

type waitPlan struct {
	until       string
	selectors   []string
	networkIdle bool
}

func resolveWaitPlan(options protocol.WaitOptions) (waitPlan, error) {
	until := strings.TrimSpace(options.Until)
	if until == "" {
		until = "load"
	}
	plan := waitPlan{until: until}
	if selector := strings.TrimSpace(options.Selector); selector != "" {
		plan.selectors = append(plan.selectors, selector)
	}
	switch until {
	case "load":
	case "selector":
		if len(plan.selectors) == 0 {
			return waitPlan{}, errors.New("wait.selector is required when wait.until is selector")
		}
	case "easyinkReady":
		plan.selectors = appendUniqueSelector(plan.selectors, ".easyink-ready")
	case "networkIdle":
		plan.networkIdle = true
	default:
		return waitPlan{}, fmt.Errorf("unsupported wait.until: %s", until)
	}
	return plan, nil
}

func appendUniqueSelector(selectors []string, selector string) []string {
	for _, existing := range selectors {
		if existing == selector {
			return selectors
		}
	}
	return append(selectors, selector)
}

func (s *Service) captureFailureAttachments(ctx context.Context, fallbackHTML string, fallback DiagnosticAttachments) DiagnosticAttachments {
	attachments := fallback
	if len(attachments.HTMLSnapshot) == 0 {
		attachments.HTMLSnapshot = []byte(fallbackHTML)
	}
	var outerHTML string
	if err := runWithShortTimeout(ctx, chromedp.OuterHTML("html", &outerHTML, chromedp.ByQuery)); err == nil {
		if strings.TrimSpace(outerHTML) != "" {
			attachments.HTMLSnapshot = []byte(outerHTML)
		}
	}
	var screenshot []byte
	if err := runWithShortTimeout(ctx, chromedp.CaptureScreenshot(&screenshot)); err == nil {
		attachments.Screenshot = screenshot
	}
	return attachments
}

func runWithShortTimeout(ctx context.Context, actions ...chromedp.Action) error {
	actionCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	return chromedp.Run(actionCtx, actions...)
}

type pageTracker struct {
	ctx       context.Context
	req       protocol.PrintPDFRequest
	collector *diagnostics.Collector

	mu       sync.Mutex
	inflight map[network.RequestID]string
	changed  chan struct{}
}

func newPageTracker(ctx context.Context, req protocol.PrintPDFRequest, collector *diagnostics.Collector) *pageTracker {
	return &pageTracker{
		ctx:       ctx,
		req:       req,
		collector: collector,
		inflight:  map[network.RequestID]string{},
		changed:   make(chan struct{}, 1),
	}
}

func (t *pageTracker) handleEvent(ev any) {
	switch e := ev.(type) {
	case *fetch.EventRequestPaused:
		t.handlePausedRequest(e)
	case *network.EventRequestWillBeSent:
		if e.Request != nil {
			t.markRequestStarted(e.RequestID, e.Request.URL)
		}
		if e.RedirectResponse != nil {
			t.handleRedirectResponse(e.RequestID, e.RedirectResponse)
		}
	case *network.EventLoadingFinished:
		t.markRequestDone(e.RequestID)
	case *network.EventLoadingFailed:
		t.handleLoadingFailed(e)
	case *runtime.EventConsoleAPICalled:
		t.handleConsole(e)
	case *runtime.EventExceptionThrown:
		if e.ExceptionDetails != nil {
			t.collector.AddConsoleError(e.ExceptionDetails.Error())
		}
	}
}

func (t *pageTracker) handlePausedRequest(e *fetch.EventRequestPaused) {
	rawURL := ""
	if e.Request != nil {
		rawURL = e.Request.URL
	}
	err := security.ValidateResourceURL(rawURL, t.req.Source.BaseURL, t.req.Security.AllowFileAccess, t.req.Security.AllowedOrigins)
	if err == nil && e.ResponseStatusCode >= 300 && e.ResponseStatusCode < 400 {
		redirectURL := headerValue(e.ResponseHeaders, "location")
		if redirectURL != "" {
			if redirectErr := security.ValidateResourceURL(redirectURL, t.req.Source.BaseURL, t.req.Security.AllowFileAccess, t.req.Security.AllowedOrigins); redirectErr != nil {
				err = fmt.Errorf("redirect target blocked: %w", redirectErr)
			}
		}
	}
	go func() {
		ctx, cancel := context.WithTimeout(t.ctx, 5*time.Second)
		defer cancel()
		if err != nil {
			t.collector.AddFailedRequest(fmt.Sprintf("%s blocked: %s", rawURL, err.Error()))
			_ = chromedp.Run(ctx, fetch.FailRequest(e.RequestID, network.ErrorReasonBlockedByClient))
			return
		}
		_ = chromedp.Run(ctx, fetch.ContinueRequest(e.RequestID))
	}()
}

func (t *pageTracker) handleRedirectResponse(requestID network.RequestID, response *network.Response) {
	if !t.redirectBlocked(response) {
		return
	}
	target := headerValueFromMap(response.Headers, "location")
	if target == "" {
		target = response.URL
	}
	if target == "" {
		target = t.requestURL(requestID)
	}
	t.collector.AddFailedRequest(fmt.Sprintf("%s blocked: redirect target is not allowed", target))
}

func (t *pageTracker) handleLoadingFailed(e *network.EventLoadingFailed) {
	url := t.requestURL(e.RequestID)
	if e.Canceled && e.BlockedReason == "" && e.ErrorText == "" {
		t.markRequestDone(e.RequestID)
		return
	}
	message := strings.TrimSpace(e.ErrorText)
	if message == "" && e.BlockedReason != "" {
		message = "blocked: " + e.BlockedReason.String()
	}
	if message == "" {
		message = "loading failed"
	}
	if url != "" {
		t.collector.AddFailedRequest(fmt.Sprintf("%s %s", url, message))
	} else {
		t.collector.AddFailedRequest(message)
	}
	t.markRequestDone(e.RequestID)
}

func (t *pageTracker) redirectBlocked(response *network.Response) bool {
	if response == nil {
		return false
	}
	if response.Status < 300 || response.Status >= 400 {
		return false
	}
	location := headerValueFromMap(response.Headers, "location")
	if location == "" {
		return false
	}
	return security.ValidateResourceURL(location, t.req.Source.BaseURL, t.req.Security.AllowFileAccess, t.req.Security.AllowedOrigins) != nil
}

func (t *pageTracker) handleConsole(e *runtime.EventConsoleAPICalled) {
	if e.Type != runtime.APITypeError && e.Type != runtime.APITypeAssert {
		return
	}
	parts := make([]string, 0, len(e.Args))
	for _, arg := range e.Args {
		if arg == nil {
			continue
		}
		if arg.Description != "" {
			parts = append(parts, arg.Description)
			continue
		}
		if len(arg.Value) > 0 {
			parts = append(parts, string(arg.Value))
		}
	}
	if len(parts) == 0 {
		t.collector.AddConsoleError(e.Type.String())
		return
	}
	t.collector.AddConsoleError(strings.Join(parts, " "))
}

func (t *pageTracker) markRequestStarted(id network.RequestID, rawURL string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.inflight[id] = rawURL
	t.notifyChanged()
}

func (t *pageTracker) markRequestDone(id network.RequestID) {
	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.inflight, id)
	t.notifyChanged()
}

func (t *pageTracker) requestURL(id network.RequestID) string {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.inflight[id]
}

func headerValue(headers []*fetch.HeaderEntry, name string) string {
	for _, header := range headers {
		if header != nil && strings.EqualFold(header.Name, name) {
			return strings.TrimSpace(header.Value)
		}
	}
	return ""
}

func headerValueFromMap(headers network.Headers, name string) string {
	for key, value := range headers {
		if strings.EqualFold(key, name) {
			if text, ok := value.(string); ok {
				return strings.TrimSpace(text)
			}
			return strings.TrimSpace(fmt.Sprint(value))
		}
	}
	return ""
}

func (t *pageTracker) waitForNetworkIdle(ctx context.Context, idleFor time.Duration) error {
	timer := time.NewTimer(idleFor)
	defer timer.Stop()
	for {
		if t.inflightCount() > 0 {
			if !timer.Stop() {
				select {
				case <-timer.C:
				default:
				}
			}
			timer.Reset(idleFor)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-timer.C:
			if t.inflightCount() == 0 {
				return nil
			}
			timer.Reset(idleFor)
		case <-t.changed:
		}
	}
}

func (t *pageTracker) inflightCount() int {
	t.mu.Lock()
	defer t.mu.Unlock()
	return len(t.inflight)
}

func (t *pageTracker) notifyChanged() {
	select {
	case t.changed <- struct{}{}:
	default:
	}
}

func (s *Service) normalizePDF(req protocol.PrintPDFRequest) (Result, error) {
	if strings.TrimSpace(req.Source.PDFBase64) == "" {
		return Result{}, coded(protocol.ErrInvalidRequest, "source.pdfBase64 is required", nil)
	}
	maxInputBytes := req.Security.MaxInputBytes
	if maxInputBytes <= 0 {
		maxInputBytes = defaultMaxInputBytes
	}
	decoded, err := base64.StdEncoding.DecodeString(req.Source.PDFBase64)
	if err != nil {
		return Result{}, coded(protocol.ErrInvalidPDF, "source.pdfBase64 is not valid base64", nil)
	}
	if int64(len(decoded)) > maxInputBytes {
		return Result{}, coded(protocol.ErrInvalidPDF, "input PDF exceeds maxInputBytes", map[string]any{"maxInputBytes": maxInputBytes})
	}
	if len(decoded) < 5 || string(decoded[:5]) != "%PDF-" {
		return Result{}, coded(protocol.ErrInvalidPDF, "input PDF header is invalid", nil)
	}
	if !bytes.Contains(decoded, []byte("%%EOF")) {
		return Result{}, coded(protocol.ErrInvalidPDF, "input PDF EOF marker is missing", nil)
	}
	if !bytes.Contains(decoded, []byte("startxref")) {
		return Result{}, coded(protocol.ErrInvalidPDF, "input PDF startxref is missing", nil)
	}
	reader, err := pdfparse.NewReader(bytes.NewReader(decoded), int64(len(decoded)))
	if err != nil {
		return Result{}, coded(protocol.ErrInvalidPDF, "input PDF structure is invalid", map[string]any{"reason": err.Error()})
	}
	pageCount := reader.NumPage()
	if pageCount <= 0 {
		return Result{}, coded(protocol.ErrInvalidPDF, "input PDF has no pages", nil)
	}
	return Result{
		PDF:         decoded,
		PageCount:   pageCount,
		PDFMetadata: readPDFMetadata(reader),
	}, nil
}

func readPDFMetadata(reader *pdfparse.Reader) PDFMetadata {
	if reader == nil {
		return PDFMetadata{}
	}
	info := reader.Trailer().Key("Info")
	if info.IsNull() {
		return PDFMetadata{}
	}
	return PDFMetadata{
		Title:    pdfText(info.Key("Title")),
		Author:   pdfText(info.Key("Author")),
		Creator:  pdfText(info.Key("Creator")),
		Producer: pdfText(info.Key("Producer")),
	}
}

func pdfText(value pdfparse.Value) string {
	if value.IsNull() {
		return ""
	}
	if text := strings.TrimSpace(value.Text()); text != "" {
		return text
	}
	if text := strings.TrimSpace(value.TextFromUTF16()); text != "" {
		return text
	}
	return strings.TrimSpace(value.RawString())
}

func htmlWithBaseURL(htmlDoc, baseURL string) string {
	if strings.TrimSpace(baseURL) == "" {
		return htmlDoc
	}
	baseTag := `<base href="` + html.EscapeString(baseURL) + `">`
	lower := strings.ToLower(htmlDoc)
	if strings.Contains(lower, "<base") {
		return htmlDoc
	}
	if idx := strings.Index(lower, "<head>"); idx >= 0 {
		insertAt := idx + len("<head>")
		return htmlDoc[:insertAt] + baseTag + htmlDoc[insertAt:]
	}
	if idx := strings.Index(lower, "<html>"); idx >= 0 {
		insertAt := idx + len("<html>")
		return htmlDoc[:insertAt] + "<head>" + baseTag + "</head>" + htmlDoc[insertAt:]
	}
	return "<head>" + baseTag + "</head>" + htmlDoc
}

func printPDF(options protocol.PDFOptions) *page.PrintToPDFParams {
	params := page.PrintToPDF()
	if options.PaperWidthMm > 0 {
		params = params.WithPaperWidth(mmToIn(options.PaperWidthMm))
	}
	if options.PaperHeightMm > 0 {
		params = params.WithPaperHeight(mmToIn(options.PaperHeightMm))
	}
	if options.PrintBackground != nil {
		params = params.WithPrintBackground(*options.PrintBackground)
	}
	if options.Landscape {
		params = params.WithLandscape(true)
	}
	if options.MarginMm != nil {
		params = params.
			WithMarginTop(mmToIn(options.MarginMm.Top)).
			WithMarginRight(mmToIn(options.MarginMm.Right)).
			WithMarginBottom(mmToIn(options.MarginMm.Bottom)).
			WithMarginLeft(mmToIn(options.MarginMm.Left))
	}
	return params
}

func mmToIn(mm float64) float64 {
	return math.Max(0, mm/25.4)
}

func countPDFPages(pdf []byte) int {
	if len(pdf) == 0 {
		return 0
	}
	count := strings.Count(string(pdf), "/Type /Page")
	pages := strings.Count(string(pdf), "/Type /Pages")
	count -= pages
	if count <= 0 {
		return 1
	}
	return count
}

func coded(code, message string, details map[string]any) *CodedError {
	return &CodedError{Code: code, Message: message, Details: details}
}

func normalizeError(err error) error {
	var codedErr *CodedError
	if errors.As(err, &codedErr) {
		return codedErr
	}
	return coded(protocol.ErrRenderFailed, err.Error(), nil)
}

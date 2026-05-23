package render

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"easyink/render/host/internal/browser"
	"easyink/render/host/internal/diagnostics"
	"easyink/render/host/internal/easyink"
	"easyink/render/host/internal/protocol"
	"easyink/render/host/internal/security"

	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/chromedp"
)

const defaultMaxInputBytes int64 = 50 * 1024 * 1024

type Service struct {
	browser *browser.Manager
}

type Result struct {
	PDF         []byte
	Diagnostics protocol.Diagnostics
	PageCount   int
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
	var (
		pdf []byte
		err error
	)
	switch req.Source.Type {
	case "html":
		pdf, err = s.renderHTML(ctx, req, collector)
	case "pdf":
		pdf, err = s.normalizePDF(req)
	case "easyink":
		pdf, err = s.renderEasyInk(ctx, req, collector)
	default:
		err = coded(protocol.ErrUnsupportedSource, "unsupported source.type", map[string]any{"sourceType": req.Source.Type})
	}
	if err != nil {
		return Result{Diagnostics: collector.Snapshot()}, normalizeError(err)
	}
	pageCount := countPDFPages(pdf)
	collector.SetPageCount(pageCount)
	return Result{PDF: pdf, Diagnostics: collector.Snapshot(), PageCount: pageCount}, nil
}

func (s *Service) browserVersion() string {
	if s == nil || s.browser == nil {
		return "not-required"
	}
	return s.browser.Version()
}

func (s *Service) renderEasyInk(ctx context.Context, req protocol.PrintPDFRequest, collector *diagnostics.Collector) ([]byte, error) {
	htmlDoc, pdfDefaults, err := easyink.RenderHTML(req.Source)
	if err != nil {
		return nil, coded(protocol.ErrInvalidRequest, err.Error(), nil)
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

func (s *Service) renderHTML(ctx context.Context, req protocol.PrintPDFRequest, collector *diagnostics.Collector) ([]byte, error) {
	if strings.TrimSpace(req.Source.HTML) == "" {
		return nil, coded(protocol.ErrInvalidRequest, "source.html is required", nil)
	}
	if err := security.ValidateBaseURL(req.Source.BaseURL, req.Security.AllowFileAccess, req.Security.AllowedOrigins); err != nil {
		return nil, coded(protocol.ErrSecurityBlocked, err.Error(), nil)
	}
	pageCtx, cancel := s.browser.NewPage(ctx)
	defer cancel()

	timeoutMs := req.Wait.TimeoutMs
	if timeoutMs <= 0 {
		timeoutMs = 30000
	}
	pageCtx, timeoutCancel := context.WithTimeout(pageCtx, time.Duration(timeoutMs)*time.Millisecond)
	defer timeoutCancel()

	htmlDataURL := "data:text/html;base64," + base64.StdEncoding.EncodeToString([]byte(req.Source.HTML))
	actions := []chromedp.Action{
		chromedp.Navigate(htmlDataURL),
		chromedp.WaitReady("body", chromedp.ByQuery),
	}
	if selector := strings.TrimSpace(req.Wait.Selector); selector != "" {
		actions = append(actions, chromedp.WaitReady(selector, chromedp.ByQuery))
	}
	if req.Wait.Until == "easyinkReady" {
		actions = append(actions, chromedp.WaitReady(".easyink-ready", chromedp.ByQuery))
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
	if err := chromedp.Run(pageCtx, actions...); err != nil {
		if errors.Is(pageCtx.Err(), context.DeadlineExceeded) {
			return nil, coded(protocol.ErrRenderTimeout, fmt.Sprintf("Render timeout after %dms", timeoutMs), map[string]any{"stage": "printToPDF"})
		}
		return nil, coded(protocol.ErrRenderFailed, err.Error(), nil)
	}
	return pdf, nil
}

func (s *Service) normalizePDF(req protocol.PrintPDFRequest) ([]byte, error) {
	if strings.TrimSpace(req.Source.PDFBase64) == "" {
		return nil, coded(protocol.ErrInvalidRequest, "source.pdfBase64 is required", nil)
	}
	maxInputBytes := req.Security.MaxInputBytes
	if maxInputBytes <= 0 {
		maxInputBytes = defaultMaxInputBytes
	}
	decoded, err := base64.StdEncoding.DecodeString(req.Source.PDFBase64)
	if err != nil {
		return nil, coded(protocol.ErrInvalidPDF, "source.pdfBase64 is not valid base64", nil)
	}
	if int64(len(decoded)) > maxInputBytes {
		return nil, coded(protocol.ErrInvalidPDF, "input PDF exceeds maxInputBytes", map[string]any{"maxInputBytes": maxInputBytes})
	}
	if len(decoded) < 5 || string(decoded[:5]) != "%PDF-" {
		return nil, coded(protocol.ErrInvalidPDF, "input PDF header is invalid", nil)
	}
	return decoded, nil
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

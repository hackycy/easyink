package easyink

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"strings"

	"easyink/render/host/internal/protocol"
)

type pageSchema struct {
	Version  string          `json:"version"`
	Page     pageDefinition  `json:"page"`
	Elements json.RawMessage `json:"elements"`
}

type pageDefinition struct {
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
	Unit   string  `json:"unit"`
}

func RenderHTML(source protocol.Source) (string, protocol.PDFOptions, error) {
	if len(source.Schema) == 0 {
		return "", protocol.PDFOptions{}, errors.New("easyink schema is required")
	}
	var schema pageSchema
	if err := json.Unmarshal(source.Schema, &schema); err != nil {
		return "", protocol.PDFOptions{}, fmt.Errorf("invalid easyink schema: %w", err)
	}
	if schema.Page.Width <= 0 || schema.Page.Height <= 0 {
		return "", protocol.PDFOptions{}, errors.New("easyink schema page width and height are required")
	}
	unit := schema.Page.Unit
	if unit == "" {
		unit = "mm"
	}
	if unit != "mm" {
		return "", protocol.PDFOptions{}, errors.New("only mm page unit is supported")
	}

	var data bytes.Buffer
	if len(source.Data) > 0 {
		if err := json.Indent(&data, source.Data, "", "  "); err != nil {
			return "", protocol.PDFOptions{}, fmt.Errorf("invalid easyink data: %w", err)
		}
	}
	var elements bytes.Buffer
	if len(schema.Elements) > 0 {
		if err := json.Indent(&elements, schema.Elements, "", "  "); err != nil {
			return "", protocol.PDFOptions{}, fmt.Errorf("invalid easyink elements: %w", err)
		}
	}

	doc := fmt.Sprintf(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { size: %.3fmm %.3fmm; margin: 0; }
    html, body { margin: 0; width: %.3fmm; min-height: %.3fmm; font-family: Arial, sans-serif; }
    .easyink-page { box-sizing: border-box; width: %.3fmm; min-height: %.3fmm; padding: 4mm; }
    .easyink-title { font-size: 14px; font-weight: 700; margin-bottom: 3mm; }
    .easyink-block { font-size: 10px; white-space: pre-wrap; overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <main class="easyink-page easyink-ready" data-easyink-runtime="embedded">
    <section class="easyink-title">EasyInk Render</section>
    <section class="easyink-block" data-role="schema">%s</section>
    <section class="easyink-block" data-role="data">%s</section>
  </main>
  <script>window.easyinkReady = true;</script>
</body>
</html>`,
		schema.Page.Width,
		schema.Page.Height,
		schema.Page.Width,
		schema.Page.Height,
		schema.Page.Width,
		schema.Page.Height,
		html.EscapeString(strings.TrimSpace(elements.String())),
		html.EscapeString(strings.TrimSpace(data.String())),
	)
	pdf := protocol.PDFOptions{
		PaperWidthMm:  schema.Page.Width,
		PaperHeightMm: schema.Page.Height,
		MarginMm:      &protocol.MarginMm{},
	}
	printBackground := true
	pdf.PrintBackground = &printBackground
	return doc, pdf, nil
}

package easyink

import (
	"bytes"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"easyink/render/host/internal/protocol"
)

const RuntimeVersion = "easyink-viewer-embedded-0.1.0"

//go:embed runtime/easyink-viewer/index.html runtime/easyink-viewer/assets/viewer.css runtime/easyink-viewer/assets/viewer.js runtime/easyink-viewer/assets/vendor/qrcode-generator.js runtime/easyink-viewer/assets/vendor/jsbarcode.all.min.js runtime/easyink-viewer/assets/materials/manifest.json
var runtimeBundle embed.FS

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

type runtimePayload struct {
	RuntimeVersion string          `json:"runtimeVersion"`
	Materials      json.RawMessage `json:"materials"`
	Schema         json.RawMessage `json:"schema"`
	Data           json.RawMessage `json:"data"`
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

	dataJSON := json.RawMessage(`{}`)
	if len(source.Data) > 0 {
		var data bytes.Buffer
		if err := json.Indent(&data, source.Data, "", "  "); err != nil {
			return "", protocol.PDFOptions{}, fmt.Errorf("invalid easyink data: %w", err)
		}
		dataJSON = json.RawMessage(data.Bytes())
	}

	payload, err := json.Marshal(runtimePayload{
		RuntimeVersion: RuntimeVersion,
		Materials:      mustReadRuntimeJSON("runtime/easyink-viewer/assets/materials/manifest.json"),
		Schema:         source.Schema,
		Data:           dataJSON,
	})
	if err != nil {
		return "", protocol.PDFOptions{}, fmt.Errorf("encode easyink payload: %w", err)
	}
	doc, err := renderRuntimeDocument(schema.Page, payload)
	if err != nil {
		return "", protocol.PDFOptions{}, err
	}
	pdf := protocol.PDFOptions{
		PaperWidthMm:  schema.Page.Width,
		PaperHeightMm: schema.Page.Height,
		MarginMm:      &protocol.MarginMm{},
	}
	printBackground := true
	pdf.PrintBackground = &printBackground
	return doc, pdf, nil
}

func mustReadRuntimeJSON(path string) json.RawMessage {
	data, err := runtimeBundle.ReadFile(path)
	if err != nil {
		return json.RawMessage(`{}`)
	}
	return json.RawMessage(data)
}

func RuntimeFiles() ([]string, error) {
	entries, err := runtimeBundle.ReadDir("runtime/easyink-viewer/assets")
	if err != nil {
		return nil, err
	}
	files := []string{"runtime/easyink-viewer/index.html"}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		files = append(files, "runtime/easyink-viewer/assets/"+entry.Name())
	}
	vendorEntries, err := runtimeBundle.ReadDir("runtime/easyink-viewer/assets/vendor")
	if err != nil {
		return nil, err
	}
	for _, entry := range vendorEntries {
		if entry.IsDir() {
			continue
		}
		files = append(files, "runtime/easyink-viewer/assets/vendor/"+entry.Name())
	}
	files = append(files, "runtime/easyink-viewer/assets/materials/manifest.json")
	return files, nil
}

func renderRuntimeDocument(page pageDefinition, payload []byte) (string, error) {
	index, err := readRuntimeText("runtime/easyink-viewer/index.html")
	if err != nil {
		return "", err
	}
	css, err := readRuntimeText("runtime/easyink-viewer/assets/viewer.css")
	if err != nil {
		return "", err
	}
	js, err := readRuntimeText("runtime/easyink-viewer/assets/viewer.js")
	if err != nil {
		return "", err
	}
	qrcodeJS, err := readRuntimeText("runtime/easyink-viewer/assets/vendor/qrcode-generator.js")
	if err != nil {
		return "", err
	}
	barcodeJS, err := readRuntimeText("runtime/easyink-viewer/assets/vendor/jsbarcode.all.min.js")
	if err != nil {
		return "", err
	}
	if _, err := readRuntimeText("runtime/easyink-viewer/assets/materials/manifest.json"); err != nil {
		return "", err
	}
	doc := strings.ReplaceAll(index, "__EASYINK_VIEWER_CSS__", css)
	doc = strings.ReplaceAll(doc, "__EASYINK_VENDOR_QRCODE_JS__", qrcodeJS)
	doc = strings.ReplaceAll(doc, "__EASYINK_VENDOR_BARCODE_JS__", barcodeJS)
	doc = strings.ReplaceAll(doc, "__EASYINK_VIEWER_JS__", js)
	doc = strings.ReplaceAll(doc, "__EASYINK_PAGE_WIDTH_MM__", fmt.Sprintf("%.3f", page.Width))
	doc = strings.ReplaceAll(doc, "__EASYINK_PAGE_HEIGHT_MM__", fmt.Sprintf("%.3f", page.Height))
	doc = strings.ReplaceAll(doc, "__EASYINK_PAYLOAD_JSON__", safeScriptJSON(payload))
	return doc, nil
}

func readRuntimeText(path string) (string, error) {
	data, err := runtimeBundle.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read easyink runtime bundle %s: %w", path, err)
	}
	return string(data), nil
}

func safeScriptJSON(value []byte) string {
	escaped := string(value)
	escaped = strings.ReplaceAll(escaped, "&", "\\u0026")
	escaped = strings.ReplaceAll(escaped, "<", "\\u003c")
	escaped = strings.ReplaceAll(escaped, ">", "\\u003e")
	escaped = strings.ReplaceAll(escaped, "\u2028", "\\u2028")
	escaped = strings.ReplaceAll(escaped, "\u2029", "\\u2029")
	return escaped
}

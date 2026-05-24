package security

import (
	"context"
	"net"
	"strings"
	"testing"
)

func TestValidateBaseURLBlocksPrivateAddresses(t *testing.T) {
	for _, rawURL := range []string{
		"http://localhost/a",
		"http://127.0.0.1/a",
		"http://10.0.0.1/a",
		"http://172.16.0.1/a",
		"http://192.168.0.1/a",
		"http://[::1]/a",
		"file:///etc/passwd",
	} {
		t.Run(rawURL, func(t *testing.T) {
			if err := ValidateBaseURL(rawURL, false, nil); err == nil {
				t.Fatalf("expected %s to be blocked", rawURL)
			}
		})
	}
}

func TestValidateBaseURLAllowsPublicAllowedOrigin(t *testing.T) {
	if err := ValidateBaseURL("https://cdn.example.com/a", false, []string{"https://cdn.example.com"}); err != nil {
		t.Fatalf("expected public allowed origin: %v", err)
	}
}

func TestValidateBaseURLDoesNotRequireAllowedOriginsMatch(t *testing.T) {
	if err := ValidateBaseURL("https://example.com/template", false, []string{"https://cdn.example.com"}); err != nil {
		t.Fatalf("expected baseUrl to be independent from resource allowlist: %v", err)
	}
}

func TestValidateResourceURLBlocksPrivateAndUnsupportedURLs(t *testing.T) {
	for _, rawURL := range []string{
		"http://localhost/a",
		"http://10.0.0.1/a",
		"ftp://example.com/a",
		"file:///etc/passwd",
	} {
		t.Run(rawURL, func(t *testing.T) {
			err := ValidateResourceURL(rawURL, "https://example.com/", false, nil)
			if err == nil {
				t.Fatalf("expected %s to be blocked", rawURL)
			}
		})
	}
}

func TestValidateResourceURLAllowsSameOriginAndAllowedOrigins(t *testing.T) {
	for _, rawURL := range []string{
		"https://example.com/image.png",
		"https://cdn.example.com/style.css",
		"/relative.png",
		"data:image/png;base64,AA==",
	} {
		t.Run(rawURL, func(t *testing.T) {
			err := ValidateResourceURL(rawURL, "https://example.com/templates/a.html", false, []string{"https://cdn.example.com"})
			if err != nil {
				t.Fatalf("expected %s to be allowed: %v", rawURL, err)
			}
		})
	}
}

func TestValidateResourceURLBlocksUnlistedPublicOrigin(t *testing.T) {
	err := ValidateResourceURL("https://other.example.com/a.png", "https://example.com/", false, []string{"https://cdn.example.com"})
	if err == nil {
		t.Fatal("expected unlisted public origin to be blocked")
	}
}

func TestValidateResourceURLBlocksRedirectToPrivateAddress(t *testing.T) {
	allowedOrigins := []string{"https://cdn.example.com"}
	if err := ValidateResourceURL("https://cdn.example.com/redirect", "https://example.com/", false, allowedOrigins); err != nil {
		t.Fatalf("expected initial public resource request to be allowed: %v", err)
	}
	err := ValidateResourceURL("http://127.0.0.1/admin", "https://example.com/", false, allowedOrigins)
	if err == nil || !strings.Contains(err.Error(), "private network") {
		t.Fatalf("expected redirected private URL to be blocked, got %v", err)
	}
}

func TestValidateResourceURLBlocksResolvedPrivateAddress(t *testing.T) {
	restore := stubLookupIPAddr(t, []net.IPAddr{{IP: net.ParseIP("127.0.0.1")}})
	defer restore()

	err := ValidateResourceURL("https://cdn.example.test/a.png", "https://example.com/", false, []string{"https://cdn.example.test"})
	if err == nil {
		t.Fatal("expected hostname resolving to private address to be blocked")
	}
}

func TestValidateResourceURLAllowsResolvedPublicAddress(t *testing.T) {
	restore := stubLookupIPAddr(t, []net.IPAddr{{IP: net.ParseIP("93.184.216.34")}})
	defer restore()

	err := ValidateResourceURL("https://cdn.example.test/a.png", "https://example.com/", false, []string{"https://cdn.example.test"})
	if err != nil {
		t.Fatalf("expected hostname resolving to public address to be allowed: %v", err)
	}
}

func stubLookupIPAddr(t *testing.T, addrs []net.IPAddr) func() {
	t.Helper()
	previous := lookupIPAddr
	lookupIPAddr = func(context.Context, string) ([]net.IPAddr, error) {
		return addrs, nil
	}
	return func() {
		lookupIPAddr = previous
	}
}

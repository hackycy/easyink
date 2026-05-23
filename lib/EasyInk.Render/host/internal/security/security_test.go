package security

import "testing"

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

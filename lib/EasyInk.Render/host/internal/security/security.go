package security

import (
	"errors"
	"net"
	"net/url"
	"strings"
)

func ValidateBaseURL(rawURL string, allowFileAccess bool, allowedOrigins []string) error {
	if rawURL == "" {
		return nil
	}
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return err
	}
	if parsed.Scheme == "" {
		return nil
	}
	if parsed.Scheme == "file" {
		if allowFileAccess {
			return nil
		}
		return errors.New("file access is disabled")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return errors.New("only http and https baseUrl values are allowed")
	}
	host := parsed.Hostname()
	if IsPrivateHost(host) {
		return errors.New("private network baseUrl values are blocked")
	}
	if len(allowedOrigins) == 0 {
		return nil
	}
	origin := parsed.Scheme + "://" + parsed.Host
	for _, allowed := range allowedOrigins {
		if strings.EqualFold(origin, strings.TrimRight(allowed, "/")) {
			return nil
		}
	}
	return errors.New("baseUrl origin is not allowed")
}

func IsPrivateHost(host string) bool {
	lower := strings.ToLower(strings.TrimSpace(host))
	if lower == "" {
		return false
	}
	if lower == "localhost" {
		return true
	}
	ip := net.ParseIP(lower)
	if ip == nil {
		return false
	}
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified()
}

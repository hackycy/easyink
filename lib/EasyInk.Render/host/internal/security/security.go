package security

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/url"
	"strings"
	"time"
)

var lookupIPAddr = net.DefaultResolver.LookupIPAddr

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
	if isPrivateNetworkHost(host) {
		return errors.New("private network baseUrl values are blocked")
	}
	return nil
}

func ValidateResourceURL(rawURL, baseURL string, allowFileAccess bool, allowedOrigins []string) error {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("invalid resource URL: %w", err)
	}
	if parsed.Scheme == "" {
		if baseURL == "" {
			return errors.New("relative resource URL requires baseUrl")
		}
		base, err := url.Parse(baseURL)
		if err != nil {
			return fmt.Errorf("invalid baseUrl: %w", err)
		}
		parsed = base.ResolveReference(parsed)
	}
	switch parsed.Scheme {
	case "about", "data", "blob":
		return nil
	case "file":
		if allowFileAccess {
			return nil
		}
		return errors.New("file resource access is disabled")
	case "http", "https":
	default:
		return errors.New("only http and https resource URLs are allowed")
	}
	host := parsed.Hostname()
	if isPrivateNetworkHost(host) {
		return errors.New("private network resource URLs are blocked")
	}
	if resourceOriginAllowed(parsed, baseURL, allowedOrigins) {
		return nil
	}
	return errors.New("resource origin is not allowed")
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

func isPrivateNetworkHost(host string) bool {
	if IsPrivateHost(host) {
		return true
	}
	for _, ip := range resolvedIPs(host) {
		if IsPrivateHost(ip.String()) {
			return true
		}
	}
	return false
}

func resolvedIPs(host string) []net.IP {
	trimmed := strings.TrimSpace(host)
	if trimmed == "" || net.ParseIP(trimmed) != nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()
	addrs, err := lookupIPAddr(ctx, trimmed)
	if err != nil {
		return nil
	}
	ips := make([]net.IP, 0, len(addrs))
	for _, addr := range addrs {
		if addr.IP != nil {
			ips = append(ips, addr.IP)
		}
	}
	return ips
}

func resourceOriginAllowed(resource *url.URL, baseURL string, allowedOrigins []string) bool {
	origin := resource.Scheme + "://" + resource.Host
	if baseURL != "" {
		if base, err := url.Parse(baseURL); err == nil && base.Scheme != "" && base.Host != "" {
			if strings.EqualFold(origin, base.Scheme+"://"+base.Host) {
				return true
			}
		}
	}
	for _, allowed := range allowedOrigins {
		if strings.EqualFold(origin, strings.TrimRight(strings.TrimSpace(allowed), "/")) {
			return true
		}
	}
	return false
}

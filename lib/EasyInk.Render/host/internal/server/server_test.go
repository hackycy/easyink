package server

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"easyink/render/host/internal/config"
)

func TestAuthRejectsMissingToken(t *testing.T) {
	s := &Server{cfg: config.Config{AuthToken: "token"}}
	req := httptest.NewRequest(http.MethodGet, "/v1/info", nil)
	rec := httptest.NewRecorder()
	s.auth(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("handler should not be called")
	})(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestAuthAllowsBearerToken(t *testing.T) {
	s := &Server{cfg: config.Config{AuthToken: "token"}}
	req := httptest.NewRequest(http.MethodGet, "/v1/info", nil)
	req.Header.Set("Authorization", "Bearer token")
	rec := httptest.NewRecorder()
	called := false
	s.auth(func(w http.ResponseWriter, r *http.Request) {
		called = true
	})(rec, req)
	if !called {
		t.Fatal("handler was not called")
	}
}

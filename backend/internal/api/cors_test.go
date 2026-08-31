package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

const testOrigin = "http://127.0.0.1:1420"

// newCORSTestEngine mounts only the CORS middleware: unlike newTestServer it
// must not depend on the MySQL-backed store (which skips when
// JS_TEST_MYSQL_DSN is unset), so these tests run in any environment.
func newCORSTestEngine(allowedOrigins []string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(corsMiddleware(allowedOrigins))
	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})
	return r
}

func preflight(r *gin.Engine, origin string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodOptions, "/healthz", nil)
	req.Header.Set(headerOrigin, origin)
	req.Header.Set(headerACReqMethod, http.MethodPost)
	req.Header.Set(headerACReqHeaders, "authorization,content-type")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestCORSPreflightAllowlistEchoesOrigin(t *testing.T) {
	r := newCORSTestEngine([]string{testOrigin})
	w := preflight(r, testOrigin)
	if w.Code != http.StatusNoContent {
		t.Fatalf("preflight status %d, want 204", w.Code)
	}
	if got := w.Header().Get(headerACAllowOrigin); got != testOrigin {
		t.Fatalf("ACAO %q, want %q (echo)", got, testOrigin)
	}
	if got := w.Header().Get(headerACAllowMethods); got != corsAllowMethodsValue {
		t.Fatalf("ACAM %q, want %q", got, corsAllowMethodsValue)
	}
	if got := w.Header().Get(headerACAllowHeaders); got != "authorization,content-type" {
		t.Fatalf("ACAH %q, want echo of requested headers", got)
	}
	if got := w.Header().Get(headerACMaxAge); got != "86400" {
		t.Fatalf("Max-Age %q, want 86400", got)
	}
	if got := w.Header().Get(headerVary); got != headerOrigin {
		t.Fatalf("Vary %q, want Origin", got)
	}
}

func TestCORSPreflightWildcard(t *testing.T) {
	r := newCORSTestEngine([]string{"*"})
	w := preflight(r, testOrigin)
	if w.Code != http.StatusNoContent {
		t.Fatalf("preflight status %d, want 204", w.Code)
	}
	if got := w.Header().Get(headerACAllowOrigin); got != "*" {
		t.Fatalf("ACAO %q, want *", got)
	}
}

func TestCORSPreflightDisallowedOrigin(t *testing.T) {
	r := newCORSTestEngine([]string{testOrigin})
	w := preflight(r, "http://evil.example")
	// No ACAO header at all: the browser rejects the preflight. The status
	// itself is irrelevant (no route matched); the missing header is the
	// contract.
	if got := w.Header().Get(headerACAllowOrigin); got != "" {
		t.Fatalf("ACAO %q for disallowed origin, want none", got)
	}
}

func TestCORSSimpleGetDecorated(t *testing.T) {
	for _, tc := range []struct {
		name           string
		allowedOrigins []string
		wantACAO       string
	}{
		{"wildcard", []string{"*"}, "*"},
		{"allowlist echo", []string{testOrigin}, testOrigin},
	} {
		r := newCORSTestEngine(tc.allowedOrigins)
		req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
		req.Header.Set(headerOrigin, testOrigin)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("%s: status %d, want 200", tc.name, w.Code)
		}
		if got := w.Header().Get(headerACAllowOrigin); got != tc.wantACAO {
			t.Fatalf("%s: ACAO %q, want %q", tc.name, got, tc.wantACAO)
		}
	}
}

func TestCORSNoOriginPassthrough(t *testing.T) {
	r := newCORSTestEngine([]string{"*"})
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status %d, want 200", w.Code)
	}
	if got := w.Header().Get(headerACAllowOrigin); got != "" {
		t.Fatalf("ACAO %q without Origin header, want none", got)
	}
}

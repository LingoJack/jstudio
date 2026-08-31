package api

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/LingoJack/jstudio/backend/internal/auth"
	"github.com/LingoJack/jstudio/backend/internal/config"
	"github.com/LingoJack/jstudio/backend/internal/storage"
	"github.com/LingoJack/jstudio/backend/internal/testsupport"
	"github.com/gin-gonic/gin"
)

// testJWTSecret is a fixed secret that satisfies the 32-byte minimum.
const testJWTSecret = "test-secret-0123456789abcdef0123456789abcdef"

// testTokenTTL keeps tokens valid for the duration of a test run.
const testTokenTTL = time.Hour

type errorEnvelope struct {
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

func newTestServer(t *testing.T) *gin.Engine {
	t.Helper()
	st := testsupport.NewStore(t)
	cfg := config.Config{}
	cfg.Auth.JWTSecret = testJWTSecret
	cfg.Auth.TokenTTL = testTokenTTL
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	return NewRouter(Deps{
		Logger:  logger,
		Config:  cfg,
		Store:   st,
		Storage: storage.NewMemStorage(),
	})
}

func doJSON(t *testing.T, r *gin.Engine, method, path, token string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var reader *bytes.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal body: %v", err)
		}
		reader = bytes.NewReader(b)
	} else {
		reader = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, reader)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func registerUser(t *testing.T, r *gin.Engine, username, password string) *httptest.ResponseRecorder {
	t.Helper()
	return doJSON(t, r, http.MethodPost, apiV1Prefix+"/auth/register", "", credentials{
		Username: username,
		Password: password,
	})
}

func login(t *testing.T, r *gin.Engine, username, password string) (string, int) {
	t.Helper()
	w := doJSON(t, r, http.MethodPost, apiV1Prefix+"/auth/login", "", credentials{
		Username: username,
		Password: password,
	})
	var resp struct {
		Token string `json:"token"`
	}
	if w.Code == http.StatusOK {
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("unmarshal login response: %v", err)
		}
	}
	return resp.Token, w.Code
}

func decodeError(t *testing.T, w *httptest.ResponseRecorder) errorEnvelope {
	t.Helper()
	var env errorEnvelope
	if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
		t.Fatalf("unmarshal error envelope (%s): %v", w.Body.String(), err)
	}
	return env
}

const (
	testUsername = "jack"
	testPassword = "correct-horse"
)

func TestRegisterLoginMe(t *testing.T) {
	r := newTestServer(t)

	w := registerUser(t, r, testUsername, testPassword)
	if w.Code != http.StatusCreated {
		t.Fatalf("register: got status %d, body %s", w.Code, w.Body.String())
	}

	token, code := login(t, r, testUsername, testPassword)
	if code != http.StatusOK || token == "" {
		t.Fatalf("login: got status %d, token empty=%v", code, token == "")
	}

	w = doJSON(t, r, http.MethodGet, apiV1Prefix+"/auth/me", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("me: got status %d, body %s", w.Code, w.Body.String())
	}
	var me struct {
		UserID   string `json:"user_id"`
		Username string `json:"username"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &me); err != nil {
		t.Fatalf("unmarshal me: %v", err)
	}
	if me.Username != testUsername || me.UserID == "" {
		t.Fatalf("me: unexpected identity %+v", me)
	}
}

func TestRegisterValidation(t *testing.T) {
	r := newTestServer(t)

	cases := []struct {
		name     string
		username string
		password string
		status   int
		code     string
	}{
		{"short username", "ab", testPassword, http.StatusBadRequest, codeInvalidRequest},
		{"long username", "abcdefghijklmnopqrstuvwxyz0123456789abc", testPassword, http.StatusBadRequest, codeInvalidRequest},
		{"short password", testUsername, "short", http.StatusBadRequest, codeInvalidRequest},
	}
	for _, tc := range cases {
		w := registerUser(t, r, tc.username, tc.password)
		if w.Code != tc.status {
			t.Fatalf("%s: got status %d, want %d, body %s", tc.name, w.Code, tc.status, w.Body.String())
		}
		if env := decodeError(t, w); env.Error.Code != tc.code {
			t.Fatalf("%s: got code %s, want %s", tc.name, env.Error.Code, tc.code)
		}
	}

	// Same username twice: second registration conflicts.
	if w := registerUser(t, r, testUsername, testPassword); w.Code != http.StatusCreated {
		t.Fatalf("first register: got status %d", w.Code)
	}
	w := registerUser(t, r, testUsername, "another-pass-123")
	if w.Code != http.StatusConflict {
		t.Fatalf("duplicate register: got status %d, body %s", w.Code, w.Body.String())
	}
	if env := decodeError(t, w); env.Error.Code != codeConflict {
		t.Fatalf("duplicate register: got code %s, want %s", env.Error.Code, codeConflict)
	}
}

func TestLoginWrongCredentials(t *testing.T) {
	r := newTestServer(t)
	if w := registerUser(t, r, testUsername, testPassword); w.Code != http.StatusCreated {
		t.Fatalf("register: got status %d", w.Code)
	}

	if _, code := login(t, r, testUsername, "wrong-password"); code != http.StatusUnauthorized {
		t.Fatalf("wrong password: got status %d, want 401", code)
	}
	if _, code := login(t, r, "ghost", testPassword); code != http.StatusUnauthorized {
		t.Fatalf("unknown user: got status %d, want 401", code)
	}
}

func TestAuthMeRejectsBadTokens(t *testing.T) {
	r := newTestServer(t)

	cases := []struct {
		name   string
		token  string
		status int
		code   string
	}{
		{"no token", "", http.StatusUnauthorized, codeUnauthorized},
		{"garbage token", "not-a-jwt", http.StatusUnauthorized, codeUnauthorized},
		{"wrong secret", signWithSecret(t, "another-secret-0123456789abcdef0123456"), http.StatusUnauthorized, codeUnauthorized},
	}
	for _, tc := range cases {
		w := doJSON(t, r, http.MethodGet, apiV1Prefix+"/auth/me", tc.token, nil)
		if w.Code != tc.status {
			t.Fatalf("%s: got status %d, want %d, body %s", tc.name, w.Code, tc.status, w.Body.String())
		}
		if env := decodeError(t, w); env.Error.Code != tc.code {
			t.Fatalf("%s: got code %s, want %s", tc.name, env.Error.Code, tc.code)
		}
	}
}

func TestAuthMeExpiredToken(t *testing.T) {
	r := newTestServer(t)
	token, _, err := auth.NewToken([]byte(testJWTSecret), "user-1", testUsername, -time.Minute)
	if err != nil {
		t.Fatalf("issue expired token: %v", err)
	}
	w := doJSON(t, r, http.MethodGet, apiV1Prefix+"/auth/me", token, nil)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expired token: got status %d, want 401, body %s", w.Code, w.Body.String())
	}
	if env := decodeError(t, w); env.Error.Code != codeTokenExpired {
		t.Fatalf("expired token: got code %s, want %s", env.Error.Code, codeTokenExpired)
	}
}

// signWithSecret issues a validly signed token under a different secret.
func signWithSecret(t *testing.T, secret string) string {
	t.Helper()
	token, _, err := auth.NewToken([]byte(secret), "user-1", testUsername, testTokenTTL)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}
	return token
}

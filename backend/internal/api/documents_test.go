package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/gin-gonic/gin"
)

// setupUser registers and logs in a user, returning the bearer token.
func setupUser(t *testing.T, r *gin.Engine, username string) string {
	t.Helper()
	if w := registerUser(t, r, username, testPassword); w.Code != http.StatusCreated {
		t.Fatalf("register %s: status %d, body %s", username, w.Code, w.Body.String())
	}
	token, code := login(t, r, username, testPassword)
	if code != http.StatusOK {
		t.Fatalf("login %s: status %d", username, code)
	}
	return token
}

func putBody(t *testing.T, r *gin.Engine, token, docID string, body any) *httptest.ResponseRecorder {
	t.Helper()
	return doJSON(t, r, http.MethodPut, apiV1Prefix+"/documents/"+docID, token, map[string]any{
		"title": "note",
		"body":  body,
	})
}

func TestDocumentSnapshotLifecycle(t *testing.T) {
	r := newTestServer(t)
	token := setupUser(t, r, testUsername)
	docPath := apiV1Prefix + "/documents/doc-1"

	// First save -> revision 1.
	w := putBody(t, r, token, "doc-1", map[string]any{"v": 1})
	if w.Code != http.StatusCreated {
		t.Fatalf("first put: status %d, body %s", w.Code, w.Body.String())
	}
	var put1 struct {
		Revision int64 `json:"revision"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &put1); err != nil {
		t.Fatalf("unmarshal put1: %v", err)
	}
	if put1.Revision != 1 {
		t.Fatalf("first put: revision %d, want 1", put1.Revision)
	}

	// Second save -> revision 2.
	w = putBody(t, r, token, "doc-1", map[string]any{"v": 2})
	var put2 struct {
		Revision int64 `json:"revision"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &put2); err != nil {
		t.Fatalf("unmarshal put2: %v", err)
	}
	if put2.Revision != 2 {
		t.Fatalf("second put: revision %d, want 2", put2.Revision)
	}

	// GET latest returns the second body verbatim.
	w = doJSON(t, r, http.MethodGet, docPath, token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("get latest: status %d, body %s", w.Code, w.Body.String())
	}
	var latest struct {
		Revision int64          `json:"revision"`
		Body     map[string]any `json:"body"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &latest); err != nil {
		t.Fatalf("unmarshal latest: %v", err)
	}
	if latest.Revision != 2 || latest.Body["v"] != float64(2) {
		t.Fatalf("get latest: revision %d body %v, want 2 / v=2", latest.Revision, latest.Body)
	}

	// History list: newest first, metadata only, total counts all snapshots.
	w = doJSON(t, r, http.MethodGet, docPath+"/snapshots", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("list snapshots: status %d, body %s", w.Code, w.Body.String())
	}
	var list struct {
		Snapshots []map[string]any `json:"snapshots"`
		Total     int              `json:"total"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil {
		t.Fatalf("unmarshal snapshots list: %v", err)
	}
	if len(list.Snapshots) != 2 || list.Total != 2 {
		t.Fatalf("snapshots list: len %d total %d, want 2/2", len(list.Snapshots), list.Total)
	}
	if list.Snapshots[0]["revision"] != float64(2) {
		t.Fatalf("snapshots list not newest-first: %v", list.Snapshots)
	}

	// Specific historical snapshot returns the first body.
	w = doJSON(t, r, http.MethodGet, docPath+"/snapshots/1", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("get snapshot 1: status %d, body %s", w.Code, w.Body.String())
	}
	var first struct {
		Body map[string]any `json:"body"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &first); err != nil {
		t.Fatalf("unmarshal snapshot 1: %v", err)
	}
	if first.Body["v"] != float64(1) {
		t.Fatalf("snapshot 1: body %v, want v=1", first.Body)
	}

	// Tombstone: 204, then every read endpoint 404s.
	if w := doJSON(t, r, http.MethodDelete, docPath, token, nil); w.Code != http.StatusNoContent {
		t.Fatalf("delete: status %d, body %s", w.Code, w.Body.String())
	}
	for _, path := range []string{docPath, docPath + "/snapshots", docPath + "/snapshots/1"} {
		if w := doJSON(t, r, http.MethodGet, path, token, nil); w.Code != http.StatusNotFound {
			t.Fatalf("get %s after delete: status %d, want 404", path, w.Code)
		}
	}
	// Double delete: 404.
	if w := doJSON(t, r, http.MethodDelete, docPath, token, nil); w.Code != http.StatusNotFound {
		t.Fatalf("double delete: status %d, want 404", w.Code)
	}

	// Revive: a new save continues the revision counter.
	w = putBody(t, r, token, "doc-1", map[string]any{"v": 3})
	if w.Code != http.StatusCreated {
		t.Fatalf("revive put: status %d, body %s", w.Code, w.Body.String())
	}
	var put3 struct {
		Revision int64 `json:"revision"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &put3); err != nil {
		t.Fatalf("unmarshal put3: %v", err)
	}
	if put3.Revision != 3 {
		t.Fatalf("revive put: revision %d, want 3 (continues counter)", put3.Revision)
	}
}

func TestDocumentUserIsolation(t *testing.T) {
	r := newTestServer(t)
	tokenA := setupUser(t, r, "alice")
	tokenB := setupUser(t, r, "bob")
	docPath := apiV1Prefix + "/documents/shared-doc"

	if w := putBody(t, r, tokenA, "shared-doc", map[string]any{"owner": "alice"}); w.Code != http.StatusCreated {
		t.Fatalf("alice put: status %d", w.Code)
	}

	// Bob cannot read Alice's document.
	if w := doJSON(t, r, http.MethodGet, docPath, tokenB, nil); w.Code != http.StatusNotFound {
		t.Fatalf("bob get alice doc: status %d, want 404", w.Code)
	}

	// Bob saving the same doc id creates his own document at revision 1.
	if w := putBody(t, r, tokenB, "shared-doc", map[string]any{"owner": "bob"}); w.Code != http.StatusCreated {
		t.Fatalf("bob put: status %d", w.Code)
	}
	var bobPut struct {
		Revision int64 `json:"revision"`
	}
	w := doJSON(t, r, http.MethodGet, docPath, tokenB, nil)
	if err := json.Unmarshal(w.Body.Bytes(), &bobPut); err != nil {
		t.Fatalf("unmarshal bob latest: %v", err)
	}
	if bobPut.Revision != 1 {
		t.Fatalf("bob latest revision %d, want 1 (own document)", bobPut.Revision)
	}

	// Each list shows exactly one document.
	for _, tc := range []struct{ token string; name string }{{tokenA, "alice"}, {tokenB, "bob"}} {
		w := doJSON(t, r, http.MethodGet, apiV1Prefix+"/documents", tc.token, nil)
		if w.Code != http.StatusOK {
			t.Fatalf("%s list: status %d", tc.name, w.Code)
		}
		var list struct {
			Documents []map[string]any `json:"documents"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil {
			t.Fatalf("unmarshal %s list: %v", tc.name, err)
		}
		if len(list.Documents) != 1 {
			t.Fatalf("%s list: %d documents, want 1", tc.name, len(list.Documents))
		}
	}
}

// TestDocumentConcurrentRevisions hammers AppendSnapshot from many goroutines;
// the single-transaction revision bump must yield exactly 1..N with no gaps
// and no duplicates.
func TestDocumentConcurrentRevisions(t *testing.T) {
	r := newTestServer(t)
	token := setupUser(t, r, testUsername)

	const concurrency = 20
	type result struct {
		status   int
		revision int64
	}
	results := make(chan result, concurrency)
	var wg sync.WaitGroup
	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			body, _ := json.Marshal(map[string]any{
				"title": "note",
				"body":  map[string]any{"i": i},
			})
			req := httptest.NewRequest(http.MethodPut, apiV1Prefix+"/documents/doc-c", strings.NewReader(string(body)))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", "Bearer "+token)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			var resp struct {
				Revision int64 `json:"revision"`
			}
			_ = json.Unmarshal(w.Body.Bytes(), &resp)
			results <- result{status: w.Code, revision: resp.Revision}
		}(i)
	}
	wg.Wait()
	close(results)

	seen := make(map[int64]bool, concurrency)
	for res := range results {
		if res.status != http.StatusCreated {
			t.Errorf("concurrent put: status %d, want 201", res.status)
			continue
		}
		if seen[res.revision] {
			t.Errorf("concurrent put: duplicate revision %d", res.revision)
		}
		seen[res.revision] = true
	}
	for rev := int64(1); rev <= concurrency; rev++ {
		if !seen[rev] {
			t.Errorf("concurrent put: missing revision %d", rev)
		}
	}

	w := doJSON(t, r, http.MethodGet, apiV1Prefix+"/documents/doc-c", token, nil)
	var latest struct {
		Revision int64 `json:"revision"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &latest); err != nil {
		t.Fatalf("unmarshal latest: %v", err)
	}
	if latest.Revision != concurrency {
		t.Fatalf("latest revision %d, want %d", latest.Revision, concurrency)
	}
}

func TestPutDocumentValidation(t *testing.T) {
	r := newTestServer(t)
	token := setupUser(t, r, testUsername)
	docPath := apiV1Prefix + "/documents/doc-v"

	// Malformed JSON -> 400.
	req := httptest.NewRequest(http.MethodPut, docPath, strings.NewReader("{not json"))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("malformed json: status %d, want 400", w.Code)
	}

	// Missing body field -> 400.
	w = doJSON(t, r, http.MethodPut, docPath, token, map[string]any{"title": "no body"})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("missing body: status %d, want 400", w.Code)
	}

	// Oversized envelope -> 413.
	huge := `{"title":"t","body":"` + strings.Repeat("a", maxDocumentRequestBytes) + `"}`
	req = httptest.NewRequest(http.MethodPut, docPath, strings.NewReader(huge))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversized: status %d, want 413", w.Code)
	}
	if env := decodeError(t, w); env.Error.Code != codePayloadTooLarge {
		t.Fatalf("oversized: code %s, want %s", env.Error.Code, codePayloadTooLarge)
	}

	// Bad revision param -> 400.
	if w := doJSON(t, r, http.MethodGet, docPath+"/snapshots/zero", token, nil); w.Code != http.StatusBadRequest {
		t.Fatalf("bad revision: status %d, want 400", w.Code)
	}
}

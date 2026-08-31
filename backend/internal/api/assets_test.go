package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"testing"

	"github.com/gin-gonic/gin"
)

var testPNG = []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4}

// uploadAsset POSTs a multipart upload with one file part.
func uploadAsset(t *testing.T, r *gin.Engine, token, docID, fileName, contentType string, content []byte) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	header := make(textproto.MIMEHeader)
	header.Set("Content-Disposition", fmt.Sprintf(`form-data; name="file"; filename="%s"`, fileName))
	if contentType != "" {
		header.Set("Content-Type", contentType)
	}
	part, err := writer.CreatePart(header)
	if err != nil {
		t.Fatalf("create part: %v", err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatalf("write part: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, apiV1Prefix+"/documents/"+docID+"/assets", &buf)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestAssetUploadDownloadRoundTrip(t *testing.T) {
	r := newTestServer(t)
	token := setupUser(t, r, testUsername)

	w := uploadAsset(t, r, token, "doc-a", "image.png", "image/png", testPNG)
	if w.Code != http.StatusOK {
		t.Fatalf("upload: status %d, body %s", w.Code, w.Body.String())
	}
	var uploaded struct {
		FileName    string `json:"file_name"`
		ContentType string `json:"content_type"`
		SizeBytes   int64  `json:"size_bytes"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &uploaded); err != nil {
		t.Fatalf("unmarshal upload response: %v", err)
	}
	if uploaded.FileName != "image.png" || uploaded.ContentType != "image/png" || uploaded.SizeBytes != int64(len(testPNG)) {
		t.Fatalf("upload metadata: %+v", uploaded)
	}

	// Download returns the same bytes and headers.
	req := httptest.NewRequest(http.MethodGet, apiV1Prefix+"/documents/doc-a/assets/image.png", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("download: status %d", w.Code)
	}
	if !bytes.Equal(w.Body.Bytes(), testPNG) {
		t.Fatalf("download bytes mismatch: got %d bytes", w.Body.Len())
	}
	if got := w.Header().Get("Content-Type"); got != "image/png" {
		t.Fatalf("download content-type %q, want image/png", got)
	}
	if got := w.Header().Get("Content-Disposition"); got == "" {
		t.Fatal("download content-disposition missing")
	}

	// List shows the asset.
	w = doJSON(t, r, http.MethodGet, apiV1Prefix+"/documents/doc-a/assets", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("list assets: status %d", w.Code)
	}
	var list struct {
		Assets []map[string]any `json:"assets"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil {
		t.Fatalf("unmarshal assets list: %v", err)
	}
	if len(list.Assets) != 1 || list.Assets[0]["file_name"] != "image.png" {
		t.Fatalf("assets list: %v", list.Assets)
	}
}

func TestAssetUploadOverwrite(t *testing.T) {
	r := newTestServer(t)
	token := setupUser(t, r, testUsername)

	contentV1 := []byte("version-one")
	contentV2 := []byte("v2-bytes!")

	if w := uploadAsset(t, r, token, "doc-o", "note.txt", "text/plain", contentV1); w.Code != http.StatusOK {
		t.Fatalf("first upload: status %d", w.Code)
	}
	w := uploadAsset(t, r, token, "doc-o", "note.txt", "text/plain", contentV2)
	if w.Code != http.StatusOK {
		t.Fatalf("second upload: status %d, body %s", w.Code, w.Body.String())
	}
	var meta struct {
		SizeBytes int64 `json:"size_bytes"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &meta); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if meta.SizeBytes != int64(len(contentV2)) {
		t.Fatalf("overwrite size %d, want %d", meta.SizeBytes, len(contentV2))
	}

	// Downloads serve the overwritten content.
	w = doJSON(t, r, http.MethodGet, apiV1Prefix+"/documents/doc-o/assets/note.txt", token, nil)
	if !bytes.Equal(w.Body.Bytes(), contentV2) {
		t.Fatalf("download after overwrite: got %q", w.Body.String())
	}

	// The list still contains exactly one entry.
	w = doJSON(t, r, http.MethodGet, apiV1Prefix+"/documents/doc-o/assets", token, nil)
	var list struct {
		Assets []map[string]any `json:"assets"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(list.Assets) != 1 {
		t.Fatalf("assets list after overwrite: %d entries, want 1", len(list.Assets))
	}
}

// TestAssetOnlyDocument covers documents that received assets but no snapshot:
// latest-snapshot reads 404 while the document shows in the list with
// latest_revision 0.
func TestAssetOnlyDocument(t *testing.T) {
	r := newTestServer(t)
	token := setupUser(t, r, testUsername)

	if w := uploadAsset(t, r, token, "doc-asset-only", "a.png", "image/png", testPNG); w.Code != http.StatusOK {
		t.Fatalf("upload: status %d", w.Code)
	}
	if w := doJSON(t, r, http.MethodGet, apiV1Prefix+"/documents/doc-asset-only", token, nil); w.Code != http.StatusNotFound {
		t.Fatalf("latest snapshot of asset-only doc: status %d, want 404", w.Code)
	}
	w := doJSON(t, r, http.MethodGet, apiV1Prefix+"/documents", token, nil)
	var list struct {
		Documents []map[string]any `json:"documents"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(list.Documents) != 1 || list.Documents[0]["latest_revision"] != float64(0) {
		t.Fatalf("documents list: %v", list.Documents)
	}
}

func TestAssetDelete(t *testing.T) {
	r := newTestServer(t)
	token := setupUser(t, r, testUsername)

	if w := uploadAsset(t, r, token, "doc-d", "x.bin", "application/octet-stream", []byte("data")); w.Code != http.StatusOK {
		t.Fatalf("upload: status %d", w.Code)
	}
	if w := doJSON(t, r, http.MethodDelete, apiV1Prefix+"/documents/doc-d/assets/x.bin", token, nil); w.Code != http.StatusNoContent {
		t.Fatalf("delete asset: status %d", w.Code)
	}
	if w := doJSON(t, r, http.MethodGet, apiV1Prefix+"/documents/doc-d/assets/x.bin", token, nil); w.Code != http.StatusNotFound {
		t.Fatalf("download after delete: status %d, want 404", w.Code)
	}
	// Delete again: 404.
	if w := doJSON(t, r, http.MethodDelete, apiV1Prefix+"/documents/doc-d/assets/x.bin", token, nil); w.Code != http.StatusNotFound {
		t.Fatalf("double delete asset: status %d, want 404", w.Code)
	}
}

func TestAssetUploadValidation(t *testing.T) {
	r := newTestServer(t)
	token := setupUser(t, r, testUsername)

	// No file field -> 400.
	req := httptest.NewRequest(http.MethodPost, apiV1Prefix+"/documents/doc-v/assets", bytes.NewReader(nil))
	req.Header.Set("Content-Type", "multipart/form-data; boundary=x")
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("no file field: status %d, want 400", w.Code)
	}

	// Unsanitizable file name -> 400.
	if w := uploadAsset(t, r, token, "doc-v", "..", "text/plain", []byte("x")); w.Code != http.StatusBadRequest {
		t.Fatalf("bad file name: status %d, want 400", w.Code)
	}

	// Path-bearing file names are reduced to the basename.
	w = uploadAsset(t, r, token, "doc-v", "../evil.png", "image/png", testPNG)
	if w.Code != http.StatusOK {
		t.Fatalf("path-bearing file name: status %d, body %s", w.Code, w.Body.String())
	}
	var meta struct {
		FileName string `json:"file_name"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &meta); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if meta.FileName != "evil.png" {
		t.Fatalf("sanitized name %q, want evil.png", meta.FileName)
	}
}

// TestAssetOnTombstonedDocument: reads 404 after the document is tombstoned;
// uploading an asset revives the document row.
func TestAssetOnTombstonedDocument(t *testing.T) {
	r := newTestServer(t)
	token := setupUser(t, r, testUsername)

	if w := uploadAsset(t, r, token, "doc-t", "a.png", "image/png", testPNG); w.Code != http.StatusOK {
		t.Fatalf("upload: status %d", w.Code)
	}
	if w := doJSON(t, r, http.MethodDelete, apiV1Prefix+"/documents/doc-t", token, nil); w.Code != http.StatusNoContent {
		t.Fatalf("tombstone doc: status %d", w.Code)
	}
	if w := doJSON(t, r, http.MethodGet, apiV1Prefix+"/documents/doc-t/assets", token, nil); w.Code != http.StatusNotFound {
		t.Fatalf("assets list after tombstone: status %d, want 404", w.Code)
	}

	// Uploading revives the document: it reappears in the list.
	if w := uploadAsset(t, r, token, "doc-t", "b.png", "image/png", testPNG); w.Code != http.StatusOK {
		t.Fatalf("upload after tombstone: status %d, body %s", w.Code, w.Body.String())
	}
	w := doJSON(t, r, http.MethodGet, apiV1Prefix+"/documents", token, nil)
	var list struct {
		Documents []map[string]any `json:"documents"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(list.Documents) != 1 {
		t.Fatalf("documents list after revive: %d entries, want 1", len(list.Documents))
	}
}

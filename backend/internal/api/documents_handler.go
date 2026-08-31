package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/LingoJack/jstudio/backend/internal/store"
	"github.com/gin-gonic/gin"
)

// maxDocumentRequestBytes caps the PUT /documents JSON envelope (body payload
// plus field names). Current document bodies are ~200KB; 8MiB leaves a wide
// margin.
const maxDocumentRequestBytes = 8 << 20

// Snapshot list pagination bounds.
const (
	defaultSnapshotLimit = 50
	maxSnapshotLimit     = 200
)

type documentsHandler struct {
	store *store.Store
}

// putDocumentRequest carries one remote save. Body is an arbitrary JSON
// value stored verbatim: the backend must stay compatible with any future
// document schema the desktop app produces.
type putDocumentRequest struct {
	Title string          `json:"title"`
	Body  json.RawMessage `json:"body"`
}

func (h *documentsHandler) put(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxDocumentRequestBytes)
	var req putDocumentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			fail(c, http.StatusRequestEntityTooLarge, codePayloadTooLarge, "document body too large")
			return
		}
		fail(c, http.StatusBadRequest, codeInvalidRequest, "invalid json body")
		return
	}
	if len(req.Body) == 0 {
		fail(c, http.StatusBadRequest, codeInvalidRequest, "body is required")
		return
	}
	snap, err := h.store.AppendSnapshot(c.Request.Context(), userIDFrom(c), c.Param("docId"), req.Title, string(req.Body))
	if err != nil {
		failInternal(c)
		return
	}
	c.JSON(http.StatusCreated, gin.H{
		"doc_id":     snap.DocID,
		"revision":   snap.Revision,
		"size_bytes": snap.SizeBytes,
		"created_at": snap.CreatedAt,
	})
}

func (h *documentsHandler) getLatest(c *gin.Context) {
	snap, err := h.store.LatestSnapshot(c.Request.Context(), userIDFrom(c), c.Param("docId"))
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			fail(c, http.StatusNotFound, codeNotFound, "document not found")
			return
		}
		failInternal(c)
		return
	}
	writeSnapshot(c, snap)
}

func (h *documentsHandler) getSnapshot(c *gin.Context) {
	revision, err := strconv.ParseInt(c.Param("revision"), 10, 64)
	if err != nil || revision < 1 {
		fail(c, http.StatusBadRequest, codeInvalidRequest, "revision must be a positive integer")
		return
	}
	snap, err := h.store.GetSnapshot(c.Request.Context(), userIDFrom(c), c.Param("docId"), revision)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			fail(c, http.StatusNotFound, codeNotFound, "snapshot not found")
			return
		}
		failInternal(c)
		return
	}
	writeSnapshot(c, snap)
}

func (h *documentsHandler) listSnapshots(c *gin.Context) {
	limit := defaultSnapshotLimit
	if raw := c.Query("limit"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 {
			fail(c, http.StatusBadRequest, codeInvalidRequest, "limit must be a positive integer")
			return
		}
		if n > maxSnapshotLimit {
			n = maxSnapshotLimit
		}
		limit = n
	}
	metas, total, err := h.store.ListSnapshots(c.Request.Context(), userIDFrom(c), c.Param("docId"), limit)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			fail(c, http.StatusNotFound, codeNotFound, "document not found")
			return
		}
		failInternal(c)
		return
	}
	out := make([]gin.H, 0, len(metas))
	for _, m := range metas {
		out = append(out, gin.H{
			"revision":   m.Revision,
			"title":      m.Title,
			"size_bytes": m.SizeBytes,
			"created_at": m.CreatedAt,
		})
	}
	c.JSON(http.StatusOK, gin.H{"snapshots": out, "total": total})
}

func (h *documentsHandler) list(c *gin.Context) {
	docs, err := h.store.ListDocuments(c.Request.Context(), userIDFrom(c))
	if err != nil {
		failInternal(c)
		return
	}
	out := make([]gin.H, 0, len(docs))
	for _, d := range docs {
		out = append(out, gin.H{
			"doc_id":          d.DocID,
			"title":           d.Title,
			"latest_revision": d.LatestRevision,
			"updated_at":      d.UpdatedAt,
		})
	}
	c.JSON(http.StatusOK, gin.H{"documents": out})
}

func (h *documentsHandler) remove(c *gin.Context) {
	err := h.store.TombstoneDocument(c.Request.Context(), userIDFrom(c), c.Param("docId"))
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			fail(c, http.StatusNotFound, codeNotFound, "document not found")
			return
		}
		failInternal(c)
		return
	}
	c.Status(http.StatusNoContent)
}

func writeSnapshot(c *gin.Context, snap store.Snapshot) {
	c.JSON(http.StatusOK, gin.H{
		"doc_id":     snap.DocID,
		"title":      snap.Title,
		"revision":   snap.Revision,
		"body":       json.RawMessage(snap.Body),
		"size_bytes": snap.SizeBytes,
		"created_at": snap.CreatedAt,
	})
}

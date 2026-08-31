package api

import (
	"errors"
	"io"
	"mime"
	"net/http"
	"path/filepath"
	"strconv"

	"github.com/LingoJack/jstudio/backend/internal/storage"
	"github.com/LingoJack/jstudio/backend/internal/store"
	"github.com/gin-gonic/gin"
)

// Upload bounds. 12MiB covers the asset plus multipart framing overhead;
// parts larger than multipartMemoryLimit spill to temp files instead of RAM.
const (
	maxUploadBytes       = 12 << 20
	multipartMemoryLimit = 8 << 20
)

// fileName limits and the multipart field name carrying the file.
const (
	uploadFieldName = "file"
	maxFileNameLen  = 255
)

// defaultContentType is recorded when the client omits the part header.
const defaultContentType = "application/octet-stream"

type assetsHandler struct {
	store   *store.Store
	storage storage.ObjectStorage
}

// assetObjectKey builds the object storage key. File names are sanitized, so
// the key cannot escape the "{user}/{doc}" prefix.
func assetObjectKey(userID, docID, fileName string) string {
	return userID + "/" + docID + "/" + fileName
}

// sanitizeFileName reduces a client-supplied name to a single safe path
// segment: basename only, not "." / "..", not empty, within the length cap.
func sanitizeFileName(name string) (string, bool) {
	name = filepath.Base(name)
	if name == "" || name == "." || name == ".." || len(name) > maxFileNameLen {
		return "", false
	}
	return name, true
}

func (h *assetsHandler) upload(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxUploadBytes)
	if err := c.Request.ParseMultipartForm(multipartMemoryLimit); err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			fail(c, http.StatusRequestEntityTooLarge, codePayloadTooLarge, "upload too large")
			return
		}
		fail(c, http.StatusBadRequest, codeInvalidRequest, "invalid multipart form")
		return
	}
	fileHeader, err := c.FormFile(uploadFieldName)
	if err != nil {
		fail(c, http.StatusBadRequest, codeInvalidRequest, "file field is required")
		return
	}
	fileName, ok := sanitizeFileName(fileHeader.Filename)
	if !ok {
		fail(c, http.StatusBadRequest, codeInvalidRequest, "invalid file name")
		return
	}
	contentType := fileHeader.Header.Get("Content-Type")
	if contentType == "" {
		contentType = defaultContentType
	}

	userID := userIDFrom(c)
	docID := c.Param("docId")
	src, err := fileHeader.Open()
	if err != nil {
		fail(c, http.StatusBadRequest, codeInvalidRequest, "cannot open uploaded file")
		return
	}
	defer src.Close()

	// Upload the object first, then upsert the row: an orphan object is
	// acceptable, an orphan row is not (downloads would 404).
	objectKey := assetObjectKey(userID, docID, fileName)
	if err := h.storage.Put(c.Request.Context(), objectKey, src, fileHeader.Size, contentType); err != nil {
		failInternal(c, err)
		return
	}
	asset, err := h.store.UpsertAsset(c.Request.Context(), userID, store.Asset{
		DocID:       docID,
		FileName:    fileName,
		ContentType: contentType,
		SizeBytes:   fileHeader.Size,
		ObjectKey:   objectKey,
	})
	if err != nil {
		failInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"doc_id":       asset.DocID,
		"file_name":    asset.FileName,
		"content_type": asset.ContentType,
		"size_bytes":   asset.SizeBytes,
		"created_at":   asset.CreatedAt,
	})
}

func (h *assetsHandler) list(c *gin.Context) {
	assets, err := h.store.ListAssets(c.Request.Context(), userIDFrom(c), c.Param("docId"))
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			fail(c, http.StatusNotFound, codeNotFound, "document not found")
			return
		}
		failInternal(c, err)
		return
	}
	out := make([]gin.H, 0, len(assets))
	for _, a := range assets {
		out = append(out, gin.H{
			"file_name":    a.FileName,
			"content_type": a.ContentType,
			"size_bytes":   a.SizeBytes,
			"updated_at":   a.UpdatedAt,
		})
	}
	c.JSON(http.StatusOK, gin.H{"assets": out})
}

func (h *assetsHandler) download(c *gin.Context) {
	userID := userIDFrom(c)
	docID := c.Param("docId")
	fileName, ok := sanitizeFileName(c.Param("fileName"))
	if !ok {
		fail(c, http.StatusBadRequest, codeInvalidRequest, "invalid file name")
		return
	}
	asset, err := h.store.GetAsset(c.Request.Context(), userID, docID, fileName)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			fail(c, http.StatusNotFound, codeNotFound, "asset not found")
			return
		}
		failInternal(c, err)
		return
	}
	rc, err := h.storage.Get(c.Request.Context(), asset.ObjectKey)
	if err != nil {
		if errors.Is(err, storage.ErrObjectNotFound) {
			// Orphan row without an object: behave like a missing asset.
			fail(c, http.StatusNotFound, codeNotFound, "asset not found")
			return
		}
		failInternal(c, err)
		return
	}
	defer rc.Close()

	c.Header("Content-Type", asset.ContentType)
	c.Header("Content-Length", strconv.FormatInt(asset.SizeBytes, 10))
	// mime.FormatMediaType percent-encodes non-ASCII names per RFC 2231.
	c.Header("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{
		"filename": asset.FileName,
	}))
	c.Status(http.StatusOK)
	// The header is already sent; a mid-stream failure can only be logged by
	// the framework, not converted into an error response.
	if _, err := io.Copy(c.Writer, rc); err != nil {
		c.Error(err) //nolint:errcheck // surfaced to gin's error chain
	}
}

func (h *assetsHandler) remove(c *gin.Context) {
	userID := userIDFrom(c)
	docID := c.Param("docId")
	fileName, ok := sanitizeFileName(c.Param("fileName"))
	if !ok {
		fail(c, http.StatusBadRequest, codeInvalidRequest, "invalid file name")
		return
	}
	asset, err := h.store.GetAsset(c.Request.Context(), userID, docID, fileName)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			fail(c, http.StatusNotFound, codeNotFound, "asset not found")
			return
		}
		failInternal(c, err)
		return
	}
	if err := h.store.DeleteAsset(c.Request.Context(), userID, docID, fileName); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			fail(c, http.StatusNotFound, codeNotFound, "asset not found")
			return
		}
		failInternal(c, err)
		return
	}
	// Row deleted; removing the object is best effort (an orphan object is
	// acceptable).
	if err := h.storage.Delete(c.Request.Context(), asset.ObjectKey); err != nil {
		c.Error(err) //nolint:errcheck // surfaced to gin's error chain
	}
	c.Status(http.StatusNoContent)
}

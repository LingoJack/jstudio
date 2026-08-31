package api

import (
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
)

// Error codes carried in the unified error envelope.
const (
	codeInvalidRequest  = "INVALID_REQUEST"
	codeUnauthorized    = "UNAUTHORIZED"
	codeTokenExpired    = "TOKEN_EXPIRED"
	codeNotFound        = "NOT_FOUND"
	codeConflict        = "CONFLICT"
	codePayloadTooLarge = "PAYLOAD_TOO_LARGE"
	codeInternal        = "INTERNAL"
)

// fail writes the unified error envelope: {"error":{"code","message"}}.
func fail(c *gin.Context, status int, code, message string) {
	c.JSON(status, gin.H{"error": gin.H{"code": code, "message": message}})
}

// failInternal logs the cause (method/path/error) and responds with a
// generic 500 — internal details must not reach the client.
func failInternal(c *gin.Context, cause error) {
	if cause != nil {
		slog.Default().Error("internal error",
			"method", c.Request.Method,
			"path", c.Request.URL.Path,
			"error", cause)
	}
	fail(c, http.StatusInternalServerError, codeInternal, "internal server error")
}

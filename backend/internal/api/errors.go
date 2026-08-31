package api

import (
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

// failInternal responds with a generic 500; the handler logs details itself.
func failInternal(c *gin.Context) {
	fail(c, http.StatusInternalServerError, codeInternal, "internal server error")
}

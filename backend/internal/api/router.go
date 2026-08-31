// Package api assembles the HTTP surface of the backend.
package api

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// ginMode silences gin's debug route dumps; requests are logged via slog.
const ginMode = gin.ReleaseMode

// NewRouter builds the gin engine with global middleware and routes.
// Handlers requiring dependencies (store, object storage) are registered
// by later wiring steps.
func NewRouter(logger *slog.Logger) *gin.Engine {
	gin.SetMode(ginMode)
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(requestLog(logger))
	r.GET("/healthz", healthz)
	return r
}

func healthz(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// requestLog logs one structured line per request.
func requestLog(logger *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		logger.Info("http",
			"method", c.Request.Method,
			"path", c.Request.URL.Path,
			"status", c.Writer.Status(),
			"duration_ms", time.Since(start).Milliseconds(),
		)
	}
}

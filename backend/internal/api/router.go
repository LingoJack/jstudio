// Package api assembles the HTTP surface of the backend.
package api

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/LingoJack/jstudio/backend/internal/config"
	"github.com/LingoJack/jstudio/backend/internal/store"
	"github.com/gin-gonic/gin"
)

// ginMode silences gin's debug route dumps; requests are logged via slog.
const ginMode = gin.ReleaseMode

// apiV1Prefix is the versioned API base path.
const apiV1Prefix = "/api/v1"

// Deps bundles everything the HTTP layer needs.
type Deps struct {
	Logger *slog.Logger
	Config config.Config
	Store  *store.Store
}

// NewRouter builds the gin engine with global middleware and routes.
func NewRouter(deps Deps) *gin.Engine {
	gin.SetMode(ginMode)
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(requestLog(deps.Logger))
	r.GET("/healthz", healthz)

	authH := &authHandler{
		store:     deps.Store,
		jwtSecret: []byte(deps.Config.Auth.JWTSecret),
		tokenTTL:  deps.Config.Auth.TokenTTL,
	}
	v1 := r.Group(apiV1Prefix)
	v1.POST("/auth/register", authH.register)
	v1.POST("/auth/login", authH.login)

	authed := v1.Group("", requireAuth(authH.jwtSecret))
	authed.GET("/auth/me", authH.me)

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

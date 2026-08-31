package api

import (
	"errors"
	"net/http"
	"strings"

	"github.com/LingoJack/jstudio/backend/internal/auth"
	"github.com/gin-gonic/gin"
)

// ctxUserID and ctxUsername store the authenticated identity in the gin
// context; handlers must scope every query by this user id.
const (
	ctxUserID   = "user_id"
	ctxUsername = "username"
)

// bearerScheme is the expected Authorization header scheme.
const bearerScheme = "Bearer"

// requireAuth rejects requests without a valid Bearer token and stores the
// authenticated identity in the context on success.
func requireAuth(jwtSecret []byte) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		token, ok := strings.CutPrefix(header, bearerScheme+" ")
		if !ok || token == "" {
			fail(c, http.StatusUnauthorized, codeUnauthorized, "missing bearer token")
			c.Abort()
			return
		}
		claims, err := auth.ParseToken(jwtSecret, token)
		if err != nil {
			if errors.Is(err, auth.ErrTokenExpired) {
				fail(c, http.StatusUnauthorized, codeTokenExpired, "token expired")
			} else {
				fail(c, http.StatusUnauthorized, codeUnauthorized, "invalid token")
			}
			c.Abort()
			return
		}
		c.Set(ctxUserID, claims.Subject)
		c.Set(ctxUsername, claims.Username)
		c.Next()
	}
}

// userIDFrom returns the authenticated user id (empty string if absent).
func userIDFrom(c *gin.Context) string {
	v, _ := c.Get(ctxUserID)
	s, _ := v.(string)
	return s
}

// usernameFrom returns the authenticated username (empty string if absent).
func usernameFrom(c *gin.Context) string {
	v, _ := c.Get(ctxUsername)
	s, _ := v.(string)
	return s
}

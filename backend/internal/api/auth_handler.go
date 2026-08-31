package api

import (
	"errors"
	"net/http"
	"time"

	"github.com/LingoJack/jstudio/backend/internal/auth"
	"github.com/LingoJack/jstudio/backend/internal/store"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// Credential validation bounds.
const (
	minUsernameLen = 3
	maxUsernameLen = 32
	minPasswordLen = 8
)

// bearerTokenType is the token_type advertised by the login response.
const bearerTokenType = "Bearer"

type authHandler struct {
	store     *store.Store
	jwtSecret []byte
	tokenTTL  time.Duration
}

type credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (h *authHandler) register(c *gin.Context) {
	var req credentials
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, codeInvalidRequest, "invalid json body")
		return
	}
	if len(req.Username) < minUsernameLen || len(req.Username) > maxUsernameLen {
		fail(c, http.StatusBadRequest, codeInvalidRequest, "username must be 3-32 characters")
		return
	}
	if len(req.Password) < minPasswordLen {
		fail(c, http.StatusBadRequest, codeInvalidRequest, "password must be at least 8 characters")
		return
	}
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		failInternal(c, err)
		return
	}
	u, err := h.store.CreateUser(c.Request.Context(), uuid.NewString(), req.Username, hash)
	if err != nil {
		if errors.Is(err, store.ErrUsernameTaken) {
			fail(c, http.StatusConflict, codeConflict, "username already taken")
			return
		}
		failInternal(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{
		"user_id":    u.ID,
		"username":   u.Username,
		"created_at": u.CreatedAt,
	})
}

func (h *authHandler) login(c *gin.Context) {
	var req credentials
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, codeInvalidRequest, "invalid json body")
		return
	}
	// Uniform 401 for unknown user and wrong password: do not reveal which
	// part of the credentials is wrong.
	u, err := h.store.GetUserByUsername(c.Request.Context(), req.Username)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			fail(c, http.StatusUnauthorized, codeUnauthorized, "invalid credentials")
			return
		}
		failInternal(c, err)
		return
	}
	if !auth.CheckPassword(u.PasswordHash, req.Password) {
		fail(c, http.StatusUnauthorized, codeUnauthorized, "invalid credentials")
		return
	}
	token, expiresAt, err := auth.NewToken(h.jwtSecret, u.ID, u.Username, h.tokenTTL)
	if err != nil {
		failInternal(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"token":      token,
		"token_type": bearerTokenType,
		"expires_at": expiresAt.Format(time.RFC3339),
		"user": gin.H{
			"user_id":  u.ID,
			"username": u.Username,
		},
	})
}

func (h *authHandler) me(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"user_id":  userIDFrom(c),
		"username": usernameFrom(c),
	})
}

package api

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// CORS constants. The API is Bearer-token authenticated and cookieless, so
// Allow-Credentials is never emitted (no CSRF surface for credentials).
const (
	corsWildcard             = "*"
	corsAllowMethodsValue    = "GET, POST, PUT, DELETE, OPTIONS"
	corsAllowHeadersFallback = "Authorization, Content-Type"
	corsMaxAgeSeconds        = 86400
	headerOrigin             = "Origin"
	headerACAllowOrigin      = "Access-Control-Allow-Origin"
	headerACAllowMethods     = "Access-Control-Allow-Methods"
	headerACAllowHeaders     = "Access-Control-Allow-Headers"
	headerACMaxAge           = "Access-Control-Max-Age"
	headerACReqMethod        = "Access-Control-Request-Method"
	headerACReqHeaders       = "Access-Control-Request-Headers"
	headerVary               = "Vary"
)

// corsMiddleware answers CORS preflights and decorates actual responses.
//
// Semantics of allowedOrigins: a list containing "*" enables the wildcard
// (the default — it also covers the Electron production renderer whose
// Origin header is "null" under file/custom protocols); otherwise origins
// are matched exactly and echoed back. Unmatched origins get no CORS headers
// at all, leaving the browser to reject the cross-origin request.
//
// Note: viper's AutomaticEnv cannot parse slices, so this key is only
// settable through the config file.
func corsMiddleware(allowedOrigins []string) gin.HandlerFunc {
	wildcard := false
	allowed := make(map[string]bool, len(allowedOrigins))
	for _, o := range allowedOrigins {
		if o == corsWildcard {
			wildcard = true
		}
		allowed[o] = true
	}

	return func(c *gin.Context) {
		origin := c.GetHeader(headerOrigin)
		if origin == "" {
			// Not a cross-origin request: pass through untouched.
			c.Next()
			return
		}
		if !wildcard && !allowed[origin] {
			// Origin not allowed: no CORS headers, let the browser reject it.
			c.Next()
			return
		}

		allowOrigin := origin
		if wildcard {
			allowOrigin = corsWildcard
		}
		c.Header(headerACAllowOrigin, allowOrigin)
		c.Header(headerVary, headerOrigin)

		// Preflight: short-circuit with the negotiation headers.
		if c.Request.Method == http.MethodOptions {
			c.Header(headerACAllowMethods, corsAllowMethodsValue)
			c.Header(headerACMaxAge, strconv.Itoa(corsMaxAgeSeconds))
			// Echo the requested headers; fall back to the minimal set the
			// API actually needs.
			reqHeaders := c.GetHeader(headerACReqHeaders)
			if reqHeaders == "" {
				reqHeaders = corsAllowHeadersFallback
			}
			c.Header(headerACAllowHeaders, reqHeaders)
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// algHS256 locks the accepted signing algorithm; any other alg header must
// fail parsing (guards against alg=none / algorithm confusion).
const algHS256 = "HS256"

var (
	// ErrTokenExpired means the signature is valid but exp has passed.
	ErrTokenExpired = errors.New("token expired")
	// ErrTokenInvalid covers malformed tokens, bad signatures, wrong
	// algorithms and missing claims.
	ErrTokenInvalid = errors.New("token invalid")
)

// Claims is the JWT payload; the subject holds the user id.
type Claims struct {
	Username string `json:"username"`
	jwt.RegisteredClaims
}

// NewToken issues an HS256 token for the user that expires after ttl.
func NewToken(secret []byte, userID, username string, ttl time.Duration) (token string, expiresAt time.Time, err error) {
	now := time.Now()
	expiresAt = now.Add(ttl)
	claims := Claims{
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
		},
	}
	token, err = jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(secret)
	return token, expiresAt, err
}

// ParseToken verifies the signature, locks the algorithm to HS256 and
// requires an expiry claim.
func ParseToken(secret []byte, tokenStr string) (*Claims, error) {
	claims := &Claims{}
	_, err := jwt.ParseWithClaims(tokenStr, claims, func(*jwt.Token) (any, error) {
		return secret, nil
	}, jwt.WithValidMethods([]string{algHS256}), jwt.WithExpirationRequired())
	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrTokenExpired
		}
		return nil, ErrTokenInvalid
	}
	return claims, nil
}

// Package auth provides password hashing and JWT issuing/parsing. It is
// deliberately free of HTTP concerns; the gin middleware lives in api.
package auth

import "golang.org/x/crypto/bcrypt"

// bcryptCost balances hash time (~60ms at cost 10) against brute-force
// resistance for a personal deployment.
const bcryptCost = bcrypt.DefaultCost

// HashPassword hashes a plaintext password with bcrypt.
func HashPassword(password string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// CheckPassword reports whether the plaintext password matches the bcrypt hash.
func CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// Package config loads the backend configuration from a YAML file and
// environment variables (prefix JS_, e.g. JS_AUTH_JWT_SECRET).
package config

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/spf13/viper"
)

// Defaults for every configuration key. Every key must be registered via
// setDefaults: viper only resolves env overrides for known keys, so a new
// setting without a default would silently ignore its env variable.
const (
	defaultServerAddr       = "127.0.0.1:8080"
	defaultDatabasePath     = "data/jstudio-backend.db"
	defaultJWTSecret        = ""
	defaultTokenTTL         = 720 * time.Hour
	defaultStorageEndpoint  = "127.0.0.1:9000"
	defaultStorageAccessKey = "minioadmin"
	defaultStorageSecretKey = "minioadmin"
	defaultStorageBucket    = "jstudio"
	defaultStorageUseSSL    = false
)

// minJWTSecretLen is the minimum acceptable JWT signing secret length.
const minJWTSecretLen = 32

// envPrefix is the prefix for environment variable overrides.
const envPrefix = "JS"

// Implicit config file lookup: ./config.yaml next to the working directory.
const (
	defaultConfigName = "config"
	defaultConfigType = "yaml"
)

// Config is the root configuration tree for the backend.
type Config struct {
	Server   ServerConfig   `mapstructure:"server"`
	Database DatabaseConfig `mapstructure:"database"`
	Auth     AuthConfig     `mapstructure:"auth"`
	Storage  StorageConfig  `mapstructure:"storage"`
}

// ServerConfig holds the HTTP listen address.
type ServerConfig struct {
	Addr string `mapstructure:"addr"`
}

// DatabaseConfig holds the SQLite database file path.
type DatabaseConfig struct {
	Path string `mapstructure:"path"`
}

// AuthConfig holds JWT signing parameters.
type AuthConfig struct {
	JWTSecret string        `mapstructure:"jwt_secret"`
	TokenTTL  time.Duration `mapstructure:"token_ttl"`
}

// StorageConfig holds the S3-compatible (MinIO) object storage parameters.
type StorageConfig struct {
	Endpoint  string `mapstructure:"endpoint"`
	AccessKey string `mapstructure:"access_key"`
	SecretKey string `mapstructure:"secret_key"`
	Bucket    string `mapstructure:"bucket"`
	UseSSL    bool   `mapstructure:"use_ssl"`
}

// Load reads the configuration. An explicit path takes precedence; otherwise
// it looks for ./config.yaml. Missing file is not an error (defaults and env
// still apply); invalid file content is.
func Load(path string) (Config, error) {
	v := viper.New()
	setDefaults(v)
	v.SetEnvPrefix(envPrefix)
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()

	if path != "" {
		v.SetConfigFile(path)
	} else {
		v.SetConfigName(defaultConfigName)
		v.SetConfigType(defaultConfigType)
		v.AddConfigPath(".")
	}
	if err := v.ReadInConfig(); err != nil {
		var notFound viper.ConfigFileNotFoundError
		if path != "" || !errors.As(err, &notFound) {
			return Config{}, fmt.Errorf("read config: %w", err)
		}
	}

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return Config{}, fmt.Errorf("unmarshal config: %w", err)
	}
	if err := cfg.Validate(); err != nil {
		return Config{}, fmt.Errorf("invalid config: %w", err)
	}
	return cfg, nil
}

// Validate fails fast on settings that would break at runtime.
func (c Config) Validate() error {
	if len(c.Auth.JWTSecret) < minJWTSecretLen {
		return fmt.Errorf("auth.jwt_secret must be at least %d bytes; generate one with: openssl rand -base64 48", minJWTSecretLen)
	}
	return nil
}

func setDefaults(v *viper.Viper) {
	v.SetDefault("server.addr", defaultServerAddr)
	v.SetDefault("database.path", defaultDatabasePath)
	v.SetDefault("auth.jwt_secret", defaultJWTSecret)
	v.SetDefault("auth.token_ttl", defaultTokenTTL.String())
	v.SetDefault("storage.endpoint", defaultStorageEndpoint)
	v.SetDefault("storage.access_key", defaultStorageAccessKey)
	v.SetDefault("storage.secret_key", defaultStorageSecretKey)
	v.SetDefault("storage.bucket", defaultStorageBucket)
	v.SetDefault("storage.use_ssl", defaultStorageUseSSL)
}

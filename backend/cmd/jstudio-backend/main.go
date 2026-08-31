// Command jstudio-backend is the remote-save backend service for JStudio.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/LingoJack/jstudio/backend/internal/api"
	"github.com/LingoJack/jstudio/backend/internal/config"
	"github.com/LingoJack/jstudio/backend/internal/storage"
	"github.com/LingoJack/jstudio/backend/internal/store"
)

// shutdownTimeout bounds graceful shutdown.
const shutdownTimeout = 10 * time.Second

// readHeaderTimeout bounds how long the server waits for request headers.
const readHeaderTimeout = 5 * time.Second

func main() {
	if err := run(); err != nil {
		slog.Error("server exited with error", "error", err)
		os.Exit(1)
	}
}

func run() error {
	configPath := flag.String("config", "", "path to config.yaml (default: ./config.yaml)")
	flag.Parse()

	cfg, err := config.Load(*configPath)
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	// The schema is applied out-of-band by the operator (schema.sql); the
	// backend only verifies it is present.
	st, err := store.Open(cfg.Database.DSN())
	if err != nil {
		return fmt.Errorf("open store: %w", err)
	}
	defer st.Close()
	if err := st.CheckSchema(context.Background()); err != nil {
		return fmt.Errorf("check store schema: %w", err)
	}

	objStore, err := storage.NewMinioStorage(
		cfg.Storage.Endpoint,
		cfg.Storage.AccessKey,
		cfg.Storage.SecretKey,
		cfg.Storage.Bucket,
		cfg.Storage.UseSSL,
	)
	if err != nil {
		return fmt.Errorf("create object storage: %w", err)
	}
	if err := objStore.EnsureBucket(context.Background()); err != nil {
		return fmt.Errorf("ensure object storage bucket: %w", err)
	}

	srv := &http.Server{
		Addr: cfg.Server.Addr,
		Handler: api.NewRouter(api.Deps{
			Logger:  logger,
			Config:  cfg,
			Store:   st,
			Storage: objStore,
		}),
		ReadHeaderTimeout: readHeaderTimeout,
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("server listening", "addr", cfg.Server.Addr)
		errCh <- srv.ListenAndServe()
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-errCh:
		if !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("listen: %w", err)
		}
	case sig := <-stop:
		logger.Info("shutting down", "signal", sig.String())
		ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		if err := srv.Shutdown(ctx); err != nil {
			return fmt.Errorf("shutdown: %w", err)
		}
		logger.Info("server stopped")
	}
	return nil
}

.PHONY: run test lint fmt build

run:
	go run ./cmd/jstudio-backend

test:
	go test ./...

lint:
	go vet ./...

fmt:
	gofmt -l -w .

build:
	mkdir -p bin && go build -o bin/jstudio-backend ./cmd/jstudio-backend

# jstudio-miniprogram：微信小程序伴读端
SHELL := $(shell which bash 2>/dev/null || echo /bin/bash)

.PHONY: help dev build lint test

help: ## 显示此帮助信息
	@echo "jstudio-miniprogram（微信小程序伴读端）"
	@echo "============================================"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "构建产物在 dist/，用微信开发者工具导入本目录（miniprogramRoot=./dist）。"

deps: ## 安装依赖
	npm install

dev: ## 开发模式（watch 重新构建 weapp）
	npm run dev:weapp

build: ## 生产构建 weapp
	npm run build:weapp

lint: ## 类型检查 + eslint
	npm run lint

test: ## Node 内置 test runner（remote client + 快照解析）
	npm test

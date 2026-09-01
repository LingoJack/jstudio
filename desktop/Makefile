# 跨平台适配：Git Bash on Windows 使用 /usr/bin/bash，其他 Unix 用 /bin/bash
SHELL := $(shell which bash 2>/dev/null || echo /bin/bash)

# ============================================
# 变量定义
# ============================================
# 跨平台安装目录
ifeq ($(OS),Windows_NT)
	INSTALL_DIR := $(USERPROFILE)/.cargo/bin
else
	INSTALL_DIR := /usr/local/bin
endif

REPO := LingoJack/jstudio
RUST_DIR := src-tauri
MACOS_APP := dist-electron-builder/mac-arm64/JStudio.app
BIN := $(RUST_DIR)/target/release/jstudio-sidecar
INSTALL_APP_DIR ?= /Applications

# 版本号：从 package.json 读取（Electron 应用真实版本）
VERSION := $(shell grep '"version"' package.json | head -1 | sed 's/.*: *"\([^"]*\)".*/\1/')
RUST_VERSION := $(shell grep '^version' $(RUST_DIR)/Cargo.toml | head -1 | sed 's/.*"\(.*\)".*/\1/')
GIT_BRANCH := $(shell git rev-parse --abbrev-ref HEAD)

# ============================================
# 伪目标声明
# ============================================
.PHONY: help \
        deps deps-fe \
        dev build release build-jcli \
        install uninstall reinstall \
        bump-version set-version \
        fmt lint check clippy pre-commit \
        fmt-fe lint-fe check-fe \
        fmt-rust lint-rust check-rust \
        test test-fe test-rust \
        clean clean-fe clean-rust clean-all \
        run run-release \
        watch watch-test \
        gui-dev gui-build gui-install gui-clean

# ============================================
# 帮助信息
# ============================================
help: ## 显示此帮助信息
	@echo "📚 jstudio Makefile 帮助"
	@echo "============================================"
	@echo "版本: $(VERSION) | Rust: $(RUST_VERSION) | 分支: $(GIT_BRANCH)"
	@echo "============================================"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "📋 常用命令:"
	@echo "  make dev        # 启动 Electron 开发模式"
	@echo "  make build      # 构建 Electron 应用"
	@echo "  make install    # 安装到系统（macOS → /Applications）"
	@echo "  make fmt        # 格式化代码（前端 + Rust）"
	@echo "  make lint       # 检查代码质量"
	@echo "  make clean      # 清理构建产物"
	@echo ""
	@echo "仓库级 git 命令在根目录:"
	@echo "  cd .. && make push    # 提交并推送整个 monorepo"
	@echo "  cd .. && make pull    # 拉取最新代码"

# ============================================
# 依赖安装
# ============================================
deps: deps-fe ## 安装所有依赖

deps-fe: ## 安装前端依赖
	@echo "📦 安装前端依赖..."
	@npm install --silent
	@echo "☑️ 前端依赖已就绪"

# ============================================
# 构建相关
# ============================================
dev: deps ## 启动 Electron 开发模式（vite + sidecar + electron）
	@echo "🚀 启动 Electron 开发模式..."
	@npm run electron:dev

build: deps build-jcli ## 构建 Electron 应用（.app/.dmg，产物在 dist-electron-builder/）
	@echo "🏗️  构建 Electron 应用..."
	@npm run electron:build
	@echo "☑️ Electron 应用构建完成: $(MACOS_APP)"

build-jcli: ## 构建 jcli 二进制（在 submodule 中）
	@echo "🏗️  构建 jcli..."
	@cd jcli && cargo build --release
	@echo "☑️ jcli 构建完成"

release: build ## 别名：构建发布版本

# jcli submodule 目录路径（相对路径）
JCLI_ROOT := $(shell cd jcli && pwd)
JCLI_INSTALL_DIR := $(HOME)/.jdata/bin

# ============================================
# 安装相关
# ============================================
install: ## 安装 JStudio app（macOS 安装到 /Applications）；若 j cli 不存在则自动从 submodule jcli 安装
	@echo "📦 安装 JStudio..."
	@if ! command -v j >/dev/null 2>&1; then \
		echo "⚠️  j cli 未安装，正在从 submodule jcli 安装..."; \
		if [ -f "$(JCLI_ROOT)/Makefile" ]; then \
			cd "$(JCLI_ROOT)" && $(MAKE) install; \
		else \
			echo "✖️ 未找到 jcli Makefile: $(JCLI_ROOT)/Makefile"; \
			echo "   请手动安装 j cli: curl -fsSL https://raw.githubusercontent.com/LingoJack/jcli/main/install.sh | sh"; \
			exit 1; \
		fi; \
		echo ""; \
	fi
	@$(MAKE) install-jstudio-only

install-jstudio-only: build ## 仅安装 JStudio app（不检查 j cli）
	@echo "📦 安装 JStudio App..."
	@if [ "$$(uname -s)" = "Darwin" ]; then \
		if [ ! -d "$(MACOS_APP)" ]; then \
			echo "✖️ 未找到 $(MACOS_APP)"; exit 1; \
		fi; \
		if [ ! -w "$(INSTALL_APP_DIR)" ]; then SUDO="sudo"; else SUDO=""; fi; \
		echo "   正在安装到 $(INSTALL_APP_DIR)/JStudio.app..."; \
		$$SUDO rm -rf "$(INSTALL_APP_DIR)/JStudio.app"; \
		$$SUDO cp -R "$(MACOS_APP)" "$(INSTALL_APP_DIR)/JStudio.app"; \
		echo "☑️ JStudio 已安装: $(INSTALL_APP_DIR)/JStudio.app"; \
	else \
		echo "✖️ 非 macOS 平台暂不支持"; exit 1; \
	fi

uninstall: ## 卸载 JStudio app（macOS）
	@echo "🗑️  卸载 JStudio..."
	@if [ "$$(uname -s)" = "Darwin" ]; then \
		if [ ! -w "$(INSTALL_APP_DIR)" ]; then SUDO="sudo"; else SUDO=""; fi; \
		$$SUDO rm -rf "$(INSTALL_APP_DIR)/JStudio.app"; \
		echo "☑️ 已卸载 $(INSTALL_APP_DIR)/JStudio.app"; \
	else \
		echo "ℹ️ 非 macOS 平台请删除自定义安装位置。"; \
	fi

reinstall: uninstall install ## 重新安装
	@echo "☑️ JStudio 已重新安装"

# ============================================
# 版本管理
# ============================================
bump-version: ## 递增版本号（最后一位 patch，同步 package.json 和 Cargo.toml）
	@echo "📌 递增版本号..."
	@current_ver=$$(grep '"version"' package.json | head -1 | sed 's/.*: *"\([^"]*\)".*/\1/'); \
	major=$$(echo $$current_ver | cut -d. -f1); \
	minor=$$(echo $$current_ver | cut -d. -f2); \
	patch=$$(echo $$current_ver | cut -d. -f3); \
	new_patch=$$((patch + 1)); \
	new_version="$$major.$$minor.$$new_patch"; \
	echo "  版本: $$current_ver → $$new_version"; \
	if [[ "$$OSTYPE" == "darwin"* ]]; then \
		sed -i '' "s/^version = \"$$current_ver\"/version = \"$$new_version\"/" $(RUST_DIR)/Cargo.toml; \
		sed -i '' "s/\"version\": \"$$current_ver\"/\"version\": \"$$new_version\"/" package.json; \
	else \
		sed -i "s/^version = \"$$current_ver\"/version = \"$$new_version\"/" $(RUST_DIR)/Cargo.toml; \
		sed -i "s/\"version\": \"$$current_ver\"/\"version\": \"$$new_version\"/" package.json; \
	fi; \
	echo "☑️ Cargo.toml 和 package.json 版本号已更新为 $$new_version"

set-version: ## 设置指定版本号（用法：make set-version V=1.2.3）
ifndef V
	@echo "✖️ 请指定版本号，例如: make set-version V=1.2.3"
	@exit 1
endif
	@echo "📌 设置版本号为 $(V)..."
	@current_ver=$$(grep '"version"' package.json | head -1 | sed 's/.*: *"\([^"]*\)".*/\1/'); \
	echo "  版本: $$current_ver → $(V)"; \
	if [[ "$$OSTYPE" == "darwin"* ]]; then \
		sed -i '' "s/^version = \"$$current_ver\"/version = \"$(V)\"/" $(RUST_DIR)/Cargo.toml; \
		sed -i '' "s/\"version\": \"$$current_ver\"/\"version\": \"$(V)\"/" package.json; \
	else \
		sed -i "s/^version = \"$$current_ver\"/version = \"$(V)\"/" $(RUST_DIR)/Cargo.toml; \
		sed -i "s/\"version\": \"$$current_ver\"/\"version\": \"$(V)\"/" package.json; \
	fi; \
	echo "☑️ Cargo.toml 和 package.json 版本号已更新为 $(V)"

# ============================================
# 代码质量（统一）
# ============================================
fmt: fmt-fe fmt-rust ## 格式化代码（前端 + Rust）
	@echo "☑️ 代码格式化完成"

lint: lint-fe lint-rust ## 运行检查（前端 TypeScript + Rust clippy）
	@echo "☑️ 代码检查完成"

check: check-fe check-rust ## 检查代码（不构建）
	@echo "☑️ 代码检查完成"

clippy: lint-rust ## Rust clippy 别名

pre-commit: fmt lint test ## 提交前检查
	@echo "☑️ 所有检查通过，可以提交"

# ============================================
# 代码质量（前端）
# ============================================
fmt-fe: ## 格式化前端代码（如有 prettier 可扩展）
	@echo "🧹 检查前端代码格式..."
	@if command -v prettier >/dev/null 2>&1; then \
		prettier --check "src/**/*.{ts,tsx,js,jsx,json,css}" 2>/dev/null || echo "ℹ️ 建议安装 prettier 进行格式化"; \
	else \
		echo "ℹ️ 未安装 prettier，跳过前端格式化"; \
	fi

lint-fe: ## 检查前端 TypeScript 类型
	@echo "🔍 检查 TypeScript 类型..."
	@npm run lint

check-fe: lint-fe ## 前端检查别名

# ============================================
# 代码质量（Rust）
# ============================================
fmt-rust: ## 格式化 Rust 代码
	@echo "🧹 格式化 Rust 代码..."
	@cd $(RUST_DIR) && cargo fmt
	@echo "☑️ Rust 代码格式化完成"

lint-rust: ## 运行 Rust clippy 检查
	@echo "🔍 运行 clippy 检查..."
	@cd $(RUST_DIR) && cargo clippy -- -D warnings
	@echo "☑️ clippy 检查完成"

check-rust: ## 检查 Rust 代码（不构建）
	@echo "🔍 检查 Rust 代码..."
	@cd $(RUST_DIR) && cargo check
	@echo "☑️ Rust 代码检查完成"

# ============================================
# 测试相关
# ============================================
test: test-fe test-rust ## 运行测试
	@echo "☑️ 测试完成"

test-fe: ## 运行前端测试（如有）
	@echo "🧪 检查前端测试..."
	@if grep -q '"test"' package.json 2>/dev/null; then \
		npm test; \
	else \
		echo "ℹ️ 未配置前端测试脚本"; \
	fi

test-rust: ## 运行 Rust 测试
	@echo "🧪 运行 Rust 测试..."
	@cd $(RUST_DIR) && cargo test
	@echo "☑️ Rust 测试完成"

# ============================================
# 清理相关
# ============================================
clean: clean-fe clean-rust ## 清理构建产物
	@echo "🧹 清理 jcli 构建产物..."
	@cd jcli && cargo clean 2>/dev/null || true
	@echo "☑️ 构建产物已清理"

clean-fe: ## 清理前端构建产物
	@echo "🧹 清理前端构建产物..."
	@npm run clean 2>/dev/null || rm -rf dist
	@echo "☑️ 前端构建产物已清理"

clean-rust: ## 清理 Rust 构建产物
	@echo "🧹 清理 Rust 构建产物..."
	@rm -rf $(RUST_DIR)/target
	@echo "☑️ Rust 构建产物已清理"

clean-all: clean ## 清理所有（别名）

# ============================================
# 运行相关
# ============================================
run: dev ## 运行项目（别名，启动开发模式）

run-release: build install ## 构建并安装后运行
	@echo "🚀 运行已安装的 JStudio..."
	@if [ "$$(uname -s)" = "Darwin" ]; then \
		open "$(INSTALL_APP_DIR)/JStudio.app"; \
	else \
		echo "ℹ️ 请手动运行已安装的应用"; \
	fi

# ============================================
# 开发工具
# ============================================
watch: ## 监视文件变化并重新构建
	@echo "👀 监视文件变化..."
	@if command -v cargo-watch >/dev/null 2>&1; then \
		cd $(RUST_DIR) && cargo watch -x 'clippy -- -D warnings'; \
	else \
		echo "ℹ️ 建议安装 cargo-watch: cargo install cargo-watch"; \
		npm run dev; \
	fi

watch-test: ## 监视文件变化并运行测试
	@echo "👀 监视文件变化并运行测试..."
	@if command -v cargo-watch >/dev/null 2>&1; then \
		cd $(RUST_DIR) && cargo watch -x test; \
	else \
		echo "ℹ️ 建议安装 cargo-watch: cargo install cargo-watch"; \
	fi

# ============================================
# GUI 别名（兼容主仓库命名）
# ============================================
gui-dev: dev ## 别名：启动开发模式
gui-build: build ## 别名：构建应用
gui-install: install ## 别名：安装应用
gui-clean: clean ## 别名：清理构建产物
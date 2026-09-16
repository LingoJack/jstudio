# jstudio monorepo 根 Makefile
# 提供仓库级操作（git / 跨子项目格式化与检查）、desktop 桌面应用的常用命令
# 与制品代理（dev/build/install/版本管理等，透传到 desktop/），以及镜像与部署。
# backend / miniprogram 等其他子项目的专属命令仍在各自目录的 Makefile 里。
SHELL := $(shell which bash 2>/dev/null || echo /bin/bash)

GIT_BRANCH := $(shell git rev-parse --abbrev-ref HEAD)

.PHONY: help \
        push push-non-ai commit pull status \
        fmt lint image image-push deploy \
        dev build install test pre-commit \
        bump-version set-version clean

# ============================================
# 帮助信息
# ============================================
help: ## 显示此帮助信息
	@echo "jstudio monorepo Makefile"
	@echo "============================================"
	@echo "分支: $(GIT_BRANCH)"
	@echo "============================================"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "子项目命令:"
	@echo "  cd backend && make run       # 后端本地运行"
	@echo "  cd minio && podman-compose up -d  # 启动 MinIO"
	@echo "  cd miniprogram && make dev   # 小程序开发模式（微信开发者工具导入 miniprogram/）"
	@echo "  cd build  && make image-push REGISTRY_HOST=<节点IP>  # 构建并推送镜像"
	@echo "  cd deploy && make install REGISTRY_HOST=<节点IP> DB_HOST=... DB_PASSWORD=...  # 部署到 k3s"

# ============================================
# Git 操作（在整个 monorepo 范围执行）
# ============================================
push: fmt ## 提交并推送代码（自动生成 commit message）
	@echo "推送代码到远程仓库..."
	@git add . \
	&& (git commit -m "更新: $(shell date +'%Y-%m-%d %H:%M:%S')" || exit 0) \
	&& git push origin $(GIT_BRANCH)
	@echo "代码已推送"

push-non-ai: push ## 别名：同 push

commit: fmt ## 自动提交（基于变更生成 message，不推送）
	@echo "自动生成 commit message..."
	@git add .; \
	staged_files=$$(git diff --cached --name-only 2>/dev/null); \
	if [ -z "$$staged_files" ]; then \
		echo "没有检测到变更，无需提交"; \
		exit 0; \
	fi; \
	file_count=$$(echo "$$staged_files" | wc -l | tr -d ' '); \
	if [ "$$file_count" -eq 1 ]; then \
		msg="update: $$(echo "$$staged_files" | head -1)"; \
	else \
		first=$$(echo "$$staged_files" | head -1); \
		msg="update: $$first and $$((file_count - 1)) other file(s)"; \
	fi; \
	git commit -m "$$msg"; \
	echo "已提交: $$msg"

pull: ## 拉取最新代码
	@echo "拉取最新代码..."
	@git pull origin $(GIT_BRANCH)
	@echo "代码已更新"

status: ## 查看 Git 状态
	@git status

# ============================================
# 跨子项目格式化 / 检查
# ============================================
fmt: ## 格式化所有子项目代码（desktop + backend）
	@$(MAKE) -C desktop fmt
	@$(MAKE) -C backend fmt
	@echo "所有子项目格式化完成"

lint: ## 检查所有子项目代码（desktop + backend + miniprogram）
	@$(MAKE) -C desktop lint
	@$(MAKE) -C backend lint
	@$(MAKE) -C miniprogram lint
	@echo "所有子项目检查完成"

# ============================================
# 构建镜像 / 部署到 k3s
# ============================================
# 命令行的变量赋值（如 REGISTRY_HOST=...）会被 make 自动传给子 make，无需显式转发。
image: ## 构建 backend 镜像（make image REGISTRY_HOST=<节点IP>）
	@$(MAKE) -C build image

image-push: ## 构建并推送 backend 镜像（make image-push REGISTRY_HOST=<节点IP>）
	@$(MAKE) -C build image-push

deploy: ## 部署到 k3s（make deploy REGISTRY_HOST=... DB_HOST=... DB_PASSWORD=...）
	@$(MAKE) -C deploy install

# ============================================
# 桌面应用（透传到 desktop/，变量随命令行传入，如 V=1.2.3）
# ============================================
dev: ## 启动桌面应用开发模式（Electron + Vite 热重载）
	@$(MAKE) -C desktop dev

build: ## 构建桌面应用（.app/.dmg，产物在 desktop/dist-electron-builder/）
	@$(MAKE) -C desktop build

install: ## 安装桌面应用到系统（macOS → /Applications，含 j cli 检查）
	@$(MAKE) -C desktop install

test: ## 运行桌面应用测试（前端 + Rust）
	@$(MAKE) -C desktop test

pre-commit: ## 桌面应用提交前检查门（fmt + lint + test）
	@$(MAKE) -C desktop pre-commit

bump-version: ## 递增桌面应用 patch 版本号（同步 package.json 与 Cargo.toml）
	@$(MAKE) -C desktop bump-version

set-version: ## 设置桌面应用版本号（make set-version V=1.2.3）
	@$(MAKE) -C desktop set-version

clean: ## 清理桌面应用构建产物（前端 dist + Rust target + jcli）
	@$(MAKE) -C desktop clean

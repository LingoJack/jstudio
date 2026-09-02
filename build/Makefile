# 镜像构建：podman 构建 backend 镜像并推送到 k3s 集群内自建的 registry。
# 所有 docker 命令一律用 podman（docker 在本机只是 podman 的 alias）。
SHELL := $(shell which bash 2>/dev/null || echo /bin/bash)

REPO_ROOT := $(abspath $(CURDIR)/..)

# 镜像仓库地址：k3s 内 registry 的 NodePort 入口，必须是节点可达的 IP 或主机名。
REGISTRY_HOST ?=
REGISTRY_NODEPORT ?= 30500

# 目标节点架构：amd64 服务器用默认值，arm64 节点改成 linux/arm64。
PLATFORM ?= linux/amd64

BACKEND_IMAGE_NAME ?= jstudio-backend
IMAGE := $(REGISTRY_HOST):$(REGISTRY_NODEPORT)/$(BACKEND_IMAGE_NAME)
TAG ?= $(shell git -C $(REPO_ROOT) rev-parse --short HEAD 2>/dev/null || echo dev)

# 构建上下文取 backend/，Containerfile 与 ignore 文件由 -f / --ignorefile 显式指定。
BACKEND_CONTEXT := $(REPO_ROOT)/backend
BACKEND_CONTAINERFILE := $(CURDIR)/backend/Containerfile
BACKEND_IGNOREFILE := $(CURDIR)/backend/.containerignore

# registry 是集群内自建的匿名 http 仓库，push 必须关掉 TLS 校验。
PODMAN_PUSH_TLS_FLAG := --tls-verify=false

.DEFAULT_GOAL := help

.PHONY: help check-podman check-registry version image push image-push clean

help: ## 显示此帮助信息
	@echo "jstudio 镜像构建"
	@echo "============================================"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "必填变量: REGISTRY_HOST（k3s 节点的 IP 或主机名）"
	@echo "示例: make image-push REGISTRY_HOST=192.168.1.10"

check-podman: ## 检查 podman 是否可用
	@if ! command -v podman >/dev/null 2>&1; then \
		echo "未找到 podman，请先安装：brew install podman && podman machine init && podman machine start"; \
		exit 1; \
	fi

check-registry: ## 检查 registry 地址是否已给出
	@if [ -z "$(REGISTRY_HOST)" ]; then \
		echo "缺少 REGISTRY_HOST，示例：make image-push REGISTRY_HOST=192.168.1.10"; \
		exit 1; \
	fi

version: ## 输出镜像 tag（默认 git short sha）
	@echo $(TAG)

image: check-podman ## 构建 backend 镜像
	podman build --platform $(PLATFORM) \
		-f $(BACKEND_CONTAINERFILE) \
		--ignorefile $(BACKEND_IGNOREFILE) \
		-t $(IMAGE):$(TAG) \
		$(BACKEND_CONTEXT)

push: check-podman check-registry ## 推送 backend 镜像到集群内 registry
	podman push $(PODMAN_PUSH_TLS_FLAG) $(IMAGE):$(TAG)

image-push: image push ## 构建并推送（默认目标）

clean: check-podman ## 删除本地构建的镜像
	@if [ -n "$(REGISTRY_HOST)" ]; then \
		podman rmi $(IMAGE):$(TAG) || true; \
	else \
		echo "需要 REGISTRY_HOST 才能定位本地镜像"; \
		exit 1; \
	fi

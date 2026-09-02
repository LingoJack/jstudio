# 部署到 k3s：registry / MetalLB 引导 + helm 安装 JStudio chart。
# 镜像构建在 ../build/Makefile，两边共用的 registry 地址变量保持一致。
SHELL := $(shell which bash 2>/dev/null || echo /bin/bash)

REPO_ROOT := $(abspath $(CURDIR)/..)
CHART_DIR := $(CURDIR)/helm/jstudio

# ---------- 集群与发布 ----------
NS ?= jstudio
RELEASE ?= jstudio
HELM_TIMEOUT ?= 3m
# 额外传给 helm 的参数，例如 EXTRA_ARGS="--set replicaCount=2 --set service.type=NodePort"
EXTRA_ARGS ?=

# ---------- 镜像仓库（与 build/Makefile 对齐）----------
REGISTRY_HOST ?=
REGISTRY_NODEPORT ?= 30500
IMAGE_REPO := $(REGISTRY_HOST):$(REGISTRY_NODEPORT)/jstudio-backend
TAG ?= $(shell git -C $(REPO_ROOT) rev-parse --short HEAD 2>/dev/null || echo dev)

# ---------- MySQL（外部实例，本项目不把 MySQL 放进 k8s）----------
DB_HOST ?=
DB_PORT ?= 3306
DB_USER ?= root
DB_PASSWORD ?=
DB_NAME ?= jstudio

# ---------- MinIO（集群内自建，凭据与 backend 用的是同一份）----------
MINIO_ROOT_USER ?= minioadmin
MINIO_ROOT_PASSWORD ?= minioadmin

# ---------- Secret ----------
SECRET_NAME ?= $(RELEASE)
# 惰性求值：只有真正建 Secret 时才生成，避免跑 make help 也白调一次 openssl。
JWT_SECRET = $(shell openssl rand -base64 48)

# ---------- MetalLB（可选）----------
METALLB_NS ?= metallb-system
METALLB_CHART_REPO ?= https://metallb.github.io/metallb
METALLB_CHART ?= metallb/metallb
LB_IP_RANGE ?=

# 渲染 helm template/lint 时 DB_HOST 允许为空，用占位符让渲染能跑完。
DB_HOST_RENDER := $(if $(DB_HOST),$(DB_HOST),REPLACE_ME)

# backend 与 minio 的 Pod 用 app.kubernetes.io/name 区分，日志/查 IP 都靠这组标签定位。
BACKEND_SELECTOR := app.kubernetes.io/name=jstudio,app.kubernetes.io/instance=$(RELEASE)

.DEFAULT_GOAL := help

.PHONY: help tools-check \
        registry-up registries-print metallb-up bootstrap \
        secret-ensure schema-apply \
        lint template install upgrade status logs ip rollback uninstall

help: ## 显示此帮助信息
	@echo "jstudio 部署到 k3s"
	@echo "============================================"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "常用变量: REGISTRY_HOST DB_HOST DB_PASSWORD DB_USER DB_NAME MINIO_ROOT_USER MINIO_ROOT_PASSWORD"
	@echo "示例: make install REGISTRY_HOST=192.168.1.10 DB_HOST=10.0.0.5 DB_PASSWORD=xxx"

tools-check: ## 检查 helm / kubectl 是否可用
	@missing=""; \
	for t in kubectl helm; do \
		command -v $$t >/dev/null 2>&1 || missing="$$missing $$t"; \
	done; \
	if [ -n "$$missing" ]; then \
		echo "缺少工具:$$missing"; \
		echo "安装：brew install kubectl helm"; \
		exit 1; \
	fi

# ---------------------------------------------------------
# 集群引导
# ---------------------------------------------------------
registry-up: tools-check ## 在集群内部署 registry:2
	kubectl -n $(NS) apply -f $(CURDIR)/k3s/registry.yaml
	kubectl -n $(NS) rollout status deploy/registry --timeout=$(HELM_TIMEOUT)

registries-print: ## 打印节点上要写入的 /etc/rancher/k3s/registries.yaml
	@if [ -z "$(REGISTRY_HOST)" ]; then \
		echo "缺少 REGISTRY_HOST，示例：make registries-print REGISTRY_HOST=192.168.1.10"; \
		exit 1; \
	fi
	@echo "在每个 k3s 节点上执行（写完后必须 sudo systemctl restart k3s）："
	@echo ""
	@echo "sudo mkdir -p /etc/rancher/k3s && sudo tee /etc/rancher/k3s/registries.yaml >/dev/null <<'EOF'"
	@sed -e 's|__REGISTRY_HOST__|$(REGISTRY_HOST)|g' \
	     -e 's|__REGISTRY_NODEPORT__|$(REGISTRY_NODEPORT)|g' \
	     $(CURDIR)/k3s/registries.yaml
	@echo "EOF"
	@echo "sudo systemctl restart k3s"

metallb-up: tools-check ## 可选：安装 MetalLB 并配置 LB IP 段（需先在 k3s 里 disable servicelb）
	@if [ -z "$(LB_IP_RANGE)" ]; then \
		echo "缺少 LB_IP_RANGE，示例：make metallb-up LB_IP_RANGE=192.168.1.200-192.168.1.220"; \
		exit 1; \
	fi
	@echo "提示：装 MetalLB 前请在 k3s 的 config.yaml 里 disable servicelb，否则会和 klipper-lb 抢 Service"
	helm repo add metallb $(METALLB_CHART_REPO)
	helm repo update metallb
	helm upgrade --install metallb $(METALLB_CHART) -n $(METALLB_NS) --create-namespace --wait
	sed 's|__LB_IP_RANGE__|$(LB_IP_RANGE)|g' $(CURDIR)/metallb/ippool.yaml | kubectl apply -f -

bootstrap: registry-up registries-print ## 引导：起 registry + 打印节点侧 registries.yaml 配置
	@echo ""
	@echo "节点侧 registries.yaml 生效后才能拉到镜像（k3s 会重启）。"
	@echo "若需要独立 LB IP 段，再跑：make metallb-up LB_IP_RANGE=<起始IP-结束IP>"

# ---------------------------------------------------------
# 凭据与数据库
# ---------------------------------------------------------
secret-ensure: tools-check ## 幂等创建应用 Secret（已存在则跳过，避免轮换 jwt_secret）
	@kubectl create namespace $(NS) --dry-run=client -o yaml | kubectl apply -f -
	@if kubectl -n $(NS) get secret $(SECRET_NAME) >/dev/null 2>&1; then \
		echo "Secret $(SECRET_NAME) 已存在，跳过（重新生成 jwt_secret 会让所有已登录客户端失效）"; \
	else \
		kubectl -n $(NS) create secret generic $(SECRET_NAME) \
			--from-literal=JS_AUTH_JWT_SECRET='$(JWT_SECRET)' \
			--from-literal=JS_DATABASE_PASSWORD='$(DB_PASSWORD)' \
			--from-literal=JS_STORAGE_ACCESS_KEY='$(MINIO_ROOT_USER)' \
			--from-literal=JS_STORAGE_SECRET_KEY='$(MINIO_ROOT_PASSWORD)'; \
		echo "Secret $(SECRET_NAME) 已创建"; \
	fi

schema-apply: ## 打印外部 MySQL 建表命令（不自动执行）
	@echo "后端不自动迁移，请在外部 MySQL 上手动执行（确认无误后再跑）："
	@echo ""
	@echo "  mysql -h $(DB_HOST_RENDER) -P $(DB_PORT) -u $(DB_USER) -p -e \"CREATE DATABASE IF NOT EXISTS $(DB_NAME) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci\""
	@echo "  mysql -h $(DB_HOST_RENDER) -P $(DB_PORT) -u $(DB_USER) -p $(DB_NAME) < $(REPO_ROOT)/backend/schema.sql"

# ---------------------------------------------------------
# helm
# ---------------------------------------------------------
lint: tools-check ## helm lint
	helm lint $(CHART_DIR) \
		--set image.repository=$(IMAGE_REPO) \
		--set config.database.host=$(DB_HOST_RENDER)

template: tools-check ## 渲染 chart 到 stdout（不落集群）
	helm template $(RELEASE) $(CHART_DIR) -n $(NS) \
		--set image.repository=$(IMAGE_REPO) \
		--set image.tag=$(TAG) \
		--set config.database.host=$(DB_HOST_RENDER) \
		--set config.database.port=$(DB_PORT) \
		--set config.database.user=$(DB_USER) \
		--set config.database.dbname=$(DB_NAME) \
		--set minio.auth.rootUser=$(MINIO_ROOT_USER) \
		--set minio.auth.rootPassword=$(MINIO_ROOT_PASSWORD) \
		--set secret.existingSecret=$(SECRET_NAME) \
		$(EXTRA_ARGS)

install: tools-check secret-ensure ## helm upgrade --install（不存在则安装，存在则升级）
	@if [ -z "$(REGISTRY_HOST)" ] || [ -z "$(DB_HOST)" ] || [ -z "$(DB_PASSWORD)" ]; then \
		echo "缺少必填变量：REGISTRY_HOST / DB_HOST / DB_PASSWORD"; \
		echo "示例：make install REGISTRY_HOST=192.168.1.10 DB_HOST=10.0.0.5 DB_PASSWORD=xxx"; \
		exit 1; \
	fi
	helm upgrade --install $(RELEASE) $(CHART_DIR) -n $(NS) --create-namespace \
		--atomic --wait --timeout $(HELM_TIMEOUT) \
		--set image.repository=$(IMAGE_REPO) \
		--set image.tag=$(TAG) \
		--set config.database.host=$(DB_HOST) \
		--set config.database.port=$(DB_PORT) \
		--set config.database.user=$(DB_USER) \
		--set config.database.dbname=$(DB_NAME) \
		--set minio.auth.rootUser=$(MINIO_ROOT_USER) \
		--set minio.auth.rootPassword=$(MINIO_ROOT_PASSWORD) \
		--set secret.existingSecret=$(SECRET_NAME) \
		$(EXTRA_ARGS)

upgrade: install ## install 的别名

rollback: tools-check ## 回滚到上一个 release 版本
	helm rollback $(RELEASE) -n $(NS) --wait --timeout $(HELM_TIMEOUT)

uninstall: tools-check ## 卸载 release（PVC 与 Secret 需另行清理）
	helm uninstall $(RELEASE) -n $(NS)

# ---------------------------------------------------------
# 运维
# ---------------------------------------------------------
status: tools-check ## 查看 Pod / Service 状态
	kubectl -n $(NS) get pods,svc -l app.kubernetes.io/instance=$(RELEASE)

logs: tools-check ## 跟踪 backend 日志
	kubectl -n $(NS) logs -l $(BACKEND_SELECTOR) -c backend -f --tail=200

ip: tools-check ## 查看 backend Service 的对外地址
	kubectl -n $(NS) get svc -l $(BACKEND_SELECTOR)

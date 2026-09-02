{{/*
展开 chart 名，供 app.kubernetes.io/name 等标签使用。
*/}}
{{- define "jstudio.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{- define "jstudio.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "jstudio.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "jstudio.labels" -}}
helm.sh/chart: {{ include "jstudio.chart" . }}
{{ include "jstudio.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "jstudio.selectorLabels" -}}
app.kubernetes.io/name: {{ include "jstudio.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "jstudio.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "jstudio.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/*
敏感值统一从一个 Secret 里 envFrom 注入。secret.existingSecret 置空时，
回落到本 chart 渲染的同名 Secret。
*/}}
{{- define "jstudio.secretName" -}}
{{- default (include "jstudio.fullname" .) .Values.secret.existingSecret -}}
{{- end }}

{{/*
storage 端点：显式配置优先；minio 子 chart 开启时自动指向集群内 Service。
Service 名的拼法与 charts/minio/templates/_helpers.tpl 的 minio.fullname 必须一致。
*/}}
{{- define "jstudio.storageEndpoint" -}}
{{- if .Values.config.storage.endpoint -}}
{{- .Values.config.storage.endpoint -}}
{{- else if .Values.minio.enabled -}}
{{- printf "%s-minio:%v" .Release.Name .Values.minio.service.port -}}
{{- else -}}
{{- fail "config.storage.endpoint 必填：minio.enabled=false 时必须指向外部 S3 兼容服务" -}}
{{- end -}}
{{- end -}}

{{/*
config.yaml 正文。单独抽出来是为了给 Deployment 算 checksum/config ——
ConfigMap 更新本身不会触发 Pod 重启，靠这个注解让变更滚动生效。

键名必须与 backend/internal/config/config.go 里 setDefaults 注册的一致：
viper 的 AutomaticEnv 只认已注册的键，否则 JS_ 前缀 env 会静默失效。
*/}}
{{- define "jstudio.configYaml" -}}
# 由 helm 渲染，勿手改。敏感值不在此处，由 Secret 以 JS_ 前缀 env 注入。
server:
  addr: {{ .Values.config.server.addr | quote }}
  allowed_origins:
{{- range .Values.config.server.allowed_origins }}
  - {{ . | quote }}
{{- end }}
database:
  host: {{ required "config.database.host 必填（外部 MySQL 地址）" .Values.config.database.host | quote }}
  port: {{ .Values.config.database.port }}
  user: {{ .Values.config.database.user | quote }}
  dbname: {{ .Values.config.database.dbname | quote }}
auth:
  # 留空是刻意的：由 Secret 的 JS_AUTH_JWT_SECRET 覆盖（viper 里 env 优先级高于文件，
  # 且 AllowEmptyEnv 默认关闭，空串 env 不会被误判为已设置）。
  jwt_secret: ""
  token_ttl: {{ .Values.config.auth.token_ttl | quote }}
storage:
  endpoint: {{ include "jstudio.storageEndpoint" . | quote }}
  bucket: {{ .Values.config.storage.bucket | quote }}
  use_ssl: {{ .Values.config.storage.use_ssl }}
{{- end -}}

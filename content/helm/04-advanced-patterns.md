# Advanced Helm Patterns for Enterprise

## Umbrella Charts (Chart of Charts)

An umbrella chart packages your entire application stack as a single deployable unit.

```
my-platform/
├── Chart.yaml
├── values.yaml
├── values-staging.yaml
├── values-production.yaml
└── charts/
    ├── frontend-1.2.0.tgz       # dependency: your frontend chart
    ├── backend-2.1.0.tgz        # dependency: your backend chart
    ├── redis-18.0.0.tgz         # dependency: bitnami redis
    └── postgresql-13.0.0.tgz    # dependency: bitnami postgresql
```

**Chart.yaml:**
```yaml
apiVersion: v2
name: my-platform
description: Complete platform deployment
type: application
version: 1.0.0
appVersion: "2024.1"

dependencies:
- name: frontend
  version: "1.2.0"
  repository: "oci://registry.example.com/helm"
  condition: frontend.enabled
- name: backend
  version: "2.1.0"
  repository: "oci://registry.example.com/helm"
  condition: backend.enabled
- name: redis
  version: "18.0.0"
  repository: "https://charts.bitnami.com/bitnami"
  condition: redis.enabled
  tags:
  - cache
- name: postgresql
  version: "13.0.0"
  repository: "https://charts.bitnami.com/bitnami"
  condition: postgresql.enabled
```

**values.yaml (umbrella-level overrides):**
```yaml
global:
  imageRegistry: registry.example.com
  imagePullSecrets:
  - name: registry-secret
  storageClass: fast-ssd
  environment: production

frontend:
  enabled: true
  image:
    tag: "1.2.0"
  replicaCount: 3
  ingress:
    enabled: true
    hostname: app.example.com

backend:
  enabled: true
  image:
    tag: "2.1.0"
  replicaCount: 5
  database:
    host: "{{ .Release.Name }}-postgresql"   # reference sibling chart service

redis:
  enabled: true
  auth:
    existingSecret: redis-password
  replica:
    replicaCount: 3
  sentinel:
    enabled: true   # HA mode

postgresql:
  enabled: true
  auth:
    existingSecret: postgresql-password
  primary:
    persistence:
      size: 100Gi
      storageClass: fast-ssd
  readReplicas:
    replicaCount: 2
```

```bash
# Lock dependency versions
helm dependency update my-platform/

# Deploy umbrella chart
helm upgrade --install platform ./my-platform \
  -f values-production.yaml \
  --namespace production \
  --create-namespace \
  --wait \
  --timeout 10m \
  --atomic   # rollback automatically on failure
```

---

## Helm Hooks — Lifecycle Management

```
pre-install  →  install  →  post-install
pre-upgrade  →  upgrade  →  post-upgrade
pre-delete   →  delete   →  post-delete
pre-rollback → rollback  → post-rollback
```

**Database migration hook (pre-upgrade):**
```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: {{ .Release.Name }}-db-migrate
  annotations:
    "helm.sh/hook": pre-upgrade,pre-install
    "helm.sh/hook-weight": "-5"          # lower = runs first
    "helm.sh/hook-delete-policy": before-hook-creation,hook-succeeded
spec:
  ttlSecondsAfterFinished: 300
  backoffLimit: 3
  template:
    spec:
      serviceAccountName: {{ .Release.Name }}-migrator
      restartPolicy: Never
      initContainers:
      - name: wait-for-db
        image: busybox
        command: ['sh', '-c', 'until nc -z {{ .Release.Name }}-postgresql 5432; do sleep 2; done']
      containers:
      - name: migrate
        image: {{ .Values.image.repository }}:{{ .Values.image.tag }}
        command: ["python", "manage.py", "migrate", "--no-input"]
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: {{ .Release.Name }}-db-secret
              key: url
```

**Slack notification hook (post-upgrade):**
```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: {{ .Release.Name }}-notify
  annotations:
    "helm.sh/hook": post-upgrade
    "helm.sh/hook-delete-policy": hook-succeeded
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: notify
        image: curlimages/curl
        command:
        - sh
        - -c
        - |
          curl -X POST $SLACK_WEBHOOK \
            -H 'Content-type: application/json' \
            --data '{"text":"✅ {{ .Release.Name }} upgraded to {{ .Chart.AppVersion }} in {{ .Release.Namespace }}"}'
        env:
        - name: SLACK_WEBHOOK
          valueFrom:
            secretKeyRef:
              name: slack-webhook
              key: url
```

---

## Named Templates & Helpers

**_helpers.tpl — reusable template fragments:**
```yaml
{{/*
Expand the name of the chart.
*/}}
{{- define "myapp.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "myapp.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Common labels — applied to ALL resources
*/}}
{{- define "myapp.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
app.kubernetes.io/name: {{ include "myapp.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- with .Values.global.labels }}
{{ toYaml . }}
{{- end }}
{{- end }}

{{/*
Selector labels — used in matchLabels (immutable after creation)
*/}}
{{- define "myapp.selectorLabels" -}}
app.kubernetes.io/name: {{ include "myapp.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Generate image reference with digest support
*/}}
{{- define "myapp.image" -}}
{{- $registry := .Values.global.imageRegistry | default .Values.image.registry -}}
{{- $repo := .Values.image.repository -}}
{{- $tag := .Values.image.tag | default .Chart.AppVersion -}}
{{- $digest := .Values.image.digest -}}
{{- if $digest -}}
{{ $registry }}/{{ $repo }}@{{ $digest }}
{{- else -}}
{{ $registry }}/{{ $repo }}:{{ $tag }}
{{- end }}
{{- end }}

{{/*
Render environment variables from values
*/}}
{{- define "myapp.envVars" -}}
{{- range $key, $val := .Values.env }}
- name: {{ $key }}
  value: {{ $val | quote }}
{{- end }}
{{- range .Values.envFromSecret }}
- name: {{ .name }}
  valueFrom:
    secretKeyRef:
      name: {{ .secretName }}
      key: {{ .secretKey }}
{{- end }}
{{- end }}
```

**Using helpers in deployment.yaml:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "myapp.fullname" . }}
  labels:
    {{- include "myapp.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "myapp.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "myapp.selectorLabels" . | nindent 8 }}
    spec:
      containers:
      - name: {{ .Chart.Name }}
        image: {{ include "myapp.image" . }}
        env:
          {{- include "myapp.envVars" . | nindent 10 }}
```

---

## Values Schema Validation

**values.schema.json** — validates values at install/upgrade time:
```json
{
  "$schema": "https://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["image", "replicaCount"],
  "properties": {
    "replicaCount": {
      "type": "integer",
      "minimum": 1,
      "maximum": 50
    },
    "image": {
      "type": "object",
      "required": ["repository", "tag"],
      "properties": {
        "repository": {"type": "string"},
        "tag": {"type": "string"},
        "pullPolicy": {
          "type": "string",
          "enum": ["Always", "IfNotPresent", "Never"]
        }
      }
    },
    "resources": {
      "type": "object",
      "properties": {
        "limits": {
          "type": "object",
          "required": ["cpu", "memory"]
        }
      }
    }
  }
}
```

---

## OCI Registry — Push Helm Charts

```bash
# Login to OCI registry
helm registry login registry.example.com --username $USERNAME --password $PASSWORD

# Package chart
helm package ./my-chart

# Push to OCI registry
helm push my-chart-1.0.0.tgz oci://registry.example.com/helm

# Pull and install from OCI
helm install myapp oci://registry.example.com/helm/my-chart --version 1.0.0
```

---

## Helm Diff & Test

```bash
# Preview changes before applying (requires helm-diff plugin)
helm plugin install https://github.com/databus23/helm-diff
helm diff upgrade platform ./my-platform -f values-production.yaml

# Run chart tests
helm test myapp -n production

# A test is a pod with helm.sh/hook: test annotation
apiVersion: v1
kind: Pod
metadata:
  name: {{ include "myapp.fullname" . }}-test-connection
  annotations:
    "helm.sh/hook": test
spec:
  restartPolicy: Never
  containers:
  - name: test
    image: busybox
    command: ['sh', '-c', 'wget -qO- http://{{ include "myapp.fullname" . }}:{{ .Values.service.port }}/health | grep -q ok']
```

---

## Production Workflow

```bash
# 1. Lint
helm lint ./my-chart

# 2. Template dry-run with schema validation
helm template my-release ./my-chart -f values-production.yaml | kubectl apply --dry-run=server -f -

# 3. Diff
helm diff upgrade my-release ./my-chart -f values-production.yaml -n production

# 4. Deploy with safety flags
helm upgrade --install my-release ./my-chart \
  -f values-production.yaml \
  --namespace production \
  --wait \
  --timeout 10m \
  --atomic \
  --cleanup-on-fail \
  --history-max 10

# 5. Verify
helm test my-release -n production
helm status my-release -n production
```

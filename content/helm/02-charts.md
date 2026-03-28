# Helm Chart Structure

## Creating Your First Chart

```bash
# Create a new chart skeleton
helm create my-app

# What was created:
tree my-app/
# my-app/
# ├── Chart.yaml          ← Chart metadata (name, version, description)
# ├── values.yaml         ← Default configuration values
# ├── charts/             ← Sub-chart dependencies
# ├── templates/          ← Kubernetes manifests with Go template directives
# │   ├── deployment.yaml
# │   ├── service.yaml
# │   ├── ingress.yaml
# │   ├── hpa.yaml
# │   ├── serviceaccount.yaml
# │   ├── NOTES.txt       ← Post-install instructions (printed after helm install)
# │   ├── _helpers.tpl    ← Named template definitions (not rendered directly)
# │   └── tests/
# │       └── test-connection.yaml
# └── .helmignore         ← Like .dockerignore / .gitignore
```

---

## Chart.yaml

The required metadata file for every chart.

```yaml
# Chart.yaml
apiVersion: v2          # Helm 3 chart format (v1 = Helm 2)
name: my-app
description: A Helm chart for deploying My App
type: application       # 'application' or 'library'

# Chart version — follows SemVer 2
# Increment for any chart changes (template changes, new fields, etc.)
version: 1.4.0

# App version — the version of the SOFTWARE being packaged
# Does not need to be SemVer; can be a Docker image tag
appVersion: "2.7.3"

keywords:
  - web
  - api
  - nodejs

home: https://example.com/my-app
sources:
  - https://github.com/myorg/my-app

maintainers:
  - name: Platform Team
    email: platform@example.com

# Icon URL (shown in Artifact Hub)
icon: https://example.com/icon.png

# Chart dependencies (subcharts)
dependencies:
  - name: postgresql
    version: "^13.0.0"
    repository: https://charts.bitnami.com/bitnami
    condition: postgresql.enabled   # Only install if values.postgresql.enabled=true
    alias: db                       # Reference as 'db' instead of 'postgresql'

  - name: redis
    version: "~17.0.0"
    repository: https://charts.bitnami.com/bitnami
    condition: redis.enabled
```

---

## values.yaml

Provides default values for all template variables. Users override these at install time.

```yaml
# values.yaml

# Number of pod replicas
replicaCount: 2

# Container image configuration
image:
  repository: my-registry.io/my-org/my-app
  tag: ""           # Empty = use appVersion from Chart.yaml
  pullPolicy: IfNotPresent

imagePullSecrets: []

nameOverride: ""
fullnameOverride: ""

serviceAccount:
  create: true
  annotations: {}
  name: ""

podAnnotations: {}
podLabels: {}

podSecurityContext:
  runAsNonRoot: true
  runAsUser: 1000
  fsGroup: 2000

securityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop: ["ALL"]

service:
  type: ClusterIP
  port: 80
  targetPort: 3000

ingress:
  enabled: false
  className: "nginx"
  annotations: {}
  hosts:
    - host: my-app.local
      paths:
        - path: /
          pathType: Prefix
  tls: []

resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 256Mi

autoscaling:
  enabled: false
  minReplicas: 1
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70

livenessProbe:
  httpGet:
    path: /health
    port: http
  initialDelaySeconds: 15
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /ready
    port: http
  initialDelaySeconds: 5
  periodSeconds: 5

# Application-specific configuration
config:
  logLevel: info
  allowedOrigins: ""
  maxWorkers: 4

# External database (or use postgresql subchart)
externalDatabase:
  host: ""
  port: 5432
  database: myapp

postgresql:
  enabled: false      # Set true to deploy postgresql as subchart
  auth:
    postgresPassword: "changeme"
    database: myapp

nodeSelector: {}
tolerations: []
affinity: {}
```

### Overriding Values

```bash
# --set uses dot notation for nested keys
helm install my-app ./my-app \
  --set replicaCount=5 \
  --set image.tag=2.0.0 \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=myapp.example.com

# --set-string forces string type (useful for tags like "1.0")
helm install my-app ./my-app --set-string image.tag=1.0

# -f / --values uses a YAML file
helm install my-app ./my-app -f values-production.yaml

# Multiple files: rightmost takes precedence on conflict
helm install my-app ./my-app \
  -f values-production.yaml \
  -f values-secrets.yaml
```

---

## Templates

The `templates/` directory contains Go template files that are rendered into Kubernetes manifests.

### deployment.yaml Example

```yaml
# templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "my-app.fullname" . }}
  labels:
    {{- include "my-app.labels" . | nindent 4 }}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "my-app.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      annotations:
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
        {{- with .Values.podAnnotations }}
        {{- toYaml . | nindent 8 }}
        {{- end }}
      labels:
        {{- include "my-app.selectorLabels" . | nindent 8 }}
        {{- with .Values.podLabels }}
        {{- toYaml . | nindent 8 }}
        {{- end }}
    spec:
      {{- with .Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      serviceAccountName: {{ include "my-app.serviceAccountName" . }}
      securityContext:
        {{- toYaml .Values.podSecurityContext | nindent 8 }}
      containers:
        - name: {{ .Chart.Name }}
          securityContext:
            {{- toYaml .Values.securityContext | nindent 12 }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: {{ .Values.service.targetPort }}
              protocol: TCP
          livenessProbe:
            {{- toYaml .Values.livenessProbe | nindent 12 }}
          readinessProbe:
            {{- toYaml .Values.readinessProbe | nindent 12 }}
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
          env:
            - name: LOG_LEVEL
              value: {{ .Values.config.logLevel | quote }}
            - name: MAX_WORKERS
              value: {{ .Values.config.maxWorkers | quote }}
      {{- with .Values.nodeSelector }}
      nodeSelector:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.affinity }}
      affinity:
        {{- toYaml . | nindent 8 }}
      {{- end }}
```

### service.yaml Example

```yaml
# templates/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ include "my-app.fullname" . }}
  labels:
    {{- include "my-app.labels" . | nindent 4 }}
spec:
  type: {{ .Values.service.type }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: http
      protocol: TCP
      name: http
  selector:
    {{- include "my-app.selectorLabels" . | nindent 4 }}
```

### Conditional Ingress

```yaml
# templates/ingress.yaml
{{- if .Values.ingress.enabled -}}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ include "my-app.fullname" . }}
  labels:
    {{- include "my-app.labels" . | nindent 4 }}
  {{- with .Values.ingress.annotations }}
  annotations:
    {{- toYaml . | nindent 4 }}
  {{- end }}
spec:
  {{- if .Values.ingress.className }}
  ingressClassName: {{ .Values.ingress.className }}
  {{- end }}
  {{- if .Values.ingress.tls }}
  tls:
    {{- range .Values.ingress.tls }}
    - hosts:
        {{- range .hosts }}
        - {{ . | quote }}
        {{- end }}
      secretName: {{ .secretName }}
    {{- end }}
  {{- end }}
  rules:
    {{- range .Values.ingress.hosts }}
    - host: {{ .host | quote }}
      http:
        paths:
          {{- range .paths }}
          - path: {{ .path }}
            pathType: {{ .pathType }}
            backend:
              service:
                name: {{ include "my-app.fullname" $ }}
                port:
                  number: {{ $.Values.service.port }}
          {{- end }}
    {{- end }}
{{- end }}
```

---

## _helpers.tpl

Named templates defined here are available to all other templates in the chart.

```yaml
# templates/_helpers.tpl

{{/*
Expand the name of the chart.
*/}}
{{- define "my-app.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this
(by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "my-app.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart label (used for Helm-managed label)
*/}}
{{- define "my-app.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels (attach to all resources)
*/}}
{{- define "my-app.labels" -}}
helm.sh/chart: {{ include "my-app.chart" . }}
{{ include "my-app.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels (for matchLabels and Service selectors)
*/}}
{{- define "my-app.selectorLabels" -}}
app.kubernetes.io/name: {{ include "my-app.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "my-app.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "my-app.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}
```

---

## NOTES.txt

Printed to the user after a successful `helm install` or `helm upgrade`.

```
# templates/NOTES.txt
Thank you for installing {{ .Chart.Name }} {{ .Chart.AppVersion }}!

Release name: {{ .Release.Name }}
Namespace: {{ .Release.Namespace }}

{{- if .Values.ingress.enabled }}
Application URL:
{{- range .Values.ingress.hosts }}
  http{{ if $.Values.ingress.tls }}s{{ end }}://{{ .host }}
{{- end }}

{{- else if eq .Values.service.type "LoadBalancer" }}
  Get the application URL by running:
  export SERVICE_IP=$(kubectl get svc --namespace {{ .Release.Namespace }} \
    {{ include "my-app.fullname" . }} \
    --template "{{"{{range (index .status.loadBalancer.ingress 0)}}{{.}}{{end}}"}}")
  echo "http://$SERVICE_IP:{{ .Values.service.port }}"

{{- else }}
  Port-forward to access:
  export POD_NAME=$(kubectl get pods --namespace {{ .Release.Namespace }} \
    -l "app.kubernetes.io/name={{ include "my-app.name" . }}" \
    -o jsonpath="{.items[0].metadata.name}")
  kubectl --namespace {{ .Release.Namespace }} port-forward $POD_NAME 8080:{{ .Values.service.targetPort }}
  echo "Visit http://127.0.0.1:8080"
{{- end }}
```

---

## Chart Dependencies

```bash
# After adding dependencies to Chart.yaml, lock them
helm dependency update ./my-app
# Creates Chart.lock and downloads subcharts to charts/

# Re-download dependencies from Chart.lock
helm dependency build ./my-app

# List dependencies
helm dependency list ./my-app
```

---

## Testing Your Chart

```bash
# Lint: check YAML syntax and Helm best practices
helm lint ./my-app
helm lint ./my-app -f values-production.yaml

# Template: render to stdout without installing
helm template my-release ./my-app
helm template my-release ./my-app -f values-production.yaml | kubectl apply --dry-run=client -f -

# Validate rendered output against live cluster API
helm template my-release ./my-app | kubectl apply --dry-run=server -f -

# Run chart tests (if you have tests/ templates)
helm install my-release ./my-app
helm test my-release
```

---

## Key Takeaways

- A chart contains: `Chart.yaml` (metadata), `values.yaml` (defaults), `templates/` (manifests), `_helpers.tpl` (named templates)
- **`values.yaml`** provides sensible defaults; users override with `--set` or `-f values-override.yaml`
- **`_helpers.tpl`** is where you put reusable named templates — it starts with underscore so it isn't rendered directly
- **`Chart.yaml` `version`** is the chart version; **`appVersion`** is the application version — keep them distinct
- Always run `helm lint` and `helm template` before installing to catch errors early
- `helm template | kubectl apply --dry-run=server` validates against the actual cluster API

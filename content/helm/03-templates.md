# Go Templates and Helm Helpers

## The Go Template Language

Helm uses Go's `text/template` package, augmented by the [Sprig](https://masterminds.github.io/sprig/) function library. Understanding this is the key to writing flexible, maintainable charts.

Template directives are wrapped in double curly braces: `{{ ... }}`

```yaml
# Static YAML
name: my-app

# Go template — value from .Values
name: {{ .Values.app.name }}

# Trim whitespace with - inside braces
name: {{- .Values.app.name -}}
```

The `-` inside `{{-` and `-}}` trims whitespace (including newlines) before/after the directive. This is essential for clean YAML output.

---

## Template Objects

Helm provides several built-in objects accessible in every template:

### .Release

Information about the current release.

```yaml
name: {{ .Release.Name }}         # Release name (e.g., "my-app-prod")
namespace: {{ .Release.Namespace }}  # Target namespace
service: {{ .Release.Service }}   # Always "Helm"
revision: {{ .Release.Revision }} # Release revision number (int)
isUpgrade: {{ .Release.IsUpgrade }}  # true if this is an upgrade
isInstall: {{ .Release.IsInstall }}  # true if this is a fresh install
```

### .Values

Values from `values.yaml` merged with user-supplied `--set` and `-f` overrides.

```yaml
image: {{ .Values.image.repository }}:{{ .Values.image.tag }}
replicas: {{ .Values.replicaCount }}
enabled: {{ .Values.featureFlags.newUI }}
```

### .Chart

Contents of `Chart.yaml`.

```yaml
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
```

### .Files

Access non-template files in the chart directory.

```yaml
data:
  config.json: {{ .Files.Get "config/app.json" | b64enc }}
  nginx.conf:  |
    {{ .Files.Get "config/nginx.conf" | nindent 4 }}
```

### .Capabilities

Information about the Kubernetes cluster.

```yaml
# Use different API version based on cluster version
{{- if .Capabilities.APIVersions.Has "networking.k8s.io/v1/Ingress" }}
apiVersion: networking.k8s.io/v1
{{- else }}
apiVersion: networking.k8s.io/v1beta1
{{- end }}

# Kubernetes version
# .Capabilities.KubeVersion.Major = "1"
# .Capabilities.KubeVersion.Minor = "28"
```

### .Template

Information about the current template file.

```yaml
# Add a config checksum annotation to trigger pod restarts on config changes
annotations:
  checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
```

---

## Control Flow

### if / else if / else

```yaml
spec:
  {{- if .Values.autoscaling.enabled }}
  # replicas is managed by HPA — don't set it
  {{- else }}
  replicas: {{ .Values.replicaCount | default 1 }}
  {{- end }}

---
# Multi-branch
{{- if eq .Values.service.type "LoadBalancer" }}
  type: LoadBalancer
  externalTrafficPolicy: Local
{{- else if eq .Values.service.type "NodePort" }}
  type: NodePort
{{- else }}
  type: ClusterIP
{{- end }}
```

### range (Iteration)

```yaml
# Iterate over a list
{{- range .Values.ingress.hosts }}
- host: {{ .host | quote }}
  http:
    paths:
    {{- range .paths }}
    - path: {{ .path }}
      pathType: {{ .pathType }}
    {{- end }}
{{- end }}

---
# Iterate over a map
env:
{{- range $key, $value := .Values.extraEnv }}
- name: {{ $key }}
  value: {{ $value | quote }}
{{- end }}

---
# Iterate with index
containers:
{{- range $i, $container := .Values.sidecars }}
- name: sidecar-{{ $i }}
  image: {{ $container.image }}
{{- end }}
```

### with (Scope Shortcut)

```yaml
# Without with:
{{- if .Values.podAnnotations }}
annotations:
  {{- range $k, $v := .Values.podAnnotations }}
  {{ $k }}: {{ $v | quote }}
  {{- end }}
{{- end }}

# With 'with' — changes . to the value (and handles nil check)
{{- with .Values.podAnnotations }}
annotations:
  {{- toYaml . | nindent 4 }}
{{- end }}
```

---

## Variables

```yaml
{{- $name := include "my-app.fullname" . -}}
{{- $labels := include "my-app.labels" . -}}

metadata:
  name: {{ $name }}
  labels:
    {{- $labels | nindent 4 }}

# Variables in range loops
{{- range $idx, $item := .Values.items }}
- name: item-{{ $idx }}-{{ $item.name }}
  value: {{ $item.value | quote }}
{{- end }}

# Access parent scope with $ inside range
{{- range .Values.services }}
- name: {{ .name }}-{{ $.Release.Name }}
  namespace: {{ $.Release.Namespace }}
{{- end }}
```

---

## Essential Template Functions

### String Functions (Sprig)

```yaml
# Quote: wrap in double quotes
value: {{ .Values.name | quote }}        # → "my-app"

# Upper / lower
name: {{ .Values.name | upper }}         # → MY-APP
name: {{ .Values.name | lower }}         # → my-app

# Trim whitespace
name: {{ .Values.name | trim }}

# Truncate to 63 chars (DNS label limit)
name: {{ .Values.name | trunc 63 | trimSuffix "-" }}

# Replace characters
label: {{ .Values.name | replace "." "-" }}

# Contains / hasPrefix / hasSuffix
{{- if contains "prod" .Values.env }}
replicas: 3
{{- end }}

# printf formatting
image: {{ printf "%s:%s" .Values.image.repository .Values.image.tag }}

# Default value
tag: {{ .Values.image.tag | default .Chart.AppVersion | quote }}
```

### YAML / Indentation

```yaml
# toYaml: convert a value to YAML (for complex types)
resources:
  {{- toYaml .Values.resources | nindent 2 }}

# nindent: indent with leading newline
labels:
  {{- include "my-app.labels" . | nindent 4 }}

# indent: indent without leading newline
annotations:
  {{- include "my-app.annotations" . | indent 4 }}

# toJson: convert to JSON
config: '{{ toJson .Values.config }}'
```

### Math Functions

```yaml
# Simple arithmetic
size: {{ mul .Values.replicas 2 }}
timeout: {{ add .Values.baseTimeout 30 }}
maxConnections: {{ div .Values.workers 2 | int }}
```

### List Functions

```yaml
# first / last / rest
firstHost: {{ first .Values.ingress.hosts | quote }}
lastItem: {{ last .Values.items }}

# Has: check if list contains a value
{{- if has "production" .Values.environments }}
highAvailability: true
{{- end }}

# concat: join two lists
{{- $allHosts := concat .Values.primaryHosts .Values.additionalHosts }}
```

### Type Conversion

```yaml
# int: string → integer
port: {{ .Values.service.port | int }}

# toString: any → string
tag: {{ .Values.build.number | toString | quote }}

# b64enc / b64dec: base64
encoded: {{ .Values.secret | b64enc }}
decoded: {{ .Values.encodedValue | b64dec }}
```

---

## Named Templates (define / include)

The most powerful pattern in Helm: define a template once, reuse it everywhere.

```yaml
# In _helpers.tpl

{{/*
  Return the standard set of labels applied to every resource.
  Usage: {{ include "my-app.labels" . | nindent 4 }}
*/}}
{{- define "my-app.labels" -}}
helm.sh/chart: {{ include "my-app.chart" . }}
app.kubernetes.io/name: {{ include "my-app.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
  Generate the resource limits section, supporting an optional override.
  Usage: {{ include "my-app.resources" (dict "Values" .Values "context" "worker") }}
*/}}
{{- define "my-app.resources" -}}
{{- $ctx := .context | default "default" -}}
{{- if index .Values.resources $ctx -}}
{{- toYaml (index .Values.resources $ctx) }}
{{- else -}}
{{- toYaml .Values.resources.default }}
{{- end -}}
{{- end -}}
```

```yaml
# In deployment.yaml — call the named templates
metadata:
  labels:
    {{- include "my-app.labels" . | nindent 4 }}

# Pass extra context using dict
resources:
  {{- include "my-app.resources" (dict "Values" .Values "context" "worker") | nindent 10 }}
```

**`include` vs `template`:**
- `include` returns the output as a string — can be piped to `nindent`, `quote`, etc. **(always use include)**
- `template` renders in-place — cannot be piped

---

## Practical: Production Values File

You typically have multiple values files:

```yaml
# values.yaml (defaults / development)
replicaCount: 1
image:
  tag: "latest"
resources:
  requests:
    cpu: 50m
    memory: 64Mi
  limits:
    cpu: 100m
    memory: 128Mi
ingress:
  enabled: false
autoscaling:
  enabled: false

---
# values-staging.yaml (overlay for staging)
replicaCount: 2
image:
  tag: "1.4.0"
ingress:
  enabled: true
  hosts:
    - host: my-app.staging.example.com
      paths:
        - path: /
          pathType: Prefix

---
# values-production.yaml (overlay for production)
replicaCount: 3
image:
  tag: "1.4.0"
resources:
  requests:
    cpu: 200m
    memory: 256Mi
  limits:
    cpu: 1000m
    memory: 512Mi
ingress:
  enabled: true
  hosts:
    - host: my-app.example.com
      paths:
        - path: /
          pathType: Prefix
autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 20
```

```bash
# Deploy to staging
helm upgrade --install my-app ./my-app \
  -f values.yaml \
  -f values-staging.yaml \
  --namespace staging \
  --create-namespace

# Deploy to production
helm upgrade --install my-app ./my-app \
  -f values.yaml \
  -f values-production.yaml \
  -f values-secrets-production.yaml \  # Never commit this!
  --namespace production
```

---

## Debugging Templates

```bash
# Render templates without deploying
helm template my-release ./my-app -f values-production.yaml

# Render a specific template file
helm template my-release ./my-app -s templates/deployment.yaml

# Enable debug output (shows computed values and errors)
helm install my-release ./my-app --debug --dry-run

# Lint with a values file
helm lint ./my-app -f values-production.yaml

# Validate against the cluster API (requires a running cluster)
helm template my-release ./my-app | kubectl apply --dry-run=server -f -
```

---

## Try It Yourself

### Exercise: Create a Chart from Scratch

```bash
# 1. Generate a chart skeleton
helm create todoapp

# 2. Customise values.yaml
cat > todoapp/values.yaml <<'EOF'
replicaCount: 2
image:
  repository: nginx
  tag: "1.25-alpine"
  pullPolicy: IfNotPresent
service:
  type: ClusterIP
  port: 80
  targetPort: 80
config:
  message: "Hello from Helm!"
EOF

# 3. Add a ConfigMap template
cat > todoapp/templates/configmap.yaml <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ include "todoapp.fullname" . }}-config
  labels:
    {{- include "todoapp.labels" . | nindent 4 }}
data:
  MESSAGE: {{ .Values.config.message | quote }}
EOF

# 4. Lint the chart
helm lint ./todoapp

# 5. Preview the rendered output
helm template my-todo ./todoapp

# 6. Install it
helm install my-todo ./todoapp --namespace dev --create-namespace

# 7. Verify
kubectl get all -n dev
helm list -n dev

# 8. Upgrade with a new message
helm upgrade my-todo ./todoapp --set config.message="Updated message!"

# 9. Check history
helm history my-todo -n dev

# 10. Clean up
helm uninstall my-todo -n dev
kubectl delete namespace dev
```

---

## Key Takeaways

- Helm uses **Go templates** with **Sprig** functions — learn `{{- ... -}}`, `range`, `with`, `if`
- **`.Release.*`** gives release metadata; **`.Values.*`** gives user-supplied configuration; **`.Chart.*`** gives chart metadata
- Use **`include` + `nindent`** for named templates — never `template` (can't be piped)
- The `-` in `{{-` and `-}}` strips whitespace — essential for clean YAML output
- **`toYaml | nindent N`** is the idiom for embedding complex values (resources, affinity, etc.)
- **Debug workflow:** `helm lint` → `helm template` → `helm install --dry-run --debug` → `helm install`

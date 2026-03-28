# Lab: Your First Helm Chart

**Difficulty:** Intermediate
**Time:** 45 minutes
**Prerequisites:** Helm 3 installed, kubectl + running Kubernetes cluster

---

## Objective

In this lab you will:

1. Create a Helm chart from scratch (using `helm create`)
2. Understand the chart structure
3. Customise the templates and values
4. Install the chart to your cluster
5. Upgrade with new values
6. Roll back to a previous revision
7. Package and share the chart

---

## Step 1: Verify Prerequisites

```bash
helm version
kubectl cluster-info
```

---

## Step 2: Create the Chart

```bash
cd labs/helm/01-first-chart

# Create a new chart called 'mywebapp'
helm create mywebapp

# Explore the generated structure
find mywebapp -type f | sort
```

Take 5 minutes to read through each file:
- `Chart.yaml` — chart metadata
- `values.yaml` — default values
- `templates/deployment.yaml` — the main workload
- `templates/service.yaml` — network exposure
- `templates/_helpers.tpl` — named template helpers
- `templates/NOTES.txt` — post-install message

---

## Step 3: Customise the Chart

### Update Chart.yaml

```bash
cat > mywebapp/Chart.yaml << 'EOF'
apiVersion: v2
name: mywebapp
description: My first Helm chart - a simple nginx web application
type: application
version: 0.1.0
appVersion: "1.25.4"
keywords:
  - nginx
  - web
  - demo
maintainers:
  - name: Your Name
    email: you@example.com
EOF
```

### Update values.yaml

```bash
cat > mywebapp/values.yaml << 'EOF'
# Number of pod replicas
replicaCount: 2

# Container image
image:
  repository: nginx
  pullPolicy: IfNotPresent
  tag: "1.25-alpine"

imagePullSecrets: []
nameOverride: ""
fullnameOverride: ""

serviceAccount:
  create: false
  annotations: {}
  name: ""

podAnnotations: {}
podLabels: {}

podSecurityContext:
  runAsNonRoot: false  # nginx needs root to bind port 80

securityContext: {}

# Service configuration
service:
  type: ClusterIP
  port: 80

# Ingress configuration
ingress:
  enabled: false
  className: "nginx"
  annotations: {}
  hosts:
    - host: mywebapp.local
      paths:
        - path: /
          pathType: Prefix
  tls: []

# Resource limits and requests
resources:
  requests:
    cpu: 25m
    memory: 32Mi
  limits:
    cpu: 100m
    memory: 64Mi

livenessProbe:
  httpGet:
    path: /
    port: http

readinessProbe:
  httpGet:
    path: /
    port: http

# HorizontalPodAutoscaler
autoscaling:
  enabled: false
  minReplicas: 1
  maxReplicas: 5
  targetCPUUtilizationPercentage: 80

nodeSelector: {}
tolerations: []
affinity: {}

# Custom application configuration
app:
  welcomeMessage: "Hello from Helm!"
  backgroundColor: "#0f172a"
EOF
```

### Add a ConfigMap template

```bash
cat > mywebapp/templates/configmap.yaml << 'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ include "mywebapp.fullname" . }}-config
  labels:
    {{- include "mywebapp.labels" . | nindent 4 }}
data:
  WELCOME_MESSAGE: {{ .Values.app.welcomeMessage | quote }}
  BACKGROUND_COLOR: {{ .Values.app.backgroundColor | quote }}
  index.html: |
    <!DOCTYPE html>
    <html>
    <head>
      <title>{{ include "mywebapp.fullname" . }}</title>
      <style>
        body { font-family: sans-serif; background: {{ .Values.app.backgroundColor }}; color: #e2e8f0;
               display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
        .card { background: #1e293b; padding: 3rem; border-radius: 1rem; border: 1px solid #334155; text-align: center; max-width: 500px; }
        h1 { color: #38bdf8; font-size: 2.5rem; }
        .badge { background: #0f172a; padding: 4px 12px; border-radius: 9999px; font-family: monospace; font-size: 0.875rem; color: #94a3b8; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>⛵ {{ .Values.app.welcomeMessage }}</h1>
        <p>Release: <span class="badge">{{ .Release.Name }}</span></p>
        <p>Namespace: <span class="badge">{{ .Release.Namespace }}</span></p>
        <p>Chart: <span class="badge">{{ .Chart.Name }}-{{ .Chart.Version }}</span></p>
        <p>Replicas: <span class="badge">{{ .Values.replicaCount }}</span></p>
      </div>
    </body>
    </html>
EOF
```

### Update the Deployment to use the ConfigMap

Update the deployment template to mount the HTML from the ConfigMap:

```bash
# Find the volumeMounts and volumes sections in templates/deployment.yaml
# Add these (inside the containers[0] section and at spec level):

cat >> mywebapp/templates/deployment.yaml << 'PATCH'
# NOTE: Instead of manually patching, let's regenerate the deployment.yaml
PATCH

cat > mywebapp/templates/deployment.yaml << 'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "mywebapp.fullname" . }}
  labels:
    {{- include "mywebapp.labels" . | nindent 4 }}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "mywebapp.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      annotations:
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
        {{- with .Values.podAnnotations }}
        {{- toYaml . | nindent 8 }}
        {{- end }}
      labels:
        {{- include "mywebapp.selectorLabels" . | nindent 8 }}
        {{- with .Values.podLabels }}
        {{- toYaml . | nindent 8 }}
        {{- end }}
    spec:
      {{- with .Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
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
              containerPort: {{ .Values.service.port }}
              protocol: TCP
          livenessProbe:
            {{- toYaml .Values.livenessProbe | nindent 12 }}
          readinessProbe:
            {{- toYaml .Values.readinessProbe | nindent 12 }}
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
          volumeMounts:
            - name: html
              mountPath: /usr/share/nginx/html
      volumes:
        - name: html
          configMap:
            name: {{ include "mywebapp.fullname" . }}-config
            items:
              - key: index.html
                path: index.html
      {{- with .Values.nodeSelector }}
      nodeSelector:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.affinity }}
      affinity:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.tolerations }}
      tolerations:
        {{- toYaml . | nindent 8 }}
      {{- end }}
EOF
```

---

## Step 4: Lint and Preview

```bash
# Check for errors
helm lint ./mywebapp

# Preview the rendered templates
helm template my-lab ./mywebapp

# Preview with custom values
helm template my-lab ./mywebapp --set app.welcomeMessage="Custom message!" --set replicaCount=1
```

---

## Step 5: Install the Chart

```bash
# Create a namespace for the lab
kubectl create namespace helm-lab

# Install
helm install my-webapp ./mywebapp \
  --namespace helm-lab \
  --set app.welcomeMessage="My First Helm Release!"

# Check status
helm status my-webapp -n helm-lab
helm list -n helm-lab
```

---

## Step 6: Access the Application

```bash
# Port-forward the service
kubectl port-forward service/my-webapp-mywebapp 8080:80 -n helm-lab &

curl http://localhost:8080
# You should see your custom HTML with the welcome message
```

---

## Step 7: Upgrade the Release

```bash
# Upgrade with a new message
helm upgrade my-webapp ./mywebapp \
  --namespace helm-lab \
  --set app.welcomeMessage="Updated with Helm Upgrade!" \
  --set app.backgroundColor="#1a1a2e"

# Verify the upgrade
helm history my-webapp -n helm-lab
# REVISION  STATUS     DESCRIPTION
# 1         superseded Install complete
# 2         deployed   Upgrade complete

# See the updated page
curl http://localhost:8080
```

---

## Step 8: Roll Back

```bash
# Roll back to revision 1
helm rollback my-webapp 1 -n helm-lab

# Check the history
helm history my-webapp -n helm-lab
# REVISION  STATUS     DESCRIPTION
# 1         superseded Install complete
# 2         superseded Upgrade complete
# 3         deployed   Rollback to 1

# Verify the original message is back
curl http://localhost:8080
```

---

## Step 9: Get the Deployed Values

```bash
# See what values are in effect for the current release
helm get values my-webapp -n helm-lab

# Including all defaults
helm get values my-webapp -n helm-lab --all
```

---

## Step 10: Package the Chart

```bash
# Package for sharing / uploading to a chart repository
helm package ./mywebapp
# Creates: mywebapp-0.1.0.tgz

# You can install directly from the package
helm install test-install mywebapp-0.1.0.tgz \
  --namespace helm-lab
```

---

## Cleanup

```bash
# Kill the port-forward
kill %1 2>/dev/null

# Uninstall the release (removes all Kubernetes resources)
helm uninstall my-webapp -n helm-lab
helm uninstall test-install -n helm-lab 2>/dev/null

# Remove the namespace
kubectl delete namespace helm-lab

# Remove the package
rm -f mywebapp-0.1.0.tgz
```

---

## Bonus: Real-World Chart Structure

Look at a real production chart for inspiration:

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update

# Pull the nginx chart to study its structure
helm pull bitnami/nginx --untar
ls nginx/
ls nginx/templates/
```

---

## Key Takeaways

- `helm create` generates a best-practices chart skeleton
- **`values.yaml`** defines the configurable interface of your chart
- **Templates** use Go template syntax — `{{ .Values.X }}`, `{{- include "helper" . | nindent N }}`
- `helm lint` and `helm template` catch errors before deployment
- `helm upgrade --install` is idempotent — install if not present, upgrade if it is
- `helm rollback` makes revision management as easy as `git revert`
- The `checksum/config` annotation pattern triggers pod restarts when ConfigMaps change

# ConfigMaps and Secrets

## Configuration Separation

Modern applications follow the [12-factor methodology](https://12factor.net/config): **configuration should be separated from code**. You don't want database passwords baked into your container image — then every environment change requires a rebuild.

Kubernetes provides two objects for externalising configuration:

| Object | Purpose | Sensitive? | Encoded? |
|--------|---------|-----------|---------|
| **ConfigMap** | Non-sensitive configuration | No | No |
| **Secret** | Sensitive data (passwords, tokens, keys) | Yes | Base64 (not encrypted by default) |

---

## ConfigMaps

### Creating ConfigMaps

```bash
# ─── Imperative ────────────────────────────────────────────────────────────

# From literal values
kubectl create configmap app-config \
  --from-literal=DATABASE_HOST=postgres \
  --from-literal=DATABASE_PORT=5432 \
  --from-literal=LOG_LEVEL=info

# From a file (key = filename, value = file contents)
kubectl create configmap nginx-config \
  --from-file=nginx.conf

# From a directory (one key per file)
kubectl create configmap app-configs \
  --from-file=configs/

# From an env file (KEY=VALUE format)
kubectl create configmap env-config \
  --from-env-file=.env.production
```

```yaml
# ─── Declarative (preferred) ───────────────────────────────────────────────
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: production
data:
  # Simple key-value pairs
  DATABASE_HOST: "postgres.data.svc.cluster.local"
  DATABASE_PORT: "5432"
  LOG_LEVEL: "info"
  MAX_WORKERS: "4"

  # Multi-line values (e.g., config files)
  nginx.conf: |
    server {
      listen 80;
      server_name _;
      location / {
        proxy_pass http://app:3000;
        proxy_set_header Host $host;
      }
    }

  app.properties: |
    spring.datasource.url=jdbc:postgresql://postgres:5432/mydb
    spring.jpa.hibernate.ddl-auto=validate
```

### Using ConfigMaps in Pods

#### Method 1: Environment Variables (individual keys)

```yaml
spec:
  containers:
  - name: app
    image: my-app:1.0
    env:
    - name: DATABASE_HOST
      valueFrom:
        configMapKeyRef:
          name: app-config
          key: DATABASE_HOST
    - name: LOG_LEVEL
      valueFrom:
        configMapKeyRef:
          name: app-config
          key: LOG_LEVEL
```

#### Method 2: envFrom (inject all keys at once)

```yaml
spec:
  containers:
  - name: app
    image: my-app:1.0
    envFrom:
    - configMapRef:
        name: app-config
    # Every key in the ConfigMap becomes an environment variable
    # DATABASE_HOST=postgres, DATABASE_PORT=5432, LOG_LEVEL=info ...
```

#### Method 3: Volume Mount (as files)

```yaml
spec:
  containers:
  - name: nginx
    image: nginx:alpine
    volumeMounts:
    - name: nginx-conf
      mountPath: /etc/nginx/conf.d
      readOnly: true

    # Mount a specific key as a file
    - name: app-settings
      mountPath: /etc/app/settings.properties
      subPath: app.properties  # Only mount this key

  volumes:
  - name: nginx-conf
    configMap:
      name: nginx-config
      items:
      - key: nginx.conf
        path: default.conf       # Rename the key to this filename
        mode: 0644               # File permissions

  - name: app-settings
    configMap:
      name: app-config
```

> **Hot reload:** When a ConfigMap is mounted as a volume, Kubernetes **automatically updates** the mounted files when the ConfigMap changes (within ~60s, via the sync period). Environment variables do **not** update dynamically — a Pod restart is required.

---

## Secrets

Secrets store sensitive data. They are base64-encoded in etcd by default — this is **not encryption**, just encoding for binary compatibility.

> **For true encryption at rest:** Enable [EncryptionConfiguration](https://kubernetes.io/docs/tasks/administer-cluster/encrypt-data/) in the API server, or use an external secrets manager (HashiCorp Vault, AWS Secrets Manager, Azure Key Vault) with a CSI driver.

### Creating Secrets

```bash
# ─── Imperative ────────────────────────────────────────────────────────────

# Generic (opaque) secret
kubectl create secret generic db-secret \
  --from-literal=username=dbadmin \
  --from-literal=password='S3cr3t!P@ssw0rd'

# From a file (e.g., TLS private key)
kubectl create secret generic tls-key \
  --from-file=tls.key=./certs/server.key

# TLS secret (cert + key)
kubectl create secret tls my-tls-cert \
  --cert=./certs/tls.crt \
  --key=./certs/tls.key

# Docker registry credentials
kubectl create secret docker-registry regcred \
  --docker-server=registry.company.com \
  --docker-username=myuser \
  --docker-password=mypassword \
  --docker-email=me@company.com
```

```yaml
# ─── Declarative ───────────────────────────────────────────────────────────
apiVersion: v1
kind: Secret
metadata:
  name: db-secret
type: Opaque  # Generic secret (other types: kubernetes.io/tls, kubernetes.io/dockerconfigjson)
stringData:
  # Use stringData to provide plain text — Kubernetes base64-encodes it for you
  username: "dbadmin"
  password: "S3cr3t!P@ssw0rd"
  connection-url: "postgres://dbadmin:S3cr3t!P@ssw0rd@postgres:5432/mydb"
```

> **Never commit Secrets to Git** — even base64-encoded values are trivially decodable. Use a secrets management tool like [Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets), [External Secrets Operator](https://external-secrets.io/), or [Vault Agent](https://developer.hashicorp.com/vault/docs/agent).

### Using Secrets in Pods

#### As Environment Variables

```yaml
spec:
  containers:
  - name: app
    image: my-app:1.0
    env:
    - name: DB_PASSWORD
      valueFrom:
        secretKeyRef:
          name: db-secret
          key: password
    # All keys at once:
    envFrom:
    - secretRef:
        name: db-secret
```

#### As Files (Volume Mount)

```yaml
spec:
  containers:
  - name: app
    image: my-app:1.0
    volumeMounts:
    - name: db-credentials
      mountPath: /run/secrets/db
      readOnly: true

  volumes:
  - name: db-credentials
    secret:
      secretName: db-secret
      defaultMode: 0400  # Read-only to owner only

# Inside the pod:
# /run/secrets/db/username  → "dbadmin"
# /run/secrets/db/password  → "S3cr3t!P@ssw0rd"
# /run/secrets/db/connection-url → "postgres://..."
```

#### For Private Image Pulls

```yaml
spec:
  imagePullSecrets:
  - name: regcred   # Created with kubectl create secret docker-registry
  containers:
  - name: app
    image: registry.company.com/my-private-app:1.0
```

---

## Practical Example: Full App Configuration

```yaml
# ─── ConfigMap: non-sensitive config ───────────────────────────────────────
apiVersion: v1
kind: ConfigMap
metadata:
  name: webapp-config
data:
  APP_ENV: "production"
  LOG_LEVEL: "warn"
  MAX_CONNECTIONS: "100"
  ALLOWED_ORIGINS: "https://example.com,https://app.example.com"
---
# ─── Secret: sensitive data ────────────────────────────────────────────────
apiVersion: v1
kind: Secret
metadata:
  name: webapp-secrets
type: Opaque
stringData:
  DATABASE_URL: "postgres://user:pass@postgres:5432/webapp"
  JWT_SECRET: "a-very-long-random-string-32-chars-min"
  STRIPE_API_KEY: "sk_live_xxxxxxxxxxxx"
---
# ─── Deployment using both ─────────────────────────────────────────────────
apiVersion: apps/v1
kind: Deployment
metadata:
  name: webapp
spec:
  replicas: 3
  selector:
    matchLabels:
      app: webapp
  template:
    metadata:
      labels:
        app: webapp
    spec:
      containers:
      - name: webapp
        image: webapp:2.0
        ports:
        - containerPort: 3000
        # Non-sensitive config from ConfigMap
        envFrom:
        - configMapRef:
            name: webapp-config
        # Sensitive config from Secret
        envFrom:
        - secretRef:
            name: webapp-secrets
        # Kubernetes injects all keys as env vars:
        # APP_ENV, LOG_LEVEL, DATABASE_URL, JWT_SECRET, etc.
```

---

## Managing ConfigMaps and Secrets

```bash
# View ConfigMap
kubectl get configmap app-config
kubectl describe configmap app-config
kubectl get configmap app-config -o yaml

# Edit ConfigMap (changes auto-propagate to volume mounts)
kubectl edit configmap app-config

# View Secret (values are base64-encoded)
kubectl get secret db-secret -o yaml

# Decode a Secret value
kubectl get secret db-secret -o jsonpath='{.data.password}' | base64 -d

# Delete
kubectl delete configmap app-config
kubectl delete secret db-secret
```

---

## Best Practices

### 1. Separate by Environment

Use namespaces to isolate configs:
```bash
kubectl apply -f app-config.yaml -n development
kubectl apply -f app-config.yaml -n production  # Different values, same structure
```

### 2. Use Immutable ConfigMaps/Secrets for Performance

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config-v2
immutable: true   # Cannot be modified — only deleted and recreated
data:
  VERSION: "2.0.0"
```

Immutable ConfigMaps/Secrets reduce API server load (Kubernetes doesn't need to watch them).

### 3. Reference ConfigMaps in Deployments

Trigger rolling updates when a ConfigMap changes by using a hash annotation:

```bash
# Generate a hash of the ConfigMap and add it to the pod template annotation
CONFIGMAP_HASH=$(kubectl get configmap app-config -o yaml | sha256sum | cut -d' ' -f1)
kubectl patch deployment webapp -p "{\"spec\":{\"template\":{\"metadata\":{\"annotations\":{\"configmap-hash\":\"$CONFIGMAP_HASH\"}}}}}"
```

This causes a rolling restart when the ConfigMap content changes.

---

## Try It Yourself

```bash
# 1. Create a ConfigMap and Secret
kubectl create configmap demo-config \
  --from-literal=MESSAGE="Hello from ConfigMap" \
  --from-literal=COLOR=blue

kubectl create secret generic demo-secret \
  --from-literal=API_KEY=my-secret-key-12345

# 2. Create a Pod that uses them
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: config-demo
spec:
  containers:
  - name: app
    image: alpine:3.19
    command: ['sh', '-c', 'echo "Message: $MESSAGE, Color: $COLOR, Key: $API_KEY" && sleep 3600']
    envFrom:
    - configMapRef:
        name: demo-config
    - secretRef:
        name: demo-secret
EOF

# 3. Check the environment variables
kubectl exec config-demo -- env | grep -E "MESSAGE|COLOR|API_KEY"

# 4. Update the ConfigMap
kubectl patch configmap demo-config -p '{"data":{"MESSAGE":"Updated message!"}}'

# 5. Restart the pod to pick up env var changes
kubectl delete pod config-demo
# Re-create it, then check again

# 6. Clean up
kubectl delete pod config-demo
kubectl delete configmap demo-config
kubectl delete secret demo-secret
```

---

## Key Takeaways

- **ConfigMaps** hold non-sensitive config; **Secrets** hold sensitive data
- Secrets are only base64-encoded by default — use EncryptionConfiguration or an external vault for real security
- Inject config as **environment variables** (simple) or **volume mounts** (supports hot reload)
- Volume-mounted ConfigMaps **update automatically** when the ConfigMap changes
- Environment variables from ConfigMaps/Secrets require a **Pod restart** to update
- Never commit Secret YAML with real credentials to version control
- Consider tools like **External Secrets Operator** or **Vault** to sync secrets from external systems into Kubernetes Secrets

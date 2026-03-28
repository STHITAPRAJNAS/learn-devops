# Introduction to Helm

## What Problem Does Helm Solve?

Imagine deploying a microservice to Kubernetes. You need multiple YAML manifests:

- `deployment.yaml` — run the app
- `service.yaml` — expose the app
- `configmap.yaml` — non-sensitive config
- `secret.yaml` — sensitive config
- `ingress.yaml` — external routing
- `hpa.yaml` — autoscaling
- `serviceaccount.yaml` — RBAC

That's 7 files for one service. You have 20 services. And three environments (dev, staging, prod) each with different replica counts, resource limits, and hostnames.

Managing this as raw YAML is painful:
- **Copy-paste errors** — you'll forget to change a namespace or image tag
- **No version history** — which manifest was deployed to prod?
- **No rollback** — how do you undo a broken deployment?
- **Duplication** — 95% of your dev and prod manifests are identical

**Helm** solves this by treating Kubernetes applications as **packages** (charts) with:
- Parameterised templates (no copy-paste)
- Versioned releases
- One-command rollback
- A shared chart repository ecosystem (like npm for Kubernetes)

> Helm is often called "the package manager for Kubernetes."

---

## Helm Architecture

```
┌──────────────────┐        ┌────────────────────────────────┐
│   Helm CLI       │        │       Kubernetes Cluster        │
│                  │        │                                  │
│  helm install    │◄──────►│  API Server                      │
│  helm upgrade    │        │                                  │
│  helm rollback   │        │  ┌─────────────────────────────┐ │
│  helm uninstall  │        │  │  Release metadata (Secrets) │ │
│                  │        │  └─────────────────────────────┘ │
└──────────────────┘        │                                  │
         │                  │  ┌────────────────────────────┐  │
         │                  │  │  Deployed Resources:        │  │
         ▼                  │  │  - Deployments              │  │
┌──────────────────┐        │  │  - Services                 │  │
│  Chart Registry  │        │  │  - ConfigMaps               │  │
│                  │        │  │  - Ingresses ...            │  │
│  - Artifact Hub  │        │  └────────────────────────────┘  │
│  - OCI registry  │        └────────────────────────────────────┘
│  - Local charts  │
└──────────────────┘
```

### Key Concepts

| Term | Definition |
|------|-----------|
| **Chart** | A package containing templated Kubernetes manifests + default values |
| **Release** | A specific deployment of a chart in a cluster. One chart = many releases. |
| **Repository** | A collection of charts (like npm registry) |
| **Values** | Configuration that customises a chart at install/upgrade time |
| **Revision** | A numbered snapshot of a release. Helm keeps history for rollback. |

---

## Helm 2 vs Helm 3

If you see references to "Tiller" — that's Helm 2. **Always use Helm 3.**

| Feature | Helm 2 | Helm 3 |
|---------|--------|--------|
| Server component | Tiller pod (required cluster-admin) | None — talks to API directly |
| Release storage | Tiller (ConfigMaps in kube-system) | Secrets in release namespace |
| Security | Tiller had full cluster access | Uses your kubeconfig permissions |
| CRD handling | Manual | Built-in |
| Release namespacing | Global | Per-namespace |

---

## Installing Helm

```bash
# macOS
brew install helm

# Linux
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Windows (Chocolatey)
choco install kubernetes-helm

# Verify
helm version
# version.BuildInfo{Version:"v3.14.0", ...}
```

---

## Essential Helm Commands

### Repositories

```bash
# Add a chart repository
helm repo add stable https://charts.helm.sh/stable
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx

# List repositories
helm repo list

# Update repository indexes (like apt-get update)
helm repo update

# Search for charts
helm search repo nginx
helm search repo postgres --versions
helm search hub wordpress   # Search Artifact Hub (public)
```

### Installing Charts

```bash
# Install a chart with a release name
helm install my-release bitnami/postgresql

# Install in a specific namespace (create if it doesn't exist)
helm install my-postgres bitnami/postgresql \
  --namespace data \
  --create-namespace

# Override default values
helm install my-nginx ingress-nginx/ingress-nginx \
  --set controller.replicaCount=2 \
  --set controller.service.type=LoadBalancer

# Override with a values file (preferred for many overrides)
helm install my-app ./my-chart \
  -f values-production.yaml \
  -f values-secrets.yaml     # Multiple -f flags, last one wins for conflicts

# Dry run (render templates, don't apply)
helm install my-app ./my-chart --dry-run

# Install with wait (blocks until all resources are ready)
helm install my-app ./my-chart --wait --timeout 5m
```

### Viewing Releases

```bash
# List all releases in current namespace
helm list

# List in all namespaces
helm list --all-namespaces

# Show release details
helm status my-release

# Get the values used for a release
helm get values my-release
helm get values my-release --all  # Including defaults

# Get the manifest (rendered YAML) of a release
helm get manifest my-release

# Release history
helm history my-release
```

### Upgrading

```bash
# Upgrade to a new chart version or with new values
helm upgrade my-release bitnami/postgresql \
  --set auth.postgresPassword=newpassword

# Upgrade and reset values to defaults
helm upgrade my-release bitnami/postgresql \
  --reset-values \
  -f new-values.yaml

# Install if not exists, upgrade if exists (idempotent)
helm upgrade --install my-release bitnami/postgresql \
  -f values.yaml

# Upgrade with rollback on failure
helm upgrade my-release ./my-chart \
  --atomic \
  --timeout 5m
```

### Rollback

```bash
# Roll back to the previous revision
helm rollback my-release

# Roll back to a specific revision
helm rollback my-release 3

# View history before rollback
helm history my-release
# REVISION  STATUS      CHART         APP VERSION  DESCRIPTION
# 1         superseded  my-app-1.0.0  2.3.1        Install complete
# 2         superseded  my-app-1.1.0  2.4.0        Upgrade complete
# 3         failed      my-app-1.2.0  2.5.0        Upgrade failed
# 4         deployed    my-app-1.1.0  2.4.0        Rollback to 2     ← after rollback
```

### Uninstalling

```bash
# Uninstall a release (deletes all Kubernetes resources)
helm uninstall my-release

# Keep history (so you can rollback later)
helm uninstall my-release --keep-history

# Then restore:
helm rollback my-release 2
```

---

## Quick Start: Deploy PostgreSQL

```bash
# Add Bitnami repo
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update

# Install PostgreSQL
helm install my-postgres bitnami/postgresql \
  --namespace database \
  --create-namespace \
  --set auth.postgresPassword=devpassword \
  --set auth.database=myapp \
  --set primary.persistence.size=5Gi

# Wait for it to be ready
helm status my-postgres -n database
kubectl get pods -n database --watch

# Connect to it
kubectl run pg-client --rm --tty -i \
  --restart='Never' \
  --namespace database \
  --image docker.io/bitnami/postgresql:16 \
  --env="PGPASSWORD=devpassword" \
  --command -- psql --host my-postgres-postgresql -U postgres -d myapp -p 5432

# Clean up
helm uninstall my-postgres -n database
kubectl delete namespace database
```

---

## Inspecting a Chart Before Installing

```bash
# Show chart metadata and README
helm show chart bitnami/postgresql
helm show readme bitnami/postgresql

# Show all default values
helm show values bitnami/postgresql

# Save defaults to a file to start customising
helm show values bitnami/postgresql > my-postgres-values.yaml
```

---

## Try It Yourself

```bash
# 1. Set up repositories
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update

# 2. Search for Redis
helm search repo redis

# 3. Inspect the chart
helm show values bitnami/redis | head -50

# 4. Install Redis with custom values
helm install my-redis bitnami/redis \
  --set auth.enabled=false \
  --set replica.replicaCount=1 \
  --namespace cache \
  --create-namespace

# 5. Check the release
helm list -n cache
helm status my-redis -n cache

# 6. Get the install instructions
helm status my-redis -n cache
# (Helm prints NOTES.txt — instructions for how to use this release)

# 7. Connect to Redis
kubectl run redis-client --rm --tty -i \
  --restart='Never' \
  --namespace cache \
  --image docker.io/bitnami/redis:7.2 \
  --command -- redis-cli -h my-redis-master

# 8. Clean up
helm uninstall my-redis -n cache
kubectl delete namespace cache
```

---

## Key Takeaways

- Helm is a **package manager** for Kubernetes — charts are packages, releases are deployments
- Helm 3 (no Tiller) uses your `kubeconfig` credentials and stores releases as Kubernetes Secrets
- A **chart** is a reusable template; a **release** is a specific installation of it
- `helm upgrade --install` is idempotent — great for CI/CD pipelines
- `helm rollback` reverts to a previous revision in seconds
- Always `helm show values <chart>` before installing — understand the defaults

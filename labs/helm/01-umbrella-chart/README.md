# Lab: Build an Umbrella Helm Chart

**Difficulty:** Advanced
**Time:** 60 minutes
**Prerequisites:** Helm 3.x, running Kubernetes cluster

## Objective

Package a 3-tier app (frontend + backend + PostgreSQL) as a single umbrella Helm chart with:
- Dependency management
- Environment-specific values
- Pre-upgrade database migration hook
- Chart tests

## Step 1: Initialize the Chart

```bash
helm create platform
cd platform
rm -rf templates/*   # start fresh
```

## Step 2: Configure Dependencies

```bash
cat > Chart.yaml << 'EOF'
apiVersion: v2
name: platform
description: Full-stack platform umbrella chart
type: application
version: 0.1.0
appVersion: "1.0.0"
dependencies:
- name: postgresql
  version: "13.0.0"
  repository: "https://charts.bitnami.com/bitnami"
  condition: postgresql.enabled
EOF

helm dependency update .
# Downloads postgresql chart into charts/ directory
```

## Step 3: Add Application Templates

```bash
# Create your app templates
kubectl apply --dry-run=client -f - << 'EOF'
# (use the provided templates/ YAML files)
EOF
```

## Step 4: Deploy with Different Environments

```bash
# Development
helm upgrade --install platform . \
  -f values.yaml \
  -f values-dev.yaml \
  --namespace dev \
  --create-namespace

# Production
helm upgrade --install platform . \
  -f values.yaml \
  -f values-production.yaml \
  --namespace production \
  --create-namespace \
  --atomic \
  --wait

# Preview what would change
helm diff upgrade platform . -f values-production.yaml -n production
```

## Step 5: Run Chart Tests

```bash
helm test platform -n dev
# Look for: PASSED: platform-connection-test
```

## Step 6: Package and Push to OCI Registry

```bash
helm package .
helm push platform-0.1.0.tgz oci://registry.example.com/helm

# Install from registry
helm install platform oci://registry.example.com/helm/platform --version 0.1.0
```

## Step 7: Rollback

```bash
helm history platform -n production
helm rollback platform 1 -n production --wait
```

## Challenge

1. Add a `post-upgrade` hook that sends a Slack notification
2. Add a `values.schema.json` that enforces required fields
3. Create a `NOTES.txt` that prints the application URL after install

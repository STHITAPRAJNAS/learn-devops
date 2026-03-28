# GitOps with ArgoCD

## What is GitOps?

GitOps applies Git as the single source of truth for both application code and infrastructure:
- **Declarative**: desired state is stored in Git
- **Automated**: a controller continuously reconciles actual ↔ desired state
- **Auditable**: every change has a Git commit — full history, easy rollback
- **Pull-based**: cluster pulls from Git (no credentials pushed into CI)

```
Developer pushes code
    │
    ▼
CI Pipeline builds image, updates manifest/values in Git
    │
    ▼
ArgoCD detects drift (Git vs cluster)
    │
    ▼
ArgoCD applies changes to cluster
    │
    ▼
Cluster matches Git exactly
```

---

## ArgoCD Installation

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# HA installation (production)
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/ha/install.yaml

# Access UI
kubectl port-forward svc/argocd-server -n argocd 8080:443

# Get initial password
argocd admin initial-password -n argocd
argocd login localhost:8080
```

---

## Application CRD

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: my-api
  namespace: argocd
  finalizers:
  - resources-finalizer.argocd.argoproj.io   # cascade delete on app removal
spec:
  project: production
  source:
    repoURL: https://github.com/example/k8s-manifests.git
    targetRevision: main
    path: apps/my-api/overlays/production   # Kustomize overlay
    # OR for Helm:
    # chart: my-api
    # repoURL: oci://registry.example.com/helm
    # targetRevision: "2.1.0"
    # helm:
    #   valueFiles:
    #   - values.yaml
    #   - values-production.yaml
    #   parameters:
    #   - name: image.tag
    #     value: "abc123"
  destination:
    server: https://kubernetes.default.svc   # in-cluster
    namespace: production
  syncPolicy:
    automated:
      prune: true      # delete resources removed from Git
      selfHeal: true   # revert manual changes to cluster
      allowEmpty: false
    syncOptions:
    - CreateNamespace=true
    - PrunePropagationPolicy=foreground
    - ApplyOutOfSyncOnly=true   # only apply changed resources
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
  revisionHistoryLimit: 10
  ignoreDifferences:
  - group: apps
    kind: Deployment
    jsonPointers:
    - /spec/replicas   # ignore replica count (managed by HPA)
```

---

## AppProject — Multi-Tenancy & RBAC

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AppProject
metadata:
  name: team-alpha
  namespace: argocd
spec:
  description: "Team Alpha production apps"

  # Which Git repos are allowed as sources
  sourceRepos:
  - "https://github.com/example/k8s-manifests.git"
  - "oci://registry.example.com/helm"

  # Which clusters and namespaces can be deployed to
  destinations:
  - server: https://kubernetes.default.svc
    namespace: team-alpha-*       # wildcard namespace pattern
  - server: https://prod-cluster.example.com
    namespace: production

  # What Kubernetes resources can be managed
  clusterResourceWhitelist:
  - group: ""
    kind: Namespace
  namespaceResourceBlacklist:
  - group: ""
    kind: ResourceQuota   # teams can't change their own quotas

  # RBAC for project
  roles:
  - name: developer
    description: "Deploy apps, read logs"
    policies:
    - p, proj:team-alpha:developer, applications, get, team-alpha/*, allow
    - p, proj:team-alpha:developer, applications, sync, team-alpha/*, allow
    groups:
    - github-org:team-alpha-devs
  - name: admin
    description: "Full project control"
    policies:
    - p, proj:team-alpha:admin, applications, *, team-alpha/*, allow
    groups:
    - github-org:team-alpha-leads

  # Sync windows — prevent deployments during business hours on Friday
  syncWindows:
  - kind: deny
    schedule: "0 15 * * 5"   # Fridays at 3pm UTC
    duration: 9h
    applications:
    - "*"
    manualSync: false   # still allow manual sync in emergency
```

---

## ApplicationSet — Generate Apps Automatically

ApplicationSet generates multiple Applications from a single template.

**Git directory generator (one app per directory):**
```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: cluster-addons
  namespace: argocd
spec:
  generators:
  - git:
      repoURL: https://github.com/example/k8s-manifests.git
      revision: main
      directories:
      - path: cluster-addons/*
  template:
    metadata:
      name: "{{path.basename}}"
    spec:
      project: platform
      source:
        repoURL: https://github.com/example/k8s-manifests.git
        targetRevision: main
        path: "{{path}}"
      destination:
        server: https://kubernetes.default.svc
        namespace: "{{path.basename}}"
      syncPolicy:
        automated:
          prune: true
          selfHeal: true
```

**Matrix generator (app × environment):**
```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: microservices
  namespace: argocd
spec:
  generators:
  - matrix:
      generators:
      - list:
          elements:
          - service: frontend
            chart: frontend
            chartVersion: "1.2.0"
          - service: backend
            chart: backend
            chartVersion: "2.1.0"
          - service: worker
            chart: worker
            chartVersion: "1.0.0"
      - list:
          elements:
          - env: staging
            cluster: https://staging.k8s.example.com
            values: values-staging.yaml
          - env: production
            cluster: https://prod.k8s.example.com
            values: values-production.yaml
  template:
    metadata:
      name: "{{service}}-{{env}}"
    spec:
      project: microservices
      source:
        repoURL: oci://registry.example.com/helm
        chart: "{{chart}}"
        targetRevision: "{{chartVersion}}"
        helm:
          valueFiles:
          - "{{values}}"
      destination:
        server: "{{cluster}}"
        namespace: "{{service}}"
      syncPolicy:
        automated:
          prune: true
          selfHeal: true
```

---

## Image Updater — Automatic Image Promotion

```bash
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj-labs/argocd-image-updater/stable/manifests/install.yaml
```

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: my-api
  namespace: argocd
  annotations:
    # Auto-update to latest semver patch release
    argocd-image-updater.argoproj.io/image-list: api=registry.example.com/my-api
    argocd-image-updater.argoproj.io/api.update-strategy: semver
    argocd-image-updater.argoproj.io/api.allow-tags: regexp:^v[0-9]+\.[0-9]+\.[0-9]+$
    # Write new tag back to Git (not just in-cluster)
    argocd-image-updater.argoproj.io/write-back-method: git
    argocd-image-updater.argoproj.io/git-branch: main
```

---

## Promotion Workflow (Dev → Staging → Prod)

```
┌─────────────┐    CI builds image    ┌─────────────────────────────┐
│  Git commit  │ ──────────────────► │  registry.example.com/api:  │
│  (app code)  │                     │  sha-abc123                  │
└─────────────┘                      └─────────────────────────────┘
                                               │
                                    CI updates dev manifests
                                               │
                                               ▼
                                    ┌─────────────────┐
                                    │   Dev cluster    │
                                    │  (auto-sync)     │
                                    └─────────────────┘
                                               │
                                    Manual PR: promote to staging
                                               │
                                               ▼
                                    ┌─────────────────┐
                                    │ Staging cluster  │
                                    │  (auto-sync)     │
                                    └─────────────────┘
                                               │
                                    Manual approval + PR
                                               │
                                               ▼
                                    ┌─────────────────┐
                                    │  Prod cluster    │
                                    │  (manual sync +  │
                                    │   sync window)   │
                                    └─────────────────┘
```

---

## Notifications

```yaml
# Notify Slack on sync failure or degraded health
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-notifications-cm
  namespace: argocd
data:
  service.slack: |
    token: $slack-token
  template.app-sync-failed: |
    message: |
      :red_circle: Application *{{.app.metadata.name}}* sync failed.
      *Error:* {{range .app.status.conditions}}{{.message}}{{end}}
      *Revision:* {{.app.status.sync.revision}}
  trigger.on-sync-failed: |
    - when: app.status.operationState.phase in ['Error', 'Failed']
      send: [app-sync-failed]
  subscriptions: |
    - recipients:
      - slack:#argocd-alerts
      triggers:
      - on-sync-failed
      - on-health-degraded
```

---

## Useful CLI Commands

```bash
# List all apps
argocd app list

# Sync an app (manual)
argocd app sync my-api --prune

# Check app health
argocd app get my-api

# Rollback
argocd app rollback my-api 3   # roll back to history entry 3

# Diff (what would change)
argocd app diff my-api

# Force hard refresh (bypass cache)
argocd app get my-api --hard-refresh

# Terminate a running sync
argocd app terminate-op my-api
```

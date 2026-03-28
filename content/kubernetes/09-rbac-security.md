# RBAC, Security Hardening & Multi-Tenancy

## RBAC Architecture

```
Subject (User/Group/ServiceAccount)
    │
    ▼
RoleBinding / ClusterRoleBinding
    │
    ▼
Role / ClusterRole  →  [verbs] on [resources] in [apiGroups]
```

---

## Roles & ClusterRoles

```yaml
# Namespace-scoped Role
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: app-developer
  namespace: production
rules:
- apiGroups: ["apps"]
  resources: ["deployments", "replicasets"]
  verbs: ["get", "list", "watch", "create", "update", "patch"]
- apiGroups: [""]
  resources: ["pods", "pods/log", "pods/exec"]
  verbs: ["get", "list", "watch"]
- apiGroups: [""]
  resources: ["services", "configmaps"]
  verbs: ["get", "list", "watch", "create", "update"]
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get", "list"]   # read-only on secrets
---
# Cluster-wide ClusterRole
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: namespace-admin
rules:
- apiGroups: ["*"]
  resources: ["*"]
  verbs: ["*"]
- nonResourceURLs: ["/healthz", "/metrics"]
  verbs: ["get"]
```

**Bind to users/groups:**
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: dev-team-binding
  namespace: production
subjects:
- kind: User
  name: alice@example.com     # OIDC user
  apiGroup: rbac.authorization.k8s.io
- kind: Group
  name: dev-team              # OIDC group claim
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: Role
  name: app-developer
  apiGroup: rbac.authorization.k8s.io
```

**ServiceAccount RBAC (for in-cluster apps):**
```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: ci-deployer
  namespace: production
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789:role/k8s-ci-deployer  # AWS IRSA
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: deployer
  namespace: production
rules:
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get", "list", "update", "patch"]
- apiGroups: [""]
  resources: ["configmaps"]
  verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: ci-deployer-binding
  namespace: production
subjects:
- kind: ServiceAccount
  name: ci-deployer
  namespace: production
roleRef:
  kind: Role
  name: deployer
  apiGroup: rbac.authorization.k8s.io
```

---

## Pod Security Standards (replaces deprecated PodSecurityPolicy)

```yaml
# Apply at namespace level via label
apiVersion: v1
kind: Namespace
metadata:
  name: production
  labels:
    pod-security.kubernetes.io/enforce: restricted   # enforce restricted profile
    pod-security.kubernetes.io/warn: restricted
    pod-security.kubernetes.io/audit: restricted
```

**The three profiles:**
| Profile | Restriction Level |
|---|---|
| `privileged` | No restrictions |
| `baseline` | Prevents known privilege escalations |
| `restricted` | Hardened — follows security best practices |

**What `restricted` requires:**
```yaml
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    runAsGroup: 3000
    fsGroup: 2000
    seccompProfile:
      type: RuntimeDefault      # or Localhost with custom profile
  containers:
  - name: app
    securityContext:
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true
      capabilities:
        drop: ["ALL"]           # drop all Linux capabilities
        add: []                 # add only what's needed
    volumeMounts:
    - name: tmp
      mountPath: /tmp           # writable tmpfs for temp files
  volumes:
  - name: tmp
    emptyDir:
      medium: Memory            # RAM-backed tmpfs
```

---

## OPA Gatekeeper — Policy as Code

Gatekeeper enforces custom policies using Rego language, beyond what RBAC and PSS can express.

```bash
helm install gatekeeper gatekeeper/gatekeeper \
  --namespace gatekeeper-system \
  --create-namespace
```

**Constraint Template — require specific labels:**
```yaml
apiVersion: templates.gatekeeper.sh/v1
kind: ConstraintTemplate
metadata:
  name: requirelabels
spec:
  crd:
    spec:
      names:
        kind: RequireLabels
      validation:
        openAPIV3Schema:
          type: object
          properties:
            labels:
              type: array
              items:
                type: string
  targets:
  - target: admission.k8s.gatekeeper.sh
    rego: |
      package requirelabels

      violation[{"msg": msg}] {
        provided := {label | input.review.object.metadata.labels[label]}
        required := {label | label := input.parameters.labels[_]}
        missing := required - provided
        count(missing) > 0
        msg := sprintf("Missing required labels: %v", [missing])
      }
---
# Apply the constraint
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: RequireLabels
metadata:
  name: require-team-label
spec:
  match:
    kinds:
    - apiGroups: ["apps"]
      kinds: ["Deployment"]
    namespaces: ["production", "staging"]
  parameters:
    labels: ["team", "app", "version"]
```

**Block privileged containers:**
```yaml
apiVersion: templates.gatekeeper.sh/v1
kind: ConstraintTemplate
metadata:
  name: noprivileged
spec:
  crd:
    spec:
      names:
        kind: NoPrivileged
  targets:
  - target: admission.k8s.gatekeeper.sh
    rego: |
      package noprivileged
      violation[{"msg": msg}] {
        c := input.review.object.spec.containers[_]
        c.securityContext.privileged == true
        msg := sprintf("Container %v is privileged. Privileged containers are not allowed.", [c.name])
      }
---
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: NoPrivileged
metadata:
  name: no-privileged-containers
spec:
  match:
    kinds:
    - apiGroups: [""]
      kinds: ["Pod"]
```

---

## Multi-Tenancy

### Namespace-per-Team Pattern

```yaml
# Team namespace with resource quotas
apiVersion: v1
kind: Namespace
metadata:
  name: team-alpha
  labels:
    team: alpha
    pod-security.kubernetes.io/enforce: baseline
---
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-alpha-quota
  namespace: team-alpha
spec:
  hard:
    requests.cpu: "20"
    requests.memory: 40Gi
    limits.cpu: "40"
    limits.memory: 80Gi
    pods: "100"
    services: "20"
    persistentvolumeclaims: "20"
    services.loadbalancers: "2"
    services.nodeports: "0"     # no NodePort — use Ingress
---
apiVersion: v1
kind: LimitRange
metadata:
  name: team-alpha-limits
  namespace: team-alpha
spec:
  limits:
  - type: Container
    default:           # applied when not specified
      cpu: 500m
      memory: 512Mi
    defaultRequest:
      cpu: 100m
      memory: 128Mi
    max:
      cpu: "4"
      memory: 8Gi
    min:
      cpu: 50m
      memory: 64Mi
  - type: Pod
    max:
      cpu: "8"
      memory: 16Gi
```

### Hierarchical Namespace Controller (HNC)

Propagates RBAC, NetworkPolicies, and LimitRanges from parent → child namespaces:

```bash
kubectl apply -f https://github.com/kubernetes-sigs/hierarchical-namespaces/releases/download/v1.1.0/default.yaml
```

```yaml
# Create child namespace under team-alpha
apiVersion: hnc.x-k8s.io/v1alpha2
kind: SubnamespaceAnchor
metadata:
  name: team-alpha-dev
  namespace: team-alpha   # parent namespace
```

---

## Secrets Management

### External Secrets Operator (ESO)

Sync secrets from Vault / AWS Secrets Manager / GCP Secret Manager into Kubernetes Secrets:

```yaml
# SecretStore: how to authenticate with Vault
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: vault-backend
spec:
  provider:
    vault:
      server: "https://vault.example.com"
      path: "secret"
      version: "v2"
      auth:
        kubernetes:
          mountPath: "kubernetes"
          role: "k8s-production"
          serviceAccountRef:
            name: external-secrets-sa
---
# ExternalSecret: pull specific secret
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: database-credentials
  namespace: production
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  target:
    name: database-credentials   # K8s Secret name to create
    creationPolicy: Owner
    template:
      type: Opaque
      data:
        DATABASE_URL: "postgresql://{{ .username }}:{{ .password }}@postgres:5432/app"
  data:
  - secretKey: username
    remoteRef:
      key: production/database
      property: username
  - secretKey: password
    remoteRef:
      key: production/database
      property: password
```

### Sealed Secrets (GitOps-friendly)

```bash
# Install controller
helm install sealed-secrets sealed-secrets/sealed-secrets -n kube-system

# Seal a secret (encrypted, safe to commit to git)
kubectl create secret generic db-pass --from-literal=password=supersecret --dry-run=client -o yaml | \
  kubeseal --controller-name=sealed-secrets --format=yaml > sealed-db-pass.yaml

# Apply sealed secret (controller decrypts and creates real Secret)
kubectl apply -f sealed-db-pass.yaml
```

---

## Audit Logging

```yaml
# /etc/kubernetes/audit-policy.yaml (on API server)
apiVersion: audit.k8s.io/v1
kind: Policy
rules:
# Log all secret access at RequestResponse level
- level: RequestResponse
  resources:
  - group: ""
    resources: ["secrets"]
# Log pod exec/attach at Metadata level
- level: Metadata
  resources:
  - group: ""
    resources: ["pods/exec", "pods/attach", "pods/portforward"]
# Log auth failures
- level: Metadata
  omitStages:
  - RequestReceived
  users: ["system:anonymous"]
# Ignore noisy health checks
- level: None
  users: ["system:kube-proxy"]
  verbs: ["watch"]
  resources:
  - group: ""
    resources: ["endpoints", "services"]
# Default: log metadata only
- level: Metadata
```

---

## Key Hardening Checklist

```bash
# Check for dangerous RBAC bindings
kubectl get clusterrolebindings -o json | jq '.items[] | select(.roleRef.name=="cluster-admin") | .subjects'

# Scan for pods running as root
kubectl get pods -A -o json | jq '.items[] | select(.spec.securityContext.runAsNonRoot != true) | .metadata.name'

# Check for privileged containers
kubectl get pods -A -o json | jq '.items[].spec.containers[] | select(.securityContext.privileged == true) | .name'

# Find pods without resource limits
kubectl get pods -A -o json | jq '.items[] | select(.spec.containers[].resources.limits == null) | .metadata.name'

# Use kube-bench (CIS benchmarks)
kubectl apply -f https://raw.githubusercontent.com/aquasecurity/kube-bench/main/job.yaml
kubectl logs job/kube-bench
```

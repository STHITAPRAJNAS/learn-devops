# Deployments and ReplicaSets

## Why Deployments?

Pods are ephemeral — they don't self-heal if deleted. If you want 5 copies of your app running and one crashes, nothing brings it back unless something is watching.

That "something" is a **ReplicaSet** — it ensures N pod replicas are always running.

A **Deployment** wraps a ReplicaSet and adds:
- **Rolling updates** — update without downtime
- **Rollback** — undo a bad update with one command
- **Revision history** — see what changed and when
- **Pause/resume** — stage changes before rolling out

In production, you almost always create Deployments, not Pods or ReplicaSets directly.

---

## A Complete Deployment Manifest

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
  namespace: production
  labels:
    app: my-app
    version: "1.2.0"
spec:
  replicas: 3

  # Deployment finds Pods to manage using this selector
  selector:
    matchLabels:
      app: my-app

  # Rolling update configuration
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1   # At most 1 pod down at a time
      maxSurge: 1         # At most 1 extra pod above desired count

  # How long to wait for a new pod to start before marking rollout as failed
  progressDeadlineSeconds: 300

  # How many old ReplicaSets to keep (for rollback)
  revisionHistoryLimit: 5

  # Pod template
  template:
    metadata:
      labels:
        app: my-app         # Must match spec.selector.matchLabels
        version: "1.2.0"
    spec:
      containers:
      - name: app
        image: my-app:1.2.0
        ports:
        - containerPort: 3000
          name: http

        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "500m"

        env:
        - name: NODE_ENV
          value: "production"
        - name: PORT
          value: "3000"

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

      # Graceful shutdown: give the app 30s to finish current requests
      terminationGracePeriodSeconds: 30
```

---

## Deployment Commands

```bash
# ─── Create / Update ───────────────────────────────────────────────────────
kubectl apply -f deployment.yaml

# Imperative creation (quick testing)
kubectl create deployment nginx \
  --image=nginx:1.25-alpine \
  --replicas=3 \
  --port=80

# ─── Inspect ───────────────────────────────────────────────────────────────
kubectl get deployment my-app
kubectl get deployment my-app -o yaml
kubectl describe deployment my-app

# See the ReplicaSets managed by the deployment
kubectl get replicaset -l app=my-app

# See the Pods
kubectl get pods -l app=my-app

# ─── Scale ─────────────────────────────────────────────────────────────────
kubectl scale deployment my-app --replicas=5
kubectl scale deployment my-app --replicas=1

# Autoscale based on CPU
kubectl autoscale deployment my-app --min=2 --max=10 --cpu-percent=70

# ─── Watch rollout progress ────────────────────────────────────────────────
kubectl rollout status deployment/my-app
kubectl rollout status deployment/my-app --timeout=5m

# ─── Delete ────────────────────────────────────────────────────────────────
kubectl delete deployment my-app
kubectl delete -f deployment.yaml
```

---

## Rolling Updates

A rolling update replaces Pods gradually so the application stays available throughout.

```
Before update (desired=3, maxUnavailable=1, maxSurge=1):
  Pod1 (v1) RUNNING
  Pod2 (v1) RUNNING
  Pod3 (v1) RUNNING

Step 1: Surge — create 1 new pod (total 4, 1 extra)
  Pod1 (v1) RUNNING
  Pod2 (v1) RUNNING
  Pod3 (v1) RUNNING
  Pod4 (v2) PENDING → RUNNING

Step 2: Terminate 1 old pod (back to 3, 1 unavailable temporarily)
  Pod1 (v1) TERMINATING
  Pod2 (v1) RUNNING
  Pod3 (v1) RUNNING
  Pod4 (v2) RUNNING

...repeat until all pods are v2
```

### Triggering a Rolling Update

```bash
# Update the image (triggers rolling update)
kubectl set image deployment/my-app app=my-app:1.3.0

# Equivalent via edit
kubectl edit deployment my-app
# Change spec.template.spec.containers[0].image

# Equivalent via patch
kubectl patch deployment my-app -p '{"spec":{"template":{"spec":{"containers":[{"name":"app","image":"my-app:1.3.0"}]}}}}'

# Watch the rollout
kubectl rollout status deployment/my-app

# Detailed event stream
kubectl describe deployment my-app
```

### The `--record` Deprecation

The old `--record` flag (to save the command in revision history) is deprecated. Use annotations instead:

```bash
kubectl annotate deployment my-app \
  kubernetes.io/change-cause="Deploy version 1.3.0 — adds dark mode"
```

---

## Rollback

```bash
# View rollout history
kubectl rollout history deployment/my-app

# Output:
# REVISION  CHANGE-CAUSE
# 1         Initial deployment
# 2         Deploy version 1.2.0
# 3         Deploy version 1.3.0   ← current

# Inspect a specific revision
kubectl rollout history deployment/my-app --revision=2

# Roll back to the previous version
kubectl rollout undo deployment/my-app

# Roll back to a specific revision
kubectl rollout undo deployment/my-app --to-revision=1

# Verify the rollback
kubectl rollout status deployment/my-app
kubectl get pods -l app=my-app
```

---

## Deployment Strategies

### 1. RollingUpdate (Default)

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxUnavailable: 25%   # Percentage or absolute number
    maxSurge: 25%
```

Best for: most production scenarios.

### 2. Recreate

```yaml
strategy:
  type: Recreate
```

Kills ALL existing pods, then creates new ones. Results in downtime.

Best for: apps that cannot run two versions simultaneously (e.g., database schema migrations).

### 3. Blue-Green (via two Deployments)

Run both versions simultaneously, then switch the Service selector:

```bash
# Deploy new version as "green"
kubectl apply -f deployment-green.yaml  # image: my-app:2.0, label: slot=green

# Smoke test green
kubectl port-forward deployment/my-app-green 8080:3000

# Switch traffic by updating the Service selector
kubectl patch service my-app-svc -p '{"spec":{"selector":{"slot":"green"}}}'

# Old version (blue) still running — instant rollback available
kubectl patch service my-app-svc -p '{"spec":{"selector":{"slot":"blue"}}}'
```

### 4. Canary (Partial Traffic)

Send a small percentage of traffic to the new version:

```bash
# 3 pods running v1 (75% traffic), 1 pod running v2 (25% traffic)
# Service selects on 'app: my-app' — both deployments match
kubectl apply -f deployment-v1.yaml   # replicas: 3, image: my-app:1.0
kubectl apply -f deployment-canary.yaml  # replicas: 1, image: my-app:2.0
```

For fine-grained canary deployments, use a service mesh (Istio, Linkerd) or an ingress controller that supports traffic splitting.

---

## HorizontalPodAutoscaler (HPA)

Automatically scale the number of replicas based on metrics:

```yaml
# hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: my-app-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  minReplicas: 2
  maxReplicas: 20
  metrics:
  # CPU
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70  # Scale up when CPU > 70%
  # Memory
  - type: Resource
    resource:
      name: memory
      target:
        type: AverageValue
        averageValue: 200Mi
```

```bash
kubectl apply -f hpa.yaml
kubectl get hpa
kubectl describe hpa my-app-hpa
```

> HPA requires the **metrics-server** add-on (`minikube addons enable metrics-server`).

---

## Try It Yourself

### Exercise: Deploy, Update, Rollback

```bash
# 1. Deploy nginx v1.24
kubectl create deployment webapp \
  --image=nginx:1.24-alpine \
  --replicas=3

kubectl rollout status deployment/webapp
kubectl get pods -l app=webapp

# 2. Annotate for history
kubectl annotate deployment webapp \
  kubernetes.io/change-cause="Initial deploy: nginx 1.24"

# 3. Update to v1.25
kubectl set image deployment/webapp nginx=nginx:1.25-alpine
kubectl annotate deployment webapp \
  kubernetes.io/change-cause="Upgrade to nginx 1.25"

kubectl rollout status deployment/webapp
kubectl rollout history deployment/webapp

# 4. Simulate a bad deploy (broken image tag)
kubectl set image deployment/webapp nginx=nginx:99.99-alpine
kubectl rollout status deployment/webapp --timeout=60s
# This will fail — image doesn't exist

# 5. Roll back immediately
kubectl rollout undo deployment/webapp
kubectl rollout status deployment/webapp

# 6. Verify we're back to 1.25
kubectl get pods -l app=webapp -o jsonpath='{.items[0].spec.containers[0].image}'

# 7. Clean up
kubectl delete deployment webapp
```

---

## Key Takeaways

- **Deployments** manage ReplicaSets which manage Pods — never create Pods directly in production
- `kubectl apply -f` is the declarative way to create/update resources — idempotent and GitOps-friendly
- Rolling updates replace Pods gradually — control pace with `maxUnavailable` and `maxSurge`
- `kubectl rollout undo` can roll back to the previous revision in seconds
- Set **resource requests/limits** — required for the scheduler and HPA to work correctly
- **Readiness probes** are critical — they ensure Kubernetes only routes traffic to healthy Pods

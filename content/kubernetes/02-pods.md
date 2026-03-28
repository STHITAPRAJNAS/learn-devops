# Pods: The Atomic Unit

## What Is a Pod?

A **Pod** is the smallest deployable unit in Kubernetes. It is a group of one or more containers that:

- Share the **same network namespace** (same IP, same port space)
- Share the **same storage volumes**
- Are always **co-located** on the same node
- Are **co-scheduled** — they start and stop together

You rarely create Pods directly. Instead, you use higher-level controllers (Deployments, StatefulSets) that manage Pods for you. But understanding Pods is fundamental.

---

## A Minimal Pod Spec

```yaml
# pod.yaml
apiVersion: v1
kind: Pod
metadata:
  name: hello-pod
  labels:
    app: hello
    env: demo
spec:
  containers:
  - name: nginx
    image: nginx:1.25-alpine
    ports:
    - containerPort: 80
```

```bash
kubectl apply -f pod.yaml
kubectl get pod hello-pod
kubectl describe pod hello-pod
kubectl logs hello-pod
kubectl delete pod hello-pod
```

---

## Pod Spec Deep Dive

### Resources: Requests and Limits

```yaml
spec:
  containers:
  - name: app
    image: my-app:1.0
    resources:
      requests:        # Minimum guaranteed resources
        memory: "128Mi"
        cpu: "250m"    # 250 millicores = 0.25 CPU
      limits:          # Maximum allowed resources
        memory: "512Mi"
        cpu: "500m"
```

| Field | Meaning |
|-------|---------|
| `requests.cpu` | Used by the scheduler to find a node with this much free CPU |
| `requests.memory` | Used by the scheduler; guaranteed to the container |
| `limits.cpu` | Container is throttled if it exceeds this |
| `limits.memory` | Container is OOMKilled if it exceeds this |

**CPU units:** `1000m` = 1 core, `500m` = 0.5 core, `100m` = 0.1 core
**Memory units:** `Ki`, `Mi`, `Gi` (kibibytes, mebibytes, gibibytes)

> **Best practice:** Always set resource requests. Without them, the scheduler cannot make good placement decisions and other workloads may be starved.

---

### Environment Variables

```yaml
spec:
  containers:
  - name: app
    image: my-app:1.0
    env:
    # Static value
    - name: APP_ENV
      value: "production"

    # From a ConfigMap
    - name: DATABASE_HOST
      valueFrom:
        configMapKeyRef:
          name: db-config
          key: host

    # From a Secret
    - name: DATABASE_PASSWORD
      valueFrom:
        secretKeyRef:
          name: db-secret
          key: password

    # From Pod metadata (Downward API)
    - name: POD_NAME
      valueFrom:
        fieldRef:
          fieldPath: metadata.name

    - name: POD_IP
      valueFrom:
        fieldRef:
          fieldPath: status.podIP
```

---

### Probes: Health Checking

Kubernetes uses probes to determine container health:

| Probe | Trigger | Effect on failure |
|-------|---------|------------------|
| `livenessProbe` | Is the app alive? | Restart container |
| `readinessProbe` | Is the app ready for traffic? | Remove from Service endpoints |
| `startupProbe` | Has the app started? (slow starters) | Liveness/readiness gated until pass |

```yaml
spec:
  containers:
  - name: app
    image: my-app:1.0

    livenessProbe:
      httpGet:
        path: /health
        port: 8080
      initialDelaySeconds: 15  # Wait before first probe
      periodSeconds: 10        # Check every 10s
      timeoutSeconds: 5        # Fail if no response in 5s
      failureThreshold: 3      # Restart after 3 consecutive failures

    readinessProbe:
      httpGet:
        path: /ready
        port: 8080
      initialDelaySeconds: 5
      periodSeconds: 5
      successThreshold: 1      # Need 1 success to become ready

    startupProbe:
      httpGet:
        path: /health
        port: 8080
      failureThreshold: 30     # Allow 30 * 10s = 5 minutes to start
      periodSeconds: 10
```

**Probe types:**

```yaml
# HTTP GET (most common)
httpGet:
  path: /health
  port: 8080
  httpHeaders:
  - name: X-Health-Check
    value: "1"

# TCP socket
tcpSocket:
  port: 5432

# Command execution
exec:
  command:
  - /bin/sh
  - -c
  - "pg_isready -U postgres"
```

---

### Init Containers

Init containers run **sequentially** before app containers start. They must exit successfully (exit code 0) — if they fail, Kubernetes restarts the Pod.

```yaml
spec:
  initContainers:
  # Wait for database to be ready
  - name: wait-for-db
    image: busybox:1.36
    command: ['sh', '-c',
      'until nc -z postgres 5432; do echo "waiting for postgres"; sleep 2; done']

  # Run database migrations
  - name: run-migrations
    image: my-app:1.0
    command: ['node', 'scripts/migrate.js']
    env:
    - name: DATABASE_URL
      valueFrom:
        secretKeyRef:
          name: db-secret
          key: url

  # Main app container starts only after both init containers succeed
  containers:
  - name: app
    image: my-app:1.0
    ports:
    - containerPort: 3000
```

---

### Multi-Container Pod Patterns

All containers in a Pod share the same network and can share volumes.

#### Sidecar Pattern

A helper container runs alongside the main app:

```yaml
spec:
  containers:
  # Main application
  - name: app
    image: my-app:1.0
    ports:
    - containerPort: 8080
    volumeMounts:
    - name: logs
      mountPath: /var/log/app

  # Log shipper sidecar
  - name: log-shipper
    image: fluent/fluent-bit:3.0
    volumeMounts:
    - name: logs
      mountPath: /var/log/app
      readOnly: true
    env:
    - name: FLUENT_ELASTICSEARCH_HOST
      value: "elasticsearch.logging.svc.cluster.local"

  volumes:
  - name: logs
    emptyDir: {}
```

#### Ambassador Pattern

A proxy sidecar handles external communication:

```yaml
spec:
  containers:
  - name: app
    image: my-app:1.0
    # App connects to localhost:9999 — it doesn't know about TLS
    env:
    - name: DATABASE_URL
      value: "postgres://localhost:9999/mydb"

  # TLS proxy ambassador
  - name: tls-proxy
    image: envoyproxy/envoy:v1.29
    ports:
    - containerPort: 9999
    # Envoy terminates TLS and forwards to the real database
```

#### Adapter Pattern

Transforms app output to a standard format:

```yaml
spec:
  containers:
  - name: app
    image: legacy-app:1.0   # Outputs non-standard metrics format
    volumeMounts:
    - name: metrics
      mountPath: /metrics

  # Prometheus adapter converts legacy format → Prometheus format
  - name: metrics-adapter
    image: prometheus/node-exporter:latest
    volumeMounts:
    - name: metrics
      mountPath: /host-metrics
      readOnly: true
```

---

### Volume Mounts in Pods

```yaml
spec:
  containers:
  - name: app
    image: my-app:1.0
    volumeMounts:
    - name: data
      mountPath: /data
    - name: config
      mountPath: /etc/app/config.yaml
      subPath: config.yaml   # Mount a single file from the volume
      readOnly: true
    - name: tmp
      mountPath: /tmp

  volumes:
  # Named persistent volume claim
  - name: data
    persistentVolumeClaim:
      claimName: my-pvc

  # ConfigMap as a file
  - name: config
    configMap:
      name: app-config

  # In-memory temp storage
  - name: tmp
    emptyDir:
      medium: Memory
      sizeLimit: 64Mi
```

---

## Pod Lifecycle

```
Pending → Running → Succeeded
                 ↘ Failed
                 ↘ Unknown
```

| Phase | Meaning |
|-------|---------|
| **Pending** | Pod accepted by cluster; waiting for scheduling or image pull |
| **Running** | At least one container is running |
| **Succeeded** | All containers completed with exit code 0 (common for Jobs) |
| **Failed** | At least one container exited with non-zero code |
| **Unknown** | Cannot determine status (usually a node communication problem) |

### Container States

Within a running Pod, each container has its own state:

| State | Meaning |
|-------|---------|
| **Waiting** | Not yet running (pulling image, waiting for secret) |
| **Running** | Executing |
| **Terminated** | Finished (with exit code) |

```bash
# See container states in detail
kubectl describe pod my-pod

# Check restart count and last termination reason
kubectl get pod my-pod -o jsonpath='{.status.containerStatuses[0]}'
```

---

## Restart Policies

```yaml
spec:
  restartPolicy: Always    # Default — always restart on exit
  # restartPolicy: OnFailure  # Restart only if exit code != 0
  # restartPolicy: Never      # Never restart (for Jobs)
```

---

## Pod Scheduling Controls

### Node Selector (Simple)

```yaml
spec:
  nodeSelector:
    kubernetes.io/arch: amd64
    node-type: gpu
```

### Affinity / Anti-Affinity (Advanced)

```yaml
spec:
  affinity:
    # Prefer scheduling on nodes with SSD
    nodeAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 1
        preference:
          matchExpressions:
          - key: disk-type
            operator: In
            values: ["ssd"]

    # Spread pods across different nodes (no two pods on same node)
    podAntiAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
      - topologyKey: "kubernetes.io/hostname"
        labelSelector:
          matchLabels:
            app: my-app
```

### Tolerations (For Tainted Nodes)

```yaml
spec:
  tolerations:
  - key: "gpu"
    operator: "Equal"
    value: "true"
    effect: "NoSchedule"
```

---

## Try It Yourself

### Exercise: Multi-Container Pod with Init Container

```yaml
# multi-pod.yaml
apiVersion: v1
kind: Pod
metadata:
  name: multi-demo
spec:
  initContainers:
  - name: setup
    image: busybox:1.36
    command: ['sh', '-c', 'echo "Initialising..." && echo "<h1>Hello from Kubernetes!</h1>" > /shared/index.html']
    volumeMounts:
    - name: shared
      mountPath: /shared

  containers:
  - name: nginx
    image: nginx:alpine
    ports:
    - containerPort: 80
    volumeMounts:
    - name: shared
      mountPath: /usr/share/nginx/html

  - name: logger
    image: busybox:1.36
    command: ['sh', '-c', 'while true; do echo "$(date): nginx is running"; sleep 5; done']

  volumes:
  - name: shared
    emptyDir: {}
```

```bash
kubectl apply -f multi-pod.yaml
kubectl get pod multi-demo --watch

# Once Running:
kubectl port-forward pod/multi-demo 8080:80 &
curl http://localhost:8080   # "Hello from Kubernetes!"

# See both containers
kubectl logs multi-demo -c nginx
kubectl logs multi-demo -c logger

kubectl delete pod multi-demo
```

---

## Key Takeaways

- A Pod is one or more containers that **share network and storage**
- Always set **resource requests** — they drive scheduling decisions
- Use **liveness probes** to auto-restart unhealthy containers
- Use **readiness probes** to stop sending traffic to containers that aren't ready
- Use **init containers** for setup tasks that must complete before the app starts
- The **sidecar pattern** (logging, proxying) is a powerful multi-container Pod use case
- In practice, you almost never create Pods directly — use **Deployments** instead

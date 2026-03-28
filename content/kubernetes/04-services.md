# Services and Networking

## The Problem: Pods Are Ephemeral

Pods come and go. When a Deployment rolls out an update, old Pods are deleted and new ones created — with different IP addresses. You can't hardcode Pod IPs.

A **Service** solves this: it provides a **stable network endpoint** (IP + DNS name) that load-balances traffic to a dynamic set of Pods, selected by **label selectors**.

```
Client → Service (stable IP: 10.96.0.50) → Pod 10.244.1.4
                                          → Pod 10.244.2.7
                                          → Pod 10.244.3.2
```

As Pods come and go, the Service automatically updates its list of endpoints.

---

## Service Types

### 1. ClusterIP (Default)

Exposes the service on a cluster-internal IP. Only reachable **within the cluster**.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-api
spec:
  type: ClusterIP    # (default — can omit)
  selector:
    app: my-api      # Selects pods with this label
  ports:
  - name: http
    port: 80         # Port the service listens on
    targetPort: 3000 # Port the container listens on
    protocol: TCP
```

```bash
# Inside another pod in the cluster:
curl http://my-api           # Using service DNS
curl http://my-api.default   # Namespace-qualified
curl http://my-api.default.svc.cluster.local  # Fully qualified
curl http://10.96.0.50       # By ClusterIP (not portable)
```

### 2. NodePort

Exposes the service on a port of **every node's IP address**. Reachable from outside the cluster via `<NodeIP>:<NodePort>`.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-app-nodeport
spec:
  type: NodePort
  selector:
    app: my-app
  ports:
  - port: 80           # ClusterIP port (for internal traffic)
    targetPort: 8080   # Container port
    nodePort: 30080    # Optional: specify port (30000-32767)
                       # If omitted, Kubernetes assigns a random port
```

```bash
# Access from outside:
curl http://<any-node-ip>:30080

# In minikube:
minikube service my-app-nodeport --url
```

> NodePort is rarely used directly in production. It exposes ports on every node, bypassing load balancer logic. Use LoadBalancer or Ingress instead.

### 3. LoadBalancer

Provisions an **external load balancer** from the cloud provider (AWS ALB/NLB, GCP LB, Azure LB). Gets a public IP.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-app-lb
  annotations:
    # Cloud-specific annotations
    service.beta.kubernetes.io/aws-load-balancer-type: "nlb"
spec:
  type: LoadBalancer
  selector:
    app: my-app
  ports:
  - port: 443
    targetPort: 8443
```

```bash
kubectl get service my-app-lb
# NAME         TYPE           CLUSTER-IP    EXTERNAL-IP      PORT(S)         AGE
# my-app-lb    LoadBalancer   10.96.0.100   203.0.113.25     443:31234/TCP   2m

curl https://203.0.113.25   # Public internet access!
```

> Each LoadBalancer Service creates a separate cloud load balancer — expensive at scale. Use Ingress to route multiple services through a single load balancer.

### 4. ExternalName

Maps a Service to an external DNS name. Useful for consuming external services as if they were internal.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-database
spec:
  type: ExternalName
  externalName: database.example.com  # External DNS
```

```bash
# Inside cluster, reference 'my-database' as if it were internal
# Kubernetes returns a CNAME to database.example.com
```

### 5. Headless Services (StatefulSets)

A Service with `clusterIP: None` — DNS returns the Pod IPs directly instead of a virtual IP. Used by StatefulSets so each Pod has its own DNS entry.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: cassandra
spec:
  clusterIP: None    # Headless!
  selector:
    app: cassandra
  ports:
  - port: 9042
```

```bash
# Each pod gets: <pod-name>.<service-name>.<namespace>.svc.cluster.local
# cassandra-0.cassandra.default.svc.cluster.local
# cassandra-1.cassandra.default.svc.cluster.local
```

---

## Kubernetes DNS

Every cluster runs **CoreDNS** (a DNS server in `kube-system`). It provides automatic DNS for Services.

**Full DNS format:** `<service-name>.<namespace>.svc.<cluster-domain>`

```
my-api.default.svc.cluster.local
│       │       │   └── cluster domain (usually "cluster.local")
│       │       └────── "svc" - service
│       └────────────── namespace
└────────────────────── service name
```

**Within the same namespace**, you can use just the service name:
```bash
curl http://my-api
```

**Across namespaces**, include the namespace:
```bash
curl http://my-api.staging      # Service in 'staging' namespace
curl http://postgres.data-tier  # Service in 'data-tier' namespace
```

---

## Endpoints and EndpointSlices

When you create a Service, Kubernetes creates an `Endpoints` object that tracks the IPs and ports of matching Pods.

```bash
# See current endpoints for a service
kubectl get endpoints my-api
kubectl describe endpoints my-api

# Modern replacement: EndpointSlices (better scalability)
kubectl get endpointslices -l kubernetes.io/service-name=my-api
```

When a Pod's readiness probe fails, its IP is **removed** from the Endpoints — traffic stops going to it automatically.

---

## Ingress

An **Ingress** is an API object that manages external HTTP/HTTPS access to Services. It provides:
- **Host-based routing** — `api.example.com` → api service, `www.example.com` → frontend
- **Path-based routing** — `/api/` → api service, `/` → frontend
- **TLS termination** — handles SSL/TLS at the edge

Ingress requires an **Ingress Controller** to work (Kubernetes doesn't include one by default). Popular options: **nginx**, **Traefik**, **HAProxy**, **AWS ALB Controller**.

### Install nginx Ingress Controller (for local testing)

```bash
# kind
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

# minikube
minikube addons enable ingress
```

### Ingress Example

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-app-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx

  # TLS configuration
  tls:
  - hosts:
    - api.example.com
    - www.example.com
    secretName: tls-secret   # kubernetes.io/tls Secret

  rules:
  # Route based on hostname
  - host: api.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: api-service
            port:
              number: 3000

  # Route based on path
  - host: www.example.com
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: api-service
            port:
              number: 3000
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend-service
            port:
              number: 3000
```

```bash
kubectl apply -f ingress.yaml
kubectl get ingress
kubectl describe ingress my-app-ingress

# Test locally with minikube
echo "$(minikube ip)  api.example.com www.example.com" | sudo tee -a /etc/hosts
curl http://api.example.com/users
```

---

## Network Policies

By default, **all Pods can communicate with all other Pods** in the cluster. Network Policies restrict traffic.

```yaml
# Only allow traffic to the database from pods labeled app=api
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-api-to-db
  namespace: production
spec:
  # This policy applies to pods labeled app=postgres
  podSelector:
    matchLabels:
      app: postgres

  policyTypes:
  - Ingress
  - Egress

  ingress:
  # Allow traffic only from pods labeled app=api
  - from:
    - podSelector:
        matchLabels:
          app: api
    ports:
    - protocol: TCP
      port: 5432

  egress:
  # Deny all outbound from the database (it shouldn't initiate connections)
  []
```

> Network Policies require a CNI plugin that supports them (Calico, Cilium, Weave). The default CNI in kind and minikube may not enforce them.

---

## Full Example: Frontend + API + Database

```yaml
# ─── API Deployment ────────────────────────────────────────────────────────
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
      - name: api
        image: my-api:1.0
        ports:
        - containerPort: 3000
---
# ─── API Service (internal only) ───────────────────────────────────────────
apiVersion: v1
kind: Service
metadata:
  name: api
spec:
  selector:
    app: api
  ports:
  - port: 3000
    targetPort: 3000
---
# ─── Frontend Deployment ───────────────────────────────────────────────────
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
      - name: frontend
        image: my-frontend:1.0
        ports:
        - containerPort: 3000
        env:
        - name: NEXT_PUBLIC_API_URL
          value: "http://api:3000"   # Resolves via cluster DNS
---
# ─── Frontend Service ──────────────────────────────────────────────────────
apiVersion: v1
kind: Service
metadata:
  name: frontend
spec:
  selector:
    app: frontend
  ports:
  - port: 3000
    targetPort: 3000
---
# ─── Ingress ───────────────────────────────────────────────────────────────
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-ingress
spec:
  ingressClassName: nginx
  rules:
  - host: myapp.local
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: api
            port:
              number: 3000
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend
            port:
              number: 3000
```

---

## Key Takeaways

- Services provide a **stable virtual IP and DNS** entry for a set of Pods
- Pods are selected by **label selectors** — if a Pod's labels match, it gets traffic
- **ClusterIP**: internal only. **NodePort**: accessible via node IP. **LoadBalancer**: gets a cloud LB.
- **Ingress** routes HTTP/S traffic to multiple Services through a single external IP — much cheaper than multiple LoadBalancer services
- **CoreDNS** provides automatic DNS: services are reachable by name within the cluster
- **Readiness probes** gate traffic — a Pod not ready is removed from Service endpoints automatically

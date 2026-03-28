# Service Mesh: Istio & Linkerd in Enterprise

## Why a Service Mesh?

As microservices grow, you face problems that application code shouldn't solve:
- mTLS between every service pair (zero-trust)
- Distributed tracing without code changes
- Fine-grained traffic control (retries, timeouts, circuit breaking)
- Observability: golden signals for every service automatically

A service mesh moves these concerns to the **infrastructure layer** via sidecar proxies (Envoy) injected beside each pod.

```
Pod (with sidecar)
┌──────────────────────────────────┐
│  [App Container]  [Envoy Proxy]  │
│        ↕ localhost               │
│   App talks to Envoy             │
│   Envoy handles: mTLS, retries,  │
│   tracing, metrics, routing      │
└──────────────────────────────────┘
```

---

## Istio

### Installation (Production)

```bash
# Download istioctl
curl -L https://istio.io/downloadIstio | ISTIO_VERSION=1.20.0 sh -
export PATH=$PWD/istio-1.20.0/bin:$PATH

# Install with production profile
istioctl install --set profile=default \
  --set values.gateways.istio-ingressgateway.autoscaleMin=3 \
  --set values.pilot.autoscaleMin=2 \
  --set meshConfig.enableTracing=true \
  --set meshConfig.defaultConfig.tracing.zipkin.address=jaeger-collector:9411 \
  -y

# Enable sidecar injection for a namespace
kubectl label namespace production istio-injection=enabled
```

### Mutual TLS (mTLS) — Zero Trust

```yaml
# Enforce STRICT mTLS across the entire mesh
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: istio-system   # mesh-wide
spec:
  mtls:
    mode: STRICT   # reject all plaintext traffic
---
# Allow PERMISSIVE for a specific service (during migration)
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: legacy-service-permissive
  namespace: production
spec:
  selector:
    matchLabels:
      app: legacy-service
  mtls:
    mode: PERMISSIVE   # accepts both plaintext and mTLS
```

**Verify mTLS is working:**
```bash
istioctl authn tls-check my-pod.production   # shows TLS status for all connections
```

---

### Authorization Policies — Service-to-Service RBAC

```yaml
# Deny all by default (mesh-wide)
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: deny-all
  namespace: istio-system
spec: {}
---
# Allow frontend → backend on specific paths only
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: backend-authz
  namespace: production
spec:
  selector:
    matchLabels:
      app: backend
  action: ALLOW
  rules:
  - from:
    - source:
        principals:
        - "cluster.local/ns/production/sa/frontend"   # service account identity
    to:
    - operation:
        methods: ["GET", "POST"]
        paths: ["/api/*"]
        ports: ["8080"]
---
# Allow monitoring namespace to scrape metrics
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: allow-prometheus-scrape
  namespace: production
spec:
  selector:
    matchLabels:
      app: backend
  action: ALLOW
  rules:
  - from:
    - source:
        namespaces: ["monitoring"]
    to:
    - operation:
        paths: ["/metrics"]
        ports: ["9090"]
```

---

### Traffic Management

**VirtualService — Advanced Routing:**
```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: api-vs
  namespace: production
spec:
  hosts:
  - api.production.svc.cluster.local
  http:
  # Route by header (A/B testing)
  - match:
    - headers:
        x-user-segment:
          exact: "beta"
    route:
    - destination:
        host: api.production.svc.cluster.local
        subset: v2
  # Canary: 10% to v2
  - route:
    - destination:
        host: api.production.svc.cluster.local
        subset: v1
      weight: 90
    - destination:
        host: api.production.svc.cluster.local
        subset: v2
      weight: 10
    # Retry policy
    retries:
      attempts: 3
      perTryTimeout: 5s
      retryOn: "5xx,reset,connect-failure,retriable-4xx"
    # Timeout
    timeout: 30s
    # Fault injection for chaos testing
    fault:
      delay:
        percentage:
          value: 0.1    # inject 100ms delay on 0.1% of requests
        fixedDelay: 100ms
---
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: api-dr
  namespace: production
spec:
  host: api.production.svc.cluster.local
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 1000
        connectTimeout: 30ms
        tcpKeepalive:
          time: 7200s
          interval: 75s
      http:
        http1MaxPendingRequests: 1024
        http2MaxRequests: 10000
        maxRequestsPerConnection: 100
        maxRetries: 3
    # Circuit breaker
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 10s
      baseEjectionTime: 30s
      maxEjectionPercent: 50   # eject at most 50% of endpoints
      minHealthPercent: 30
    loadBalancer:
      simple: LEAST_CONN   # or ROUND_ROBIN, RANDOM, PASSTHROUGH
  subsets:
  - name: v1
    labels:
      version: v1
  - name: v2
    labels:
      version: v2
```

**Ingress Gateway:**
```yaml
apiVersion: networking.istio.io/v1beta1
kind: Gateway
metadata:
  name: main-gateway
  namespace: istio-system
spec:
  selector:
    istio: ingressgateway
  servers:
  - port:
      number: 443
      name: https
      protocol: HTTPS
    tls:
      mode: SIMPLE
      credentialName: wildcard-tls   # secret in istio-system
    hosts:
    - "*.example.com"
  - port:
      number: 80
      name: http
      protocol: HTTP
    tls:
      httpsRedirect: true    # redirect all HTTP → HTTPS
    hosts:
    - "*.example.com"
---
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: api-gateway-vs
  namespace: production
spec:
  hosts:
  - api.example.com
  gateways:
  - istio-system/main-gateway
  http:
  - route:
    - destination:
        host: api.production.svc.cluster.local
        port:
          number: 8080
```

**Egress Control (restrict outbound traffic):**
```yaml
# Block all external traffic by default
# In meshConfig: outboundTrafficPolicy: REGISTRY_ONLY

# Allow specific external services
apiVersion: networking.istio.io/v1beta1
kind: ServiceEntry
metadata:
  name: allow-stripe-api
  namespace: production
spec:
  hosts:
  - api.stripe.com
  ports:
  - number: 443
    name: https
    protocol: HTTPS
  location: MESH_EXTERNAL
  resolution: DNS
---
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: stripe-egress-vs
  namespace: production
spec:
  hosts:
  - api.stripe.com
  tls:
  - match:
    - port: 443
      sniHosts:
      - api.stripe.com
    route:
    - destination:
        host: api.stripe.com
        port:
          number: 443
```

---

## Linkerd (Simpler Alternative)

Linkerd uses ultra-lightweight Rust proxies (not Envoy) — significantly lower resource overhead.

```bash
# Install CLI
curl --proto '=https' --tlsv1.2 -sSfL https://run.linkerd.io/install | sh

# Pre-flight check
linkerd check --pre

# Install
linkerd install --crds | kubectl apply -f -
linkerd install | kubectl apply -f -
linkerd check

# Inject sidecar into a deployment
kubectl get deploy -n production -o yaml | linkerd inject - | kubectl apply -f -
```

**Traffic Split (Canary via SMI):**
```yaml
apiVersion: split.smi-spec.io/v1alpha2
kind: TrafficSplit
metadata:
  name: api-canary
  namespace: production
spec:
  service: api
  backends:
  - service: api-stable
    weight: 90
  - service: api-canary
    weight: 10
```

**Per-route policy:**
```yaml
apiVersion: policy.linkerd.io/v1beta1
kind: HTTPRoute
metadata:
  name: api-route
  namespace: production
spec:
  parentRefs:
  - name: api
    kind: Server
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: "/admin"
    filters:
    - type: RequestHeaderModifier
      requestHeaderModifier:
        add:
        - name: x-internal-only
          value: "true"
```

---

## Observability with Kiali (Istio)

```bash
kubectl apply -f https://raw.githubusercontent.com/istio/istio/release-1.20/samples/addons/kiali.yaml
kubectl apply -f https://raw.githubusercontent.com/istio/istio/release-1.20/samples/addons/prometheus.yaml
kubectl apply -f https://raw.githubusercontent.com/istio/istio/release-1.20/samples/addons/grafana.yaml
istioctl dashboard kiali
```

Kiali gives you a **live service graph** showing:
- Traffic flow between services
- Error rates per service
- mTLS status (padlock icon)
- Latency heatmaps
- Circuit breaker status

---

## Choosing: Istio vs Linkerd

| Feature | Istio | Linkerd |
|---|---|---|
| Proxy | Envoy (C++) | Linkerd2-proxy (Rust) |
| Resource usage | Higher | Very low |
| L7 policy | Rich (header, path, method) | Basic |
| mTLS | Yes | Yes (automatic) |
| Multi-cluster | Yes (complex) | Yes (simpler) |
| Learning curve | High | Moderate |
| Best for | Complex enterprise routing | Resource-constrained, simplicity |

---

## Diagnostics

```bash
# Check proxy status for all pods
istioctl proxy-status

# Analyze config for issues
istioctl analyze -n production

# Dump Envoy config for a pod
istioctl proxy-config clusters my-pod.production
istioctl proxy-config routes my-pod.production
istioctl proxy-config listeners my-pod.production

# Check mTLS
istioctl authn tls-check my-pod.production backend.production.svc.cluster.local

# Linkerd: real-time traffic stats
linkerd viz stat deploy -n production
linkerd viz top deploy/api -n production
linkerd viz tap deploy/frontend -n production
```

# Ingress & Load Balancing in Enterprise Kubernetes

## The Load Balancing Stack

```
Internet
    │
    ▼
[Cloud LB / BGP Anycast / MetalLB]   ← L4 (TCP/UDP)
    │
    ▼
[Ingress Controller]                  ← L7 (HTTP/S, gRPC, WebSocket)
    │
    ▼
[Kubernetes Service]                  ← ClusterIP / kube-proxy / eBPF
    │
    ▼
[Pod Endpoints]
```

---

## Layer 4: External Load Balancers

### MetalLB (On-Premises)

MetalLB gives bare-metal clusters a proper `LoadBalancer` implementation — without a cloud provider.

**Installation:**
```bash
helm repo add metallb https://metallb.github.io/metallb
helm install metallb metallb/metallb -n metallb-system --create-namespace
```

**L2 Mode** (simpler, single-node bottleneck):
```yaml
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: production-pool
  namespace: metallb-system
spec:
  addresses:
  - 192.168.1.200-192.168.1.250   # IP range allocated for LB IPs
  autoAssign: true
---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: l2-advert
  namespace: metallb-system
spec:
  ipAddressPools:
  - production-pool
```

**BGP Mode** (enterprise — true ECMP load balancing across all nodes):
```yaml
apiVersion: metallb.io/v1beta2
kind: BGPPeer
metadata:
  name: spine-router
  namespace: metallb-system
spec:
  myASN: 64512
  peerASN: 64500
  peerAddress: 10.0.0.1
  keepaliveTime: 30s
  holdTime: 90s
---
apiVersion: metallb.io/v1beta1
kind: BGPAdvertisement
metadata:
  name: bgp-advert
  namespace: metallb-system
spec:
  ipAddressPools:
  - production-pool
  aggregationLength: 32    # advertise individual /32 host routes
  communities:
  - 64512:1000             # BGP community for upstream policy
```

**Request a specific IP for a Service:**
```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-api
  annotations:
    metallb.io/loadBalancerIPs: 192.168.1.210
    metallb.io/address-pool: production-pool
spec:
  type: LoadBalancer
  ports:
  - port: 443
    targetPort: 8443
  selector:
    app: my-api
```

---

## Layer 7: Ingress Controllers

### NGINX Ingress Controller (Most Widely Used)

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  --set controller.replicaCount=3 \
  --set controller.nodeSelector."kubernetes\.io/os"=linux \
  --set controller.resources.requests.cpu=100m \
  --set controller.resources.requests.memory=90Mi \
  --set controller.metrics.enabled=true \
  --set controller.metrics.serviceMonitor.enabled=true \   # Prometheus scraping
  --set controller.podAnnotations."prometheus\.io/scrape"=true
```

**Basic Ingress:**
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-ingress
  namespace: production
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /$2
    nginx.ingress.kubernetes.io/use-regex: "true"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - api.example.com
    secretName: api-tls-cert
  rules:
  - host: api.example.com
    http:
      paths:
      - path: /v1(/|$)(.*)
        pathType: Prefix
        backend:
          service:
            name: api-v1
            port:
              number: 8080
      - path: /v2(/|$)(.*)
        pathType: Prefix
        backend:
          service:
            name: api-v2
            port:
              number: 8080
```

**Enterprise Annotations — Rate Limiting, Auth, CORS:**
```yaml
metadata:
  annotations:
    # Rate limiting
    nginx.ingress.kubernetes.io/limit-rps: "100"
    nginx.ingress.kubernetes.io/limit-connections: "20"
    nginx.ingress.kubernetes.io/limit-burst-multiplier: "5"

    # External authentication (OAuth2 proxy / OIDC)
    nginx.ingress.kubernetes.io/auth-url: "https://auth.example.com/oauth2/auth"
    nginx.ingress.kubernetes.io/auth-signin: "https://auth.example.com/oauth2/start?rd=$escaped_request_uri"
    nginx.ingress.kubernetes.io/auth-response-headers: "X-Auth-Request-User,X-Auth-Request-Email"

    # CORS
    nginx.ingress.kubernetes.io/enable-cors: "true"
    nginx.ingress.kubernetes.io/cors-allow-origin: "https://app.example.com"
    nginx.ingress.kubernetes.io/cors-allow-methods: "GET, POST, PUT, DELETE, OPTIONS"

    # Timeouts
    nginx.ingress.kubernetes.io/proxy-connect-timeout: "10"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "60"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "60"

    # Body size
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"

    # Sticky sessions
    nginx.ingress.kubernetes.io/affinity: "cookie"
    nginx.ingress.kubernetes.io/session-cookie-name: "ROUTEID"
    nginx.ingress.kubernetes.io/session-cookie-max-age: "3600"

    # Security headers
    nginx.ingress.kubernetes.io/configuration-snippet: |
      more_set_headers "X-Frame-Options: DENY";
      more_set_headers "X-Content-Type-Options: nosniff";
      more_set_headers "Referrer-Policy: strict-origin-when-cross-origin";
      more_set_headers "Permissions-Policy: geolocation=(), microphone=()";
```

**Global ConfigMap Tuning:**
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: ingress-nginx-controller
  namespace: ingress-nginx
data:
  # Performance
  worker-processes: "auto"
  worker-connections: "65536"
  use-gzip: "true"
  gzip-level: "5"
  gzip-types: "text/plain text/css application/json application/javascript text/xml application/xml"

  # Security
  ssl-protocols: "TLSv1.2 TLSv1.3"
  ssl-ciphers: "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384"
  ssl-session-cache: "shared:SSL:10m"
  ssl-session-timeout: "10m"
  hsts: "true"
  hsts-max-age: "31536000"
  hsts-include-subdomains: "true"

  # Upstream keepalive
  upstream-keepalive-connections: "200"
  upstream-keepalive-timeout: "60"
  upstream-keepalive-requests: "10000"

  # Logging
  log-format-upstream: >-
    {"time": "$time_iso8601", "remote_addr": "$remote_addr",
     "x_forwarded_for": "$http_x_forwarded_for", "method": "$request_method",
     "uri": "$request_uri", "status": $status,
     "response_time": $request_time, "bytes_sent": $bytes_sent,
     "upstream": "$upstream_addr", "upstream_time": "$upstream_response_time"}
```

---

### Traefik (Cloud-Native, Dynamic Configuration)

```bash
helm install traefik traefik/traefik \
  --namespace traefik \
  --create-namespace \
  --set deployment.replicas=3 \
  --set ports.websecure.tls.enabled=true \
  --set providers.kubernetesCRD.enabled=true \
  --set providers.kubernetesIngress.enabled=true \
  --set metrics.prometheus.enabled=true
```

**IngressRoute (Traefik CRD):**
```yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: api-route
  namespace: production
spec:
  entryPoints:
  - websecure
  routes:
  - match: Host(`api.example.com`) && PathPrefix(`/v1`)
    kind: Rule
    services:
    - name: api-v1
      port: 8080
      weight: 100
    middlewares:
    - name: rate-limit
    - name: auth
  tls:
    certResolver: letsencrypt
---
# Middleware: rate limiting
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: rate-limit
spec:
  rateLimit:
    average: 100
    burst: 50
    period: 1m
---
# Middleware: JWT auth
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: auth
spec:
  forwardAuth:
    address: http://auth-service:4181
    authResponseHeaders:
    - X-User-ID
    - X-User-Email
```

---

## TLS Certificate Management — cert-manager

```bash
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --set installCRDs=true
```

**Let's Encrypt ClusterIssuer:**
```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ops@example.com
    privateKeySecretRef:
      name: letsencrypt-prod-key
    solvers:
    - http01:
        ingress:
          class: nginx
```

**Internal CA (enterprise — no internet dependency):**
```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: internal-ca
spec:
  ca:
    secretName: root-ca-secret   # your internal CA cert/key
---
# Wildcard cert from internal CA
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: wildcard-cert
  namespace: production
spec:
  secretName: wildcard-tls
  duration: 8760h   # 1 year
  renewBefore: 720h # renew 30 days before expiry
  dnsNames:
  - "*.example.com"
  - "*.internal.example.com"
  issuerRef:
    name: internal-ca
    kind: ClusterIssuer
```

---

## Advanced Traffic Patterns

### Canary Deployments with NGINX Ingress

```yaml
# Stable ingress (existing)
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-stable
  namespace: production
spec:
  ingressClassName: nginx
  rules:
  - host: api.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: api-stable
            port:
              number: 8080
---
# Canary ingress (5% traffic)
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-canary
  namespace: production
  annotations:
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-weight: "5"          # 5% of traffic
    # OR route by header:
    # nginx.ingress.kubernetes.io/canary-by-header: "X-Canary"
    # nginx.ingress.kubernetes.io/canary-by-header-value: "true"
spec:
  ingressClassName: nginx
  rules:
  - host: api.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: api-canary
            port:
              number: 8080
```

### Blue-Green with Service Switch
```yaml
# Point production service to blue or green via label selector
apiVersion: v1
kind: Service
metadata:
  name: api-production
spec:
  selector:
    app: api
    slot: blue    # switch to 'green' for instant cutover
  ports:
  - port: 8080
```

---

## ExternalDNS — Automatic DNS Management

```bash
helm install external-dns external-dns/external-dns \
  --set provider=aws \
  --set aws.region=us-east-1 \
  --set domainFilters[0]=example.com \
  --set policy=sync \
  --set registry=txt \
  --set txtOwnerId=my-cluster
```

```yaml
# Service annotation triggers DNS record creation
apiVersion: v1
kind: Service
metadata:
  name: api
  annotations:
    external-dns.alpha.kubernetes.io/hostname: api.example.com
    external-dns.alpha.kubernetes.io/ttl: "60"
spec:
  type: LoadBalancer
```

---

## Key Diagnostics

```bash
# Check ingress controller logs
kubectl logs -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx -f

# Test ingress routing
curl -H "Host: api.example.com" http://<INGRESS_IP>/v1/health -v

# Check certificate status
kubectl get certificate -A
kubectl describe certificate wildcard-cert -n production

# Verify MetalLB assignment
kubectl get svc -A --field-selector spec.type=LoadBalancer

# Check BGP peers (MetalLB)
kubectl logs -n metallb-system -l component=speaker
```

---

## Decision Matrix

| Scenario | Recommended Solution |
|---|---|
| On-prem with BGP router | MetalLB (BGP mode) + NGINX Ingress |
| On-prem, simple L2 network | MetalLB (L2 mode) + NGINX Ingress |
| AWS | AWS Load Balancer Controller + ALB |
| GKE | GKE Ingress (native) |
| Complex routing rules | Traefik |
| TLS everywhere | cert-manager with internal CA |
| Canary deployments | NGINX Ingress canary annotations |
| Auto DNS | ExternalDNS |

# Enterprise Kubernetes Networking

## Overview

Enterprise Kubernetes networking is built on three foundational layers:
1. **Node-to-node** communication (underlay)
2. **Pod-to-pod** communication (overlay via CNI)
3. **Service-to-pod** communication (kube-proxy / eBPF)

Understanding each layer is essential for diagnosing failures and designing resilient, secure clusters.

---

## The Kubernetes Networking Model

Kubernetes enforces a flat networking model with four rules:
- Every Pod gets its own IP address
- Pods on the same node can communicate without NAT
- Pods on different nodes can communicate without NAT
- The IP a Pod sees for itself is the same IP others see

This is implemented by **CNI (Container Network Interface)** plugins.

---

## CNI Plugins: Choosing the Right One

### Flannel
Simple overlay network using VXLAN. Good for small clusters, no network policy support.

```bash
kubectl apply -f https://raw.githubusercontent.com/flannel-io/flannel/master/Documentation/kube-flannel.yml
```

**Use case**: Dev/test clusters, simple setups.

---

### Calico
Production-grade CNI with full Network Policy support, BGP routing, and WireGuard encryption.

```yaml
# Installation via Tigera operator
apiVersion: operator.tigera.io/v1
kind: Installation
metadata:
  name: default
spec:
  calicoNetwork:
    ipPools:
    - blockSize: 26
      cidr: 192.168.0.0/16
      encapsulation: VXLANCrossSubnet   # VXLAN only when crossing subnets
      natOutgoing: Enabled
      nodeSelector: all()
    bgp: Enabled                         # BGP for direct routing in same L2 domain
  nodeMetricsPort: 9091
```

**BGP configuration** (no overlay, pure L3 routing):
```yaml
apiVersion: projectcalico.org/v3
kind: BGPConfiguration
metadata:
  name: default
spec:
  logSeverityScreen: Info
  nodeToNodeMeshEnabled: true   # full mesh for small clusters
  asNumber: 64512               # private AS number
---
# Peer with upstream router (enterprise use)
apiVersion: projectcalico.org/v3
kind: BGPPeer
metadata:
  name: spine-router
spec:
  peerIP: 10.0.0.1
  asNumber: 64500
```

**Use case**: Enterprise on-prem, compliance-heavy environments needing encryption and fine-grained policy.

---

### Cilium (eBPF-based — recommended for new enterprise clusters)

Cilium replaces iptables entirely with **eBPF**, providing:
- 40-60% lower latency than iptables-based CNIs
- L7 network policies (HTTP, gRPC, Kafka-aware)
- Native Kubernetes service load balancing via XDP
- Built-in Hubble observability

```bash
# Install with Helm
helm repo add cilium https://helm.cilium.io/
helm install cilium cilium/cilium --version 1.14.0 \
  --namespace kube-system \
  --set kubeProxyReplacement=strict \       # replace kube-proxy entirely
  --set k8sServiceHost=<API_SERVER_IP> \
  --set k8sServicePort=6443 \
  --set hubble.relay.enabled=true \
  --set hubble.ui.enabled=true \
  --set encryption.enabled=true \
  --set encryption.type=wireguard           # node-to-node WireGuard encryption
```

**Hubble — real-time network observability:**
```bash
cilium hubble ui    # opens browser UI
hubble observe --namespace production --protocol http --verdict DROPPED
```

---

## Network Policies — Zero-Trust Networking

By default, all pods can talk to all pods. Network Policies let you enforce **zero-trust** — deny everything, allow explicitly.

### Default Deny All (Namespace Isolation)

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: production
spec:
  podSelector: {}          # applies to ALL pods in namespace
  policyTypes:
  - Ingress
  - Egress
```

### Allow Only Internal Namespace Traffic

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-same-namespace
  namespace: production
spec:
  podSelector: {}
  ingress:
  - from:
    - podSelector: {}      # any pod in the same namespace
  egress:
  - to:
    - podSelector: {}
```

### Microservice Policy — Frontend to Backend Only

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: backend-ingress
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: backend
      tier: api
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: frontend      # only frontend pods
    - namespaceSelector:
        matchLabels:
          name: monitoring   # AND monitoring namespace (Prometheus scraping)
    ports:
    - protocol: TCP
      port: 8080
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: postgres
    ports:
    - protocol: TCP
      port: 5432
  - to:                      # allow DNS resolution
    - namespaceSelector: {}
    ports:
    - protocol: UDP
      port: 53
```

### Restrict Egress to Specific External IP Range

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-external-api
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: payment-service
  egress:
  - to:
    - ipBlock:
        cidr: 203.0.113.0/24    # payment gateway IP range
        except:
        - 203.0.113.10/32       # block specific IP within range
    ports:
    - protocol: TCP
      port: 443
```

---

## Calico Global Network Policies (Enterprise)

Calico extends standard NetworkPolicy with **GlobalNetworkPolicy** — cluster-wide, not namespace-scoped.

```yaml
apiVersion: projectcalico.org/v3
kind: GlobalNetworkPolicy
metadata:
  name: deny-external-egress
spec:
  order: 1000          # higher order = lower priority
  selector: all()
  egress:
  - action: Allow
    destination:
      nets:
      - 10.0.0.0/8     # allow internal RFC1918
      - 172.16.0.0/12
      - 192.168.0.0/16
  - action: Deny        # deny all external egress by default
    destination:
      nets:
      - 0.0.0.0/0
---
# Allow specific workloads to reach internet
apiVersion: projectcalico.org/v3
kind: GlobalNetworkPolicy
metadata:
  name: allow-internet-for-labeled-pods
spec:
  order: 100
  selector: internet-egress == "allowed"   # label pods to grant access
  egress:
  - action: Allow
```

---

## Multi-Cluster Networking

### Submariner (CNCF project)
Connects multiple clusters at L3 — pods in cluster A can directly reach pods in cluster B.

```bash
subctl deploy-broker --kubeconfig cluster-a.yaml
subctl join --kubeconfig cluster-a.yaml broker-info.subm --clusterid cluster-a
subctl join --kubeconfig cluster-b.yaml broker-info.subm --clusterid cluster-b

# Verify connectivity
subctl verify cluster-a.yaml cluster-b.yaml --only connectivity
```

### Cilium ClusterMesh
```bash
cilium clustermesh enable --context cluster-a
cilium clustermesh enable --context cluster-b
cilium clustermesh connect --destination-context cluster-b
cilium clustermesh status
```

---

## DNS Architecture at Scale

### CoreDNS Tuning for Enterprise

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: coredns
  namespace: kube-system
data:
  Corefile: |
    .:53 {
        errors
        health { lameduck 5s }
        ready
        kubernetes cluster.local in-addr.arpa ip6.arpa {
            pods insecure
            fallthrough in-addr.arpa ip6.arpa
            ttl 30
        }
        # Forward internal corporate DNS
        forward corp.example.com 10.0.0.53 {
            prefer_udp
        }
        # Cache aggressively
        cache {
            success 9984 30
            denial 9984 5
        }
        loop
        reload
        loadbalance
        prometheus :9153
        # Forward everything else to public DNS
        forward . 8.8.8.8 8.8.4.4 {
            max_concurrent 1000
        }
    }
```

### NodeLocal DNSCache (critical for large clusters)
Eliminates conntrack race conditions and reduces DNS latency significantly:

```bash
# Deploy NodeLocal DNSCache DaemonSet
kubectl apply -f https://raw.githubusercontent.com/kubernetes/kubernetes/master/cluster/addons/dns/nodelocaldns/nodelocaldns.yaml
```

```yaml
# In your pods — point to link-local DNS cache
spec:
  dnsConfig:
    nameservers:
    - 169.254.20.10    # NodeLocal DNSCache address
    searches:
    - production.svc.cluster.local
    - svc.cluster.local
    options:
    - name: ndots
      value: "2"        # reduce from default 5 to minimize DNS lookups
    - name: timeout
      value: "2"
    - name: attempts
      value: "3"
```

---

## Key Diagnostics

```bash
# Test pod-to-pod connectivity
kubectl run -it --rm netshoot --image=nicolaka/netshoot -- bash
curl -v http://backend-service.production:8080/health

# Trace network policy drops (Cilium)
hubble observe --verdict DROPPED --follow

# Calico flow logs
calicoctl get networkpolicy -o yaml
kubectl logs -n calico-system -l app.kubernetes.io/name=calico-node | grep DROP

# Packet capture on a pod
kubectl debug -it pod/my-pod --image=nicolaka/netshoot -- tcpdump -i eth0 port 5432
```

---

## Key Takeaways

| Requirement | Recommended Approach |
|---|---|
| Simple cluster | Flannel |
| On-prem + BGP routing | Calico |
| High performance + observability | Cilium |
| Zero-trust isolation | NetworkPolicy + default-deny |
| Multi-cluster | Submariner or Cilium ClusterMesh |
| DNS at scale | NodeLocal DNSCache |

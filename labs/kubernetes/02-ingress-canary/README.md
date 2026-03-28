# Lab: Canary Deployments with NGINX Ingress

**Difficulty:** Intermediate
**Time:** 45 minutes
**Prerequisites:** Kubernetes cluster with NGINX Ingress Controller installed

## Objective

Deploy a canary release sending 10% of traffic to a new version, then progressively shift traffic based on a custom header for QA testing.

## Step 1: Deploy v1 (Stable)

```bash
kubectl create namespace canary-lab
kubectl apply -f v1.yaml
kubectl apply -f v2.yaml
kubectl apply -f ingress-stable.yaml

# Verify
kubectl get pods -n canary-lab
curl -H "Host: app.example.com" http://$(kubectl get svc -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}')/
# Should always return: {"version": "v1", "color": "blue"}
```

## Step 2: Apply Weight-based Canary (10% → v2)

```bash
kubectl apply -f ingress-canary-weight.yaml

# Send 100 requests and count distribution
for i in $(seq 1 100); do
  curl -s -H "Host: app.example.com" http://<INGRESS_IP>/ | jq -r .version
done | sort | uniq -c
# Expected: ~90 v1, ~10 v2
```

## Step 3: Header-based Canary (QA testing)

```bash
kubectl apply -f ingress-canary-header.yaml

# QA team hits v2 via header
curl -H "Host: app.example.com" -H "X-Canary: true" http://<INGRESS_IP>/
# Always returns v2

# Regular users hit v1 (still 10% weight canary active)
curl -H "Host: app.example.com" http://<INGRESS_IP>/
# ~90% v1, ~10% v2
```

## Step 4: Graduate to 50%, then 100%

```bash
# Increase canary weight to 50%
kubectl annotate ingress app-canary -n canary-lab \
  nginx.ingress.kubernetes.io/canary-weight=50 --overwrite

# Monitor error rates (should stay near 0%)
watch -n2 'curl -s -H "Host: app.example.com" http://<INGRESS_IP>/health'

# Full cutover: update stable ingress to point to v2 service, remove canary
kubectl apply -f ingress-stable-v2.yaml
kubectl delete ingress app-canary -n canary-lab
```

## Cleanup

```bash
kubectl delete namespace canary-lab
```

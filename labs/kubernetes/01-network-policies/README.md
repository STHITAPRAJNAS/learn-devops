# Lab: Kubernetes Network Policies — Zero-Trust Isolation

**Difficulty:** Intermediate
**Time:** 30 minutes
**Prerequisites:** Running Kubernetes cluster with Calico or Cilium CNI

## Objective

Implement a zero-trust network model for a 3-tier application (frontend, backend, database) using Kubernetes Network Policies. You'll verify that:
- Frontend can talk to backend, but NOT to the database directly
- Backend can talk to the database
- Nothing from outside can reach the database
- DNS resolution still works

## Setup: Deploy the Application

```bash
kubectl create namespace zero-trust-lab
kubectl config set-context --current --namespace=zero-trust-lab
kubectl apply -f app.yaml
kubectl get pods -w   # wait for all Running
```

## Step 1: Verify Open Communication (before policies)

```bash
# Exec into frontend pod
kubectl exec -it deploy/frontend -- sh

# These should all work (no policies yet):
wget -qO- http://backend:8080/health
wget -qO- http://postgres:5432      # should fail (postgres doesn't serve HTTP)
nc -zv postgres 5432                # should SUCCEED — bad! frontend shouldn't reach DB
exit
```

## Step 2: Apply Default-Deny Policy

```bash
kubectl apply -f 01-default-deny.yaml
```

**Test — everything should now be blocked:**
```bash
kubectl exec -it deploy/frontend -- wget -qO- --timeout=5 http://backend:8080/health
# Expected: timeout / connection refused
```

## Step 3: Allow Frontend → Backend

```bash
kubectl apply -f 02-allow-frontend-to-backend.yaml
```

**Test:**
```bash
kubectl exec -it deploy/frontend -- wget -qO- http://backend:8080/health
# Expected: {"status": "ok"}

kubectl exec -it deploy/frontend -- nc -zv postgres 5432 --timeout=5
# Expected: timeout — frontend still blocked from DB ✓
```

## Step 4: Allow Backend → Database

```bash
kubectl apply -f 03-allow-backend-to-db.yaml
```

**Test:**
```bash
kubectl exec -it deploy/backend -- nc -zv postgres 5432
# Expected: Connection succeeded ✓

kubectl exec -it deploy/frontend -- nc -zv postgres 5432 --timeout=5
# Expected: timeout ✓ (frontend still blocked)
```

## Step 5: Allow DNS (critical!)

Notice DNS resolution might be broken. Fix it:
```bash
kubectl apply -f 04-allow-dns.yaml

kubectl exec -it deploy/frontend -- nslookup backend
# Expected: resolves correctly ✓
```

## Verification Checklist

| Connection | Expected | Actual |
|---|---|---|
| frontend → backend:8080 | ✓ Allowed | |
| frontend → postgres:5432 | ✗ Blocked | |
| backend → postgres:5432 | ✓ Allowed | |
| backend → frontend | ✗ Blocked | |
| Any pod → DNS (port 53) | ✓ Allowed | |
| External → backend | ✗ Blocked | |

## Cleanup

```bash
kubectl delete namespace zero-trust-lab
```

## Challenge Extensions

1. Allow only `GET` requests from frontend to backend (requires Cilium L7 policy)
2. Add a monitoring pod in a separate namespace that can scrape `/metrics` from backend
3. Allow backend to make HTTPS calls to an external payment API IP range

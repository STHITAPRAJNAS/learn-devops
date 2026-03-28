# Lab: Deployment and Service

**Difficulty:** Intermediate
**Time:** 35 minutes
**Prerequisites:** Lab 01 completed, kubectl working

---

## Objective

In this lab you will:

1. Create a Deployment with multiple replicas
2. Expose it with a Service
3. Perform a rolling update
4. Roll back to the previous version
5. Scale the Deployment
6. Test self-healing (delete a Pod and watch it come back)

---

## Step 1: Deploy the Application

```bash
cd labs/kubernetes/02-deployment

# Deploy everything
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml

# Alternatively, apply both at once
kubectl apply -f .
```

---

## Step 2: Watch the Rollout

```bash
# Watch the Deployment status
kubectl rollout status deployment/webapp

# Watch Pods come up
kubectl get pods -l app=webapp --watch
# Ctrl+C when all 3 show Running

# List with extra info (IP addresses and nodes)
kubectl get pods -l app=webapp -o wide
```

---

## Step 3: Inspect the Resources

```bash
# The Deployment
kubectl describe deployment webapp

# The ReplicaSet (created by the Deployment)
kubectl get replicaset
kubectl describe replicaset -l app=webapp

# The Service
kubectl describe service webapp-svc

# The Endpoints (IPs of the matched Pods)
kubectl get endpoints webapp-svc
```

---

## Step 4: Access the Application

```bash
# Method 1: Port-forward the Service
kubectl port-forward service/webapp-svc 8080:80

# Test it
curl http://localhost:8080
# Press Ctrl+C

# Method 2: Port-forward a specific Pod
POD=$(kubectl get pod -l app=webapp -o jsonpath='{.items[0].metadata.name}')
kubectl port-forward pod/$POD 8080:80
# Ctrl+C
```

---

## Step 5: Test Self-Healing

```bash
# In Terminal 1: watch the pods
kubectl get pods -l app=webapp --watch

# In Terminal 2: delete a pod
kubectl delete pod -l app=webapp --field-selector=status.phase=Running | head -1
# OR delete by name:
kubectl delete pod <pod-name>

# Switch back to Terminal 1 — you'll see:
# - One Pod enters Terminating state
# - Immediately a new Pod starts (Pending → ContainerCreating → Running)
# The ReplicaSet controller notices the count dropped below 3 and creates a replacement
```

---

## Step 6: Perform a Rolling Update

```bash
# Update the image to a newer nginx version
kubectl set image deployment/webapp nginx=nginx:1.25-alpine

# Watch the rolling update
kubectl rollout status deployment/webapp

# See what's happening in detail
kubectl describe deployment webapp | grep -A 10 "Events:"

# After the update, all pods run the new image
kubectl get pods -l app=webapp -o jsonpath='{range .items[*]}{.metadata.name}: {.spec.containers[0].image}{"\n"}{end}'
```

---

## Step 7: View Rollout History

```bash
kubectl rollout history deployment/webapp
# REVISION  CHANGE-CAUSE
# 1         <none>
# 2         <none>

# Add change-cause annotation for future updates
kubectl annotate deployment webapp kubernetes.io/change-cause="Updated nginx to 1.25-alpine"
```

---

## Step 8: Roll Back

```bash
# Simulate a bad deployment
kubectl set image deployment/webapp nginx=nginx:DOES-NOT-EXIST
kubectl annotate deployment webapp kubernetes.io/change-cause="Bad deploy: wrong image tag"

# Watch it fail — pods will enter ImagePullBackOff
kubectl get pods -l app=webapp --watch

# After ~60s, you'll see ImagePullBackOff. Roll back immediately:
kubectl rollout undo deployment/webapp

# Watch the recovery
kubectl rollout status deployment/webapp
kubectl get pods -l app=webapp
```

---

## Step 9: Scale the Deployment

```bash
# Scale up to 5 replicas
kubectl scale deployment webapp --replicas=5
kubectl rollout status deployment/webapp
kubectl get pods -l app=webapp

# Scale down to 1
kubectl scale deployment webapp --replicas=1
kubectl get pods -l app=webapp --watch

# Change replicas in the YAML and apply (preferred/declarative approach)
sed -i 's/replicas: 3/replicas: 2/' deployment.yaml
kubectl apply -f deployment.yaml
```

---

## Step 10: Examine the YAML of Deployed Resources

```bash
# Get the live Deployment YAML (includes status)
kubectl get deployment webapp -o yaml

# Compare with original file
diff deployment.yaml <(kubectl get deployment webapp -o yaml --export 2>/dev/null || true)
```

---

## Step 11: ConfigMap for Environment Variables

Create a ConfigMap and use it in the Deployment:

```bash
kubectl create configmap webapp-config \
  --from-literal=WELCOME_MSG="Hello from Kubernetes Deployment!" \
  --from-literal=ENV=lab

# Edit deployment.yaml to add envFrom, then apply
# See the comments in deployment.yaml for guidance
```

---

## Cleanup

```bash
kubectl delete -f .
# OR
kubectl delete deployment webapp
kubectl delete service webapp-svc
```

---

## Key Takeaways

- A **Deployment** manages ReplicaSets which manage Pods — never create Pods directly in production
- Kubernetes **self-heals**: if a Pod is deleted, the ReplicaSet creates a replacement immediately
- Rolling updates replace Pods one at a time — no downtime
- `kubectl rollout undo` is your emergency brake — rolls back in seconds
- The **Service** provides a stable ClusterIP and DNS name, decoupled from Pod IPs

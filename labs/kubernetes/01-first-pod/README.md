# Lab: Your First Kubernetes Pod

**Difficulty:** Beginner
**Time:** 25 minutes
**Prerequisites:** A running Kubernetes cluster (kind, minikube, or cloud), kubectl installed

---

## Objective

In this lab you will:

1. Deploy a Pod using a YAML manifest
2. Inspect its status and events
3. Access it using port-forwarding
4. Explore the container filesystem
5. View logs
6. Understand the Pod lifecycle

---

## Setup: Get a Local Cluster

If you don't have a cluster:

```bash
# Option 1: kind (recommended)
kind create cluster --name k8s-lab
kubectl config use-context kind-k8s-lab

# Option 2: minikube
minikube start

# Verify cluster is reachable
kubectl cluster-info
kubectl get nodes
```

---

## Step 1: Review the Pod Manifest

Look at `pod.yaml` in this directory. Read through each section and understand:
- `apiVersion` and `kind` — which API group and resource type
- `metadata` — name, labels, annotations
- `spec.containers` — the container(s) to run
- `resources` — CPU and memory requests/limits
- `livenessProbe` and `readinessProbe` — health checks

---

## Step 2: Deploy the Pod

```bash
cd labs/kubernetes/01-first-pod

kubectl apply -f pod.yaml
```

---

## Step 3: Watch the Pod Start

```bash
# Watch the status change: Pending → Running
kubectl get pod nginx-pod --watch
# Ctrl+C when it shows Running

# One-line status
kubectl get pod nginx-pod
```

What does each status mean?
- **Pending** — accepted by the API; waiting to be scheduled or image to pull
- **Running** — at least one container is executing
- **Succeeded** — all containers exited 0 (not applicable here — nginx runs forever)

---

## Step 4: Describe the Pod

`kubectl describe` gives the full story of what happened:

```bash
kubectl describe pod nginx-pod
```

Look for:
- **Node:** which worker node it was scheduled on
- **IP:** the Pod's cluster IP
- **Containers section:** image, port, probe configurations
- **Conditions:** Initialized, Ready, ContainersReady, PodScheduled
- **Events:** the timeline of what happened (image pull, start, probes)

---

## Step 5: Access the Pod via Port-Forward

```bash
# Forward local port 8080 to Pod port 80
kubectl port-forward pod/nginx-pod 8080:80

# In a new terminal (or browser):
curl http://localhost:8080
# OR open http://localhost:8080 in your browser

# Press Ctrl+C to stop port-forwarding
```

---

## Step 6: Explore the Container

```bash
# Open a shell inside the running Pod
kubectl exec -it nginx-pod -- sh

# Inside the Pod:
# What's in the filesystem?
ls /usr/share/nginx/html

# What's the hostname?
hostname   # Should match the Pod name

# What's the IP?
ip addr

# What processes are running?
ps aux

# Environment variables
env | sort

# Exit
exit
```

---

## Step 7: View Logs

```bash
# Current logs
kubectl logs nginx-pod

# Follow logs in real time
kubectl logs -f nginx-pod

# In another terminal, curl the pod to generate log entries:
kubectl port-forward pod/nginx-pod 8080:80 &
curl http://localhost:8080
curl http://localhost:8080/does-not-exist   # 404 error

# Back in first terminal — see the access log entries
# Press Ctrl+C
```

---

## Step 8: Test the Liveness Probe

The Pod has a liveness probe that checks `http://localhost:80/`. Let's see what happens when we simulate a failure:

```bash
# Watch the Pod in a separate terminal
kubectl get pod nginx-pod --watch &

# Delete the nginx HTML directory (simulating app failure)
kubectl exec nginx-pod -- sh -c "rm -rf /usr/share/nginx/html && mkdir /usr/share/nginx/html"

# Wait ~30s — the liveness probe will fail
# (The probe expects a 200 status; 403 Forbidden will also fail it)
# Kubernetes will restart the container

# You'll see: RESTARTS column increment from 0 to 1
kubectl get pod nginx-pod

# The directory is back (nginx process restarted from the original image layer)
kubectl exec nginx-pod -- ls /usr/share/nginx/html
```

---

## Step 9: Get Pod YAML

```bash
# See the full Pod resource as stored in Kubernetes (includes status)
kubectl get pod nginx-pod -o yaml

# Just the pod spec
kubectl get pod nginx-pod -o jsonpath='{.spec}'

# Extract the pod's IP
kubectl get pod nginx-pod -o jsonpath='{.status.podIP}'
```

---

## Step 10: Delete the Pod

```bash
# Delete the pod
kubectl delete pod nginx-pod

# Kubernetes does NOT recreate it — a bare Pod has no controller
kubectl get pods   # Should be empty (or no nginx-pod)

# This is why in practice we use Deployments, not bare Pods
```

---

## Bonus: Create Pods Imperatively

```bash
# Run a pod imperatively (quick testing)
kubectl run busybox --image=busybox:1.36 --restart=Never -- sleep 3600

# Check it
kubectl get pod busybox
kubectl exec -it busybox -- sh
# ping, wget, nslookup, etc.
exit

# Clean up
kubectl delete pod busybox
```

---

## Key Takeaways

- A Pod is the smallest Kubernetes unit — one or more containers sharing network/storage
- `kubectl apply -f pod.yaml` deploys the resource declaratively
- `kubectl describe` and `kubectl get -o yaml` tell you everything about a resource
- `kubectl port-forward` lets you access a Pod without exposing it
- Bare Pods (without a Deployment) are **not rescheduled** if deleted or if the node fails
- Always use Deployments for stateless apps in production

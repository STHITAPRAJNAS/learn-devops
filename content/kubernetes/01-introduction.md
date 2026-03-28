# Introduction to Kubernetes

## Why Kubernetes?

Running containers with `docker run` is great for a single machine. But in production, you need to:

- Run **hundreds or thousands** of containers across **multiple machines**
- **Automatically restart** containers that crash
- **Scale** up when traffic spikes and scale down to save money
- **Roll out updates** without downtime
- **Route traffic** to healthy containers
- **Store config and secrets** separately from your code

This is **container orchestration** — and Kubernetes (K8s) is the industry-standard solution.

> Kubernetes was open-sourced by Google in 2014, based on lessons from running billions of containers at Google scale (the internal system was called Borg). The CNCF (Cloud Native Computing Foundation) now maintains it.

---

## The Kubernetes Architecture

A Kubernetes cluster consists of two types of machines:

```
┌─────────────────────────────────────────────────────────────┐
│                     Control Plane                           │
│                                                             │
│  ┌──────────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │  API Server  │  │Scheduler │  │  Controller Manager  │  │
│  │(kube-apiserver)│ │(kube-    │  │  (kube-controller-  │  │
│  │              │  │scheduler)│  │   manager)           │  │
│  └──────────────┘  └──────────┘  └──────────────────────┘  │
│         │                                                   │
│  ┌──────▼─────────────────────────────────────────────────┐ │
│  │                    etcd                                │ │
│  │           (Distributed Key-Value Store)                │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
              │                    │
   ┌──────────┴────┐    ┌──────────┴────┐
   │   Worker Node │    │   Worker Node │
   │               │    │               │
   │  ┌──────────┐ │    │  ┌──────────┐ │
   │  │ kubelet  │ │    │  │ kubelet  │ │
   │  ├──────────┤ │    │  ├──────────┤ │
   │  │kube-proxy│ │    │  │kube-proxy│ │
   │  ├──────────┤ │    │  ├──────────┤ │
   │  │Container │ │    │  │Container │ │
   │  │ Runtime  │ │    │  │ Runtime  │ │
   │  ├──────────┤ │    │  ├──────────┤ │
   │  │  Pod 1   │ │    │  │  Pod 2   │ │
   │  │  Pod 2   │ │    │  │  Pod 3   │ │
   │  └──────────┘ │    │  └──────────┘ │
   └───────────────┘    └───────────────┘
```

### Control Plane Components

| Component | Role |
|-----------|------|
| **kube-apiserver** | The front door. All communication (CLI, internal) goes through the REST API it exposes. Validates and processes requests. |
| **etcd** | The cluster's brain — a distributed key-value store holding the entire desired and actual state. All config lives here. |
| **kube-scheduler** | Watches for unscheduled Pods and assigns them to nodes based on resource requests, affinity rules, and policies. |
| **kube-controller-manager** | Runs control loops that reconcile actual state with desired state: node controller, deployment controller, endpoint controller, etc. |
| **cloud-controller-manager** | (Cloud environments only) Integrates with cloud provider APIs to provision load balancers, volumes, and node instances. |

### Worker Node Components

| Component | Role |
|-----------|------|
| **kubelet** | Agent on every node. Reads Pod specs from the API server and instructs the container runtime. Reports node/pod status back. |
| **kube-proxy** | Maintains network rules on nodes to implement Services (load balancing). Configures iptables or IPVS rules. |
| **Container Runtime** | Actually runs containers: containerd (most common), CRI-O, or Docker Engine. |

---

## Core Kubernetes Objects

Everything in Kubernetes is an **object** — a record of intent stored in etcd. You declare what you *want*, and Kubernetes works to make it so (the **declarative model**).

| Object | Purpose |
|--------|---------|
| **Pod** | Smallest deployable unit. One or more containers sharing network and storage. |
| **ReplicaSet** | Ensures N replicas of a Pod are running. |
| **Deployment** | Manages ReplicaSets. Adds rolling updates and rollback. |
| **Service** | Stable network endpoint to reach a set of Pods. |
| **ConfigMap** | Store non-sensitive configuration. |
| **Secret** | Store sensitive data (passwords, tokens). |
| **Namespace** | Virtual cluster within a cluster — used for isolation. |
| **Ingress** | HTTP/S routing rules to Services. |
| **PersistentVolume** | Storage resource in the cluster. |
| **Job / CronJob** | Run batch tasks once or on a schedule. |

---

## kubectl — The Kubernetes CLI

`kubectl` is your primary tool for interacting with Kubernetes.

### Configuration

```bash
# kubectl reads config from ~/.kube/config
# The config stores cluster addresses and credentials

# Show current context (which cluster you're talking to)
kubectl config current-context

# List all contexts
kubectl config get-contexts

# Switch context (e.g., from dev to prod)
kubectl config use-context prod-cluster

# Show merged kubeconfig
kubectl config view
```

### Essential Commands

```bash
# ─── Get resources ─────────────────────────────────────────────────────────
kubectl get pods
kubectl get pods -n kube-system          # In a specific namespace
kubectl get pods --all-namespaces        # All namespaces
kubectl get pods -o wide                 # More columns (node, IP)
kubectl get pods -o yaml                 # Full YAML representation
kubectl get all                          # Pods, services, deployments, etc.

# ─── Describe (human-readable detail) ──────────────────────────────────────
kubectl describe pod my-pod
kubectl describe node my-node
kubectl describe deployment my-app

# ─── Apply/Create resources ────────────────────────────────────────────────
kubectl apply -f deployment.yaml         # Declarative (preferred)
kubectl apply -f ./manifests/            # Apply all YAML in a directory
kubectl create deployment nginx --image=nginx:alpine  # Imperative

# ─── Delete resources ──────────────────────────────────────────────────────
kubectl delete -f deployment.yaml
kubectl delete pod my-pod
kubectl delete pods --all                # Delete all pods in current namespace

# ─── Logs and debugging ────────────────────────────────────────────────────
kubectl logs my-pod
kubectl logs my-pod -c my-container      # Specific container in pod
kubectl logs -f my-pod                   # Follow
kubectl logs --previous my-pod          # Logs from previous (crashed) instance

# ─── Execute commands ──────────────────────────────────────────────────────
kubectl exec -it my-pod -- bash
kubectl exec -it my-pod -c sidecar -- sh

# ─── Port forwarding ───────────────────────────────────────────────────────
kubectl port-forward pod/my-pod 8080:80
kubectl port-forward svc/my-service 8080:80
kubectl port-forward deployment/my-app 8080:8080

# ─── Resource editing ──────────────────────────────────────────────────────
kubectl edit deployment my-app           # Open in $EDITOR
kubectl patch deployment my-app -p '{"spec":{"replicas":5}}'

# ─── Watching resources ────────────────────────────────────────────────────
kubectl get pods --watch
kubectl get events --sort-by=.lastTimestamp
```

---

## The Declarative Model

Kubernetes uses a **declarative** approach: you describe the *desired state* in YAML, and Kubernetes continuously works to reconcile the actual state with it.

```yaml
# desired-state.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
spec:
  replicas: 3          # I WANT 3 replicas
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:1.25-alpine
        ports:
        - containerPort: 80
```

```bash
kubectl apply -f desired-state.yaml
# Kubernetes ensures 3 nginx pods are running
# If one crashes, Kubernetes restarts it
# If a node fails, Kubernetes reschedules pods on healthy nodes
```

---

## Namespaces

Namespaces are virtual clusters within your cluster. They provide:
- **Resource isolation** between teams or environments
- **RBAC boundaries** — grant access per namespace
- **Resource quotas** — limit CPU/memory per namespace

```bash
# List namespaces
kubectl get namespaces

# Default namespaces:
# default       — where your workloads go unless specified
# kube-system   — Kubernetes system components
# kube-public   — publicly readable data
# kube-node-lease — node heartbeats

# Create a namespace
kubectl create namespace dev
kubectl create namespace staging
kubectl create namespace production

# Work within a namespace
kubectl get pods -n dev
kubectl apply -f app.yaml -n dev

# Set default namespace for your session
kubectl config set-context --current --namespace=dev

# Delete everything in a namespace
kubectl delete all --all -n dev
```

---

## Getting a Local Cluster

For learning, several tools create a local Kubernetes cluster:

### kind (Kubernetes in Docker)

```bash
# Install kind
brew install kind  # macOS
# or: curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.22.0/kind-linux-amd64 && chmod +x kind && sudo mv kind /usr/local/bin/

# Create a cluster
kind create cluster --name devops-learn

# Use it
kubectl cluster-info --context kind-devops-learn

# Delete when done
kind delete cluster --name devops-learn
```

### minikube

```bash
# Start a single-node cluster
minikube start

# Enable add-ons
minikube addons enable ingress
minikube addons enable metrics-server

# Get cluster IP
minikube ip

# Stop/delete
minikube stop
minikube delete
```

---

## Try It Yourself

```bash
# Assuming you have a local cluster (kind or minikube)

# 1. Explore the cluster
kubectl cluster-info
kubectl get nodes
kubectl get nodes -o wide   # Shows OS, kernel, container runtime

# 2. Look at system components
kubectl get pods -n kube-system

# 3. Create your first pod (imperative style)
kubectl run hello --image=nginx:alpine --port=80

# 4. Watch it come up
kubectl get pod hello --watch

# 5. Describe it
kubectl describe pod hello

# 6. Access it
kubectl port-forward pod/hello 8080:80
# Open http://localhost:8080

# 7. Clean up
kubectl delete pod hello
```

---

## Key Takeaways

- Kubernetes is an **orchestration platform** — it automates deployment, scaling, and self-healing
- The **control plane** (API server, etcd, scheduler, controllers) manages desired state
- **Worker nodes** (kubelet, kube-proxy, container runtime) run your workloads
- Everything is a **Kubernetes object** defined in YAML and stored in etcd
- Kubernetes is **declarative** — you declare what you want, it figures out how to achieve it
- `kubectl` is your main tool — `apply`, `get`, `describe`, `logs`, `exec`

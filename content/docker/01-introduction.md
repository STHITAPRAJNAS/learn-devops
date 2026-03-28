# Introduction to Docker

## What Is Docker?

Docker is an open-source platform that lets you **build, ship, and run applications inside containers**. A container packages your application's code together with everything it needs to run — libraries, runtime, config — into a single, portable unit that behaves identically on any machine running Docker.

Released by Docker Inc. in 2013, Docker popularised the container model and is now the industry-standard tool for packaging software. Its core components are:

| Component | Role |
|-----------|------|
| **Docker Engine** | The daemon (`dockerd`) that manages containers, images, networks, and volumes |
| **Docker CLI** | The `docker` command you type in your terminal |
| **Docker Hub** | The default public registry for sharing images |
| **BuildKit** | The modern, parallel build engine used by `docker build` |

---

## Containers vs. Virtual Machines

Before Docker, the standard way to isolate an application was to run it inside a **Virtual Machine (VM)**. A VM emulates a complete computer — it includes a full guest OS kernel, device drivers, and all system libraries.

Containers take a radically different approach. Instead of virtualising hardware, they use Linux kernel features to isolate processes on the **same host OS**.

```
Virtual Machines                    Containers
─────────────────────────────────   ─────────────────────────────────
┌─────────┐  ┌─────────┐           ┌──────┐  ┌──────┐  ┌──────┐
│ App A   │  │ App B   │           │App A │  │App B │  │App C │
├─────────┤  ├─────────┤           ├──────┤  ├──────┤  ├──────┤
│ Guest OS│  │ Guest OS│           │ Libs │  │ Libs │  │ Libs │
├─────────┴──┴─────────┤           └──────┴──┴──────┴──┴──────┘
│    Hypervisor        │           ┌─────────────────────────────┐
├──────────────────────┤           │   Container Runtime         │
│    Host OS           │           ├─────────────────────────────┤
├──────────────────────┤           │   Host OS Kernel            │
│    Hardware          │           ├─────────────────────────────┤
└──────────────────────┘           │   Hardware                  │
                                   └─────────────────────────────┘
```

### Key Differences

| Aspect | Virtual Machine | Container |
|--------|----------------|-----------|
| OS overhead | Full guest OS per VM (1–2 GB) | Shared host kernel (MBs) |
| Start time | Minutes | Milliseconds |
| Density | ~10–20 VMs per host | Hundreds per host |
| Isolation | Strong (separate kernel) | Process-level (namespaces) |
| Portability | Heavy disk images (GBs) | Lightweight layers (MBs) |
| Best for | Full OS isolation | Microservices, CI/CD |

> **Key insight:** Containers are not "lightweight VMs." They are isolated processes running on the host kernel. This makes them fast but also means they share the host's kernel version and hardware architecture.

---

## How Docker Works Internally

Docker uses two Linux kernel features to isolate containers:

### 1. Namespaces (Isolation)

Linux namespaces give each container its own view of the system:

- **PID namespace** — Container processes have their own PID tree (PID 1 inside the container is not PID 1 on the host)
- **Network namespace** — Container gets its own network stack, interfaces, and IP address
- **Mount namespace** — Container has its own filesystem view
- **UTS namespace** — Container can have its own hostname
- **IPC namespace** — Separate inter-process communication (message queues, semaphores)
- **User namespace** — Map container root user to an unprivileged host user

### 2. Control Groups / cgroups (Resource Limits)

cgroups limit how much CPU, memory, disk I/O, and network bandwidth a container can use:

```bash
# Limit a container to 512 MB RAM and 1 CPU core
docker run --memory="512m" --cpus="1" nginx
```

### 3. Union Filesystems (Layering)

Docker images use a **union filesystem** (typically OverlayFS) to stack read-only layers. When a container writes a file, changes go to a thin writable layer on top — the image layers below are never modified.

---

## The Docker Architecture

```
┌─────────────────────────────────────────────────┐
│                Docker Client                    │
│   docker build / pull / run / push ...          │
└───────────────────┬─────────────────────────────┘
                    │  REST API (unix socket / TCP)
┌───────────────────▼─────────────────────────────┐
│                Docker Daemon (dockerd)           │
│                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Images   │  │Networks  │  │   Volumes    │  │
│  └──────────┘  └──────────┘  └──────────────┘  │
│                                                 │
│  ┌──────────────────────────────────────────┐   │
│  │         containerd (runtime)             │   │
│  │  ┌────────────┐  ┌────────────────────┐  │   │
│  │  │ Container A│  │    Container B     │  │   │
│  │  └────────────┘  └────────────────────┘  │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
            │                        │
            ▼                        ▼
    Docker Hub               Private Registry
   (docker.io)               (e.g., ECR, GCR)
```

The key flow:
1. You type `docker run nginx`
2. The CLI sends a request to `dockerd` via a Unix socket
3. `dockerd` checks if the `nginx` image is cached locally
4. If not, it pulls layers from Docker Hub
5. `dockerd` asks `containerd` to create a container from the image
6. `containerd` sets up namespaces, cgroups, and mounts
7. Your container is running!

---

## Installing Docker

### Linux (Recommended method)

```bash
# Install using the convenience script
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add your user to the docker group (avoids needing sudo)
sudo usermod -aG docker $USER
newgrp docker  # Apply group change without logging out

# Verify installation
docker --version
docker run hello-world
```

### macOS and Windows

Download **Docker Desktop** from [docker.com/get-docker](https://www.docker.com/get-docker). Docker Desktop runs a lightweight Linux VM under the hood, providing the Linux kernel features containers need.

---

## Your First Container

```bash
# Pull and run the official nginx web server
docker run -d -p 8080:80 --name my-nginx nginx:alpine

# Check it's running
docker ps

# View the access logs
docker logs my-nginx

# Open http://localhost:8080 in your browser

# Stop and remove the container
docker stop my-nginx
docker rm my-nginx
```

Let's break down `docker run -d -p 8080:80 --name my-nginx nginx:alpine`:

| Part | Meaning |
|------|---------|
| `docker run` | Create and start a container |
| `-d` | Detached mode — run in the background |
| `-p 8080:80` | Map host port 8080 → container port 80 |
| `--name my-nginx` | Give the container a memorable name |
| `nginx:alpine` | Use the `nginx` image tagged `alpine` (Alpine Linux base) |

---

## Core Docker Concepts Summary

| Concept | Definition |
|---------|-----------|
| **Image** | A read-only template with layers. Blueprint for containers. |
| **Container** | A running instance of an image. Has a writable layer. |
| **Registry** | A server that stores and distributes images (e.g., Docker Hub). |
| **Dockerfile** | A text file of instructions for building an image. |
| **Volume** | Persistent storage that survives container deletion. |
| **Network** | Virtual network connecting containers. |
| **Compose** | Tool for running multi-container apps from a YAML file. |

---

## Try It Yourself

1. **Run an interactive Ubuntu container:**
   ```bash
   docker run -it --rm ubuntu:22.04 bash
   # Inside the container:
   cat /etc/os-release
   ps aux
   exit
   ```

2. **Explore a container's filesystem:**
   ```bash
   docker run -d --name explore nginx:alpine
   docker exec -it explore sh
   # Inside the container:
   ls /usr/share/nginx/html
   exit
   docker rm -f explore
   ```

3. **Inspect the Docker system:**
   ```bash
   docker info           # Docker daemon details
   docker system df      # Disk usage by images, containers, volumes
   docker system prune   # Remove all unused resources
   ```

---

## Key Takeaways

- Docker packages apps and their dependencies into **containers** that run consistently anywhere
- Containers use Linux **namespaces** for isolation and **cgroups** for resource limits
- Containers share the host kernel — they are lighter and faster than VMs
- `dockerd` (the daemon) does the heavy lifting; the `docker` CLI just sends API requests
- Images are immutable and layered; containers add a thin writable layer on top

# Docker Images and Containers

## Understanding Docker Images

A Docker image is a **read-only, layered filesystem** that contains everything needed to run an application: the OS base, runtime, libraries, configuration, and your code.

### Image Naming Convention

Images follow the format: `[registry/][namespace/]name[:tag]`

```
docker.io/library/nginx:1.25-alpine
│          │       │     │
│          │       │     └── Tag (version/variant)
│          │       └──────── Repository name
│          └──────────────── Namespace (library = official)
└─────────────────────────── Registry (docker.io = Docker Hub)
```

Common shorthand: `nginx:alpine`, `ubuntu:22.04`, `python:3.12-slim`

If you omit the tag, Docker uses `:latest` — which is not always the newest version. **Always pin tags in production.**

---

## Image Layers Explained

Every instruction in a Dockerfile creates a new read-only **layer**. Layers are content-addressed (identified by a SHA256 hash) and are shared between images.

```bash
# Pull the nginx image and observe the layer downloads
docker pull nginx:alpine

# Output:
# alpine: Pulling from library/nginx
# 4abcf2066143: Pull complete   ← OS base layer
# 6aef6de2e1d0: Pull complete   ← Package installs
# 8b0a93dbc5d8: Pull complete   ← nginx config
# Digest: sha256:...
# Status: Downloaded newer image for nginx:alpine
```

### Why Layers Matter

1. **Caching** — unchanged layers are reused during `docker build`, speeding up builds
2. **Sharing** — if two images share a base layer, it's stored once on disk
3. **Diffs** — each layer is only the delta from the previous layer

```
Image: my-app:latest
─────────────────────────────────────────
  Layer 4:  COPY ./app /app         (your code, small)
  Layer 3:  RUN npm install          (dependencies, large)
  Layer 2:  COPY package*.json /app  (small)
  Layer 1:  node:18-alpine           (base, ~50 MB)
─────────────────────────────────────────
```

When you `docker run my-app`, Docker adds a thin **writable layer** on top. All changes made while the container is running (logs, temp files, database writes) go here. This writable layer is **discarded** when the container is removed.

---

## Essential Image Commands

### Pulling Images

```bash
# Pull the latest version of an image
docker pull ubuntu

# Pull a specific version
docker pull ubuntu:22.04

# Pull from a private registry
docker pull registry.company.com/myapp:v1.2.3

# Pull all tags for an image
docker pull --all-tags python
```

### Listing and Inspecting Images

```bash
# List all locally cached images
docker images
# Shorthand:
docker image ls

# Show all images including intermediate layers
docker images -a

# Filter images by name
docker images nginx

# Inspect image metadata (JSON output)
docker inspect nginx:alpine

# Show image history (layers)
docker history nginx:alpine
docker history --no-trunc nginx:alpine  # Full commands

# Show image disk usage
docker system df -v
```

### Tagging Images

```bash
# Tag an existing image with a new name
docker tag my-app:latest registry.io/myteam/my-app:v1.0.0

# Multiple tags for the same image
docker tag my-app:latest my-app:1.0.0
docker tag my-app:latest my-app:stable
```

### Removing Images

```bash
# Remove a specific image
docker rmi nginx:alpine

# Remove multiple images
docker rmi nginx:alpine ubuntu:22.04

# Force remove (even if containers reference it)
docker rmi -f my-app:latest

# Remove all unused images (not referenced by any container)
docker image prune

# Remove ALL images (destructive!)
docker image prune -a
```

---

## Working with Containers

### Creating and Starting Containers

```bash
# The most common command: run a container from an image
docker run [OPTIONS] IMAGE [COMMAND]

# Interactive terminal (-it) with automatic removal on exit (--rm)
docker run -it --rm ubuntu:22.04 bash

# Detached (background) mode
docker run -d nginx:alpine

# Name your container
docker run -d --name webserver nginx:alpine

# With port mapping: host_port:container_port
docker run -d -p 3000:3000 --name api node:18-alpine

# With environment variables
docker run -d \
  -e POSTGRES_PASSWORD=secret \
  -e POSTGRES_DB=mydb \
  --name db \
  postgres:15-alpine

# With resource limits
docker run -d \
  --memory="256m" \
  --cpus="0.5" \
  --name limited-app \
  nginx:alpine
```

### Listing Containers

```bash
# Running containers only
docker ps

# All containers (running + stopped)
docker ps -a

# Just container IDs (useful for scripting)
docker ps -aq

# Filter by status
docker ps -a --filter "status=exited"

# Custom format
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

### Managing Container Lifecycle

```bash
# Stop a container gracefully (SIGTERM, then SIGKILL after 10s)
docker stop webserver

# Stop with a custom timeout (seconds)
docker stop -t 30 webserver

# Kill immediately (SIGKILL)
docker kill webserver

# Start a stopped container
docker start webserver

# Restart a container
docker restart webserver

# Pause/unpause (freeze processes)
docker pause webserver
docker unpause webserver

# Remove a stopped container
docker rm webserver

# Remove a running container (force)
docker rm -f webserver

# Remove all stopped containers
docker container prune
```

### Inspecting Containers

```bash
# View container logs
docker logs webserver

# Follow logs in real-time (like tail -f)
docker logs -f webserver

# Last 50 lines
docker logs --tail=50 webserver

# With timestamps
docker logs -t webserver

# Detailed container information (JSON)
docker inspect webserver

# Container resource usage (live)
docker stats
docker stats webserver --no-stream  # One-time snapshot

# Processes running inside the container
docker top webserver
```

### Running Commands in Containers

```bash
# Execute a command in a running container
docker exec webserver ls /usr/share/nginx/html

# Interactive shell in a running container
docker exec -it webserver sh

# Run as a specific user
docker exec -u root webserver bash

# Set environment variables
docker exec -e DEBUG=1 webserver node app.js
```

---

## Copying Files

```bash
# Copy file FROM container to host
docker cp webserver:/etc/nginx/nginx.conf ./nginx.conf

# Copy file FROM host TO container
docker cp ./index.html webserver:/usr/share/nginx/html/index.html

# Copy directory
docker cp webserver:/var/log/nginx ./nginx-logs
```

---

## Container Networking Basics

```bash
# Publish a specific port
docker run -d -p 8080:80 nginx:alpine         # host:container

# Publish to a specific host interface only
docker run -d -p 127.0.0.1:8080:80 nginx:alpine  # localhost only

# Publish all EXPOSED ports to random host ports
docker run -d -P nginx:alpine

# See which ports are published
docker port webserver
```

---

## Saving and Loading Images

```bash
# Save an image to a tar archive (for air-gapped transfer)
docker save nginx:alpine -o nginx-alpine.tar
docker save nginx:alpine | gzip > nginx-alpine.tar.gz

# Load an image from a tar archive
docker load -i nginx-alpine.tar
docker load < nginx-alpine.tar.gz

# Export a container's filesystem (no layer history)
docker export webserver -o webserver.tar

# Import a container filesystem as a new image
docker import webserver.tar my-snapshot:latest
```

> **`save` vs `export`:** `docker save` preserves all layers and metadata — use it to transfer images. `docker export` creates a flat snapshot of the container's filesystem — useful for debugging but loses layer history.

---

## Try It Yourself

### Exercise 1: Explore Image Layers

```bash
# Pull a small image
docker pull alpine:3.19

# How many layers?
docker history alpine:3.19

# Inspect the full manifest
docker inspect alpine:3.19 | python3 -m json.tool | head -60
```

### Exercise 2: Container Lifecycle

```bash
# Start a container that runs a counter
docker run -d --name counter alpine:3.19 \
  sh -c "i=0; while true; do echo \$i; i=\$((i+1)); sleep 1; done"

# Watch the output
docker logs -f counter

# Ctrl+C to stop watching logs (container keeps running)

# Check resource usage
docker stats counter --no-stream

# Pause the counter
docker pause counter
docker logs --tail=5 counter   # No new lines

# Resume
docker unpause counter
docker logs --tail=5 counter   # Counting again

# Clean up
docker rm -f counter
```

### Exercise 3: File Copying

```bash
# Create a container
docker run -d --name filetest nginx:alpine

# Modify a file inside the container
docker exec filetest sh -c 'echo "<h1>Hello from Docker!</h1>" > /usr/share/nginx/html/index.html'

# Copy it out to inspect
docker cp filetest:/usr/share/nginx/html/index.html ./my-index.html
cat my-index.html

# Clean up
docker rm -f filetest
rm my-index.html
```

---

## Key Takeaways

- Docker images are **layered, read-only filesystems** — each layer is a diff from the previous
- Containers add a thin **writable layer** on top; it is lost when the container is removed
- `docker ps -a` shows all containers; `docker images` shows all local images
- Use `docker exec -it <name> sh` to get a shell inside a running container
- `docker inspect` gives you full JSON metadata about images and containers
- Always pin image tags (e.g., `nginx:1.25-alpine`) — never rely on `:latest` in production

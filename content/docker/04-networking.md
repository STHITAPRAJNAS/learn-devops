# Docker Networking

## Overview

Every container gets its own isolated network stack by default. Docker provides several **network drivers** that control how containers connect to each other and to the outside world.

```bash
# List all networks on your Docker host
docker network ls

# Output:
# NETWORK ID     NAME      DRIVER    SCOPE
# 3f8a2b4c9d1e   bridge    bridge    local
# 9e7f1a2b3c4d   host      host      local
# 1c2d3e4f5a6b   none      null      local
```

---

## Network Drivers

### 1. bridge (Default)

The `bridge` driver creates a virtual network on the host. Containers on the same bridge network can communicate using their IP addresses.

```
Host machine
┌──────────────────────────────────────────────────┐
│                                                  │
│  docker0 bridge (172.17.0.1/16)                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  │
│  │ Container A│  │ Container B│  │ Container C│  │
│  │172.17.0.2  │  │172.17.0.3  │  │172.17.0.4  │  │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  │
│        └───────────────┴───────────────┘         │
│                  docker0 bridge                   │
│                       │                           │
│               eth0 (host NIC)                     │
└──────────────────────────────────────────────────┘
            │
         Internet
```

**Default bridge (docker0):** Containers can communicate by IP, but NOT by name. Legacy, not recommended for new projects.

**User-defined bridge:** Containers can reach each other by **container name** (Docker provides embedded DNS). Recommended for multi-container apps.

```bash
# Create a user-defined bridge network
docker network create --driver bridge my-network

# Run containers on that network
docker run -d --name db --network my-network postgres:15-alpine
docker run -d --name app --network my-network \
  -e DATABASE_URL=postgres://db:5432/mydb \
  my-app:latest

# 'app' can resolve 'db' by hostname — Docker's DNS handles it
docker exec app ping db   # Works!
```

### 2. host

The container shares the host's network namespace — it has no isolation. Ports opened inside the container appear directly on the host.

```bash
docker run -d --network host nginx:alpine
# Port 80 is now open on the host — no -p flag needed
```

Use cases: maximum performance (no network address translation), legacy apps, `tcpdump`-style debugging.

> **Warning:** The container can access all host interfaces. Not available on macOS/Windows (no direct Linux kernel).

### 3. none

No network interface except loopback. Maximum isolation — the container cannot reach anything.

```bash
docker run -it --network none ubuntu:22.04 bash
# curl, ping — nothing works
```

Use cases: batch jobs that need no network, sensitive data processing.

### 4. overlay (Swarm/multi-host)

Spans multiple Docker hosts (Swarm mode or Kubernetes). Covered in the Kubernetes section.

### 5. macvlan

Assigns a MAC address to the container so it appears as a physical device on the LAN. Advanced use case for legacy apps that need to be on the physical network.

---

## User-Defined Bridge Networks in Depth

User-defined networks are **strongly recommended** over the default docker0 bridge because they:

- Provide **automatic DNS resolution** by container name
- **Isolate** containers from other projects
- Support **network aliases** for failover
- Allow containers to be attached/detached at runtime

```bash
# Create a network with a specific subnet
docker network create \
  --driver bridge \
  --subnet 192.168.100.0/24 \
  --gateway 192.168.100.1 \
  app-network

# Inspect the network
docker network inspect app-network

# Connect a running container to an additional network
docker network connect app-network my-container

# Disconnect
docker network disconnect app-network my-container

# Remove a network (all connected containers must be stopped first)
docker network rm app-network
```

### DNS Resolution

On user-defined networks, Docker runs an embedded DNS server at `127.0.0.11`:

```bash
# Start two containers on the same network
docker network create demo-net
docker run -d --name web --network demo-net nginx:alpine
docker run -d --name api --network demo-net nginx:alpine

# From 'api', resolve 'web' by name
docker exec api nslookup web
# Server:  127.0.0.11
# Address: 127.0.0.11:53
# Name:    web
# Address: 172.18.0.2
```

---

## Port Publishing

Publishing a port creates a NAT rule that forwards traffic from the host to the container.

```bash
# Map host port 8080 to container port 80
docker run -d -p 8080:80 nginx:alpine

# Bind to a specific host interface (localhost only)
docker run -d -p 127.0.0.1:8080:80 nginx:alpine

# UDP port
docker run -d -p 5353:5353/udp dns-server:latest

# Publish all EXPOSED ports to random host ports
docker run -d -P nginx:alpine

# See the mapping
docker port <container>
```

**Important:** Port publishing only matters for accessing containers from outside Docker (host, internet). Containers on the same user-defined network talk directly without port publishing.

---

## Practical Example: Multi-Container Application

A typical web app has a frontend, backend API, and database:

```bash
# Create an isolated network
docker network create --driver bridge webapp-net

# Start the database (no ports exposed to host)
docker run -d \
  --name postgres \
  --network webapp-net \
  -e POSTGRES_DB=myapp \
  -e POSTGRES_USER=app \
  -e POSTGRES_PASSWORD=supersecret \
  postgres:15-alpine

# Start the API server (connects to postgres by name)
docker run -d \
  --name api \
  --network webapp-net \
  -e DATABASE_HOST=postgres \
  -e DATABASE_PORT=5432 \
  -p 127.0.0.1:4000:4000 \
  my-api:latest

# Start the frontend (connects to API)
docker run -d \
  --name frontend \
  --network webapp-net \
  -e API_URL=http://api:4000 \
  -p 80:3000 \
  my-frontend:latest

# Containers can reach each other by name:
# frontend -> http://api:4000
# api      -> postgres://postgres:5432/myapp
```

---

## Docker Compose Networking

Docker Compose creates a **user-defined network per project** automatically. Services can resolve each other by their service name:

```yaml
# docker-compose.yml
version: "3.9"

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: myapp
      POSTGRES_USER: app
      POSTGRES_PASSWORD: supersecret
    # Not published to host — only accessible within the network

  api:
    build: ./api
    environment:
      DATABASE_URL: postgres://app:supersecret@postgres:5432/myapp
    ports:
      - "4000:4000"
    depends_on:
      - postgres

  frontend:
    build: ./frontend
    environment:
      NEXT_PUBLIC_API_URL: http://api:4000
    ports:
      - "3000:3000"
    depends_on:
      - api

# Docker Compose creates a 'myproject_default' network
# All three services are on it and resolve each other by service name
```

```bash
docker compose up -d
docker compose ps
docker compose logs -f api
```

---

## Network Troubleshooting

```bash
# Inspect a container's network settings
docker inspect my-container | python3 -m json.tool | grep -A 20 '"Networks"'

# Test connectivity from inside a container
docker exec my-container ping -c 3 other-container
docker exec my-container curl -v http://api:4000/health

# Check DNS resolution
docker exec my-container nslookup postgres

# Capture traffic (requires NET_ADMIN capability)
docker run --rm --network container:my-container \
  nicolaka/netshoot tcpdump -i eth0 -n

# List all network namespaces
docker network inspect bridge --format '{{range .Containers}}{{.Name}}: {{.IPv4Address}}{{"\n"}}{{end}}'
```

---

## Try It Yourself

### Exercise: Nginx + Redis Communication

```bash
# Create a network
docker network create redis-demo

# Start Redis (no port published — only for internal use)
docker run -d --name redis --network redis-demo redis:7-alpine

# Start a container with redis-cli to interact with Redis
docker run -it --rm --network redis-demo redis:7-alpine redis-cli -h redis

# Inside redis-cli:
# PING
# SET greeting "Hello from Docker networking!"
# GET greeting
# QUIT

# Try to reach Redis from outside the network (should fail)
docker run --rm alpine ping -c 1 redis  # No route to host — correct!

# Clean up
docker rm -f redis
docker network rm redis-demo
```

---

## Key Takeaways

- The **bridge** driver is the default — containers get isolated network namespaces
- **User-defined bridge networks** provide automatic DNS — containers reach each other by name
- The **host** driver gives maximum performance but no network isolation
- Port publishing (`-p host:container`) exposes containers to the outside world
- Docker Compose creates a project network automatically — services resolve by service name
- Containers on different networks cannot communicate by default (use `docker network connect`)

# Docker Volumes and Storage

## The Problem: Ephemeral Container Storage

When a container writes data, those changes go into a thin **writable layer** that lives and dies with the container. Delete the container, lose the data.

```bash
# Demonstration of ephemeral storage
docker run -d --name ephemeral alpine sh -c "echo 'important data' > /data.txt && sleep 60"
docker exec ephemeral cat /data.txt     # "important data"
docker rm -f ephemeral
docker run --rm alpine cat /data.txt    # Error: No such file — data is GONE
```

Docker provides three ways to persist or share data:

| Type | Managed by | Use case |
|------|-----------|---------|
| **Named Volume** | Docker | Databases, persistent app state |
| **Bind Mount** | You (host path) | Development, config files |
| **tmpfs mount** | Kernel RAM | Sensitive data, high-performance temp |

---

## Named Volumes

Named volumes are created and managed entirely by Docker. Their data lives in `/var/lib/docker/volumes/<name>/_data` on the host.

### Creating and Using Volumes

```bash
# Explicitly create a volume
docker volume create db-data

# Run a container with the volume mounted
docker run -d \
  --name postgres \
  -e POSTGRES_PASSWORD=secret \
  -v db-data:/var/lib/postgresql/data \
  postgres:15-alpine

# The data in /var/lib/postgresql/data persists even if the container is removed
docker rm -f postgres

# Start a new container — the data is still there!
docker run -d \
  --name postgres-v2 \
  -e POSTGRES_PASSWORD=secret \
  -v db-data:/var/lib/postgresql/data \
  postgres:15-alpine

# Or use --mount syntax (more explicit, preferred in Docker documentation)
docker run -d \
  --name postgres-v3 \
  --mount type=volume,source=db-data,target=/var/lib/postgresql/data \
  postgres:15-alpine
```

### Volume Commands

```bash
# List volumes
docker volume ls

# Inspect a volume
docker volume inspect db-data
# Output includes Mountpoint (host path), labels, driver

# Remove a specific volume (must not be in use)
docker volume rm db-data

# Remove all unused volumes (CAUTION: data loss!)
docker volume prune

# Show volumes in docker system df
docker system df -v
```

### Volume Sharing Between Containers

```bash
# Create a shared volume
docker volume create shared-logs

# Writer container
docker run -d --name writer \
  -v shared-logs:/logs \
  alpine sh -c "while true; do echo \$(date) >> /logs/app.log; sleep 2; done"

# Reader container (read-only)
docker run -d --name reader \
  -v shared-logs:/logs:ro \
  alpine sh -c "tail -f /logs/app.log"

docker logs reader   # See the log entries
docker rm -f writer reader
```

---

## Bind Mounts

A bind mount maps a **specific host directory or file** into the container. Changes are reflected immediately in both directions.

```bash
# Mount the current directory into the container
docker run -d \
  --name dev-server \
  -v $(pwd):/app \      # host path : container path
  -w /app \
  -p 3000:3000 \
  node:18-alpine \
  npm run dev

# The container sees your local code changes immediately — great for development!

# Explicit --mount syntax
docker run -d \
  --mount type=bind,source="$(pwd)",target=/app \
  node:18-alpine
```

### Common Bind Mount Patterns

```bash
# Mount a single config file (read-only)
docker run -d \
  --name nginx \
  -v $(pwd)/nginx.conf:/etc/nginx/nginx.conf:ro \
  -p 8080:80 \
  nginx:alpine

# Mount a directory for local development
docker run -it --rm \
  -v $(pwd):/workspace \
  -w /workspace \
  python:3.12-slim \
  bash

# Share SSH keys (read-only, for git inside container)
docker run -it --rm \
  -v ~/.ssh:/root/.ssh:ro \
  -v $(pwd):/workspace \
  -w /workspace \
  alpine/git \
  git clone git@github.com:org/repo.git
```

### Bind Mounts in Docker Compose (Development)

```yaml
version: "3.9"
services:
  app:
    build: .
    volumes:
      # Bind mount for live code reload
      - ./src:/app/src
      # Anonymous volume to prevent host node_modules from overwriting container's
      - /app/node_modules
    ports:
      - "3000:3000"
    command: npm run dev
```

The anonymous volume `/app/node_modules` is a useful trick: it ensures the container's `node_modules` (installed during build) is not shadowed by the potentially-absent or OS-incompatible host `node_modules`.

---

## tmpfs Mounts

A tmpfs mount lives in the host's RAM and is never written to disk. It is automatically removed when the container stops.

```bash
# Use tmpfs for sensitive data (secrets in memory, never on disk)
docker run -d \
  --name secure-app \
  --tmpfs /run/secrets:rw,size=1m,mode=1777 \
  my-secure-app:latest

# --mount syntax
docker run -d \
  --mount type=tmpfs,target=/run/secrets,tmpfs-size=1048576 \
  my-secure-app:latest
```

Use cases:
- Session data for stateless services
- Secrets that must never hit disk
- High-speed temp files (in-memory processing)

---

## Volume Drivers

Docker supports third-party volume drivers that store data in cloud storage, NFS, or other backends:

```bash
# AWS EFS via rexray driver
docker volume create --driver rexray/efs \
  --opt size=50 \
  --name efs-vol

# NFS volume (built-in driver)
docker volume create \
  --driver local \
  --opt type=nfs \
  --opt o=addr=192.168.1.100,rw \
  --opt device=:/exports/data \
  nfs-vol
```

---

## Backup and Restore Volumes

```bash
# ─── Backup ────────────────────────────────────────────────────────────────

# Use a temporary container to tar the volume contents
docker run --rm \
  -v db-data:/data:ro \
  -v $(pwd)/backups:/backup \
  alpine \
  tar czf /backup/db-data-$(date +%Y%m%d).tar.gz -C /data .

# ─── Restore ───────────────────────────────────────────────────────────────

# Create a fresh volume
docker volume create db-data-restored

# Extract the backup into it
docker run --rm \
  -v db-data-restored:/data \
  -v $(pwd)/backups:/backup:ro \
  alpine \
  tar xzf /backup/db-data-20240101.tar.gz -C /data
```

---

## Storage Best Practices

### 1. Use Named Volumes for Databases

Always use named volumes for databases. Never rely on the container's writable layer.

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:15-alpine
    volumes:
      - pg-data:/var/lib/postgresql/data

volumes:
  pg-data:
    driver: local   # default; store on host
```

### 2. Bind Mounts for Development Only

Bind mounts are great in development but **avoid them in production** — they couple the container to a specific host path.

### 3. Read-Only Filesystems

For security, mount the container filesystem as read-only and only allow writes to specific volumes:

```bash
docker run -d \
  --read-only \
  --tmpfs /tmp \                    # Allow writes to /tmp in RAM
  -v app-logs:/var/log/app \        # Allow logs to persist
  my-app:latest
```

### 4. Volume Labels

```bash
docker volume create \
  --label com.company.project=myapp \
  --label com.company.env=production \
  myapp-prod-data
```

---

## Try It Yourself

### Exercise 1: Postgres with Persistent Volume

```bash
# Create volume and start Postgres
docker volume create pg-data
docker run -d \
  --name mydb \
  -e POSTGRES_PASSWORD=devpass \
  -e POSTGRES_USER=dev \
  -e POSTGRES_DB=testdb \
  -v pg-data:/var/lib/postgresql/data \
  -p 5432:5432 \
  postgres:15-alpine

# Connect and create a table
docker exec -it mydb psql -U dev -d testdb -c "
  CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT);
  INSERT INTO users (name) VALUES ('Alice'), ('Bob');
  SELECT * FROM users;
"

# Destroy the container
docker rm -f mydb

# Bring it back — data persists!
docker run -d \
  --name mydb2 \
  -e POSTGRES_PASSWORD=devpass \
  -e POSTGRES_USER=dev \
  -e POSTGRES_DB=testdb \
  -v pg-data:/var/lib/postgresql/data \
  -p 5432:5432 \
  postgres:15-alpine

docker exec -it mydb2 psql -U dev -d testdb -c "SELECT * FROM users;"
# Alice and Bob are still there!

# Clean up
docker rm -f mydb2
docker volume rm pg-data
```

### Exercise 2: Bind Mount Development Server

```bash
mkdir ~/devtest && cd ~/devtest
echo '<!DOCTYPE html><html><body><h1>Live reload test</h1></body></html>' > index.html

docker run -d \
  --name dev \
  -v $(pwd):/usr/share/nginx/html:ro \
  -p 8080:80 \
  nginx:alpine

# Open http://localhost:8080

# Edit index.html on your host — browser refresh shows the change instantly

docker rm -f dev
```

---

## Key Takeaways

- Container writable layers are **ephemeral** — always use volumes for data you care about
- **Named volumes** are Docker-managed and portable — ideal for databases and app state
- **Bind mounts** link host paths — ideal for development hot-reload
- **tmpfs** keeps data in RAM — ideal for secrets and high-speed temp storage
- Use `docker volume prune` carefully — it permanently deletes volume data
- In Docker Compose, declare volumes under the top-level `volumes:` key to make them explicit and persistent across `docker compose down`

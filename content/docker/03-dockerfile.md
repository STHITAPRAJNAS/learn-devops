# Writing Dockerfiles

## What Is a Dockerfile?

A **Dockerfile** is a plain-text file containing a sequence of instructions that Docker reads to build an image. Think of it as a reproducible recipe: anyone with the Dockerfile and its referenced files can build the exact same image.

```bash
# Build an image from the Dockerfile in the current directory
docker build -t my-app:1.0.0 .

# Build from a specific file
docker build -f Dockerfile.prod -t my-app:prod .

# Pass build arguments
docker build --build-arg NODE_ENV=production -t my-app:prod .
```

---

## Core Dockerfile Instructions

### FROM — Choose Your Base Image

Every Dockerfile starts with `FROM`. It sets the base layer your image builds upon.

```dockerfile
# Use official Node.js 18 on Alpine Linux (tiny base)
FROM node:18-alpine

# Scratch: truly empty — only for statically compiled binaries
FROM scratch

# Name a build stage (for multi-stage builds)
FROM node:18-alpine AS builder
```

**Common base image choices:**

| Base | Size | Use case |
|------|------|---------|
| `alpine:3.19` | ~7 MB | Smallest; fewer tools |
| `debian:bookworm-slim` | ~80 MB | Good compatibility |
| `ubuntu:22.04` | ~77 MB | Familiar environment |
| `distroless/nodejs` | ~55 MB | Security-hardened, no shell |
| `scratch` | 0 B | Statically linked binaries only |

---

### RUN — Execute Commands

```dockerfile
# Single command
RUN apt-get update

# Chain multiple commands with && to keep in ONE layer
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*
```

> **Best Practice:** Always clean up package manager caches in the same `RUN` instruction. If you clean in a separate `RUN`, the cache files are already committed to the previous layer.

---

### COPY and ADD

```dockerfile
# COPY is preferred for most cases — it's explicit and predictable
COPY package.json package-lock.json ./
COPY src/ ./src/

# Copy with ownership change (avoids a separate RUN chown)
COPY --chown=node:node . .

# ADD can extract tar archives and fetch URLs (but avoid URLs — use curl/wget in RUN instead)
ADD source.tar.gz /opt/

# Copy from a named build stage
COPY --from=builder /app/dist ./dist
```

---

### WORKDIR — Set the Working Directory

```dockerfile
# Sets the directory for all subsequent RUN, COPY, CMD, ENTRYPOINT instructions
WORKDIR /app

# WORKDIR creates the directory if it doesn't exist
# Avoid using RUN mkdir && cd — that only affects the current RUN layer
```

---

### ENV — Environment Variables

```dockerfile
# Available during build AND at runtime
ENV NODE_ENV=production
ENV PORT=3000

# Multiple values in one instruction (modern syntax)
ENV NODE_ENV=production \
    PORT=3000 \
    LOG_LEVEL=info
```

---

### ARG — Build-Time Variables

```dockerfile
# Only available during build, NOT in the final image
ARG APP_VERSION=1.0.0
ARG BUILD_DATE

# Use it
RUN echo "Building version $APP_VERSION on $BUILD_DATE"

# Pass from the command line
# docker build --build-arg APP_VERSION=2.0.0 .
```

> **Security:** Never use `ARG` for secrets (passwords, API keys). Build args are visible in `docker history`. Use Docker BuildKit secrets instead.

---

### EXPOSE — Document Ports

```dockerfile
# Documents that the container listens on port 8080
# Does NOT actually publish the port — that's done with -p at runtime
EXPOSE 8080
EXPOSE 443/tcp
EXPOSE 5353/udp
```

---

### CMD and ENTRYPOINT — Define the Default Command

```dockerfile
# CMD — default command, easily overridden
CMD ["node", "server.js"]

# ENTRYPOINT — defines the executable, harder to override
ENTRYPOINT ["node"]
CMD ["server.js"]   # Default argument to ENTRYPOINT

# Shell form vs exec form:
CMD node server.js          # Shell form: run via /bin/sh -c (PID 1 is sh)
CMD ["node", "server.js"]  # Exec form: run directly (PID 1 is node) ← preferred
```

**Why exec form is preferred:** In exec form, your process is PID 1 and receives Unix signals (SIGTERM for graceful shutdown) directly. In shell form, `/bin/sh` is PID 1 and may not pass signals to your process.

---

### USER — Non-Root User

```dockerfile
# Create a non-root user and switch to it
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Or use a named user from the base image
USER node          # node:18-alpine already has a 'node' user
```

> **Security:** Running as root inside a container is a security risk. Always drop to a non-root user before the final stage.

---

### HEALTHCHECK

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1
```

---

## Multi-Stage Builds

Multi-stage builds are the single most impactful Dockerfile optimisation. They allow you to use a large, tooling-rich image to build your app and then copy only the output into a minimal final image.

### Example: Node.js Application

```dockerfile
# ─── Stage 1: Build ────────────────────────────────────────────────────────
FROM node:18-alpine AS builder

WORKDIR /app

# Copy dependency manifests first (cache layer if deps don't change)
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copy source and build
COPY tsconfig.json .
COPY src/ ./src/
RUN npm run build

# ─── Stage 2: Production ───────────────────────────────────────────────────
FROM node:18-alpine AS production

# Security: create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy only the production artifacts from the builder stage
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist

USER appuser

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
```

Without multi-stage: image might be **800 MB** (includes TypeScript compiler, dev dependencies, source maps).
With multi-stage: image might be **120 MB** (only runtime Node.js + compiled JS + prod deps).

### Example: Go Binary (Extreme Minimalism)

```dockerfile
# ─── Build stage ───────────────────────────────────────────────────────────
FROM golang:1.22-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o server ./cmd/server

# ─── Final stage: use scratch (zero base) ──────────────────────────────────
FROM scratch

COPY --from=builder /app/server /server
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

EXPOSE 8080
ENTRYPOINT ["/server"]
```

Result: an image that is **only the compiled binary** — often under 10 MB!

---

## Dockerfile Best Practices

### 1. Order Instructions by Stability (Cache Efficiency)

Docker rebuilds from the first changed instruction downwards. Put stable, slow steps first.

```dockerfile
# BAD: copy everything first, then install deps
# Any code change invalidates the npm install cache
FROM node:18-alpine
WORKDIR /app
COPY . .                   # Code changes here...
RUN npm ci                 # ...force full reinstall every time

# GOOD: copy manifests first, install deps, THEN copy source
FROM node:18-alpine
WORKDIR /app
COPY package.json package-lock.json ./   # Only changes when deps change
RUN npm ci                               # Cached unless deps change
COPY . .                                 # Code changes here (cheap)
```

### 2. Use .dockerignore

Just like `.gitignore`, a `.dockerignore` file prevents files from being sent to the build context:

```
# .dockerignore
node_modules
.git
.env
*.log
dist
coverage
.DS_Store
README.md
```

Without `.dockerignore`, `COPY . .` sends your entire project (including `node_modules`!) to the Docker daemon.

### 3. Minimise Layers

Combine related operations in a single `RUN`:

```dockerfile
# BAD: 4 separate layers
RUN apt-get update
RUN apt-get install -y curl
RUN apt-get install -y ca-certificates
RUN rm -rf /var/lib/apt/lists/*

# GOOD: 1 layer
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*
```

### 4. Use Official and Pinned Base Images

```dockerfile
# Risky: what does latest mean next month?
FROM ubuntu:latest

# Better: pinned to a specific version
FROM ubuntu:22.04

# Best for production: pin to digest (immutable)
FROM ubuntu:22.04@sha256:a8fe6fd30333dc60fc5306982a7c51385c2091af1e0ee887166b40a905691fd0
```

### 5. Label Your Images

```dockerfile
LABEL maintainer="your-team@company.com"
LABEL org.opencontainers.image.title="My App"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.source="https://github.com/org/repo"
```

---

## Try It Yourself

### Exercise 1: Build a Simple Web Server

Create a `hello-docker/` directory with these files:

**`hello-docker/index.html`:**
```html
<!DOCTYPE html>
<html>
<body>
  <h1>Hello from my Docker container!</h1>
</body>
</html>
```

**`hello-docker/Dockerfile`:**
```dockerfile
FROM nginx:1.25-alpine

# Copy our page in
COPY index.html /usr/share/nginx/html/index.html

# Document the port
EXPOSE 80

# nginx starts automatically — no CMD needed (inherited from base)
```

```bash
cd hello-docker
docker build -t hello-web:1.0 .
docker run -d -p 8080:80 --name hello hello-web:1.0
# Open http://localhost:8080
docker rm -f hello
```

### Exercise 2: Multi-Stage Build

Create a Go HTTP server and build it with a multi-stage Dockerfile. See `labs/docker/02-multi-stage/` for the full exercise.

---

## Key Takeaways

- Dockerfile instructions create **immutable layers** — order matters for cache efficiency
- Copy **dependency manifests before source code** to cache installs
- **Multi-stage builds** dramatically reduce final image size by discarding build tools
- Always run containers as a **non-root user**
- Use **exec form** (`["node", "server.js"]`) for CMD/ENTRYPOINT so your process is PID 1
- Use `.dockerignore` to exclude `node_modules`, `.git`, and secrets from the build context

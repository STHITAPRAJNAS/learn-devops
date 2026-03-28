# Lab: Multi-Stage Docker Build

**Difficulty:** Intermediate
**Time:** 30 minutes
**Prerequisites:** Lab 01 completed, basic Go knowledge helpful but not required

---

## Objective

In this lab you will:

1. Build a Go HTTP server with a **single-stage** Dockerfile and measure the image size
2. Rebuild the same server with a **multi-stage** Dockerfile
3. Compare the image sizes (you'll be amazed)
4. Understand why this matters for security and deployment speed

---

## Background

A single-stage build that installs the Go compiler to compile a binary will include the entire Go toolchain in the final image — hundreds of megabytes of build tools that serve no purpose at runtime.

Multi-stage builds solve this: compile in a heavy "builder" image, then copy only the output binary into a minimal "runtime" image.

---

## Step 1: Review the Application

The `main.go` file (you'll create it below) is a simple HTTP server.

```bash
cd labs/docker/02-multi-stage
```

Create the Go application:

```bash
# Create go module
cat > go.mod << 'EOF'
module hello-server

go 1.22
EOF

# Create the server
cat > main.go << 'EOF'
package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"runtime"
	"time"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		hostname, _ := os.Hostname()
		fmt.Fprintf(w, `<!DOCTYPE html>
<html>
<head><title>Multi-Stage Build Demo</title>
<style>
  body { font-family: sans-serif; max-width: 600px; margin: 80px auto; padding: 0 20px; background: #0f172a; color: #e2e8f0; }
  .card { background: #1e293b; border-radius: 12px; padding: 2rem; border: 1px solid #334155; }
  h1 { color: #38bdf8; }
  code { background: #0f172a; padding: 2px 8px; border-radius: 4px; font-family: monospace; color: #a5f3fc; }
</style>
</head>
<body>
  <div class="card">
    <h1>🚀 Multi-Stage Build</h1>
    <p><strong>Go version:</strong> <code>%s</code></p>
    <p><strong>Hostname (Pod/Container ID):</strong> <code>%s</code></p>
    <p><strong>Time:</strong> <code>%s</code></p>
    <p>This binary was compiled in a golang image, then copied into a scratch (empty) image.
       The final image contains <em>only the binary</em>.</p>
  </div>
</body>
</html>`, runtime.Version(), hostname, time.Now().Format(time.RFC3339))
	})

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprintln(w, `{"status":"ok"}`)
	})

	log.Printf("Server starting on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
EOF
```

---

## Step 2: Single-Stage Build (the naive approach)

Review the `Dockerfile.single` file. It uses a single `golang` image for both building and running.

Build and measure:

```bash
docker build -f Dockerfile.single -t hello-server:single .
docker images hello-server:single
```

Note the image size. (Spoiler: it will be **~800–1000 MB**)

---

## Step 3: Multi-Stage Build

Review the `Dockerfile` (multi-stage). It uses:
1. `golang:1.22-alpine` to compile the binary
2. `scratch` (completely empty image) to run it

Build and measure:

```bash
docker build -t hello-server:multi .
docker images hello-server:multi
```

Note the image size. (Spoiler: it will be **under 10 MB**)

---

## Step 4: Compare

```bash
# Show both images
docker images | grep hello-server

# Expected output:
# hello-server   multi    ...   9.5MB
# hello-server   single   ...   947MB
```

That's a **99% reduction** in image size. In a CI/CD pipeline that pulls and pushes images hundreds of times a day, this is a massive win.

---

## Step 5: Run the Multi-Stage Image

```bash
docker run -d --name hello-multi -p 8080:8080 hello-server:multi

# Open http://localhost:8080
# Or:
curl http://localhost:8080
```

---

## Step 6: Explore the Minimal Image

```bash
# Try to exec into the container — there's no shell!
docker exec -it hello-multi sh
# Error: exec: "sh": executable file not found in $PATH

# The image contains ONLY the binary and TLS certificates
# This is also a security feature — an attacker who breaks in has nothing to work with
docker inspect hello-server:multi | python3 -m json.tool | grep -A5 "RootFS"
```

---

## Step 7: Security Scanning (Bonus)

```bash
# If you have Docker Scout or Trivy installed:
docker scout cves hello-server:multi
# OR
trivy image hello-server:multi

# Compare with the single-stage image
trivy image hello-server:single

# The scratch image has NO CVEs (no OS packages to have vulnerabilities)
```

---

## Step 8: Build with --target (Named Stages)

Multi-stage builds let you build to a specific stage:

```bash
# Build only the 'builder' stage (useful for debugging build failures)
docker build --target builder -t hello-server:builder .
docker images hello-server:builder

# Now you can exec into it to debug
docker run -it hello-server:builder sh
ls /app   # The compiled binary is here
```

---

## Step 9: Clean Up

```bash
docker rm -f hello-multi
docker rmi hello-server:multi hello-server:single hello-server:builder 2>/dev/null
```

---

## Bonus Challenges

1. **Add a distroless base:** Replace `scratch` with `gcr.io/distroless/static:nonroot`. This is safer than scratch for most cases (includes CA certificates and timezone data):

   ```dockerfile
   FROM gcr.io/distroless/static:nonroot
   ```

2. **Build for multiple platforms:** Use BuildKit to create multi-platform images:

   ```bash
   docker buildx build --platform linux/amd64,linux/arm64 -t hello-server:multi .
   ```

3. **Layer caching for Go modules:** Optimise the Dockerfile so that `go mod download` is cached unless `go.mod` or `go.sum` changes.

---

## Key Takeaways

- Multi-stage builds **discard build tools** from the final image — dramatic size reduction
- The `scratch` base image is **completely empty** — minimal attack surface
- Use `--target` to build to a specific stage for debugging
- Separate `COPY go.mod go.sum . && RUN go mod download` BEFORE copying source — this caches dependency downloads

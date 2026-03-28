# Lab: Hello Docker

**Difficulty:** Beginner
**Time:** 20 minutes
**Prerequisites:** Docker installed and running

---

## Objective

In this lab you will:

1. Write your first Dockerfile for a static web page
2. Build a Docker image
3. Run a container from that image
4. Verify it works in your browser
5. Explore the container while it runs
6. Clean up

---

## Background

A **Dockerfile** is a plain-text file with instructions for building a Docker image. Each instruction creates a new read-only layer. The result is a portable, reproducible image you can run anywhere Docker is installed.

---

## Step 1: Explore the Lab Files

```bash
cd labs/docker/01-hello-docker
ls -la
```

You should see:
- `Dockerfile` — the build instructions
- `README.md` — this file

---

## Step 2: Review the Dockerfile

Open `Dockerfile` and read through it. Notice:

- The base image chosen
- The files being copied
- The port being exposed
- The default command

---

## Step 3: Create the Web Content

Create the HTML file that the container will serve:

```bash
mkdir -p html
cat > html/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hello Docker!</title>
  <style>
    body {
      font-family: -apple-system, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #0db7ed 0%, #326de6 100%);
      color: white;
    }
    .card {
      text-align: center;
      padding: 3rem;
      background: rgba(255,255,255,0.1);
      border-radius: 1rem;
      backdrop-filter: blur(10px);
    }
    h1 { font-size: 3rem; margin-bottom: 0.5rem; }
    p { font-size: 1.2rem; opacity: 0.85; }
    code {
      background: rgba(0,0,0,0.3);
      padding: 0.2em 0.5em;
      border-radius: 4px;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>🐳 Hello, Docker!</h1>
    <p>This page is served from inside a Docker container.</p>
    <p>Built with: <code>docker build -t hello-docker .</code></p>
    <p>Run with: <code>docker run -p 8080:80 hello-docker</code></p>
  </div>
</body>
</html>
EOF
```

---

## Step 4: Build the Image

```bash
docker build -t hello-docker:1.0 .
```

Watch the output. Notice:
- `Step 1/N: FROM nginx:alpine` — pulls the base image (or uses cached version)
- Each subsequent step creates a new layer
- The final `Successfully built <id>` message

**Verify the image was created:**

```bash
docker images hello-docker
```

---

## Step 5: Run the Container

```bash
docker run -d \
  --name hello \
  -p 8080:80 \
  hello-docker:1.0
```

Open **http://localhost:8080** in your browser. You should see your Hello Docker page!

---

## Step 6: Explore the Running Container

```bash
# See it in the process list
docker ps

# View logs (nginx access log)
docker logs hello

# Get detailed container info
docker inspect hello

# How much CPU and memory is it using?
docker stats hello --no-stream

# Explore the filesystem inside the container
docker exec -it hello sh

# Inside the container:
ls /usr/share/nginx/html/   # Your HTML file is here
cat /etc/nginx/nginx.conf   # Nginx configuration
ps aux                       # Running processes
exit
```

---

## Step 7: Stop and Restart

```bash
# Stop the container
docker stop hello

# It still exists (just stopped)
docker ps -a | grep hello

# Restart it
docker start hello

# Verify it's serving again
curl http://localhost:8080 | head -5
```

---

## Step 8: Rebuild After a Change

Edit `html/index.html` — change the `<h1>` text:

```bash
sed -i 's/Hello, Docker!/Hello Again, Docker!/g' html/index.html
```

Rebuild (notice which layers are cached):

```bash
docker build -t hello-docker:1.1 .
```

Run the new version alongside the old one:

```bash
docker run -d --name hello-new -p 8081:80 hello-docker:1.1
```

Open http://localhost:8081 — see your updated page!

---

## Step 9: Clean Up

```bash
# Stop and remove all containers
docker rm -f hello hello-new

# Remove the images
docker rmi hello-docker:1.0 hello-docker:1.1

# Confirm they're gone
docker ps -a
docker images | grep hello-docker
```

---

## Bonus Challenges

1. **Add an about page:** Create `html/about.html` and rebuild. Is it automatically served by nginx?

2. **Custom error page:** Add a custom 404 page to your nginx config.

3. **Pass a message via environment variable:**
   Modify the Dockerfile and `index.html` to display a message from the `GREETING` environment variable.

   ```bash
   docker run -e GREETING="Welcome to my container!" -p 8082:80 hello-docker:2.0
   ```

4. **Inspect the layers:** Run `docker history hello-docker:1.0` to see all layers and their sizes.

---

## Key Takeaways

- A Dockerfile defines a reproducible build process
- `docker build` creates an image; `docker run` starts a container from it
- Each Dockerfile instruction creates a cached, reusable layer
- `docker exec -it <name> sh` lets you explore a running container
- Clean up containers and images regularly to avoid disk waste

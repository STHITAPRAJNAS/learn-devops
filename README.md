# DevOps Learning Platform

An interactive, self-hosted learning platform for mastering Docker, Kubernetes, Helm, and modern DevOps practices. Built with Next.js 14, TypeScript, and Tailwind CSS.

## What You Will Learn

### Docker (Beginner → Intermediate → Advanced)
- Container fundamentals and architecture
- Building images and managing containers
- Writing production-grade Dockerfiles
- Container networking and DNS
- Persistent storage with volumes and bind mounts

### Kubernetes (Fundamentals → Workloads → Networking → Storage)
- The Kubernetes control plane and node architecture
- Pods: the atomic unit of deployment
- ReplicaSets, Deployments, and rolling updates
- Services, Ingress, and DNS-based discovery
- ConfigMaps, Secrets, and environment injection

### Helm (Basics → Charts → Deployment Strategies)
- Helm architecture: client, chart repository, releases
- Chart structure and best practices
- Go templating, values files, and helpers
- Hooks, tests, and chart lifecycle management

---

## Project Structure

```
learn-devops/
├── README.md
├── docker-compose.yml          # Run the app locally
├── .gitignore
│
├── app/                        # Next.js 14 application
│   ├── pages/
│   │   ├── index.tsx           # Landing page with learning paths
│   │   └── learn/
│   │       └── [topic]/
│   │           └── [lesson].tsx  # Dynamic lesson viewer
│   ├── components/
│   │   ├── LessonCard.tsx      # Card for learning path overview
│   │   ├── QuizComponent.tsx   # Interactive multiple-choice quiz
│   │   ├── CodeBlock.tsx       # Syntax-highlighted code block
│   │   └── ProgressTracker.tsx # Visual learning progress bar
│   ├── lib/
│   │   └── lessons.ts          # All lesson metadata and types
│   ├── styles/
│   │   └── globals.css
│   ├── package.json
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── next.config.js
│
├── content/                    # Markdown lesson content
│   ├── docker/
│   │   ├── 01-introduction.md
│   │   ├── 02-images-containers.md
│   │   ├── 03-dockerfile.md
│   │   ├── 04-networking.md
│   │   └── 05-volumes.md
│   ├── kubernetes/
│   │   ├── 01-introduction.md
│   │   ├── 02-pods.md
│   │   ├── 03-deployments.md
│   │   ├── 04-services.md
│   │   └── 05-configmaps-secrets.md
│   └── helm/
│       ├── 01-introduction.md
│       ├── 02-charts.md
│       └── 03-templates.md
│
└── labs/                       # Hands-on exercises
    ├── docker/
    │   ├── 01-hello-docker/
    │   │   ├── README.md
    │   │   └── Dockerfile
    │   └── 02-multi-stage/
    │       ├── README.md
    │       └── Dockerfile
    ├── kubernetes/
    │   ├── 01-first-pod/
    │   │   ├── README.md
    │   │   └── pod.yaml
    │   └── 02-deployment/
    │       ├── README.md
    │       ├── deployment.yaml
    │       └── service.yaml
    └── helm/
        └── 01-first-chart/
            └── README.md
```

---

## Quick Start

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) 24+
- [Docker Compose](https://docs.docker.com/compose/install/) v2+
- Node.js 18+ (for local development without Docker)

### Run with Docker Compose

```bash
git clone <this-repo>
cd learn-devops
docker-compose up --build
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Run Locally (Development)

```bash
cd app
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Labs

Each lab in the `labs/` directory is a self-contained exercise. Read the `README.md` inside each lab folder for step-by-step instructions and expected outcomes.

| Lab | Topic | Difficulty |
|-----|-------|------------|
| `labs/docker/01-hello-docker` | Run your first container | Beginner |
| `labs/docker/02-multi-stage` | Multi-stage builds | Intermediate |
| `labs/kubernetes/01-first-pod` | Deploy a Pod | Beginner |
| `labs/kubernetes/02-deployment` | Deployment + Service | Intermediate |
| `labs/helm/01-first-chart` | Create and install a Helm chart | Intermediate |

---

## Contributing

1. Fork the repo and create a feature branch.
2. Add or edit lesson content under `content/`.
3. Add lab exercises under `labs/`.
4. Open a pull request with a clear description of what you changed and why.

---

## License

MIT — free to use, share, and modify.

// ─── Types ─────────────────────────────────────────────────────────────────

export type Difficulty = "beginner" | "intermediate" | "advanced";
export type Topic = "docker" | "kubernetes" | "helm";

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface Lesson {
  id: string;
  slug: string;
  title: string;
  description: string;
  duration: string; // e.g. "15 min"
  difficulty: Difficulty;
  topic: Topic;
  order: number;
  contentFile: string; // relative path under /content
  quiz: QuizQuestion[];
  tags: string[];
}

export interface LearningPath {
  topic: Topic;
  title: string;
  description: string;
  icon: string;
  color: string;        // Tailwind gradient class
  accentColor: string;  // Tailwind text/border colour
  lessons: Lesson[];
}

// ─── Docker Lessons ────────────────────────────────────────────────────────

const dockerLessons: Lesson[] = [
  {
    id: "docker-01",
    slug: "01-introduction",
    title: "Introduction to Docker",
    description:
      "Understand what Docker is, why containers exist, and how they differ from virtual machines.",
    duration: "15 min",
    difficulty: "beginner",
    topic: "docker",
    order: 1,
    contentFile: "docker/01-introduction.md",
    tags: ["containers", "virtualisation", "fundamentals"],
    quiz: [
      {
        id: "d01-q1",
        question: "What does Docker use to isolate processes on the host OS?",
        options: [
          "Hypervisors",
          "Linux namespaces and cgroups",
          "Virtual machines",
          "SSH tunnels",
        ],
        correctIndex: 1,
        explanation:
          "Docker leverages Linux kernel features — namespaces for isolation and cgroups for resource control — rather than emulating hardware like a hypervisor does.",
      },
      {
        id: "d01-q2",
        question: "Which of the following is a key advantage of containers over VMs?",
        options: [
          "Containers include their own OS kernel",
          "Containers take minutes to start",
          "Containers share the host OS kernel and start in milliseconds",
          "Containers cannot run on Linux",
        ],
        correctIndex: 2,
        explanation:
          "Containers share the host kernel, so there is no OS boot. Start times are measured in milliseconds, not minutes.",
      },
      {
        id: "d01-q3",
        question: "What is the Docker daemon responsible for?",
        options: [
          "Writing Dockerfiles",
          "Managing containers, images, networks, and volumes",
          "Providing the CLI interface",
          "Storing images in a registry",
        ],
        correctIndex: 1,
        explanation:
          "The Docker daemon (dockerd) is the long-running background process that manages all Docker objects. The CLI sends commands to it via a REST API.",
      },
    ],
  },
  {
    id: "docker-02",
    slug: "02-images-containers",
    title: "Images and Containers",
    description:
      "Learn how Docker images are layered, how to pull images, run containers, and manage their lifecycle.",
    duration: "20 min",
    difficulty: "beginner",
    topic: "docker",
    order: 2,
    contentFile: "docker/02-images-containers.md",
    tags: ["images", "containers", "layers", "registry"],
    quiz: [
      {
        id: "d02-q1",
        question: "Which command shows all running AND stopped containers?",
        options: [
          "docker ps",
          "docker ps -a",
          "docker images -a",
          "docker container show",
        ],
        correctIndex: 1,
        explanation:
          "`docker ps` only shows running containers. The `-a` (all) flag includes stopped containers too.",
      },
      {
        id: "d02-q2",
        question: "What is a Docker image layer?",
        options: [
          "A full copy of the filesystem for each instruction",
          "A read-only diff applied on top of the previous layer",
          "A running process",
          "A network namespace",
        ],
        correctIndex: 1,
        explanation:
          "Each instruction in a Dockerfile creates a thin read-only diff layer. Layers are cached and shared between images, keeping disk usage low.",
      },
      {
        id: "d02-q3",
        question: "How do you remove a Docker image named 'myapp:latest'?",
        options: [
          "docker rm myapp:latest",
          "docker delete myapp:latest",
          "docker rmi myapp:latest",
          "docker image remove -f myapp",
        ],
        correctIndex: 2,
        explanation:
          "`docker rmi` (remove image) is the classic command. `docker image rm myapp:latest` is the modern equivalent.",
      },
    ],
  },
  {
    id: "docker-03",
    slug: "03-dockerfile",
    title: "Writing Dockerfiles",
    description:
      "Master Dockerfile syntax, best practices, multi-stage builds, and producing lean production images.",
    duration: "25 min",
    difficulty: "intermediate",
    topic: "docker",
    order: 3,
    contentFile: "docker/03-dockerfile.md",
    tags: ["dockerfile", "build", "multi-stage", "best-practices"],
    quiz: [
      {
        id: "d03-q1",
        question: "What is the primary benefit of a multi-stage Docker build?",
        options: [
          "It speeds up the runtime of the application",
          "It lets you use multiple base images simultaneously",
          "It produces smaller final images by discarding build-time dependencies",
          "It allows parallel Dockerfile execution",
        ],
        correctIndex: 2,
        explanation:
          "Multi-stage builds let you compile/build in a heavy image (e.g., golang:1.22) and then copy only the compiled binary into a minimal final image (e.g., scratch or alpine), dramatically reducing image size.",
      },
      {
        id: "d03-q2",
        question: "Which Dockerfile instruction sets the working directory for subsequent instructions?",
        options: ["RUN cd /app", "WORKDIR /app", "ENV PWD=/app", "CD /app"],
        correctIndex: 1,
        explanation:
          "WORKDIR sets the working directory inside the image. Using `RUN cd` only affects that single shell invocation.",
      },
      {
        id: "d03-q3",
        question: "Why should you combine RUN commands with && in Dockerfiles?",
        options: [
          "For readability only",
          "Each RUN creates a new layer; combining reduces layer count and image size",
          "Docker requires it for package managers",
          "It prevents caching",
        ],
        correctIndex: 1,
        explanation:
          "Every RUN instruction creates a new image layer. Chaining commands with && keeps related operations (install, clean, configure) in one layer, preventing leftover cache files from bloating the image.",
      },
    ],
  },
  {
    id: "docker-04",
    slug: "04-networking",
    title: "Docker Networking",
    description:
      "Explore Docker network drivers, container DNS, port publishing, and connecting multi-container applications.",
    duration: "20 min",
    difficulty: "intermediate",
    topic: "docker",
    order: 4,
    contentFile: "docker/04-networking.md",
    tags: ["networking", "bridge", "dns", "compose"],
    quiz: [
      {
        id: "d04-q1",
        question: "Which Docker network driver is used by default when you run `docker run` without specifying a network?",
        options: ["host", "none", "bridge", "overlay"],
        correctIndex: 2,
        explanation:
          "The default network driver is `bridge`. Each container gets an IP on the docker0 bridge and can communicate with other containers on the same bridge.",
      },
      {
        id: "d04-q2",
        question: "How do containers on a user-defined bridge network resolve each other's hostnames?",
        options: [
          "They edit /etc/hosts manually",
          "Docker's embedded DNS server resolves container names automatically",
          "They use the host's DNS server",
          "It is not possible without extra configuration",
        ],
        correctIndex: 1,
        explanation:
          "User-defined bridge networks get a built-in DNS resolver. Containers can reach each other by their container name or network alias — no manual /etc/hosts editing needed.",
      },
      {
        id: "d04-q3",
        question: "Which flag publishes container port 8080 on host port 80?",
        options: ["-p 8080:80", "-p 80:8080", "--expose 80", "-P 80:8080"],
        correctIndex: 1,
        explanation:
          "The format is `host_port:container_port`. So `-p 80:8080` maps host port 80 to container port 8080.",
      },
    ],
  },
  {
    id: "docker-05",
    slug: "05-volumes",
    title: "Docker Volumes and Storage",
    description:
      "Persist data beyond container lifecycles using volumes, bind mounts, and tmpfs mounts.",
    duration: "18 min",
    difficulty: "intermediate",
    topic: "docker",
    order: 5,
    contentFile: "docker/05-volumes.md",
    tags: ["volumes", "storage", "bind-mounts", "persistence"],
    quiz: [
      {
        id: "d05-q1",
        question: "What happens to data written inside a container when the container is deleted?",
        options: [
          "It is automatically backed up",
          "It persists in the image",
          "It is lost unless stored in a volume or bind mount",
          "It moves to another container",
        ],
        correctIndex: 2,
        explanation:
          "Container writable layers are ephemeral. Data is lost when the container is removed unless it is stored in a named volume, bind mount, or tmpfs mount.",
      },
      {
        id: "d05-q2",
        question: "What is the key difference between a Docker volume and a bind mount?",
        options: [
          "Volumes are faster than bind mounts",
          "Bind mounts are managed by Docker; volumes use host paths",
          "Volumes are managed by Docker in /var/lib/docker; bind mounts use any host path you specify",
          "There is no difference",
        ],
        correctIndex: 2,
        explanation:
          "Named volumes are created and managed by Docker (stored under /var/lib/docker/volumes). Bind mounts map a specific host directory into the container — giving you more control but less portability.",
      },
      {
        id: "d05-q3",
        question: "Which command creates a named Docker volume called 'db-data'?",
        options: [
          "docker volume create db-data",
          "docker create volume db-data",
          "docker run --volume db-data",
          "docker volume init db-data",
        ],
        correctIndex: 0,
        explanation:
          "`docker volume create db-data` explicitly creates a named volume. Docker also creates volumes automatically if you reference a new name in `docker run -v`.",
      },
    ],
  },
];

// ─── Kubernetes Lessons ────────────────────────────────────────────────────

const kubernetesLessons: Lesson[] = [
  {
    id: "k8s-01",
    slug: "01-introduction",
    title: "Introduction to Kubernetes",
    description:
      "Understand the Kubernetes control plane, node components, and why orchestration matters at scale.",
    duration: "20 min",
    difficulty: "beginner",
    topic: "kubernetes",
    order: 1,
    contentFile: "kubernetes/01-introduction.md",
    tags: ["control-plane", "nodes", "architecture", "fundamentals"],
    quiz: [
      {
        id: "k01-q1",
        question: "Which Kubernetes component stores the cluster's desired state?",
        options: ["kubelet", "kube-scheduler", "etcd", "kube-proxy"],
        correctIndex: 2,
        explanation:
          "etcd is the distributed key-value store that acts as Kubernetes' source of truth. All cluster configuration and state is written to etcd.",
      },
      {
        id: "k01-q2",
        question: "What is the role of the kubelet?",
        options: [
          "It schedules Pods onto nodes",
          "It runs on each node and ensures containers are running as specified",
          "It manages the cluster's API",
          "It provides load balancing",
        ],
        correctIndex: 1,
        explanation:
          "The kubelet is an agent on every node. It watches the API server for Pods assigned to its node and instructs the container runtime to start/stop containers accordingly.",
      },
      {
        id: "k01-q3",
        question: "Which tool is used to interact with a Kubernetes cluster from the command line?",
        options: ["helm", "docker", "kubectl", "kubeadm"],
        correctIndex: 2,
        explanation:
          "kubectl is the primary CLI tool. It communicates with the Kubernetes API server to create, read, update, and delete resources.",
      },
    ],
  },
  {
    id: "k8s-02",
    slug: "02-pods",
    title: "Pods: The Atomic Unit",
    description:
      "Deep-dive into Pods — their specification, lifecycle, init containers, and multi-container patterns.",
    duration: "22 min",
    difficulty: "beginner",
    topic: "kubernetes",
    order: 2,
    contentFile: "kubernetes/02-pods.md",
    tags: ["pods", "containers", "lifecycle", "yaml"],
    quiz: [
      {
        id: "k02-q1",
        question: "Can two containers in the same Pod share localhost networking?",
        options: [
          "No, each container gets its own network namespace",
          "Yes, containers in a Pod share the same network namespace",
          "Only if you use a special CNI plugin",
          "Only in Kubernetes 1.28+",
        ],
        correctIndex: 1,
        explanation:
          "All containers within a Pod share the same network namespace, so they communicate over localhost and share port space.",
      },
      {
        id: "k02-q2",
        question: "What is the purpose of an init container?",
        options: [
          "To replace the main container when it crashes",
          "To run setup tasks before the main container starts",
          "To provide a sidecar proxy",
          "To define resource limits",
        ],
        correctIndex: 1,
        explanation:
          "Init containers run sequentially before app containers. They are perfect for setup tasks like waiting for a database, fetching secrets, or pre-populating a shared volume.",
      },
      {
        id: "k02-q3",
        question: "What does a liveness probe do?",
        options: [
          "Checks if the Pod is ready to receive traffic",
          "Determines when to start sending traffic to a new Pod",
          "Restarts the container if it enters an unhealthy state",
          "Limits the CPU usage of a container",
        ],
        correctIndex: 2,
        explanation:
          "A liveness probe periodically checks if the container is still alive. If it fails, Kubernetes restarts the container. Readiness probes control traffic routing.",
      },
    ],
  },
  {
    id: "k8s-03",
    slug: "03-deployments",
    title: "Deployments and ReplicaSets",
    description:
      "Manage stateless application replicas, perform rolling updates, and roll back failed deployments.",
    duration: "25 min",
    difficulty: "intermediate",
    topic: "kubernetes",
    order: 3,
    contentFile: "kubernetes/03-deployments.md",
    tags: ["deployments", "replicasets", "rolling-update", "rollback"],
    quiz: [
      {
        id: "k03-q1",
        question: "What rolling update strategy parameter controls how many Pods can be unavailable during an update?",
        options: [
          "maxSurge",
          "maxUnavailable",
          "minReady",
          "progressDeadlineSeconds",
        ],
        correctIndex: 1,
        explanation:
          "`maxUnavailable` sets the maximum number (or percentage) of Pods that can be down during a rolling update. `maxSurge` controls how many extra Pods can be created above the desired count.",
      },
      {
        id: "k03-q2",
        question: "How do you roll back a Deployment to the previous version?",
        options: [
          "kubectl delete deployment myapp",
          "kubectl rollout undo deployment/myapp",
          "kubectl apply -f old-deployment.yaml",
          "kubectl restart deployment myapp",
        ],
        correctIndex: 1,
        explanation:
          "`kubectl rollout undo deployment/myapp` rolls back to the previous ReplicaSet revision. You can also target a specific revision with `--to-revision=N`.",
      },
      {
        id: "k03-q3",
        question: "What resource does a Deployment create to manage Pod replicas?",
        options: ["StatefulSet", "DaemonSet", "ReplicaSet", "Job"],
        correctIndex: 2,
        explanation:
          "A Deployment manages a ReplicaSet, which in turn ensures the specified number of Pod replicas are running at all times. The Deployment adds update and rollback capabilities on top.",
      },
    ],
  },
  {
    id: "k8s-04",
    slug: "04-services",
    title: "Services and Networking",
    description:
      "Expose applications inside and outside the cluster using ClusterIP, NodePort, LoadBalancer, and Ingress.",
    duration: "22 min",
    difficulty: "intermediate",
    topic: "kubernetes",
    order: 4,
    contentFile: "kubernetes/04-services.md",
    tags: ["services", "ingress", "networking", "load-balancing"],
    quiz: [
      {
        id: "k04-q1",
        question: "Which Service type exposes an application on a port of every Node's IP?",
        options: ["ClusterIP", "NodePort", "LoadBalancer", "ExternalName"],
        correctIndex: 1,
        explanation:
          "NodePort opens a port (30000-32767) on every node. Traffic to `<NodeIP>:<NodePort>` is forwarded to the Service. ClusterIP is only reachable inside the cluster.",
      },
      {
        id: "k04-q2",
        question: "How does a Kubernetes Service select which Pods to route traffic to?",
        options: [
          "By Pod name",
          "By namespace",
          "By label selectors",
          "By node name",
        ],
        correctIndex: 2,
        explanation:
          "Services use label selectors (e.g., `app: myapp`) to find matching Pods and build an Endpoints list. Any Pod with matching labels automatically receives traffic.",
      },
      {
        id: "k04-q3",
        question: "What is the purpose of an Ingress resource?",
        options: [
          "To provide persistent storage",
          "To run batch jobs",
          "To expose HTTP/HTTPS routes to Services with host/path-based routing",
          "To define network policies between Pods",
        ],
        correctIndex: 2,
        explanation:
          "An Ingress manages external HTTP(S) access to Services. An Ingress Controller (e.g., nginx, Traefik) watches Ingress resources and configures a load balancer or reverse proxy accordingly.",
      },
    ],
  },
  {
    id: "k8s-05",
    slug: "05-configmaps-secrets",
    title: "ConfigMaps and Secrets",
    description:
      "Inject configuration and sensitive data into Pods without baking them into your container images.",
    duration: "18 min",
    difficulty: "intermediate",
    topic: "kubernetes",
    order: 5,
    contentFile: "kubernetes/05-configmaps-secrets.md",
    tags: ["configmaps", "secrets", "environment", "configuration"],
    quiz: [
      {
        id: "k05-q1",
        question: "How are Secret values stored in etcd by default?",
        options: [
          "Encrypted with AES-256",
          "Base64-encoded (not encrypted by default)",
          "Hashed with bcrypt",
          "Stored as plaintext",
        ],
        correctIndex: 1,
        explanation:
          "By default, Secrets are only base64-encoded in etcd — not encrypted. Enable EncryptionConfiguration or use an external secrets manager (Vault, AWS Secrets Manager) for true encryption at rest.",
      },
      {
        id: "k05-q2",
        question: "Which method mounts a ConfigMap so file changes are reflected in a running Pod without a restart?",
        options: [
          "Environment variables via envFrom",
          "Volume mount (projected as files)",
          "Command-line arguments",
          "Init containers",
        ],
        correctIndex: 1,
        explanation:
          "When a ConfigMap is mounted as a volume, Kubernetes automatically updates the mounted files when the ConfigMap changes (with a short sync delay). Environment variables are set at container start and do NOT update dynamically.",
      },
      {
        id: "k05-q3",
        question: "What is the maximum size of a single ConfigMap?",
        options: ["1 MiB", "4 MiB", "16 MiB", "Unlimited"],
        correctIndex: 0,
        explanation:
          "Both ConfigMaps and Secrets are stored in etcd and are subject to a 1 MiB size limit per object. For larger files, use an init container to fetch data from object storage.",
      },
    ],
  },
];

// ─── Helm Lessons ──────────────────────────────────────────────────────────

const helmLessons: Lesson[] = [
  {
    id: "helm-01",
    slug: "01-introduction",
    title: "Introduction to Helm",
    description:
      "Learn what Helm is, how it simplifies Kubernetes deployments, and its core concepts: charts, releases, and repositories.",
    duration: "15 min",
    difficulty: "beginner",
    topic: "helm",
    order: 1,
    contentFile: "helm/01-introduction.md",
    tags: ["helm", "package-manager", "charts", "releases"],
    quiz: [
      {
        id: "h01-q1",
        question: "What is a Helm 'release'?",
        options: [
          "A published Helm chart in a repository",
          "A running instance of a chart installed into a Kubernetes cluster",
          "A version of the Helm CLI",
          "A Kubernetes namespace",
        ],
        correctIndex: 1,
        explanation:
          "A release is a specific deployment of a chart. You can install the same chart multiple times in the same cluster — each installation is a separate release with its own name and configuration.",
      },
      {
        id: "h01-q2",
        question: "Where does Helm 3 store release information?",
        options: [
          "In the Tiller pod",
          "In ~/.helm on the client machine",
          "As Secrets in the target Kubernetes namespace",
          "In a Helm-specific etcd cluster",
        ],
        correctIndex: 2,
        explanation:
          "Helm 3 removed Tiller entirely. Release metadata is stored as Kubernetes Secrets in the release's namespace, making it cluster-native and secure.",
      },
      {
        id: "h01-q3",
        question: "Which command installs a Helm chart called 'nginx-ingress' from the 'ingress-nginx' repo?",
        options: [
          "helm apply ingress-nginx/nginx-ingress",
          "helm install my-ingress ingress-nginx/nginx-ingress",
          "helm deploy ingress-nginx/nginx-ingress my-ingress",
          "kubectl apply helm ingress-nginx/nginx-ingress",
        ],
        correctIndex: 1,
        explanation:
          "`helm install <release-name> <chart>` is the install command. The release name comes first, then the chart reference.",
      },
    ],
  },
  {
    id: "helm-02",
    slug: "02-charts",
    title: "Helm Chart Structure",
    description:
      "Explore the anatomy of a Helm chart: Chart.yaml, values.yaml, templates, helpers, and the Chart.lock file.",
    duration: "20 min",
    difficulty: "intermediate",
    topic: "helm",
    order: 2,
    contentFile: "helm/02-charts.md",
    tags: ["charts", "values", "chart-yaml", "structure"],
    quiz: [
      {
        id: "h02-q1",
        question: "What is the purpose of the 'values.yaml' file in a Helm chart?",
        options: [
          "It defines Kubernetes RBAC rules for the chart",
          "It contains the chart's default configuration values used in templates",
          "It lists the chart's Kubernetes resource types",
          "It holds the chart's Go source code",
        ],
        correctIndex: 1,
        explanation:
          "values.yaml provides default values for template variables. Users can override these with `--set` flags or a custom values file (`-f my-values.yaml`) at install/upgrade time.",
      },
      {
        id: "h02-q2",
        question: "Which file in a Helm chart contains the chart's name, version, and description?",
        options: [
          "values.yaml",
          "templates/NOTES.txt",
          "Chart.yaml",
          "requirements.yaml",
        ],
        correctIndex: 2,
        explanation:
          "Chart.yaml is the chart metadata file. It must include `name`, `version`, and `apiVersion`. Optional fields include `description`, `type`, `appVersion`, `dependencies`, and maintainers.",
      },
      {
        id: "h02-q3",
        question: "What does `helm template` do?",
        options: [
          "Installs the chart and outputs what was created",
          "Renders chart templates locally without connecting to a cluster",
          "Creates a new chart template",
          "Validates the chart against the Kubernetes API",
        ],
        correctIndex: 1,
        explanation:
          "`helm template` renders your templates locally and prints the resulting YAML to stdout. It is invaluable for debugging template logic without deploying to a real cluster.",
      },
    ],
  },
  {
    id: "helm-03",
    slug: "03-templates",
    title: "Go Templates and Helm Helpers",
    description:
      "Master Go templating, Helm built-in objects, template functions, named templates, and the _helpers.tpl pattern.",
    duration: "25 min",
    difficulty: "advanced",
    topic: "helm",
    order: 3,
    contentFile: "helm/03-templates.md",
    tags: ["templates", "go-templates", "helpers", "sprig"],
    quiz: [
      {
        id: "h03-q1",
        question: "What does the Helm built-in object `.Release.Name` contain?",
        options: [
          "The chart's name from Chart.yaml",
          "The name of the Helm release given at install time",
          "The Kubernetes namespace",
          "The chart version",
        ],
        correctIndex: 1,
        explanation:
          "`.Release.Name` holds the release name (the first argument to `helm install`). It's commonly used to prefix resource names to avoid conflicts across multiple releases.",
      },
      {
        id: "h03-q2",
        question: "Which Helm function trims whitespace and newlines from template output?",
        options: ["trim", "nindent", "toYaml", "indent"],
        correctIndex: 0,
        explanation:
          "`trim` strips leading and trailing whitespace. `nindent N` adds N spaces of indentation with a leading newline. These are Sprig functions available in Helm templates.",
      },
      {
        id: "h03-q3",
        question: "Where should reusable named templates (partials) be defined in a Helm chart?",
        options: [
          "values.yaml",
          "Chart.yaml",
          "Any file starting with an underscore, e.g., _helpers.tpl",
          "templates/partials.yaml",
        ],
        correctIndex: 2,
        explanation:
          "Files beginning with underscore (e.g., `_helpers.tpl`) are not rendered as Kubernetes manifests. They're ideal for `define` blocks that other templates can call with `include` or `template`.",
      },
    ],
  },
];

// ─── Learning Paths ────────────────────────────────────────────────────────

export const learningPaths: LearningPath[] = [
  {
    topic: "docker",
    title: "Docker",
    description:
      "Go from zero to containerisation hero. Learn to build, ship, and run applications with Docker.",
    icon: "🐳",
    color: "from-docker-700 to-docker-500",
    accentColor: "text-docker-500",
    lessons: dockerLessons,
  },
  {
    topic: "kubernetes",
    title: "Kubernetes",
    description:
      "Master container orchestration — deploy, scale, and manage containerised applications in production.",
    icon: "☸️",
    color: "from-k8s-700 to-k8s-500",
    accentColor: "text-k8s-500",
    lessons: kubernetesLessons,
  },
  {
    topic: "helm",
    title: "Helm",
    description:
      "Package, configure, and deploy Kubernetes applications with Helm — the Kubernetes package manager.",
    icon: "⛵",
    color: "from-helm-700 to-helm-500",
    accentColor: "text-helm-500",
    lessons: helmLessons,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────

export function getLearningPath(topic: Topic): LearningPath | undefined {
  return learningPaths.find((p) => p.topic === topic);
}

export function getLesson(topic: Topic, slug: string): Lesson | undefined {
  return getLearningPath(topic)?.lessons.find((l) => l.slug === slug);
}

export function getTotalLessons(): number {
  return learningPaths.reduce((acc, p) => acc + p.lessons.length, 0);
}

export const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  beginner: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  intermediate: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  advanced: "text-red-400 bg-red-400/10 border-red-400/20",
};

export const TOPIC_COLORS: Record<Topic, string> = {
  docker: "text-docker-500 bg-docker-500/10 border-docker-500/20",
  kubernetes: "text-k8s-500 bg-k8s-500/10 border-k8s-500/20",
  helm: "text-helm-500 bg-helm-500/10 border-helm-500/20",
};

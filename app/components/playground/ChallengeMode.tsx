"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

interface Challenge {
  id: string;
  title: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  topic: "Docker" | "Kubernetes" | "Helm";
  description: string;
  scenario: string;
  brokenYaml?: string;
  starterYaml?: string;
  hints: string[];
  solution: string;
  solutionExplanation: string;
  checkFn: (yaml: string) => { passed: boolean; feedback: string };
}

// ── Challenges ──────────────────────────────────────────────────────────────

const CHALLENGES: Challenge[] = [
  {
    id: "fix-crashloop",
    title: "Fix the CrashLoopBackOff",
    difficulty: "beginner",
    topic: "Kubernetes",
    description: "A Deployment is stuck in CrashLoopBackOff. Find and fix all the issues in the YAML.",
    scenario: `Your team just got paged: the payment-service is down with CrashLoopBackOff.
The logs show: "Error: listen EADDRINUSE :::80" and the container keeps restarting.
Additionally, ops says the pod is consuming all node memory. Fix the deployment.`,
    brokenYaml: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: payment-service
spec:
  replicas: 1
  selector:
    matchLabels:
      app: payment
  template:
    metadata:
      labels:
        app: payment
    spec:
      containers:
      - name: app
        image: payment-service:latest
        ports:
        - containerPort: 8080
        env:
        - name: PORT
          value: "80"`,
    hints: [
      "The app listens on PORT env var — what port is it configured to use vs what containerPort says?",
      "There are no resource limits — this is dangerous in production",
      "Using :latest tag makes deployments non-reproducible",
    ],
    solution: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: payment-service
  labels:
    app: payment-service
spec:
  replicas: 2
  selector:
    matchLabels:
      app: payment
  template:
    metadata:
      labels:
        app: payment
    spec:
      containers:
      - name: app
        image: payment-service:1.2.0
        ports:
        - containerPort: 8080
        env:
        - name: PORT
          value: "8080"
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 500m
            memory: 512Mi
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 10`,
    solutionExplanation: "Three issues: (1) PORT env was '80' but containerPort was 8080 — app couldn't bind; (2) No resource limits allowed memory exhaustion causing OOMKill; (3) :latest tag is not reproducible. Fix: align PORT=8080, add resource limits, pin the image tag.",
    checkFn: (yaml) => {
      const checks = [
        { test: yaml.includes('value: "8080"') || yaml.includes("value: '8080'"), msg: "PORT env should be 8080 to match containerPort" },
        { test: yaml.includes("limits:"), msg: "Add resource limits to prevent OOMKill" },
        { test: !yaml.includes(":latest"), msg: "Pin the image tag — remove :latest" },
      ];
      const failed = checks.filter(c => !c.test);
      if (failed.length === 0) return { passed: true, feedback: "✅ All issues fixed! Great work." };
      return { passed: false, feedback: `Still needs fixing:\n${failed.map(f => `• ${f.msg}`).join("\n")}` };
    },
  },

  {
    id: "write-network-policy",
    title: "Write a Zero-Trust NetworkPolicy",
    difficulty: "intermediate",
    topic: "Kubernetes",
    description: "Write NetworkPolicies to enforce zero-trust isolation for a 3-tier app.",
    scenario: `You have three services: frontend (port 80), backend (port 8080), and postgres (port 5432).

Security requirements:
  1. Default deny ALL ingress and egress
  2. Frontend can only receive traffic from the Ingress controller (namespace: ingress-nginx)
  3. Backend can only receive traffic from frontend pods
  4. Postgres can only receive traffic from backend pods
  5. All pods can resolve DNS (port 53)

Write the NetworkPolicies. Start with default-deny, then add allow rules.`,
    starterYaml: `# Write your NetworkPolicies here
# Tip: Start with a default-deny-all policy, then add specific allow rules
# Use --- to separate multiple resources

apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: production
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
---
# Add more policies below...`,
    hints: [
      "Use podSelector: {} with policyTypes: [Ingress, Egress] for default deny",
      "namespaceSelector lets you allow traffic from a specific namespace (like ingress-nginx)",
      "Don't forget DNS egress (port 53 UDP) — without it, pods can't resolve service names",
      "Each policy's podSelector targets WHICH pods the policy applies to",
    ],
    solution: `apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: production
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns-egress
  namespace: production
spec:
  podSelector: {}
  policyTypes:
  - Egress
  egress:
  - ports:
    - protocol: UDP
      port: 53
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: frontend-ingress
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: frontend
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: ingress-nginx
    ports:
    - port: 80
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: backend-ingress
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: frontend
    ports:
    - port: 8080
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: postgres
    ports:
    - port: 5432
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: postgres-ingress
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: postgres
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: backend
    ports:
    - port: 5432`,
    solutionExplanation: "Key concepts: (1) default-deny catches everything first; (2) DNS egress is needed for service discovery; (3) Each policy's podSelector is the TARGET — 'backend-ingress' policy protects backend pods; (4) namespaceSelector allows cross-namespace traffic from ingress-nginx.",
    checkFn: (yaml) => {
      const checks = [
        { test: yaml.includes("podSelector: {}") && yaml.includes("Ingress") && yaml.includes("Egress"), msg: "Need a default-deny-all policy (podSelector: {} with both Ingress and Egress)" },
        { test: yaml.includes("port: 53") || yaml.includes("port: 53"), msg: "Need DNS egress (port 53 UDP) so pods can resolve names" },
        { test: yaml.includes("namespaceSelector") && yaml.includes("ingress-nginx"), msg: "Frontend should allow ingress from ingress-nginx namespace" },
        { test: yaml.includes("app: backend") && yaml.includes("app: frontend"), msg: "Backend should allow ingress from frontend pods only" },
        { test: yaml.includes("app: postgres") && yaml.includes("port: 5432"), msg: "Postgres should only accept traffic on port 5432 from backend" },
      ];
      const failed = checks.filter(c => !c.test);
      if (failed.length === 0) return { passed: true, feedback: "✅ Excellent! Zero-trust policy is correct." };
      return { passed: false, feedback: `Missing requirements:\n${failed.map(f => `• ${f.msg}`).join("\n")}` };
    },
  },

  {
    id: "helm-values",
    title: "Fix the Helm Values File",
    difficulty: "intermediate",
    topic: "Helm",
    description: "A Helm values file for production has several security and reliability issues. Fix them all.",
    scenario: `The team deployed to production with these Helm values. The SRE team flagged 5 issues:
  1. Running as root (securityContext missing)
  2. No PodDisruptionBudget configuration
  3. Using :latest image tag
  4. No anti-affinity rules — all pods could land on the same node
  5. NodePort service type exposed to internet

Fix all 5 issues in the values file.`,
    brokenYaml: `# values-production.yaml
replicaCount: 3

image:
  repository: mycompany/api
  tag: latest
  pullPolicy: Always

service:
  type: NodePort
  port: 8080
  nodePort: 30080

ingress:
  enabled: true
  hostname: api.example.com

podDisruptionBudget:
  enabled: false

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 20
  targetCPUUtilizationPercentage: 70`,
    hints: [
      "Pin image.tag to a specific version like '2.1.0'",
      "Set service.type to ClusterIP — use Ingress for external access",
      "Add securityContext.runAsNonRoot: true and runAsUser: 1000",
      "podDisruptionBudget.enabled: true with minAvailable: 2 ensures HA during node drains",
      "topologySpreadConstraints or affinity.podAntiAffinity spreads pods across nodes",
    ],
    solution: `# values-production.yaml
replicaCount: 3

image:
  repository: mycompany/api
  tag: "2.1.0"
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 8080

ingress:
  enabled: true
  hostname: api.example.com
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"

podDisruptionBudget:
  enabled: true
  minAvailable: 2

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 20
  targetCPUUtilizationPercentage: 70

securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  runAsGroup: 3000
  fsGroup: 2000

containerSecurityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop:
    - ALL

affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
    - weight: 100
      podAffinityTerm:
        labelSelector:
          matchLabels:
            app: api
        topologyKey: kubernetes.io/hostname`,
    solutionExplanation: "5 fixes: (1) Pinned image tag '2.1.0'; (2) ClusterIP + Ingress — NodePort bypasses Ingress and exposes high ports; (3) securityContext for non-root execution; (4) PodDisruptionBudget ensures 2 pods stay up during node drain; (5) podAntiAffinity spreads pods across different nodes.",
    checkFn: (yaml) => {
      const checks = [
        { test: !yaml.includes("tag: latest") && !yaml.includes('tag: "latest"'), msg: "Pin the image tag — don't use 'latest'" },
        { test: yaml.includes("type: ClusterIP"), msg: "Change service type to ClusterIP (use Ingress for external)" },
        { test: yaml.includes("runAsNonRoot: true"), msg: "Add securityContext.runAsNonRoot: true" },
        { test: yaml.includes("minAvailable") || yaml.includes("maxUnavailable"), msg: "Enable PodDisruptionBudget with minAvailable" },
        { test: yaml.includes("podAntiAffinity") || yaml.includes("topologySpreadConstraints"), msg: "Add anti-affinity or topology spread constraints" },
      ];
      const failed = checks.filter(c => !c.test);
      if (failed.length === 0) return { passed: true, feedback: "✅ All 5 production issues fixed!" };
      return { passed: false, feedback: `Still needs fixing (${failed.length}/5):\n${failed.map(f => `• ${f.msg}`).join("\n")}` };
    },
  },

  {
    id: "rbac-least-privilege",
    title: "Write Least-Privilege RBAC",
    difficulty: "advanced",
    topic: "Kubernetes",
    description: "A CI/CD service account has cluster-admin. Reduce it to minimum required permissions.",
    scenario: `Your CI/CD pipeline uses a ServiceAccount 'ci-deployer' bound to ClusterRole 'cluster-admin'.
A security audit flagged this as critical. The pipeline only needs to:
  - Read/update Deployments in the 'production' namespace
  - Read ConfigMaps in the 'production' namespace
  - Create/delete Jobs in the 'production' namespace (for migrations)
  - Read Secrets (not create/delete) in 'production' namespace

Replace the cluster-admin binding with a minimal Role + RoleBinding.`,
    starterYaml: `# Current (INSECURE) — replace this:
# apiVersion: rbac.authorization.k8s.io/v1
# kind: ClusterRoleBinding
# metadata:
#   name: ci-deployer-admin
# subjects:
# - kind: ServiceAccount
#   name: ci-deployer
#   namespace: production
# roleRef:
#   kind: ClusterRole
#   name: cluster-admin
#   apiGroup: rbac.authorization.k8s.io

# Write the secure Role + RoleBinding here:
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: ci-deployer
  namespace: production
spec:
  # Add rules here...`,
    hints: [
      "Use Role (not ClusterRole) — it's namespace-scoped, which is safer",
      "apiGroups: ['apps'] for Deployments, apiGroups: [''] for core resources (pods, configmaps, secrets)",
      "apiGroups: ['batch'] for Jobs",
      "verbs: ['get','list','update','patch'] for read+update; ['create','delete'] only for Jobs",
    ],
    solution: `apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: ci-deployer
  namespace: production
rules:
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["get", "list", "update", "patch"]
- apiGroups: [""]
  resources: ["configmaps"]
  verbs: ["get", "list"]
- apiGroups: ["batch"]
  resources: ["jobs"]
  verbs: ["get", "list", "create", "delete"]
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: ci-deployer-binding
  namespace: production
subjects:
- kind: ServiceAccount
  name: ci-deployer
  namespace: production
roleRef:
  kind: Role
  name: ci-deployer
  apiGroup: rbac.authorization.k8s.io`,
    solutionExplanation: "Key principles: (1) Role not ClusterRole — confine to production namespace; (2) Separate rules by apiGroup: apps for Deployments, batch for Jobs, '' (core) for ConfigMaps/Secrets; (3) Verbs are granular — secrets get only get/list, not create/delete; (4) RoleBinding connects ServiceAccount to Role.",
    checkFn: (yaml) => {
      const checks = [
        { test: yaml.includes("kind: Role") && !yaml.includes("kind: ClusterRole"), msg: "Use Role (namespace-scoped), not ClusterRole" },
        { test: yaml.includes('apiGroups: ["apps"]') || yaml.includes("apiGroups: ['apps']"), msg: "Need apps apiGroup for Deployments" },
        { test: yaml.includes('apiGroups: ["batch"]') || yaml.includes("apiGroups: ['batch']"), msg: "Need batch apiGroup for Jobs" },
        { test: yaml.includes("kind: RoleBinding"), msg: "Need a RoleBinding to attach the Role to the ServiceAccount" },
        { test: !yaml.includes("cluster-admin"), msg: "Remove the cluster-admin reference" },
      ];
      const failed = checks.filter(c => !c.test);
      if (failed.length === 0) return { passed: true, feedback: "✅ Least-privilege RBAC correctly defined!" };
      return { passed: false, feedback: `Issues:\n${failed.map(f => `• ${f.msg}`).join("\n")}` };
    },
  },

  {
    id: "write-dockerfile",
    title: "Optimize the Dockerfile",
    difficulty: "beginner",
    topic: "Docker",
    description: "Rewrite a poorly written Dockerfile using multi-stage builds and best practices.",
    scenario: `The current Dockerfile produces a 1.2GB image and runs as root.
Optimize it to:
  1. Use multi-stage build (build stage + minimal runtime stage)
  2. Run as non-root user
  3. Use .dockerignore patterns (list what to exclude in comments)
  4. Pin base image versions
  5. Target final image size < 100MB (use alpine or distroless)`,
    brokenYaml: `FROM node:latest

WORKDIR /app

COPY . .

RUN npm install

RUN npm run build

EXPOSE 3000

CMD ["node", "server.js"]`,
    hints: [
      "Use 'FROM node:20-alpine AS builder' for build stage",
      "In builder: COPY package*.json ./ then RUN npm ci",
      "Final stage: FROM node:20-alpine, copy only node_modules + dist from builder",
      "Add: RUN addgroup -S app && adduser -S app -G app",
      "Use USER app before CMD to run as non-root",
    ],
    solution: `# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Install deps first (better layer caching)
COPY package*.json ./
RUN npm ci --only=production

# Copy source and build
COPY . .
RUN npm run build

# Runtime stage — minimal image
FROM node:20-alpine AS runtime
WORKDIR /app

# Create non-root user
RUN addgroup -S app && adduser -S app -G app

# Copy only what's needed from builder
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/package.json .

# Switch to non-root
USER app

EXPOSE 3000

# Use exec form (not shell form) to handle signals correctly
CMD ["node", "dist/server.js"]

# .dockerignore should contain:
# node_modules
# .git
# .env*
# Dockerfile
# README.md
# *.test.ts
# coverage/`,
    solutionExplanation: "5 improvements: (1) Multi-stage keeps build tools out of final image; (2) Copy package.json before source for layer cache hits on unchanged deps; (3) Non-root USER prevents container breakout attacks; (4) Pinned node:20-alpine vs node:latest; (5) Alpine base keeps final image ~80MB vs 1.2GB.",
    checkFn: (yaml) => {
      const checks = [
        { test: yaml.includes("AS builder") || yaml.includes("AS build"), msg: "Use multi-stage build: 'FROM ... AS builder'" },
        { test: yaml.includes("USER "), msg: "Add a non-root USER directive" },
        { test: !yaml.includes("FROM node:latest") && !yaml.includes("FROM node\n"), msg: "Pin the Node.js version (e.g., node:20-alpine)" },
        { test: yaml.includes("--from="), msg: "Copy artifacts from builder stage using COPY --from=builder" },
        { test: yaml.includes("alpine") || yaml.includes("distroless") || yaml.includes("slim"), msg: "Use alpine or slim base image for smaller size" },
      ];
      const failed = checks.filter(c => !c.test);
      if (failed.length === 0) return { passed: true, feedback: "✅ Dockerfile optimized! Multi-stage, non-root, pinned versions." };
      return { passed: false, feedback: `Still needs improving:\n${failed.map(f => `• ${f.msg}`).join("\n")}` };
    },
  },
];

// ── Component ──────────────────────────────────────────────────────────────

const DIFFICULTY_COLORS = {
  beginner: "text-green-400 bg-green-900/30 border-green-700",
  intermediate: "text-yellow-400 bg-yellow-900/30 border-yellow-700",
  advanced: "text-red-400 bg-red-900/30 border-red-700",
};

const TOPIC_COLORS = {
  Docker: "text-blue-300 bg-blue-900/30",
  Kubernetes: "text-purple-300 bg-purple-900/30",
  Helm: "text-orange-300 bg-orange-900/30",
};

export default function ChallengeMode() {
  const [activeChallenge, setActiveChallenge] = useState<Challenge | null>(null);
  const [userYaml, setUserYaml] = useState("");
  const [checkResult, setCheckResult] = useState<{ passed: boolean; feedback: string } | null>(null);
  const [showSolution, setShowSolution] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [hintIndex, setHintIndex] = useState(0);
  const [completed, setCompleted] = useState<Set<string>>(new Set());

  const startChallenge = useCallback((challenge: Challenge) => {
    setActiveChallenge(challenge);
    setUserYaml(challenge.brokenYaml || challenge.starterYaml || "");
    setCheckResult(null);
    setShowSolution(false);
    setShowHint(false);
    setHintIndex(0);
  }, []);

  const checkAnswer = useCallback(() => {
    if (!activeChallenge) return;
    const result = activeChallenge.checkFn(userYaml);
    setCheckResult(result);
    if (result.passed) {
      setCompleted(prev => new Set([...prev, activeChallenge.id]));
    }
  }, [activeChallenge, userYaml]);

  const nextHint = () => {
    if (!activeChallenge) return;
    setShowHint(true);
    setHintIndex(i => Math.min(i + 1, activeChallenge.hints.length - 1));
  };

  if (!activeChallenge) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white font-semibold">Challenges</h3>
            <p className="text-gray-400 text-sm mt-0.5">
              {completed.size}/{CHALLENGES.length} completed
            </p>
          </div>
          {/* Progress bar */}
          <div className="w-32 h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all"
              style={{ width: `${(completed.size / CHALLENGES.length) * 100}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {CHALLENGES.map((challenge) => (
            <button
              key={challenge.id}
              onClick={() => startChallenge(challenge)}
              className="text-left p-4 rounded-xl bg-gray-900 border border-gray-700 hover:border-gray-600 hover:bg-gray-800 transition-all group"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${DIFFICULTY_COLORS[challenge.difficulty]}`}>
                    {challenge.difficulty}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TOPIC_COLORS[challenge.topic]}`}>
                    {challenge.topic}
                  </span>
                </div>
                {completed.has(challenge.id) && (
                  <span className="text-green-400 text-sm">✅</span>
                )}
              </div>
              <h4 className="font-semibold text-white text-sm group-hover:text-blue-300 transition-colors">
                {challenge.title}
              </h4>
              <p className="text-gray-400 text-xs mt-1 leading-relaxed">{challenge.description}</p>
              <div className="mt-3 flex items-center gap-1 text-xs text-gray-500">
                <span>{challenge.hints.length} hints available</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setActiveChallenge(null)}
          className="text-gray-400 hover:text-white transition-colors text-sm flex items-center gap-1"
        >
          ← Challenges
        </button>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${DIFFICULTY_COLORS[activeChallenge.difficulty]}`}>
            {activeChallenge.difficulty}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TOPIC_COLORS[activeChallenge.topic]}`}>
            {activeChallenge.topic}
          </span>
        </div>
        <h3 className="font-semibold text-white ml-1">{activeChallenge.title}</h3>
      </div>

      {/* Scenario */}
      <div className="rounded-xl bg-gray-900 border border-gray-700 p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Scenario</p>
        <pre className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed font-sans">{activeChallenge.scenario}</pre>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Editor */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-300">
              {activeChallenge.brokenYaml ? "Fix the YAML" : "Write the YAML"}
            </span>
            <div className="flex gap-2">
              <button
                onClick={nextHint}
                disabled={showHint && hintIndex >= activeChallenge.hints.length - 1}
                className="text-xs px-3 py-1.5 bg-yellow-900/40 hover:bg-yellow-900/60 text-yellow-300 border border-yellow-700 rounded-lg disabled:opacity-40 transition-colors"
              >
                💡 Hint {hintIndex > 0 ? `${hintIndex + 1}/${activeChallenge.hints.length}` : ""}
              </button>
              <button
                onClick={checkAnswer}
                className="text-xs px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
              >
                Check Answer
              </button>
            </div>
          </div>
          <div className="rounded-xl overflow-hidden border border-gray-700">
            <MonacoEditor
              height="400px"
              defaultLanguage={activeChallenge.topic === "Docker" ? "dockerfile" : "yaml"}
              theme="vs-dark"
              value={userYaml}
              onChange={(v) => { setUserYaml(v || ""); setCheckResult(null); }}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                wordWrap: "on",
                tabSize: 2,
              }}
            />
          </div>
        </div>

        {/* Feedback panel */}
        <div className="flex flex-col gap-3">
          {/* Hint */}
          {showHint && (
            <div className="rounded-xl bg-yellow-900/20 border border-yellow-700 p-4">
              <p className="text-xs font-semibold text-yellow-400 mb-1.5">
                💡 Hint {hintIndex + 1} of {activeChallenge.hints.length}
              </p>
              <p className="text-sm text-yellow-100">{activeChallenge.hints[hintIndex]}</p>
              {hintIndex < activeChallenge.hints.length - 1 && (
                <button onClick={nextHint} className="text-xs text-yellow-400 hover:text-yellow-300 mt-2">
                  Next hint →
                </button>
              )}
            </div>
          )}

          {/* Check result */}
          {checkResult && (
            <div className={`rounded-xl p-4 border ${
              checkResult.passed ? "bg-green-900/30 border-green-700" : "bg-red-900/20 border-red-800"
            }`}>
              <pre className={`text-sm whitespace-pre-wrap font-sans leading-relaxed ${
                checkResult.passed ? "text-green-200" : "text-red-200"
              }`}>{checkResult.feedback}</pre>
              {checkResult.passed && (
                <div className="mt-3 pt-3 border-t border-green-700">
                  <p className="text-xs text-green-300 font-semibold mb-1">Explanation</p>
                  <p className="text-sm text-green-100 leading-relaxed">{activeChallenge.solutionExplanation}</p>
                </div>
              )}
            </div>
          )}

          {/* Show solution */}
          <div className="rounded-xl bg-gray-900 border border-gray-700 overflow-hidden">
            <button
              onClick={() => setShowSolution(s => !s)}
              className="w-full px-4 py-3 text-sm text-left flex items-center justify-between hover:bg-gray-800 transition-colors"
            >
              <span className="text-gray-300 font-medium">
                {showSolution ? "Hide" : "Show"} Reference Solution
              </span>
              <span className="text-gray-500">{showSolution ? "▲" : "▼"}</span>
            </button>
            {showSolution && (
              <div className="border-t border-gray-700">
                <div className="p-3 bg-gray-800/50 max-h-80 overflow-y-auto">
                  <pre className="text-xs text-green-300 font-mono whitespace-pre-wrap leading-relaxed">
                    {activeChallenge.solution}
                  </pre>
                </div>
                <div className="px-4 py-3 border-t border-gray-700">
                  <p className="text-xs font-semibold text-gray-400 mb-1">Why this works:</p>
                  <p className="text-sm text-gray-300 leading-relaxed">{activeChallenge.solutionExplanation}</p>
                </div>
              </div>
            )}
          </div>

          {/* Empty state */}
          {!checkResult && !showHint && !showSolution && (
            <div className="rounded-xl bg-gray-900 border border-gray-700 p-6 text-center">
              <div className="text-3xl mb-2">🎯</div>
              <p className="text-gray-400 text-sm">Edit the YAML to meet the requirements</p>
              <p className="text-gray-500 text-xs mt-1">then click "Check Answer"</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

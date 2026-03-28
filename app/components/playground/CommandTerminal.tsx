"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface TerminalLine {
  type: "input" | "output" | "error" | "info";
  content: string;
}

// ── Simulated command responses ────────────────────────────────────────────

const KUBECTL_RESPONSES: Record<string, string> = {
  "kubectl get nodes": `NAME           STATUS   ROLES           AGE   VERSION
control-plane  Ready    control-plane   30d   v1.29.2
worker-01      Ready    <none>          30d   v1.29.2
worker-02      Ready    <none>          30d   v1.29.2
worker-03      Ready    <none>          30d   v1.29.2`,

  "kubectl get pods": `NAME                          READY   STATUS    RESTARTS   AGE
frontend-7d9b4c8f9-x2kpq      1/1     Running   0          2d
frontend-7d9b4c8f9-r8mnv      1/1     Running   0          2d
backend-6c5b8f7d4-9lkwz       1/1     Running   0          1d
backend-6c5b8f7d4-m3nqp       1/1     Running   0          1d
postgres-0                    1/1     Running   0          30d`,

  "kubectl get pods -A": `NAMESPACE     NAME                              READY   STATUS    RESTARTS   AGE
kube-system   coredns-5d78c9869d-8fgkj          1/1     Running   0          30d
kube-system   etcd-control-plane                1/1     Running   0          30d
kube-system   kube-apiserver-control-plane      1/1     Running   0          30d
kube-system   kube-controller-manager           1/1     Running   0          30d
ingress-nginx ingress-nginx-controller-7fk9x    1/1     Running   0          15d
monitoring    prometheus-0                      2/2     Running   0          10d
monitoring    grafana-7d8b9c4f6-x2kpq           1/1     Running   0          10d
production    frontend-7d9b4c8f9-x2kpq          1/1     Running   0          2d
production    backend-6c5b8f7d4-9lkwz           1/1     Running   0          1d`,

  "kubectl get services": `NAME         TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)   AGE
kubernetes   ClusterIP   10.96.0.1       <none>        443/TCP   30d
frontend     ClusterIP   10.96.42.100    <none>        80/TCP    2d
backend      ClusterIP   10.96.42.101    <none>        8080/TCP  1d
postgres     ClusterIP   10.96.42.102    <none>        5432/TCP  30d`,

  "kubectl get deployments": `NAME       READY   UP-TO-DATE   AVAILABLE   AGE
frontend   2/2     2            2           2d
backend    2/2     2            2           1d`,

  "kubectl get namespaces": `NAME              STATUS   AGE
default           Active   30d
kube-system       Active   30d
kube-public       Active   30d
kube-node-lease   Active   30d
production        Active   15d
staging           Active   10d
monitoring        Active   10d
ingress-nginx     Active   15d`,

  "kubectl get ingress": `NAME              CLASS   HOSTS               ADDRESS          PORTS     AGE
app-ingress       nginx   app.example.com     192.168.1.210    80, 443   2d`,

  "kubectl cluster-info": `Kubernetes control plane is running at https://10.0.0.10:6443
CoreDNS is running at https://10.0.0.10:6443/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy

To further debug and diagnose cluster problems, use 'kubectl cluster-info dump'.`,

  "kubectl get networkpolicies": `NAME              POD-SELECTOR   AGE
default-deny-all  <none>         1d
frontend-to-api   app=backend    1d
backend-to-db     app=postgres   1d`,

  "helm list": `NAME        NAMESPACE    REVISION  UPDATED                  STATUS    CHART                   APP VERSION
ingress     ingress-nginx 3        2024-01-15 10:22:00 UTC  deployed  ingress-nginx-4.9.1     1.10.0
monitoring  monitoring    2        2024-01-10 08:00:00 UTC  deployed  kube-prometheus-0.72.0  0.72.0
platform    production    5        2024-01-20 14:30:00 UTC  deployed  platform-1.0.4          2024.1`,

  "helm repo list": `NAME                    URL
stable                  https://charts.helm.sh/stable
ingress-nginx           https://kubernetes.github.io/ingress-nginx
prometheus-community    https://prometheus-community.github.io/helm-charts
bitnami                 https://charts.bitnami.com/bitnami`,

  "docker ps": `CONTAINER ID   IMAGE              COMMAND                  CREATED       STATUS       PORTS                   NAMES
a1b2c3d4e5f6   nginx:1.25-alpine  "/docker-entrypoint.…"   2 hours ago   Up 2 hours   0.0.0.0:80->80/tcp      webserver
b2c3d4e5f6a7   postgres:15        "docker-entrypoint.s…"   3 hours ago   Up 3 hours   5432/tcp                postgres-dev
c3d4e5f6a7b8   redis:7-alpine     "docker-entrypoint.s…"   1 hour ago    Up 1 hour    6379/tcp                redis-cache`,

  "docker images": `REPOSITORY      TAG         IMAGE ID       CREATED        SIZE
myapp/backend   latest      sha256:abc12   2 hours ago    45.2MB
myapp/frontend  latest      sha256:def34   3 hours ago    23.8MB
nginx           1.25-alpine sha256:ghi56   5 days ago     41MB
postgres        15          sha256:jkl78   5 days ago     379MB
redis           7-alpine    sha256:mno90   5 days ago     41MB`,

  "docker network ls": `NETWORK ID     NAME              DRIVER    SCOPE
1a2b3c4d5e6f   bridge            bridge    local
7g8h9i0j1k2l   host              host      local
3m4n5o6p7q8r   none              null      local
9s0t1u2v3w4x   myapp_default     bridge    local`,
};

// Dynamic responses for commands with arguments
const dynamicResponse = (cmd: string): string | null => {
  const trimmed = cmd.trim();

  // kubectl describe pod
  if (/^kubectl describe pod/.test(trimmed)) {
    const podName = trimmed.split(" ").slice(-1)[0];
    return `Name:         ${podName}
Namespace:    production
Node:         worker-01/10.0.0.21
Start Time:   Mon, 20 Jan 2026 14:30:00 +0000
Labels:       app=backend, version=v2
Status:       Running
IP:           10.244.1.42
Containers:
  app:
    Image:         registry.example.com/backend:v2.1.0
    Port:          8080/TCP
    State:         Running
    Ready:         True
    Restart Count: 0
    Limits:
      cpu:     500m
      memory:  512Mi
    Requests:
      cpu:     100m
      memory:  128Mi
    Liveness:  http-get http://:8080/health delay=5s timeout=3s period=10s
    Readiness: http-get http://:8080/ready delay=5s timeout=3s period=5s
Events:
  Type    Reason     Age   From               Message
  ----    ------     ----  ----               -------
  Normal  Scheduled  2d    default-scheduler  Successfully assigned production/${podName} to worker-01
  Normal  Pulled     2d    kubelet            Container image already present on machine
  Normal  Started    2d    kubelet            Started container app`;
  }

  // kubectl apply -f
  if (/^kubectl apply -f/.test(trimmed)) {
    const file = trimmed.split(" ").slice(-1)[0];
    return `deployment.apps/my-app created\nservice/my-app created`;
  }

  // kubectl delete
  if (/^kubectl delete/.test(trimmed)) {
    const parts = trimmed.split(" ");
    const resource = parts[2] || "resource";
    const name = parts[3] || "my-resource";
    return `${resource}.apps "${name}" deleted`;
  }

  // kubectl scale
  if (/^kubectl scale/.test(trimmed)) {
    const match = trimmed.match(/--replicas=(\d+)/);
    const replicas = match ? match[1] : "3";
    return `deployment.apps/my-app scaled\n\nVerify: kubectl get pods -w\nNAME                      READY   STATUS    RESTARTS   AGE\nmy-app-7d9b4c8f9-x2kpq   1/1     Running   0          5s\nmy-app-7d9b4c8f9-r8mnv   1/1     Running   0          4s\nmy-app-7d9b4c8f9-z9pqr   0/1     Pending   0          1s`;
  }

  // kubectl rollout
  if (/^kubectl rollout status/.test(trimmed)) {
    return `Waiting for deployment "my-app" rollout to finish: 1 out of 3 new replicas have been updated...\nWaiting for deployment "my-app" rollout to finish: 2 out of 3 new replicas have been updated...\nWaiting for deployment "my-app" rollout to finish: 1 old replicas are pending termination...\ndeployment "my-app" successfully rolled out`;
  }
  if (/^kubectl rollout undo/.test(trimmed)) {
    return `deployment.apps/my-app rolled back`;
  }
  if (/^kubectl rollout history/.test(trimmed)) {
    return `deployment.apps/my-app\nREVISION  CHANGE-CAUSE\n1         Initial deployment\n2         Update to v1.1.0\n3         Update to v1.2.0 (current)`;
  }

  // kubectl logs
  if (/^kubectl logs/.test(trimmed)) {
    return `{"time":"2026-01-20T14:30:00Z","level":"info","msg":"Server started","port":8080}
{"time":"2026-01-20T14:30:05Z","level":"info","msg":"Database connected","host":"postgres:5432"}
{"time":"2026-01-20T14:30:10Z","level":"info","msg":"Ready to serve traffic"}
{"time":"2026-01-20T14:31:00Z","level":"info","msg":"GET /health","status":200,"duration":"0.8ms"}
{"time":"2026-01-20T14:32:00Z","level":"info","msg":"POST /api/orders","status":201,"duration":"12ms","user_id":"usr_123"}`;
  }

  // kubectl exec
  if (/^kubectl exec/.test(trimmed)) {
    return `# Exec'd into pod. Type 'exit' to leave.\n# (Simulated shell — commands are educational examples)`;
  }

  // kubectl top
  if (/^kubectl top pods/.test(trimmed)) {
    return `NAME                          CPU(cores)   MEMORY(bytes)
frontend-7d9b4c8f9-x2kpq      12m          98Mi
frontend-7d9b4c8f9-r8mnv      10m          95Mi
backend-6c5b8f7d4-9lkwz       45m          210Mi
backend-6c5b8f7d4-m3nqp       38m          198Mi
postgres-0                    22m          312Mi`;
  }
  if (/^kubectl top nodes/.test(trimmed)) {
    return `NAME           CPU(cores)   CPU%   MEMORY(bytes)   MEMORY%
control-plane  243m         12%    1842Mi          48%
worker-01      512m         26%    3212Mi          84%
worker-02      398m         20%    2940Mi          77%
worker-03      185m         9%     2105Mi          55%`;
  }

  // helm install/upgrade
  if (/^helm (install|upgrade)/.test(trimmed)) {
    const parts = trimmed.split(" ");
    const releaseName = parts[2] || "my-release";
    return `Release "${releaseName}" has been upgraded. Happy Helming!
NAME: ${releaseName}
LAST DEPLOYED: ${new Date().toUTCString()}
NAMESPACE: default
STATUS: deployed
REVISION: 2
NOTES:
  Service URL: http://my-app.example.com
  Run \`helm test ${releaseName}\` to verify the deployment.`;
  }

  // helm diff
  if (/^helm diff/.test(trimmed)) {
    return `default, my-app, Deployment (apps) has changed:
  spec:
    template:
      spec:
        containers:
          - name: app
-           image: registry.example.com/app:v1.1.0
+           image: registry.example.com/app:v1.2.0
-           resources:
-             limits:
-               memory: 256Mi
+           resources:
+             limits:
+               memory: 512Mi`;
  }

  // docker build
  if (/^docker build/.test(trimmed)) {
    return `[+] Building 12.4s (10/10) FINISHED
 => [internal] load build definition from Dockerfile          0.0s
 => [internal] load .dockerignore                             0.0s
 => [internal] load metadata for docker.io/library/node:20   1.2s
 => [1/4] FROM docker.io/library/node:20-alpine              0.0s
 => [2/4] WORKDIR /app                                        0.0s
 => [3/4] COPY package*.json ./                              0.1s
 => [4/4] RUN npm ci --only=production                       8.3s
 => exporting to image                                        2.8s
 => => writing image sha256:abc123def456...                   0.1s
 => => naming to docker.io/myapp/backend:latest               0.0s`;
  }

  // docker run
  if (/^docker run/.test(trimmed)) {
    return `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6`;
  }

  // docker pull
  if (/^docker pull/.test(trimmed)) {
    const image = trimmed.split(" ").slice(-1)[0];
    return `Using default tag: latest\nlatest: Pulling from ${image}\nDigest: sha256:abc123...\nStatus: Downloaded newer image for ${image}:latest`;
  }

  return null;
};

const COMMAND_HINTS: Record<string, string[]> = {
  kubectl: [
    "kubectl get pods",
    "kubectl get pods -A",
    "kubectl get nodes",
    "kubectl get services",
    "kubectl get deployments",
    "kubectl get namespaces",
    "kubectl get ingress",
    "kubectl get networkpolicies",
    "kubectl describe pod <pod-name>",
    "kubectl logs <pod-name>",
    "kubectl top pods",
    "kubectl top nodes",
    "kubectl scale deployment my-app --replicas=5",
    "kubectl rollout status deployment/my-app",
    "kubectl rollout history deployment/my-app",
    "kubectl rollout undo deployment/my-app",
    "kubectl apply -f deployment.yaml",
    "kubectl delete deployment my-app",
    "kubectl exec -it <pod-name> -- sh",
  ],
  helm: [
    "helm list",
    "helm repo list",
    "helm install my-release ./chart",
    "helm upgrade my-release ./chart",
    "helm diff upgrade my-release ./chart",
    "helm rollback my-release 1",
    "helm history my-release",
    "helm test my-release",
  ],
  docker: [
    "docker ps",
    "docker images",
    "docker network ls",
    "docker build -t myapp:latest .",
    "docker run -d -p 8080:80 nginx",
    "docker pull nginx:alpine",
  ],
};

export default function CommandTerminal() {
  const [lines, setLines] = useState<TerminalLine[]>([
    { type: "info", content: "DevOps Command Simulator — kubectl | helm | docker" },
    { type: "info", content: 'Type a command or "help" to see examples. Tab to autocomplete.' },
    { type: "info", content: "" },
  ]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const getSuggestions = (value: string) => {
    if (!value.trim()) { setSuggestions([]); return; }
    const tool = value.split(" ")[0] as keyof typeof COMMAND_HINTS;
    if (COMMAND_HINTS[tool]) {
      const matches = COMMAND_HINTS[tool].filter(c => c.startsWith(value));
      setSuggestions(matches.slice(0, 5));
    } else {
      // suggest tool names
      const tools = Object.keys(COMMAND_HINTS);
      setSuggestions(tools.filter(t => t.startsWith(value)));
    }
  };

  const runCommand = useCallback((cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    setLines(prev => [...prev, { type: "input", content: `$ ${trimmed}` }]);
    setHistory(prev => [trimmed, ...prev.slice(0, 49)]);
    setHistoryIndex(-1);
    setSuggestions([]);

    // Handle special commands
    if (trimmed === "clear" || trimmed === "cls") {
      setLines([{ type: "info", content: "Terminal cleared." }]);
      return;
    }
    if (trimmed === "help") {
      const help = [
        "Available command groups:",
        "",
        "  kubectl  — Kubernetes cluster management",
        "  helm     — Helm chart operations",
        "  docker   — Docker container/image management",
        "",
        "Useful commands to try:",
        "  kubectl get pods                      List pods in default namespace",
        "  kubectl get pods -A                   List all pods across namespaces",
        "  kubectl describe pod <name>           Inspect a pod",
        "  kubectl logs <pod-name>               View pod logs",
        "  kubectl top pods                      CPU/memory usage",
        "  kubectl scale deployment x --replicas=3",
        "  kubectl rollout history deployment/x  View rollout history",
        "  helm list                             List Helm releases",
        "  docker ps                             List running containers",
        "",
        "Type 'clear' to clear the terminal.",
      ];
      setLines(prev => [...prev, ...help.map(c => ({ type: "output" as const, content: c }))]);
      return;
    }

    // Look up static response first
    const staticKey = Object.keys(KUBECTL_RESPONSES).find(k =>
      trimmed === k || trimmed.startsWith(k + " ")
    );
    if (staticKey) {
      const output = KUBECTL_RESPONSES[staticKey];
      setLines(prev => [...prev, ...output.split("\n").map(l => ({ type: "output" as const, content: l })), { type: "output", content: "" }]);
      return;
    }

    // Try dynamic response
    const dynamic = dynamicResponse(trimmed);
    if (dynamic !== null) {
      setLines(prev => [...prev, ...dynamic.split("\n").map(l => ({ type: "output" as const, content: l })), { type: "output", content: "" }]);
      return;
    }

    // Unknown command
    const tool = trimmed.split(" ")[0];
    const known = ["kubectl", "helm", "docker", "clear", "help", "cls"];
    if (!known.includes(tool)) {
      setLines(prev => [
        ...prev,
        { type: "error", content: `bash: ${tool}: command not found` },
        { type: "info", content: `Tip: Available tools: kubectl, helm, docker. Type "help" for examples.` },
        { type: "output", content: "" },
      ]);
    } else {
      setLines(prev => [
        ...prev,
        { type: "error", content: `Error: Unknown subcommand. Try "${tool} --help" or type "help".` },
        { type: "output", content: "" },
      ]);
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      runCommand(input);
      setInput("");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(next);
      setInput(history[next] || "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.max(historyIndex - 1, -1);
      setHistoryIndex(next);
      setInput(next === -1 ? "" : history[next]);
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (suggestions.length === 1) {
        setInput(suggestions[0]);
        setSuggestions([]);
      } else if (suggestions.length > 1) {
        // Show all suggestions
        setLines(prev => [
          ...prev,
          { type: "input", content: `$ ${input}` },
          ...suggestions.map(s => ({ type: "output" as const, content: `  ${s}` })),
          { type: "output", content: "" },
        ]);
      }
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Quick command buttons */}
      <div className="flex flex-wrap gap-2">
        <span className="text-sm text-gray-400 self-center mr-1">Quick run:</span>
        {[
          "kubectl get pods -A",
          "kubectl top nodes",
          "kubectl get deployments",
          "helm list",
          "docker ps",
        ].map((cmd) => (
          <button
            key={cmd}
            onClick={() => { runCommand(cmd); inputRef.current?.focus(); }}
            className="px-3 py-1 rounded-full text-xs font-mono bg-gray-800 hover:bg-gray-700 text-green-300 border border-gray-700 hover:border-gray-600 transition-all"
          >
            {cmd}
          </button>
        ))}
      </div>

      {/* Terminal window */}
      <div
        className="bg-gray-950 rounded-xl border border-gray-700 overflow-hidden"
        onClick={() => inputRef.current?.focus()}
      >
        {/* Window chrome */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 border-b border-gray-700">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="ml-2 text-xs text-gray-400 font-mono">devops-playground ~</span>
        </div>

        {/* Output */}
        <div className="h-[420px] overflow-y-auto p-4 font-mono text-sm leading-relaxed">
          {lines.map((line, i) => (
            <div
              key={i}
              className={
                line.type === "input" ? "text-green-400 mt-1" :
                line.type === "error" ? "text-red-400" :
                line.type === "info" ? "text-blue-300 opacity-70" :
                "text-gray-200"
              }
            >
              {line.content || "\u00A0"}
            </div>
          ))}

          {/* Current input line */}
          <div className="flex items-center mt-1">
            <span className="text-green-400 mr-2">$</span>
            <div className="relative flex-1">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => { setInput(e.target.value); getSuggestions(e.target.value); }}
                onKeyDown={handleKeyDown}
                className="bg-transparent text-white outline-none w-full font-mono caret-green-400"
                autoFocus
                spellCheck={false}
                autoComplete="off"
              />
            </div>
          </div>

          {/* Autocomplete dropdown */}
          {suggestions.length > 0 && (
            <div className="mt-1 ml-4 border border-gray-700 rounded bg-gray-900">
              {suggestions.map((s, i) => (
                <div
                  key={i}
                  className="px-3 py-1 text-xs text-gray-300 hover:bg-gray-700 cursor-pointer font-mono"
                  onClick={() => { setInput(s); setSuggestions([]); inputRef.current?.focus(); }}
                >
                  {s}
                </div>
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Bottom hint bar */}
        <div className="px-4 py-2 bg-gray-900 border-t border-gray-700 flex items-center gap-4 text-xs text-gray-500">
          <span>↑↓ history</span>
          <span>Tab autocomplete</span>
          <span className="font-mono text-gray-600">|</span>
          <span>type <span className="text-green-400 font-mono">help</span> for commands</span>
          <span className="font-mono text-gray-600">|</span>
          <span>type <span className="text-green-400 font-mono">clear</span> to reset</span>
        </div>
      </div>
    </div>
  );
}

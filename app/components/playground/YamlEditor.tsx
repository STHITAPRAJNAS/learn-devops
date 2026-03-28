"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useEffect } from "react";
import type * as monaco from "monaco-editor";

// Load Monaco lazily (heavy, ~2MB)
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

interface ValidationIssue {
  line?: number;
  severity: "error" | "warning" | "info";
  message: string;
}

interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  suggestions: string[];
  summary: string;
  resource_count?: number;
}

const STARTER_TEMPLATES: Record<string, string> = {
  deployment: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
  labels:
    app: my-app
    version: v1
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
        version: v1
    spec:
      containers:
      - name: app
        image: nginx:1.25-alpine
        ports:
        - containerPort: 80
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 500m
            memory: 256Mi
        readinessProbe:
          httpGet:
            path: /
            port: 80
          initialDelaySeconds: 5
          periodSeconds: 10
        securityContext:
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
          runAsNonRoot: true
          runAsUser: 1000`,

  service: `apiVersion: v1
kind: Service
metadata:
  name: my-app
  labels:
    app: my-app
spec:
  selector:
    app: my-app
  ports:
  - port: 80
    targetPort: 80
    protocol: TCP
  type: ClusterIP`,

  networkpolicy: `apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: backend-policy
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
    - protocol: TCP
      port: 8080
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: postgres
    ports:
    - protocol: TCP
      port: 5432
  - ports:
    - protocol: UDP
      port: 53`,

  hpa: `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: my-app-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  minReplicas: 2
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Pods
        value: 4
        periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300`,

  ingress: `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-app-ingress
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - app.example.com
    secretName: app-tls
  rules:
  - host: app.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: my-app
            port:
              number: 80`,
};

const AGENT_API = process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:8000";

export default function YamlEditor() {
  const [yaml, setYaml] = useState(STARTER_TEMPLATES.deployment);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState("deployment");
  const [aiExplanation, setAiExplanation] = useState("");
  const [isExplaining, setIsExplaining] = useState(false);
  const [editorMarkers, setEditorMarkers] = useState<monaco.editor.IMarkerData[]>([]);

  // Client-side YAML parse check (instant feedback, no API call)
  const quickParseCheck = useCallback((value: string): ValidationIssue[] => {
    try {
      const jsyaml = require("js-yaml");
      jsyaml.loadAll(value);
      return [];
    } catch (e: unknown) {
      const err = e as { mark?: { line: number }; message: string };
      return [{
        severity: "error",
        line: err.mark ? err.mark.line + 1 : undefined,
        message: `YAML syntax error: ${err.message}`,
      }];
    }
  }, []);

  const handleEditorChange = useCallback((value: string | undefined) => {
    const v = value || "";
    setYaml(v);
    setResult(null);
    setAiExplanation("");

    // Instant syntax check
    const parseErrors = quickParseCheck(v);
    if (parseErrors.length > 0) {
      setResult({
        valid: false,
        issues: parseErrors,
        suggestions: [],
        summary: "Fix YAML syntax errors before validating",
      });
    }
  }, [quickParseCheck]);

  const validate = async () => {
    setIsValidating(true);
    setAiExplanation("");
    try {
      const res = await fetch(`${AGENT_API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Please validate this Kubernetes YAML and use the validate_yaml tool:\n\`\`\`yaml\n${yaml}\n\`\`\``,
          session_id: "playground-yaml-" + Date.now(),
          user_id: "playground",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        // Try to extract tool result from the agent response
        const toolCall = data.tool_calls?.find((t: { tool: string }) => t.tool === "validate_yaml");
        if (toolCall) {
          // Parse validation from agent response text
          setAiExplanation(data.response);
        } else {
          setAiExplanation(data.response);
        }
        // Also run client-side validation for UI markers
        runClientValidation();
      } else {
        runClientValidation();
      }
    } catch {
      runClientValidation();
    } finally {
      setIsValidating(false);
    }
  };

  const runClientValidation = () => {
    const issues: ValidationIssue[] = [];
    const suggestions: string[] = [];

    // Quick parse first
    const parseErrors = quickParseCheck(yaml);
    if (parseErrors.length > 0) {
      setResult({ valid: false, issues: parseErrors, suggestions: [], summary: "YAML syntax error" });
      return;
    }

    const lines = yaml.split("\n");

    // Check for common issues
    if (!yaml.includes("resources:")) {
      issues.push({ severity: "warning", message: "No resource requests/limits defined" });
      suggestions.push("Add resources.requests and resources.limits to all containers");
    }
    if (!yaml.includes("readinessProbe") && yaml.includes("kind: Deployment")) {
      suggestions.push("Consider adding a readinessProbe to prevent routing to unready pods");
    }
    if (yaml.includes("privileged: true")) {
      issues.push({ severity: "error", message: "Privileged container detected — major security risk" });
    }
    if (yaml.includes("type: NodePort")) {
      suggestions.push("Consider ClusterIP + Ingress instead of NodePort for production");
    }
    if (!yaml.includes("labels:")) {
      issues.push({ severity: "warning", message: "No labels defined — required for selector matching" });
    }
    if (yaml.includes(":latest")) {
      issues.push({ severity: "warning", message: "Using ':latest' tag — pin to a specific version for reproducibility" });
    }

    // Check indentation consistency
    lines.forEach((line, i) => {
      if (line.length > 0 && line.search(/\S/) % 2 !== 0 && !line.trimStart().startsWith("#")) {
        issues.push({ severity: "warning", line: i + 1, message: `Odd indentation at line ${i + 1} (use 2-space indentation)` });
      }
    });

    setResult({
      valid: issues.filter(i => i.severity === "error").length === 0,
      issues,
      suggestions,
      summary: `Found ${issues.length} issue(s) and ${suggestions.length} suggestion(s)`,
      resource_count: (yaml.match(/^kind:/gm) || []).length,
    });
  };

  const loadTemplate = (key: string) => {
    setActiveTemplate(key);
    setYaml(STARTER_TEMPLATES[key]);
    setResult(null);
    setAiExplanation("");
  };

  const copyYaml = () => navigator.clipboard.writeText(yaml);

  return (
    <div className="flex flex-col gap-4">
      {/* Template picker */}
      <div className="flex flex-wrap gap-2">
        <span className="text-sm text-gray-400 self-center mr-1">Templates:</span>
        {Object.keys(STARTER_TEMPLATES).map((key) => (
          <button
            key={key}
            onClick={() => loadTemplate(key)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
              activeTemplate === key
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700"
            }`}
          >
            {key.charAt(0).toUpperCase() + key.slice(1)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Editor */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-300">YAML Editor</span>
            <div className="flex gap-2">
              <button onClick={copyYaml} className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-700 transition-colors">
                Copy
              </button>
              <button
                onClick={validate}
                disabled={isValidating}
                className="text-xs px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white rounded-lg transition-colors font-medium"
              >
                {isValidating ? "Validating…" : "Validate + AI Review"}
              </button>
            </div>
          </div>
          <div className="rounded-xl overflow-hidden border border-gray-700 h-[500px]">
            <MonacoEditor
              height="500px"
              defaultLanguage="yaml"
              theme="vs-dark"
              value={yaml}
              onChange={handleEditorChange}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                wordWrap: "on",
                tabSize: 2,
                insertSpaces: true,
                formatOnPaste: true,
                automaticLayout: true,
                suggestOnTriggerCharacters: true,
              }}
            />
          </div>
        </div>

        {/* Results panel */}
        <div className="flex flex-col gap-3">
          {/* Status banner */}
          {result && (
            <div className={`rounded-xl p-4 border ${
              result.valid
                ? "bg-green-900/30 border-green-700"
                : result.issues.some(i => i.severity === "error")
                  ? "bg-red-900/30 border-red-700"
                  : "bg-yellow-900/30 border-yellow-700"
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">
                  {result.valid ? "✅" : result.issues.some(i => i.severity === "error") ? "❌" : "⚠️"}
                </span>
                <span className="font-semibold text-white text-sm">{result.summary}</span>
              </div>
              {result.resource_count !== undefined && (
                <span className="text-xs text-gray-400">{result.resource_count} resource(s) detected</span>
              )}
            </div>
          )}

          {/* Issues list */}
          {result && result.issues.length > 0 && (
            <div className="rounded-xl bg-gray-900 border border-gray-700 overflow-hidden">
              <div className="px-4 py-2 bg-gray-800 border-b border-gray-700">
                <span className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Issues</span>
              </div>
              <ul className="divide-y divide-gray-800 max-h-48 overflow-y-auto">
                {result.issues.map((issue, i) => (
                  <li key={i} className="px-4 py-2.5 flex items-start gap-2.5">
                    <span className="text-sm mt-0.5">
                      {issue.severity === "error" ? "🔴" : issue.severity === "warning" ? "🟡" : "🔵"}
                    </span>
                    <div>
                      {issue.line && <span className="text-xs text-gray-500 mr-1">Line {issue.line}:</span>}
                      <span className="text-sm text-gray-200">{issue.message}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Suggestions */}
          {result && result.suggestions.length > 0 && (
            <div className="rounded-xl bg-gray-900 border border-gray-700 overflow-hidden">
              <div className="px-4 py-2 bg-gray-800 border-b border-gray-700">
                <span className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Best Practices</span>
              </div>
              <ul className="divide-y divide-gray-800 max-h-40 overflow-y-auto">
                {result.suggestions.map((s, i) => (
                  <li key={i} className="px-4 py-2.5 flex items-start gap-2.5">
                    <span className="text-sm">💡</span>
                    <span className="text-sm text-gray-300">{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* AI Explanation */}
          {aiExplanation && (
            <div className="rounded-xl bg-gray-900 border border-blue-800 overflow-hidden">
              <div className="px-4 py-2 bg-gray-800 border-b border-blue-800 flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-500 to-purple-600" />
                <span className="text-xs font-semibold text-blue-300 uppercase tracking-wide">AI Analysis</span>
              </div>
              <div className="px-4 py-3 text-sm text-gray-300 leading-relaxed max-h-64 overflow-y-auto whitespace-pre-wrap">
                {aiExplanation}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!result && !aiExplanation && (
            <div className="rounded-xl bg-gray-900 border border-gray-700 p-8 text-center flex-1">
              <div className="text-4xl mb-3">🔍</div>
              <p className="text-gray-400 text-sm">Write or paste Kubernetes YAML, then click</p>
              <p className="text-gray-400 text-sm font-medium mt-1">"Validate + AI Review"</p>
              <p className="text-gray-600 text-xs mt-3">Checks syntax, security, resource limits, best practices</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

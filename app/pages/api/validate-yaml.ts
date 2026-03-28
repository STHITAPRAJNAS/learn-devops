import type { NextApiRequest, NextApiResponse } from "next";

interface ValidationIssue {
  severity: "error" | "warning" | "info";
  line?: number;
  message: string;
}

interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  suggestions: string[];
  summary: string;
  resource_count: number;
}

export default function handler(req: NextApiRequest, res: NextApiResponse<ValidationResult | { error: string }>) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { yaml: yamlContent } = req.body as { yaml: string };
  if (!yamlContent || typeof yamlContent !== "string") {
    return res.status(400).json({ error: "yaml field is required" });
  }

  const issues: ValidationIssue[] = [];
  const suggestions: string[] = [];
  const lines = yamlContent.split("\n");

  // Count resource documents
  const resourceCount = (yamlContent.match(/^kind:/gm) || []).length;

  // Security checks
  if (yamlContent.includes("privileged: true")) {
    issues.push({ severity: "error", message: "Privileged container detected — high security risk. Avoid unless absolutely necessary." });
  }
  if (yamlContent.includes("hostNetwork: true")) {
    issues.push({ severity: "warning", message: "hostNetwork: true gives container access to host network interfaces — avoid in production." });
  }
  if (yamlContent.includes("hostPID: true")) {
    issues.push({ severity: "warning", message: "hostPID: true gives container access to host process namespace — avoid in production." });
  }
  if (yamlContent.includes("allowPrivilegeEscalation: true")) {
    issues.push({ severity: "warning", message: "allowPrivilegeEscalation: true should be false in production containers." });
  }
  if (!yamlContent.includes("readOnlyRootFilesystem") && yamlContent.includes("kind: Deployment")) {
    suggestions.push("Consider setting securityContext.readOnlyRootFilesystem: true to prevent filesystem tampering.");
  }
  if (!yamlContent.includes("runAsNonRoot") && yamlContent.includes("kind: Deployment")) {
    suggestions.push("Set securityContext.runAsNonRoot: true to prevent running as root.");
  }

  // Image tag checks
  if (yamlContent.includes(":latest")) {
    issues.push({ severity: "warning", message: "Using ':latest' tag — pin to a specific version (e.g., nginx:1.25.3) for reproducibility." });
  }
  if (/image:\s*\w+\/?\w+\s*$/.test(yamlContent)) {
    issues.push({ severity: "warning", message: "Image without tag detected — always specify a version tag." });
  }

  // Resource checks (for Deployments)
  if (yamlContent.includes("kind: Deployment") || yamlContent.includes("kind: Pod")) {
    if (!yamlContent.includes("resources:")) {
      issues.push({ severity: "warning", message: "No resource requests/limits defined — containers can consume unbounded CPU/memory." });
      suggestions.push("Add resources.requests (for scheduling) and resources.limits (for protection) to all containers.");
    } else {
      if (!yamlContent.includes("requests:")) {
        suggestions.push("Add resources.requests — used by the scheduler to find suitable nodes.");
      }
      if (!yamlContent.includes("limits:")) {
        issues.push({ severity: "warning", message: "Resource limits not defined — containers can starve other pods." });
      }
    }
  }

  // Probe checks
  if (yamlContent.includes("kind: Deployment")) {
    if (!yamlContent.includes("readinessProbe")) {
      suggestions.push("Add a readinessProbe to prevent sending traffic to unready pods during startup/rollout.");
    }
    if (!yamlContent.includes("livenessProbe")) {
      suggestions.push("Add a livenessProbe so Kubernetes can restart stuck containers automatically.");
    }
  }

  // Label checks
  if (!yamlContent.includes("labels:")) {
    issues.push({ severity: "warning", message: "No labels defined — labels are required for selectors, monitoring, and GitOps tooling." });
  }

  // Service type checks
  if (yamlContent.includes("type: NodePort")) {
    suggestions.push("Consider ClusterIP + Ingress instead of NodePort — NodePort exposes high ports and bypasses Ingress routing.");
  }
  if (yamlContent.includes("type: LoadBalancer") && !yamlContent.includes("metallb") && !yamlContent.includes("cloud")) {
    suggestions.push("LoadBalancer type requires a cloud provider or MetalLB on bare-metal — ensure your cluster supports it.");
  }

  // Namespace check
  if (!yamlContent.includes("namespace:") && resourceCount > 0) {
    suggestions.push("Consider specifying a namespace in metadata — relying on default namespace is risky in multi-team clusters.");
  }

  // Indentation consistency
  lines.forEach((line, i) => {
    const trimmed = line.trimStart();
    if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("-")) {
      const indent = line.length - trimmed.length;
      if (indent > 0 && indent % 2 !== 0) {
        issues.push({
          severity: "warning",
          line: i + 1,
          message: `Inconsistent indentation at line ${i + 1} — use 2-space indentation throughout.`,
        });
      }
    }
  });

  // Check for hardcoded secrets
  const secretPatterns = [/password:\s*\S+/i, /secret:\s*\S+/i, /token:\s*[A-Za-z0-9+/]{20,}/];
  lines.forEach((line, i) => {
    if (secretPatterns.some(p => p.test(line)) && !line.includes("secretKeyRef") && !line.includes("secretRef")) {
      issues.push({
        severity: "error",
        line: i + 1,
        message: `Possible hardcoded secret at line ${i + 1} — use secretKeyRef or External Secrets Operator instead.`,
      });
    }
  });

  const hasErrors = issues.some(i => i.severity === "error");

  res.status(200).json({
    valid: !hasErrors,
    issues,
    suggestions,
    resource_count: resourceCount,
    summary: `${resourceCount} resource(s) • ${issues.length} issue(s) • ${suggestions.length} suggestion(s)`,
  });
}

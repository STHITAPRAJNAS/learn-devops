# Observability: Prometheus, Grafana & the Golden Signals

## The Four Golden Signals (Google SRE)

| Signal | What it measures | Example metric |
|---|---|---|
| **Latency** | Request response time | `http_request_duration_seconds` |
| **Traffic** | Requests per second | `http_requests_total` |
| **Errors** | Error rate | `http_requests_total{status=~"5.."}` |
| **Saturation** | Resource utilization | `container_cpu_usage_seconds_total` |

---

## kube-prometheus-stack (Production Setup)

The kube-prometheus-stack Helm chart bundles Prometheus, Alertmanager, Grafana, and exporters.

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set prometheus.prometheusSpec.retention=30d \
  --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.storageClassName=fast-ssd \
  --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage=200Gi \
  --set prometheus.prometheusSpec.replicas=2 \
  --set alertmanager.alertmanagerSpec.replicas=3 \
  --set grafana.adminPassword=changeme \
  --set grafana.persistence.enabled=true \
  --set grafana.persistence.size=10Gi
```

---

## Prometheus Configuration

### Scrape Config for Custom App

```yaml
# ServiceMonitor — declarative scrape config (operator-managed)
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: my-api-monitor
  namespace: monitoring
  labels:
    release: monitoring   # must match prometheus selector
spec:
  selector:
    matchLabels:
      app: my-api
  namespaceSelector:
    matchNames:
    - production
  endpoints:
  - port: metrics          # port name in Service spec
    path: /metrics
    interval: 15s
    scrapeTimeout: 10s
    tlsConfig:
      insecureSkipVerify: false
      caFile: /etc/prometheus/certs/ca.crt
    relabelings:
    - sourceLabels: [__meta_kubernetes_pod_name]
      targetLabel: pod
    - sourceLabels: [__meta_kubernetes_namespace]
      targetLabel: namespace
```

### Recording Rules (Pre-compute Expensive Queries)

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: api-recording-rules
  namespace: monitoring
  labels:
    release: monitoring
spec:
  groups:
  - name: api.rules
    interval: 30s
    rules:
    # Pre-compute request rate per service
    - record: job:http_requests:rate5m
      expr: sum(rate(http_requests_total[5m])) by (job, service)

    # Error rate percentage
    - record: job:http_errors:rate5m
      expr: |
        sum(rate(http_requests_total{status=~"5.."}[5m])) by (job)
        /
        sum(rate(http_requests_total[5m])) by (job)

    # P99 latency
    - record: job:http_request_duration_seconds:p99
      expr: histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, job))
```

### Alerting Rules

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: api-alerts
  namespace: monitoring
  labels:
    release: monitoring
spec:
  groups:
  - name: api.alerts
    rules:
    - alert: HighErrorRate
      expr: job:http_errors:rate5m > 0.05   # > 5% error rate
      for: 5m
      labels:
        severity: critical
        team: backend
      annotations:
        summary: "High error rate on {{ $labels.job }}"
        description: "Error rate is {{ $value | humanizePercentage }} (threshold: 5%)"
        runbook: "https://wiki.example.com/runbooks/high-error-rate"
        dashboard: "https://grafana.example.com/d/api-overview"

    - alert: HighP99Latency
      expr: job:http_request_duration_seconds:p99 > 1.0   # > 1 second
      for: 10m
      labels:
        severity: warning
        team: backend
      annotations:
        summary: "P99 latency exceeds 1s on {{ $labels.job }}"

    - alert: PodNotReady
      expr: kube_pod_status_ready{condition="true"} == 0
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "Pod {{ $labels.namespace }}/{{ $labels.pod }} is not ready"

    - alert: PersistentVolumeNearlyFull
      expr: |
        kubelet_volume_stats_used_bytes / kubelet_volume_stats_capacity_bytes > 0.85
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "PVC {{ $labels.persistentvolumeclaim }} is {{ $value | humanizePercentage }} full"

    - alert: DeploymentReplicasMismatch
      expr: kube_deployment_spec_replicas != kube_deployment_status_ready_replicas
      for: 15m
      labels:
        severity: warning
      annotations:
        summary: "Deployment {{ $labels.deployment }} has replica mismatch"
```

---

## Alertmanager — Routing & Silencing

```yaml
# alertmanager.yaml
global:
  resolve_timeout: 5m
  slack_api_url: 'https://hooks.slack.com/services/...'
  pagerduty_url: 'https://events.pagerduty.com/v2/enqueue'

route:
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  receiver: 'slack-warning'
  routes:
  - matchers:
    - severity=critical
    receiver: pagerduty-critical
    continue: true   # also send to next matching route
  - matchers:
    - severity=critical
    receiver: slack-critical
  - matchers:
    - team=database
    receiver: dba-team
  - matchers:
    - alertname=Watchdog    # always-firing heartbeat alert
    receiver: 'null'

receivers:
- name: 'null'

- name: slack-warning
  slack_configs:
  - channel: '#alerts-warning'
    title: '{{ template "slack.title" . }}'
    text: '{{ template "slack.text" . }}'
    send_resolved: true

- name: slack-critical
  slack_configs:
  - channel: '#alerts-critical'
    color: '{{ if eq .Status "firing" }}danger{{ else }}good{{ end }}'
    title: '[{{ .Status | toUpper }}] {{ .CommonLabels.alertname }}'
    text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'

- name: pagerduty-critical
  pagerduty_configs:
  - routing_key: '<PAGERDUTY_KEY>'
    description: '{{ template "pagerduty.description" . }}'

- name: dba-team
  email_configs:
  - to: dba@example.com
    from: alertmanager@example.com
    smarthost: smtp.example.com:587

inhibit_rules:
- source_matchers:
  - severity=critical
  target_matchers:
  - severity=warning
  equal: ['alertname', 'namespace']
```

---

## Grafana Dashboards as Code

```yaml
# ConfigMap with dashboard JSON (auto-imported by Grafana sidecar)
apiVersion: v1
kind: ConfigMap
metadata:
  name: api-dashboard
  namespace: monitoring
  labels:
    grafana_dashboard: "1"   # sidecar picks this up
data:
  api-overview.json: |
    {
      "title": "API Overview",
      "uid": "api-overview",
      "panels": [
        {
          "title": "Request Rate",
          "type": "timeseries",
          "targets": [{
            "expr": "sum(rate(http_requests_total{namespace=\"production\"}[5m])) by (service)",
            "legendFormat": "{{ service }}"
          }]
        },
        {
          "title": "Error Rate",
          "type": "stat",
          "targets": [{
            "expr": "sum(rate(http_requests_total{status=~\"5..\"}[5m])) / sum(rate(http_requests_total[5m]))",
            "legendFormat": "Error Rate"
          }],
          "fieldConfig": {
            "defaults": {
              "thresholds": {
                "steps": [
                  {"color": "green", "value": 0},
                  {"color": "yellow", "value": 0.01},
                  {"color": "red", "value": 0.05}
                ]
              },
              "unit": "percentunit"
            }
          }
        }
      ]
    }
```

---

## Useful PromQL Queries

```promql
# CPU usage by pod
sum(rate(container_cpu_usage_seconds_total{namespace="production"}[5m])) by (pod)

# Memory usage (RSS) by deployment
sum(container_memory_rss{namespace="production"}) by (deployment)

# HTTP success rate
sum(rate(http_requests_total{status!~"5.."}[5m])) / sum(rate(http_requests_total[5m]))

# P50/P95/P99 latency
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service))

# Pods not running
count(kube_pod_status_phase{phase!="Running",phase!="Succeeded"}) by (namespace, phase)

# Node memory pressure
1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)

# Top 5 pods by CPU
topk(5, sum(rate(container_cpu_usage_seconds_total[5m])) by (pod))
```

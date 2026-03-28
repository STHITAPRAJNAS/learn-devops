# Distributed Tracing & Logging

## Distributed Tracing with OpenTelemetry + Jaeger

### Concepts

```
Trace
└── Span: API Gateway (100ms total)
    ├── Span: Auth Service (8ms)
    ├── Span: Backend API (85ms)
    │   ├── Span: DB Query (30ms)
    │   └── Span: Cache Lookup (5ms)
    └── Span: Response Serialization (7ms)
```

Every span carries: trace ID, span ID, parent span ID, start/end time, tags, logs.

### OpenTelemetry Collector (central aggregation)

```yaml
apiVersion: opentelemetry.io/v1alpha1
kind: OpenTelemetryCollector
metadata:
  name: otel-collector
  namespace: monitoring
spec:
  mode: DaemonSet    # or Deployment / Sidecar
  config: |
    receivers:
      otlp:
        protocols:
          grpc:
            endpoint: 0.0.0.0:4317
          http:
            endpoint: 0.0.0.0:4318
      jaeger:
        protocols:
          thrift_http:
          grpc:
      prometheus:
        config:
          scrape_configs:
          - job_name: 'otel-collector'
            static_configs:
            - targets: ['0.0.0.0:8888']

    processors:
      batch:
        timeout: 1s
        send_batch_size: 1024
      memory_limiter:
        limit_mib: 512
        check_interval: 1s
      resource:
        attributes:
        - key: cluster
          value: production
          action: insert

    exporters:
      jaeger:
        endpoint: jaeger-collector:14250
        tls:
          insecure: true
      prometheusremotewrite:
        endpoint: http://prometheus:9090/api/v1/write
      logging:
        verbosity: detailed

    service:
      pipelines:
        traces:
          receivers: [otlp, jaeger]
          processors: [memory_limiter, batch, resource]
          exporters: [jaeger]
        metrics:
          receivers: [otlp, prometheus]
          processors: [batch]
          exporters: [prometheusremotewrite]
```

### Instrument Your App (Python example)

```python
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.instrumentation.redis import RedisInstrumentor

# Setup
provider = TracerProvider()
provider.add_span_processor(
    BatchSpanProcessor(
        OTLPSpanExporter(endpoint="http://otel-collector:4317")
    )
)
trace.set_tracer_provider(provider)

# Auto-instrument frameworks (zero code change for HTTP + DB + cache)
FastAPIInstrumentor.instrument_app(app)
SQLAlchemyInstrumentor().instrument(engine=engine)
RedisInstrumentor().instrument()

# Manual span for business logic
tracer = trace.get_tracer(__name__)

async def process_payment(payment_id: str):
    with tracer.start_as_current_span("process_payment") as span:
        span.set_attribute("payment.id", payment_id)
        span.set_attribute("payment.currency", "USD")
        try:
            result = await payment_gateway.charge(payment_id)
            span.set_attribute("payment.status", "success")
            return result
        except Exception as e:
            span.record_exception(e)
            span.set_status(trace.Status(trace.StatusCode.ERROR))
            raise
```

---

## Centralized Logging — ELK / EFK Stack

### Architecture

```
Pods → Fluent Bit (DaemonSet) → Elasticsearch → Kibana
                              ↓
                         Logstash (enrichment/parsing)
```

### Fluent Bit (lightweight log shipper)

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: fluent-bit-config
  namespace: logging
data:
  fluent-bit.conf: |
    [SERVICE]
        Flush         1
        Log_Level     info
        Daemon        off
        Parsers_File  parsers.conf
        HTTP_Server   On
        HTTP_Listen   0.0.0.0
        HTTP_Port     2020

    [INPUT]
        Name              tail
        Tag               kube.*
        Path              /var/log/containers/*.log
        Parser            cri
        DB                /var/log/flb_kube.db
        Mem_Buf_Limit     50MB
        Skip_Long_Lines   On
        Refresh_Interval  10

    [FILTER]
        Name                kubernetes
        Match               kube.*
        Kube_URL            https://kubernetes.default.svc:443
        Kube_CA_File        /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
        Kube_Token_File     /var/run/secrets/kubernetes.io/serviceaccount/token
        Kube_Tag_Prefix     kube.var.log.containers.
        Merge_Log           On        # merge JSON logs
        Keep_Log            Off
        Annotations         Off
        Labels              On

    [FILTER]
        Name    grep
        Match   kube.*
        Exclude log /healthz|/readyz|/metrics   # drop noise

    [FILTER]
        Name   modify
        Match  kube.*
        Add    cluster production

    [OUTPUT]
        Name            es
        Match           kube.*
        Host            elasticsearch-master
        Port            9200
        HTTP_User       elastic
        HTTP_Passwd     ${ELASTIC_PASSWORD}
        Logstash_Format On
        Logstash_Prefix k8s-logs
        Retry_Limit     5
        tls             On
        tls.verify      On

  parsers.conf: |
    [PARSER]
        Name        cri
        Format      regex
        Regex       ^(?<time>[^ ]+) (?<stream>stdout|stderr) (?<logtag>[^ ]*) (?<log>.*)$
        Time_Key    time
        Time_Format %Y-%m-%dT%H:%M:%S.%L%z

    [PARSER]
        Name        json
        Format      json
        Time_Key    timestamp
        Time_Format %Y-%m-%dT%H:%M:%S.%LZ
```

### Structured Logging Best Practices

Your apps should log JSON — Fluent Bit merges it automatically:

```python
import structlog

log = structlog.get_logger()

# Good: structured log with context
log.info("payment_processed",
    payment_id=payment_id,
    user_id=user_id,
    amount=amount,
    currency="USD",
    duration_ms=elapsed,
    trace_id=span.get_span_context().trace_id
)
# Output: {"event": "payment_processed", "payment_id": "pay_123", "trace_id": "abc...", ...}

# Bad: unstructured string
logger.info(f"Payment {payment_id} processed for user {user_id}")
```

### Kibana Index Patterns & Dashboards

```json
// Kibana saved search for errors
{
  "query": {
    "bool": {
      "must": [
        {"term": {"kubernetes.namespace_name": "production"}},
        {"term": {"log.level": "error"}},
        {"range": {"@timestamp": {"gte": "now-1h"}}}
      ]
    }
  },
  "sort": [{"@timestamp": {"order": "desc"}}]
}
```

---

## Loki + Grafana (Lightweight Alternative to ELK)

```bash
helm install loki grafana/loki-stack \
  --namespace monitoring \
  --set loki.persistence.enabled=true \
  --set loki.persistence.size=50Gi \
  --set promtail.enabled=true \    # log shipper
  --set grafana.enabled=false      # use existing Grafana
```

**LogQL queries (Loki query language):**
```logql
# All errors in production namespace
{namespace="production"} |= "error" | json | level="error"

# Request rate by service
sum(rate({namespace="production"}[5m])) by (app)

# P99 latency from structured logs
quantile_over_time(0.99, {app="api"} | json | unwrap duration_ms [5m])

# Correlate logs with traces
{namespace="production"} | json | trace_id="abc123def456"
```

---

## Key Insights

- **Traces** tell you *where* time is spent across services
- **Metrics** tell you *how often* and *how much*
- **Logs** tell you *what happened* in detail
- **Correlate** all three using trace ID as the common key
- Always emit trace ID in logs and expose it as a metric label

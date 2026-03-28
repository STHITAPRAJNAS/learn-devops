# ─── Stage 1: Build ────────────────────────────────────────────────────────
# Use the official Go image on Alpine for a small builder
FROM golang:1.22-alpine AS builder

# Install CA certificates (needed for HTTPS requests at build time)
RUN apk add --no-cache ca-certificates

WORKDIR /app

# Copy dependency manifests FIRST — Docker will cache this layer
# and skip re-running 'go mod download' if go.mod/go.sum haven't changed
COPY go.mod ./
# If you have a go.sum file, copy it too:
# COPY go.mod go.sum ./
RUN go mod download

# Now copy the rest of the source code
COPY . .

# Build the binary
# CGO_ENABLED=0  — disable cgo so the binary is statically linked (no glibc dependency)
# GOOS=linux     — target Linux (important when building on macOS)
# -ldflags="-s -w" — strip debug symbols and DWARF data → smaller binary
RUN CGO_ENABLED=0 GOOS=linux \
    go build -ldflags="-s -w" -o /app/server .

# ─── Stage 2: Final image ──────────────────────────────────────────────────
# Use scratch — a completely empty base image.
# The final image will contain ONLY our binary + CA certificates.
FROM scratch

# Copy CA certificates from the builder (needed for outbound HTTPS calls)
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Copy the compiled binary
COPY --from=builder /app/server /server

# Expose the port the server listens on
EXPOSE 8080

# Run the server as the entrypoint
# Must use exec form [] — shell form won't work in scratch (no /bin/sh)
ENTRYPOINT ["/server"]

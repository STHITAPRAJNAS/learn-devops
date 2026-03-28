# ─── Hello Docker Lab ──────────────────────────────────────────────────────
# A minimal Dockerfile that serves a static HTML page with nginx.

# 1. Start from the official nginx image on Alpine Linux (tiny footprint)
FROM nginx:1.25-alpine

# 2. Add metadata labels (best practice)
LABEL maintainer="devops-learn"
LABEL description="Hello Docker lab — static nginx server"

# 3. Copy our HTML content into nginx's default serving directory
#    html/ directory on the host → /usr/share/nginx/html/ in the image
COPY html/ /usr/share/nginx/html/

# 4. Expose port 80 so Docker knows the container listens here.
#    This is documentation only — it doesn't publish the port.
#    You still need -p 8080:80 when running the container.
EXPOSE 80

# 5. The base nginx image already has a CMD to start nginx in the foreground.
#    We don't need to override it here.
#
#    If you want to see it, run:  docker inspect nginx:1.25-alpine | grep -A2 Cmd

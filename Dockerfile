# --- Stage 1: Builder
FROM node:alpine AS builder

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json first to take advantage of Docker caching
COPY package.json package-lock.json ./

# Install project dependencies
RUN npm install

# Copy the rest of the source code (including 'web' directory)
COPY . .

# This generates the static files in the /app/dist directory
RUN npm run build

# --- Stage 2: Runner (Caddy) ---
FROM caddy:alpine AS runner

# Copy the Caddyfile configuration
COPY Caddyfile /etc/caddy/Caddyfile

# This script reads some environment variables and writes them to /srv/www/config.js,
# then executes the main container command (CMD).
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Copy the static production build files from the builder stage
COPY --from=builder /app/dist /srv/www

# Caddy exposes port 8080 by default.
EXPOSE 8080

# Run as a non-root user. The entrypoint writes /srv/www/config.js at startup and
# Caddy keeps its state in /config and /data, so those three need to belong to
# that user — everything else stays root-owned and read-only to the process.
#
# The capability bit has to go as well: the upstream image ships caddy with
# cap_net_bind_service=+ep (for binding :80/:443 as a non-root user), and the
# kernel refuses to exec a file with capabilities once no_new_privs is set —
# which is exactly what the pod's allowPrivilegeEscalation: false does. We
# listen on 8080, so nothing here needs the capability in the first place.
RUN apk add --no-cache libcap \
    && setcap -r /usr/bin/caddy \
    && apk del libcap \
    && chown -R 65532:65532 /srv/www /config /data
USER 65532:65532

# 3. Set the ENTRYPOINT to the script, and the main Caddy command to CMD
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--resume"]
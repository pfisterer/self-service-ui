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

# This script reads DYNAMIC_ZONE_BASE_URL and writes it to /srv/www/config.js,
# then executes the main container command (CMD).
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Copy the static production build files from the builder stage
COPY --from=builder /app/dist /srv/www

# Caddy exposes port 80 by default.
EXPOSE 80

# 3. Set the ENTRYPOINT to the script, and the main Caddy command to CMD
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["caddy", "file-server", "--root", "/srv/www", "--listen", ":80"]
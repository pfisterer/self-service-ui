# --- Stage 1: Builder (Same as before) ---
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

# --- Stage 2: Runner (Caddy - Zero Config) ---
FROM caddy:alpine AS runner

# Copy the static production build files from the builder stage
COPY --from=builder /app/web/config.js /srv/www/config.js
COPY --from=builder /app/dist /srv/www

# Caddy exposes port 80 by default.
EXPOSE 80

CMD ["caddy", "file-server", "--root", "/srv/www", "--listen", ":80"]

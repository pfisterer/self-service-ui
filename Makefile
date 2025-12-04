
# --- Project Configuration ---
PROJECT_NAME := self-service-ui
DOCKERFILE_NAME := Dockerfile

# Extract version from package.json. Requires 'jq' utility.
DOCKER_TAG := $(shell jq -r .version package.json)
DOCKER_REPO ?= ghcr.io/pfisterer/$(PROJECT_NAME)
DOCKER_PLATFORMS ?= linux/amd64,linux/arm64

# --- Targets ---
.DEFAULT_GOAL := docker-build
.PHONY: all clean docker-build multi-arch-build docker-login help dev

# Alias for the primary build target
all: docker-build

dev: 
	@echo "🚀 Starting development server..."
	npm run dev

# Local Docker Build (Uses the Caddy Dockerfile)
docker-build:
	@echo "🏗️ Building local Docker image for $(PROJECT_NAME)..."
	@echo "🏷️ Tag: $(DOCKER_REPO):$(DOCKER_TAG)"
	docker build \
		--progress=plain \
		-f $(DOCKERFILE_NAME) \
		-t "$(DOCKER_REPO):$(DOCKER_TAG)" \
		.
	@echo "✅ Docker image $(DOCKER_REPO):$(DOCKER_TAG) built."
	@echo "To run locally: docker run -p 8084:80 -e "DYNAMIC_ZONE_BASE_URL=https://your-host.com/" $(DOCKER_REPO):$(DOCKER_TAG)"

# Docker Login (Placeholder for standard workflow)
docker-login:
	@echo "🔑 Logging into Docker registry..."
	docker login "$(DOCKER_REPO)"

# Multi-Architecture Docker Build and Push (Requires 'docker buildx' and 'docker-login')
multi-arch-build: docker-login
	@echo "🏗️ Building multi-architecture Docker image for $(DOCKER_PLATFORMS)..."
	@echo "🏷️ Tags: $(DOCKER_REPO):latest, $(DOCKER_REPO):$(DOCKER_TAG)"
	docker buildx build \
		--progress plain \
		--platform $(DOCKER_PLATFORMS) \
		--tag "$(DOCKER_REPO):latest" \
		--tag "$(DOCKER_REPO):$(DOCKER_TAG)" \
		--file $(DOCKERFILE_NAME) \
		--push \
		.
	@echo "✅ Multi-architecture image built and pushed."

# Cleanup target (removed local artifacts like the 'dist' folder)
clean:
	@echo "🧹 Cleaning local build artifacts (dist folder)..."
	@rm -rf dist
	@echo "✅ Cleanup complete"

# Help
help:
	@echo "Usage: make <target>"
	@echo "  dev                 → Start the development server."
	@echo "  docker-build        → Build the local Docker image tagged with the version from package.json."
	@echo "  multi-arch-build    → Build and push multi-arch images (latest & version tag). Requires 'docker-login'."
	@echo "  docker-login        → Log into the Docker registry."
	@echo "  clean               → Remove local build output (the 'dist' folder)."


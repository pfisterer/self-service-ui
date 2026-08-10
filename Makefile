# --- Project Configuration ---
PROJECT_NAME := self-service-ui
DOCKERFILE_NAME := Dockerfile

# Extract version from package.json. Requires 'jq' utility.
DOCKER_TAG := $(shell jq -r .version package.json)
DOCKER_REPO ?= ghcr.io/pfisterer/$(PROJECT_NAME)
DOCKER_PLATFORMS ?= linux/amd64,linux/arm64

# --- Targets ---
.DEFAULT_GOAL := docker-build
.PHONY: all clean docker-build multi-arch-build docker-login help dev helm-update bump version-check

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
	@echo "To run locally: docker run -p 8084:8080 -e "DYNAMIC_ZONE_BASE_URL=https://your-host.com/" $(DOCKER_REPO):$(DOCKER_TAG)"

# Docker Login (Placeholder for standard workflow)
docker-login:
	@echo "🔑 Logging into Docker registry..."
	docker login "$(DOCKER_REPO)"

# Multi-Architecture Docker Build and Push (Requires 'docker buildx' and 'docker-login')
docker-multi-arch-build: docker-login helm-update
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

# --- Versioning -------------------------------------------------------------
# package.json is the single source of truth here (the Go services use a VERSION
# file); Chart.yaml has to agree with it. That matters more than it used to:
# once the chart is published as an OCI artifact, the number in Chart.yaml IS
# the artifact version, so a mismatch ships one release's contents under another
# release's name. `version-check` runs in CI and FAILS on a mismatch rather than
# quietly rewriting the file — rewriting would hide the very mistake it is meant
# to catch.

# make bump V=0.8.5
# npm version keeps package-lock.json in step, which a plain edit would not.
bump:
	@test -n "$(V)" || { echo "usage: make bump V=<x.y.z>"; exit 1; }
	@npm version "$(V)" --no-git-tag-version >/dev/null
	@$(MAKE) --no-print-directory helm-update

version-check:
	@v=$$(jq -r .version package.json); \
	cv=$$(awk '/^version:/{print $$2}' helm-chart/Chart.yaml); \
	av=$$(awk '/^appVersion:/{gsub(/"/,"",$$2); print $$2}' helm-chart/Chart.yaml); \
	if [ "$$v" != "$$cv" ] || [ "$$v" != "$$av" ]; then \
		echo "✗ package.json is $$v, Chart.yaml says version=$$cv appVersion=$$av"; \
		echo "  fix with: make bump V=$$v"; \
		exit 1; \
	fi; \
	echo "✅ version $$v is consistent"

# Update helm chart version from package.json
helm-update:
	@VERSION=$$(jq -r .version package.json); \
	sed -e "s/^version: .*/version: $$VERSION/" \
	    -e "s/^appVersion: .*/appVersion: \"$$VERSION\"/" \
	    helm-chart/Chart.yaml > helm-chart/Chart.yaml.tmp; \
	mv helm-chart/Chart.yaml.tmp helm-chart/Chart.yaml; \
	echo "✅ Updated helm-chart/Chart.yaml to version $$VERSION"

	helm lint helm-chart/
	echo "✅ Helm chart linted successfully."


# Cleanup target (removed local artifacts like the 'dist' folder)
clean:
	@echo "🧹 Cleaning local build artifacts (dist folder)..."
	@rm -rf dist
	@echo "✅ Cleanup complete"

# Update and install all dependencies
update-deps:
	@echo "📦 Updating Go dependencies..."
	go get -u ./...
	go mod tidy
	@echo "✅ Go dependencies updated."
	@echo "📦 Updating npm dependencies..."
	ncu -u && npm install
	@echo "✅ npm dependencies updated."

# Help
help:
	@echo "Usage: make <target>"
	@echo "  dev                      → Start the development server."
	@echo "  docker-build             → Build the local Docker image tagged with the version from package.json."
	@echo "  docker-multi-arch-build  → Build and push multi-arch images (latest & version tag). Requires 'docker-login'."
	@echo "  docker-login             → Log into the Docker registry."
	@echo "  clean                    → Remove local build output (the 'dist' folder)."
	@echo "  update-deps              → Update Go and npm dependencies."
	@echo "  helm-update              → Update Helm chart"
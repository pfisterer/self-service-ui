# --- Project Configuration ---
PROJECT_NAME := self-service-ui
DOCKERFILE_NAME := Dockerfile

# Extract version from package.json. Requires 'jq' utility.
DOCKER_TAG := $(shell jq -r .version package.json)
DOCKER_REPO ?= ghcr.io/pfisterer/$(PROJECT_NAME)
DOCKER_PLATFORMS ?= linux/amd64,linux/arm64

# --- Targets ---
.DEFAULT_GOAL := docker-build
.PHONY: publish screenshots readme-screenshots all check clean docker-build multi-arch-build docker-login help dev helm-update bump version-check

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
	@echo 'To run locally: docker run -p 8084:8080 -e DYN_ZONES_BASE_URL=https://your-host.example/ -e OIDC_CLIENT_ID=<client> -e OIDC_ISSUER_URL=https://<issuer>/realms/<realm> $(DOCKER_REPO):$(DOCKER_TAG)'

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
#
# `check` runs first, because bumping the version IS the moment a release
# starts. It is here rather than left to habit: a release went out with four
# files calling formatDate() without importing it — `npm test` covers pure
# functions only and the bundler does not object to a free variable, so ESLint
# was the one step that saw it, and it was the one step not run.
bump: check
	@test -n "$(V)" || { echo "usage: make bump V=<x.y.z>"; exit 1; }
	@npm version "$(V)" --no-git-tag-version >/dev/null
	@$(MAKE) --no-print-directory helm-update

# What CI runs, in one command.
check:
	@npm run check

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
	@echo "  check                    → Run ESLint and the unit tests (what CI runs)."
	@echo "  docker-build             → Build the local Docker image tagged with the version from package.json."
	@echo "  docker-multi-arch-build  → Build and push multi-arch images (latest & version tag). Requires 'docker-login'."
	@echo "  docker-login             → Log into the Docker registry."
	@echo "  clean                    → Remove local build output (the 'dist' folder)."
	@echo "  update-deps              → Update Go and npm dependencies."
	@echo "  helm-update              → Update Helm chart"

# make publish — release from this machine instead of waiting for CI, for test and stable versions alike: runs the checks, builds the image for the cluster (linux/amd64; the build stage runs natively and cross-compiles, see the Dockerfile), pushes it and the Helm chart to GHCR, and only then pushes the commits. CI then finds the version published and just verifies that it builds; tags and GitHub releases of stable versions stay with CI. Refuses a dirty tree and a version that is already published, so what is in the registry is always exactly one commit. Needs `docker login ghcr.io` and `helm registry login ghcr.io` with a token that may write packages.
publish: version-check check
	@test -z "$$(git status --porcelain)" || { echo "✗ uncommitted changes — commit first"; exit 1; }
	@set -e; V=$$(jq -r .version package.json); I=ghcr.io/pfisterer/self-service-ui; \
	if docker buildx imagetools inspect "$$I:$$V" >/dev/null 2>&1; then echo "✗ $$I:$$V is already published — bump the version first"; exit 1; fi; \
	echo "🏗️  $$I:$$V (linux/amd64)"; \
	docker buildx build --platform linux/amd64 --tag "$$I:$$V" --tag "$$I:latest" --push .; \
	rm -rf tmp/chart && mkdir -p tmp/chart && helm package helm-chart/ --destination tmp/chart >/dev/null; \
	helm push tmp/chart/*.tgz oci://ghcr.io/pfisterer/charts; \
	git push; \
	echo "✅ $$I:$$V and its chart are published, commits pushed — CI only verifies"
	@if [ -n "$(SCREENSHOTS_OUT)" ]; then $(MAKE) --no-print-directory screenshots OUT="$(SCREENSHOTS_OUT)"; fi

# The screenshots in the guides on dhbw.cloud: the dev server with made-up data (screenshots/fixtures.mjs), one PNG per entry of screenshots/shots.mjs, written to OUT (the homepage's frontend/public/img/anleitungen). Without OUT, the path in .screenshots-out (not versioned, one line); with it set, every `make publish` takes them again afterwards and names the pictures that changed, to be committed and published with the homepage. ONLY=name,name takes just those.
SCREENSHOTS_OUT ?= $(shell cat .screenshots-out 2>/dev/null)
screenshots:
	@out="$(or $(OUT),$(SCREENSHOTS_OUT))"; test -n "$$out" || { echo "usage: make screenshots OUT=<homepage>/frontend/public/img/anleitungen (or the path in .screenshots-out)"; exit 1; }; \
	echo "📸 screenshots → $$out"; \
	node screenshots/take.mjs "$$out" $(ONLY); \
	if git -C "$$out" rev-parse >/dev/null 2>&1; then changed=$$(git -C "$$out" status --porcelain -- .); \
	if [ -n "$$changed" ]; then echo "🖼️  changed on the homepage — commit and publish it:"; echo "$$changed"; else echo "🖼️  no picture changed"; fi; fi

# The pictures in this README (docs/img): the same made-up data in English, one per entry of README_SHOTS in screenshots/shots.mjs, as lossless WebP (needs cwebp). ONLY=name,name takes just those.
readme-screenshots:
	@echo "📸 README screenshots → docs/img"; \
	node screenshots/take.mjs --readme tmp/readme-screenshots $(ONLY) && \
	for f in tmp/readme-screenshots/*.png; do cwebp -quiet -lossless -z 9 "$$f" -o "docs/img/$$(basename "$$f" .png).webp" || exit 1; done; \
	git status --porcelain -- docs/img

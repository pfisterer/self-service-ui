#!/bin/sh
# Exit immediately if a command exits with a non-zero status.
set -e

# Check if all required environment variables are set, otherwise exit with an error.
required_vars="DYN_ZONES_BASE_URL CLOUD_SELF_SERVICE_BASE_URL OIDC_CLIENT_ID OIDC_ISSUER_URL"

for var in $required_vars; do
  if [ -z "$(eval echo \$$var)" ]; then
    echo "Error: $var environment variable is not set."
    exit 1
  fi
done

# Dynamically generate the config file
cat > /srv/www/config.js << EOF
window.appconfig = {
  dynamicZonesBaseUrl: "${DYN_ZONES_BASE_URL}",
  cloudSelfServiceBaseUrl: "${CLOUD_SELF_SERVICE_BASE_URL}",
  "oidc": {
    "client_id": "${OIDC_CLIENT_ID}",
    "issuer_url": "${OIDC_ISSUER_URL}",
  }
};
EOF

# Execute the main container command passed via CMD (e.g., the Caddy command).
exec "$@"
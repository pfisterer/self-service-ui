#!/bin/sh
# Exit immediately if a command exits with a non-zero status.
set -e

# Determine the final base URL, defaulting to 'http://example.com/' if the ENV var is empty.
BASE_URL="${DYNAMIC_ZONE_BASE_URL:-http://localhost:8082}"

# Conditional Warning: Output a warning if DYNAMIC_ZONE_BASE_URL was NOT explicitly set.
# The variable is considered unset if its length is zero after substitution.
if [ -z "${DYNAMIC_ZONE_BASE_URL}" ]; then
  echo "WARNING: DYNAMIC_ZONE_BASE_URL environment variable is not set. Defaulting to: ${BASE_URL}"
  echo "WARNING: To set a custom API base URL, set the DYNAMIC_ZONE_BASE_URL environment variable."
else
  # Debug output: Let the user know the determined URL when it was explicitly provided.
  echo "INFO: Using DYNAMIC_ZONE_BASE_URL: ${BASE_URL}"
fi

# Write the config file. Note: Quotes around EOF are removed to allow BASE_URL variable substitution.
cat > /srv/www/config.js << EOF
window.appconfig = {
  dynamicZonesBaseUrl: "${BASE_URL}"
};
EOF

# Execute the main container command passed via CMD (e.g., the Caddy command).
exec "$@"
#!/bin/sh
set -e

# Auto-create required directories if they don't exist
mkdir -p /app/tokens
mkdir -p /app/steam-data

# Docker creates a directory if the host bind-mount file is missing
if [ -d /app/config.json ]; then
	echo "ERROR: /app/config.json is a directory, not a file."
	echo "On the host, remove the config.json directory and create a file instead:"
	echo "  rm -rf config.json && cp config-example.json config.json"
	exit 1
fi

if [ ! -f /app/config.json ]; then
	echo "Creating empty /app/config.json"
	printf '[]\n' > /app/config.json
fi

exec "$@"

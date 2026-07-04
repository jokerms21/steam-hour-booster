#!/bin/sh
set -e

# Auto-create required directories if they don't exist
mkdir -p /app/tokens
mkdir -p /app/steam-data

exec "$@"

#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

IMAGE_NAME="${IMAGE_NAME:-ghcr.io/slacker80/eva_webshop}"
IMAGE_TAG="${1:-$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD 2>/dev/null || echo local)}"
export IMAGE_NAME IMAGE_TAG

mkdir -p /root/eva_data /root/eva_uploads
if [ ! -f /root/eva_data/database.db ]; then
  if [ -f /var/lib/docker/volumes/eva_webshop_crystal-jewelz-db/_data/database.db ]; then
    cp /var/lib/docker/volumes/eva_webshop_crystal-jewelz-db/_data/database.db /root/eva_data/database.db
  elif [ -f ./database.db ]; then
    cp ./database.db /root/eva_data/database.db
  fi
fi
chown -R 1000:1000 /root/eva_data /root/eva_uploads

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
else
  COMPOSE="docker-compose"
fi
$COMPOSE build eva-webshop
# docker-compose v1 can fail recreating containers built by newer Docker
# engines. Remove only the service container; data lives in /root/eva_data
# and /root/eva_uploads.
$COMPOSE rm -sf eva-webshop >/dev/null 2>&1 || true
$COMPOSE up -d --no-build eva-webshop
docker image tag "${IMAGE_NAME}:${IMAGE_TAG}" "${IMAGE_NAME}:latest"

$COMPOSE ps
curl -fsS http://localhost:3000/health >/dev/null
curl -fsS http://localhost:3000/ >/dev/null
printf 'deployed image=%s:%s\n' "$IMAGE_NAME" "$IMAGE_TAG"

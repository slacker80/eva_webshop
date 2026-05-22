#!/bin/bash
# Eva Webshop Docker Build Script v1.1.0
# Builds and tags the Docker image locally on the deployment host
# Usage: ./build-and-tag.sh [VERSION] [REGISTRY]

set -e

VERSION="${1:-1.1.0}"
REGISTRY="${2:-localhost}"
IMAGE_NAME="eva-webshop"
FULL_TAG="${REGISTRY}/${IMAGE_NAME}:${VERSION}"

echo "================================================"
echo "Eva Webshop Docker Build Script"
echo "================================================"
echo "Version: ${VERSION}"
echo "Registry: ${REGISTRY}"
echo "Full Image Tag: ${FULL_TAG}"
echo "================================================"

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is not installed or not in PATH"
    exit 1
fi

# Verify the Dockerfile exists
if [ ! -f "Dockerfile" ]; then
    echo "ERROR: Dockerfile not found in current directory"
    exit 1
fi

# Build the Docker image
echo ""
echo "Building Docker image..."
docker build -t "${FULL_TAG}" -t "${REGISTRY}/${IMAGE_NAME}:latest" .

if [ $? -eq 0 ]; then
    echo ""
    echo "✓ Docker image built successfully!"
    echo ""
    echo "Image Details:"
    docker images "${REGISTRY}/${IMAGE_NAME}" | head -2
    echo ""
    echo "To deploy, run:"
    echo "  docker-compose up -d"
    echo ""
    echo "To push to registry (if configured), run:"
    echo "  docker push ${FULL_TAG}"
    echo "  docker push ${REGISTRY}/${IMAGE_NAME}:latest"
else
    echo "✗ Docker build failed!"
    exit 1
fi

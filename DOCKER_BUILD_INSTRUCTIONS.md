# Docker Build and Push Instructions

## Overview
This guide explains how to build and push the Eva Webshop Docker image to GitHub Container Registry (GHCR).

## Prerequisites
- Docker installed and running
- GitHub account with write access to the repository
- GitHub Personal Access Token (classic) with `write:packages` scope

## Version Information
- Current Version: **1.1.0**
- Latest Commit: `df6f3f1` - "fix: Mount Mollie payment routes and apply 7 critical fixes"

## Build and Push Steps

### Step 1: Authenticate with GHCR

```bash
export GITHUB_TOKEN=your_personal_access_token
export GITHUB_USERNAME=your_github_username

echo $GITHUB_TOKEN | docker login ghcr.io -u $GITHUB_USERNAME --password-stdin
```

### Step 2: Build Docker Image

From the project root (`/home/peter/projects/eva_webshop`):

```bash
# Build with version tag
docker build -t ghcr.io/slacker80/eva_webshop:1.1.0 .

# Also tag as latest
docker tag ghcr.io/slacker80/eva_webshop:1.1.0 ghcr.io/slacker80/eva_webshop:latest
```

### Step 3: Push to GHCR

```bash
# Push versioned tag
docker push ghcr.io/slacker80/eva_webshop:1.1.0

# Push latest tag
docker push ghcr.io/slacker80/eva_webshop:latest
```

## Complete One-Liner

```bash
export GITHUB_TOKEN=your_token && \
export GITHUB_USERNAME=slacker80 && \
echo $GITHUB_TOKEN | docker login ghcr.io -u $GITHUB_USERNAME --password-stdin && \
cd /home/peter/projects/eva_webshop && \
docker build -t ghcr.io/slacker80/eva_webshop:1.1.0 . && \
docker tag ghcr.io/slacker80/eva_webshop:1.1.0 ghcr.io/slacker80/eva_webshop:latest && \
docker push ghcr.io/slacker80/eva_webshop:1.1.0 && \
docker push ghcr.io/slacker80/eva_webshop:latest
```

## Verification

After pushing, verify the image is in GHCR:

```bash
# List all tags for the repo
curl -s https://api.github.com/users/slacker80/packages/container/eva_webshop/versions | jq '.[] | {name: .name, created_at: .created_at}' | head -20
```

## Image Details

### Dockerfile
- Base: `node:22-alpine`
- Working Dir: `/app`
- Port: `3000`
- Health Check: Every 30 seconds via `/health` endpoint
- User: `node` (non-root)

### What's Included
- All code fixes from v1.1.0
- Express server with payment integration
- Mollie API client
- SQLite database
- Environment configuration via `.env`

## Note on API Key
The `.env` file uses a test Mollie API key for development. For production deployment:

1. Generate a real Mollie API key from https://www.mollie.com
2. Create a `.env` file with the real key
3. Mount it as a secret in your deployment environment
4. **DO NOT commit the real API key to the repository**

## Troubleshooting

### Login Failed
```bash
# Make sure token has 'write:packages' scope
# Check if token is not expired
# Try with explicit registry URL
echo $GITHUB_TOKEN | docker login -u $GITHUB_USERNAME --password-stdin ghcr.io
```

### Build Failed
```bash
# Check Node.js version compatibility
node --version  # Should be compatible with v22

# Rebuild without cache
docker build --no-cache -t ghcr.io/slacker80/eva_webshop:1.1.0 .

# Check Dockerfile exists
ls -la Dockerfile
```

### Push Failed
```bash
# Verify image exists locally
docker images | grep eva_webshop

# Check repository is public or you have write access
# Try again with explicit tag
docker push ghcr.io/slacker80/eva_webshop:1.1.0
```

## Next Steps

1. Deploy the image to your environment (Docker Compose, Kubernetes, etc.)
2. Ensure `.env` file with real Mollie API key is available at runtime
3. Test payment flow: Add to cart → Checkout → Mollie payment page
4. Monitor logs for any errors

## References
- [GitHub Container Registry Documentation](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [Mollie API Documentation](https://docs.mollie.com)
- [Express.js Documentation](https://expressjs.com)

# Eva Webshop Deployment Instructions v1.1.0

## Overview
This document provides step-by-step instructions for building and deploying the Eva Webshop Docker image on the Hetzner VM.

## Pre-requisites
- Hetzner VM with Docker and Docker Compose installed
- SSH access to the Hetzner VM
- Git repository cloned or code pushed to the server

## Build Process

### Step 1: Prepare the Repository
```bash
cd /home/peter/projects/eva_webshop
git pull origin main  # or your active branch
```

### Step 2: Build the Docker Image (v1.1.0)

**Option A: Using the build script (recommended)**
```bash
./build-and-tag.sh 1.1.0
```

**Option B: Manual build command**
```bash
docker build -t eva-webshop:1.1.0 -t eva-webshop:latest .
```

**Option C: For GitHub Container Registry (if using)**
```bash
docker build -t ghcr.io/your-username/eva-webshop:1.1.0 -t ghcr.io/your-username/eva-webshop:latest .
```

### Step 3: Verify the Build
```bash
docker images eva-webshop
docker run -it eva-webshop:1.1.0 node -v  # Verify Node.js version
```

## Deployment

### Option A: Using Docker Compose (Recommended)
```bash
cd /home/peter/projects/eva_webshop
docker-compose up -d
```

This will:
- Create/update the eva-webshop container
- Mount volumes for database persistence
- Set up environment variables
- Enable health checks
- Restart automatically

### Option B: Manual Docker Run
```bash
docker run -d \
  --name eva-webshop \
  --restart unless-stopped \
  -p 0.0.0.0:3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e SESSION_SECRET="your-super-secret-session-key-here" \
  -e ADMIN_PASSWORD="your-secure-admin-password" \
  -v crystal-jewelz-db:/app \
  -v /root/eva_uploads:/app/public/uploads \
  eva-webshop:1.1.0
```

## Post-Deployment

### Check Container Status
```bash
docker ps -a | grep eva-webshop
docker logs eva-webshop
docker stats eva-webshop
```

### Health Check
```bash
curl http://localhost:3000/health
# Should return 200 OK and health status JSON
```

### Verify Application
- Visit http://your-server-ip:3000
- Test admin panel
- Verify product listings
- Test image uploads
- Test payment integration (Mollie)

## Included Fixes (v1.1.0)

This version includes 7 critical fixes applied to the codebase:

1. **Mollie Payment Routes** - Fixed and mounted payment route handlers
2. **Payment Integration** - Corrected webhook callbacks and status handling
3. **Image Upload** - Fixed file input attributes and upload overlay issues
4. **Product Images** - Added image display on homepage and category pages
5. **Admin Forms** - Added image preview in product administration forms
6. **Submit Button** - Prevents double submission during image upload
7. **Debug Logging** - Enhanced logging for troubleshooting

See git log for detailed commit history:
```bash
git log --oneline | head -10
```

## Rolling Back (if needed)

### To Previous Version
```bash
docker-compose down
docker-compose up -d  # Will revert to previous image if not removed
# Or manually specify:
# docker build -t eva-webshop:1.0.0 .
```

### Keep Old Image for Safety
```bash
docker tag eva-webshop:1.0.0 eva-webshop:1.0.0-backup
```

## Pushing to Registry (Optional)

### GitHub Container Registry (GHCR)
```bash
# Login
echo $GH_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Tag
docker tag eva-webshop:1.1.0 ghcr.io/your-username/eva-webshop:1.1.0
docker tag eva-webshop:1.1.0 ghcr.io/your-username/eva-webshop:latest

# Push
docker push ghcr.io/your-username/eva-webshop:1.1.0
docker push ghcr.io/your-username/eva-webshop:latest
```

### Docker Hub (if applicable)
```bash
docker login
docker tag eva-webshop:1.1.0 your-username/eva-webshop:1.1.0
docker push your-username/eva-webshop:1.1.0
```

## Environment Variables

Update these in `docker-compose.yml` or via environment:

| Variable | Purpose | Default |
|----------|---------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Application port | `3000` |
| `SESSION_SECRET` | Session encryption key | **CHANGE THIS** |
| `ADMIN_PASSWORD` | Admin panel password | **CHANGE THIS** |

## Troubleshooting

### Container won't start
```bash
docker logs eva-webshop
docker inspect eva-webshop
```

### Port already in use
```bash
sudo lsof -i :3000
docker port eva-webshop
```

### Volume issues
```bash
docker volume ls
docker volume inspect crystal-jewelz-db
```

### Health check failing
```bash
docker exec eva-webshop wget --no-verbose --tries=1 --spider http://localhost:3000/health
```

## Monitoring

### Real-time logs
```bash
docker logs -f eva-webshop
```

### Container stats
```bash
docker stats eva-webshop --no-stream
```

### Disk usage
```bash
docker system df
docker volume df  # if available
```

## Version Information
- **Version**: 1.1.0
- **Node.js**: 22 (Alpine)
- **Build Date**: 2026-05-22
- **Deployment Ready**: ✓ Yes

---

For additional help, check:
- Docker documentation: https://docs.docker.com/
- Express.js documentation: https://expressjs.com/
- Mollie API docs: https://www.mollie.com/en/developers

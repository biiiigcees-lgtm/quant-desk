# Deployment Guide

## Prerequisites

- Node.js >= 18
- Docker & Docker Compose
- kubectl (for Kubernetes deployment)
- Redis (local or Upstash)

## Local Development

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy the example environment file:

```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env` with your API keys:
- REDIS_URL
- BINANCE_API_KEY
- BINANCE_API_SECRET
- COINGLASS_API_KEY
- AMBERDATA_API_KEY
- TWITTER_BEARER_TOKEN
- KALSHI_API_KEY

### 3. Run with Docker Compose

```bash
docker-compose up
```

Services:
- Frontend: http://localhost:3000
- API: http://localhost:3002
- Redis: localhost:6379

### 4. Run Locally (without Docker)

```bash
# Terminal 1: Start Redis (if not using Docker)
redis-server

# Terminal 2: Start API
cd apps/api
npm run build
npm start

# Terminal 3: Start UI
cd apps/ui
npm run dev
```

## Building for Production

```bash
npm run build
```

This builds:
- quant-core library
- Fastify API
- Next.js UI

## Kubernetes Deployment

### 1. Build Docker Image

```bash
docker build -f quant-core/infrastructure/docker/Dockerfile -t quant-core:1.0.0 .
```

### 2. Push to Registry

```bash
docker tag quant-core:1.0.0 your-registry/quant-core:1.0.0
docker push your-registry/quant-core:1.0.0
```

### 3. Update Image in Deployment

Edit `quant-core/infrastructure/kubernetes/deployment.yaml`:
```yaml
image: your-registry/quant-core:1.0.0
```

### 4. Deploy to Kubernetes

```bash
# Create namespace
kubectl apply -f quant-core/infrastructure/kubernetes/namespace.yaml

# Create secrets
kubectl apply -f quant-core/infrastructure/kubernetes/secrets.yaml

# Apply resource limits
kubectl apply -f quant-core/infrastructure/kubernetes/limit-range.yaml
kubectl apply -f quant-core/infrastructure/kubernetes/resource-quota.yaml

# Deploy application
kubectl apply -f quant-core/infrastructure/kubernetes/deployment.yaml
```

### 5. Verify Deployment

```bash
kubectl get pods -n quant-core
kubectl get services -n quant-core
kubectl logs -f deployment/quant-core -n quant-core
```

## Vercel Deployment (Frontend)

The UI is configured for Vercel deployment:

1. Connect your GitHub repository to Vercel
2. Set root directory to `apps/ui`
3. Configure environment variables in Vercel dashboard
4. Deploy

Vercel automatically runs `npm run build` and deploys the Next.js app.

## CI/CD

GitHub Actions workflow (`.github/workflows/ci.yml`) runs on:
- Push to main/develop branches
- Pull requests

Jobs:
- **Build**: Compiles TypeScript for all packages
- **Test**: Runs Jest test suite
- **Security**: Runs Snyk security scan

## Monitoring

### Kubernetes

- **Health Check**: `GET /health` (liveness probe)
- **Metrics**: `GET /metrics` (Prometheus scraping)
- **Logs**: Use `kubectl logs` or integrate with Loki/Grafana

### Observability Stack (Docker Compose)

The existing Docker Compose in `quant-core/infrastructure/docker/` includes:
- Loki (log aggregation)
- Vector (log shipping)
- Grafana (visualization)
- Prometheus (metrics)

## Troubleshooting

### Build Errors

```bash
# Clean build artifacts
npm run clean
rm -rf node_modules
npm install
```

### Kubernetes Pod Not Starting

```bash
# Check pod status
kubectl describe pod <pod-name> -n quant-core

# Check logs
kubectl logs <pod-name> -n quant-core
```

### Redis Connection Issues

Ensure Redis is running and accessible:
```bash
redis-cli ping
```

## Security Notes

- Never commit `.env` files
- Use Kubernetes secrets for production credentials
- Enable RBAC in production clusters
- Regularly update dependencies
- Run security scans before deployment

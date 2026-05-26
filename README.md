# Eva Webshop

Small Express/SQLite webshop for Crystal Jewelz.

## Runtime

- Node.js + Express
- SQLite database
- Server-rendered product/category pages
- Static admin and checkout pages from `public/`
- Stripe Checkout scaffold
- Docker image based deployment

## Important Files

- `server.js` - Express app, product pages, cart API, admin routes, Stripe routes
- `db-utils.js` - SQLite setup and data access
- `public/` - admin, checkout, payment result and legacy index pages
- `Dockerfile` - production image build
- `docker-compose.yml` - production container runtime
- `deploy-versioned.sh` - builds and deploys a tagged image
- `.env.example` - required runtime settings without secrets

## Local Run

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Production Deploy

Create `.env` from `.env.example` and fill production values on the server.
Do not commit `.env`.

```bash
./deploy-versioned.sh 20260526-example
```

The deploy keeps runtime data outside the image:

- database: `/root/eva_data/database.db`
- uploads: `/root/eva_uploads`

## Stripe

Set these in `.env` on the server:

```env
BASE_URL=https://crystaljewelz.nl
STRIPE_CURRENCY=eur
STRIPE_SECRET_KEY=sk_test_or_live...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Stripe webhook endpoint:

```text
https://crystaljewelz.nl/webhook/stripe
```

Required event:

```text
checkout.session.completed
```

## Docker Image

The image is intended to be tagged per deploy, for example:

```bash
docker build -t ghcr.io/slacker80/eva-webshop:20260526-1925 .
docker push ghcr.io/slacker80/eva-webshop:20260526-1925
```

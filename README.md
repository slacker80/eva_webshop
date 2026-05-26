# Eva Webshop

Small Express/SQLite webshop for Crystal Jewelz.

## Runtime

- Node.js + Express
- SQLite database
- Server-rendered product/category pages
- Static admin and checkout pages from `public/`
- Temporary manual order flow
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

## Temporary Manual Orders

Online payment is disabled while the webshop is in test phase. Customers submit an order request from `public/checkout.html`.

The owner receives an e-mail at `ORDER_NOTIFY_EMAIL` and can then send a manual Rabobank payment request. Orders are also appended to `manual-orders.jsonl` in `DATA_DIR`.

Required e-mail settings in `.env`:

```env
ORDER_NOTIFY_EMAIL=smallegangeeva@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-gmail-app-password
SMTP_FROM=Crystal Jewelz <your-email@gmail.com>
```

## Docker Image

The image is intended to be tagged per deploy, for example:

```bash
docker build -t ghcr.io/slacker80/eva-webshop:20260526-1925 .
docker push ghcr.io/slacker80/eva-webshop:20260526-1925
```

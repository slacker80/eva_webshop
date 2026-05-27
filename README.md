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

- `server.js` - Express app, product pages, cart API, admin routes, manual orders and uploads
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

`ORDER_NOTIFY_EMAIL` receives the owner notification and can then send a manual Rabobank payment request. Use a comma-separated `ORDER_NOTIFY_BCC` only when a diagnostic/admin copy is needed. Orders are also appended to `manual-orders.jsonl` in `DATA_DIR`.

Required e-mail settings in `.env`:

```env
ORDER_NOTIFY_EMAIL=smallegangeeva@gmail.com
# Optional: comma-separated diagnostics copy for owner notifications
# ORDER_NOTIFY_BCC=petersmallegange@gmail.com
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


## Admin Access

The admin portal is intended to be reachable only from the configured home IP address. The live nginx configuration also restricts `/admin`, `/admin/`, and `/api/admin/` before requests reach the Node app.

Admin product and logo uploads are stored in `/root/eva_uploads` through the Docker volume `/root/eva_uploads:/app/public/uploads`. The app accepts uploads up to 20 MB per image. The nginx server block must also include `client_max_body_size 20M;` so `/api/admin/upload` can receive larger phone photos.


## TLS Renewal

Port 80 is intentionally closed on the production VM. Before the next Let's Encrypt renewal, move certificate renewal to a DNS-01 challenge. HTTP-01 renewal will not work while only ports 22 and 443 are open.

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const csrf = require('csurf');
const multer = require('multer');
const { initDatabase, getProducts, getProduct, addProduct, updateProduct, deleteProduct, getCategories, addCategory, updateCategory, getHomepage, updateHomepage, getSiteSettings, updateSiteSettings, checkAdminLogin, updateAdminPassword, getCart, addToCart, updateCartQuantity, removeFromCart, clearCart } = require('./db-utils');
const { sendManualOrderEmail } = require('./backend/email');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for correct client IPs behind reverse proxy
app.set('trust proxy', 1);

// Rate limiting (BEFORE routes)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000
});
app.use(limiter);



// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https:", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'self'"],
    },
  },
}));
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'https://crystaljewelz.nl', 'http://77.42.93.211:3000'],
  credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-for-dev',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days instead of 24h
}));

// CSRF protection
const csrfProtection = csrf({ cookie: true });
// CSRF applied per-route on admin APIs only

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function hexColor(value, fallback) {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function rgbaFromHex(hex, alpha) {
  const color = hex.replace('#', '');
  const r = parseInt(color.slice(0, 2), 16);
  const g = parseInt(color.slice(2, 4), 16);
  const b = parseInt(color.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function fontFamily(value) {
  const font = String(value || '').trim();
  if (!font || font.length > 140 || /[{};<>]/.test(font)) {
    return '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  }
  return font;
}

function formatMoney(value) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
}

function renderHeadingText(value) {
  const text = String(value || '').trim();
  const prefixed = text.match(/^(\([^)]{1,48}\))\s+(.+)$/u);
  if (prefixed && prefixed[2]) {
    return `<span class="heading-text-wrap heading-prefixed"><span class="heading-prefix">${escapeHtml(prefixed[1])}</span><span class="heading-main">${escapeHtml(prefixed[2])}</span></span>`;
  }
  const decorated = text.match(/^([^\p{L}\p{N}\s]+)\s*(.*?)\s*([^\p{L}\p{N}\s]+)$/u);
  if (decorated && decorated[2]) {
    return `<span class="heading-text-wrap heading-decorated"><span class="heading-emoji">${escapeHtml(decorated[1])}</span><span class="heading-main">${escapeHtml(decorated[2])}</span><span class="heading-emoji">${escapeHtml(decorated[3])}</span></span>`;
  }
  return `<span class="heading-text-wrap"><span class="heading-main">${escapeHtml(text)}</span></span>`;
}

function categoryLabel(name) {
  const normalized = String(name || '').trim();
  if (!normalized) return 'Other';
  if (/^[a-z0-9 -]+$/.test(normalized) && normalized === normalized.toLowerCase()) {
    return normalized.replace(/\b\w/g, ch => ch.toUpperCase());
  }
  return normalized;
}

function categorySlug(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'category';
}

const RESERVED_CATEGORY_SLUGS = new Set([
  'admin',
  'api',
  'health',
  'pay',
  'product',
  'products',
  'uploads',
  'checkout-html',
  'payment-result-html',
  'admin-login-html',
  'admin-dashboard-html',
  'favicon-ico'
]);

function categoryPath(name) {
  return `/${categorySlug(name)}`;
}

function productMatchesCategory(product, categoryName) {
  return categorySlug(product.category) === categorySlug(categoryName);
}

function productImages(product) {
  const images = [];
  const primary = String(product.image_url || '').trim();
  if (primary) images.push(primary);
  if (Array.isArray(product.images)) {
    for (const image of product.images) {
      const src = String(image.image_url || image || '').trim();
      if (src && !images.includes(src)) images.push(src);
    }
  }
  return images;
}

function renderProductCard(product) {
  const stock = Number(product.stock || 0);
  const images = productImages(product);
  const imageUrl = images[0] || '';
  const detailUrl = `/product/${product.id}`;
  const addButton = stock > 0
    ? `<button type="button" class="add-btn" data-add-to-cart="${product.id}">Add to Cart</button>`
    : '<button type="button" class="add-btn" disabled>Out of stock</button>';

  return `
                <div class="product-card">
                    ${imageUrl ? `<a class="product-image" href="${detailUrl}"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(product.name)}" loading="lazy"></a>` : ''}
                    <div class="product-name"><a href="${detailUrl}">${escapeHtml(product.name)}</a></div>
                    <div class="product-category">${escapeHtml(categoryLabel(product.category))}</div>
                    <div class="product-description">${escapeHtml(product.description)}</div>
                    <div class="product-footer">
                        <div class="product-price">${formatMoney(product.price)}</div>
                        ${addButton}
                    </div>
                </div>`;
}

// Homepage — shows featured products only
app.get('/', async (req, res) => {
  try {
    const [products, hp] = await Promise.all([getProducts(), getHomepage()]);
    const featured = products.filter(p => p.featured === 1);
    
    const productCards = featured.map(renderProductCard).join('');

    const content = `
            <div class="hero">
                <h1>${escapeHtml(hp.hero_title)}</h1>
                <p>${escapeHtml(hp.hero_subtitle)}</p>
            </div>

            <div class="about-section">
                <div class="about-card">
                    <div class="icon">${escapeHtml(hp.about1_icon)}</div>
                    <h3>${escapeHtml(hp.about1_title)}</h3>
                    <p>${escapeHtml(hp.about1_text)}</p>
                </div>
                <div class="about-card">
                    <div class="icon">${escapeHtml(hp.about2_icon)}</div>
                    <h3>${escapeHtml(hp.about2_title)}</h3>
                    <p>${escapeHtml(hp.about2_text)}</p>
                </div>
                <div class="about-card">
                    <div class="icon">${escapeHtml(hp.about3_icon)}</div>
                    <h3>${escapeHtml(hp.about3_title)}</h3>
                    <p>${escapeHtml(hp.about3_text)}</p>
                </div>
            </div>

            <div class="category-header">
                <h1>${renderHeadingText(hp.featured_title)}</h1>
                <p class="category-count">${featured.length} ${escapeHtml(hp.featured_subtitle)}</p>
            </div>

            <div class="products-grid">
                ${productCards || '<p>No featured products yet. Check <a href="/products">all products</a>.</p>'}
            </div>`;

    res.send(await renderPage('Handcrafted Crystal Jewelry', content, '/'));
  } catch (err) {
    console.error('Homepage error:', err);
    res.status(500).send(await renderPage('Error', '<p>Something went wrong.</p>'));
  }
});

app.use(express.static(path.join(__dirname, 'public')));

// File uploads (multer)
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
    cb(null, name);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|svg/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    cb(null, ext && mime);
  }
});

// IP whitelist for admin access
const ADMIN_IP_WHITELIST = ["77.162.108.225", "127.0.0.1", "localhost"];
const ENABLE_IP_WHITELIST = true;

function checkAdminIP(req, res, next) {
  if (!ENABLE_IP_WHITELIST) return next();
  const clientIP = req.ip || req.connection.remoteAddress;
  const isWhitelisted = ADMIN_IP_WHITELIST.some(ip => clientIP.includes(ip));
  if (!isWhitelisted) {
    console.warn(`Admin access attempt from unauthorized IP: ${clientIP}`);
    return res.status(403).json({ error: "Access denied: Your IP is not whitelisted" });
  }
  next();
}

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.session.admin) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Initialize database
console.log('Initializing database...');
initDatabase()
  .then(() => console.log('Database initialized'))
  .catch(err => console.error('DB init error:', err));

// ==== PUBLIC ROUTES ====

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/products', async (req, res) => {
  try {
    const products = await getProducts();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.get('/api/products/featured', async (req, res) => {
  try {
    const products = await getProducts();
    res.json(products.filter(p => p.featured === 1));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.get('/api/products/category/:category', async (req, res) => {
  try {
    const products = await getProducts();
    const categoryProducts = products.filter(p => productMatchesCategory(p, req.params.category));
    res.json(categoryProducts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await getProduct(parseInt(req.params.id, 10));
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

app.get('/api/categories', async (req, res) => {
  try {
    const categories = await getCategories();
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Shared HTML layout helper
async function renderPage(title, content, activeCat = '') {
  const categories = await getCategories();
  const settings = await getSiteSettings();
  const brandName = String(settings.brand_name || 'Crystal Jewelz').trim() || 'Crystal Jewelz';
  const logoUrl = String(settings.logo_url || '').trim();
  const primaryColor = hexColor(settings.primary_color, '#4a148c');
  const accentColor = hexColor(settings.accent_color, '#d4af37');
  const backgroundColor = hexColor(settings.background_color, '#f8f9fa');
  const primarySoft = rgbaFromHex(primaryColor, 0.12);
  const logoMarkup = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brandName)}"><span>${escapeHtml(brandName)}</span>`
    : `<span class="logo-mark">CJ</span><span>${escapeHtml(brandName)}</span>`;
  const navItems = [
    { label: 'All Products', href: '/products' },
    ...categories.map(category => ({
      label: categoryLabel(category.name),
      href: categoryPath(category.name)
    }))
  ];
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(brandName)} - ${escapeHtml(title)}</title>
    <style>
        :root { --primary: ${primaryColor}; --accent: ${accentColor}; --bg: ${backgroundColor}; --primary-soft: ${primarySoft}; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: ${fontFamily(settings.font_family)}; line-height: 1.6; color: #333; background: var(--bg); }
        .container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
        
        header { background: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%); color: white; padding: 1.5rem 0; box-shadow: 0 2px 10px rgba(0,0,0,0.15); }
        .header-content { display: flex; justify-content: space-between; align-items: center; }
        .logo { display: flex; align-items: center; gap: 0.75rem; font-size: 1.8rem; font-weight: bold; color: white; text-decoration: none; min-width: 0; }
        .logo img { max-height: 56px; max-width: 190px; object-fit: contain; display: block; background: rgba(255,255,255,0.16); border-radius: 8px; }
        .logo-mark { width: 42px; height: 42px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; background: rgba(255,255,255,0.2); }
        .logo:hover { color: white; opacity: 0.92; }
        
        .hero { background: linear-gradient(135deg, #f3e5f5 0%, #e1bee7 50%, #ffecb3 100%); padding: 4rem 0; text-align: center; margin-bottom: 2rem; }
        .hero h1 { font-size: 2.5rem; color: var(--primary); margin-bottom: 0.5rem; }
        .hero p { font-size: 1.2rem; color: #666; max-width: 600px; margin: 0 auto; }
        
        main { padding: 2rem 0; }
        
        .category-nav { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 2rem; }
        .filter-btn { display: inline-block; padding: 0.5rem 1.5rem; border: 2px solid var(--primary); background: white; color: var(--primary); border-radius: 25px; cursor: pointer; transition: all 0.3s; font-weight: 500; text-decoration: none; font-size: 0.95rem; }
        .filter-btn:hover, .filter-btn.active { background: var(--primary); color: white; }
        
        .category-header { margin-bottom: 2rem; }
        .category-header h1 { color: var(--primary); font-size: 2rem; line-height: 1.18; letter-spacing: 0; overflow-wrap: normal; word-break: normal; text-wrap: balance; }
        .heading-text-wrap { display: inline-flex; align-items: baseline; gap: 0.28em; max-width: 100%; flex-wrap: wrap; }
        .heading-main { min-width: 0; }
        .heading-prefix { flex: 0 0 auto; white-space: nowrap; }
        .heading-emoji { display: inline-block; flex: 0 0 auto; font-size: 0.85em; line-height: 1; transform: translateY(-0.04em); }
        .category-count { color: #666; margin-top: 0.25rem; }
        
        .products-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 2rem; }
        .product-card { background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 4px 15px rgba(0,0,0,0.08); transition: transform 0.3s, box-shadow 0.3s; }
        .product-card:hover { transform: translateY(-4px); box-shadow: 0 8px 25px rgba(0,0,0,0.12); }
        .product-image { display: block; width: 100%; height: 200px; overflow: hidden; border-radius: 8px; margin-bottom: 1rem; background: #f0f0f0; border: 0; padding: 0; }
        .product-image img { width: 100%; height: 100%; object-fit: cover; }
        .product-name { font-size: 1.1rem; font-weight: 600; color: #2d3748; margin-bottom: 0.5rem; }
        .product-name a { color: inherit; text-decoration: none; }
        .product-name a:hover { color: var(--primary); }
        .product-category { display: inline-block; background: var(--primary-soft); color: var(--primary); padding: 0.2rem 0.75rem; border-radius: 15px; font-size: 0.8rem; margin-bottom: 0.75rem; }
        .product-description { color: #718096; margin-bottom: 1rem; font-size: 0.9rem; line-height: 1.5; }
        .product-footer { display: flex; justify-content: space-between; align-items: center; }
        .product-price { font-size: 1.4rem; font-weight: bold; color: var(--accent); }
        .add-btn { background: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%); color: white; border: none; padding: 0.6rem 1.25rem; border-radius: 25px; cursor: pointer; font-weight: 600; transition: opacity 0.3s; }
        .add-btn:hover { opacity: 0.9; }
        .add-btn:disabled { background: #cbd5e0; cursor: not-allowed; opacity: 1; }
        .add-btn.added { background: #2f855a; }
        .cart-button { margin-left: 0.75rem; background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.55); padding: 0.5rem 1rem; border-radius: 25px; cursor: pointer; font-weight: 600; }
        .cart-count { display: inline-flex; align-items: center; justify-content: center; min-width: 1.5rem; height: 1.5rem; margin-left: 0.4rem; border-radius: 999px; background: var(--accent); color: #2d1742; font-size: 0.85rem; }
        .cart-modal { display: none; position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.45); padding: 2rem; }
        .cart-modal.open { display: block; }
        .cart-panel { max-width: 560px; margin: 5vh auto; background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 18px 50px rgba(0,0,0,0.25); }
        .cart-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
        .cart-close { border: 0; background: transparent; font-size: 1.75rem; cursor: pointer; color: var(--primary); }
        .cart-item { display: flex; justify-content: space-between; gap: 1rem; padding: 0.9rem 0; border-bottom: 1px solid #eee; }
        .cart-actions { display: flex; align-items: center; gap: 0.5rem; }
        .cart-actions button { border: 0; background: var(--primary); color: white; border-radius: 50%; width: 1.75rem; height: 1.75rem; cursor: pointer; }
        .cart-actions button:disabled { background: #cbd5e0; cursor: not-allowed; }
        .cart-total { margin-top: 1rem; font-weight: 700; color: var(--primary); text-align: right; }
        .checkout-link { display: inline-block; width: 100%; box-sizing: border-box; margin-top: 1rem; padding: 0.85rem 1rem; border-radius: 25px; background: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%); color: white; text-align: center; text-decoration: none; font-weight: 700; }
        .empty-cart { color: #718096; padding: 1rem 0; }
        .image-zoom-modal { display: none; position: fixed; inset: 0; z-index: 1100; background: rgba(0,0,0,0.78); padding: 1rem; align-items: center; justify-content: center; }
        .image-zoom-modal.open { display: flex; }
        .image-zoom-panel { position: relative; max-width: min(92vw, 1100px); max-height: 92vh; }
        .image-zoom-panel img { display: block; max-width: 100%; max-height: 92vh; object-fit: contain; border-radius: 8px; background: white; box-shadow: 0 20px 60px rgba(0,0,0,0.35); }
        .image-zoom-close { position: absolute; top: -0.75rem; right: -0.75rem; width: 2.5rem; height: 2.5rem; border: 0; border-radius: 50%; background: white; color: var(--primary); font-size: 1.75rem; line-height: 1; cursor: pointer; box-shadow: 0 6px 18px rgba(0,0,0,0.25); }
        .product-detail { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(280px, 0.9fr); gap: 2rem; background: white; padding: 1.5rem; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.08); }
        .detail-main-image { width: 100%; aspect-ratio: 4 / 3; border: 0; padding: 0; border-radius: 10px; overflow: hidden; background: #f3f3f3; cursor: zoom-in; }
        .detail-main-image img { width: 100%; height: 100%; object-fit: contain; display: block; background: #fafafa; }
        .detail-thumbs { display: flex; gap: 0.65rem; flex-wrap: wrap; margin-top: 0.8rem; }
        .detail-thumb { width: 72px; height: 72px; border: 2px solid transparent; border-radius: 8px; padding: 0; overflow: hidden; background: #f3f3f3; cursor: pointer; }
        .detail-thumb.active { border-color: var(--primary); }
        .detail-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .detail-info h1 { color: var(--primary); font-size: 2rem; line-height: 1.18; letter-spacing: 0; margin: 0.35rem 0 0.75rem; overflow-wrap: break-word; word-break: normal; text-wrap: balance; }
        .detail-short { color: #4a5568; white-space: pre-wrap; margin: 1rem 0; }
        .detail-long { color: #333; white-space: pre-wrap; margin: 1rem 0 1.25rem; line-height: 1.65; }
        .stock-note { color: #718096; font-size: 0.95rem; margin: 0.5rem 0 1rem; }
        @media (max-width: 760px) {
            .container { padding: 0 14px; }
            header { padding: 1rem 0; }
            .header-content { flex-direction: column; align-items: stretch; gap: 0.9rem; }
            .logo { justify-content: center; text-align: center; font-size: 1.35rem; line-height: 1.2; flex-wrap: wrap; }
            .logo img { max-height: 48px; max-width: min(180px, 80vw); }
            header nav { display: flex; justify-content: center; gap: 0.5rem; flex-wrap: wrap; }
            .hero { padding: 2.4rem 0; }
            .hero h1 { font-size: 2rem; line-height: 1.15; }
            .hero p { font-size: 1rem; }
            main { padding: 1.25rem 0; }
            .category-nav { flex-wrap: nowrap; overflow-x: auto; gap: 0.45rem; padding-bottom: 0.25rem; margin-bottom: 1.25rem; -webkit-overflow-scrolling: touch; }
            .filter-btn { flex: 0 0 auto; padding: 0.45rem 0.9rem; white-space: nowrap; }
            .category-header { margin-bottom: 1.25rem; }
            .category-header h1 { font-size: 1.48rem; line-height: 1.2; }
            .category-header .heading-text-wrap { gap: 0.2em; }
            .products-grid { grid-template-columns: 1fr; gap: 1rem; }
            .product-card { padding: 1rem; }
            .product-footer { align-items: stretch; gap: 0.75rem; flex-direction: column; }
            .product-price { font-size: 1.25rem; }
            .add-btn { width: 100%; }
            .cart-modal { padding: 0.75rem; }
            .cart-panel { margin: 3vh auto; padding: 1rem; }
            .cart-item { flex-direction: column; align-items: stretch; }
            .cart-actions { justify-content: flex-end; }
            .product-detail { grid-template-columns: 1fr; padding: 1rem; gap: 1rem; }
            .detail-info h1 { font-size: 1.55rem; line-height: 1.22; }
            .about-section { grid-template-columns: 1fr; gap: 1rem; margin: 2rem 0; }
        }

        @media (max-width: 380px) {
            .category-header h1 { font-size: 1.3rem; }
            .category-header .heading-decorated { flex-wrap: nowrap; }
            .detail-info h1 { font-size: 1.45rem; }
        }

        @media (max-width: 340px) {
            .category-header h1 { font-size: 1.12rem; }
            .category-header .heading-text-wrap { gap: 0.12em; }
            .category-header .heading-emoji { font-size: 0.75em; }
        }
        
        footer { background: var(--primary); color: white; padding: 2rem 0; margin-top: 4rem; text-align: center; }
        footer p { color: rgba(255,255,255,0.7); }
        
        .about-section { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; margin: 4rem 0; }
        .about-card { text-align: center; padding: 2rem; background: white; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.08); }
        .about-card .icon { font-size: 2.5rem; margin-bottom: 1rem; }
        .about-card h3 { color: var(--primary); margin-bottom: 0.5rem; }
        .about-card p { color: #666; font-size: 0.95rem; }
    </style>
</head>
<body>
    <header>
        <div class="container">
            <div class="header-content">
                <a href="/" class="logo">${logoMarkup}</a>
                <nav>
                    <a href="/" class="filter-btn" style="color:white;border-color:rgba(255,255,255,0.5);background:transparent;">Home</a>
                    <button type="button" id="cartButton" class="cart-button">Cart <span id="cartCount" class="cart-count">0</span></button>
                </nav>
            </div>
        </div>
    </header>

    <main>
        <div class="container">
            <nav class="category-nav">
                ${navItems.map(item => `<a href="${escapeHtml(item.href)}" class="filter-btn${activeCat === item.href ? ' active' : ''}">${escapeHtml(item.label)}</a>`).join('\n                ')}
            </nav>
            ${content}
        </div>
    </main>

    <div id="cartModal" class="cart-modal" aria-hidden="true">
        <div class="cart-panel" role="dialog" aria-modal="true" aria-labelledby="cartTitle">
            <div class="cart-header">
                <h2 id="cartTitle">Your cart</h2>
                <button type="button" id="cartClose" class="cart-close" aria-label="Close cart">&times;</button>
            </div>
            <div id="cartItems" class="empty-cart">Your cart is empty</div>
            <div id="cartTotal" class="cart-total"></div>
        </div>
    </div>

    <div id="imageZoomModal" class="image-zoom-modal" aria-hidden="true">
        <div class="image-zoom-panel" role="dialog" aria-modal="true" aria-label="Product image">
            <button type="button" id="imageZoomClose" class="image-zoom-close" aria-label="Close image">&times;</button>
            <img id="imageZoomImg" src="" alt="">
        </div>
    </div>

    <footer>
        <div class="container">
            <p>&copy; 2026 ${escapeHtml(brandName)}. Handcrafted with love</p>
        </div>
    </footer>
    <script>
        let cart = [];
        const cartModal = () => document.getElementById('cartModal');
        const cartCount = () => document.getElementById('cartCount');
        const cartItems = () => document.getElementById('cartItems');
        const cartTotal = () => document.getElementById('cartTotal');
        const imageZoomModal = () => document.getElementById('imageZoomModal');
        const imageZoomImg = () => document.getElementById('imageZoomImg');

        function escapeHtml(value) {
            return String(value || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
        }

        function formatMoney(value) {
            return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
        }

        function itemProductId(item) {
            return item.product_id ?? item.productId ?? item.id;
        }

        function renderCart() {
            const totalItems = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
            cartCount().textContent = totalItems;
            if (!cart.length) {
                cartItems().className = 'empty-cart';
                cartItems().innerHTML = 'Your cart is empty';
                cartTotal().textContent = '';
                return;
            }
            cartItems().className = '';
            cartItems().innerHTML = cart.map(item => {
                const productId = itemProductId(item);
                const price = Number(item.price || 0);
                const quantity = Number(item.quantity || 0);
                const stock = Number(item.stock || 0);
                const plusDisabled = stock > 0 && quantity >= stock ? ' disabled title="Niet meer op voorraad"' : '';
                return '<div class="cart-item">' +
                    '<div><strong>' + escapeHtml(item.name) + '</strong><br><span>' + formatMoney(price) + ' per stuk</span></div>' +
                    '<div class="cart-actions">' +
                        '<button type="button" data-cart-update="' + productId + '" data-change="-1">-</button>' +
                        '<span>' + quantity + '</span>' +
                        '<button type="button" data-cart-update="' + productId + '" data-change="1"' + plusDisabled + '>+</button>' +
                        '<button type="button" data-cart-remove="' + productId + '" aria-label="Remove item">&times;</button>' +
                    '</div>' +
                '</div>';
            }).join('');
            const total = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
            cartTotal().innerHTML = 'Totaal: ' + formatMoney(total) + '<br><a class="checkout-link" href="/checkout.html">Bestelling plaatsen</a>';
        }

        async function loadCart() {
            const response = await fetch('/api/cart', { credentials: 'same-origin' });
            if (!response.ok) throw new Error('Cart load failed');
            cart = await response.json();
            renderCart();
        }

        async function addToCart(productId, button) {
            const response = await fetch('/api/cart', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productId, quantity: 1 })
            });
            if (!response.ok) throw new Error(await response.text());
            cart = await response.json();
            renderCart();
            if (button) {
                const old = button.textContent;
                button.textContent = 'Added';
                button.classList.add('added');
                setTimeout(() => { button.textContent = old; button.classList.remove('added'); }, 900);
            }
        }

        async function updateCart(productId, change) {
            const current = cart.find(item => String(itemProductId(item)) === String(productId));
            const quantity = Math.max(0, Number(current?.quantity || 0) + Number(change));
            const response = await fetch('/api/cart/' + productId, {
                method: 'PUT',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quantity })
            });
            if (!response.ok) throw new Error(await response.text());
            cart = await response.json();
            renderCart();
        }

        async function removeCart(productId) {
            const response = await fetch('/api/cart/' + productId, { method: 'DELETE', credentials: 'same-origin' });
            if (!response.ok) throw new Error(await response.text());
            cart = await response.json();
            renderCart();
        }

        function openCart() { cartModal().classList.add('open'); cartModal().setAttribute('aria-hidden', 'false'); }
        function closeCart() { cartModal().classList.remove('open'); cartModal().setAttribute('aria-hidden', 'true'); }
        function openImageZoom(src, title) {
            imageZoomImg().src = src;
            imageZoomImg().alt = title || 'Product image';
            imageZoomModal().classList.add('open');
            imageZoomModal().setAttribute('aria-hidden', 'false');
        }
        function closeImageZoom() {
            imageZoomModal().classList.remove('open');
            imageZoomModal().setAttribute('aria-hidden', 'true');
            imageZoomImg().src = '';
        }

        document.addEventListener('DOMContentLoaded', () => {
            loadCart().catch(console.error);
            document.getElementById('cartButton').addEventListener('click', openCart);
            document.getElementById('cartClose').addEventListener('click', closeCart);
            document.getElementById('imageZoomClose').addEventListener('click', closeImageZoom);
            cartModal().addEventListener('click', event => { if (event.target === cartModal()) closeCart(); });
            imageZoomModal().addEventListener('click', event => { if (event.target === imageZoomModal()) closeImageZoom(); });
            document.addEventListener('keydown', event => {
                if (event.key === 'Escape') {
                    closeCart();
                    closeImageZoom();
                }
            });
            document.addEventListener('click', event => {
                const thumbButton = event.target.closest('[data-gallery-src]');
                if (thumbButton) {
                    const mainImage = document.getElementById('galleryMain');
                    const mainButton = mainImage?.closest('[data-image-zoom]');
                    if (mainImage) mainImage.src = thumbButton.dataset.gallerySrc;
                    if (mainButton) mainButton.dataset.imageZoom = thumbButton.dataset.gallerySrc;
                    document.querySelectorAll('[data-gallery-src]').forEach(button => button.classList.remove('active'));
                    thumbButton.classList.add('active');
                }
                const imageButton = event.target.closest('[data-image-zoom]');
                if (imageButton) openImageZoom(imageButton.dataset.imageZoom, imageButton.dataset.imageTitle);
                const addButton = event.target.closest('[data-add-to-cart]');
                if (addButton) addToCart(addButton.dataset.addToCart, addButton).catch(console.error);
                const updateButton = event.target.closest('[data-cart-update]');
                if (updateButton) updateCart(updateButton.dataset.cartUpdate, updateButton.dataset.change).catch(console.error);
                const removeButton = event.target.closest('[data-cart-remove]');
                if (removeButton) removeCart(removeButton.dataset.cartRemove).catch(console.error);
            });
        });
    </script>
</body>
</html>`;
}

app.get('/products', async (req, res) => {
  try {
    const products = await getProducts();
    const productCards = products.map(renderProductCard).join('');
    const content = `
            <div class="category-header">
                <h1>All Products</h1>
                <p class="category-count">${products.length} products</p>
            </div>
            <div class="products-grid">
                ${productCards || '<p>No products yet.</p>'}
            </div>`;

    res.send(await renderPage('All Products', content, '/products'));
  } catch (err) {
    console.error('All products page error:', err);
    res.status(500).send(await renderPage('Error', '<p>Failed to load products.</p>'));
  }
});

app.get('/product/:id', async (req, res) => {
  try {
    const product = await getProduct(parseInt(req.params.id, 10));
    if (!product) {
      return res.status(404).send(await renderPage('Product not found', '<p>Product not found.</p>'));
    }

    const images = productImages(product);
    const mainImage = images[0] || '';
    const thumbs = images.map((src, index) => `
                    <button type="button" class="detail-thumb${index === 0 ? ' active' : ''}" data-gallery-src="${escapeHtml(src)}" aria-label="Show photo ${index + 1}">
                        <img src="${escapeHtml(src)}" alt="${escapeHtml(product.name)} photo ${index + 1}" loading="lazy">
                    </button>`).join('');
    const stock = Number(product.stock || 0);
    const addButton = stock > 0
      ? `<button type="button" class="add-btn" data-add-to-cart="${product.id}">Add to Cart</button>`
      : '<button type="button" class="add-btn" disabled>Out of stock</button>';
    const longDescription = String(product.long_description || '').trim();

    const content = `
            <article class="product-detail">
                <div>
                    ${mainImage ? `
                    <button type="button" class="detail-main-image" data-image-zoom="${escapeHtml(mainImage)}" data-image-title="${escapeHtml(product.name)}" aria-label="Zoom ${escapeHtml(product.name)}">
                        <img id="galleryMain" src="${escapeHtml(mainImage)}" alt="${escapeHtml(product.name)}">
                    </button>` : '<div class="detail-main-image"></div>'}
                    ${thumbs ? `<div class="detail-thumbs">${thumbs}</div>` : ''}
                </div>
                <div class="detail-info">
                    <div class="product-category">${escapeHtml(categoryLabel(product.category))}</div>
                    <h1>${renderHeadingText(product.name)}</h1>
                    <div class="product-price">${formatMoney(product.price)}</div>
                    <div class="stock-note">${stock > 0 ? `${stock} op voorraad` : 'Niet op voorraad'}</div>
                    <div class="detail-short">${escapeHtml(product.description)}</div>
                    ${longDescription ? `<div class="detail-long">${escapeHtml(longDescription)}</div>` : ''}
                    ${addButton}
                </div>
            </article>`;

    res.send(await renderPage(product.name, content, ''));
  } catch (err) {
    console.error('Product detail error:', err);
    res.status(500).send(await renderPage('Error', '<p>Failed to load product.</p>'));
  }
});

// Category pages (server-side rendered)
app.get('/:categorySlug', async (req, res, next) => {
  const requestedSlug = categorySlug(req.params.categorySlug);
  if (RESERVED_CATEGORY_SLUGS.has(requestedSlug)) return next();

  try {
    const categories = await getCategories();
    const category = categories.find(item => categorySlug(item.name) === requestedSlug);
    if (!category) return next();

    const products = await getProducts();
    const categoryProducts = products.filter(product => productMatchesCategory(product, category.name));
    const catTitle = categoryLabel(category.name);
    const productCards = categoryProducts.map(renderProductCard).join('');
    const content = `
            <div class="category-header">
                <h1>${escapeHtml(catTitle)}</h1>
                <p class="category-count">${categoryProducts.length} products</p>
            </div>
            <div class="products-grid">
                ${productCards || '<p>No products in this category yet.</p>'}
            </div>`;

    res.send(await renderPage(catTitle, content, categoryPath(category.name)));
  } catch (err) {
    console.error('Category page error:', err);
    res.status(500).send(await renderPage('Error', '<p>Failed to load products.</p>'));
  }
});

app.get('/api/homepage', async (req, res) => {
  try {
    const homepage = await getHomepage();
    res.json(homepage);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch homepage' });
  }
});

app.get('/api/site-settings', async (req, res) => {
  try {
    const settings = await getSiteSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch site settings' });
  }
});



function cartSessionId(req) {
  if (!req.session.cartStartedAt) {
    req.session.cartStartedAt = Date.now();
  }
  req.session.cartLastSeenAt = Date.now();
  return req.sessionID;
}

function orderTotal(cart) {
  return cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
}

function orderId() {
  return `CJ-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;
}

async function saveManualOrder(order) {
  const dataDir = process.env.DATA_DIR || __dirname;
  await fs.promises.mkdir(dataDir, { recursive: true });
  await fs.promises.appendFile(path.join(dataDir, 'manual-orders.jsonl'), JSON.stringify(order) + '\n');
}

app.post('/api/manual-order', async (req, res) => {
  try {
    const { name, email, phone, street, houseNumber, postalCode, city, address, notes } = req.body;
    const normalizedPostcode = String(postalCode || '').replace(/\s+/g, '').toUpperCase();
    const postcodeOk = /^[1-9][0-9]{3}[A-Z]{2}$/.test(normalizedPostcode);
    if (!name || !email || !phone || !street || !houseNumber || !postalCode || !city || !address) {
      return res.status(400).json({ error: 'Naam, e-mail, telefoon en volledig adres zijn verplicht' });
    }
    if (!postcodeOk) {
      return res.status(400).json({ error: 'Postcode moet het formaat 1234 AB hebben' });
    }

    const sessionId = cartSessionId(req);
    const cart = await getCart(sessionId);
    if (!cart.length) {
      return res.status(400).json({ error: 'Je winkelmand is leeg' });
    }

    const order = {
      id: orderId(),
      createdAt: new Date().toISOString(),
      sessionId,
      name,
      email,
      phone: phone || '',
      street,
      houseNumber,
      postalCode: normalizedPostcode.replace(/^([1-9][0-9]{3})([A-Z]{2})$/, '$1 $2'),
      city,
      address,
      notes: notes || '',
      items: cart,
      total: orderTotal(cart),
      payment: 'manual-rabobank-payment-request',
      status: 'manual-review'
    };

    await saveManualOrder(order);
    await sendManualOrderEmail(order);
    await clearCart(sessionId);

    res.json({ ok: true, orderId: order.id });
  } catch (err) {
    console.error('Manual order failed:', err);
    if (err.code === 'SMTP_NOT_CONFIGURED') {
      return res.status(503).json({ error: 'Bestelling is opgeslagen, maar e-mail is nog niet ingesteld. Neem contact op met Crystal Jewelz.' });
    }
    res.status(500).json({ error: 'Bestelling kon niet worden verstuurd' });
  }
});

app.post('/pay', (req, res) => {
  res.status(410).json({ error: 'Online betalen staat tijdelijk uit. Gebruik het handmatige bestelformulier.' });
});

// ==== CART ROUTES ====

app.get('/api/cart', async (req, res) => {
  try {
    const sessionId = cartSessionId(req);
    const cart = await getCart(sessionId);
    res.json(cart);
  } catch (err) {
    console.error('Error fetching cart:', err);
    res.status(500).json({ error: 'Failed to fetch cart' });
  }
});

app.post('/api/cart', async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const sessionId = cartSessionId(req);
    const parsedProductId = parseInt(productId, 10);
    const addQuantity = parseInt(quantity, 10);
    if (!Number.isInteger(parsedProductId) || !Number.isInteger(addQuantity) || addQuantity <= 0) {
      return res.status(400).json({ error: 'productId and quantity required' });
    }
    const products = await getProducts();
    const product = products.find(p => p.id === parsedProductId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    const currentCart = await getCart(sessionId);
    const currentItem = currentCart.find(item => Number(item.productId || item.product_id) === parsedProductId);
    const nextQuantity = Number(currentItem?.quantity || 0) + addQuantity;
    if (Number(product.stock || 0) < nextQuantity) {
      return res.status(400).json({ error: 'Insufficient stock' });
    }
    await addToCart(sessionId, parsedProductId, addQuantity);
    const updatedCart = await getCart(sessionId);
    res.json(updatedCart);
  } catch (err) {
    console.error('Error adding to cart:', err);
    res.status(500).json({ error: 'Failed to add to cart' });
  }
});

app.put('/api/cart/:productId', async (req, res) => {
  try {
    const { quantity } = req.body;
    const { productId } = req.params;
    const sessionId = cartSessionId(req);
    const parsedProductId = parseInt(productId, 10);
    const nextQuantity = parseInt(quantity, 10);
    if (!Number.isInteger(parsedProductId) || !Number.isInteger(nextQuantity)) {
      return res.status(400).json({ error: 'quantity required' });
    }
    if (nextQuantity > 0) {
      const products = await getProducts();
      const product = products.find(p => p.id === parsedProductId);
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      if (Number(product.stock || 0) < nextQuantity) {
        return res.status(400).json({ error: 'Insufficient stock' });
      }
    }
    await updateCartQuantity(sessionId, parsedProductId, nextQuantity);
    const updatedCart = await getCart(sessionId);
    res.json(updatedCart);
  } catch (err) {
    console.error('Error updating cart:', err);
    res.status(500).json({ error: 'Failed to update cart' });
  }
});

app.delete('/api/cart/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const sessionId = cartSessionId(req);
    await removeFromCart(sessionId, parseInt(productId));
    const updatedCart = await getCart(sessionId);
    res.json(updatedCart);
  } catch (err) {
    console.error('Error removing from cart:', err);
    res.status(500).json({ error: 'Failed to remove from cart' });
  }
});

// ==== ADMIN AUTH ROUTES ==== 

app.get("/admin/login", checkAdminIP, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

app.post("/admin/login", checkAdminIP, async (req, res) => {
  const username = (req.body.username || '').toLowerCase();
  const password = req.body.password;
  
  console.log('Login attempt:', username);
  
  try {
    const valid = await checkAdminLogin(username, password);
    if (valid) {
      req.session.admin = true;
      res.json({ success: true });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

app.get("/admin", checkAdminIP, (req, res) => {
  if (!req.session.admin) {
    return res.redirect('/admin/login');
  }
  res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});

// ==== ADMIN API ROUTES ====

app.get('/api/admin/products', requireAuth, async (req, res) => {
  try {
    const products = await getProducts();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET single product for editing
app.get('/api/admin/products/:id', requireAuth, async (req, res) => {
  try {
    const product = await getProduct(parseInt(req.params.id, 10));
    if (!product) return res.status(404).json({ error: 'Not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

app.post('/api/admin/products', requireAuth, async (req, res) => {
  console.log('POST /api/admin/products body:', JSON.stringify(req.body));
  const { name, description, long_description, price, category, stock, image_url, images, featured, is_unique } = req.body;
  
  if (!name || price === undefined) {
    return res.status(400).json({ error: 'Name and price required' });
  }
  
  try {
    const id = await addProduct({
      name,
      description: description || '',
      long_description: long_description || '',
      price: parseFloat(price),
      category: category || 'other',
      stock: parseInt(stock) || 0,
      image_url: image_url || '',
      images: Array.isArray(images) ? images : [],
      featured: featured ? 1 : 0,
      is_unique: is_unique ? 1 : 0
    });
    res.json({ id, success: true });
  } catch (err) {
    console.error('Add product error:', err);
    res.status(500).json({ error: 'Failed to add product' });
  }
});

app.put('/api/admin/products/:id', requireAuth, async (req, res) => {
  console.log('PUT /api/admin/products/:id body:', JSON.stringify(req.body));
  const { name, description, long_description, price, category, stock, image_url, images, featured, is_unique } = req.body;
  
  try {
    await updateProduct(parseInt(req.params.id), {
      name,
      description: description || '',
      long_description: long_description || '',
      price: parseFloat(price),
      category: category || 'other',
      stock: parseInt(stock) || 0,
      image_url: image_url || '',
      images: Array.isArray(images) ? images : [],
      featured: featured ? 1 : 0,
      is_unique: is_unique ? 1 : 0
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update product' });
  }
});

app.delete('/api/admin/products/:id', requireAuth, async (req, res) => {
  try {
    await deleteProduct(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

function categoryApiError(res, err) {
  if (err.code === 'CATEGORY_REQUIRED') {
    return res.status(400).json({ error: 'Category name is required' });
  }
  if (err.code === 'CATEGORY_EXISTS') {
    return res.status(409).json({ error: 'Category already exists' });
  }
  if (err.code === 'CATEGORY_NOT_FOUND') {
    return res.status(404).json({ error: 'Category not found' });
  }
  return res.status(500).json({ error: 'Failed to save category' });
}

app.get('/api/admin/categories', requireAuth, async (req, res) => {
  try {
    const categories = await getCategories();
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

app.post('/api/admin/categories', requireAuth, async (req, res) => {
  try {
    if (RESERVED_CATEGORY_SLUGS.has(categorySlug(req.body.name))) {
      return res.status(400).json({ error: 'This category name is reserved' });
    }
    const id = await addCategory(req.body.name);
    res.status(201).json({ id, success: true });
  } catch (err) {
    categoryApiError(res, err);
  }
});

app.put('/api/admin/categories/:id', requireAuth, async (req, res) => {
  try {
    if (RESERVED_CATEGORY_SLUGS.has(categorySlug(req.body.name))) {
      return res.status(400).json({ error: 'This category name is reserved' });
    }
    await updateCategory(parseInt(req.params.id, 10), req.body.name);
    res.json({ success: true });
  } catch (err) {
    categoryApiError(res, err);
  }
});

// Image upload endpoint
app.post('/api/admin/upload', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  res.json({ url: '/uploads/' + req.file.filename });
});

app.get('/api/admin/homepage', requireAuth, async (req, res) => {
  try {
    const homepage = await getHomepage();
    res.json(homepage);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch homepage' });
  }
});

app.put('/api/admin/homepage', requireAuth, async (req, res) => {
  const fields = [
    'hero_title','hero_subtitle',
    'about1_icon','about1_title','about1_text',
    'about2_icon','about2_title','about2_text',
    'about3_icon','about3_title','about3_text',
    'featured_title','featured_subtitle'
  ];
  
  try {
    await updateHomepage(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update homepage' });
  }
});

app.get('/api/admin/site-settings', requireAuth, async (req, res) => {
  try {
    const settings = await getSiteSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch site settings' });
  }
});

app.put('/api/admin/site-settings', requireAuth, async (req, res) => {
  try {
    await updateSiteSettings(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update site settings' });
  }
});

app.put('/api/admin/password', requireAuth, async (req, res) => {
  const { newPassword } = req.body;
  
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'Password too short' });
  }
  
  try {
    await updateAdminPassword('admin', newPassword);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update password' });
  }
});

// ==== FALLBACK ====

app.get('*', (req, res) => {
  res.redirect('/products');
});

// Start server
app.listen(PORT, () => {
  console.log(`Crystal Jewelz server running on port ${PORT}`);
});

// Traditional form POST login handler
app.post('/admin/login-handler', async (req, res) => {
  const username = (req.body.username || '').toLowerCase();
  const password = req.body.password;
  
  console.log('Form login attempt:', username);
  
  try {
    const valid = await checkAdminLogin(username, password);
    if (valid) {
      req.session.admin = true;
      res.redirect('/admin');
    } else {
      res.send(`
        <html>
          <head><meta charset="utf-8"><title>Login Failed</title></head>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>❌ Login Failed</h1>
            <p>Invalid username or password</p>
            <a href="/admin/login" style="color: #7b1fa2; text-decoration: none; font-weight: bold;">← Try again</a>
          </body>
        </html>
      `);
    }
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).send('Login error');
  }
});

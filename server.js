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
const {
  initDatabase,
  getProducts,
  getProduct,
  addProduct,
  updateProduct,
  deleteProduct,
  addProductImage,
  deleteProductImage,
  getHomepage,
  updateHomepage,
  getSiteSettings,
  updateSiteSettings,
  checkAdminLogin,
  updateAdminPassword,
  getCart,
  addToCart,
  updateCartQuantity,
  removeFromCart,
  clearCart
} = require('./db-utils');
const { sendManualOrderEmail } = require('./backend/email');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || __dirname;

let siteSettings = {
  logo_url: '',
  brand_name: 'Crystal Jewelz',
  font_family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  primary_color: '#4a148c',
  accent_color: '#d4af37',
  background_color: '#f8f9fa'
};

app.set('trust proxy', 1);
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 }));
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
    }
  }
}));
app.use(cors({ origin: ['https://crystaljewelz.nl', 'http://localhost:3000', 'http://127.0.0.1:3000'], credentials: true }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-for-dev',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 30 * 24 * 60 * 60 * 1000 }
}));
const csrfProtection = csrf({ cookie: true });

app.use(express.static(path.join(__dirname, 'public'), { index: false }));

const uploadDir = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname))
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = /jpeg|jpg|png|gif|webp|svg/.test(path.extname(file.originalname).toLowerCase());
    const mime = /jpeg|jpg|png|gif|webp|svg/.test(file.mimetype);
    cb(null, ext && mime);
  }
});

const ADMIN_IP_WHITELIST = ['77.162.108.225', '127.0.0.1', 'localhost'];
const ENABLE_IP_WHITELIST = true;

function checkAdminIP(req, res, next) {
  if (!ENABLE_IP_WHITELIST) return next();
  const clientIP = req.ip || req.connection.remoteAddress || '';
  if (!ADMIN_IP_WHITELIST.some(ip => clientIP.includes(ip))) {
    console.warn(`Admin access attempt from unauthorized IP: ${clientIP}`);
    return res.status(403).json({ error: 'Access denied: Your IP is not whitelisted' });
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.session.admin) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function formatPrice(value) {
  return '€' + Number(value || 0).toFixed(2).replace('.', ',');
}

function stockLabel(product) {
  const stock = Number(product.stock || 0);
  if (stock <= 0) return '<span class="stock sold">Verkocht</span>';
  if (product.is_unique) return '<span class="stock unique">Uniek exemplaar</span>';
  return `<span class="stock">${stock} op voorraad</span>`;
}

function imageList(product) {
  const extra = Array.isArray(product.images) ? product.images.map(img => img.image_url) : [];
  return [product.image_url, ...extra].filter(Boolean);
}

function productCard(product) {
  const images = imageList(product);
  const disabled = Number(product.stock || 0) <= 0 ? 'disabled' : '';
  return `<article class="product-card">
    <a class="product-image" href="/product/${product.id}">${images[0] ? `<img src="${escapeHtml(images[0])}" alt="${escapeHtml(product.name)}" loading="lazy">` : ''}</a>
    <div class="product-name"><a href="/product/${product.id}">${escapeHtml(product.name)}</a></div>
    <div class="product-category">${escapeHtml(product.category)}</div>
    <div class="product-description">${escapeHtml(product.description)}</div>
    ${stockLabel(product)}
    <div class="product-footer">
      <div class="product-price">${formatPrice(product.price)}</div>
      <button type="button" class="add-btn" data-add-to-cart="${product.id}" ${disabled}>${disabled ? 'Verkocht' : 'Add to Cart'}</button>
    </div>
  </article>`;
}

function renderPage(title, content, activeCat = '') {
  const settings = siteSettings || {};
  const brand = escapeHtml(settings.brand_name || 'Crystal Jewelz');
  const logo = settings.logo_url ? `<img src="${escapeHtml(settings.logo_url)}" alt="${brand}">` : '<span class="logo-mark">CJ</span>';
  const cats = ['All Products', 'Bracelets', 'Necklaces', 'Rings', 'Earrings'];
  const slugs = ['/', '/bracelets', '/necklaces', '/rings', '/earrings'];

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${brand} - ${escapeHtml(title)}</title>
  <style>
    :root { --primary: ${settings.primary_color || '#4a148c'}; --accent: ${settings.accent_color || '#d4af37'}; --bg: ${settings.background_color || '#f8f9fa'}; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: ${settings.font_family || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'}; line-height: 1.6; color: #333; background: var(--bg); }
    .container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
    header { background: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%); color: white; padding: 1rem 0; box-shadow: 0 2px 10px rgba(0,0,0,0.15); }
    .header-content { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
    .logo { display: flex; align-items: center; gap: .75rem; color: white; text-decoration: none; font-size: 1.4rem; font-weight: bold; }
    .logo img { max-height: 48px; max-width: 180px; object-fit: contain; }
    .logo-mark { width: 42px; height: 42px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; background: rgba(255,255,255,.2); }
    .hero { background: rgba(255,255,255,.75); padding: 4rem 1rem; text-align: center; margin-bottom: 2rem; border-radius: 0 0 18px 18px; }
    .hero h1 { font-size: 2.5rem; color: var(--primary); margin-bottom: 0.5rem; }
    main { padding: 2rem 0; }
    .category-nav { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 2rem; }
    .filter-btn { display: inline-block; padding: 0.5rem 1.25rem; border: 2px solid var(--primary); background: white; color: var(--primary); border-radius: 25px; cursor: pointer; font-weight: 600; text-decoration: none; }
    .filter-btn:hover, .filter-btn.active { background: var(--primary); color: white; }
    .products-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 2rem; }
    .product-card { background: white; border-radius: 10px; padding: 1.25rem; box-shadow: 0 4px 15px rgba(0,0,0,.08); }
    .product-image { display: flex; align-items: center; justify-content: center; width: 100%; aspect-ratio: 4 / 3; overflow: hidden; border-radius: 8px; margin-bottom: 1rem; background: #fbf8fc; border: 1px solid rgba(74,20,140,.08); padding: .6rem; }
    .product-image img { width: 100%; height: 100%; object-fit: contain; }
    .product-name a { color: #2d3748; text-decoration: none; font-size: 1.1rem; font-weight: 700; }
    .product-category { display: inline-block; background: rgba(123,31,162,.1); color: var(--primary); padding: .2rem .75rem; border-radius: 15px; font-size: .8rem; margin: .5rem 0; }
    .product-description { color: #667085; margin-bottom: .75rem; font-size: .95rem; }
    .stock { display: inline-block; margin-bottom: .75rem; font-size: .85rem; color: #2f855a; font-weight: 700; }
    .stock.unique { color: var(--primary); }
    .stock.sold { color: #c62828; }
    .product-footer { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
    .product-price { font-size: 1.3rem; font-weight: 800; color: var(--accent); }
    .add-btn { background: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%); color: white; border: none; padding: .6rem 1.1rem; border-radius: 25px; cursor: pointer; font-weight: 700; }
    .add-btn:disabled { background: #aaa; cursor: not-allowed; }
    .detail { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(280px, .9fr); gap: 2rem; background: white; padding: 1.5rem; border-radius: 10px; }
    .gallery-main { width: 100%; aspect-ratio: 4 / 3; object-fit: contain; border-radius: 10px; background: #fbf8fc; border: 1px solid rgba(74,20,140,.08); }
    .thumbs { display: flex; gap: .5rem; margin-top: .75rem; flex-wrap: wrap; }
    .thumbs img { width: 76px; height: 64px; object-fit: contain; border-radius: 6px; border: 2px solid #eee; cursor: pointer; background: #fbf8fc; padding: .15rem; }
    .long-description { white-space: pre-wrap; margin: 1rem 0; color: #444; }
    .cart-button { margin-left: .75rem; background: rgba(255,255,255,.2); color: white; border: 1px solid rgba(255,255,255,.55); padding: .5rem 1rem; border-radius: 25px; cursor: pointer; font-weight: 700; }
    .cart-count { display: inline-flex; align-items: center; justify-content: center; min-width: 1.5rem; height: 1.5rem; margin-left: .4rem; border-radius: 999px; background: var(--accent); color: #2d1742; font-size: .85rem; }
    .cart-modal { display: none; position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,.45); padding: 2rem; }
    .cart-modal.open { display: block; }
    .cart-panel { max-width: 560px; margin: 5vh auto; background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 18px 50px rgba(0,0,0,.25); }
    .cart-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .cart-close { border: 0; background: transparent; font-size: 1.75rem; cursor: pointer; color: var(--primary); }
    .cart-item { display: flex; justify-content: space-between; gap: 1rem; padding: .9rem 0; border-bottom: 1px solid #eee; }
    .cart-actions { display: flex; align-items: center; gap: .5rem; }
    .cart-actions button { border: 0; background: var(--primary); color: white; border-radius: 50%; width: 1.75rem; height: 1.75rem; cursor: pointer; }
    .cart-total { margin-top: 1rem; font-weight: 800; color: var(--primary); text-align: right; }
    .checkout-link { display: inline-block; width: 100%; box-sizing: border-box; margin-top: 1rem; padding: .85rem 1rem; border-radius: 25px; background: linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%); color: white; text-align: center; text-decoration: none; font-weight: 800; }
    .about-section { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 2rem; margin: 4rem 0; }
    .about-card { text-align: center; padding: 2rem; background: white; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,.08); }
    footer { background: var(--primary); color: white; padding: 2rem 0; margin-top: 4rem; text-align: center; }
    @media (max-width: 760px) { .detail { grid-template-columns: 1fr; } .header-content { align-items: flex-start; flex-direction: column; } }
  </style>
</head>
<body>
  <header><div class="container"><div class="header-content">
    <a href="/" class="logo">${logo}<span>${brand}</span></a>
    <nav><a href="/" class="filter-btn" style="color:white;border-color:rgba(255,255,255,.6);background:transparent;">Home</a><button type="button" id="cartButton" class="cart-button">Cart <span id="cartCount" class="cart-count">0</span></button></nav>
  </div></div></header>
  <main><div class="container">
    <nav class="category-nav">${cats.map((c, i) => `<a href="${slugs[i]}" class="filter-btn${activeCat === slugs[i] ? ' active' : ''}">${c}</a>`).join('')}</nav>
    ${content}
  </div></main>
  <div id="cartModal" class="cart-modal" aria-hidden="true"><div class="cart-panel" role="dialog" aria-modal="true" aria-labelledby="cartTitle"><div class="cart-header"><h2 id="cartTitle">Your cart</h2><button type="button" id="cartClose" class="cart-close" aria-label="Close cart">&times;</button></div><div id="cartItems" class="empty-cart">Your cart is empty</div><div id="cartTotal" class="cart-total"></div></div></div>
  <footer><div class="container"><p>&copy; 2026 ${brand}. Handcrafted with care.</p></div></footer>
  <script>
    let cart = [];
    const cartModal = () => document.getElementById('cartModal');
    const cartCount = () => document.getElementById('cartCount');
    const cartItems = () => document.getElementById('cartItems');
    const cartTotal = () => document.getElementById('cartTotal');
    function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
    function itemProductId(item) { return item.product_id ?? item.productId ?? item.id; }
    function renderCart() {
      const totalItems = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      cartCount().textContent = totalItems;
      if (!cart.length) { cartItems().className = 'empty-cart'; cartItems().innerHTML = 'Your cart is empty'; cartTotal().textContent = ''; return; }
      cartItems().className = '';
      cartItems().innerHTML = cart.map(item => {
        const productId = itemProductId(item); const price = Number(item.price || 0); const quantity = Number(item.quantity || 0);
        return '<div class="cart-item"><div><strong>' + escapeHtml(item.name) + '</strong><br><span>€' + price.toFixed(2).replace('.', ',') + ' each</span></div><div class="cart-actions"><button type="button" data-cart-update="' + productId + '" data-change="-1">-</button><span>' + quantity + '</span><button type="button" data-cart-update="' + productId + '" data-change="1">+</button><button type="button" data-cart-remove="' + productId + '" aria-label="Remove item">&times;</button></div></div>';
      }).join('');
      const total = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
      cartTotal().innerHTML = 'Total: €' + total.toFixed(2).replace('.', ',') + '<br><a class="checkout-link" href="/checkout.html">Bestelling plaatsen</a>';
    }
    async function loadCart() { const response = await fetch('/api/cart', { credentials: 'same-origin' }); if (!response.ok) throw new Error('Cart load failed'); cart = await response.json(); renderCart(); }
    async function addToCart(productId, button) { const response = await fetch('/api/cart', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, quantity: 1 }) }); if (!response.ok) throw new Error(await response.text()); cart = await response.json(); renderCart(); if (button) { const old = button.textContent; button.textContent = 'Added'; button.classList.add('added'); setTimeout(() => { button.textContent = old; button.classList.remove('added'); }, 900); } }
    async function updateCart(productId, change) { const current = cart.find(item => String(itemProductId(item)) === String(productId)); const quantity = Math.max(0, Number(current?.quantity || 0) + Number(change)); const response = await fetch('/api/cart/' + productId, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity }) }); if (!response.ok) throw new Error(await response.text()); cart = await response.json(); renderCart(); }
    async function removeCart(productId) { const response = await fetch('/api/cart/' + productId, { method: 'DELETE', credentials: 'same-origin' }); if (!response.ok) throw new Error(await response.text()); cart = await response.json(); renderCart(); }
    function openCart() { cartModal().classList.add('open'); cartModal().setAttribute('aria-hidden', 'false'); }
    function closeCart() { cartModal().classList.remove('open'); cartModal().setAttribute('aria-hidden', 'true'); }
    document.addEventListener('DOMContentLoaded', () => {
      loadCart().catch(console.error);
      document.getElementById('cartButton').addEventListener('click', openCart);
      document.getElementById('cartClose').addEventListener('click', closeCart);
      cartModal().addEventListener('click', event => { if (event.target === cartModal()) closeCart(); });
      document.addEventListener('click', event => {
        const addButton = event.target.closest('[data-add-to-cart]'); if (addButton) addToCart(addButton.dataset.addToCart, addButton).catch(console.error);
        const updateButton = event.target.closest('[data-cart-update]'); if (updateButton) updateCart(updateButton.dataset.cartUpdate, updateButton.dataset.change).catch(console.error);
        const removeButton = event.target.closest('[data-cart-remove]'); if (removeButton) removeCart(removeButton.dataset.cartRemove).catch(console.error);
        const thumb = event.target.closest('[data-gallery-src]'); if (thumb) document.getElementById('galleryMain').src = thumb.dataset.gallerySrc;
      });
    });
  </script>
</body></html>`;
}

async function refreshSiteSettings() {
  siteSettings = Object.assign(siteSettings, await getSiteSettings());
}

function cartSessionId(req) {
  if (!req.session.cartStartedAt) req.session.cartStartedAt = Date.now();
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
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
  await fs.promises.appendFile(path.join(DATA_DIR, 'manual-orders.jsonl'), JSON.stringify(order) + '\n');
}

console.log('Initializing database...');
initDatabase().then(refreshSiteSettings).then(() => console.log('Database initialized')).catch(err => console.error('DB init error:', err));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/', async (req, res) => {
  try {
    const [products, hp] = await Promise.all([getProducts(), getHomepage()]);
    const featured = products.filter(p => p.featured === 1);
    const cards = featured.map(productCard).join('');
    const content = `<section class="hero"><h1>${escapeHtml(hp.hero_title)}</h1><p>${escapeHtml(hp.hero_subtitle)}</p></section>
      <section class="about-section">
        <div class="about-card"><div>${escapeHtml(hp.about1_icon)}</div><h3>${escapeHtml(hp.about1_title)}</h3><p>${escapeHtml(hp.about1_text)}</p></div>
        <div class="about-card"><div>${escapeHtml(hp.about2_icon)}</div><h3>${escapeHtml(hp.about2_title)}</h3><p>${escapeHtml(hp.about2_text)}</p></div>
        <div class="about-card"><div>${escapeHtml(hp.about3_icon)}</div><h3>${escapeHtml(hp.about3_title)}</h3><p>${escapeHtml(hp.about3_text)}</p></div>
      </section>
      <div class="category-header"><h1>${escapeHtml(hp.featured_title)}</h1><p>${featured.length} ${escapeHtml(hp.featured_subtitle)}</p></div>
      <div class="products-grid">${cards || '<p>No featured products yet.</p>'}</div>`;
    res.send(renderPage('Handcrafted Crystal Jewelry', content, '/'));
  } catch (err) {
    console.error('Homepage error:', err);
    res.status(500).send(renderPage('Error', '<p>Something went wrong.</p>'));
  }
});

const CATEGORIES = ['bracelets', 'necklaces', 'rings', 'earrings', 'anklets'];
CATEGORIES.forEach(cat => {
  app.get(`/${cat}`, async (req, res) => {
    try {
      const products = await getProducts();
      const categoryProducts = products.filter(p => String(p.category || '').toLowerCase() === cat.toLowerCase());
      const title = cat.charAt(0).toUpperCase() + cat.slice(1);
      const content = `<div class="category-header"><h1>${escapeHtml(title)}</h1><p>${categoryProducts.length} products</p></div><div class="products-grid">${categoryProducts.map(productCard).join('') || '<p>No products in this category yet.</p>'}</div>`;
      res.send(renderPage(title, content, `/${cat}`));
    } catch (err) {
      console.error('Category error:', err);
      res.status(500).send(renderPage('Error', '<p>Failed to load products.</p>'));
    }
  });
});

app.get('/product/:id', async (req, res) => {
  try {
    const product = await getProduct(Number(req.params.id));
    if (!product) return res.status(404).send(renderPage('Product not found', '<p>Product not found.</p>'));
    const images = imageList(product);
    const mainImage = images[0] || '';
    const gallery = images.map(src => `<img src="${escapeHtml(src)}" alt="${escapeHtml(product.name)}" data-gallery-src="${escapeHtml(src)}">`).join('');
    const disabled = Number(product.stock || 0) <= 0 ? 'disabled' : '';
    const content = `<article class="detail">
      <div>${mainImage ? `<img id="galleryMain" class="gallery-main" src="${escapeHtml(mainImage)}" alt="${escapeHtml(product.name)}">` : '<div class="gallery-main"></div>'}<div class="thumbs">${gallery}</div></div>
      <div><p class="product-category">${escapeHtml(product.category)}</p><h1>${escapeHtml(product.name)}</h1>${stockLabel(product)}<div class="product-price">${formatPrice(product.price)}</div><p>${escapeHtml(product.description)}</p><div class="long-description">${escapeHtml(product.long_description || product.description || '')}</div><button type="button" class="add-btn" data-add-to-cart="${product.id}" ${disabled}>${disabled ? 'Verkocht' : 'Add to Cart'}</button></div>
    </article>`;
    res.send(renderPage(product.name, content));
  } catch (err) {
    console.error('Product detail error:', err);
    res.status(500).send(renderPage('Error', '<p>Failed to load product.</p>'));
  }
});

app.get('/api/products', async (req, res) => {
  try { res.json(await getProducts()); } catch { res.status(500).json({ error: 'Failed to fetch products' }); }
});
app.get('/api/products/featured', async (req, res) => {
  try { res.json((await getProducts()).filter(p => p.featured === 1)); } catch { res.status(500).json({ error: 'Failed to fetch products' }); }
});
app.get('/api/products/category/:category', async (req, res) => {
  try { res.json((await getProducts()).filter(p => p.category === req.params.category)); } catch { res.status(500).json({ error: 'Failed to fetch products' }); }
});
app.get('/api/products/:id', async (req, res) => {
  try { const product = await getProduct(Number(req.params.id)); product ? res.json(product) : res.status(404).json({ error: 'Product not found' }); } catch { res.status(500).json({ error: 'Failed to fetch product' }); }
});

app.get('/api/homepage', async (req, res) => {
  try { res.json(await getHomepage()); } catch { res.status(500).json({ error: 'Failed to fetch homepage' }); }
});

app.post('/api/manual-order', async (req, res) => {
  try {
    const { name, email, phone, street, houseNumber, postalCode, city, address, notes } = req.body;
    const normalizedPostcode = String(postalCode || '').replace(/\s+/g, '').toUpperCase();
    if (!name || !email || !phone || !street || !houseNumber || !postalCode || !city || !address) return res.status(400).json({ error: 'Naam, e-mail, telefoon en volledig adres zijn verplicht' });
    if (!/^[1-9][0-9]{3}[A-Z]{2}$/.test(normalizedPostcode)) return res.status(400).json({ error: 'Postcode moet het formaat 1234 AB hebben' });
    const sessionId = cartSessionId(req);
    const cart = await getCart(sessionId);
    if (!cart.length) return res.status(400).json({ error: 'Je winkelmand is leeg' });
    const order = {
      id: orderId(),
      createdAt: new Date().toISOString(),
      sessionId,
      name,
      email,
      phone,
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
    if (err.code === 'SMTP_NOT_CONFIGURED') return res.status(503).json({ error: 'Bestelling is opgeslagen, maar e-mail is nog niet ingesteld. Neem contact op met Crystal Jewelz.' });
    res.status(500).json({ error: 'Bestelling kon niet worden verstuurd' });
  }
});

app.post('/pay', (req, res) => res.status(410).json({ error: 'Online betalen staat tijdelijk uit. Gebruik het handmatige bestelformulier.' }));

app.get('/api/cart', async (req, res) => {
  try { res.json(await getCart(cartSessionId(req))); } catch { res.status(500).json({ error: 'Failed to fetch cart' }); }
});
app.post('/api/cart', async (req, res) => {
  try { await addToCart(cartSessionId(req), Number(req.body.productId), Number(req.body.quantity || 1)); res.json(await getCart(cartSessionId(req))); } catch (err) { res.status(400).json({ error: err.message || 'Failed to add to cart' }); }
});
app.put('/api/cart/:productId', async (req, res) => {
  try { await updateCartQuantity(cartSessionId(req), Number(req.params.productId), Number(req.body.quantity)); res.json(await getCart(cartSessionId(req))); } catch (err) { res.status(400).json({ error: err.message || 'Failed to update cart' }); }
});
app.delete('/api/cart/:productId', async (req, res) => {
  try { await removeFromCart(cartSessionId(req), Number(req.params.productId)); res.json(await getCart(cartSessionId(req))); } catch { res.status(500).json({ error: 'Failed to remove from cart' }); }
});

app.get('/admin/login', checkAdminIP, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-login.html')));
app.post('/admin/login', checkAdminIP, async (req, res) => {
  try {
    const valid = await checkAdminLogin(String(req.body.username || '').toLowerCase(), req.body.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    req.session.admin = true;
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Login failed' }); }
});
app.post('/admin/login-handler', checkAdminIP, async (req, res) => {
  try {
    const valid = await checkAdminLogin(String(req.body.username || '').toLowerCase(), req.body.password);
    if (!valid) return res.send('<p>Invalid username or password. <a href="/admin/login">Try again</a></p>');
    req.session.admin = true;
    res.redirect('/admin');
  } catch { res.status(500).send('Login error'); }
});
app.get('/admin/logout', (req, res) => req.session.destroy(() => res.redirect('/admin/login')));
app.get('/admin', checkAdminIP, (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');
  res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});

app.get('/api/admin/products', requireAuth, async (req, res) => {
  try { res.json(await getProducts()); } catch { res.status(500).json({ error: 'Failed to fetch products' }); }
});
app.get('/api/admin/products/:id', requireAuth, async (req, res) => {
  try { const product = await getProduct(Number(req.params.id)); product ? res.json(product) : res.status(404).json({ error: 'Not found' }); } catch { res.status(500).json({ error: 'Failed to fetch product' }); }
});
app.post('/api/admin/products', requireAuth, async (req, res) => {
  try { res.json({ id: await addProduct(req.body), success: true }); } catch (err) { console.error('Add product error:', err); res.status(500).json({ error: 'Failed to add product' }); }
});
app.put('/api/admin/products/:id', requireAuth, async (req, res) => {
  try { await updateProduct(Number(req.params.id), req.body); res.json({ success: true }); } catch (err) { console.error('Update product error:', err); res.status(500).json({ error: 'Failed to update product' }); }
});
app.delete('/api/admin/products/:id', requireAuth, async (req, res) => {
  try { await deleteProduct(Number(req.params.id)); res.json({ success: true }); } catch { res.status(500).json({ error: 'Failed to delete product' }); }
});
app.post('/api/admin/products/:id/images', requireAuth, async (req, res) => {
  try { res.json({ id: await addProductImage(Number(req.params.id), req.body.image_url), success: true }); } catch { res.status(500).json({ error: 'Failed to add image' }); }
});
app.delete('/api/admin/products/:id/images/:imageId', requireAuth, async (req, res) => {
  try { await deleteProductImage(Number(req.params.id), Number(req.params.imageId)); res.json({ success: true }); } catch { res.status(500).json({ error: 'Failed to delete image' }); }
});
app.post('/api/admin/upload', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: '/uploads/' + req.file.filename });
});
app.get('/api/admin/homepage', requireAuth, async (req, res) => {
  try { res.json(await getHomepage()); } catch { res.status(500).json({ error: 'Failed to fetch homepage' }); }
});
app.put('/api/admin/homepage', requireAuth, async (req, res) => {
  try { await updateHomepage(req.body); res.json({ success: true }); } catch { res.status(500).json({ error: 'Failed to update homepage' }); }
});
app.get('/api/admin/site-settings', requireAuth, async (req, res) => {
  try { res.json(await getSiteSettings()); } catch { res.status(500).json({ error: 'Failed to fetch settings' }); }
});
app.put('/api/admin/site-settings', requireAuth, async (req, res) => {
  try { await updateSiteSettings(req.body); await refreshSiteSettings(); res.json({ success: true }); } catch { res.status(500).json({ error: 'Failed to update settings' }); }
});
app.put('/api/admin/password', requireAuth, async (req, res) => {
  if (!req.body.newPassword || req.body.newPassword.length < 8) return res.status(400).json({ error: 'Password too short' });
  try { await updateAdminPassword('admin', req.body.newPassword); res.json({ success: true }); } catch { res.status(500).json({ error: 'Failed to update password' }); }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error('Multer upload error:', err);
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Foto is te groot. Gebruik maximaal 20 MB per foto.' });
    return res.status(400).json({ error: 'Upload mislukt: ' + err.message });
  }
  if (err) {
    console.error('Unhandled request error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
  next();
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Crystal Jewelz server running on port ${PORT}`));

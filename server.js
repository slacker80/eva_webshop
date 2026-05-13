const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const csrf = require('csurf');
const { initDatabase, getProducts, addProduct, updateProduct, deleteProduct, getHomepage, updateHomepage, checkAdminLogin, updateAdminPassword, getCart, addToCart, updateCartQuantity, removeFromCart, clearCart } = require('./db-utils');

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
app.use(helmet());
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
app.use(csrfProtection);

// Homepage — shows featured products only
app.get('/', async (req, res) => {
  try {
    const products = await getProducts();
    const featured = products.filter(p => p.featured === 1);
    
    const productCards = featured.map(p => `
                <div class="product-card">
                    <div class="product-name">${p.name}</div>
                    <div class="product-category">${p.category}</div>
                    <div class="product-description">${p.description}</div>
                    <div class="product-footer">
                        <div class="product-price">$${p.price}</div>
                        <button class="add-btn">Add to Cart</button>
                    </div>
                </div>`).join('');

    const content = `
            <div class="hero">
                <h1>✨ Handcrafted Crystal Jewelry</h1>
                <p>Discover our beautiful collection of handcrafted crystal jewelry. Each piece is made with love and positive energy.</p>
            </div>

            <div class="about-section">
                <div class="about-card">
                    <div class="icon">💎</div>
                    <h3>Authentic Crystals</h3>
                    <p>Every piece features genuine, ethically sourced crystals handpicked for quality and beauty.</p>
                </div>
                <div class="about-card">
                    <div class="icon">🤲</div>
                    <h3>Handcrafted With Care</h3>
                    <p>Each jewelry piece is carefully handcrafted by our skilled artisans with attention to every detail.</p>
                </div>
                <div class="about-card">
                    <div class="icon">🌍</div>
                    <h3>Sustainable & Ethical</h3>
                    <p>We are committed to sustainable practices and ethical sourcing for all our materials.</p>
                </div>
            </div>

            <div class="category-header">
                <h1>🌟 Featured Products</h1>
                <p class="category-count">${featured.length} handpicked pieces</p>
            </div>

            <div class="products-grid">
                ${productCards || '<p>No featured products yet. Check our <a href="/bracelets">categories</a>!</p>'}
            </div>`;

    res.send(renderPage('Handcrafted Crystal Jewelry', content, '/'));
  } catch (err) {
    res.status(500).send(renderPage('Error', '<p>Something went wrong.</p>'));
  }
});

app.use(express.static(path.join(__dirname, 'public')));

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

app.get('/api/products/:id', async (req, res) => {
  try {
    const products = await getProducts();
    const product = products.find(p => p.id === parseInt(req.params.id));
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

app.get('/api/products/category/:category', async (req, res) => {
  try {
    const products = await getProducts();
    const categoryProducts = products.filter(p => p.category === req.params.category);
    res.json(categoryProducts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Shared HTML layout helper
function renderPage(title, content, activeCat = '') {
  const cats = ['All Products', 'Bracelets', 'Necklaces', 'Rings', 'Earrings'];
  const slugs = ['/', '/bracelets', '/necklaces', '/rings', '/earrings'];
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Crystal Jewelz - ${title}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background: #f8f9fa; }
        .container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
        
        header { background: linear-gradient(135deg, #4a148c 0%, #7b1fa2 50%, #d4af37 100%); color: white; padding: 1.5rem 0; box-shadow: 0 2px 10px rgba(0,0,0,0.15); }
        .header-content { display: flex; justify-content: space-between; align-items: center; }
        .logo { font-size: 1.8rem; font-weight: bold; color: white; text-decoration: none; }
        .logo:hover { color: #d4af37; }
        
        .hero { background: linear-gradient(135deg, #f3e5f5 0%, #e1bee7 50%, #ffecb3 100%); padding: 4rem 0; text-align: center; margin-bottom: 2rem; }
        .hero h1 { font-size: 2.5rem; color: #4a148c; margin-bottom: 0.5rem; }
        .hero p { font-size: 1.2rem; color: #666; max-width: 600px; margin: 0 auto; }
        
        main { padding: 2rem 0; }
        
        .category-nav { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 2rem; }
        .filter-btn { display: inline-block; padding: 0.5rem 1.5rem; border: 2px solid #7b1fa2; background: white; color: #7b1fa2; border-radius: 25px; cursor: pointer; transition: all 0.3s; font-weight: 500; text-decoration: none; font-size: 0.95rem; }
        .filter-btn:hover, .filter-btn.active { background: #7b1fa2; color: white; }
        
        .category-header { margin-bottom: 2rem; }
        .category-header h1 { color: #4a148c; font-size: 2rem; }
        .category-count { color: #666; margin-top: 0.25rem; }
        
        .products-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 2rem; }
        .product-card { background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 4px 15px rgba(0,0,0,0.08); transition: transform 0.3s, box-shadow 0.3s; }
        .product-card:hover { transform: translateY(-4px); box-shadow: 0 8px 25px rgba(0,0,0,0.12); }
        .product-name { font-size: 1.1rem; font-weight: 600; color: #2d3748; margin-bottom: 0.5rem; }
        .product-category { display: inline-block; background: rgba(123, 31, 162, 0.1); color: #7b1fa2; padding: 0.2rem 0.75rem; border-radius: 15px; font-size: 0.8rem; margin-bottom: 0.75rem; }
        .product-description { color: #718096; margin-bottom: 1rem; font-size: 0.9rem; line-height: 1.5; }
        .product-footer { display: flex; justify-content: space-between; align-items: center; }
        .product-price { font-size: 1.4rem; font-weight: bold; color: #d4af37; }
        .add-btn { background: linear-gradient(135deg, #7b1fa2 0%, #d4af37 100%); color: white; border: none; padding: 0.6rem 1.25rem; border-radius: 25px; cursor: pointer; font-weight: 600; transition: opacity 0.3s; }
        .add-btn:hover { opacity: 0.9; }
        
        footer { background: #4a148c; color: white; padding: 2rem 0; margin-top: 4rem; text-align: center; }
        footer p { color: rgba(255,255,255,0.7); }
        
        .about-section { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; margin: 4rem 0; }
        .about-card { text-align: center; padding: 2rem; background: white; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.08); }
        .about-card .icon { font-size: 2.5rem; margin-bottom: 1rem; }
        .about-card h3 { color: #4a148c; margin-bottom: 0.5rem; }
        .about-card p { color: #666; font-size: 0.95rem; }
    </style>
</head>
<body>
    <header>
        <div class="container">
            <div class="header-content">
                <a href="/" class="logo">💎 Crystal Jewelz</a>
                <nav>
                    <a href="/" class="filter-btn" style="color:white;border-color:rgba(255,255,255,0.5);background:transparent;">Home</a>
                </nav>
            </div>
        </div>
    </header>

    <main>
        <div class="container">
            <nav class="category-nav">
                ${cats.map((c, i) => `<a href="${slugs[i]}" class="filter-btn${activeCat === slugs[i] ? ' active' : ''}">${c}</a>`).join('\n                ')}
            </nav>
            ${content}
        </div>
    </main>

    <footer>
        <div class="container">
            <p>© 2026 Crystal Jewelz. Handcrafted with love ✨</p>
        </div>
    </footer>
</body>
</html>`;
}

// Category pages (server-side rendered)
const CATEGORIES = ['bracelets', 'necklaces', 'rings', 'earrings', 'anklets'];
CATEGORIES.forEach(cat => {
  app.get(`/${cat}`, async (req, res) => {
    try {
      const products = await getProducts();
      const categoryProducts = products.filter(p => p.category.toLowerCase() === cat.toLowerCase());
      const catTitle = cat.charAt(0).toUpperCase() + cat.slice(1);
      
      const productCards = categoryProducts.map(p => `
                <div class="product-card">
                    <div class="product-name">${p.name}</div>
                    <div class="product-category">${p.category}</div>
                    <div class="product-description">${p.description}</div>
                    <div class="product-footer">
                        <div class="product-price">$${p.price}</div>
                        <button class="add-btn">Add to Cart</button>
                    </div>
                </div>`).join('');
      
      const content = `
            <div class="category-header">
                <h1>✨ ${catTitle}</h1>
                <p class="category-count">${categoryProducts.length} products</p>
            </div>
            <div class="products-grid">
                ${productCards || '<p>No products in this category yet.</p>'}
            </div>`;
      
      res.send(renderPage(catTitle, content, `/${cat}`));
    } catch (err) {
      res.status(500).send(renderPage('Error', '<p>Failed to load products.</p>'));
    }
  });
});

app.get('/api/homepage', async (req, res) => {
  try {
    const homepage = await getHomepage();
    res.json(homepage);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch homepage' });
  }
});

// ==== CART ROUTES ====

app.get('/api/cart', async (req, res) => {
  try {
    const sessionId = req.sessionID;
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
    const sessionId = req.sessionID;
    if (!productId || !quantity) {
      return res.status(400).json({ error: 'productId and quantity required' });
    }
    const products = await getProducts();
    const product = products.find(p => p.id === parseInt(productId));
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    if (product.stock < quantity) {
      return res.status(400).json({ error: 'Insufficient stock' });
    }
    await addToCart(sessionId, parseInt(productId), parseInt(quantity));
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
    const sessionId = req.sessionID;
    if (quantity === undefined) {
      return res.status(400).json({ error: 'quantity required' });
    }
    await updateCartQuantity(sessionId, parseInt(productId), parseInt(quantity));
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
    const sessionId = req.sessionID;
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

app.get('/api/admin/products', requireAuth, csrfProtection, async (req, res) => {
  try {
    const products = await getProducts();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.post('/api/admin/products', requireAuth, csrfProtection, async (req, res) => {
  const { name, description, price, category, stock, image_url, featured } = req.body;
  
  if (!name || price === undefined) {
    return res.status(400).json({ error: 'Name and price required' });
  }
  
  try {
    const id = await addProduct({
      name,
      description: description || '',
      price: parseFloat(price),
      category: category || 'other',
      stock: parseInt(stock) || 0,
      image_url: image_url || '',
      featured: featured ? 1 : 0
    });
    res.json({ id, success: true });
  } catch (err) {
    console.error('Add product error:', err);
    res.status(500).json({ error: 'Failed to add product' });
  }
});

app.put('/api/admin/products/:id', requireAuth, csrfProtection, async (req, res) => {
  const { name, description, price, category, stock, image_url, featured } = req.body;
  
  try {
    await updateProduct(parseInt(req.params.id), {
      name,
      description: description || '',
      price: parseFloat(price),
      category: category || 'other',
      stock: parseInt(stock) || 0,
      image_url: image_url || '',
      featured: featured ? 1 : 0
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update product' });
  }
});

app.delete('/api/admin/products/:id', requireAuth, csrfProtection, async (req, res) => {
  try {
    await deleteProduct(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

app.get('/api/admin/homepage', requireAuth, async (req, res) => {
  try {
    const homepage = await getHomepage();
    res.json(homepage);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch homepage' });
  }
});

app.put('/api/admin/homepage', requireAuth, csrfProtection, async (req, res) => {
  const { banner_title, banner_subtitle, intro_text, featured_product_ids } = req.body;
  
  try {
    await updateHomepage({
      banner_title: banner_title || 'Crystal Jewelz',
      banner_subtitle: banner_subtitle || 'Handmade Jewelry',
      intro_text: intro_text || '',
      featured_product_ids: featured_product_ids || '[]'
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update homepage' });
  }
});

app.put('/api/admin/password', requireAuth, csrfProtection, async (req, res) => {
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
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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

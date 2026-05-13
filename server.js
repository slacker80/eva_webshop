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

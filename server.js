const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const { initDatabase, getProducts, addProduct, updateProduct, deleteProduct, getHomepage, updateHomepage, checkAdminLogin, updateAdminPassword } = require('./db-utils');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for correct client IPs behind reverse proxy
app.set('trust proxy', 1);

// Rate limiting (BEFORE routes)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000 // limit each IP to 1000 requests per windowMs
});
app.use(limiter);

// Middleware
app.use(helmet());
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret: 'crystal-jewelz-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.session.admin) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Initialize database on startup
initDatabase().catch(err => console.error('DB init error:', err));

// ==== PUBLIC ROUTES ====

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Get all products
app.get('/api/products', async (req, res) => {
  try {
    const products = await getProducts();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Get single product
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

// Get products by category
app.get('/api/products/category/:category', async (req, res) => {
  try {
    const products = await getProducts();
    const categoryProducts = products.filter(p => p.category === req.params.category);
    res.json(categoryProducts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Get homepage settings
app.get('/api/homepage', async (req, res) => {
  try {
    const homepage = await getHomepage();
    res.json(homepage);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch homepage' });
  }
});

// ==== ADMIN AUTH ROUTES ====

// Admin login page
app.get('/admin/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

// Admin login handler
app.post('/admin/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const valid = await checkAdminLogin(username, password);
    if (valid) {
      req.session.admin = true;
      res.json({ success: true });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Admin logout
app.get('/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

// Admin dashboard
app.get('/admin', (req, res) => {
  if (!req.session.admin) {
    return res.redirect('/admin/login');
  }
  res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});

// ==== ADMIN API ROUTES ====

// Get all products (admin)
app.get('/api/admin/products', requireAuth, async (req, res) => {
  try {
    const products = await getProducts();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Add product
app.post('/api/admin/products', requireAuth, async (req, res) => {
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
    res.status(500).json({ error: 'Failed to add product' });
  }
});

// Update product
app.put('/api/admin/products/:id', requireAuth, async (req, res) => {
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

// Delete product
app.delete('/api/admin/products/:id', requireAuth, async (req, res) => {
  try {
    await deleteProduct(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Get homepage settings (admin)
app.get('/api/admin/homepage', requireAuth, async (req, res) => {
  try {
    const homepage = await getHomepage();
    res.json(homepage);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch homepage' });
  }
});

// Update homepage settings
app.put('/api/admin/homepage', requireAuth, async (req, res) => {
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

// Update password
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

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Crystal Jewelz server running on port ${PORT}`);
});

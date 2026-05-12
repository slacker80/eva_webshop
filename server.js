const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for correct client IPs behind reverse proxy
app.set('trust proxy', 1);

// Rate limiting (BEFORE routes)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Middleware
app.use(helmet());
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// In-memory data storage
let products = [
  { id: 1, name: 'Eva Smart Watch', price: 299.99, description: 'Advanced fitness tracking with AI assistant', category: 'electronics', stock: 15 },
  { id: 2, name: 'Eva Wireless Earbuds', price: 149.99, description: 'Premium sound quality with noise cancellation', category: 'electronics', stock: 25 },
  { id: 3, name: 'Eva Yoga Mat', price: 49.99, description: 'Eco-friendly non-slip exercise mat', category: 'fitness', stock: 30 },
  { id: 4, name: 'Eva Water Bottle', price: 24.99, description: 'Insulated stainless steel, keeps drinks cold for 24h', category: 'fitness', stock: 50 },
  { id: 5, name: 'Eva Laptop Stand', price: 79.99, description: 'Ergonomic aluminum stand for better posture', category: 'accessories', stock: 20 }
];

let cart = [];

// Routes
// Get all products
app.get('/api/products', (req, res) => {
  res.json(products);
});

// Get single product
app.get('/api/products/:id', (req, res) => {
  const product = products.find(p => p.id === parseInt(req.params.id));
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }
  res.json(product);
});

// Get products by category
app.get('/api/products/category/:category', (req, res) => {
  const categoryProducts = products.filter(p => p.category === req.params.category);
  res.json(categoryProducts);
});

// Get cart
app.get('/api/cart', (req, res) => {
  res.json(cart);
});

// Add item to cart
app.post('/api/cart', (req, res) => {
  const { productId, quantity } = req.body;
  
  const product = products.find(p => p.id === productId);
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }
  
  if (product.stock < quantity) {
    return res.status(400).json({ error: 'Insufficient stock' });
  }
  
  const existingItem = cart.find(item => item.productId === productId);
  
  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    cart.push({
      productId,
      name: product.name,
      price: product.price,
      quantity
    });
  }
  
  res.json({ message: 'Item added to cart', cart });
});

// Update cart item
app.put('/api/cart/:productId', (req, res) => {
  const { productId } = req.params;
  const { quantity } = req.body;
  
  const item = cart.find(item => item.productId === parseInt(productId));
  if (!item) {
    return res.status(404).json({ error: 'Item not found in cart' });
  }
  
  if (quantity <= 0) {
    cart = cart.filter(item => item.productId !== parseInt(productId));
  } else {
    const product = products.find(p => p.id === parseInt(productId));
    if (product.stock < quantity) {
      return res.status(400).json({ error: 'Insufficient stock' });
    }
    item.quantity = quantity;
  }
  
  res.json({ message: 'Cart updated', cart });
});

// Remove item from cart
app.delete('/api/cart/:productId', (req, res) => {
  const productId = parseInt(req.params.productId);
  cart = cart.filter(item => item.productId !== productId);
  res.json({ message: 'Item removed from cart', cart });
});

// Clear cart
app.delete('/api/cart', (req, res) => {
  cart = [];
  res.json({ message: 'Cart cleared', cart });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Eva Webshop server running on port ${PORT}`);
});
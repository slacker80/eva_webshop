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
  max: 1000 // limit each IP to 1000 requests per windowMs
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
  // Bracelets
  { id: 1, name: 'Silver Beaded Bracelet', price: 24.99, description: 'Handcrafted with genuine silver beads', category: 'bracelets', stock: 8 },
  { id: 2, name: 'Gemstone Bracelet', price: 29.99, description: 'Mixed gemstones on elastic cord', category: 'bracelets', stock: 5 },
  { id: 3, name: 'Pearl Stretch Bracelet', price: 19.99, description: 'Elegant pearl beads', category: 'bracelets', stock: 12 },
  
  // Necklaces
  { id: 4, name: 'Crystal Pendant Necklace', price: 34.99, description: 'Handmade with Swarovski crystals', category: 'necklaces', stock: 6 },
  { id: 5, name: 'Boho Beaded Necklace', price: 27.99, description: 'Mixed wood and gemstone beads', category: 'necklaces', stock: 9 },
  { id: 6, name: 'Gold Chain Necklace', price: 39.99, description: '14K gold-plated chain with pendant', category: 'necklaces', stock: 4 },
  
  // Rings
  { id: 7, name: 'Gemstone Ring', price: 22.99, description: 'Adjustable ring with natural gemstone', category: 'rings', stock: 10 },
  { id: 8, name: 'Silver Spiral Ring', price: 18.99, description: 'Handmade sterling silver', category: 'rings', stock: 7 },
  
  // Anklets
  { id: 9, name: 'Beaded Anklet', price: 16.99, description: 'Colorful gemstone beads', category: 'anklets', stock: 14 },
  { id: 10, name: 'Gold Anklet', price: 21.99, description: 'Gold-plated with charm', category: 'anklets', stock: 8 },
  
  // Earrings
  { id: 11, name: 'Drop Pearl Earrings', price: 19.99, description: 'Elegant pearl drops', category: 'earrings', stock: 11 },
  { id: 12, name: 'Crystal Stud Earrings', price: 14.99, description: 'Sparkling crystal studs', category: 'earrings', stock: 15 }
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
  console.log(`Crystal Jewelz server running on port ${PORT}`);
});
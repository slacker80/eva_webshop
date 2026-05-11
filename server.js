const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);

const app = express();
const PORT = process.env.PORT || 3000;

// Database
const sequelize = require('./database');

// Session STORE
const sessionStore = new SequelizeStore({
  db: sequelize
});

// Middleware
app.use(helmet());
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP
});
app.use(limiter);

app.use(session({
  secret: process.env.SESSION_SECRET || 'SAFE_SECRET_FOR_DEV',
  store: sessionStore,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24h
}));

app.use(cors({
  origin: true, // Allow elke origin in dev
  credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize session store
sessionStore.sync();

// Models
const Product = require('./models/Product');
const CartModel = require('./models/Cart');

// Seed data
const seedProducts = require('./seed');

// Initialize database models and seed
sequelize.sync().then(async () => {
  console.log('Database gesynchroniseerd. Starten met seeden...');
  await seedProducts();
}).catch(err => {
  console.error('Fout bij synchronisatie van de database:', err);
});

// Routes
// Get all products
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.findAll();
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Get single product
app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findByPk(parseInt(req.params.id));
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// Get products by category
app.get('/api/products/category/:category', async (req, res) => {
  try {
    const categoryProducts = await Product.findAll({
      where: { category: req.params.category }
    });
    res.json(categoryProducts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch products by category' });
  }
});

// Get cart
app.get('/api/cart', async (req, res) => {
  try {
    const cartItems = await CartModel.findAll();
    res.json(cartItems);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch cart' });
  }
});

// Add item to cart
app.post('/api/cart', async (req, res) => {
  const { productId, quantity } = req.body;

  try {
    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (product.stock < quantity) {
      return res.status(400).json({ error: 'Insufficient stock' });
    }

    const [cartItem, created] = await CartModel.findOrCreate({
      where: { productId: productId },
      defaults: {
        name: product.name,
        price: product.price,
        quantity: quantity
      }
    });

    if (!created) {
      cartItem.quantity += quantity;
      await cartItem.save();
    }

    const cartItems = await CartModel.findAll();
    res.json({ message: 'Item added to cart', cart: cartItems });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add item to cart' });
  }
});

// Update cart item
app.put('/api/cart/:productId', async (req, res) => {
  const { productId } = req.params;
  const { quantity } = req.body;

  try {
    const cartItem = await CartModel.findOne({ where: { productId: parseInt(productId) } });
    if (!cartItem) {
      return res.status(404).json({ error: 'Item not found in cart' });
    }

    if (quantity <= 0) {
      await cartItem.destroy();
    } else {
      const product = await Product.findByPk(productId);
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      if (product.stock < quantity) {
        return res.status(400).json({ error: 'Insufficient stock' });
      }
      cartItem.quantity = quantity;
      await cartItem.save();
    }

    const cartItems = await CartModel.findAll();
    res.json({ message: 'Cart updated', cart: cartItems });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update cart item' });
  }
});

// Remove item from cart
app.delete('/api/cart/:productId', async (req, res) => {
  const productId = parseInt(req.params.productId);

  try {
    const cartItem = await CartModel.findOne({ where: { productId } });
    if (!cartItem) {
      return res.status(404).json({ error: 'Item not found in cart' });
    }

    await cartItem.destroy();

    const cartItems = await CartModel.findAll();
    res.json({ message: 'Item removed from cart', cart: cartItems });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove item from cart' });
  }
});

// Clear cart
app.delete('/api/cart', async (req, res) => {
  try {
    await CartModel.destroy({ where: {} }); // Verwijder alles
    res.json({ message: 'Cart cleared', cart: [] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear cart' });
  }
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Eva Webshop server running on port ${PORT}`);
});
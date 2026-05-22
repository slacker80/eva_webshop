# Fix Implementation Guide - Phase 1: Critical Path

## Quick Summary
This guide provides ready-to-copy code fixes for the 7 critical issues that prevent payments from working.

---

## FIX #1: Mount Payment Router in server.js

**Location:** server.js, after line 15 (after other imports)

**Add this code:**
```javascript
// Add after all other requires at the top
const paymentRouter = require('./backend/routes/payment');
```

**Then add this after app initialization (around line 130, before the homepage route):**
```javascript
// Mount payment routes
app.use(paymentRouter);
```

**Full context:**
```javascript
const express = require('express');
const cors = require('cors');
// ... other imports ...
const paymentRouter = require('./backend/routes/payment');  // ← ADD THIS

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for correct client IPs behind reverse proxy
app.set('trust proxy', 1);

// Rate limiting (BEFORE routes)
// ... rest of middleware ...

// Mount payment routes ← ADD THIS SECTION
app.use(paymentRouter);

// ==== PUBLIC ROUTES ====
```

**Why:** The payment router with `/pay` and `/webhook/mollie` endpoints is never connected to the main Express app, making payments impossible.

---

## FIX #2: Create .env File

**Location:** Create new file at project root: `.env`

**Content:**
```env
# Mollie Payment Gateway
MOLLIE_API_KEY=test_xxxxxxxxxxxxxxxxxxxxxxxxx
BASE_URL=https://crystaljewelz.nl

# Session & Security
SESSION_SECRET=your-very-secure-random-string-change-this-in-production
NODE_ENV=production

# Admin IP (optional, can be overridden)
ADMIN_IP=77.162.108.225

# Database (optional)
DATABASE_PATH=./database.db

# Server Port
PORT=3000
```

**How to get real Mollie API key:**
1. Go to https://www.mollie.com
2. Sign up for account
3. Get API key from dashboard
4. For testing, use `test_` prefix key

**Update .gitignore:**
Add to `.gitignore`:
```
.env
.env.local
*.db
node_modules/
```

**Why:** Environment variables should NEVER be hardcoded. Payment processing requires proper configuration.

---

## FIX #3: Fix Cart Field Names Mismatch

**Location:** db-utils.js, function `getCart()` (around line 170)

**Current code:**
```javascript
function getCart(sessionId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT c.id, c.product_id, c.quantity, p.name, p.price, p.stock FROM cart_items c JOIN products p ON c.product_id = p.id WHERE c.session_id = ? ORDER BY c.created_at DESC`,
      [sessionId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}
```

**Fixed code:**
```javascript
function getCart(sessionId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT c.id, c.product_id AS productId, c.quantity, p.name, p.price, p.stock FROM cart_items c JOIN products p ON c.product_id = p.id WHERE c.session_id = ? ORDER BY c.created_at DESC`,
      [sessionId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}
```

**Change made:** `c.product_id` → `c.product_id AS productId`

**Why:** Frontend JavaScript expects `item.productId` but backend was returning `item.product_id`, causing undefined references in updateQuantity() and removeFromCart().

---

## FIX #4: Fix and Export addOrder Function

**Location:** db-utils.js, at the end before module.exports

**Current broken code:**
```javascript
function addOrder(order) {
  return new Promise((resolve, reject) => {
    const totalAmount = order.total_amount || 0;
    db.run(
      'INSERT INTO orders (session_id, customer_name, customer_email, customer_address, total_amount, status) VALUES (?, ?, ?, ?, ?, ?)',
      [order.sessionId, order.name, order.email, order.address, totalAmount, 'completed'],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}
```

**Fixed code:**
```javascript
function addOrder(order) {
  return new Promise((resolve, reject) => {
    const totalAmount = order.totalAmount || order.total_amount || 0;
    db.run(
      'INSERT INTO orders (session_id, customer_name, customer_email, customer_address, total_amount, status) VALUES (?, ?, ?, ?, ?, ?)',
      [order.sessionId, order.name, order.email, order.address, totalAmount, 'pending'],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}
```

**Also ensure this is in module.exports (at bottom of file):**
```javascript
module.exports = {
  db,
  initDatabase,
  getProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  getHomepage,
  updateHomepage,
  checkAdminLogin,
  updateAdminPassword,
  getCart,
  addToCart,
  updateCartQuantity,
  removeFromCart,
  clearCart,
  addOrder,        // ← ADD THIS IF NOT PRESENT
  getOrders,       // ← ADD IF NOT PRESENT  
  getOrderById     // ← ADD IF NOT PRESENT
};
```

**Changes made:** 
1. Handle both `totalAmount` and `total_amount`
2. Set status to `'pending'` (not `'completed'` - it becomes completed when webhook confirms)
3. Ensure function is exported

**Why:** Without proper export, payment.js can't call this function and orders won't be saved.

---

## FIX #5: Create Email Module

**Location:** Create new file `backend/email.js`

**Content:**
```javascript
/**
 * Email module for order confirmations
 * TODO: Integrate with nodemailer or email service
 */

async function sendOrderConfirmation(email, order) {
  try {
    console.log(`📧 Order confirmation email queued for: ${email}`);
    console.log(`   Order ID: ${order.sessionId}`);
    console.log(`   Email: ${order.email}`);
    console.log(`   Total: $${order.totalAmount}`);
    
    // TODO: Implement real email sending here
    // For now, just log it
    return Promise.resolve();
  } catch (error) {
    console.error('Email sending error:', error);
    // Don't fail payment if email fails
    return Promise.resolve();
  }
}

module.exports = {
  sendOrderConfirmation
};
```

**Why:** Payment webhook calls this module which doesn't exist, causing crashes.

---

## FIX #6: Add Checkout Button to Cart

**Location:** public/index.html, in the `updateCartUI()` function

**Find this section (around line 500):**
```javascript
function updateCartUI() {
    const cartCount = document.getElementById('cartCount');
    const cartItems = document.getElementById('cartItems');
    const cartTotal = document.getElementById('cartTotal');

    // Update cart count
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    cartCount.textContent = totalItems;

    // Update cart items
    if (cart.length === 0) {
        cartItems.innerHTML = '<div class="empty-cart">Your cart is empty</div>';
        cartTotal.innerHTML = '';
    } else {
        // ... cart items rendering ...
        
        // Calculate total
        const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        cartTotal.innerHTML = `Total: $${total.toFixed(2)}`;
    }
}
```

**Replace with:**
```javascript
function updateCartUI() {
    const cartCount = document.getElementById('cartCount');
    const cartItems = document.getElementById('cartItems');
    const cartTotal = document.getElementById('cartTotal');

    // Update cart count
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    cartCount.textContent = totalItems;

    // Update cart items
    if (cart.length === 0) {
        cartItems.innerHTML = '<div class="empty-cart">Your cart is empty</div>';
        cartTotal.innerHTML = '';
    } else {
        cartItems.innerHTML = cart.map(item => `
            <div class="cart-item">
                <div class="cart-item-info">
                    <div>${item.name}</div>
                    <div>$${item.price} each</div>
                </div>
                <div class="cart-item-controls">
                    <button class="quantity-btn" onclick="updateQuantity(${item.productId}, -1)">-</button>
                    <span>${item.quantity}</span>
                    <button class="quantity-btn" onclick="updateQuantity(${item.productId}, 1)">+</button>
                    <button class="quantity-btn" onclick="removeFromCart(${item.productId})" 
                            style="background: #ff6b6b; margin-left: 0.5rem;">✕</button>
                </div>
            </div>
        `).join('');

        // Calculate total
        const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        cartTotal.innerHTML = `
            <div style="margin-top: 1rem; padding-top: 1rem; border-top: 2px solid #d4af37;">
                <div style="font-size: 1.2rem; font-weight: bold; text-align: right; margin-bottom: 1rem;">
                    Total: $${total.toFixed(2)}
                </div>
                <button onclick="proceedToCheckout()" style="width: 100%; padding: 0.75rem; background: linear-gradient(135deg, #7b1fa2 0%, #d4af37 100%); color: white; border: none; border-radius: 25px; font-weight: bold; cursor: pointer; font-size: 1rem;">
                    🛒 Proceed to Checkout
                </button>
            </div>
        `;
    }
}

function proceedToCheckout() {
    window.location.href = '/checkout.html';
}
```

**Why:** Users need a clear path from cart to checkout to payment.

---

## FIX #7: Update Payment.js to Calculate Total

**Location:** backend/routes/payment.js, in the `/pay` route

**Find:**
```javascript
const amountValue = cart.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2);
```

**Ensure the metadata includes totalAmount:**
```javascript
const amountValue = cart.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2);

const payment = await mollie.payments.create({
  amount: {
    currency: 'EUR',
    value: amountValue
  },
  description: `Crystal Jewelz order for ${name}`,
  redirectUrl: `${process.env.BASE_URL}/payment-result`,
  webhookUrl: `${process.env.BASE_URL}/webhook/mollie`,
  metadata: {
    sessionId: req.sessionID,
    name: name,
    email: email,
    address: address,
    totalAmount: parseFloat(amountValue)  // ← ADD THIS
  }
});
```

**Why:** The total amount needs to be passed to the order object.

---

## DEPLOYMENT CHECKLIST

After applying all 7 fixes:

- [ ] Create `.env` file with real Mollie API key
- [ ] Run `npm install` to ensure all dependencies
- [ ] Test add to cart: `GET /api/products` → item in cart
- [ ] Test cart modal: Click cart icon, see items with correct product names
- [ ] Test quantity update: Change quantity, verify in cart
- [ ] Test checkout redirect: Click "Proceed to Checkout", should go to `/checkout.html`
- [ ] Test Mollie integration: Submit checkout form, should redirect to Mollie payment page
- [ ] Check database: Order should be created after payment
- [ ] Check logs: "Order confirmation email sent" should appear

---

## VERIFICATION COMMANDS

```bash
# Check if payment routes are defined
grep -n "router.post('/pay'" backend/routes/payment.js

# Check if payment router is mounted
grep -n "paymentRouter\|require.*payment" server.js

# Check if addOrder is exported
grep -n "addOrder" db-utils.js | tail -2

# Check if .env exists
ls -la .env

# Test cart API
curl http://localhost:3000/api/cart

# Check logs for Mollie errors
npm start 2>&1 | grep -i mollie
```

---

## TROUBLESHOOTING

### "Cannot find module @mollie/api-client"
```bash
npm install @mollie/api-client
```

### "MOLLIE_API_KEY is undefined"
- Check `.env` file exists
- Check MOLLIE_API_KEY line is not commented
- Restart server after creating .env

### Cart items show undefined names
- Apply FIX #3 (product_id → productId)

### "addOrder is not a function"
- Apply FIX #4 (ensure export)

### Checkout button doesn't appear
- Apply FIX #6 (updateCartUI function)


# Eva Webshop - Implementation Steps for Mollie Payments Fix

## Quick Reference - What Needs Fixing

### 1. Server Integration (server.js)

**Add these lines after existing routes, around line 380:**

```javascript
// Import payment routes (add at top with other requires)
const paymentRouter = require('./backend/routes/payment');

// Mount payment routes (add after other app.use() calls)
app.use('/', paymentRouter);
```

---

### 2. Install Missing Dependency

```bash
npm install @mollie/api-client
```

---

### 3. Fix Cart Modal - Add Checkout Button

**File:** `/public/index.html`  
**Find:** The `updateCartUI()` function around line 700  
**Replace/Add:**

```javascript
function updateCartUI() {
  const itemsContainer = document.getElementById('cartItems');
  
  if (cart.length === 0) {
    itemsContainer.innerHTML = '<div class="empty-cart">Your cart is empty</div>';
    document.getElementById('cartTotal').innerHTML = '';
    return;
  }

  const itemsHTML = cart.map(item => `
    <div class="cart-item">
      <div class="cart-item-info">
        <div style="font-weight: bold;">${item.name}</div>
        <div style="color: #718096; font-size: 0.9rem;">$${item.price} × ${item.quantity}</div>
      </div>
      <div class="cart-item-controls">
        <button class="quantity-btn" onclick="updateQuantity(${item.productId}, -1)">−</button>
        <span>${item.quantity}</span>
        <button class="quantity-btn" onclick="updateQuantity(${item.productId}, 1)">+</button>
        <button style="background: #ff6b6b; width: auto; border-radius: 4px; padding: 0.5rem;" 
                onclick="removeFromCart(${item.productId})">Remove</button>
      </div>
    </div>
  `).join('');

  itemsContainer.innerHTML = itemsHTML;

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2);
  document.getElementById('cartTotal').innerHTML = `
    <div style="margin-bottom: 1.5rem;">
      <strong>Total:</strong> $${total}
    </div>
    <button onclick="goToCheckout()" 
            style="width: 100%; padding: 0.75rem; background: linear-gradient(135deg, #7b1fa2 0%, #d4af37 100%); 
                   color: white; border: none; border-radius: 25px; font-weight: 600; cursor: pointer; margin-bottom: 0.5rem;">
      Proceed to Checkout
    </button>
    <button onclick="continueShopping()" 
            style="width: 100%; padding: 0.75rem; background: white; color: #7b1fa2; border: 2px solid #7b1fa2; 
                   border-radius: 25px; font-weight: 600; cursor: pointer;">
      Continue Shopping
    </button>
  `;
}

// Add these helper functions
function goToCheckout() {
  window.location.href = '/checkout';
}

function continueShopping() {
  document.getElementById('cartModal').style.display = 'none';
}
```

---

### 4. Fix Database - Add Order Functions

**File:** `/db-utils.js`  
**Add these functions after existing cart functions (around line 250):**

```javascript
// Order functions
function addOrder(orderData) {
  return new Promise((resolve, reject) => {
    const { sessionId, name, email, address, totalAmount, items } = orderData;
    
    db.run(
      `INSERT INTO orders (session_id, customer_name, customer_email, customer_address, total_amount, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [sessionId, name, email, address, totalAmount, 'completed'],
      function(err) {
        if (err) {
          reject(err);
          return;
        }
        const orderId = this.lastID;
        
        // Insert order items
        if (items && items.length > 0) {
          items.forEach(item => {
            db.run(
              `INSERT INTO order_items (order_id, product_id, quantity, price)
               VALUES (?, ?, ?, ?)`,
              [orderId, item.productId, item.quantity, item.price]
            );
          });
        }
        
        resolve(orderId);
      }
    );
  });
}

function getOrder(orderId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM orders WHERE id = ?`,
      [orderId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
}

function updateOrderStatus(orderId, status) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, orderId],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

// Export these functions
module.exports = {
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
  addOrder,        // NEW
  getOrder,        // NEW
  updateOrderStatus // NEW
};
```

---

### 5. Fix Payment Routes - Webhook Handler

**File:** `/backend/routes/payment.js`  
**Replace the webhook handler:**

```javascript
// Mollie webhook handler - FIXED VERSION
router.post('/webhook/mollie', express.json(), async (req, res) => {
  try {
    // Mollie sends the payment ID as a form-encoded POST parameter 'id'
    const paymentId = req.body.id;
    
    if (!paymentId) {
      console.warn('Webhook received without payment ID');
      return res.status(400).send('Missing payment id');
    }

    const payment = await mollie.payments.get(paymentId);
    
    console.log(`Webhook received for payment ${paymentId}, status: ${payment.status}`);

    // Only process if payment is actually paid
    if (payment.isPaid()) {
      const metadata = payment.metadata || {};
      const sessionId = metadata.sessionId;

      if (!sessionId) {
        console.warn(`Payment ${paymentId} has no session metadata`);
        return res.status(200).send('OK');
      }

      try {
        // Get current cart
        const cart = await getCart(sessionId);
        const { addOrder } = require('../db-utils');
        
        // Calculate total
        const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        // Save order
        const orderId = await addOrder({
          sessionId: sessionId,
          name: metadata.name || 'Unknown',
          email: metadata.email || 'unknown@example.com',
          address: metadata.address || 'Unknown',
          totalAmount: totalAmount,
          items: cart
        });

        // Send confirmation email
        try {
          await sendOrderConfirmation(metadata.email, {
            orderId: orderId,
            name: metadata.name,
            email: metadata.email,
            address: metadata.address,
            items: cart,
            totalAmount: totalAmount
          });
        } catch (emailErr) {
          console.error('Failed to send confirmation email:', emailErr);
          // Don't fail the webhook, email is optional
        }

        // Clear the cart
        await clearCart(sessionId);
        console.log(`Order ${orderId} created and cart cleared for session ${sessionId}`);
      } catch (err) {
        console.error('Failed to process order:', err);
        // Still return 200 so Mollie doesn't retry
      }
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook processing error:', err);
    res.status(200).send('OK'); // Always return 200 to prevent Mollie retries
  }
});
```

---

### 6. Fix Checkout Form Error Handling

**File:** `/public/checkout.html`  
**Replace the form submission script:**

```javascript
<script>
  document.getElementById('checkoutForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const msgDiv = document.createElement('div');
    msgDiv.id = 'statusMessage';
    msgDiv.style.cssText = 'margin: 1rem 0; padding: 1rem; border-radius: 4px; text-align: center;';
    
    btn.parentNode.insertBefore(msgDiv, btn.nextSibling);
    btn.disabled = true;
    btn.textContent = 'Verwerken...';

    const data = {
      name: e.target.name.value.trim(),
      email: e.target.email.value.trim(),
      address: e.target.address.value.trim()
    };

    try {
      const res = await fetch('/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (res.ok) {
        const json = await res.json();
        msgDiv.innerHTML = '<p style="color: green;">Omgeleid naar betaalportaal...</p>';
        setTimeout(() => {
          window.location.href = json.paymentUrl;
        }, 1000);
      } else {
        const err = await res.json();
        msgDiv.innerHTML = `<p style="color: red;">Fout: ${err.error || 'Onbekende fout'}</p>`;
        btn.disabled = false;
        btn.textContent = 'Betaal via iDEAL';
      }
    } catch (error) {
      msgDiv.innerHTML = '<p style="color: red;">Netwerkfout, probeer het opnieuw.</p>';
      btn.disabled = false;
      btn.textContent = 'Betaal via iDEAL';
    }
  });
</script>
```

---

### 7. Create .env Configuration

**File:** Create `.env` (not in git):**

```bash
# Server
PORT=3000
NODE_ENV=production

# Session
SESSION_SECRET=your-secret-key-here-change-this

# Mollie
MOLLIE_API_KEY=test_xxxxxxxxxxxxxxxxxxxxxxxxxx
BASE_URL=http://localhost:3000

# SMTP (Email)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@crystaljewelz.nl
SMTP_PASS=your-email-password
SMTP_FROM=Crystal Jewelz <noreply@crystaljewelz.nl>
```

---

### 8. Update .env.example

**File:** `/. env.example`

```bash
# Server Configuration
PORT=3000
NODE_ENV=production

# Session Management
SESSION_SECRET=your-secret-key-here

# Mollie Payments
MOLLIE_API_KEY=test_your_mollie_key_here
BASE_URL=http://localhost:3000

# Email Configuration (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@crystaljewelz.nl

# Admin Settings
ADMIN_USERNAME=admin
ADMIN_PASSWORD=changeme
```

---

## Testing Checklist

- [ ] `npm install` completes successfully
- [ ] `npm start` starts without errors
- [ ] Server logs show payment routes mounted
- [ ] Can add items to cart
- [ ] Cart modal shows "Proceed to Checkout" button
- [ ] Checkout form loads at `/checkout`
- [ ] Can submit checkout form
- [ ] Redirected to Mollie payment page
- [ ] Payment test succeeds
- [ ] Order saved in database
- [ ] Confirmation email sent (if SMTP configured)
- [ ] Cart cleared after payment

---

## Environment Variables Setup for Production

1. Get Mollie API key from https://mollie.com
2. Configure SMTP with email provider (Gmail, SendGrid, etc.)
3. Set proper `BASE_URL` for your domain
4. Update `SESSION_SECRET` with cryptographically secure value

```bash
# Generate secure session secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Verification

After applying all fixes:

```bash
# Reinstall dependencies
npm install

# Start server
npm start

# Server should show:
# ✓ Payment routes mounted
# ✓ Database initialized
# ✓ Listening on port 3000
```

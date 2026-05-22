# Detailed Review: Eva Webshop - Shopping Cart & Mollie Payments Integration

## Executive Summary
The Eva Webshop has a functional shopping cart system and Mollie payment integration, but there are several critical issues, architectural concerns, and security gaps that need to be addressed. The review identifies 8 major issues and 12 improvements needed.

---

## 1. CRITICAL ISSUES FOUND

### 1.1 **Payment Routes Not Integrated Into Main Server** ⚠️ CRITICAL
**File:** `server.js`, `backend/routes/payment.js`  
**Issue:** The payment routes defined in `/backend/routes/payment.js` are NEVER mounted in `server.js`.
- The `/pay` endpoint is not accessible
- The `/webhook/mollie` endpoint will never receive webhooks
- Users cannot complete purchases

**Impact:** Payments completely non-functional

**Fix Required:**
```javascript
// Add to server.js (after app initialization)
const paymentRouter = require('./backend/routes/payment');
app.use(paymentRouter);
```

---

### 1.2 **Missing Environment Variables** ⚠️ CRITICAL
**File:** `backend/routes/payment.js`  
**Issue:** 
- `process.env.MOLLIE_API_KEY` - Not defined anywhere
- `process.env.BASE_URL` - Not defined anywhere
- No `.env` file exists in the repository

**Impact:** Payment integration will crash without proper environment setup

**Fix Required:**
Create `.env` file:
```
MOLLIE_API_KEY=test_xxxxx
BASE_URL=https://crystaljewelz.nl
SESSION_SECRET=your-secure-secret-here
NODE_ENV=production
```

---

### 1.3 **Session-Based Cart Identifier Inconsistency** 🔴 HIGH
**Files:** `server.js`, `public/index.html`, `backend/routes/payment.js`  
**Issue:**
- Cart uses `req.sessionID` (express-session)
- Payment metadata stores `sessionId: req.sessionID`
- But JavaScript client doesn't have access to `sessionID`
- When webhook processes payment, `payment.metadata.sessionId` may not match the current request sessionID

**Impact:** 
- Orphaned carts after purchase
- Potential cart data loss
- Multiple sessions for same user cause confusion

**Code Example - Problem:**
```javascript
// payment.js
metadata: {
  sessionId: req.sessionID,  // Server sessionID
  name: name,
  email: email,
  address: address
}

// Later in webhook - how do we know which user?
if (sessionId) {
  await clearCart(sessionId);
}
```

---

### 1.4 **Cart Item Object Structure Mismatch** 🔴 HIGH
**Files:** `server.js`, `public/index.html`  
**Issue:** Frontend expects different field names than backend returns

**Backend returns (db-utils.js:getCart):**
```javascript
SELECT c.id, c.product_id, c.quantity, p.name, p.price, p.stock
// Returns: { id, product_id, quantity, name, price, stock }
```

**Frontend expects:**
```javascript
// In index.html updateCartUI()
item.productId  // But backend returns product_id
item.name
item.price
item.quantity
```

**Impact:** Quantity updates and removal will fail silently

**Code That Breaks:**
```javascript
// index.html line ~600
async function updateQuantity(productId, change) {
  const item = cart.find(item => item.productId === productId);
  // ^^^ This will always be undefined! productId vs product_id
```

---

### 1.5 **Duplicate Fallback Error Handling** 🔴 HIGH
**File:** `public/index.html`  
**Issue:** Every API call has try-catch with identical fallback code repeated 4+ times:
```javascript
catch (err) {
  const fallback = [{id:1,...}];
  products=fallback;
  displayProducts();
}
```

This is **dead code** - if loadProducts catches, displayProducts is already called at line 1, then fallback does it again. Creates:
- Memory bloat
- Confusion about actual error handling
- No logging of actual errors

---

### 1.6 **Cart Checkout Flow Completely Disconnected** 🔴 HIGH
**Issue:** There's a `/checkout.html` that POSTs to `/pay` endpoint, but:
- No link from the cart to checkout
- Checkout page is orphaned
- Users cannot reach it to pay
- Cart modal doesn't have a "Proceed to Checkout" button

**Impact:** Users can add items but have zero path to purchase

---

### 1.7 **CORS Configuration Is Too Permissive** 🟠 MEDIUM
**File:** `server.js`  
**Issue:**
```javascript
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 
           'https://crystaljewelz.nl', 'http://77.42.93.211:3000'],
  credentials: true
}));
```

- Public IP (77.42.93.211) exposed in source code
- Allows credentials with specific origins - good, but HTTP on production IP is risky
- Should use environment variables

---

### 1.8 **No Order Persistence After Payment** 🟠 MEDIUM
**File:** `backend/routes/payment.js`  
**Issue:** Webhook clears cart but doesn't properly create order:
```javascript
try {
  const { addOrder } = require('../db-utils');
  await addOrder(order);
```

But `addOrder` is NEVER EXPORTED from `db-utils.js`. It only exports `addOrder` in db-utils but the function signature doesn't match:

**db-utils.js:**
```javascript
function addOrder(order) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO orders ... VALUES (?, ?, ?, ?, ?, ?)',
      [order.sessionId, order.name, order.email, order.address, totalAmount, 'completed'],
      // ^^^ Missing totalAmount in order object!
```

---

## 2. ARCHITECTURE & DESIGN ISSUES

### 2.1 **Client-Server Mismatch in Cart Field Names**
The API returns `product_id` but JavaScript expects `productId`. 

**Fix:** Standardize on camelCase in API responses or snake_case everywhere.

---

### 2.2 **No Order Items Saved**
Order is created but individual items are never saved to `order_items` table.

**Issue:** After payment, we don't know what was purchased (only total amount).

**Fix:** Add function to save cart items to `order_items` table.

---

### 2.3 **Session-Based Carts Don't Scale**
Using `req.sessionID` for cart association is fine for single-server, but:
- No user accounts/login for customers
- Sessions expire
- Carts are lost after session timeout
- No recovery mechanism

---

### 2.4 **Email Module Missing**
**File:** `backend/routes/payment.js`  
**Issue:**
```javascript
const { sendOrderConfirmation } = require('../email');
```

This module doesn't exist. Webhook will crash if email sending is triggered.

---

## 3. SECURITY ISSUES

### 3.1 **Session Secret Is Hardcoded Fallback**
```javascript
session({
  secret: process.env.SESSION_SECRET || 'fallback-for-dev',
  // ^^^ Hardcoded fallback in production
})
```

### 3.2 **IP Whitelist Can Be Bypassed** 
Uses `req.ip` which is spoofable behind proxy. Should use `X-Forwarded-For` or trust proxy properly.

### 3.3 **No CSRF Protection on Cart Operations**
Cart POST/PUT/DELETE endpoints don't use CSRF protection (only admin routes do).

### 3.4 **Database Path Not Secure**
Database file is in project root, accessible if webroot is misconfigured.

### 3.5 **No Input Validation on Checkout**
Name, email, address are sent directly to metadata without validation.

---

## 4. PAYMENT INTEGRATION ISSUES

### 4.1 **Mollie API Key Not Validated**
No check if API key is valid or if Mollie is accessible before attempting to create payment.

### 4.2 **Payment Status Not Tracked in Database**
Orders have `status` field but webhook doesn't properly update it. Payment object states are never recorded.

### 4.3 **Webhook Doesn't Validate Mollie Request**
No signature verification. Any request to `/webhook/mollie` with an ID can process a payment.

**Should add:**
```javascript
// Verify Mollie signature
const signature = req.headers['x-mollie-webhook-secret'];
```

### 4.4 **No Retry Logic for Failed Payments**
If webhook fails, there's no recovery mechanism. Payment succeeds but order isn't saved.

---

## 5. DATABASE ISSUES

### 5.1 **Incorrect Query in addOrder**
The `totalAmount` isn't passed in the order object:
```javascript
function addOrder(order) {
  const totalAmount = order.total_amount || 0;  // Never set!
```

### 5.2 **No Indexes on Foreign Keys**
Cart and order tables reference products but have no indexes. Queries will be slow.

### 5.3 **Session IDs Never Cleaned Up**
Cart items accumulate forever with expired sessions.

---

## 6. UX/FLOW ISSUES

### 6.1 **No "Go to Checkout" Button**
Cart modal doesn't have a checkout button. Users must manually navigate.

### 6.2 **Payment Success Page Is Generic**
`payment-result.html` doesn't show order details or confirmation number.

### 6.3 **No Error Messages for Users**
Payment fails silently. Users see "Verwerken..." forever.

---

## FIX PLAN (Priority Order)

### Phase 1: Critical (Fixes payments entirely) - 2-3 hours
1. **Mount payment routes in server.js** - 5 min
2. **Add .env file with Mollie credentials** - 5 min  
3. **Fix cart field names (product_id → productId)** - 15 min
4. **Fix addOrder function signature and exports** - 20 min
5. **Add checkout button to cart modal** - 10 min
6. **Create email module stub** - 10 min
7. **Fix cart reference in addToCart** - 10 min

### Phase 2: High Priority (Payment reliability) - 2-3 hours
8. **Validate Mollie API key on startup** - 15 min
9. **Add webhook signature verification** - 20 min
10. **Add order_items save logic** - 20 min
11. **Improve error logging and user feedback** - 20 min
12. **Add database indexes** - 15 min

### Phase 3: Medium Priority (Security & UX) - 2-3 hours
13. **Add CSRF to cart operations** - 15 min
14. **Fix environment variable usage** - 10 min
15. **Add input validation** - 15 min
16. **Enhance payment-result page** - 15 min
17. **Add session cleanup/expiry** - 20 min

---

## CODE SUGGESTIONS

### Fix 1: Mount Payment Router (server.js)
```javascript
// Add after app initialization, before routes
const paymentRouter = require('./backend/routes/payment');
app.use(paymentRouter);
```

### Fix 2: Fix Cart Field Names (db-utils.js)
Return consistent camelCase:
```javascript
function getCart(sessionId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT c.id, c.product_id as productId, c.quantity, p.name, 
              p.price, p.stock FROM cart_items c 
       JOIN products p ON c.product_id = p.id 
       WHERE c.session_id = ? ORDER BY c.created_at DESC`,
      [sessionId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}
```

### Fix 3: Create Email Module (backend/email.js)
```javascript
// Stub for now, implement later
async function sendOrderConfirmation(email, order) {
  console.log(`Order confirmation sent to ${email} for order ${order.sessionId}`);
  // TODO: Implement with nodemailer or email service
  return Promise.resolve();
}

module.exports = { sendOrderConfirmation };
```

### Fix 4: Fix addOrder Export (db-utils.js)
```javascript
function addOrder(order) {
  // order object should include totalAmount
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO orders (session_id, customer_name, customer_email, customer_address, total_amount, status) VALUES (?, ?, ?, ?, ?, ?)',
      [order.sessionId, order.name, order.email, order.address, order.totalAmount || 0, 'pending'],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

// Add to exports
module.exports = {
  // ... existing exports
  addOrder,
};
```

### Fix 5: Add Checkout Button (public/index.html)
In the `updateCartUI()` function, add before `cartTotal`:
```javascript
if (cart.length > 0) {
  const checkoutBtn = document.createElement('button');
  checkoutBtn.textContent = 'Proceed to Checkout';
  checkoutBtn.style.cssText = 'width:100%;padding:1rem;background:linear-gradient(135deg,#7b1fa2,#d4af37);color:white;border:none;border-radius:8px;font-weight:bold;cursor:pointer;margin-top:1rem;';
  checkoutBtn.onclick = () => window.location.href = '/checkout.html';
  cartItems.appendChild(checkoutBtn);
}
```

### Fix 6: Add .env File
```
MOLLIE_API_KEY=test_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
BASE_URL=https://crystaljewelz.nl
SESSION_SECRET=super-secret-key-change-in-production
NODE_ENV=production
```

### Fix 7: Update .gitignore
```
.env
*.db
node_modules/
```

---

## TESTING CHECKLIST

- [ ] Can mount payment routes without errors
- [ ] Mollie API key loads correctly from .env
- [ ] Add item to cart → cart count updates
- [ ] Update quantity → cart total recalculates  
- [ ] Remove item → cart reflects change
- [ ] Click "Proceed to Checkout" → redirects to checkout.html
- [ ] Fill checkout form → payment page opens
- [ ] Webhook receives payment confirmation
- [ ] Order saved to database
- [ ] Cart cleared after successful payment
- [ ] Order confirmation email sent (logged)

---

## DEPENDENCIES VERIFIED
- ✅ `@mollie/api-client` - installed
- ✅ `express-session` - installed  
- ✅ `sqlite3` - installed
- ❌ `nodemailer` - NOT installed (needed for emails)

---

## RECOMMENDED NEXT STEPS

1. **Immediate:** Apply Phase 1 fixes (critical path to functional payments)
2. **Short term:** Apply Phase 2 fixes (payment reliability)
3. **Medium term:** Apply Phase 3 fixes (security hardening)
4. **Long term:** 
   - Add user accounts/authentication
   - Implement order history
   - Add admin order management dashboard
   - Implement email templates


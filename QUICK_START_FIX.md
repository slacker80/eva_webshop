# Quick Start: Fix Eva Webshop Payments in 30 Minutes

## 🚀 The 3 Most Critical Fixes (Do These First!)

### Fix #1: Mount Payment Router (5 minutes)
**File:** `server.js`

Find line 15, add:
```javascript
const paymentRouter = require('./backend/routes/payment');
```

Find line ~130 (before `app.get('/', ...)`, add:
```javascript
// Mount payment routes
app.use(paymentRouter);
```

**Test:** `curl http://localhost:3000/pay` should return 405 (method not allowed), not 404

---

### Fix #2: Create .env File (2 minutes)
**File:** Create `/.env` at project root

```env
MOLLIE_API_KEY=test_xxxxxxxxxxxxxxxxxxxxxxxx
BASE_URL=https://crystaljewelz.nl
SESSION_SECRET=dev-secret-change-in-production
NODE_ENV=production
PORT=3000
```

**Test:** `grep MOLLIE .env` should show your key

---

### Fix #3: Fix Cart Field Names (8 minutes)
**File:** `db-utils.js`

Find `SELECT c.id, c.product_id, c.quantity...` around line 170

Change to:
```javascript
SELECT c.id, c.product_id AS productId, c.quantity...
                 ^^^^^^^^^^^^^^^^^^^
```

**Test:** Add item to cart, open DevTools console, cart should show items with product names

---

## ⚡ The 4 Additional Fixes (Do Next!)

### Fix #4: Export addOrder (5 minutes)
**File:** `db-utils.js` - at the very end

Add to `module.exports`:
```javascript
addOrder,
getOrders,
getOrderById
```

---

### Fix #5: Create Email Module (3 minutes)
**File:** Create `backend/email.js`

```javascript
async function sendOrderConfirmation(email, order) {
  console.log(`📧 Email to ${email} for order ${order.sessionId}`);
  return Promise.resolve();
}
module.exports = { sendOrderConfirmation };
```

---

### Fix #6: Add Checkout Button (4 minutes)
**File:** `public/index.html`

Find `cartTotal.innerHTML = \`Total: $` around line 580

Replace the entire section with:
```javascript
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

function proceedToCheckout() {
  window.location.href = '/checkout.html';
}
```

---

### Fix #7: Pass Total Amount (3 minutes)
**File:** `backend/routes/payment.js`

In the `metadata` object around line 30, add:
```javascript
metadata: {
  sessionId: req.sessionID,
  name: name,
  email: email,
  address: address,
  totalAmount: parseFloat(amountValue)  // ← ADD THIS
}
```

---

## ✅ Verification

After fixes, test:

```bash
# 1. Start server
npm start

# 2. In browser console:
# - Open DevTools (F12)
# - Add item to cart
# - Click cart icon
# - Should see item name, quantity controls, total, and "Proceed to Checkout" button

# 3. In terminal:
# - Should NOT see "Cannot find module" errors
# - Should see "Database initialized" 

# 4. Click "Proceed to Checkout"
# - Should navigate to /checkout.html

# 5. Fill form and submit
# - Should redirect to Mollie payment page (or show error if API key is test key)
```

---

## 🎯 Did It Work?

### Success ✅
- ✅ Cart shows items correctly
- ✅ Quantity buttons work
- ✅ Remove button works
- ✅ "Proceed to Checkout" button visible
- ✅ No console errors
- ✅ Payment page loads (or correct Mollie error)

### Issues? Try This:

**"Cart items showing undefined names"**
→ Did you apply Fix #3? Check that your database query has `AS productId`

**"Proceed to Checkout button missing"**
→ Did you apply Fix #6? Check `cartTotal.innerHTML` in index.html

**"Cannot find module @mollie/api-client"**
→ Run: `npm install @mollie/api-client`

**"MOLLIE_API_KEY is undefined"**
→ Did you create `.env` file? Restart the server after creating it.

---

## 📊 Time Breakdown

| Step | Time | Difficulty |
|------|------|------------|
| Fix #1: Mount Router | 5 min | 🟢 Easy |
| Fix #2: Create .env | 2 min | 🟢 Easy |
| Fix #3: Cart Fields | 8 min | 🟡 Medium |
| Fix #4: Export | 5 min | 🟢 Easy |
| Fix #5: Email | 3 min | 🟢 Easy |
| Fix #6: Button | 4 min | 🟡 Medium |
| Fix #7: Total | 3 min | 🟢 Easy |
| **Total** | **30 min** | **Quick Win** |

---

## 🚀 Next (After Quick Fix Works)

1. Get real Mollie API key from https://www.mollie.com
2. Replace `test_` key in `.env` with production key
3. Read `DETAILED_REVIEW.md` for security/reliability improvements
4. Apply Phase 2 & 3 fixes for production-ready system

---

## 📞 Still Broken?

See `DETAILED_REVIEW.md` for comprehensive troubleshooting and full analysis.

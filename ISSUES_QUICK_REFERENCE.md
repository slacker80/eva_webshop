# Eva Webshop - Issues Quick Reference

## 🔴 CRITICAL - Payment Not Working

### Issue #1: Payment Routes Not Mounted
**File:** `server.js`  
**Problem:** Routes in `/backend/routes/payment.js` exist but are never imported/used  
**Fix:**
```javascript
// Add at top of server.js
const paymentRouter = require('./backend/routes/payment');

// Add after other app.use() calls
app.use('/', paymentRouter);
```
**Verify:** `npm start` should show routes are registered

---

### Issue #2: Missing Mollie Dependency
**File:** `package.json`  
**Problem:** `@mollie/api-client` listed but not installed  
**Fix:**
```bash
npm install @mollie/api-client
```
**Verify:** `npm list | grep mollie` shows installed

---

## 🟠 HIGH PRIORITY - Cannot Complete Purchase

### Issue #3: No Checkout Button in Cart
**File:** `/public/index.html`  
**Problem:** Cart shows items but no way to proceed to payment  
**Fix:** Add checkout button in `updateCartUI()` function:
```javascript
<button onclick="goToCheckout()" class="checkout-btn">
  Proceed to Checkout
</button>

function goToCheckout() {
  window.location.href = '/checkout';
}
```
**Verify:** Button appears in cart modal and works

---

### Issue #4: Missing Order Database Functions
**File:** `/db-utils.js`  
**Problem:** `addOrder()` called but never defined  
**Fix:** Add these functions:
```javascript
function addOrder(orderData) {
  // INSERT order into database
  // INSERT order items
  // RETURN orderId
}

// Export it in module.exports
```
**See:** `FIX_IMPLEMENTATION_STEPS.md` for full code

---

### Issue #5: Webhook Handler Broken
**File:** `/backend/routes/payment.js`  
**Problem:** Webhook won't properly save orders or send emails  
**Fix:** Replace webhook handler (see `FIX_IMPLEMENTATION_STEPS.md`)  
**Verify:** Webhook signature checks Mollie database for payment status

---

## 🟡 MEDIUM PRIORITY - Bad User Experience

### Issue #6: Cart Error Handling Broken
**File:** `/public/index.html`  
**Problem:** Catch blocks reset products instead of showing errors  
**Fix:** Replace error handlers to show error messages, not fallback data

---

### Issue #7: No Feedback During Payment
**File:** `/public/checkout.html`  
**Problem:** No loading spinner, no error messages  
**Fix:** Add status div + button feedback (see `FIX_IMPLEMENTATION_STEPS.md`)

---

### Issue #8: Missing Environment Configuration
**File:** `.env` (missing)  
**Problem:** `MOLLIE_API_KEY`, `BASE_URL`, etc. not configured  
**Fix:** Create `.env` file with:
```bash
MOLLIE_API_KEY=test_xxxx
BASE_URL=http://localhost:3000
SESSION_SECRET=random-string-here
SMTP_HOST=smtp.example.com
...
```

---

## ✅ What's Already Working

- ✅ Product catalog & categories
- ✅ Cart add/remove/update (API level)
- ✅ Admin dashboard
- ✅ Product images
- ✅ Session management
- ✅ Security headers (Helmet)
- ✅ Database schema

---

## Priority Fix Order

1. **Install dependency** (2 min)
2. **Mount payment routes** (5 min)
3. **Add checkout button** (15 min)
4. **Fix database functions** (30 min)
5. **Fix webhook** (30 min)
6. **Environment config** (10 min)
7. **Test complete flow** (30 min)

**Total:** ~2.5 hours

---

## Testing After Fixes

```bash
# 1. Install dependency
npm install

# 2. Start server
npm start

# 3. Open browser
# http://localhost:3000

# 4. Test flow
# - Add product to cart
# - Click cart (should see new checkout button)
# - Click "Proceed to Checkout"
# - Fill form
# - Click "Betaal via iDEAL"
# - Should redirect to Mollie test payment page

# 5. Verify database
# - Check orders table: SELECT * FROM orders;
# - Check order items: SELECT * FROM order_items;
```

---

## Mollie Setup

1. Create account at https://mollie.com
2. Get test API key: `test_xxxxxxxxxx`
3. Add to `.env`: `MOLLIE_API_KEY=test_xxxxxxxxxx`
4. Configure webhook in Mollie dashboard:
   - URL: `https://yourdomain.com/webhook/mollie`
   - Include test payments: YES

---

## Files to Read

1. **Full analysis:** `REVIEW_REPORT_MOLLIE_INTEGRATION.md`
2. **Step-by-step fixes:** `FIX_IMPLEMENTATION_STEPS.md`
3. **Quality summary:** `QUALITY_REVIEW_SUMMARY.md`

---

## Questions?

If something is unclear in the fix steps, refer to:
- The full review report for context
- The implementation steps for exact code
- The quality summary for architecture overview

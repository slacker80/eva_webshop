# Eva Webshop Review: Shopping Cart & Mollie Payments Integration

**Date:** May 22, 2026  
**Reviewer:** Claude (Subagent)  
**Status:** Critical Issues Found - Requires Fixes

---

## Executive Summary

After thorough review of the Eva Webshop codebase, several critical issues were identified in both the shopping cart functionality and Mollie payments integration:

1. **Payment Routes NOT Integrated** - Mollie payment routes exist but are completely disconnected from the main server
2. **Missing Dependency** - `@mollie/api-client` is not installed (dependency unmet)
3. **No Checkout Flow** - No mechanism to transition from cart → checkout → payment
4. **Incomplete Cart UI** - Cart modal lacks checkout button and proper state management
5. **Missing Webhook Handler** - Payment webhook integration incomplete
6. **Database Schema Incomplete** - Orders table has issues
7. **Frontend Cart Logic Broken** - Multiple error fallbacks, inconsistent error handling

---

## Detailed Issues & Findings

### 1. 🔴 CRITICAL: Payment Routes Not Integrated into Server.js

**Issue:** The payment router exists at `/backend/routes/payment.js` but is **never imported or mounted** in `server.js`.

**Current State:**
- `server.js` has no import for payment routes
- No `app.use()` to mount the payment router
- Endpoints `/pay`, `/webhook/mollie` are completely inaccessible

**Files Affected:**
- `/server.js` - missing import
- `/backend/routes/payment.js` - created but unused

**Impact:** Users cannot initiate payments via Mollie. Complete payment functionality is broken.

---

### 2. 🔴 CRITICAL: Missing Mollie API Client Dependency

**Issue:** `@mollie/api-client` is listed in `package.json` but not installed.

**Evidence:**
```
UNMET DEPENDENCY @mollie/api-client@^3.6.0
```

**Files Affected:**
- `/package.json` - dependency declared
- `/node_modules` - missing package
- `/backend/routes/payment.js` - requires this package

**Impact:** Payment module will crash on import: `Cannot find module '@mollie/api-client'`

---

### 3. 🟠 HIGH: Cart Modal Missing Checkout Button

**Issue:** The shopping cart modal in `index.html` displays items but has **no checkout button** to proceed to payment.

**Current Implementation:**
- Cart shows items, quantity controls, remove buttons
- Displays cart total
- **Missing:** Checkout/Pay button to navigate to `/checkout`

**Missing UI Code:**
```html
<!-- NOT IN CURRENT VERSION -->
<div id="cartActions">
  <button onclick="goToCheckout()" class="checkout-btn">Proceed to Checkout</button>
  <button onclick="continueShopping()" class="continue-btn">Continue Shopping</button>
</div>
```

**Files Affected:**
- `/public/index.html` - missing checkout flow

**Impact:** Users cannot proceed from cart to payment even if payment routes were fixed.

---

### 4. 🟠 HIGH: Checkout Form Not Properly Integrated

**Issue:** `/checkout.html` exists but is not linked from the cart modal, and form submission path is incorrect.

**Current State:**
```javascript
// checkout.html line with form submission
fetch('/pay', { /* ... */ })
```

**Problems:**
1. No way to reach `/checkout` from the cart
2. Form POSTs to `/pay` but that route is not mounted
3. No environment variables configured (.env.example exists but not populated)
4. No BASE_URL, MOLLIE_API_KEY, etc. in actual environment

**Files Affected:**
- `/public/checkout.html` - not linked from cart
- `/backend/routes/payment.js` - requires `process.env.BASE_URL`
- `.env.example` - not deployed

**Impact:** Even if routes were mounted, payment creation would fail due to missing config.

---

### 5. 🟠 HIGH: Incomplete Cart Logic in Frontend

**Issue:** The cart JavaScript in `index.html` has multiple broken error handlers and inconsistent fallback logic.

**Problems Identified:**
```javascript
// Line 500-600+ shows pattern of:
} catch(err) {
  // Tries to assign fallback products?? (wrong catch target)
  const fallback = [{...}];
  products = fallback;
  displayProducts();
}
```

**Specific Issues:**
- Multiple identical catch blocks trying to reset products instead of handling cart errors
- No proper error logging or user feedback
- Duplicate fallback product assignments
- Error handlers don't recover gracefully - they display fallback products instead of showing error message

**Files Affected:**
- `/public/index.html` - cart JavaScript (lines 500-700+)

**Impact:** Network errors silently fail to load cart, unexpected state changes.

---

### 6. 🟠 HIGH: Missing Environment Configuration

**Issue:** Payment integration requires environment variables that are not documented or validated.

**Required but Missing/Undocumented:**
```
MOLLIE_API_KEY          - Critical for payment creation
BASE_URL                - For redirect URLs
SMTP_HOST               - For order confirmation emails
SMTP_PORT               - Email service
SMTP_USER               - Email auth
SMTP_PASS               - Email auth
SMTP_FROM               - Sender address
```

**Files Affected:**
- `.env.example` - not populated with all required vars
- `/backend/routes/payment.js` - assumes these exist
- `/backend/email.js` - optional but recommended

**Impact:** Production deployment will have incomplete functionality without proper configuration guide.

---

### 7. 🟡 MEDIUM: Webhook Handler Missing Response Format

**Issue:** The Mollie webhook handler at `/webhook/mollie` has issues:

**Problems:**
1. Uses `req.body.id` but Mollie sends webhook as form-encoded `tr_<id>`
2. No signature verification (security issue)
3. Metadata access may be undefined
4. Order saving references undefined `addOrder` function from db-utils

**Code Issues:**
```javascript
// payment.js webhook handler
router.post('/webhook/mollie', express.raw({ type: 'application/json' }), async (req, res) => {
  const id = req.body.id;  // ❌ Wrong format for Mollie
  // ...
  const { addOrder } = require('../db-utils');  // ❌ Function not exported
```

**Files Affected:**
- `/backend/routes/payment.js` - webhook handler
- `/db-utils.js` - `addOrder` not exported

**Impact:** Webhook processing will fail, orders won't be saved, confirmation emails won't send.

---

### 8. 🟡 MEDIUM: Database Schema Issues

**Issue:** Order-related database tables exist but functions to interact with them are incomplete.

**Problems:**
1. `addOrder()` function is not defined in `db-utils.js`
2. Order items table created but never used
3. No query functions for order retrieval/updates
4. Cart clearing happens but no order record is created with cart contents

**Files Affected:**
- `/db-utils.js` - missing order functions
- `/backend/routes/payment.js` - calls undefined functions

**Impact:** Even if payment succeeds, order won't be saved to database properly.

---

### 9. 🟡 MEDIUM: No User Feedback During Payment Flow

**Issue:** Cart modal and checkout form lack proper user feedback:

**Missing Features:**
- No clear "Checkout" button/CTA in cart
- No loading state indication during payment request
- No error messages displayed to user (errors silently fail)
- No success confirmation before redirect
- No payment status page after Mollie redirect

**Files Affected:**
- `/public/index.html` - cart UI
- `/public/checkout.html` - form feedback

**Impact:** Poor user experience, users won't know if payment succeeded.

---

### 10. 🟢 MINOR: Cart API Endpoints Work but Cart State Can Be Lost

**Issue:** While cart endpoints (`GET /api/cart`, `POST /api/cart`, etc.) are implemented, session management could be improved:

**Current Implementation:**
- Uses `req.sessionID` as key
- No cart expiration policy
- No persistent user identification (anonymous carts only)

**Files Affected:**
- `/server.js` - cart endpoints
- `/db-utils.js` - cart queries

**Impact:** Users lose cart after browser session ends or IP changes.

---

## Fix Plan

### Phase 1: Dependencies & Setup (Priority: CRITICAL)

1. **Install Missing Dependency**
   ```bash
   npm install @mollie/api-client
   ```

2. **Configure Environment Variables**
   - Create `.env` file with all required variables
   - Document in `.env.example`
   - Add validation in `server.js` startup

### Phase 2: Server Integration (Priority: CRITICAL)

1. **Mount Payment Routes in server.js**
   ```javascript
   const paymentRouter = require('./backend/routes/payment');
   app.use('/', paymentRouter);
   ```

2. **Fix Webhook Path**
   - Change from `/webhook/mollie` to `/api/webhook/mollie`
   - Configure Mollie dashboard with correct webhook URL

### Phase 3: Database & Backend (Priority: HIGH)

1. **Implement Missing Order Functions in db-utils.js**
   - `addOrder(orderData)` - save order with items
   - `getOrder(orderId)` - retrieve order
   - `updateOrderStatus(orderId, status)` - update payment status

2. **Fix Webhook Handler**
   - Correct Mollie webhook format parsing
   - Add signature verification
   - Properly handle metadata extraction
   - Call implemented `addOrder()` function

3. **Integrate Email Service**
   - Validate nodemailer dependency
   - Test SMTP configuration
   - Add fallback when email fails

### Phase 4: Frontend Cart & Checkout (Priority: HIGH)

1. **Add Checkout Button to Cart Modal**
   ```javascript
   // In updateCartUI() or similar
   function goToCheckout() {
     window.location.href = '/checkout';
   }
   ```

2. **Fix Cart Error Handling**
   - Remove broken fallback logic from catch blocks
   - Add proper user error messages
   - Log errors for debugging

3. **Improve Checkout Form**
   - Add loading spinner during payment request
   - Show error messages in UI
   - Validate form before submission

4. **Update Payment Result Page**
   - Make it dynamic (check payment status)
   - Show order summary
   - Add order confirmation details

### Phase 5: Testing & Validation (Priority: HIGH)

1. **Test Payment Flow End-to-End**
   - Add to cart → Checkout → Payment → Confirmation

2. **Test Webhook Processing**
   - Simulate Mollie webhook
   - Verify order is saved
   - Verify email is sent

3. **Test Error Scenarios**
   - Failed payment
   - Cancelled payment
   - Invalid cart items
   - Network errors

### Phase 6: Security & Polish (Priority: MEDIUM)

1. **Add CSRF Protection** to checkout form
2. **Validate Cart Contents** at checkout (prevent item tampering)
3. **Rate Limit** payment endpoint
4. **Add Logging** for payment events
5. **Document** payment flow for maintenance

---

## Code Changes Required

### High-Level Summary

**Files to Modify:**
- `server.js` - Import & mount payment routes
- `/backend/routes/payment.js` - Fix webhook handler, add validation
- `/db-utils.js` - Add order functions, fix cart clearing
- `/public/index.html` - Add checkout button, fix error handling
- `/public/checkout.html` - Update form validation
- `.env.example` - Document all required variables

**Files to Create:**
- `.env` - Populate with actual values (in deployment)
- Documentation for Mollie setup

---

## Risk Assessment

| Issue | Severity | Impact | Effort |
|-------|----------|--------|--------|
| Payment routes not mounted | CRITICAL | 100% payment blocked | 30 min |
| Missing dependency | CRITICAL | Module crash on import | 5 min |
| No checkout button | HIGH | Cannot reach payment | 20 min |
| Broken error handling | HIGH | Silent failures, poor UX | 45 min |
| Missing DB functions | HIGH | Orders not saved | 1 hour |
| Webhook issues | HIGH | Payment confirmation broken | 1 hour |
| Missing env config | HIGH | Production will fail | 30 min |
| Missing feedback UI | MEDIUM | Poor user experience | 1 hour |

**Total Estimated Fix Time:** 5-6 hours

---

## Recommendations

### Immediate Actions (Do First)
1. Install @mollie/api-client dependency
2. Mount payment routes in server.js
3. Implement order database functions
4. Add checkout button to cart
5. Fix webhook handler

### Before Production
1. All environment variables configured
2. End-to-end payment flow tested
3. Webhook signature verification implemented
4. Error handling and user feedback complete
5. Security review (CSRF, input validation)

### Future Improvements
1. User accounts & order history
2. Payment history & receipts
3. Abandoned cart recovery
4. Multiple payment methods
5. Inventory management
6. Admin order dashboard

---

## Conclusion

The Eva Webshop has a solid foundation with working product catalog, cart system, and admin dashboard. However, **the Mollie payments integration is incomplete and non-functional**. The required fixes are straightforward and can be completed in 5-6 hours. After fixing these issues, the platform will have a complete end-to-end payment flow.

**Status:** ❌ Not production-ready
**Blocker:** Payment routes not integrated
**Next Step:** Execute Phase 1 & 2 fixes

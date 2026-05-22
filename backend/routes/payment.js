const express = require('express');
const router = express.Router();
const Mollie = require('@mollie/api-client');

const mollie = Mollie.create({ apiKey: process.env.MOLLIE_API_KEY });
const { sendOrderConfirmation } = require('../email');

const { getCart, clearCart } = require('../db-utils');

// Create payment with Mollie
router.post('/pay', async (req, res) => {
  const { name, email, address } = req.body;
  if (!name || !email || !address) {
    return res.status(400).json({ error: 'Missing checkout info' });
  }

  try {
    const cart = await getCart(req.sessionID);
    if (!cart.length) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    // Calculate total amount
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
        totalAmount: parseFloat(amountValue)
      }
    });

    res.json({ paymentUrl: payment.getCheckoutUrl() });
  } catch (err) {
    console.error('Payment creation error:', err);
    res.status(500).json({ error: 'Failed to create payment' });
  }
});

// Mollie webhook handler
router.post('/webhook/mollie', express.raw({ type: 'application/json' }), async (req, res) => {
  const id = req.body.id;
  if (!id) return res.status(400).send('Missing payment id');

  try {
    const payment = await mollie.payments.get(id);

    if (payment.isPaid() && !payment.isCancelled() && !payment.isExpired()) {
      // Payment succeeded, process order logic here
      // For simplicity, clear cart
      const sessionId = payment.metadata ? payment.metadata.sessionId : null;

      if (sessionId) {
        await clearCart(sessionId);
        // Save order details
        const order = {
          sessionId: sessionId,
          name: payment.metadata.name || 'unknown',
          email: payment.metadata.email || 'unknown',
          address: payment.metadata.address || 'unknown'
        };
        try {
          const { addOrder } = require('../db-utils');
          await addOrder(order);
          await sendOrderConfirmation(order.email, order);
          console.log(`Order saved and confirmation email sent for session: ${sessionId}`);
        } catch (err) {
          console.error('Failed to save order or send mail:', err);
        }
        console.log(`Order paid for session: ${sessionId}`);
      }
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook processing error:', err);
    res.status(500).send('Error');
  }
});

module.exports = router;

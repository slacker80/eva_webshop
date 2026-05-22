// Order functions - append these to db-utils.js exports

function createOrder(sessionId, customerName, customerEmail, customerAddress, totalAmount) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO orders (session_id, customer_name, customer_email, customer_address, total_amount, status) VALUES (?, ?, ?, ?, ?, ?)',
      [sessionId, customerName, customerEmail, customerAddress, totalAmount, 'pending'],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

function addOrderItems(orderId, cartItems) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare('INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)');
    let pending = cartItems.length;
    let hasError = false;
    
    if (pending === 0) {
      resolve();
      return;
    }
    
    cartItems.forEach(item => {
      stmt.run([orderId, item.product_id, item.quantity, item.price], (err) => {
        if (err && !hasError) {
          hasError = true;
          reject(err);
        }
        pending--;
        if (pending === 0 && !hasError) {
          stmt.finalize();
          resolve();
        }
      });
    });
  });
}

function getOrder(orderId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM orders WHERE id = ?', [orderId], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function getOrderByMollieId(mollieOrderId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM orders WHERE mollie_order_id = ?', [mollieOrderId], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function updateOrderStatus(orderId, status, mollieOrderId = null) {
  return new Promise((resolve, reject) => {
    if (mollieOrderId) {
      db.run('UPDATE orders SET status = ?, mollie_order_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [status, mollieOrderId, orderId],
        (err) => { if (err) reject(err); else resolve(); }
      );
    } else {
      db.run('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [status, orderId],
        (err) => { if (err) reject(err); else resolve(); }
      );
    }
  });
}

function getOrderItems(orderId) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM order_items WHERE order_id = ?', [orderId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

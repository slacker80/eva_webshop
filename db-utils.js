const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

// Initialize database
function initDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Products table
      db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        price REAL NOT NULL,
        category TEXT,
        stock INTEGER DEFAULT 0,
        image_url TEXT,
        featured BOOLEAN DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err) reject(err);
      });

      // Categories table
      db.run(`CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
      )`, (err) => {
        if (err) reject(err);
      });

      // Homepage settings table
      db.run(`CREATE TABLE IF NOT EXISTS homepage (
        id INTEGER PRIMARY KEY,
        banner_title TEXT DEFAULT 'Crystal Jewelz',
        banner_subtitle TEXT DEFAULT 'Handmade Jewelry',
        intro_text TEXT DEFAULT 'Beautiful handcrafted jewelry for every occasion',
        featured_product_ids TEXT DEFAULT '[]'
      )`, (err) => {
        if (err) reject(err);
      });

      // Cart table (session-based)
      db.run(`CREATE TABLE IF NOT EXISTS cart_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id)
      )`, (err) => {
        if (err) reject(err);
      });

      // Admin users table
      db.run(`CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL
      )`, (err) => {
        if (err) {
          reject(err);
        } else {
          // Initialize default admin if not exists
          initDefaultAdmin().then(resolve).catch(reject);
        }
      });
    });
  });
}

// Initialize default admin user
function initDefaultAdmin() {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM admin_users WHERE username = ?', ['admin'], (err, row) => {
      if (err) {
        reject(err);
      } else if (!row) {
        const defaultPassword = process.env.ADMIN_PASSWORD || generateSecurePassword();
        const hash = bcrypt.hashSync(defaultPassword, 10);
        db.run('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)', 
          ['admin', hash], 
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      } else {
        resolve();
      }
    });
  });
}

// Generate secure random password
function generateSecurePassword() {
  const length = 16;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

// Product functions
function getProducts() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM products ORDER BY featured DESC, created_at DESC', (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function addProduct(data) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO products (name, description, price, category, stock, image_url, featured) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [data.name, data.description, data.price, data.category, data.stock, data.image_url, data.featured ? 1 : 0],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

function updateProduct(id, data) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE products SET name=?, description=?, price=?, category=?, stock=?, image_url=?, featured=? WHERE id=?',
      [data.name, data.description, data.price, data.category, data.stock, data.image_url, data.featured ? 1 : 0, id],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

function deleteProduct(id) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM products WHERE id=?', [id], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Homepage functions
function getHomepage() {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM homepage WHERE id=1', (err, row) => {
      if (err) reject(err);
      else resolve(row || {
        id: 1,
        banner_title: 'Crystal Jewelz',
        banner_subtitle: 'Handmade Jewelry',
        intro_text: 'Beautiful handcrafted jewelry for every occasion',
        featured_product_ids: '[]'
      });
    });
  });
}

function updateHomepage(data) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT OR REPLACE INTO homepage (id, banner_title, banner_subtitle, intro_text, featured_product_ids) VALUES (1, ?, ?, ?, ?)',
      [data.banner_title, data.banner_subtitle, data.intro_text, data.featured_product_ids],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

// Admin auth
function checkAdminLogin(username, password) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM admin_users WHERE username=?', [username], (err, row) => {
      if (err) {
        reject(err);
      } else if (row && bcrypt.compareSync(password, row.password_hash)) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

function updateAdminPassword(username, newPassword) {
  return new Promise((resolve, reject) => {
    const hash = bcrypt.hashSync(newPassword, 10);
    db.run('UPDATE admin_users SET password_hash=? WHERE username=?', [hash, username], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Cart functions
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

function addToCart(sessionId, productId, quantity) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT id, quantity FROM cart_items WHERE session_id=? AND product_id=?',
      [sessionId, productId],
      (err, row) => {
        if (err) return reject(err);
        if (row) {
          db.run(
            'UPDATE cart_items SET quantity=quantity+? WHERE session_id=? AND product_id=?',
            [quantity, sessionId, productId],
            (err) => { if (err) reject(err); else resolve(); }
          );
        } else {
          db.run(
            'INSERT INTO cart_items (session_id, product_id, quantity) VALUES (?, ?, ?)',
            [sessionId, productId, quantity],
            (err) => { if (err) reject(err); else resolve(); }
          );
        }
      }
    );
  });
}

function updateCartQuantity(sessionId, productId, quantity) {
  return new Promise((resolve, reject) => {
    if (quantity <= 0) {
      db.run(
        'DELETE FROM cart_items WHERE session_id=? AND product_id=?',
        [sessionId, productId],
        (err) => { if (err) reject(err); else resolve(); }
      );
    } else {
      db.run(
        'UPDATE cart_items SET quantity=? WHERE session_id=? AND product_id=?',
        [quantity, sessionId, productId],
        (err) => { if (err) reject(err); else resolve(); }
      );
    }
  });
}

function removeFromCart(sessionId, productId) {
  return new Promise((resolve, reject) => {
    db.run(
      'DELETE FROM cart_items WHERE session_id=? AND product_id=?',
      [sessionId, productId],
      (err) => { if (err) reject(err); else resolve(); }
    );
  });
}

function clearCart(sessionId) {
  return new Promise((resolve, reject) => {
    db.run(
      'DELETE FROM cart_items WHERE session_id=?',
      [sessionId],
      (err) => { if (err) reject(err); else resolve(); }
    );
  });
}

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
  clearCart
};

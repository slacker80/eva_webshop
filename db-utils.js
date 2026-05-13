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
        hero_title TEXT DEFAULT '✨ Handcrafted Crystal Jewelry',
        hero_subtitle TEXT DEFAULT 'Discover our beautiful collection of handcrafted crystal jewelry. Each piece is made with love and positive energy.',
        about1_icon TEXT DEFAULT '💎',
        about1_title TEXT DEFAULT 'Authentic Crystals',
        about1_text TEXT DEFAULT 'Every piece features genuine, ethically sourced crystals handpicked for quality and beauty.',
        about2_icon TEXT DEFAULT '🤲',
        about2_title TEXT DEFAULT 'Handcrafted With Care',
        about2_text TEXT DEFAULT 'Each jewelry piece is carefully handcrafted by our skilled artisans with attention to every detail.',
        about3_icon TEXT DEFAULT '🌍',
        about3_title TEXT DEFAULT 'Sustainable & Ethical',
        about3_text TEXT DEFAULT 'We are committed to sustainable practices and ethical sourcing for all our materials.',
        featured_title TEXT DEFAULT '🌟 Featured Products',
        featured_subtitle TEXT DEFAULT 'handpicked pieces'
      )`, (err) => {
        if (err) reject(err);
        else migrateHomepage().then(resolve).catch(reject);
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

// Migrate homepage table: add new columns if they don't exist
function migrateHomepage() {
  const cols = [
    { name: 'hero_title', def: "'✨ Handcrafted Crystal Jewelry'" },
    { name: 'hero_subtitle', def: "'Discover our beautiful collection of handcrafted crystal jewelry. Each piece is made with love and positive energy.'" },
    { name: 'about1_icon', def: "'💎'" },
    { name: 'about1_title', def: "'Authentic Crystals'" },
    { name: 'about1_text', def: "'Every piece features genuine, ethically sourced crystals handpicked for quality and beauty.'" },
    { name: 'about2_icon', def: "'🤲'" },
    { name: 'about2_title', def: "'Handcrafted With Care'" },
    { name: 'about2_text', def: "'Each jewelry piece is carefully handcrafted by our skilled artisans with attention to every detail.'" },
    { name: 'about3_icon', def: "'🌍'" },
    { name: 'about3_title', def: "'Sustainable & Ethical'" },
    { name: 'about3_text', def: "'We are committed to sustainable practices and ethical sourcing for all our materials.'" },
    { name: 'featured_title', def: "'🌟 Featured Products'" },
    { name: 'featured_subtitle', def: "'handpicked pieces'" },
  ];

  return new Promise((resolve, reject) => {
    db.all("PRAGMA table_info(homepage)", (err, rows) => {
      if (err) return reject(err);
      const existing = rows.map(r => r.name);
      const pending = cols.filter(c => !existing.includes(c.name));
      
      if (pending.length === 0) return resolve();
      
      db.serialize(() => {
        for (const col of pending) {
          db.run(`ALTER TABLE homepage ADD COLUMN ${col.name} TEXT DEFAULT ${col.def}`);
        }
      });
      
      // Ensure row 1 exists with defaults
      db.run('INSERT OR IGNORE INTO homepage (id) VALUES (1)', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
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
        hero_title: '✨ Handcrafted Crystal Jewelry',
        hero_subtitle: 'Discover our beautiful collection of handcrafted crystal jewelry. Each piece is made with love and positive energy.',
        about1_icon: '💎', about1_title: 'Authentic Crystals', about1_text: 'Every piece features genuine, ethically sourced crystals handpicked for quality and beauty.',
        about2_icon: '🤲', about2_title: 'Handcrafted With Care', about2_text: 'Each jewelry piece is carefully handcrafted by our skilled artisans with attention to every detail.',
        about3_icon: '🌍', about3_title: 'Sustainable & Ethical', about3_text: 'We are committed to sustainable practices and ethical sourcing for all our materials.',
        featured_title: '🌟 Featured Products',
        featured_subtitle: 'handpicked pieces',
      });
    });
  });
}

function updateHomepage(data) {
  return new Promise((resolve, reject) => {
    const fields = [
      'hero_title','hero_subtitle',
      'about1_icon','about1_title','about1_text',
      'about2_icon','about2_title','about2_text',
      'about3_icon','about3_title','about3_text',
      'featured_title','featured_subtitle'
    ];
    const setParts = fields.map(f => `${f}=?`).join(', ');
    const values = fields.map(f => data[f] || '');
    
    db.run(
      `INSERT OR REPLACE INTO homepage (id, ${fields.join(', ')}) VALUES (1, ${values.map(() => '?').join(', ')})`,
      values,
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

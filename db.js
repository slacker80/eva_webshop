const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

// Database path
const dbPath = path.join(__dirname, 'database.db');

// Create database and tables
function initializeDatabase() {
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening database:', err);
      return;
    }
    console.log('Connected to SQLite database');
  });

  // Create tables
  db.serialize(() => {
    // Products table
    db.run(`CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      category TEXT NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      image_url TEXT,
      featured BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Categories table
    db.run(`CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    )`);

    // Homepage settings table
    db.run(`CREATE TABLE IF NOT EXISTS homepage (
      id INTEGER PRIMARY KEY,
      banner_title TEXT NOT NULL,
      banner_subtitle TEXT,
      intro_text TEXT,
      featured_product_ids TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Admin users table
    db.run(`CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    )`);

    // Insert default categories if empty
    db.run(`INSERT OR IGNORE INTO categories (name) VALUES ('bracelets')`);
    db.run(`INSERT OR IGNORE INTO categories (name) VALUES ('necklaces')`);
    db.run(`INSERT OR IGNORE INTO categories (name) VALUES ('rings')`);
    db.run(`INSERT OR IGNORE INTO categories (name) VALUES ('anklets')`);
    db.run(`INSERT OR IGNORE INTO categories (name) VALUES ('earrings')`);

    // Insert default admin user if none exists
    db.get('SELECT COUNT(*) as count FROM admin_users', (err, row) => {
      if (err) {
        console.error('Error checking admin users:', err);
        return;
      }
      
      if (row.count === 0) {
        const defaultPassword = 'admin123';
        bcrypt.hash(defaultPassword, 10, (err, hash) => {
          if (err) {
            console.error('Error hashing password:', err);
            return;
          }
          
          db.run('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)', 
                  ['admin', hash], (err) => {
            if (err) {
              console.error('Error creating admin user:', err);
            } else {
              console.log('Default admin user created: admin / admin123');
            }
          });
        });
      }
    });

    // Insert default homepage settings if none exist
    db.get('SELECT COUNT(*) as count FROM homepage', (err, row) => {
      if (err) {
        console.error('Error checking homepage:', err);
        return;
      }
      
      if (row.count === 0) {
        db.run(`INSERT INTO homepage (id, banner_title, banner_subtitle, intro_text, featured_product_ids) 
                VALUES (1, 'Crystal Jewelz', 'Handmade Jewelry for Every Occasion', 
                'Discover our unique collection of handcrafted jewelry made with love and attention to detail. 
                From elegant necklaces to stylish bracelets, each piece is carefully crafted to bring out your inner beauty.',
                '')`);
      }
    });

    // Insert default products if empty
    db.get('SELECT COUNT(*) as count FROM products', (err, row) => {
      if (err) {
        console.error('Error checking products:', err);
        return;
      }
      
      if (row.count === 0) {
        const defaultProducts = [
          { name: 'Silver Beaded Bracelet', description: 'Handcrafted with genuine silver beads', price: 24.99, category: 'bracelets', stock: 8 },
          { name: 'Gemstone Bracelet', description: 'Mixed gemstones on elastic cord', price: 29.99, category: 'bracelets', stock: 5 },
          { name: 'Pearl Stretch Bracelet', description: 'Elegant pearl beads', price: 19.99, category: 'bracelets', stock: 12 },
          { name: 'Crystal Pendant Necklace', description: 'Handmade with Swarovski crystals', price: 34.99, category: 'necklaces', stock: 6 },
          { name: 'Boho Beaded Necklace', description: 'Mixed wood and gemstone beads', price: 27.99, category: 'necklaces', stock: 9 },
          { name: 'Gold Chain Necklace', description: '14K gold-plated chain with pendant', price: 39.99, category: 'necklaces', stock: 4 },
          { name: 'Gemstone Ring', description: 'Adjustable ring with natural gemstone', price: 22.99, category: 'rings', stock: 10 },
          { name: 'Silver Spiral Ring', description: 'Handmade sterling silver', price: 18.99, category: 'rings', stock: 7 }
        ];

        const stmt = db.prepare('INSERT INTO products (name, description, price, category, stock) VALUES (?, ?, ?, ?, ?)');
        
        defaultProducts.forEach(product => {
          stmt.run(product.name, product.description, product.price, product.category, product.stock);
        });
        
        stmt.finalize();
        console.log('Default products inserted');
      }
    });

    console.log('Database initialized successfully');
    db.close();
  });
}

// Database helper functions
const db = {
  // Product functions
  getProducts: (callback) => {
    const db = new sqlite3.Database(dbPath);
    db.all('SELECT * FROM products ORDER BY created_at DESC', [], (err, rows) => {
      db.close();
      callback(err, rows);
    });
  },

  getProductById: (id, callback) => {
    const db = new sqlite3.Database(dbPath);
    db.get('SELECT * FROM products WHERE id = ?', [id], (err, row) => {
      db.close();
      callback(err, row);
    });
  },

  addProduct: (product, callback) => {
    const db = new sqlite3.Database(dbPath);
    db.run('INSERT INTO products (name, description, price, category, stock, image_url, featured) VALUES (?, ?, ?, ?, ?, ?, ?)', 
           [product.name, product.description, product.price, product.category, product.stock, product.image_url, product.featured ? 1 : 0], 
           function(err) {
      db.close();
      callback(err, this.lastID);
    });
  },

  updateProduct: (id, product, callback) => {
    const db = new sqlite3.Database(dbPath);
    db.run('UPDATE products SET name = ?, description = ?, price = ?, category = ?, stock = ?, image_url = ?, featured = ? WHERE id = ?', 
           [product.name, product.description, product.price, product.category, product.stock, product.image_url, product.featured ? 1 : 0, id], 
           function(err) {
      db.close();
      callback(err, this.changes);
    });
  },

  deleteProduct: (id, callback) => {
    const db = new sqlite3.Database(dbPath);
    db.run('DELETE FROM products WHERE id = ?', [id], function(err) {
      db.close();
      callback(err, this.changes);
    });
  },

  // Homepage functions
  getHomepage: (callback) => {
    const db = new sqlite3.Database(dbPath);
    db.get('SELECT * FROM homepage WHERE id = 1', [], (err, row) => {
      db.close();
      callback(err, row);
    });
  },

  updateHomepage: (homepage, callback) => {
    const db = new sqlite3.Database(dbPath);
    db.run('UPDATE homepage SET banner_title = ?, banner_subtitle = ?, intro_text = ?, featured_product_ids = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1', 
           [homepage.banner_title, homepage.banner_subtitle, homepage.intro_text, homepage.featured_product_ids, 1], 
           function(err) {
      db.close();
      callback(err, this.changes);
    });
  },

  // Admin functions
  checkAdminLogin: (username, password, callback) => {
    const db = new sqlite3.Database(dbPath);
    db.get('SELECT * FROM admin_users WHERE username = ?', [username], (err, user) => {
      db.close();
      
      if (err || !user) {
        return callback(false);
      }
      
      bcrypt.compare(password, user.password_hash, (err, result) => {
        callback(result);
      });
    });
  },

  changeAdminPassword: (username, newPassword, callback) => {
    const db = new sqlite3.Database(dbPath);
    bcrypt.hash(newPassword, 10, (err, hash) => {
      if (err) {
        db.close();
        return callback(err);
      }
      
      db.run('UPDATE admin_users SET password_hash = ? WHERE username = ?', [hash, username], function(err) {
        db.close();
        callback(err, this.changes);
      });
    });
  },

  // Category functions
  getCategories: (callback) => {
    const db = new sqlite3.Database(dbPath);
    db.all('SELECT * FROM categories ORDER BY name', [], (err, rows) => {
      db.close();
      callback(err, rows);
    });
  }
};

// Initialize database on startup
initializeDatabase();

module.exports = db;
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dataDir = process.env.DATA_DIR || __dirname;
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = process.env.DATABASE_PATH || path.join(dataDir, 'database.db');
const db = new sqlite3.Database(dbPath);

const DEFAULT_CATEGORIES = ['bracelets', 'necklaces', 'rings', 'earrings', 'anklets'];

function normalizeCategoryName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

async function ensureColumns(table, columns) {
  const existing = await all(`PRAGMA table_info(${table})`);
  const existingNames = new Set(existing.map(col => col.name));
  for (const col of columns) {
    if (!existingNames.has(col.name)) {
      await run(`ALTER TABLE ${table} ADD COLUMN ${col.name} ${col.definition}`);
    }
  }
}

// Initialize database
function initDatabase() {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    };

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
        if (err) fail(err);
      });

      // Categories table
      db.run(`CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
      )`, (err) => {
        if (err) fail(err);
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
        if (err) fail(err);
      });

      // Site appearance settings table
      db.run(`CREATE TABLE IF NOT EXISTS site_settings (
        id INTEGER PRIMARY KEY,
        logo_url TEXT DEFAULT '',
        brand_name TEXT DEFAULT 'Crystal Jewelz',
        font_family TEXT DEFAULT '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        primary_color TEXT DEFAULT '#4a148c',
        accent_color TEXT DEFAULT '#d4af37',
        background_color TEXT DEFAULT '#f8f9fa'
      )`, (err) => {
        if (err) fail(err);
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
        if (err) fail(err);
      });

      // Admin users table
      db.run(`CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL
      )`, (err) => {
        if (err) fail(err);
      });

      db.get('SELECT 1', async (err) => {
        if (err) return fail(err);
        try {
          await migrateProducts();
          await migrateProductImages();
          await migrateHomepage();
          await migrateSiteSettings();
          await initDefaultAdmin();
          await ensureCategories();
          if (!settled) {
            settled = true;
            resolve();
          }
        } catch (err) {
          fail(err);
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

async function migrateSiteSettings() {
  await run(`CREATE TABLE IF NOT EXISTS site_settings (
    id INTEGER PRIMARY KEY,
    logo_url TEXT DEFAULT '',
    brand_name TEXT DEFAULT 'Crystal Jewelz',
    font_family TEXT DEFAULT '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    primary_color TEXT DEFAULT '#4a148c',
    accent_color TEXT DEFAULT '#d4af37',
    background_color TEXT DEFAULT '#f8f9fa'
  )`);
  await run('INSERT OR IGNORE INTO site_settings (id) VALUES (1)');
}

// Product functions
async function migrateProducts() {
  await ensureColumns('products', [
    { name: 'long_description', definition: "TEXT DEFAULT ''" },
    { name: 'is_unique', definition: 'BOOLEAN DEFAULT 0' }
  ]);
}

async function migrateProductImages() {
  await run(`CREATE TABLE IF NOT EXISTS product_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    image_url TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  )`);
}

function parseImages(images) {
  if (Array.isArray(images)) return images;
  if (typeof images === 'string') {
    try {
      const parsed = JSON.parse(images);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return images.split('\n');
    }
  }
  return [];
}

async function getProductImages(productId) {
  return all('SELECT * FROM product_images WHERE product_id=? ORDER BY sort_order ASC, id ASC', [productId]);
}

async function setProductImages(productId, images) {
  const cleaned = parseImages(images)
    .map(value => String(value || '').trim())
    .filter(Boolean);

  await run('BEGIN TRANSACTION');
  try {
    await run('DELETE FROM product_images WHERE product_id=?', [productId]);
    for (let i = 0; i < cleaned.length; i++) {
      await run(
        'INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?, ?, ?)',
        [productId, cleaned[i], i]
      );
    }
    await run('COMMIT');
  } catch (err) {
    await run('ROLLBACK').catch(() => {});
    throw err;
  }
}

async function attachImages(product) {
  if (!product) return product;
  product.images = await getProductImages(product.id);
  return product;
}

async function getProducts() {
  const products = await all('SELECT * FROM products ORDER BY featured DESC, created_at DESC');
  return Promise.all(products.map(attachImages));
}

async function getProduct(id) {
  return attachImages(await get('SELECT * FROM products WHERE id=?', [id]));
}

function addProduct(data) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO products (name, description, long_description, price, category, stock, image_url, featured, is_unique) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [data.name, data.description, data.long_description || '', data.price, data.category, data.stock, data.image_url, data.featured ? 1 : 0, data.is_unique ? 1 : 0],
      function(err) {
        if (err) return reject(err);
        const id = this.lastID;
        if (!Object.prototype.hasOwnProperty.call(data, 'images')) return resolve(id);
        setProductImages(id, data.images).then(() => resolve(id)).catch(reject);
      }
    );
  });
}

function updateProduct(id, data) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE products SET name=?, description=?, long_description=?, price=?, category=?, stock=?, image_url=?, featured=?, is_unique=? WHERE id=?',
      [data.name, data.description, data.long_description || '', data.price, data.category, data.stock, data.image_url, data.featured ? 1 : 0, data.is_unique ? 1 : 0, id],
      (err) => {
        if (err) return reject(err);
        if (!Object.prototype.hasOwnProperty.call(data, 'images')) return resolve();
        setProductImages(id, data.images).then(resolve).catch(reject);
      }
    );
  });
}

function deleteProduct(id) {
  return new Promise((resolve, reject) => {
    run('DELETE FROM product_images WHERE product_id=?', [id])
      .then(() => run('DELETE FROM products WHERE id=?', [id]))
      .then(resolve)
      .catch(reject);
  });
}

async function addProductImage(productId, imageUrl) {
  const row = await get('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM product_images WHERE product_id=?', [productId]);
  const result = await run(
    'INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?, ?, ?)',
    [productId, imageUrl, row?.next_order || 0]
  );
  return result.lastID;
}

async function deleteProductImage(productId, imageId) {
  await run('DELETE FROM product_images WHERE product_id=? AND id=?', [productId, imageId]);
}

async function ensureCategories() {
  const rows = await all('SELECT id, name FROM categories ORDER BY name');
  const known = new Set(rows.map(row => normalizeCategoryName(row.name).toLowerCase()));
  const productRows = await all(`
    SELECT DISTINCT category
    FROM products
    WHERE category IS NOT NULL AND TRIM(category) != ''
    ORDER BY LOWER(category)
  `);
  const names = rows.length === 0
    ? [...productRows.map(row => row.category), ...DEFAULT_CATEGORIES]
    : productRows.map(row => row.category);

  for (const rawName of names) {
    const name = normalizeCategoryName(rawName);
    const key = name.toLowerCase();
    if (!name || known.has(key)) continue;
    await run('INSERT INTO categories (name) VALUES (?)', [name]);
    known.add(key);
  }
}

async function getCategories() {
  await ensureCategories();
  return all(`
    SELECT c.id, c.name, COUNT(p.id) AS product_count
    FROM categories c
    LEFT JOIN products p ON LOWER(p.category) = LOWER(c.name)
    GROUP BY c.id, c.name
    ORDER BY LOWER(c.name)
  `);
}

async function assertUniqueCategoryName(name, ignoreId = null) {
  const rows = await all('SELECT id, name FROM categories');
  const key = normalizeCategoryName(name).toLowerCase();
  if (rows.some(row => row.id !== ignoreId && normalizeCategoryName(row.name).toLowerCase() === key)) {
    const err = new Error('Category already exists');
    err.code = 'CATEGORY_EXISTS';
    throw err;
  }
}

async function addCategory(name) {
  const normalized = normalizeCategoryName(name);
  if (!normalized) {
    const err = new Error('Category name is required');
    err.code = 'CATEGORY_REQUIRED';
    throw err;
  }

  await ensureCategories();
  await assertUniqueCategoryName(normalized);
  const result = await run('INSERT INTO categories (name) VALUES (?)', [normalized]);
  return result.lastID;
}

async function updateCategory(id, name) {
  const normalized = normalizeCategoryName(name);
  if (!normalized) {
    const err = new Error('Category name is required');
    err.code = 'CATEGORY_REQUIRED';
    throw err;
  }

  await ensureCategories();
  const category = await get('SELECT id, name FROM categories WHERE id = ?', [id]);
  if (!category) {
    const err = new Error('Category not found');
    err.code = 'CATEGORY_NOT_FOUND';
    throw err;
  }

  await assertUniqueCategoryName(normalized, Number(id));
  await run('BEGIN TRANSACTION');
  try {
    await run('UPDATE categories SET name = ? WHERE id = ?', [normalized, id]);
    await run('UPDATE products SET category = ? WHERE LOWER(category) = LOWER(?)', [normalized, category.name]);
    await run('COMMIT');
  } catch (err) {
    await run('ROLLBACK').catch(() => {});
    throw err;
  }
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

function defaultSiteSettings() {
  return {
    logo_url: '',
    brand_name: 'Crystal Jewelz',
    font_family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    primary_color: '#4a148c',
    accent_color: '#d4af37',
    background_color: '#f8f9fa'
  };
}

async function getSiteSettings() {
  return (await get('SELECT * FROM site_settings WHERE id=1')) || defaultSiteSettings();
}

async function updateSiteSettings(data) {
  const fields = ['logo_url', 'brand_name', 'font_family', 'primary_color', 'accent_color', 'background_color'];
  const values = fields.map(field => data[field] || defaultSiteSettings()[field]);
  await run(
    `INSERT OR REPLACE INTO site_settings (id, ${fields.join(', ')}) VALUES (1, ${fields.map(() => '?').join(', ')})`,
    values
  );
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
      `SELECT c.id AS cartItemId, c.product_id, c.product_id AS productId, c.quantity, p.name, p.price, p.stock FROM cart_items c JOIN products p ON c.product_id = p.id WHERE c.session_id = ? ORDER BY c.created_at DESC`,
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
  getProduct,
  addProduct,
  updateProduct,
  deleteProduct,
  getProductImages,
  setProductImages,
  addProductImage,
  deleteProductImage,
  getCategories,
  addCategory,
  updateCategory,
  getHomepage,
  updateHomepage,
  getSiteSettings,
  updateSiteSettings,
  checkAdminLogin,
  updateAdminPassword,
  getCart,
  addToCart,
  updateCartQuantity,
  removeFromCart,
  clearCart
};

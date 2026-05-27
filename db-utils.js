const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dataDir = process.env.DATA_DIR || __dirname;
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = process.env.DATABASE_PATH || path.join(dataDir, 'database.db');
const db = new sqlite3.Database(dbPath);

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
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
  });
}

async function ensureColumns(table, columns) {
  const existing = await all(`PRAGMA table_info(${table})`);
  const names = new Set(existing.map(row => row.name));
  for (const col of columns) {
    if (!names.has(col.name)) {
      await run(`ALTER TABLE ${table} ADD COLUMN ${col.name} ${col.definition}`);
    }
  }
}

async function initDatabase() {
  await run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    category TEXT,
    stock INTEGER DEFAULT 0,
    image_url TEXT,
    featured BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await ensureColumns('products', [
    { name: 'long_description', definition: "TEXT DEFAULT ''" },
    { name: 'is_unique', definition: 'INTEGER DEFAULT 1' }
  ]);

  await run(`CREATE TABLE IF NOT EXISTS product_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    image_url TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  )`);

  await run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  )`);

  await run(`CREATE TABLE IF NOT EXISTS homepage (
    id INTEGER PRIMARY KEY,
    hero_title TEXT DEFAULT 'Handcrafted Crystal Jewelry',
    hero_subtitle TEXT DEFAULT 'Discover our beautiful collection of handcrafted crystal jewelry. Each piece is made with love and positive energy.',
    about1_icon TEXT DEFAULT 'Gem',
    about1_title TEXT DEFAULT 'Authentic Crystals',
    about1_text TEXT DEFAULT 'Every piece features genuine, ethically sourced crystals handpicked for quality and beauty.',
    about2_icon TEXT DEFAULT 'Handmade',
    about2_title TEXT DEFAULT 'Handcrafted With Care',
    about2_text TEXT DEFAULT 'Each jewelry piece is carefully handcrafted with attention to every detail.',
    about3_icon TEXT DEFAULT 'Ethical',
    about3_title TEXT DEFAULT 'Sustainable & Ethical',
    about3_text TEXT DEFAULT 'We are committed to sustainable practices and ethical sourcing for all our materials.',
    featured_title TEXT DEFAULT 'Featured Products',
    featured_subtitle TEXT DEFAULT 'handpicked pieces'
  )`);
  await run('INSERT OR IGNORE INTO homepage (id) VALUES (1)');

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

  await run(`CREATE TABLE IF NOT EXISTS cart_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
  )`);
  await initDefaultAdmin();
}

async function initDefaultAdmin() {
  const row = await get('SELECT * FROM admin_users WHERE username = ?', ['admin']);
  if (!row) {
    const password = process.env.ADMIN_PASSWORD || generateSecurePassword();
    await run('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)', ['admin', bcrypt.hashSync(password, 10)]);
  }
}

function generateSecurePassword() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 16; i++) password += chars[Math.floor(Math.random() * chars.length)];
  return password;
}

async function attachImages(product) {
  if (!product) return product;
  const images = await getProductImages(product.id);
  product.images = images;
  return product;
}

async function getProducts() {
  const products = await all('SELECT * FROM products ORDER BY featured DESC, created_at DESC');
  return Promise.all(products.map(attachImages));
}

async function getProduct(id) {
  return attachImages(await get('SELECT * FROM products WHERE id=?', [id]));
}

async function addProduct(data) {
  const result = await run(
    `INSERT INTO products (name, description, long_description, price, category, stock, image_url, featured, is_unique)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.name,
      data.description || '',
      data.long_description || '',
      Number(data.price || 0),
      data.category || 'other',
      Number(data.stock ?? 1),
      data.image_url || '',
      data.featured ? 1 : 0,
      data.is_unique ? 1 : 0
    ]
  );
  if (Array.isArray(data.images)) await setProductImages(result.lastID, data.images);
  return result.lastID;
}

async function updateProduct(id, data) {
  await run(
    `UPDATE products SET name=?, description=?, long_description=?, price=?, category=?, stock=?, image_url=?, featured=?, is_unique=? WHERE id=?`,
    [
      data.name,
      data.description || '',
      data.long_description || '',
      Number(data.price || 0),
      data.category || 'other',
      Number(data.stock ?? 0),
      data.image_url || '',
      data.featured ? 1 : 0,
      data.is_unique ? 1 : 0,
      id
    ]
  );
  if (Array.isArray(data.images)) await setProductImages(id, data.images);
}

async function deleteProduct(id) {
  await run('DELETE FROM product_images WHERE product_id=?', [id]);
  await run('DELETE FROM cart_items WHERE product_id=?', [id]);
  await run('DELETE FROM products WHERE id=?', [id]);
}

async function getProductImages(productId) {
  return all('SELECT * FROM product_images WHERE product_id=? ORDER BY sort_order ASC, id ASC', [productId]);
}

async function setProductImages(productId, images) {
  await run('DELETE FROM product_images WHERE product_id=?', [productId]);
  const cleaned = (images || []).map(String).map(s => s.trim()).filter(Boolean);
  for (let i = 0; i < cleaned.length; i++) {
    await run('INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?, ?, ?)', [productId, cleaned[i], i]);
  }
}

async function addProductImage(productId, imageUrl) {
  const row = await get('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM product_images WHERE product_id=?', [productId]);
  const result = await run('INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?, ?, ?)', [productId, imageUrl, row.next_order || 0]);
  return result.lastID;
}

async function deleteProductImage(productId, imageId) {
  await run('DELETE FROM product_images WHERE product_id=? AND id=?', [productId, imageId]);
}

async function getHomepage() {
  return get('SELECT * FROM homepage WHERE id=1');
}

async function updateHomepage(data) {
  const fields = [
    'hero_title','hero_subtitle',
    'about1_icon','about1_title','about1_text',
    'about2_icon','about2_title','about2_text',
    'about3_icon','about3_title','about3_text',
    'featured_title','featured_subtitle'
  ];
  const values = fields.map(f => data[f] || '');
  await run(`INSERT OR REPLACE INTO homepage (id, ${fields.join(', ')}) VALUES (1, ${fields.map(() => '?').join(', ')})`, values);
}

async function getSiteSettings() {
  return get('SELECT * FROM site_settings WHERE id=1');
}

async function updateSiteSettings(data) {
  const fields = ['logo_url', 'brand_name', 'font_family', 'primary_color', 'accent_color', 'background_color'];
  const values = fields.map(f => data[f] || '');
  await run(`INSERT OR REPLACE INTO site_settings (id, ${fields.join(', ')}) VALUES (1, ${fields.map(() => '?').join(', ')})`, values);
}

async function checkAdminLogin(username, password) {
  const row = await get('SELECT * FROM admin_users WHERE username=?', [username]);
  return Boolean(row && bcrypt.compareSync(password, row.password_hash));
}

async function updateAdminPassword(username, newPassword) {
  await run('UPDATE admin_users SET password_hash=? WHERE username=?', [bcrypt.hashSync(newPassword, 10), username]);
}

async function getCart(sessionId) {
  return all(
    `SELECT c.id, c.product_id, c.quantity, p.name, p.price, p.stock
     FROM cart_items c
     JOIN products p ON c.product_id = p.id
     WHERE c.session_id = ?
     ORDER BY c.created_at DESC`,
    [sessionId]
  );
}

async function addToCart(sessionId, productId, quantity = 1) {
  const product = await getProduct(productId);
  if (!product) throw new Error('Product not found');
  if (Number(product.stock || 0) <= 0) throw new Error('Product is out of stock');
  const current = await get('SELECT * FROM cart_items WHERE session_id=? AND product_id=?', [sessionId, productId]);
  const desired = (current ? Number(current.quantity || 0) : 0) + Number(quantity || 1);
  const nextQuantity = Math.min(desired, Number(product.stock || 0));
  if (current) await run('UPDATE cart_items SET quantity=? WHERE session_id=? AND product_id=?', [nextQuantity, sessionId, productId]);
  else await run('INSERT INTO cart_items (session_id, product_id, quantity) VALUES (?, ?, ?)', [sessionId, productId, nextQuantity]);
}

async function updateCartQuantity(sessionId, productId, quantity) {
  const next = Number(quantity || 0);
  if (next <= 0) return removeFromCart(sessionId, productId);
  const product = await getProduct(productId);
  if (!product) throw new Error('Product not found');
  await run('UPDATE cart_items SET quantity=? WHERE session_id=? AND product_id=?', [Math.min(next, Number(product.stock || 0)), sessionId, productId]);
}

async function removeFromCart(sessionId, productId) {
  await run('DELETE FROM cart_items WHERE session_id=? AND product_id=?', [sessionId, productId]);
}

async function clearCart(sessionId) {
  await run('DELETE FROM cart_items WHERE session_id=?', [sessionId]);
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

#!/usr/bin/env node

/**
 * Product seed script
 * Run: node seed-products.js
 * Populates database with product samples for all categories
 */

const { db, initDatabase, addProduct } = require('./db-utils.js');

const products = [
  // Bracelets
  { name: 'Crystal Healing Bracelet', description: 'Beautiful amethyst and rose quartz healing bracelet', price: 25, category: 'Bracelets', stock: 10, image_url: '/images/bracelet-1.jpg', featured: true },
  { name: 'Beaded Charm Bracelet', description: 'Silver and gold accents with beaded charms', price: 18, category: 'Bracelets', stock: 8, image_url: '/images/bracelet-2.jpg', featured: true },
  { name: 'Elastic Band Bracelet', description: 'Multi-color crystals on elastic band', price: 12, category: 'Bracelets', stock: 15, image_url: '/images/bracelet-3.jpg', featured: false },
  
  // Necklaces
  { name: 'Pendant Moonstone', description: 'Sterling silver chain with moonstone pendant', price: 35, category: 'Necklaces', stock: 6, image_url: '/images/necklace-1.jpg', featured: true },
  { name: 'Layered Elegance', description: 'Gold-plated 3-strand layered necklace', price: 42, category: 'Necklaces', stock: 5, image_url: '/images/necklace-2.jpg', featured: true },
  { name: 'Crystal Point Necklace', description: 'Raw crystal point on delicate chain', price: 28, category: 'Necklaces', stock: 9, image_url: '/images/necklace-3.jpg', featured: false },
  
  // Rings
  { name: 'Amethyst Cluster Ring', description: 'Adjustable amethyst cluster ring in silver', price: 22, category: 'Rings', stock: 12, image_url: '/images/ring-1.jpg', featured: true },
  { name: 'Emerald Statement Ring', description: 'Gold-plated ring with beautiful emerald gemstone', price: 38, category: 'Rings', stock: 4, image_url: '/images/ring-2.jpg', featured: true },
  { name: 'Minimalist Silver Ring', description: 'Simple elegant silver band', price: 15, category: 'Rings', stock: 20, image_url: '/images/ring-3.jpg', featured: false },
  
  // Earrings
  { name: 'Crystal Drop Earrings', description: 'Rose quartz crystal drops with sterling silver hooks', price: 16, category: 'Earrings', stock: 14, image_url: '/images/earring-1.jpg', featured: true },
  { name: 'Hoop Statement Earrings', description: 'Gold-plated medium hoop earrings', price: 20, category: 'Earrings', stock: 11, image_url: '/images/earring-2.jpg', featured: true },
  { name: 'Stud Crystal Earrings', description: 'Beautiful amethyst crystal studs', price: 14, category: 'Earrings', stock: 16, image_url: '/images/earring-3.jpg', featured: false }
];

async function seed() {
  try {
    await initDatabase();
    console.log('✅ Database initialized');
    
    // Clear existing products (sqlite3 is async, must await!)
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM products', (err) => {
        if (err) reject(err);
        else { console.log('🗑 Cleared existing products'); resolve(); }
      });
    });
    
    for (const prod of products) {
      const id = await addProduct(prod);
      console.log(`✅ Added: ${prod.name} (ID: ${id}, Category: ${prod.category}, Price: $${prod.price})`);
    }
    
    console.log(`\n✅ Seeding complete: ${products.length} products added across 4 categories`);
    process.exit(0);
  } catch(e) {
    console.error('❌ Seed error:', e.message);
    process.exit(1);
  }
}

seed();

const Product = require('./models/Product');

const seedProducts = async () => {
  const count = await Product.count();
  if (count === 0) {
    console.log('Geen producten gevonden. Seed data wordt toegevoegd...');
    await Product.bulkCreate([
      { name: 'Eva Smart Watch', price: 299.99, description: 'Advanced fitness tracking with AI assistant', category: 'electronics', stock: 15 },
      { name: 'Eva Wireless Earbuds', price: 149.99, description: 'Premium sound quality with noise cancellation', category: 'electronics', stock: 25 },
      { name: 'Eva Yoga Mat', price: 49.99, description: 'Eco-friendly non-slip exercise mat', category: 'fitness', stock: 30 },
      { name: 'Eva Water Bottle', price: 24.99, description: 'Insulated stainless steel, keeps drinks cold for 24h', category: 'fitness', stock: 50 },
      { name: 'Eva Laptop Stand', price: 79.99, description: 'Ergonomic aluminum stand for better posture', category: 'accessories', stock: 20 }
    ]);
    console.log('Seed data succesvol toegevoegd.');
  } else {
    console.log('Database heeft al producten. Seed wordt overgeslagen.');
  }
};

module.exports = seedProducts;
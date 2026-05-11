const { Sequelize } = require('sequelize');

// SQLite voor simpele deployment
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './database.sqlite'
});

module.exports = sequelize;
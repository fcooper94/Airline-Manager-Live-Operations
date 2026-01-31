const { Sequelize } = require('sequelize');

// Support both Railway's DATABASE_URL and individual connection parameters
let sequelize;

if (process.env.DATABASE_URL) {
  // Use Railway's connection string
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    pool: {
      max: 10,
      min: 0,
      acquire: 60000,
      idle: 10000
    }
  });
} else {
  // Use individual connection parameters for local development
  sequelize = new Sequelize(
    process.env.DB_NAME || 'airline_control',
    process.env.DB_USER || 'postgres',
    process.env.DB_PASSWORD || '',
    {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      dialect: 'postgres',
      logging: false, // Disable all SQL query logging
      pool: {
        max: 10,
        min: 0,
        acquire: 60000,
        idle: 10000
      }
    }
  );
}

// Test connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✓ Database connection established successfully');
  } catch (error) {
    console.error('✗ Unable to connect to database:', error.message);
  }
};

testConnection();

module.exports = sequelize;
require('dotenv').config();
const mysql = require('mysql2/promise');

const dbName = process.env.DB_NAME || 'webbanhang';

if (!/^[a-zA-Z0-9_]+$/.test(dbName)) {
  throw new Error('DB_NAME chi duoc chua chu cai, so va dau gach duoi');
}

const connectionConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || ''
};

const pool = mysql.createPool({
  ...connectionConfig,
  database: dbName,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0
});

async function initDatabase() {
  await ensureDatabaseExists();
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      username VARCHAR(80) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'User',
      full_name VARCHAR(160) NOT NULL DEFAULT '',
      phone VARCHAR(40) NOT NULL DEFAULT '',
      address VARCHAR(500) NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY users_username_unique (username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS products (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(60) NOT NULL,
      display_category VARCHAR(80) NOT NULL,
      price INT UNSIGNED NOT NULL,
      image TEXT,
      section VARCHAR(40) NOT NULL DEFAULT 'products',
      sizes JSON NOT NULL,
      stock JSON NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS orders (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      order_code VARCHAR(80) NOT NULL,
      user_id INT UNSIGNED NULL,
      provider VARCHAR(30) NOT NULL,
      status VARCHAR(40) NOT NULL,
      stock_applied TINYINT(1) NOT NULL DEFAULT 0,
      amount INT UNSIGNED NOT NULL,
      description VARCHAR(500) NOT NULL DEFAULT '',
      customer_username VARCHAR(80) NOT NULL DEFAULT '',
      customer_name VARCHAR(160) NOT NULL DEFAULT '',
      customer_phone VARCHAR(40) NOT NULL DEFAULT '',
      customer_address VARCHAR(500) NOT NULL DEFAULT '',
      gateway_response JSON NULL,
      gateway_payload JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY orders_order_code_unique (order_code),
      KEY orders_user_id_index (user_id),
      CONSTRAINT orders_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS order_items (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      order_id BIGINT UNSIGNED NOT NULL,
      product_id INT UNSIGNED NULL,
      product_name VARCHAR(255) NOT NULL,
      size VARCHAR(40) NULL,
      quantity INT UNSIGNED NOT NULL,
      unit_price INT UNSIGNED NOT NULL,
      line_total INT UNSIGNED NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY order_items_order_id_index (order_id),
      KEY order_items_product_id_index (product_id),
      CONSTRAINT order_items_order_id_fk FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      CONSTRAINT order_items_product_id_fk FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensureColumnExists(
    'orders',
    'stock_applied',
    'ALTER TABLE orders ADD COLUMN stock_applied TINYINT(1) NOT NULL DEFAULT 0 AFTER status'
  );
}

async function ensureColumnExists(tableName, columnName, alterSql) {
  const [[{ count }]] = await pool.execute(
    `SELECT COUNT(*) AS count
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, tableName, columnName]
  );

  if (!count) {
    await pool.execute(alterSql);
  }
}

async function ensureDatabaseExists() {
  const connection = await mysql.createConnection(connectionConfig);
  try {
    await connection.execute(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await connection.end();
  }
}

module.exports = pool;
module.exports.initDatabase = initDatabase;

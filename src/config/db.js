require('dotenv').config();
const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

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
      sale_percent TINYINT UNSIGNED NOT NULL DEFAULT 0,
      image TEXT,
      images JSON NULL,
      section VARCHAR(40) NOT NULL DEFAULT 'products',
      sizes JSON NOT NULL,
      colors JSON NULL,
      description TEXT NULL,
      stock JSON NOT NULL,
      variant_stock JSON NULL,
      variant_prices JSON NULL,
      total_stock INT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS password_reset_requests (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id INT UNSIGNED NULL,
      username VARCHAR(80) NOT NULL,
      contact VARCHAR(160) NOT NULL DEFAULT '',
      note TEXT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
      admin_note TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY password_reset_requests_user_id_index (user_id),
      KEY idx_password_reset_requests_status (status),
      KEY idx_password_reset_requests_created_at (created_at),
      CONSTRAINT password_reset_requests_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
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
      admin_seen_at TIMESTAMP NULL DEFAULT NULL,
      fulfillment_status VARCHAR(40) NOT NULL DEFAULT 'ORDERED',
      received_at TIMESTAMP NULL DEFAULT NULL,
      amount INT UNSIGNED NOT NULL,
      description VARCHAR(500) NOT NULL DEFAULT '',
      customer_username VARCHAR(80) NOT NULL DEFAULT '',
      customer_name VARCHAR(160) NOT NULL DEFAULT '',
      customer_phone VARCHAR(40) NOT NULL DEFAULT '',
      customer_address VARCHAR(500) NOT NULL DEFAULT '',
      gateway_response JSON NULL,
      gateway_payload JSON NULL,
      refund_status VARCHAR(40) NOT NULL DEFAULT 'NONE',
      refund_reference VARCHAR(120) NULL,
      refund_bank_bin VARCHAR(20) NULL,
      refund_account_number VARCHAR(80) NULL,
      refund_account_name VARCHAR(160) NULL,
      refund_payload JSON NULL,
      refund_requested_at TIMESTAMP NULL DEFAULT NULL,
      refund_processed_at TIMESTAMP NULL DEFAULT NULL,
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
      color VARCHAR(80) NULL,
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

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS cart_items (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id INT UNSIGNED NOT NULL,
      product_id INT UNSIGNED NOT NULL,
      size VARCHAR(40) NULL,
      color VARCHAR(80) NULL,
      quantity INT UNSIGNED NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY cart_items_user_id_index (user_id),
      KEY cart_items_product_id_index (product_id),
      CONSTRAINT cart_items_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT cart_items_product_id_fk FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS return_requests (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      order_id BIGINT UNSIGNED NOT NULL,
      user_id INT UNSIGNED NULL,
      request_type VARCHAR(20) NOT NULL DEFAULT 'return',
      reason TEXT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
      admin_note TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY return_requests_order_unique (order_id),
      KEY return_requests_user_id_index (user_id),
      KEY return_requests_status_index (status),
      CONSTRAINT return_requests_order_id_fk FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      CONSTRAINT return_requests_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS product_reviews (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      product_id INT UNSIGNED NOT NULL,
      order_id BIGINT UNSIGNED NOT NULL,
      user_id INT UNSIGNED NULL,
      rating TINYINT UNSIGNED NOT NULL,
      comment TEXT NULL,
      admin_reply TEXT NULL,
      admin_replied_at TIMESTAMP NULL DEFAULT NULL,
      admin_replied_by INT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY product_reviews_product_order_user_unique (product_id, order_id, user_id),
      KEY product_reviews_product_id_index (product_id),
      KEY product_reviews_user_id_index (user_id),
      KEY idx_product_reviews_admin_replied_by (admin_replied_by),
      CONSTRAINT product_reviews_product_id_fk FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      CONSTRAINT product_reviews_order_id_fk FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      CONSTRAINT product_reviews_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT product_reviews_admin_replied_by_fk FOREIGN KEY (admin_replied_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS notifications (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id INT UNSIGNED NULL,
      sender_user_id INT UNSIGNED NULL,
      type VARCHAR(40) NOT NULL DEFAULT 'manual',
      tone VARCHAR(20) NOT NULL DEFAULT 'info',
      icon VARCHAR(80) NOT NULL DEFAULT 'bi-megaphone',
      title VARCHAR(160) NOT NULL,
      message TEXT NOT NULL,
      read_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY notifications_user_id_index (user_id),
      KEY notifications_sender_user_id_index (sender_user_id),
      KEY notifications_read_at_index (read_at),
      KEY notifications_created_at_index (created_at),
      CONSTRAINT notifications_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT notifications_sender_user_id_fk FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensureColumnExists(
    'orders',
    'stock_applied',
    'ALTER TABLE orders ADD COLUMN stock_applied TINYINT(1) NOT NULL DEFAULT 0 AFTER status'
  );

  const addedAdminSeenAt = await ensureColumnExists(
    'orders',
    'admin_seen_at',
    'ALTER TABLE orders ADD COLUMN admin_seen_at TIMESTAMP NULL DEFAULT NULL AFTER stock_applied'
  );

  if (addedAdminSeenAt) {
    await pool.execute(
      'UPDATE orders SET admin_seen_at = CURRENT_TIMESTAMP WHERE admin_seen_at IS NULL'
    );
  }

  await ensureColumnExists(
    'orders',
    'fulfillment_status',
    'ALTER TABLE orders ADD COLUMN fulfillment_status VARCHAR(40) NOT NULL DEFAULT \'ORDERED\' AFTER admin_seen_at'
  );

  await ensureColumnExists(
    'orders',
    'received_at',
    'ALTER TABLE orders ADD COLUMN received_at TIMESTAMP NULL DEFAULT NULL AFTER fulfillment_status'
  );

  await ensureColumnExists(
    'orders',
    'refund_status',
    'ALTER TABLE orders ADD COLUMN refund_status VARCHAR(40) NOT NULL DEFAULT \'NONE\' AFTER gateway_payload'
  );

  await ensureColumnExists(
    'orders',
    'refund_reference',
    'ALTER TABLE orders ADD COLUMN refund_reference VARCHAR(120) NULL AFTER refund_status'
  );

  await ensureColumnExists(
    'orders',
    'refund_bank_bin',
    'ALTER TABLE orders ADD COLUMN refund_bank_bin VARCHAR(20) NULL AFTER refund_reference'
  );

  await ensureColumnExists(
    'orders',
    'refund_account_number',
    'ALTER TABLE orders ADD COLUMN refund_account_number VARCHAR(80) NULL AFTER refund_bank_bin'
  );

  await ensureColumnExists(
    'orders',
    'refund_account_name',
    'ALTER TABLE orders ADD COLUMN refund_account_name VARCHAR(160) NULL AFTER refund_account_number'
  );

  await ensureColumnExists(
    'orders',
    'refund_payload',
    'ALTER TABLE orders ADD COLUMN refund_payload JSON NULL AFTER refund_account_name'
  );

  await ensureColumnExists(
    'orders',
    'refund_requested_at',
    'ALTER TABLE orders ADD COLUMN refund_requested_at TIMESTAMP NULL DEFAULT NULL AFTER refund_payload'
  );

  await ensureColumnExists(
    'orders',
    'refund_processed_at',
    'ALTER TABLE orders ADD COLUMN refund_processed_at TIMESTAMP NULL DEFAULT NULL AFTER refund_requested_at'
  );

  await ensureColumnExists(
    'products',
    'total_stock',
    'ALTER TABLE products ADD COLUMN total_stock INT UNSIGNED NULL AFTER stock'
  );

  await ensureColumnExists(
    'products',
    'sale_percent',
    'ALTER TABLE products ADD COLUMN sale_percent TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER price'
  );

  await ensureColumnExists(
    'products',
    'images',
    'ALTER TABLE products ADD COLUMN images JSON NULL AFTER image'
  );

  const addedProductColors = await ensureColumnExists(
    'products',
    'colors',
    'ALTER TABLE products ADD COLUMN colors JSON NULL AFTER sizes'
  );

  const addedVariantStock = await ensureColumnExists(
    'products',
    'variant_stock',
    'ALTER TABLE products ADD COLUMN variant_stock JSON NULL AFTER stock'
  );

  await ensureColumnExists(
    'products',
    'variant_prices',
    'ALTER TABLE products ADD COLUMN variant_prices JSON NULL AFTER variant_stock'
  );

  if (addedProductColors || addedVariantStock) {
    await pool.execute(`
      UPDATE products
      SET
        colors = JSON_ARRAY('Mặc định'),
        variant_stock = CASE
          WHEN JSON_LENGTH(sizes) > 0 THEN JSON_OBJECT('Mặc định', stock)
          ELSE JSON_OBJECT('Mặc định', JSON_OBJECT('__default__', COALESCE(total_stock, 0)))
        END
      WHERE colors IS NULL OR JSON_LENGTH(colors) = 0
    `);
  }

  await ensureColumnExists(
    'order_items',
    'color',
    'ALTER TABLE order_items ADD COLUMN color VARCHAR(80) NULL AFTER size'
  );

  await ensureColumnExists(
    'product_reviews',
    'admin_reply',
    'ALTER TABLE product_reviews ADD COLUMN admin_reply TEXT NULL AFTER comment'
  );

  await ensureColumnExists(
    'product_reviews',
    'admin_replied_at',
    'ALTER TABLE product_reviews ADD COLUMN admin_replied_at TIMESTAMP NULL DEFAULT NULL AFTER admin_reply'
  );

  await ensureColumnExists(
    'product_reviews',
    'admin_replied_by',
    'ALTER TABLE product_reviews ADD COLUMN admin_replied_by INT UNSIGNED NULL AFTER admin_replied_at'
  );

  await ensureIndexExists('products', 'idx_products_category', 'ALTER TABLE products ADD INDEX idx_products_category (category)');
  await ensureIndexExists('products', 'idx_products_section', 'ALTER TABLE products ADD INDEX idx_products_section (section)');
  await ensureIndexExists('orders', 'idx_orders_status', 'ALTER TABLE orders ADD INDEX idx_orders_status (status)');
  await ensureIndexExists('orders', 'idx_orders_provider', 'ALTER TABLE orders ADD INDEX idx_orders_provider (provider)');
  await ensureIndexExists('orders', 'idx_orders_refund_status', 'ALTER TABLE orders ADD INDEX idx_orders_refund_status (refund_status)');
  await ensureIndexExists(
    'orders',
    'idx_orders_fulfillment_status',
    'ALTER TABLE orders ADD INDEX idx_orders_fulfillment_status (fulfillment_status)'
  );
  await ensureIndexExists(
    'orders',
    'idx_orders_received_at',
    'ALTER TABLE orders ADD INDEX idx_orders_received_at (received_at)'
  );
  await ensureIndexExists(
    'product_reviews',
    'idx_product_reviews_admin_replied_by',
    'ALTER TABLE product_reviews ADD INDEX idx_product_reviews_admin_replied_by (admin_replied_by)'
  );
  await ensureForeignKeyExists(
    'product_reviews',
    'product_reviews_admin_replied_by_fk',
    'ALTER TABLE product_reviews ADD CONSTRAINT product_reviews_admin_replied_by_fk FOREIGN KEY (admin_replied_by) REFERENCES users(id) ON DELETE SET NULL'
  );
  await ensureIndexExists(
    'password_reset_requests',
    'idx_password_reset_requests_status',
    'ALTER TABLE password_reset_requests ADD INDEX idx_password_reset_requests_status (status)'
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
    return true;
  }

  return false;
}

async function ensureIndexExists(tableName, indexName, alterSql) {
  const [[{ count }]] = await pool.execute(
    `SELECT COUNT(*) AS count
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [dbName, tableName, indexName]
  );

  if (!count) {
    await pool.execute(alterSql);
  }
}

async function ensureForeignKeyExists(tableName, constraintName, alterSql) {
  const [[{ count }]] = await pool.execute(
    `SELECT COUNT(*) AS count
     FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    [dbName, tableName, constraintName]
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

setInterval(async () => {
  try {
    await pool.execute('SELECT 1');
  } catch (err) {
    logger.error('database.health_check_failed', { error: err });
  }
}, 60000).unref();

module.exports = pool;
module.exports.initDatabase = initDatabase;

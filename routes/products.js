const fs = require('fs');
const db = require('../config/db');

const defaultProducts = [
  {
    id: 1,
    name: 'Air Force 1 Low Triple White',
    category: 'shoes',
    displayCategory: 'Sneaker',
    price: 2890000,
    image: 'https://images.unsplash.com/photo-1600269452121-4f2416e55c28?auto=format&fit=crop&w=900&q=84',
    section: 'new',
    sizes: [39, 40, 41, 42, 43],
    stock: { 39: 5, 40: 8, 41: 4, 42: 3, 43: 2 }
  },
  {
    id: 2,
    name: 'Dunk Low Panda',
    category: 'shoes',
    displayCategory: 'Sneaker',
    price: 3290000,
    image: 'https://images.unsplash.com/photo-1608231387042-66d1773070a5?auto=format&fit=crop&w=900&q=84',
    section: 'new',
    sizes: [39, 40, 41, 42, 43],
    stock: { 39: 4, 40: 6, 41: 5, 42: 2, 43: 1 }
  },
  {
    id: 3,
    name: 'Air Jordan 1 Retro Low',
    category: 'shoes',
    displayCategory: 'Sneaker',
    price: 3990000,
    image: 'https://images.unsplash.com/photo-1552346154-21d32810aba3?auto=format&fit=crop&w=900&q=84',
    section: 'new',
    sizes: [39, 40, 41, 42, 43],
    stock: { 39: 2, 40: 4, 41: 4, 42: 3, 43: 1 }
  },
  {
    id: 4,
    name: 'New Balance 550 Cream',
    category: 'shoes',
    displayCategory: 'Sneaker',
    price: 3450000,
    image: 'https://images.unsplash.com/photo-1579338559194-a162d19bf842?auto=format&fit=crop&w=900&q=84',
    section: 'new',
    sizes: [38, 39, 40, 41, 42],
    stock: { 38: 3, 39: 5, 40: 4, 41: 3, 42: 2 }
  },
  {
    id: 5,
    name: 'England Jersey 2026',
    category: 'clothing',
    displayCategory: 'Apparel',
    price: 790000,
    image: './accesst/image/England.jpg',
    section: 'products',
    sizes: ['S', 'M', 'L', 'XL'],
    stock: { S: 5, M: 8, L: 6, XL: 3 }
  },
  {
    id: 6,
    name: 'Sling Bag Minimal Black',
    category: 'accessory',
    displayCategory: 'Accessory',
    price: 450000,
    image: 'https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&w=900&q=84',
    section: 'products',
    sizes: [],
    stock: {}
  },
  {
    id: 7,
    name: 'Street Cap Washed Grey',
    category: 'accessory',
    displayCategory: 'Accessory',
    price: 320000,
    image: 'https://images.unsplash.com/photo-1529958030586-3aae4ca485ff?auto=format&fit=crop&w=900&q=84',
    section: 'products',
    sizes: [],
    stock: {}
  },
  {
    id: 8,
    name: 'Boxy Tee Essential',
    category: 'clothing',
    displayCategory: 'Apparel',
    price: 390000,
    image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=84',
    section: 'products',
    sizes: ['S', 'M', 'L', 'XL'],
    stock: { S: 6, M: 10, L: 8, XL: 4 }
  }
];

async function ensureProductsDataFile(filePath) {
  const [[{ count }]] = await db.execute('SELECT COUNT(*) AS count FROM products');
  if (count > 0) return;

  let products = [];
  if (fs.existsSync(filePath)) {
    try {
      products = JSON.parse(fs.readFileSync(filePath, 'utf8').trim() || '[]');
    } catch {
      products = [];
    }
  }

  if (!Array.isArray(products) || !products.length) {
    products = defaultProducts;
  }

  await writeProducts(filePath, products);
}

async function handleProductsRoute(req, res, requestUrl, context) {
  const route = parseProductsPath(requestUrl.pathname);
  if (!route) return false;

  if (route.collection && req.method === 'GET') {
    context.sendJson(res, 200, {
      ok: true,
      products: await readProducts()
    });
    return true;
  }

  if (route.collection && req.method === 'POST') {
    if (!context.isAdminRequest(req)) {
      context.sendForbidden(res, context.sendJson);
      return true;
    }

    const body = await context.readRequestBody(req);
    let product;

    try {
      product = normalizeProduct(body, null, await readProducts());
    } catch (err) {
      context.sendJson(res, 400, {
        ok: false,
        message: err.message
      });
      return true;
    }

    product = await createProduct(product);
    context.sendJson(res, 201, {
      ok: true,
      product,
      products: await readProducts()
    });
    return true;
  }

  if (!route.collection && req.method === 'GET') {
    const product = await getProductById(route.id);
    if (!product) {
      context.sendJson(res, 404, {
        ok: false,
        message: 'Khong tim thay san pham'
      });
      return true;
    }

    context.sendJson(res, 200, {
      ok: true,
      product
    });
    return true;
  }

  if (!route.collection && req.method === 'PUT') {
    if (!context.isAdminRequest(req)) {
      context.sendForbidden(res, context.sendJson);
      return true;
    }

    const body = await context.readRequestBody(req);
    const current = await getProductById(route.id);

    if (!current) {
      context.sendJson(res, 404, {
        ok: false,
        message: 'Khong tim thay san pham'
      });
      return true;
    }

    let product;
    try {
      product = normalizeProduct(body, current, await readProducts());
    } catch (err) {
      context.sendJson(res, 400, {
        ok: false,
        message: err.message
      });
      return true;
    }

    product = await updateProduct(route.id, product);
    context.sendJson(res, 200, {
      ok: true,
      product,
      products: await readProducts()
    });
    return true;
  }

  if (!route.collection && req.method === 'DELETE') {
    if (!context.isAdminRequest(req)) {
      context.sendForbidden(res, context.sendJson);
      return true;
    }

    const [result] = await db.execute('DELETE FROM products WHERE id = ?', [route.id]);
    if (!result.affectedRows) {
      context.sendJson(res, 404, {
        ok: false,
        message: 'Khong tim thay san pham'
      });
      return true;
    }

    context.sendJson(res, 200, {
      ok: true,
      products: await readProducts()
    });
    return true;
  }

  context.sendJson(res, 405, {
    ok: false,
    message: 'Method not allowed'
  });
  return true;
}

function parseProductsPath(pathname) {
  if (pathname === '/api/products') {
    return {
      collection: true
    };
  }

  const match = pathname.match(/^\/api\/products\/(\d+)$/);
  if (!match) return null;

  return {
    collection: false,
    id: Number(match[1])
  };
}

function normalizeProduct(input, current, products) {
  const base = current || {};
  const nextId = products.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
  const category = normalizeCategory(input.category || base.category);
  const sizes = normalizeSizes(input.sizes !== undefined ? input.sizes : base.sizes);
  const stock = normalizeStock(input.stock !== undefined ? input.stock : base.stock, sizes);
  const price = Number(input.price !== undefined ? input.price : base.price);
  const name = String(input.name !== undefined ? input.name : base.name || '').trim();

  if (!name) {
    throw new Error('Ten san pham la bat buoc');
  }

  if (!Number.isFinite(price) || price < 0) {
    throw new Error('Gia san pham khong hop le');
  }

  return {
    id: current ? Number(base.id) : nextId,
    name,
    category,
    displayCategory: normalizeDisplayCategory(input.displayCategory || base.displayCategory, category),
    price,
    image: String(input.image !== undefined ? input.image : base.image || '').trim(),
    section: normalizeSection(input.section || base.section),
    sizes,
    stock
  };
}

async function createProduct(product) {
  const [result] = await db.execute(
    `INSERT INTO products (name, category, display_category, price, image, section, sizes, stock)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    productToParams(product).slice(1)
  );

  return getProductById(result.insertId);
}

async function updateProduct(id, product) {
  await db.execute(
    `UPDATE products
     SET name = ?, category = ?, display_category = ?, price = ?, image = ?, section = ?,
         sizes = ?, stock = ?
     WHERE id = ?`,
    [...productToParams(product).slice(1), Number(id)]
  );

  return getProductById(id);
}

async function getProductById(id) {
  const [rows] = await db.execute('SELECT * FROM products WHERE id = ? LIMIT 1', [Number(id)]);
  return rowToProduct(rows[0]);
}

async function readProducts() {
  const [rows] = await db.execute('SELECT * FROM products ORDER BY id');
  return rows.map(rowToProduct);
}

async function writeProducts(filePath, products) {
  if (!Array.isArray(products)) return;

  for (const input of products) {
    const product = normalizeProduct(input, input.id ? { id: input.id } : null, products);
    await db.execute(
      `INSERT IGNORE INTO products
       (id, name, category, display_category, price, image, section, sizes, stock)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      productToParams(product)
    );
  }
}

function productToParams(product) {
  return [
    Number(product.id) || null,
    product.name,
    product.category,
    product.displayCategory,
    Number(product.price) || 0,
    product.image,
    product.section,
    JSON.stringify(product.sizes || []),
    JSON.stringify(product.stock || {})
  ];
}

function rowToProduct(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    name: row.name,
    category: row.category,
    displayCategory: row.display_category,
    price: Number(row.price),
    image: row.image || '',
    section: row.section,
    sizes: parseJson(row.sizes, []),
    stock: parseJson(row.stock, {})
  };
}

function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeCategory(value) {
  const normalized = String(value || '').trim().toLowerCase();

  if (['sneaker', 'shoe', 'shoes'].includes(normalized)) return 'shoes';
  if (['apparel', 'clothes', 'clothing'].includes(normalized)) return 'clothing';
  if (['accessory', 'accessories'].includes(normalized)) return 'accessory';
  return normalized || 'accessory';
}

function normalizeDisplayCategory(value, category) {
  const label = String(value || '').trim();
  if (label) return label;

  if (category === 'shoes') return 'Sneaker';
  if (category === 'clothing') return 'Apparel';
  return 'Accessory';
}

function normalizeSection(value) {
  return String(value || '').trim() === 'new' ? 'new' : 'products';
}

function normalizeSizes(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeStock(value, sizes) {
  if (!sizes.length) return {};

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return sizes.reduce((stock, size) => {
      stock[size] = Math.max(0, Number(value[size]) || 0);
      return stock;
    }, {});
  }

  const stock = {};
  String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const [size, qty] = entry.split(':').map((part) => part.trim());
      if (size) stock[size] = Math.max(0, Number(qty) || 0);
    });

  sizes.forEach((size) => {
    if (stock[size] === undefined) stock[size] = 0;
  });

  return stock;
}

module.exports = {
  ensureProductsDataFile,
  handleProductsRoute,
  readProducts,
  writeProducts,
  getProductById
};

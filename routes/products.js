const fs = require('fs');
const path = require('path');

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

function ensureProductsDataFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  if (!fs.existsSync(filePath)) {
    writeProducts(filePath, defaultProducts);
    return;
  }

  try {
    readProducts(filePath);
  } catch {
    writeProducts(filePath, defaultProducts);
  }
}

async function handleProductsRoute(req, res, requestUrl, context) {
  const route = parseProductsPath(requestUrl.pathname);
  if (!route) return false;

  if (route.collection && req.method === 'GET') {
    context.sendJson(res, 200, {
      ok: true,
      products: readProducts(context.productsDataFile)
    });
    return true;
  }

  if (route.collection && req.method === 'POST') {
    if (!context.isAdminRequest(req)) {
      context.sendForbidden(res, context.sendJson);
      return true;
    }

    const body = await context.readRequestBody(req);
    const products = readProducts(context.productsDataFile);
    let product;

    try {
      product = normalizeProduct(body, null, products);
    } catch (err) {
      context.sendJson(res, 400, {
        ok: false,
        message: err.message
      });
      return true;
    }

    products.push(product);
    writeProducts(context.productsDataFile, products);

    context.sendJson(res, 201, {
      ok: true,
      product,
      products
    });
    return true;
  }

  if (!route.collection && req.method === 'GET') {
    const product = readProducts(context.productsDataFile).find((item) => item.id === route.id);
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
    const products = readProducts(context.productsDataFile);
    const index = products.findIndex((item) => item.id === route.id);

    if (index === -1) {
      context.sendJson(res, 404, {
        ok: false,
        message: 'Khong tim thay san pham'
      });
      return true;
    }

    try {
      products[index] = normalizeProduct(body, products[index], products);
    } catch (err) {
      context.sendJson(res, 400, {
        ok: false,
        message: err.message
      });
      return true;
    }

    writeProducts(context.productsDataFile, products);

    context.sendJson(res, 200, {
      ok: true,
      product: products[index],
      products
    });
    return true;
  }

  if (!route.collection && req.method === 'DELETE') {
    if (!context.isAdminRequest(req)) {
      context.sendForbidden(res, context.sendJson);
      return true;
    }

    const products = readProducts(context.productsDataFile);
    const nextProducts = products.filter((item) => item.id !== route.id);

    if (nextProducts.length === products.length) {
      context.sendJson(res, 404, {
        ok: false,
        message: 'Khong tim thay san pham'
      });
      return true;
    }

    writeProducts(context.productsDataFile, nextProducts);
    context.sendJson(res, 200, {
      ok: true,
      products: nextProducts
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
    id: Number(base.id || input.id || nextId),
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

function readProducts(filePath) {
  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (!content) return [];

  const products = JSON.parse(content);
  return Array.isArray(products) ? products : [];
}

function writeProducts(filePath, products) {
  fs.writeFileSync(filePath, `${JSON.stringify(products, null, 2)}\n`, 'utf8');
}

module.exports = {
  ensureProductsDataFile,
  handleProductsRoute,
  readProducts,
  writeProducts
};

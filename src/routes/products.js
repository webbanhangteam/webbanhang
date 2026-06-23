const fs = require('fs');
const db = require('../config/db');

let productsCache = null;
let productsCacheTime = 0;
const productsCacheTtl = 30 * 1000;
const categorySearchTerms = {
  shoes: [
    'giày', 'giày dép', 'giày thể thao', 'sneaker', 'shoe', 'shoes',
    'footwear'
  ],
  clothing: [
    'quần áo', 'áo', 'quần', 'thời trang', 'đồ mặc', 'clothing',
    'clothes', 'apparel'
  ],
  accessory: [
    'phụ kiện', 'accessory', 'accessories'
  ]
};
const productSearchGroups = [
  ['air force', 'af1'],
  ['dunk', 'panda'],
  ['jordan', 'aj1'],
  ['new balance', 'nb', '550'],
  ['áo đấu', 'jersey', 'bóng đá', 'football shirt'],
  ['áo thun', 'tee', 't shirt', 't-shirt'],
  ['túi', 'bag', 'đeo chéo', 'sling bag'],
  ['mũ', 'nón', 'cap', 'hat']
];
const colorSearchGroups = [
  ['trắng', 'white'],
  ['đen', 'black'],
  ['đỏ', 'red'],
  ['xám', 'ghi', 'gray', 'grey'],
  ['kem', 'cream', 'beige'],
  ['xanh dương', 'xanh biển', 'blue'],
  ['xanh lá', 'green'],
  ['vàng', 'yellow'],
  ['nâu', 'brown'],
  ['hồng', 'pink'],
  ['tím', 'purple', 'violet'],
  ['cam', 'orange']
];

const defaultProducts = [
  {
    id: 1,
    name: 'Air Force 1 Low Triple White',
    category: 'shoes',
    displayCategory: 'Sneaker',
    price: 2890000,
    salePercent: 15,
    image: 'https://images.unsplash.com/photo-1600269452121-4f2416e55c28?auto=format&fit=crop&w=900&q=84',
    section: 'new',
    sizes: [39, 40, 41, 42, 43],
    colors: ['Trắng'],
    stock: { 39: 5, 40: 8, 41: 4, 42: 3, 43: 2 },
    variantStock: { 'Trắng': { 39: 5, 40: 8, 41: 4, 42: 3, 43: 2 } }
  },
  {
    id: 2,
    name: 'Dunk Low Panda',
    category: 'shoes',
    displayCategory: 'Sneaker',
    price: 3290000,
    salePercent: 10,
    image: 'https://images.unsplash.com/photo-1608231387042-66d1773070a5?auto=format&fit=crop&w=900&q=84',
    section: 'new',
    sizes: [39, 40, 41, 42, 43],
    colors: ['Trắng/Đen'],
    stock: { 39: 4, 40: 6, 41: 5, 42: 2, 43: 1 },
    variantStock: { 'Trắng/Đen': { 39: 4, 40: 6, 41: 5, 42: 2, 43: 1 } }
  },
  {
    id: 3,
    name: 'Air Jordan 1 Retro Low',
    category: 'shoes',
    displayCategory: 'Sneaker',
    price: 3990000,
    salePercent: 0,
    image: 'https://images.unsplash.com/photo-1552346154-21d32810aba3?auto=format&fit=crop&w=900&q=84',
    section: 'new',
    sizes: [39, 40, 41, 42, 43],
    colors: ['Đỏ/Đen'],
    stock: { 39: 2, 40: 4, 41: 4, 42: 3, 43: 1 },
    variantStock: { 'Đỏ/Đen': { 39: 2, 40: 4, 41: 4, 42: 3, 43: 1 } }
  },
  {
    id: 4,
    name: 'New Balance 550 Cream',
    category: 'shoes',
    displayCategory: 'Sneaker',
    price: 3450000,
    salePercent: 0,
    image: 'https://images.unsplash.com/photo-1579338559194-a162d19bf842?auto=format&fit=crop&w=900&q=84',
    section: 'new',
    sizes: [38, 39, 40, 41, 42],
    colors: ['Kem'],
    stock: { 38: 3, 39: 5, 40: 4, 41: 3, 42: 2 },
    variantStock: { 'Kem': { 38: 3, 39: 5, 40: 4, 41: 3, 42: 2 } }
  },
  {
    id: 5,
    name: 'Áo đấu tuyển Anh 2026',
    category: 'clothing',
    displayCategory: 'Áo thể thao',
    price: 790000,
    salePercent: 20,
    image: '/image/products/England.avif',
    section: 'products',
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['Trắng'],
    stock: { S: 5, M: 8, L: 6, XL: 3 },
    variantStock: { 'Trắng': { S: 5, M: 8, L: 6, XL: 3 } }
  },
  {
    id: 6,
    name: 'Túi đeo chéo tối giản màu đen',
    category: 'accessory',
    displayCategory: 'Phụ kiện',
    price: 450000,
    salePercent: 0,
    image: 'https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&w=900&q=84',
    section: 'products',
    sizes: [],
    stock: {},
    totalStock: 12
  },
  {
    id: 7,
    name: 'Mũ lưỡi trai xám bạc màu',
    category: 'accessory',
    displayCategory: 'Phụ kiện',
    price: 320000,
    salePercent: 0,
    image: 'https://images.unsplash.com/photo-1529958030586-3aae4ca485ff?auto=format&fit=crop&w=900&q=84',
    section: 'products',
    sizes: [],
    stock: {},
    totalStock: 18
  },
  {
    id: 8,
    name: 'Áo thun Essential dáng rộng',
    category: 'clothing',
    displayCategory: 'Áo thể thao',
    price: 390000,
    salePercent: 0,
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
    const allProducts = await readProducts();
    context.sendJson(res, 200, {
      ok: true,
      products: searchProducts(allProducts, {
        query: requestUrl.searchParams.get('q'),
        category: requestUrl.searchParams.get('category'),
        color: requestUrl.searchParams.get('color')
      })
    });
    return true;
  }

  if (route.collection && req.method === 'POST') {
    if (!context.isAdminRequest(req)) {
      context.sendForbidden(res, context.sendJson);
      return true;
    }

    const body = await readBodyOrBadRequest(req, res, context);
    if (!body) return true;

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
    invalidateProductsCache();
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

    const body = await readBodyOrBadRequest(req, res, context);
    if (!body) return true;

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
    invalidateProductsCache();
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
    invalidateProductsCache();
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

async function readBodyOrBadRequest(req, res, context) {
  try {
    return await context.readRequestBody(req);
  } catch (err) {
    context.sendJson(res, 400, {
      ok: false,
      message: err.message || 'Body khong hop le'
    });
    return null;
  }
}

function normalizeProduct(input, current, products) {
  const base = current || {};
  const nextId = products.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
  const category = normalizeCategory(input.category || base.category);
  const sizes = normalizeSizes(input.sizes !== undefined ? input.sizes : base.sizes);
  const colors = normalizeColors(input.colors !== undefined ? input.colors : base.colors);
  const legacyStock = normalizeStock(input.stock !== undefined ? input.stock : base.stock, sizes);
  const variantStock = normalizeVariantStock(
    input.variantStock !== undefined ? input.variantStock : base.variantStock,
    colors,
    sizes,
    legacyStock,
    input.totalStock !== undefined ? input.totalStock : base.totalStock
  );
  const stock = colors.length ? summarizeVariantStock(variantStock, sizes) : legacyStock;
  const totalStock = normalizeTotalStock(
    input.totalStock !== undefined ? input.totalStock : base.totalStock,
    sizes,
    colors
  );
  const price = Number(input.price !== undefined ? input.price : base.price);
  const salePercent = normalizeSalePercent(input.salePercent !== undefined ? input.salePercent : base.salePercent);
  const name = normalizeProductName(input.name !== undefined ? input.name : base.name);
  const productImages = normalizeProductImages(
    input.image !== undefined ? input.image : base.image,
    input.images !== undefined ? input.images : base.images
  );

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
    salePercent,
    image: productImages.image,
    images: productImages.images,
    section: normalizeSection(input.section || base.section),
    sizes,
    colors,
    stock,
    variantStock,
    totalStock
  };
}

async function createProduct(product) {
  const [result] = await db.execute(
    `INSERT INTO products
     (name, category, display_category, price, sale_percent, image, images, section, sizes, colors, stock, variant_stock, total_stock)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    productToParams(product).slice(1)
  );

  return getProductById(result.insertId);
}

async function updateProduct(id, product) {
  await db.execute(
    `UPDATE products
     SET name = ?, category = ?, display_category = ?, price = ?, sale_percent = ?, image = ?, images = ?, section = ?,
         sizes = ?, colors = ?, stock = ?, variant_stock = ?, total_stock = ?
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
  if (productsCache && Date.now() - productsCacheTime < productsCacheTtl) {
    return productsCache;
  }

  const [rows] = await db.execute('SELECT * FROM products ORDER BY id');
  productsCache = rows.map(rowToProduct);
  productsCacheTime = Date.now();
  return productsCache;
}

async function writeProducts(filePath, products) {
  if (!Array.isArray(products)) return;

  for (const input of products) {
    const product = normalizeProduct(input, input.id ? { id: input.id } : null, products);
    await db.execute(
      `INSERT IGNORE INTO products
       (id, name, category, display_category, price, sale_percent, image, images, section, sizes, colors, stock, variant_stock, total_stock)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      productToParams(product)
    );
  }

  invalidateProductsCache();
}

function productToParams(product) {
  return [
    Number(product.id) || null,
    product.name,
    product.category,
    product.displayCategory,
    Number(product.price) || 0,
    Number(product.salePercent) || 0,
    product.image,
    JSON.stringify(product.images || []),
    product.section,
    JSON.stringify(product.sizes || []),
    JSON.stringify(product.colors || []),
    JSON.stringify(product.stock || {}),
    JSON.stringify(product.variantStock || {}),
    product.totalStock === null || product.totalStock === undefined ? null : Number(product.totalStock) || 0
  ];
}

function rowToProduct(row) {
  if (!row) return null;

  const productImages = normalizeProductImages(row.image, parseJson(row.images, []));
  const sizes = normalizeSizes(parseJson(row.sizes, []));
  const colors = normalizeColors(parseJson(row.colors, []));
  const stock = normalizeStock(parseJson(row.stock, {}), sizes);
  const variantStock = normalizeVariantStock(
    parseJson(row.variant_stock, {}),
    colors,
    sizes,
    stock,
    row.total_stock
  );

  return {
    id: Number(row.id),
    name: normalizeProductName(row.name),
    category: row.category,
    displayCategory: normalizeDisplayCategory(row.display_category, row.category),
    price: Number(row.price),
    salePercent: Number(row.sale_percent) || 0,
    image: productImages.image,
    images: productImages.images,
    section: row.section,
    sizes,
    colors,
    stock: colors.length ? summarizeVariantStock(variantStock, sizes) : stock,
    variantStock,
    totalStock: normalizeTotalStock(row.total_stock, sizes, colors)
  };
}

function invalidateProductsCache() {
  productsCache = null;
  productsCacheTime = 0;
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

function searchProducts(products, filters = {}) {
  const source = Array.isArray(products) ? products : [];
  const query = normalizeSearchText(filters.query);
  const queryTokens = query.split(' ').filter(Boolean);
  const category = normalizeSearchText(filters.category);
  const color = normalizeSearchText(filters.color);
  const hasFilters = Boolean(query || category || color);

  if (!hasFilters) return source;

  return source
    .map((product, index) => {
      const searchable = buildProductSearchText(product);
      const productCategory = normalizeSearchText(product?.category);
      const productColors = normalizeColors(product?.colors).map(normalizeSearchText);

      if (category && productCategory !== category) return null;
      if (color && !productColors.includes(color)) return null;
      if (queryTokens.length && !queryTokens.every((token) => searchable.includes(token))) {
        return null;
      }

      return {
        product,
        index,
        score: getProductSearchScore(product, query, queryTokens)
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.product);
}

function buildProductSearchText(product) {
  const category = normalizeSearchText(product?.category);
  const colors = normalizeColors(product?.colors);
  const productIdentity = normalizeSearchText(`${product?.name || ''} ${product?.displayCategory || ''}`);
  const relatedProductTerms = productSearchGroups.filter((terms) => {
    return terms.some((term) => productIdentity.includes(normalizeSearchText(term)));
  }).flat();
  const relatedColorTerms = colors.flatMap((color) => {
    const normalizedColor = normalizeSearchText(color);
    return colorSearchGroups.filter((terms) => {
      return terms.some((term) => normalizedColor.includes(normalizeSearchText(term)));
    }).flat();
  });

  return normalizeSearchText([
    product?.name,
    product?.displayCategory,
    product?.category,
    'sản phẩm màu màu sắc product color',
    ...colors,
    ...(categorySearchTerms[category] || []),
    ...relatedProductTerms,
    ...relatedColorTerms
  ].filter(Boolean).join(' '));
}

function getProductSearchScore(product, query, queryTokens) {
  if (!query) return 0;

  const name = normalizeSearchText(product?.name);
  const category = normalizeSearchText(`${product?.displayCategory || ''} ${product?.category || ''}`);
  const colors = normalizeSearchText(normalizeColors(product?.colors).join(' '));
  let score = 0;

  if (name === query) score += 1000;
  else if (name.startsWith(query)) score += 700;
  else if (name.includes(query)) score += 500;

  if (category.includes(query)) score += 250;
  if (colors.includes(query)) score += 220;

  queryTokens.forEach((token) => {
    if (name.split(' ').includes(token)) score += 80;
    else if (name.includes(token)) score += 45;
    if (category.includes(token)) score += 25;
    if (colors.includes(token)) score += 20;
  });

  return score;
}

function normalizeSearchText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeDisplayCategory(value, category) {
  const label = String(value || '').trim();
  if (label) {
    const normalized = label.toLowerCase();
    if (normalized === 'apparel') return 'Quần áo';
    if (normalized === 'accessory') return 'Phụ kiện';
    if (normalized === 'sneaker') return 'Giày sneaker';
    if (normalized === 'test') return 'Thử nghiệm';
    return label;
  }

  if (category === 'shoes') return 'Giày sneaker';
  if (category === 'clothing') return 'Quần áo';
  return 'Phụ kiện';
}

function normalizeProductImage(value) {
  const image = String(value || '').trim();
  const normalized = image.replace(/\\/g, '/').replace(/^\.?\//, '').toLowerCase();
  const legacyEnglandPaths = new Set([
    'assets/image/england.jpg',
    'image/products/england.jpg'
  ]);

  return legacyEnglandPaths.has(normalized) ? '/image/products/England.avif' : image;
}

function normalizeProductImages(primaryImage, additionalImages) {
  const images = [
    primaryImage,
    ...normalizeImageList(additionalImages)
  ]
    .map(normalizeProductImage)
    .filter(Boolean);
  const uniqueImages = Array.from(new Set(images));

  return {
    image: uniqueImages[0] || '',
    images: uniqueImages.slice(1)
  };
}

function normalizeImageList(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];

  return String(value)
    .split(/\r?\n/)
    .map((image) => image.trim())
    .filter(Boolean);
}

function normalizeProductName(value) {
  const name = String(value || '').trim();
  const legacyNames = {
    'England Jersey 2026': 'Áo đấu tuyển Anh 2026',
    'Sling Bag Minimal Black': 'Túi đeo chéo tối giản màu đen',
    'Street Cap Washed Grey': 'Mũ lưỡi trai xám bạc màu',
    'Boxy Tee Essential': 'Áo thun Essential dáng rộng'
  };

  return legacyNames[name] || name;
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

function normalizeColors(value) {
  const colors = Array.isArray(value)
    ? value
    : String(value || '').split(',');

  return Array.from(new Set(
    colors.map((item) => String(item).trim()).filter(Boolean)
  ));
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

function normalizeVariantStock(value, colors, sizes, legacyStock, totalStock) {
  if (!colors.length) return {};

  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const sizeKeys = sizes.length ? sizes : ['__default__'];

  return colors.reduce((result, color, colorIndex) => {
    const colorSource = source[color] && typeof source[color] === 'object'
      ? source[color]
      : {};

    result[color] = sizeKeys.reduce((entries, size) => {
      const fallback = colorIndex === 0
        ? (sizes.length ? legacyStock[size] : totalStock)
        : 0;
      entries[size] = Math.max(0, Number(colorSource[size] ?? fallback) || 0);
      return entries;
    }, {});
    return result;
  }, {});
}

function summarizeVariantStock(variantStock, sizes) {
  if (!sizes.length) return {};

  return Object.values(variantStock || {}).reduce((summary, colorStock) => {
    sizes.forEach((size) => {
      summary[size] = (summary[size] || 0) + Math.max(0, Number(colorStock?.[size]) || 0);
    });
    return summary;
  }, {});
}

function normalizeTotalStock(value, sizes, colors = []) {
  if (sizes.length || colors.length) return null;
  if (value === null || value === undefined || value === '') return null;

  const totalStock = Number(value);
  if (!Number.isFinite(totalStock)) return null;
  return Math.max(0, Math.trunc(totalStock));
}

function normalizeSalePercent(value) {
  const salePercent = Number(value);
  if (!Number.isFinite(salePercent)) return 0;
  return Math.min(95, Math.max(0, Math.trunc(salePercent)));
}

module.exports = {
  ensureProductsDataFile,
  handleProductsRoute,
  readProducts,
  writeProducts,
  getProductById,
  invalidateProductsCache,
  normalizeProductImage,
  normalizeProductImages,
  normalizeVariantStock,
  summarizeVariantStock,
  searchProducts,
  normalizeSearchText
};

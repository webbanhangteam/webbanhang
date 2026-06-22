import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import productsRoute from '../src/routes/products.js';
import products from '../src/data/products.json';

describe('product image assets', () => {
  it('uses the real AVIF path for the England product', () => {
    const englandProduct = products.find((product) => product.id === 5);

    expect(englandProduct?.image).toBe('/image/products/England.avif');

    const imagePath = path.resolve('public', englandProduct.image.slice(1));
    const imageHeader = fs.readFileSync(imagePath).subarray(0, 12).toString('ascii');

    expect(imageHeader).toContain('ftypavif');
  });

  it('normalizes legacy England image URLs returned from the database', () => {
    expect(productsRoute.normalizeProductImage('./assets/image/England.jpg'))
      .toBe('/image/products/England.avif');
    expect(productsRoute.normalizeProductImage('/image/products/England.jpg'))
      .toBe('/image/products/England.avif');
  });
});

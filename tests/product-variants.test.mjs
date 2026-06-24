import { describe, expect, it } from 'vitest';
import productsRoute from '../src/routes/products.js';

describe('product variants', () => {
  it('normalizes stock for every color and size', () => {
    expect(productsRoute.normalizeVariantStock(
      {
        Trắng: { S: 3, M: 2 },
        Đen: { S: 1, M: 0 }
      },
      ['Trắng', 'Đen'],
      ['S', 'M'],
      {},
      null
    )).toEqual({
      Trắng: { S: 3, M: 2 },
      Đen: { S: 1, M: 0 }
    });
  });

  it('summarizes variant stock by size for compatibility', () => {
    expect(productsRoute.summarizeVariantStock(
      {
        Trắng: { S: 3, M: 2 },
        Đen: { S: 1, M: 4 }
      },
      ['S', 'M']
    )).toEqual({ S: 4, M: 6 });
  });

  it('normalizes variant prices with base-price fallbacks', () => {
    expect(productsRoute.normalizeVariantPrices(
      {
        White: { S: 120000, M: 125000 },
        Black: { S: 130000 }
      },
      ['White', 'Black'],
      ['S', 'M'],
      100000
    )).toEqual({
      White: { S: 120000, M: 125000 },
      Black: { S: 130000, M: 100000 }
    });
  });
});

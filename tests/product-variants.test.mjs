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
});

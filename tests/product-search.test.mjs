import { describe, expect, it } from 'vitest';
import productsRoute from '../src/routes/products.js';

const products = [
  {
    id: 1,
    name: 'Air Force 1 Low',
    category: 'shoes',
    displayCategory: 'Giày sneaker',
    colors: ['Trắng']
  },
  {
    id: 2,
    name: 'Áo đấu tuyển Anh',
    category: 'clothing',
    displayCategory: 'Áo thể thao',
    colors: ['Đỏ']
  },
  {
    id: 3,
    name: 'Túi đeo chéo',
    category: 'accessory',
    displayCategory: 'Phụ kiện',
    colors: ['Trắng/Đen']
  }
];

describe('product search', () => {
  it('normalizes Vietnamese accents and punctuation', () => {
    expect(productsRoute.normalizeSearchText('  Giày—TRẮNG  ')).toBe('giay trang');
  });

  it('finds products by related category and color terms', () => {
    expect(productsRoute.searchProducts(products, { query: 'giày white' }).map(item => item.id))
      .toEqual([1]);
    expect(productsRoute.searchProducts(products, { query: 'bóng đá đỏ' }).map(item => item.id))
      .toEqual([2]);
    expect(productsRoute.searchProducts(products, { query: 'bag black' }).map(item => item.id))
      .toEqual([3]);
  });

  it('combines category and color filters', () => {
    expect(productsRoute.searchProducts(products, {
      category: 'accessory',
      color: 'Trắng/Đen'
    }).map(item => item.id)).toEqual([3]);
  });

  it('ranks direct name matches before related matches', () => {
    const matches = productsRoute.searchProducts(products, { query: 'air force' });
    expect(matches[0].id).toBe(1);
  });
});

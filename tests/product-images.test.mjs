import { describe, expect, it } from 'vitest';
import productsRoute from '../src/routes/products.js';

describe('product images', () => {
  it('keeps the first image as the primary image and removes duplicates', () => {
    expect(productsRoute.normalizeProductImages(
      '/image/products/front.jpg',
      [
        '/image/products/side.jpg',
        '/image/products/front.jpg',
        '/image/products/back.jpg'
      ]
    )).toEqual({
      image: '/image/products/front.jpg',
      images: [
        '/image/products/side.jpg',
        '/image/products/back.jpg'
      ]
    });
  });

  it('accepts a newline-separated image list when no primary image is supplied', () => {
    expect(productsRoute.normalizeProductImages(
      '',
      '/image/products/front.jpg\n/image/products/back.jpg'
    )).toEqual({
      image: '/image/products/front.jpg',
      images: ['/image/products/back.jpg']
    });
  });
});

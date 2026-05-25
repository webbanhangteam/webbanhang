import { describe, expect, it } from 'vitest';
import auth from '../routes/auth.js';

describe('password hashing', () => {
  it('verifies valid passwords and rejects invalid passwords', () => {
    const hash = auth.hashPassword('StrongPass1');

    expect(auth.verifyPassword('StrongPass1', hash)).toBe(true);
    expect(auth.verifyPassword('wrong-password', hash)).toBe(false);
  });
});

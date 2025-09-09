import { describe, test, expect } from '@jest/globals';

describe('Jest Setup Test', () => {
  test('should run basic test', () => {
    expect(1 + 1).toBe(2);
  });

  test('should support async/await', async () => {
    const result = await Promise.resolve('hello');
    expect(result).toBe('hello');
  });
});
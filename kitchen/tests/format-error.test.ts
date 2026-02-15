import { describe, expect, test } from 'vitest';
import { formatError } from '../server/index.js';

describe('formatError', () => {
  test('maps ETIMEDOUT code to "Operation timed out"', () => {
    expect(formatError({ code: 'ETIMEDOUT' })).toBe('Operation timed out');
  });

  test('maps message containing ETIMEDOUT to "Operation timed out"', () => {
    expect(formatError(new Error('connect ETIMEDOUT'))).toBe('Operation timed out');
  });

  test('returns error message for other errors', () => {
    expect(formatError(new Error('other'))).toBe('other');
  });

  test('handles non-Error values', () => {
    expect(formatError('string error')).toBe('string error');
  });

  test('handles null and undefined', () => {
    expect(formatError(null)).toBe('null');
    expect(formatError(undefined)).toBe('undefined');
  });
});

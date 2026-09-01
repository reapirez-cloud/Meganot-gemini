import { describe, it, expect } from 'vitest';
import { capitalize, truncate, slugify, isValidEmail } from './string';

describe('String Utilities Unit Tests', () => {
  it('should capitalize the first letter', () => {
    expect(capitalize('hello')).toBe('Hello');
    expect(capitalize('world')).toBe('World');
    expect(capitalize('')).toBe('');
  });

  it('should truncate strings exceeding maxLength', () => {
    expect(truncate('GitHub Actions CI/CD Pipeline', 10)).toBe('GitHub Act...');
    expect(truncate('Short', 10)).toBe('Short');
  });

  it('should generate valid URL slugs', () => {
    expect(slugify('My First Pull Request 2026')).toBe('my-first-pull-request-2026');
    expect(slugify('  Continuous Integration & Deployment! ')).toBe('continuous-integration-deployment');
  });

  it('should validate email formats correctly', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('invalid-email')).toBe(false);
    expect(isValidEmail('user@domain')).toBe(false);
  });
});

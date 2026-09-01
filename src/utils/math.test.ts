import { describe, it, expect } from 'vitest';
import { add, subtract, multiply, divide, clamp, calculatePercentage } from './math';

describe('Math Utilities Unit Tests', () => {
  it('should correctly sum two numbers', () => {
    expect(add(2, 3)).toBe(5);
    expect(add(-10, 5)).toBe(-5);
    expect(add(0, 0)).toBe(0);
  });

  it('should correctly subtract two numbers', () => {
    expect(subtract(10, 4)).toBe(6);
    expect(subtract(5, 10)).toBe(-5);
  });

  it('should correctly multiply two numbers', () => {
    expect(multiply(3, 7)).toBe(21);
    expect(multiply(-2, 4)).toBe(-8);
  });

  it('should divide numbers and throw error on zero denominator', () => {
    expect(divide(10, 2)).toBe(5);
    expect(() => divide(10, 0)).toThrow('Division by zero is not permitted');
  });

  it('should clamp numbers within specified bounds', () => {
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('should calculate accurate percentages', () => {
    expect(calculatePercentage(25, 100)).toBe(25);
    expect(calculatePercentage(1, 3)).toBe(33.3);
    expect(calculatePercentage(10, 0)).toBe(0);
  });
});

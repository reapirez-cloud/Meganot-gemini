/**
 * Math utility functions used throughout the application.
 */

export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}

export function divide(a: number, b: number): number {
  if (b === 0) {
    throw new Error('Division by zero is not permitted');
  }
  return a / b;
}

export function clamp(value: number, min: number, max: number): number {
  if (min > max) {
    throw new Error('Min cannot be greater than max');
  }
  return Math.min(Math.max(value, min), max);
}

export function calculatePercentage(part: number, total: number): number {
  if (total === 0) return 0;
  return Number(((part / total) * 100).toFixed(1));
}

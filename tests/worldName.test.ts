// tests/worldName.test.ts
import { describe, it, expect } from 'vitest';
import { worldNameFromSearch } from '../src/persistence/worldName';

describe('worldNameFromSearch', () => {
  it('defaults to "default" when absent or empty', () => {
    expect(worldNameFromSearch('')).toBe('default');
    expect(worldNameFromSearch('?world=flat')).toBe('default');
  });
  it('reads and sanitizes ?save', () => {
    expect(worldNameFromSearch('?save=settlement')).toBe('settlement');
    expect(worldNameFromSearch('?save=a/b c')).toBe('a_b_c');
  });
});

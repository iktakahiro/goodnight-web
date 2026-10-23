import { describe, expect, test } from 'bun:test';
import {
  MIN_SECRET_LENGTH,
  secretState,
  type SecretState,
} from './secret-length.ts';

describe('secretState', () => {
  test.each<[string | undefined, SecretState]>([
    [undefined, 'missing'],
    ['', 'missing'],
    ['n4Vq8ZrT1xKp0sWb7LmC3yHd6FgJ2eR', 'too_short'],
    ['a'.repeat(64), 'weak'],
    ['abababababababababababababababab', 'weak'],
    ['abcdefghi'.repeat(4), 'weak'],
    ['0123456789'.repeat(4), 'weak'],
    ['passwordpasswordpasswordpassword', 'weak'],
    ['n4Vq8ZrT1xKp0sWb7LmC3yHd6FgJ2eRa', 'ok'],
    ['test-setup-token-0123456789abcdefghij', 'ok'],
  ])('%j is %s', (value, state) => {
    expect(secretState(value)).toBe(state);
  });

  test('accepts values from openssl rand -base64 32 and hex 32', () => {
    for (let i = 0; i < 200; i++) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const base64 = btoa(String.fromCharCode(...bytes));
      const hex = [...bytes]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      expect(base64.length).toBeGreaterThanOrEqual(MIN_SECRET_LENGTH);
      expect(secretState(base64)).toBe('ok');
      expect(secretState(hex)).toBe('ok');
    }
  });
});

// Checks the `_headers` files that Workers Static Assets applies to the
// starter's pages and to the documentation site. Nothing is built: the files
// are read as they are committed.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');

/** Rules of a `_headers` file: path pattern -> header name -> value. */
const parseHeaders = (text: string): Map<string, Map<string, string>> => {
  const rules = new Map<string, Map<string, string>>();
  let current: Map<string, string> | undefined;
  for (const [index, line] of text.split('\n').entries()) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      if (!line.startsWith('/')) {
        throw new Error(`line ${index + 1}: a rule must start with "/"`);
      }
      current = new Map();
      rules.set(line.trim(), current);
      continue;
    }
    const header = /^\s+([A-Za-z0-9-]+):\s*(\S.*)$/.exec(line);
    if (!current || !header) {
      throw new Error(`line ${index + 1}: expected "  Name: value"`);
    }
    current.set(String(header[1]).toLowerCase(), String(header[2]).trim());
  }
  return rules;
};

const directives = (csp: string): Map<string, string[]> =>
  new Map(
    csp
      .split(';')
      .map((part) => part.trim().split(/\s+/))
      .filter((parts) => parts[0])
      .map(([name, ...values]) => [String(name), values]),
  );

const read = (path: string) =>
  parseHeaders(readFileSync(join(root, path), 'utf8'));

describe('templates/starter/public/_headers', () => {
  const all = read('templates/starter/public/_headers').get('/*');

  test('has one rule for every page', () => {
    expect(all).toBeDefined();
  });

  test('sends a CSP that allows scripts only from the site and Turnstile', () => {
    const csp = directives(all?.get('content-security-policy') ?? '');
    expect(csp.get('default-src')).toEqual(["'self'"]);
    expect(csp.get('script-src')).toEqual([
      "'self'",
      'https://challenges.cloudflare.com',
    ]);
    expect(csp.get('frame-src')).toEqual(['https://challenges.cloudflare.com']);
    expect(csp.get('connect-src')).toEqual(["'self'"]);
    expect(csp.get('style-src')).toEqual(["'self'"]);
    expect(csp.get('object-src')).toEqual(["'none'"]);
    expect(csp.get('base-uri')).toEqual(["'self'"]);
    expect(csp.get('form-action')).toEqual(["'self'"]);
    expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
    for (const values of csp.values()) {
      expect(values).not.toContain("'unsafe-eval'");
    }
    expect(csp.get('script-src')).not.toContain("'unsafe-inline'");
  });

  test('sends the other security headers and no HSTS', () => {
    expect(all?.get('x-content-type-options')).toBe('nosniff');
    expect(all?.get('x-frame-options')).toBe('DENY');
    expect(all?.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(all?.get('permissions-policy')).toContain('camera=()');
    expect(all?.has('strict-transport-security')).toBe(false);
  });
});

describe('apps/docs/public/_headers', () => {
  test('forbids framing and sniffing', () => {
    const all = read('apps/docs/public/_headers').get('/*');
    const csp = directives(all?.get('content-security-policy') ?? '');
    expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
    expect(all?.get('x-content-type-options')).toBe('nosniff');
    expect(all?.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
  });
});

describe('parseHeaders', () => {
  test('rejects a header outside a rule and a rule without a slash', () => {
    expect(() => parseHeaders('  X-A: b')).toThrow('Name: value');
    expect(() => parseHeaders('*\n  X-A: b')).toThrow('must start');
  });
});

import { describe, expect, test } from 'bun:test';
import { hmacSha256Hex } from './crypto.ts';
import { ipRateLimitKey, ipRateLimitSubject } from './ip-rate-limit.ts';

describe('ipRateLimitSubject', () => {
  test.each([
    ['203.0.113.42', '203.0.113.42'],
    ['2001:db8:1:2:3:4:5:6', '2001:db8:1:2::/64'],
    ['2001:0DB8:0001:0002:ffff:ffff:ffff:ffff', '2001:db8:1:2::/64'],
    ['2001:db8:1:2::1', '2001:db8:1:2::/64'],
    ['2001:db8::1', '2001:db8:0:0::/64'],
    ['[2001:db8:1:2::1]', '2001:db8:1:2::/64'],
    ['fe80::1%eth0', 'fe80:0:0:0::/64'],
    ['::1', '0:0:0:0::/64'],
    ['::ffff:203.0.113.42', '203.0.113.42'],
    ['::FFFF:cb00:712a', '203.0.113.42'],
    ['64:ff9b::203.0.113.42', '64:ff9b:0:0::/64'],
    ['unknown', 'unknown'],
    ['1:2:3:4:5:6:7:8:9', '1:2:3:4:5:6:7:8:9'],
    ['1::2::3', '1::2::3'],
    ['1:2:3:4:5:6:7:8::', '1:2:3:4:5:6:7:8::'],
    ['::ffff:999.0.0.1', '::ffff:999.0.0.1'],
    ['203.0.113.256', '203.0.113.256'],
  ])('%s counts as %s', (ip, subject) => {
    expect(ipRateLimitSubject(ip)).toBe(subject);
  });
});

describe('ipRateLimitKey', () => {
  const secret = 'k'.repeat(32);

  test('is an HMAC, never the address', async () => {
    const key = await ipRateLimitKey(secret, '2001:db8:1:2::1');
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).toBe(await hmacSha256Hex(secret, '2001:db8:1:2::/64'));
  });

  test('keeps IPv4 keys unchanged', async () => {
    expect(await ipRateLimitKey(secret, '203.0.113.42')).toBe(
      await hmacSha256Hex(secret, '203.0.113.42'),
    );
  });

  test('gives one key to a /64 and another to the next /64', async () => {
    const a = await ipRateLimitKey(secret, '2001:db8:1:2::1');
    const b = await ipRateLimitKey(secret, '2001:db8:1:2:ffff::9');
    const c = await ipRateLimitKey(secret, '2001:db8:1:3::1');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  test('counts an IPv4-mapped address as its IPv4 address', async () => {
    expect(await ipRateLimitKey(secret, '::ffff:203.0.113.42')).toBe(
      await ipRateLimitKey(secret, '203.0.113.42'),
    );
  });

  test('counts a missing address as unknown', async () => {
    expect(await ipRateLimitKey(secret, null)).toBe(
      await hmacSha256Hex(secret, 'unknown'),
    );
  });
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { canonicalURL, parseUSD, differenceCents, usd, displayURL } = require('../lib.js');

test('canonicalizes the same public profile to the same identity', () => {
  assert.equal(canonicalURL('x.com/SnowKing/'), 'https://x.com/snowking');
  assert.equal(canonicalURL('https://x.com/SnowKing/?utm_source=threads'), 'https://x.com/snowking');
  assert.equal(canonicalURL('https://www.x.com/SnowKing/#about'), 'https://x.com/snowking');
  assert.equal(canonicalURL('@snowking'), 'https://x.com/snowking');
  assert.equal(canonicalURL('https://twitter.com/SNOWKING/'), 'https://x.com/snowking');
  assert.equal(canonicalURL('https://www.instagram.com/SnowKing/'), 'https://instagram.com/snowking');
  assert.equal(canonicalURL('http://youtube.com/watch?v=abc&gclid=bad'), 'https://youtube.com/watch?v=abc');
  assert.equal(displayURL('https://youtube.com/watch?v=abc'), 'youtube.com/watch?v=abc');
});

test('rejects dangerous or invalid links', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,hi', 'https://example.com@evil.com',
    'http://localhost/a', 'http://192.168.1.1', 'http://[::1]', 'https://foo.local', 'https://brand.example', 'https://brand.invalid',
    'https://example.com:8080', 'https://a', 'https://good.com bad.com', 'https://good.com\n.evil.com']) {
    assert.equal(canonicalURL(value), null, value);
  }
});

test('supports valid amounts, including floating point edge cases', () => {
  assert.equal(parseUSD('1'), 100);
  assert.equal(parseUSD('19.99'), 1999);
  assert.equal(parseUSD('4.35'), 435);
  assert.equal(parseUSD('149.00'), 14900);
  assert.equal(parseUSD('0.99'), null);
  for (const value of ['-1', '2.345', '1e3', 'NaN', 'Infinity', '1.2.3', '  ', '999999999999999999999999999']) {
    assert.equal(parseUSD(value), null, value);
  }
  assert.equal(usd(1999), '$19.99');
});

test('subtracts only server-verified existing balances', () => {
  assert.equal(differenceCents(2500, 1000), 1500);
  assert.equal(differenceCents(2500, 2500), null);
  assert.equal(differenceCents(2500, 2450), null);
  assert.equal(differenceCents(14900, 0), 14900);
});

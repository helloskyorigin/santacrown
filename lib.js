/* SantaCrown's browser+Node shared, dependency-free input validation helpers.
   All payment calculations must be independently repeated on the SERVER from
   verified order records; these helpers are for preview/UI only. */
(function (root, factory) {
  const utils = factory();
  if (typeof module === 'object' && module.exports) module.exports = utils;
  if (root) root.SantaCrownUtils = utils;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const MIN_CENTS = 100;
  const TRACKERS = /^(utm_[a-z0-9_]*|fbclid|gclid|gclsrc|msclkid|igshid|igsh|mc_eid|mc_cid)$/i;

  function canonicalURL(input) {
    if (typeof input !== 'string') return null;
    let value = input.trim();
    if (!value || value.length > 240 || /[\u0000-\u001f\u007f\s]/.test(value)) return null;
    if (/^@[a-z0-9_]{1,15}$/i.test(value)) value = 'https://x.com/' + value.slice(1);
    else if (!/^https?:\/\//i.test(value)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
      value = 'https://' + value;
    }
    try {
      const u = new URL(value);
      if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.port) return null;
      const h = u.hostname.toLowerCase().replace(/\.$/, '');
      if (h.length > 253 || !h.includes('.') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost') || h.endsWith('.test')) return null;
      if (/^(localhost|\[.*\]|\d+(?:\.\d+){3})$/i.test(h)) return null; // avoid IP / internal destinations
      if (!h.split('.').every(x => x.length >= 1 && x.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(x))) return null;
      if (h.split('.').at(-1).length < 2) return null;
      u.protocol = 'https:';
      u.hostname = (h.replace(/^www\./, '') === 'twitter.com' ? 'x.com' : h.replace(/^www\./, ''));
      // Social handle path case is insensitive; normalize it to avoid split balances.
      if (/^(x\.com|instagram\.com|threads\.net)$/.test(u.hostname)) {
        const segments = u.pathname.split('/');
        if (segments[1]) segments[1] = segments[1].toLowerCase();
        u.pathname = segments.join('/');
      }
      u.hash = '';
      // Keep meaningful search params (e.g. YouTube?v=), remove only tracking.
      for (const key of [...u.searchParams.keys()]) if (TRACKERS.test(key)) u.searchParams.delete(key);
      u.searchParams.sort();
      u.pathname = u.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
      return u.toString();
    } catch { return null; }
  }
  function parseUSD(raw) {
    // Number inputs allow exponent syntax; do not accept it for money.
    const text = String(raw ?? '').trim();
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text)) return null;
    const [whole, cents = ''] = text.split('.');
    const dollars = Number(whole);
    if (!Number.isSafeInteger(dollars)) return null;
    const result = dollars * 100 + Number(cents.padEnd(2, '0'));
    if (!Number.isSafeInteger(result) || result < MIN_CENTS) return null;
    return result;
  }
  function usd(cents) {
    if (!Number.isSafeInteger(cents) || cents < 0) throw new RangeError('Invalid cents');
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  }
  function differenceCents(target, existing = 0) {
    if (!Number.isSafeInteger(target) || !Number.isSafeInteger(existing) || existing < 0 || target < MIN_CENTS) return null;
    const due = target - existing;
    return due >= MIN_CENTS ? due : null;
  }
  function displayURL(url) {
    try {
      const u = new URL(url);
      return u.hostname + (u.pathname === '/' ? '' : u.pathname) + u.search;
    } catch { return String(url); }
  }
  return Object.freeze({ canonicalURL, parseUSD, usd, differenceCents, displayURL, MIN_CENTS });
});

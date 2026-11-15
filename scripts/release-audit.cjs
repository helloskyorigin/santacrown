'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const expected=[
  'index.html','styles.css','app.js','lib.js','thanks.html','thanks.js',
  'terms.html','privacy.html','refunds.html','support.html','404.html','robots.txt','sitemap.xml',
  'api/checkout.js','api/webhook.js','api/leaderboard.js','api/listing.js','api/status.js','api/health.js',
  'db/001_santacrown.sql','db/002_visibility.sql','db/003_reconciliation.sql','assets/santa-cut.webp','assets/north-pole.webp'
];
for(const item of expected)assert(fs.existsSync(path.join(ROOT,item)),`Missing: ${item}`);
for(const policy of ['terms','privacy','refunds','support']) {
  const html=read(policy+'.html');
  assert(html.includes('hello.skyorigin@gmail.com'),`Missing contact in ${policy}`);
  assert(html.includes('pre-launch')||html.includes('Pre-launch'),`Missing preview disclaimer in ${policy}`);
  for(const cross of ['terms.html','privacy.html','refunds.html','support.html'])assert(html.includes(cross),`Broken legal navigation ${policy} → ${cross}`);
}
assert(read('index.html').includes('id="refresh-board"'));
assert(read('index.html').includes('id="checkout-consent"'));
assert(read('index.html').includes('completed purchases are generally non-refundable'));
assert(read('refunds.html').includes('No-Refund Policy'));
assert(read('support.html').includes('hello.skyorigin@gmail.com'));
assert(read('sitemap.xml').includes('support.html'));
assert(read('app.js').includes("cache:'no-store'"));
assert(read('api/checkout.js').includes('terms_accepted'));
assert(read('db/001_santacrown.sql').includes('sc_record_success'));
assert(read('db/002_visibility.sql').includes('sc_block_hidden_checkout'));
assert(read('db/003_reconciliation.sql').includes('sc_schema_meta'));
assert(read('api/webhook.js').includes('webhookConfigured'), 'Webhook must survive checkout pause');
assert(read('README.md').includes('No real')||read('README.md').includes('NOT taking payments'));
const cfg=require('../server/config');
assert(!cfg.canCharge({}),'Checkout must fail closed with no env vars');
const vercel=JSON.parse(read('vercel.json'));
assert(vercel.headers.some(x=>x.headers.some(h=>h.key==='Content-Security-Policy')),'No CSP');
assert(!read('index.html').includes('Snow King'),'Contains fake participants');
assert(!read('index.html').includes('frostelf.example'),'Contains fake links');
console.log('PASS source, policies, routes, checkout gates, moderation, fake-data and security audit');

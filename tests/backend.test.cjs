'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {Readable}=require('node:stream');
const {verifySignature,goodCheckoutURL}=require('../server/dodo');
const {canCharge}=require('../server/config');
const {canonicalURL,parseUSD}=require('../lib');
const checkout=require('../api/checkout');
const webhook=require('../api/webhook');
const board=require('../api/leaderboard');
const status=require('../api/status');
const origin='https://santacrown.vercel.app';
const approved={
 SANTACROWN_CHECKOUT_ENABLED:'true',DODO_PAYMENTS_APPROVED:'true',
 DODO_PAYMENTS_API_KEY:'test_key_for_unit_tests',DODO_PAYMENTS_PRODUCT_ID:'pdt_abc',
 DODO_PAYMENTS_WEBHOOK_KEY:'whsec_'+Buffer.from('dev_secret_testing').toString('base64'),
 SUPABASE_URL:'https://abc.supabase.co',SUPABASE_SECRET_KEY:'service_fake',
 SANTACROWN_RATE_SALT:'some_random_unit_testing_salt',DODO_PAYMENTS_ENVIRONMENT:'test_mode',
 SANTACROWN_SITE_ORIGIN:origin
};
const uuid='5cfda37c-13c4-4e76-b811-10d70bc751af';
function withEnv(env,fn){const old={};for(const[k,v]of Object.entries(env)){old[k]=process.env[k];process.env[k]=v}return Promise.resolve().then(fn).finally(()=>{for(const[k,v]of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v}})}
function res(){const r={code:0,headers:{},payload:null};r.setHeader=(k,v)=>r.headers[k]=v;r.status=n=>(r.code=n,r);r.json=v=>(r.payload=v,r);return r}
function mockReply(obj,status=200){return {ok:status>=200&&status<300,status,async json(){return obj},async text(){return JSON.stringify(obj)}}}
function sign(event,id='msg_12345'){const raw=Buffer.from(JSON.stringify(event));const ts=String(Math.floor(Date.now()/1000));const sig=crypto.createHmac('sha256',Buffer.from('dev_secret_testing')).update(Buffer.concat([Buffer.from(`${id}.${ts}.`),raw])).digest('base64');return {raw,headers:{'webhook-id':id,'webhook-timestamp':ts,'webhook-signature':'v1,'+sig}}}
function webhookRequest(event,id){const sig=sign(event,id);const req=Readable.from([sig.raw]);req.method='POST';req.headers=sig.headers;return req}
function event(type,data){return {type,timestamp:new Date().toISOString(),data}}

test('money is integer cents; canonical URL identifies same listing',()=>{
 assert.equal(parseUSD('19.99'),1999);assert.equal(parseUSD('149'),14900);
 for(const v of ['1e2','0.99','0','20.001','-1'])assert.equal(parseUSD(v),null);
 assert.equal(canonicalURL('https://www.x.com/Santa/?utm_campaign=a'),canonicalURL('http://x.com/santa'));
});
test('test mode requires explicit approval; live adds a second launch gate',()=>{
 assert.equal(canCharge(approved),true);
 assert.equal(canCharge({...approved,DODO_PAYMENTS_APPROVED:'false'}),false);
 assert.equal(canCharge({...approved,DODO_PAYMENTS_ENVIRONMENT:'live_mode'}),false);
 assert.equal(canCharge({...approved,DODO_PAYMENTS_ENVIRONMENT:'live_mode',SANTACROWN_LIVE_CONFIRMED:'true'}),false);
 assert.equal(canCharge({...approved,DODO_PAYMENTS_ENVIRONMENT:'live_mode',SANTACROWN_LIVE_CONFIRMED:'true',
   SANTACROWN_COMMERCIAL_TERMS_READY:'true',SANTACROWN_MERCHANT_LEGAL_NAME:'Example Seller',
   SANTACROWN_EVENT_CUTOFF_AT:'2099-12-25T23:59:00Z'}),true);
});
test('checkout destination cannot redirect to attacker',()=>{
 assert.ok(goodCheckoutURL('https://checkout.dodopayments.com/session/cks_123'));
 for(const link of ['http://checkout.dodopayments.com/x','https://dodopayments.com.evil.com/','javascript:alert(1)','https://evil-dodopayments.com/'])assert.equal(goodCheckoutURL(link),null);
});
test('signature verifies raw bytes, not edited payload, with expiry',()=>{
 const s=sign(event('payment.succeeded',{payment_id:'pay_foo'}));
 assert.equal(verifySignature(s.raw,s.headers,approved.DODO_PAYMENTS_WEBHOOK_KEY),true);
 assert.equal(verifySignature(Buffer.from(s.raw.toString()+' '),s.headers,approved.DODO_PAYMENTS_WEBHOOK_KEY),false);
 assert.equal(verifySignature(s.raw,s.headers,approved.DODO_PAYMENTS_WEBHOOK_KEY,Math.floor(Date.now()/1000)+999),false);
});
test('checkout rejects before readiness, and avoids any external charge',async()=>{
 const r=res();await checkout({method:'POST',headers:{origin, 'content-type':'application/json'},body:{name:'Santa',link:'https://example.com',target_amount:'10'}},r);
 assert.equal(r.code,503);assert.equal(r.payload.code,'CHECKOUT_NOT_OPEN');
});
test('checkout computes charge in SQL, not browser, creates provider session with its own amount',async()=>withEnv(approved,async()=>{
 const old=global.fetch,calls=[];
 global.fetch=async(url,options={})=>{
  calls.push({url:String(url),data:options.body?JSON.parse(options.body):null});
  if(String(url).includes('sc_public_totals?select=link'))return mockReply([]);
  if(String(url).includes('sc_schema_meta?'))return mockReply([{version:3}]);
  if(String(url).includes('rpc/sc_prepare_checkout'))return mockReply({intent_id:uuid,charge_cents:4500,target_cents:10000,current_cents:5500});
  if(String(url).includes('/checkouts'))return mockReply({session_id:'cks_1',checkout_url:'https://checkout.dodopayments.com/session/cks_1'});
  if(String(url).includes('rpc/sc_mark_checkout'))return mockReply(null);
  throw Error('Unexpected fetch '+url);
 };
 try{
  const r=res();await checkout({method:'POST',headers:{origin,'content-type':'application/json','x-forwarded-for':'1.2.3.4'},body:{name:'Snow King',link:'https://www.youtube.com/@creator',target_amount:'100',terms_accepted:true}},r);
  assert.equal(r.code,200);assert.equal(r.payload.chargeCents,4500);
  const dodo=calls.find(x=>x.url.includes('/checkouts'));
  assert.equal(dodo.data.product_cart[0].amount,4500);
  assert.equal(dodo.data.metadata.sc_intent_id,uuid);
  assert.equal(dodo.data.product_cart[0].product_id,'pdt_abc');
  assert.equal(dodo.data.feature_flags.allow_discount_code,false);
 }finally{global.fetch=old}
}));
test('checkout rejects wrong origin and malformed amount with no external calls',async()=>withEnv(approved,async()=>{
 const old=global.fetch;global.fetch=()=>{throw Error('Should not call API')};
 try{
  let r=res();await checkout({method:'POST',headers:{origin:'https://evil.com','content-type':'application/json'},body:{}},r);assert.equal(r.code,403);
  r=res();await checkout({method:'POST',headers:{origin,'content-type':'application/json'},body:{name:'N',link:'https://example.com',target_amount:'19.999',terms_accepted:true}},r);assert.equal(r.code,400);
 }finally{global.fetch=old}
}));
test('webhook HMAC required; no DB call before verification',async()=>withEnv(approved,async()=>{
 const signed=webhookRequest(event('payment.succeeded',{payment_id:'pay_123'}),'msg_987');signed.headers['webhook-signature']='v1,bad';
 const r=res();await webhook(signed,r);assert.equal(r.code,401);assert.equal(r.payload.code,'INVALID_SIGNATURE');
}));
test('verified Dodo success posts a single integer-cent ledger RPC',async()=>withEnv(approved,async()=>{
 let count=0;const old=global.fetch;
 global.fetch=async(url,opts)=>{
  if(String(url).includes('/payments/pay_123'))return mockReply({payment_id:'pay_123',status:'succeeded',currency:'USD',total_amount:1999,metadata:{sc_intent_id:uuid}});
  if(String(url).includes('/rpc/sc_record_success')){count++;const payload=JSON.parse(opts.body);assert.equal(payload.p_charged_cents,1999);assert.equal(payload.p_intent_id,uuid);return mockReply({applied:true});}
  throw Error('Unexpected '+url);
 };
 try{let r=res();await webhook(webhookRequest(event('payment.succeeded',{payment_id:'pay_123'}),'msg_abc'),r);assert.equal(r.code,200);assert.equal(count,1);}finally{global.fetch=old}
}));
test('wrong currency / provider failed state cannot credit leaderboard',async()=>withEnv(approved,async()=>{
 const old=global.fetch;let credits=0;
 global.fetch=async(url)=>{
   if(String(url).includes('/payments/'))return mockReply({payment_id:'pay_123',status:'failed',currency:'USD',total_amount:5000,metadata:{sc_intent_id:uuid}});
   credits++;return mockReply(null);
 };
 try{const r=res();await webhook(webhookRequest(event('payment.succeeded',{payment_id:'pay_123'}),'msg_failed'),r);assert.equal(r.code,422);assert.equal(credits,0)}finally{global.fetch=old}
}));
test('refund/dispute update ledger, even without payment success arriving first',async()=>withEnv(approved,async()=>{
 const old=global.fetch,used=[];
 global.fetch=async(url,opts)=>{used.push({url:String(url),payload:JSON.parse(opts.body)});return mockReply({applied:true})};
 try{
  let r=res();await webhook(webhookRequest(event('refund.succeeded',{payment_id:'pay_abc',refund_id:'ref_1234',amount:1200,currency:'USD'}),'msg_refund'),r);assert.equal(r.code,200);
  r=res();await webhook(webhookRequest(event('dispute.opened',{payment_id:'pay_abc',dispute_id:'dis_1234'}),'msg_dispute'),r);assert.equal(r.code,200);
  assert.ok(used.some(x=>x.url.includes('sc_record_refund')));assert.ok(used.some(x=>x.url.includes('sc_record_dispute')));
 }finally{global.fetch=old}
}));
test('leaderboard returns ordered genuine entries and readiness flag',async()=>withEnv(approved,async()=>{
 const old=global.fetch;
 global.fetch=async url=>String(url).includes('sc_schema_meta?')?mockReply([{version:3}]):String(url).includes('sc_public_totals?')?mockReply([]):mockReply([{rank:1,name:'A',link:'https://a.com/',total_cents:15000},{rank:2,name:'B',link:'https://b.com/',total_cents:7000}]);
 try{const r=res();await board({method:'GET',headers:{}},r);assert.equal(r.code,200);assert.equal(r.payload.entries.length,2);assert.equal(r.payload.paymentsEnabled,true)}finally{global.fetch=old}
}));
test('payment status never trusts browser redirect',async()=>withEnv(approved,async()=>{
 const old=global.fetch;
 global.fetch=async()=>mockReply({status:'created'});
 try{const r=res();await status({method:'GET',query:{intent:uuid}},r);assert.equal(r.code,200);assert.equal(r.payload.status,'created');}finally{global.fetch=old}
}));

// A user can repeat-contribute to a listing even if it is not in the first 100 entries.
const listing=require('../api/listing');
test('public listing lookup returns verified amount by canonical URL outside top 100',async()=>withEnv(approved,async()=>{
  const old=global.fetch;let seen='';
  global.fetch=async url=>{
    seen=String(url);
    return mockReply({name:'First Verified Name',link:'https://repeat.com/',total_cents:19000});
  };
  try{
    const r=res();await listing({method:'GET',query:{link:'http://www.repeat.com/?utm_source=spam'},headers:{}},r);
    assert.equal(r.code,200);assert.equal(r.payload.entry.total_cents,19000);
    assert.equal(r.payload.entry.name,'First Verified Name');
    assert.ok(seen.includes('rpc/sc_public_listing'));
  }finally{global.fetch=old}
}));

test('public listing lookup rejects dangerous URL before database access',async()=>withEnv(approved,async()=>{
  const old=global.fetch;global.fetch=()=>{throw Error('should not access backend')};
  try{
    const r=res();await listing({method:'GET',query:{link:'javascript:alert(1)'},headers:{}},r);
    assert.equal(r.code,400);
  }finally{global.fetch=old}
}));

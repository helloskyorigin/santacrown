'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {canCharge}=require('../server/config');
const checkout=require('../api/checkout');
const health=require('../api/health');
function response(){const r={code:0,body:null,headers:{}};r.setHeader=(k,v)=>r.headers[k]=v;r.status=n=>(r.code=n,r);r.json=obj=>(r.body=obj,r);return r;}
const env={SANTACROWN_CHECKOUT_ENABLED:'true',DODO_PAYMENTS_APPROVED:'true',DODO_PAYMENTS_API_KEY:'key',DODO_PAYMENTS_PRODUCT_ID:'pdt_test',DODO_PAYMENTS_WEBHOOK_KEY:'whsec_test',SUPABASE_URL:'https://x.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test',SANTACROWN_RATE_SALT:'salt',DODO_PAYMENTS_ENVIRONMENT:'live_mode',SANTACROWN_LIVE_CONFIRMED:'true',SANTACROWN_COMMERCIAL_TERMS_READY:'true',SANTACROWN_MERCHANT_LEGAL_NAME:'Approved merchant'};
function withEnv(vars,fn){const prev={};for(const [k,v] of Object.entries(vars)){prev[k]=process.env[k];if(v===undefined)delete process.env[k];else process.env[k]=v;}return Promise.resolve().then(fn).finally(()=>{for(const[k,v]of Object.entries(prev)){if(v===undefined)delete process.env[k];else process.env[k]=v;}})}
test('live cutoff must be a future timestamp with published commercial details',()=>{
 assert.equal(canCharge({...env,SANTACROWN_EVENT_CUTOFF_AT:'2025-12-25T00:00:00Z'},Date.parse('2026-11-14')),false);
 assert.equal(canCharge({...env,SANTACROWN_EVENT_CUTOFF_AT:'2026-12-25T23:59:00Z'},Date.parse('2026-11-14')),true);
 assert.equal(canCharge({...env,SANTACROWN_EVENT_CUTOFF_AT:'2026-12-25T23:59:00Z',SANTACROWN_COMMERCIAL_TERMS_READY:'false'},Date.parse('2026-11-14')),false);
 assert.equal(canCharge({...env,SANTACROWN_EVENT_CUTOFF_AT:'2026-12-25T23:59:00Z',SANTACROWN_MERCHANT_LEGAL_NAME:''},Date.parse('2026-11-14')),false);
});
test('consent required before any database or provider request',async()=>withEnv({DODO_PAYMENTS_ENVIRONMENT:'test_mode',...env,DODO_PAYMENTS_ENVIRONMENT:'test_mode'},async()=>{
 const original=global.fetch;global.fetch=()=>{throw Error('No remote call expected')};
 try{const res=response();await checkout({method:'POST',headers:{origin:'https://santacrown.vercel.app','content-type':'application/json'},body:{name:'Santa',link:'https://santacrown.com',target_amount:'20'}},res);assert.equal(res.code,400);assert.equal(res.body.code,'TERMS_REQUIRED');}finally{global.fetch=original;}
}));
test('checkout rejects missing mandatory migration before preparing a Dodo payment',async()=>withEnv({...env,DODO_PAYMENTS_ENVIRONMENT:'test_mode'},async()=>{
 const original=global.fetch;let calls=[];
 global.fetch=async url=>{calls.push(String(url));return {ok:false,status:404,text:async()=>JSON.stringify({message:'relation public.sc_public_totals does not exist'})}};
 try{const res=response();await checkout({method:'POST',headers:{origin:'https://santacrown.vercel.app','content-type':'application/json'},body:{name:'Santa',link:'https://santacrown.com',target_amount:'20',terms_accepted:true}},res);assert.equal(res.code,503);assert.equal(res.body.code,'DATABASE_NOT_READY');assert.equal(calls.length,1);assert.ok(calls[0].includes('sc_public_totals'));}finally{global.fetch=original;}
}));
test('public health reports only state, never secret or keys',async()=>{
 const old=process.env.SUPABASE_URL;const oldKey=process.env.SUPABASE_SECRET_KEY;
 delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SECRET_KEY;
 try{const r=response();await health({method:'GET',headers:{}},r);assert.equal(r.code,200);assert.equal(r.body.status,'awaiting_database');assert.equal(r.body.paymentsEnabled,false);assert.ok(!JSON.stringify(r.body).includes('whsec_'));}finally{if(old===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=old;if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;}
});

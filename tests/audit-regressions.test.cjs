'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {Readable}=require('node:stream');
const fs=require('node:fs');
const config=require('../server/config');
const {rawBody}=require('../server/http');
const webhook=require('../api/webhook');
const board=require('../api/leaderboard');
const {schemaReady}=require('../server/db');
const origin='https://santacrown.vercel.app';
const key='whsec_'+Buffer.from('audit_private_signing_key').toString('base64');
const env={
  DODO_PAYMENTS_ENVIRONMENT:'test_mode',DODO_PAYMENTS_API_KEY:'test_key',
  DODO_PAYMENTS_WEBHOOK_KEY:key,SUPABASE_URL:'https://auditsc.supabase.co',
  SUPABASE_SECRET_KEY:'sb_secret_fake'
};
function withEnv(mods,fn){const before={};for(const[k,v] of Object.entries(mods)){before[k]=process.env[k];if(v===null)delete process.env[k];else process.env[k]=v}
 return Promise.resolve().then(fn).finally(()=>{for(const[k,v]of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v}})}
function resp(){let status=0,payload;return{setHeader(){},status(n){status=n;return this},json(o){payload=o;return this},get code(){return status},get data(){return payload}}}
function mockData(o,status=200){return{ok:status<300,status,async text(){return JSON.stringify(o)}}}
function signedRequest(type,data,webhookId='msg_audit_v7'){
  const body=Buffer.from(JSON.stringify({type,data,timestamp:new Date().toISOString()}));
  const ts=String(Math.floor(Date.now()/1000));
  const hash=crypto.createHmac('sha256',Buffer.from('audit_private_signing_key')).update(Buffer.concat([Buffer.from(webhookId+'.'+ts+'.'),body])).digest('base64');
  const req=Readable.from([body]);req.method='POST';req.headers={'webhook-id':webhookId,'webhook-timestamp':ts,'webhook-signature':'v1,'+hash};return req;
}
test('webhook reconciliation remains configured even after checkout paused or event cutoff',()=>{
 const stopped={...env,SANTACROWN_CHECKOUT_ENABLED:'false',DODO_PAYMENTS_APPROVED:'false',SANTACROWN_LIVE_CONFIRMED:'false'};
 assert.equal(config.webhookConfigured(stopped),true);
 assert.equal(config.canCharge(stopped),false);
 assert.equal(config.webhookConfigured({...stopped,DODO_PAYMENTS_WEBHOOK_KEY:''}),false);
});
test('signed refund reconciles after operator pauses checkout',async()=>withEnv({...env,SANTACROWN_CHECKOUT_ENABLED:'false'},async()=>{
 const oldFetch=global.fetch;const saved=[];
 global.fetch=async(url,opt)=>{saved.push({url:String(url),body:JSON.parse(opt.body)});return mockData({applied:true})};
 try{const res=resp();await webhook(signedRequest('refund.succeeded',{refund_id:'ref_r7',payment_id:'pay_a7',amount:1000,currency:'USD'}),res);
 assert.equal(res.code,200);assert.equal(saved.length,1);assert.equal(saved[0].body.p_amount_cents,1000)}finally{global.fetch=oldFetch}
}));
test('accepted, expired disputes remove credit, cancelled dispute restores credit',async()=>withEnv(env,async()=>{
 const oldFetch=global.fetch;const states=[];
 global.fetch=async(url,opt)=>{states.push(JSON.parse(opt.body).p_state);return mockData({applied:true})};
 try{
  for(const [kind,state] of [['accepted','lost'],['expired','lost'],['cancelled','won'],['challenged','opened']]){
   const res=resp();await webhook(signedRequest('dispute.'+kind,{dispute_id:'dis_a7',payment_id:'pay_a7'},'msg_a7_'+kind),res);
   assert.equal(res.code,200);assert.equal(states.at(-1),state);
  }
 }finally{global.fetch=oldFetch}
}));
test('missing reconciliation migration prevents readiness, even when prior views exist',async()=>withEnv(env,async()=>{
 const oldFetch=global.fetch;
 global.fetch=async url=>String(url).includes('sc_schema_meta')?mockData([]):mockData([]);
 try{await assert.rejects(()=>schemaReady(),/RECONCILIATION_MIGRATION_MISSING/)}finally{global.fetch=oldFetch}
}));
test('raw signed bytes are accepted; parsed JSON is rejected, not reserialized',async()=>{
 assert.deepEqual(await rawBody(Readable.from([Buffer.from('abc')]),100),Buffer.from('abc'));
 await assert.rejects(()=>rawBody({body:{type:'payment.succeeded'}},100),/RAW_BODY_ALREADY_PARSED/);
 await assert.rejects(()=>rawBody(Readable.from([Buffer.alloc(101)]),100),/BODY_TOO_LARGE/);
});
test('API webhook explicitly opts out of automatic body parsing',()=>{
 assert.deepEqual(webhook.config,{api:{bodyParser:false}});
});
test('database reconciliation migration contains a secure service-only RPC',()=>{
 const sql=fs.readFileSync(require('node:path').join(__dirname,'../db/003_reconciliation.sql'),'utf8');
 for(const s of ['sc_public_listing','sc_get_intent_status','sc_schema_meta','REVOKE ALL','service_role'])assert.ok(sql.includes(s));
});

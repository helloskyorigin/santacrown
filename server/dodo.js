'use strict';
const crypto=require('node:crypto');
function providerHost(env=process.env){
  return env.DODO_PAYMENTS_ENVIRONMENT==='test_mode' ? 'https://test.dodopayments.com' : 'https://live.dodopayments.com';
}
async function request(method,path,payload){
  if(!process.env.DODO_PAYMENTS_API_KEY)throw Error('DODO_NOT_CONFIGURED');
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),method==='GET'?6000:10000);
  try{
    const r=await fetch(providerHost()+path,{
      method,headers:{Authorization:'Bearer '+process.env.DODO_PAYMENTS_API_KEY,'Content-Type':'application/json'},
      body:payload===undefined?undefined:JSON.stringify(payload),signal:controller.signal
    });
    const data=await r.json().catch(()=>null);
    if(!r.ok || !data) throw Error('DODO_REQUEST_FAILED');
    return data;
  }finally{clearTimeout(timer)}
}
function goodCheckoutURL(raw){
  try{const u=new URL(raw);return u.protocol==='https:' &&
    (u.hostname==='dodopayments.com'||u.hostname.endsWith('.dodopayments.com')) &&
    !u.username && !u.password ? u.toString():null;
  }catch{return null}
}
async function createSession({intentId,chargeCents,returnURL}){
  const product=process.env.DODO_PAYMENTS_PRODUCT_ID;
  if(!/^pdt_[A-Za-z0-9_-]+$/.test(product||''))throw Error('INVALID_PRODUCT_ID');
  const data=await request('POST','/checkouts',{
    product_cart:[{product_id:product,quantity:1,amount:chargeCents}],
    metadata:{sc_intent_id:intentId,sc_site:'santacrown'},
    return_url:returnURL,
    billing_currency:'USD',
    feature_flags:{allow_currency_selection:false,allow_discount_code:false}
  });
  const url=goodCheckoutURL(data.checkout_url);
  if(!url||typeof data.session_id!=='string') throw Error('INVALID_PROVIDER_CHECKOUT');
  return {checkout_url:url,session_id:data.session_id};
}
function verifySignature(raw,headers,secret=process.env.DODO_PAYMENTS_WEBHOOK_KEY,now=Math.floor(Date.now()/1000)){
  const id=headers['webhook-id'];const timestamp=headers['webhook-timestamp'];const signatures=headers['webhook-signature'];
  if(!Buffer.isBuffer(raw)||!secret||!secret.startsWith('whsec_')||
     typeof id!=='string'||typeof timestamp!=='string'||typeof signatures!=='string'||
     !/^\d{10,11}$/.test(timestamp) || !Number.isFinite(now) || Math.abs(now-Number(timestamp))>300) return false;
  const keyBody=secret.slice(6);
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(keyBody))return false;
  const key=Buffer.from(keyBody,'base64');
  if(!key.length)return false;
  const signed=Buffer.concat([Buffer.from(id+'.'+timestamp+'.','utf8'),raw]);
  const expected=crypto.createHmac('sha256',key).update(signed).digest();
  return signatures.split(/\s+/).some(s=>{
    if(!s.startsWith('v1,'))return false;
    const candidate=Buffer.from(s.slice(3),'base64');
    return candidate.length===expected.length && crypto.timingSafeEqual(candidate,expected);
  });
}
async function paymentDetails(id){
  if(!/^pay_[A-Za-z0-9_-]{3,120}$/.test(id))throw Error('INVALID_PAYMENT_ID');
  return request('GET','/payments/'+encodeURIComponent(id));
}
module.exports={request,createSession,paymentDetails,verifySignature,goodCheckoutURL};

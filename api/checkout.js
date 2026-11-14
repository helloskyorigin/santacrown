'use strict';
const crypto=require('node:crypto');
const {canonicalURL,parseUSD}=require('../lib');
const {allow,json,bodyJSON}=require('../server/http');
const {rpc}=require('../server/db');
const {createSession}=require('../server/dodo');
const {canCharge,siteOrigin}=require('../server/config');
module.exports=async function handler(req,res){
  if(!allow(req,res,'POST'))return;
  if(!canCharge())return json(res,503,{code:'CHECKOUT_NOT_OPEN',message:'SantaCrown is not accepting payments yet.'});
  let site;
  try{site=siteOrigin()}catch{return json(res,503,{code:'SERVER_NOT_CONFIGURED'})}
  const origin=req.headers.origin;
  if(origin!==site)return json(res,403,{code:'ORIGIN_NOT_ALLOWED'});
  let body;
  try{body=bodyJSON(req)}catch{return json(res,400,{code:'INVALID_BODY'})}
  const name=typeof body.name==='string'?body.name.trim():'';
  const link=canonicalURL(body.link);
  const target=parseUSD(body.target_amount);
  if(name.length<2||name.length>36||/[\x00-\x1f\x7f]/.test(name)||!link||target===null)
    return json(res,400,{code:'INVALID_ENTRY',message:'Enter a valid name, public link and USD target.'});
  const ip=String(req.headers['x-forwarded-for']||req.headers['x-real-ip']||'unknown').split(',')[0].trim().slice(0,100);
  const salt=process.env.SANTACROWN_RATE_SALT;
  const rateTag=crypto.createHash('sha256').update(salt+':'+ip).digest('hex');
  let intent;
  try{
    intent=await rpc('sc_prepare_checkout',{p_link:link,p_name:name,p_target_cents:target,p_rate_tag:rateTag});
  }catch(e){
    if(e.message.includes('TARGET_TOO_LOW'))return json(res,409,{code:'TARGET_CHANGED',message:'This listing has moved up. Refresh the board and choose a higher target.'});
    if(e.message.includes('PROCESSOR_AMOUNT_LIMIT'))return json(res,400,{code:'AMOUNT_TOO_HIGH',message:'This amount exceeds the processor transaction limit.'});
    if(e.message.includes('RATE_LIMIT'))return json(res,429,{code:'TOO_MANY_ATTEMPTS'});
    console.error('Create intent error',e.message);
    return json(res,503,{code:'DATABASE_UNAVAILABLE'});
  }
  try{
    const result=await createSession({intentId:intent.intent_id,chargeCents:intent.charge_cents,
      returnURL:site+'/thanks.html?intent='+encodeURIComponent(intent.intent_id)});
    // If provider webhook arrives before this call, the intent's verified payment is still creditable.
    try{await rpc('sc_mark_checkout',{p_intent_id:intent.intent_id,p_session_id:result.session_id})}
    catch(e){
      // Fail-closed: don't hand out a checkout link if persistence could not confirm it.
      console.error('Unable to persist checkout session:',e.message);
      return json(res,503,{code:'CHECKOUT_UNAVAILABLE'});
    }
    return json(res,200,{checkoutUrl:result.checkout_url,intentId:intent.intent_id,
      chargeCents:intent.charge_cents,targetCents:intent.target_cents,currentCents:intent.current_cents});
  }catch(e){
    await rpc('sc_mark_failed',{p_intent_id:intent.intent_id}).catch(()=>{});
    console.error('Dodo checkout creation failed:',e.message);
    return json(res,503,{code:'CHECKOUT_UNAVAILABLE',message:'Checkout could not be opened. You have not been charged.'});
  }
};

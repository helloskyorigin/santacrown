'use strict';
const {allow,json,rawBody}=require('../server/http');
const {rpc}=require('../server/db');
const {verifySignature,paymentDetails}=require('../server/dodo');
const {paymentsConfigured}=require('../server/config');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const ID=/^[A-Za-z0-9_-]{4,160}$/;
module.exports=async function handler(req,res){
  if(!allow(req,res,'POST'))return;
  if(!paymentsConfigured())return json(res,503,{code:'WEBHOOK_NOT_READY'});
  let raw;
  try{raw=await rawBody(req,250000)}catch{return json(res,413,{code:'PAYLOAD_TOO_LARGE'})}
  if(!verifySignature(raw,req.headers))return json(res,401,{code:'INVALID_SIGNATURE'});
  let event;
  try{event=JSON.parse(raw.toString('utf8'))}catch{return json(res,400,{code:'INVALID_EVENT'})}
  const eventId=req.headers['webhook-id'];
  if(!ID.test(eventId)||!event||typeof event.type!=='string'||!event.data||typeof event.data!=='object')
    return json(res,400,{code:'INVALID_EVENT'});
  const d=event.data;
  try{
    if(event.type==='payment.succeeded'){
      if(typeof d.payment_id!=='string'||!ID.test(d.payment_id))return json(res,400,{code:'INVALID_PAYMENT_ID'});
      // Dodo API read is an additional check beyond HMAC to reject incorrect event/amount metadata.
      const actual=await paymentDetails(d.payment_id);
      const id=actual.metadata?.sc_intent_id;
      if(!UUID.test(id||'')||actual.payment_id!==d.payment_id||actual.status!=='succeeded'
        ||actual.currency!=='USD'||!Number.isSafeInteger(actual.total_amount)||actual.total_amount<100){
        console.error('Provider payment did not satisfy verification');
        return json(res,422,{code:'PAYMENT_UNVERIFIED'});
      }
      await rpc('sc_record_success',{p_event_id:eventId,p_intent_id:id,
        p_payment_id:d.payment_id,p_charged_cents:actual.total_amount});
    }else if(event.type==='refund.succeeded'){
      if(!ID.test(d.refund_id||'')||!ID.test(d.payment_id||'')||!Number.isSafeInteger(d.amount)||d.amount<=0
         ||(d.currency&&d.currency!=='USD'))return json(res,422,{code:'INVALID_REFUND'});
      await rpc('sc_record_refund',{p_event_id:eventId,p_refund_id:d.refund_id,
        p_payment_id:d.payment_id,p_amount_cents:d.amount});
    }else if(['dispute.opened','dispute.won','dispute.lost'].includes(event.type)){
      if(!ID.test(d.dispute_id||'')||!ID.test(d.payment_id||''))return json(res,422,{code:'INVALID_DISPUTE'});
      const observed=event.timestamp;
      if(!observed||Number.isNaN(Date.parse(observed)))return json(res,422,{code:'INVALID_TIMESTAMP'});
      await rpc('sc_record_dispute',{p_event_id:eventId,p_dispute_id:d.dispute_id,
        p_payment_id:d.payment_id,p_state:event.type.slice('dispute.'.length),p_observed_at:observed});
    }
    // Unknown or non-ranking events are acknowledged without credit.
    return json(res,200,{ok:true});
  }catch(e){
    console.error('SantaCrown webhook persistence failed',e.message);
    // Do not acknowledge a failed transaction. Dodo retries and event IDs dedupe.
    return json(res,503,{code:'PROCESSING_FAILED'});
  }
};

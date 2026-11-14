'use strict';
const {allow,json}=require('../server/http');const {rpc}=require('../server/db');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
module.exports=async function handler(req,res){
  if(!allow(req,res,'GET'))return;
  const intent=(req.query||{}).intent;
  if(typeof intent!=='string'||!UUID.test(intent))return json(res,400,{code:'INVALID_INTENT'});
  try{
    const data=await rpc('sc_get_intent_status',{p_intent_id:intent});
    return json(res,200,data);
  }catch(e){console.error('Intent status read failed:',e.message);return json(res,503,{code:'DATABASE_UNAVAILABLE'})}
};

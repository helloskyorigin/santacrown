'use strict';
const {allow,json}=require('../server/http');
const {rpc}=require('../server/db');
const {canonicalURL}=require('../lib');
module.exports=async function handler(req,res){
  if(!allow(req,res,'GET'))return;
  const input=req.query?.link;
  if(typeof input!=='string'||input.length>240)return json(res,400,{code:'INVALID_LINK'});
  const url=canonicalURL(input);
  if(!url)return json(res,400,{code:'INVALID_LINK'});
  try{
    const found=await rpc('sc_public_listing',{p_link:url});
    if(!found||!Number.isSafeInteger(found.total_cents)||found.total_cents<100)return json(res,200,{entry:null});
    return json(res,200,{entry:{name:found.name,link:found.link,total_cents:found.total_cents}});
  }catch(e){
    console.error('Listing lookup unavailable:',e.message);
    return json(res,503,{code:'DATABASE_UNAVAILABLE'});
  }
};

'use strict';
const {allow,json}=require('../server/http');
const {leaderboard}=require('../server/db');
const {canCharge}=require('../server/config');
const {canonicalURL}=require('../lib');
module.exports=async function handler(req,res){
  if(!allow(req,res,'GET'))return;
  if(!process.env.SUPABASE_URL || !(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY)){
    return json(res,200,{status:'awaiting_database',entries:[],paymentsEnabled:false});
  }
  try{
    const rows=await leaderboard();
    const entries=rows.filter(x=>Number.isSafeInteger(x.total_cents)&&x.total_cents>=100&&
      typeof x.name==='string'&&typeof x.link==='string'&&canonicalURL(x.link)===x.link)
      .map(x=>({name:x.name,link:x.link,total_cents:x.total_cents,rank:x.rank}));
    return json(res,200,{status:'ready',entries,paymentsEnabled:canCharge()});
  }catch(e){
    console.error('SantaCrown leaderboard read failed:',e.message);
    return json(res,503,{status:'database_unavailable',entries:[],paymentsEnabled:false});
  }
};

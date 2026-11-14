'use strict';
const {allow,json}=require('../server/http');
const {leaderboard,schemaReady}=require('../server/db');
const {canCharge}=require('../server/config');
const {canonicalURL}=require('../lib');
module.exports=async function handler(req,res){
  if(!allow(req,res,'GET'))return;
  if(!process.env.SUPABASE_URL || !(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY)){
    return json(res,200,{status:'awaiting_database',entries:[],paymentsEnabled:false,updatedAt:new Date().toISOString()});
  }
  try{
    const [rows]=await Promise.all([leaderboard(),schemaReady()]);
    const entries=rows.filter(x=>Number.isSafeInteger(x.total_cents)&&x.total_cents>=100&&
      typeof x.name==='string'&&typeof x.link==='string'&&canonicalURL(x.link)===x.link)
      .map(x=>({name:x.name,link:x.link,total_cents:x.total_cents,rank:x.rank}));
    return json(res,200,{status:'ready',entries,paymentsEnabled:canCharge(),updatedAt:new Date().toISOString()});
  }catch(e){
    console.error('SantaCrown leaderboard read failed:',e.message);
    return json(res,503,{status:'database_unavailable',entries:[],paymentsEnabled:false});
  }
};

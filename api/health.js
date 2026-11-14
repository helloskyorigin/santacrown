'use strict';
const {allow,json}=require('../server/http');
const {leaderboard,schemaReady}=require('../server/db');
const {canCharge}=require('../server/config');
module.exports=async function handler(req,res){
  if(!allow(req,res,'GET'))return;
  const configured=Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY));
  if(!configured)return json(res,200,{service:'santacrown',status:'awaiting_database',paymentsEnabled:false});
  try{
    await Promise.all([leaderboard(),schemaReady()]);
    return json(res,200,{service:'santacrown',status:'ready',paymentsEnabled:canCharge()});
  }catch(e){
    console.error('SantaCrown database health check failed:',e.message);
    return json(res,503,{service:'santacrown',status:'unavailable',paymentsEnabled:false});
  }
};

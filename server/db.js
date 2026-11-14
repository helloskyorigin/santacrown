'use strict';
function settings(){
  const url=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error('DB_NOT_CONFIGURED');
  const u=new URL(url);
  if(u.protocol!=='https:' || !u.hostname.endsWith('.supabase.co')) throw Error('DB_URL_INVALID');
  return {url:u.origin,key};
}
async function rest(method,path,body){
  const {url,key}=settings();
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),6000);
  try{
    const r=await fetch(url+'/rest/v1/'+path,{
      method,headers:{apikey:key,...(key.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+key}),'Content-Type':'application/json',Accept:'application/json',Prefer:'return=representation'},
      body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal
    });
    const text=await r.text();
    let data;try{data=text?JSON.parse(text):null}catch{data=null}
    if(!r.ok){const error=new Error((data?.message||data?.code||'DATABASE_ERROR').slice(0,120));error.dbStatus=r.status;throw error}
    return data;
  }finally{clearTimeout(timer)}
}
function rpc(functionName,args){
  if(!/^sc_[a-z_]+$/.test(functionName)) throw Error('INVALID_RPC');
  return rest('POST','rpc/'+functionName,args);
}
async function leaderboard(){
  const rows=await rest('GET','santacrown_leaderboard?select=rank,name,link,total_cents&order=rank.asc&limit=100');
  if(!Array.isArray(rows))throw Error('INVALID_DB_RESPONSE');
  return rows;
}
async function schemaReady(){
  // Verifies that the mandatory moderation/public-listing migration was applied.
  const rows=await rest('GET','sc_public_totals?select=link&limit=1');
  if(!Array.isArray(rows))throw Error('REQUIRED_MIGRATION_MISSING');
  return true;
}
module.exports={rpc,leaderboard,settings,rest,schemaReady};

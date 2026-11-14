'use strict';
module.exports = async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
  const endpoint=process.env.SUPABASE_URL;
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!endpoint||!serviceKey){return res.status(200).json({entries:[],paymentsEnabled:false,status:'awaiting_setup'});}
  try{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),4500);
    let response;
    try{
      response=await fetch(endpoint.replace(/\/$/,'')+'/rest/v1/santacrown_leaderboard?select=name,link,total_cents&order=total_cents.desc,created_at.asc&limit=100',{
        headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey,Accept:'application/json'},signal:controller.signal
      });
    } finally {clearTimeout(timer);}
    if(!response.ok) throw new Error('Database unavailable');
    const rows=await response.json();
    if(!Array.isArray(rows)) throw new Error('Unexpected data');
    const entries=rows.filter(x=>typeof x.name==='string'&&typeof x.link==='string'&&Number.isSafeInteger(x.total_cents)&&x.total_cents>=100)
      .map(x=>({name:x.name.slice(0,36),link:x.link,total_cents:x.total_cents}));
    return res.status(200).json({entries,paymentsEnabled:false,status:'read_only'});
  }catch(e){return res.status(503).json({entries:[],paymentsEnabled:false,status:'temporarily_unavailable'});}
};
